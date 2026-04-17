import { useState, useCallback, useRef } from 'react';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import {
  preprocessBrief,
  createAdvancedPlan,
  ClaudeClient,
  MemoryStore,
} from '@agent-harness/core';
import type { TaskPlan, TaskState, MemoryEntry, PreprocessedBrief } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { installDeps } from '@agent-harness/tools';
import { runTask } from '../../commands/implement-task.js';
import type { ChatEntry } from '../types.js';
import { resolveProjectOutputPath } from '../../utils/project-name.js';

export type NewGamePhase =
  | 'brief'       // user typing their brief
  | 'clarifying'  // follow-up questions
  | 'planning'    // AI is planning
  | 'scaffolding' // creating files
  | 'installing'  // npm install
  | 'implementing'// running tasks
  | 'done'
  | 'error';

export interface ClarifyAnswers {
  genre: string;
  theme: string;
  mechanic: string;
}

export interface UseNewGameResult {
  phase: NewGamePhase;
  entries: ChatEntry[];
  plan: TaskPlan | null;
  activeTaskId: string | null;
  completedIds: Set<string>;
  outputPath: string | null;
  error: string | null;
  streamingText: string;
  submitBrief: (brief: string, gameName?: string) => void;
  submitClarify: (answers: ClarifyAnswers) => void;
  skipClarify: () => void;
  abort: () => void;
}

export function useNewGame(opts: Record<string, unknown>, selectedModel?: string): UseNewGameResult {
  const [phase, setPhase] = useState<NewGamePhase>('brief');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBrief, setPendingBrief] = useState<string>('');
  const [pendingGameName, setPendingGameName] = useState<string>((opts['name'] as string | undefined)?.trim() ?? '');
  const [streamingText, setStreamingText] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const append = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runPipeline = useCallback(
    async (brief: string, gameName?: string) => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // 1. Plan
        setPhase('planning');
        append({ kind: 'system', text: 'Creating game plan...', timestamp: Date.now() });

        let gamePlan: TaskPlan;
        let preprocessedBrief: PreprocessedBrief | undefined;

        {
          const client = new ClaudeClient();

          append({ kind: 'thinking', text: 'Analyzing design document...', timestamp: Date.now() });
          const preprocessed = await preprocessBrief(brief, client);
          preprocessedBrief = preprocessed;

          const parts: string[] = [];
          if (preprocessed.extractedSubsystems.length > 0)
            parts.push(`${preprocessed.extractedSubsystems.length} subsystems`);
          if (preprocessed.extractedSchemas.length > 0)
            parts.push(`${preprocessed.extractedSchemas.length} schemas`);
          if (preprocessed.stateMachines.length > 0)
            parts.push(`${preprocessed.stateMachines.length} state machines`);
          if (preprocessed.mvpFeatures.length > 0)
            parts.push(`${preprocessed.mvpFeatures.length} MVP features`);
          append({
            kind: 'thinking',
            text: `Extracted: ${parts.join(', ') || 'no structured data'}`,
            timestamp: Date.now(),
          });

          append({ kind: 'thinking', text: 'Generating implementation plan...', timestamp: Date.now() });
          gamePlan = await createAdvancedPlan(preprocessed, client);
        }

        setPlan(gamePlan);
        append({
          kind: 'thinking',
          text: `Plan ready: "${gamePlan.gameTitle}" (${gamePlan.genre}) -- ${gamePlan.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks`,
          timestamp: Date.now(),
        });

        // 2. Scaffold
        setPhase('scaffolding');
        append({ kind: 'system', text: 'Scaffolding project...', timestamp: Date.now() });

        const out = resolveProjectOutputPath(opts['output'] as string | undefined, gameName ?? 'game');
        setOutputPath(out);

        await scaffoldGame({
          outputPath: out,
          plan: gamePlan,
          ...(preprocessedBrief !== undefined ? { preprocessedBrief } : {}),
        });
        append({ kind: 'tool-result', toolName: 'scaffold', success: true, preview: out, timestamp: Date.now() });

        // 3. Install
        setPhase('installing');
        append({ kind: 'system', text: 'Installing dependencies...', timestamp: Date.now() });
        try {
          await installDeps(out);
          append({ kind: 'tool-result', toolName: 'npm install', success: true, preview: 'done', timestamp: Date.now() });
        } catch (err) {
          append({ kind: 'tool-result', toolName: 'npm install', success: false, preview: String(err).slice(0, 80), timestamp: Date.now() });
        }

        if (opts['planOnly'] === true) {
          setPhase('done');
          return;
        }

        // 4. Implement tasks
        setPhase('implementing');
        const tasksPath = join(out, 'harness', 'tasks.json');
        const coreTasks = gamePlan.phases.flatMap((p) => p.tasks);

        const done = new Set<string>();
        const summaries: string[] = [];

        for (const task of coreTasks) {
          if (controller.signal.aborted) {
            append({ kind: 'system', text: 'Cancelled by user.', timestamp: Date.now() });
            break;
          }

          const blockedBy = task.dependencies.find(
            (dep) => !done.has(dep) && coreTasks.some((t) => t.id === dep),
          );
          if (blockedBy) {
            append({ kind: 'system', text: `Skipping "${task.title}" -- dep "${blockedBy}" not complete`, timestamp: Date.now() });
            continue;
          }

          setActiveTaskId(task.id);
          append({ kind: 'system', text: `Task: ${task.title}`, timestamp: Date.now() });

          const freshPlan: TaskPlan = JSON.parse(await readFile(tasksPath, 'utf8')) as TaskPlan;
          const freshTask = freshPlan.phases.flatMap((p) => p.tasks).find((t) => t.id === task.id);
          if (!freshTask) continue;

          freshTask.context.previousTaskSummaries = [...summaries];

          let memory: MemoryEntry[] = [];
          try {
            const memFile = JSON.parse(await readFile(join(out, 'harness', 'memory.json'), 'utf8')) as Parameters<typeof MemoryStore.fromFile>[0];
            memory = MemoryStore.fromFile(memFile).byScope('project');
          } catch { /* no memory yet */ }
          void memory;

          try {
            setStreamingText('');
            const result = await runTask(
              out,
              freshTask,
              freshPlan,
              undefined,
              'advanced',
              ({ name, input }: { name: string; input: Record<string, unknown> }) => {
                append({ kind: 'tool-call', toolName: name, input, timestamp: Date.now() });
                setStreamingText((prev) => {
                  if (prev.trim()) {
                    append({ kind: 'thinking', text: prev.trim(), timestamp: Date.now() });
                  }
                  return '';
                });
              },
              (message) => {
                if (message.role !== 'assistant') return;
                const text = typeof message.content === 'string'
                  ? message.content.trim()
                  : (message.content as Array<{ type: string; text?: string }>)
                      .filter((b) => b.type === 'text' && b.text)
                      .map((b) => b.text!.trim())
                      .join('\n');
                if (text) setStreamingText('');
              },
              undefined,
              controller.signal,
              (delta) => {
                setStreamingText((prev) => prev + delta);
              },
              selectedModel,
            );

            setStreamingText('');

            if (result.success) {
              done.add(task.id);
              summaries.push(`[${task.id}] ${task.title}: ${result.summary}`);
              append({ kind: 'tool-result', toolName: task.title, success: true, preview: result.summary.slice(0, 80), timestamp: Date.now() });
            } else {
              append({ kind: 'tool-result', toolName: task.title, success: false, preview: result.summary.slice(0, 80), timestamp: Date.now() });
            }
          } catch (err) {
            setStreamingText('');
            append({ kind: 'error', text: `Task "${task.title}" threw: ${String(err)}`, timestamp: Date.now() });
          }

          setCompletedIds(new Set(done));
        }

        setActiveTaskId(null);
        append({
          kind: 'done',
          success: true,
          summary: `${gamePlan.gameTitle} -- ${done.size}/${coreTasks.length} tasks completed.\n\ncd ${out}\npnpm run dev`,
          filesModified: [],
          timestamp: Date.now(),
        });
        setPhase('done');
      } catch (err) {
        setStreamingText('');
        setError(String(err));
        append({ kind: 'error', text: String(err), timestamp: Date.now() });
        setPhase('error');
      }
    },
    [opts, append],
  );

  const submitBrief = useCallback(
    (brief: string, gameName?: string) => {
      const fromFlag = Boolean(opts['brief'] ?? opts['briefFile']);
      const isAdvanced = opts['advanced'] === true;
      const normalizedName = gameName?.trim() ?? (opts['name'] as string | undefined)?.trim() ?? '';
      setPendingGameName(normalizedName);
      // Skip clarifying questions if advanced, brief was pre-supplied, or brief is already detailed
      if (isAdvanced || fromFlag || brief.length >= 120) {
        void runPipeline(brief, normalizedName);
      } else {
        setPendingBrief(brief);
        setPhase('clarifying');
        append({ kind: 'system', text: 'A few quick questions to sharpen the plan:', timestamp: Date.now() });
      }
    },
    [opts, append, runPipeline],
  );

  const submitClarify = useCallback(
    (answers: ClarifyAnswers) => {
      const extras = [
        answers.genre ? `Genre: ${answers.genre}` : '',
        answers.theme ? `Theme/setting: ${answers.theme}` : '',
        answers.mechanic ? `Key mechanic: ${answers.mechanic}` : '',
      ].filter(Boolean);

      const enriched = extras.length > 0
        ? `${pendingBrief}\n\n${extras.join('\n')}`
        : pendingBrief;

      void runPipeline(enriched, pendingGameName);
    },
    [pendingBrief, pendingGameName, runPipeline],
  );

  const skipClarify = useCallback(() => {
    void runPipeline(pendingBrief, pendingGameName);
  }, [pendingBrief, pendingGameName, runPipeline]);

  return {
    phase,
    entries,
    plan,
    activeTaskId,
    completedIds,
    outputPath,
    error,
    streamingText,
    submitBrief,
    submitClarify,
    skipClarify,
    abort,
  };
}
