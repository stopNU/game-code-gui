import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { readdir, readFile } from 'fs/promises';
import { basename, join } from 'path';
import { resolve } from 'path';
import { Header } from '../components/Header.js';
import { ChatLog } from '../components/ChatLog.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { Spinner } from '../components/Spinner.js';
import type { ChatEntry, DoneData } from '../types.js';
import {
  ROLE_TOKEN_BUDGET,
  planIteration,
  appendIterationTasks,
  BUG_PHASE,
  FEATURE_PHASE,
} from '@agent-harness/core';
import type { TaskPlan, TaskState, TaskResult, IterationType } from '@agent-harness/core';
import { runTask } from '../../commands/implement-task.js';
import type { BudgetExhaustedDecision } from '@agent-harness/core';
import { loadHarnessConfig } from '../../utils/config-loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IterateScreenProps {
  options: Record<string, unknown>;
  selectedModel?: string | undefined;
  onAgentStart: () => void;
  onAgentStop: () => void;
  onDone: (data: DoneData) => void;
}

type Phase =
  | 'project-input'
  | 'type-pick'
  | 'describe'
  | 'planning'
  | 'review'
  | 'running'
  | 'post-run'
  | 'error';

interface DiscoveredGame {
  path: string;
  title: string;
  taskCount: number;
  completeCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusChar(t: TaskState): string {
  switch (t.status) {
    case 'complete': return '✓';
    case 'failed':   return '✗';
    case 'blocked':  return '⊘';
    case 'in-progress': return '⟳';
    default: return '○';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IterateScreen({
  options,
  selectedModel,
  onAgentStart,
  onAgentStop,
  onDone,
}: IterateScreenProps) {
  const presetProject = options['project'] as string | undefined;
  const { stdout } = useStdout();
  void stdout; // used implicitly via terminal sizing

  // ── Project selection ──────────────────────────────────────────────────────
  const [projectInput, setProjectInput] = useState(presetProject ?? '');
  const [projectPath, setProjectPath] = useState(
    presetProject !== undefined ? resolve(process.cwd(), presetProject) : '',
  );
  const [manualEntry, setManualEntry] = useState(false);
  const [discoveredGames, setDiscoveredGames] = useState<DiscoveredGame[]>([]);
  const [scanning, setScanning] = useState(false);

  // ── Iteration inputs ───────────────────────────────────────────────────────
  const [iterationType, setIterationType] = useState<IterationType>('bug');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [evalContext, setEvalContext] = useState<string | null>(null);

  // ── Planning output ────────────────────────────────────────────────────────
  const [newTasks, setNewTasks] = useState<TaskState[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);

  // ── Execution state ────────────────────────────────────────────────────────
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [currentTokenBudget, setCurrentTokenBudget] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [currentResult, setCurrentResult] = useState<TaskResult | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Array<{ title: string; success: boolean }>>([]);

  // Budget exhaustion
  const [addedOnly, setAddedOnly] = useState(false);
  const [budgetPrompt, setBudgetPrompt] = useState<{ used: number; budget: number; filesWritten: number } | null>(null);
  const budgetResolverRef = useRef<((d: BudgetExhaustedDecision) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [phase, setPhase] = useState<Phase>(presetProject !== undefined ? 'type-pick' : 'project-input');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Scan CWD for game projects ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'project-input' || presetProject !== undefined) return;
    setScanning(true);
    const scan = async () => {
      try {
        const entries = await readdir(process.cwd(), { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        const found: DiscoveredGame[] = [];
        await Promise.all(
          dirs.map(async (name) => {
            const tasksPath = join(process.cwd(), name, 'harness', 'tasks.json');
            try {
              const raw = await readFile(tasksPath, 'utf8');
              const p = JSON.parse(raw) as {
                gameTitle?: string;
                phases?: Array<{ tasks: Array<{ status: string }> }>;
              };
              const allTasks = p.phases?.flatMap((ph) => ph.tasks) ?? [];
              found.push({
                path: join(process.cwd(), name),
                title: p.gameTitle ?? basename(name),
                taskCount: allTasks.length,
                completeCount: allTasks.filter((t) => t.status === 'complete').length,
              });
            } catch { /* not a game dir */ }
          }),
        );
        found.sort((a, b) => a.title.localeCompare(b.title));
        setDiscoveredGames(found);
      } catch { /* ignore */ }
      setScanning(false);
    };
    void scan();
  }, [phase, presetProject]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sniff eval context when project is chosen ──────────────────────────────
  useEffect(() => {
    if (!projectPath) return;
    const sniff = async () => {
      const baselinesDir = join(projectPath, 'harness', 'baselines');
      try {
        const files = await readdir(baselinesDir);
        const reports = files.filter((f) => f.startsWith('report-') && f.endsWith('.json')).sort();
        if (reports.length === 0) { setEvalContext(null); return; }
        const latest = reports[reports.length - 1]!;
        const raw = await readFile(join(baselinesDir, latest), 'utf8');
        const report = JSON.parse(raw) as {
          scores?: Array<{ passed?: boolean; layer?: string }>;
          summary?: { passRate?: number };
        };
        const failCount = (report.scores ?? []).filter((s) => !s.passed).length;
        if (failCount > 0) {
          setEvalContext(`${failCount} eval failure${failCount !== 1 ? 's' : ''} found in latest report`);
        } else {
          setEvalContext(null);
        }
      } catch {
        setEvalContext(null);
      }
    };
    void sniff();
  }, [projectPath]);

  // ── Planning effect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'planning') return;
    const run = async () => {
      try {
        loadHarnessConfig();
      } catch { /* ignore */ }
      try {
        const tasks = await planIteration(
          projectPath,
          iterationType,
          descriptionInput,
          ...(selectedModel !== undefined ? [{ model: selectedModel }] : [{}]),
        );
        setNewTasks(tasks);
        // Single-task: auto-confirm (skip review)
        if (tasks.length === 1) {
          const updatedPlan = await appendIterationTasks(projectPath, iterationType, tasks);
          setPlan(updatedPlan);
          setCurrentTaskIndex(0);
          setPhase('running');
        } else {
          setPhase('review');
        }
      } catch (err) {
        setPlanError(String(err));
        setPhase('error');
      }
    };
    void run();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Running effect ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running' || !plan) return;

    const task = newTasks[currentTaskIndex];
    if (!task) {
      // All tasks done
      const allSucceeded = completedTasks.every((t) => t.success);
      setRunSuccess(allSucceeded);
      setPhase('post-run');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      onAgentStart();
      setStreamingText('');
      setCurrentResult(null);
      setCurrentTokenBudget(ROLE_TOKEN_BUDGET[task.role] ?? 200_000);
      append({ kind: 'system', text: `Starting: ${task.title}`, timestamp: Date.now() });

      try {
        // Re-read task from disk so context is fully populated after appendIterationTasks
        const { readFile: rf } = await import('fs/promises');
        const freshPlan: TaskPlan = JSON.parse(
          await rf(join(projectPath, 'harness', 'tasks.json'), 'utf8'),
        ) as TaskPlan;
        const freshTask = freshPlan.phases.flatMap((p) => p.tasks).find((t) => t.id === task.id);
        if (!freshTask) {
          append({ kind: 'error', text: `Task "${task.id}" not found on disk`, timestamp: Date.now() });
          setPhase('error');
          return;
        }

        const result = await runTask(
          projectPath,
          freshTask,
          freshPlan,
          undefined,
          'advanced',
          ({ name, input }) => {
            append({ kind: 'tool-call', toolName: name, input, timestamp: Date.now() });
            setStreamingText((prev) => {
              if (prev.trim()) append({ kind: 'thinking', text: prev.trim(), timestamp: Date.now() });
              return '';
            });
          },
          (message) => {
            if (message.role !== 'assistant') return;
            const text =
              typeof message.content === 'string'
                ? message.content.trim()
                : (message.content as Array<{ type: string; text?: string }>)
                    .filter((b) => b.type === 'text' && b.text)
                    .map((b) => b.text!.trim())
                    .join('\n');
            if (text) setStreamingText('');
          },
          ({ input, output }) => setTokensUsed(input + output),
          controller.signal,
          (delta) => setStreamingText((prev) => prev + delta),
          selectedModel,
          undefined,
          (used, budget, filesWritten) =>
            new Promise<BudgetExhaustedDecision>((resolve) => {
              setBudgetPrompt({ used, budget, filesWritten });
              budgetResolverRef.current = resolve;
            }),
        );

        append({
          kind: 'done',
          success: result.success,
          summary: result.summary,
          filesModified: result.filesModified,
          timestamp: Date.now(),
        });
        setStreamingText('');
        setCurrentResult(result);
        setCompletedTasks((prev) => [...prev, { title: task.title, success: result.success }]);
        onAgentStop();

        // Advance to next task
        const nextIndex = currentTaskIndex + 1;
        if (nextIndex < newTasks.length) {
          setCurrentTaskIndex(nextIndex);
          setEntries([]);
          setTokensUsed(0);
          setCurrentResult(null);
          // Re-trigger the running effect by briefly resetting
          setPhase('running');
        } else {
          const allSucceeded = [...completedTasks, { title: task.title, success: result.success }].every(
            (t) => t.success,
          );
          setRunSuccess(allSucceeded);
          setPhase('post-run');
        }
      } catch (err) {
        setStreamingText('');
        setCurrentResult(null);
        append({ kind: 'error', text: String(err), timestamp: Date.now() });
        onAgentStop();
        setCompletedTasks((prev) => [...prev, { title: task.title, success: false }]);
        setRunSuccess(false);
        setPhase('post-run');
      }
    };

    void run();
    return () => { abortRef.current = null; };
  }, [phase, currentTaskIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const append = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  // ── Input handling ─────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (budgetPrompt !== null) {
      if (input === 'y' || input === 'Y' || key.return) {
        const extra = 100_000;
        setBudgetPrompt(null);
        setCurrentTokenBudget((prev) => prev + extra);
        budgetResolverRef.current?.({ action: 'continue', extraBudget: extra });
        budgetResolverRef.current = null;
      } else if (input === 'n' || input === 'N' || key.escape) {
        setBudgetPrompt(null);
        budgetResolverRef.current?.({ action: 'abort', extraBudget: 0 });
        budgetResolverRef.current = null;
      }
      return;
    }
    if (key.escape && phase === 'running' && abortRef.current) {
      abortRef.current.abort();
      append({ kind: 'system', text: 'Cancelling agent...', timestamp: Date.now() });
    }
    if (key.escape && phase === 'type-pick' && presetProject === undefined) {
      setPhase('project-input');
    }
    if (key.escape && phase === 'describe') {
      setPhase('type-pick');
    }
  });

  const phaseLabel = iterationType === 'bug' ? 'Bugs' : 'Features';
  const targetPhase = iterationType === 'bug' ? BUG_PHASE : FEATURE_PHASE;

  // ── Renders ────────────────────────────────────────────────────────────────

  if (phase === 'project-input') {
    if (scanning) {
      return (
        <Box flexDirection="column">
          <Header title=" game-harness  iterate" />
          <Box marginTop={1} paddingX={2}>
            <Text dimColor>Scanning for game projects...</Text>
          </Box>
        </Box>
      );
    }

    if (!manualEntry && discoveredGames.length > 0) {
      const listItems = [
        ...discoveredGames.map((g) => ({
          label: `${g.title}  (${g.completeCount}/${g.taskCount} tasks done)`,
          value: g.path,
        })),
        { label: '── Enter path manually ──', value: '__manual__' },
      ];
      return (
        <Box flexDirection="column">
          <Header title=" game-harness  iterate" hint="↑↓ select · Enter confirm" />
          <Box marginTop={1} flexDirection="column" paddingX={2}>
            <Text bold color="cyan">Select a game project to iterate on:</Text>
            <Text dimColor>Found in {process.cwd()}</Text>
          </Box>
          <Box marginTop={1} paddingX={2}>
            <SelectInput
              items={listItems}
              limit={12}
              onSelect={(item) => {
                if (item.value === '__manual__') {
                  setManualEntry(true);
                  return;
                }
                setProjectPath(item.value);
                setPhase('type-pick');
              }}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" hint="Enter to confirm" />
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text bold color="cyan">Path to game project:</Text>
          <Text dimColor>Enter the path to a directory that contains harness/tasks.json</Text>
          <Box marginTop={1}>
            <Text dimColor>Project path: </Text>
            <TextInput
              value={projectInput}
              onChange={setProjectInput}
              placeholder="./my-game or absolute path..."
              onSubmit={(val) => {
                if (!val.trim()) return;
                setProjectPath(resolve(process.cwd(), val.trim()));
                setPhase('type-pick');
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === 'type-pick') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" hint="↑↓ navigate · Enter confirm · Esc back" />
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text bold color="cyan">What would you like to do?</Text>
          {projectPath && <Text dimColor>{projectPath}</Text>}
        </Box>
        <Box marginTop={1} paddingX={2}>
          <SelectInput
            items={[
              { label: 'Fix a Bug', value: 'bug' },
              { label: 'Add a Feature', value: 'feature' },
            ]}
            onSelect={(item) => {
              setIterationType(item.value as IterationType);
              setPhase('describe');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'describe') {
    const isFeature = iterationType === 'feature';
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" hint="Enter to plan · Esc back" />
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text bold color="cyan">
            {isFeature ? 'Describe the feature:' : 'Describe the bug:'}
          </Text>
          <Text dimColor>
            {isFeature
              ? 'What should the game do that it currently cannot?'
              : 'What is broken and when does it happen?'}
          </Text>
          {iterationType === 'bug' && evalContext && (
            <Box marginTop={1}>
              <Text color="yellow">⚑ {evalContext}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <TextInput
              value={descriptionInput}
              onChange={setDescriptionInput}
              placeholder={
                isFeature
                  ? 'e.g. Add a double-jump ability when Space is pressed in the air'
                  : 'e.g. Enemies don\'t take damage from Strike card — health stays at 12'
              }
              onSubmit={(val) => {
                if (!val.trim()) return;
                setDescriptionInput(val.trim());
                setPhase('planning');
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === 'planning') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" />
        <Spinner label={`Planning ${iterationType === 'bug' ? 'bug fix' : 'feature'}...`} />
        <Box marginTop={1} paddingX={2}>
          <Text dimColor>{descriptionInput}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" />
        <Box paddingX={2} marginTop={1} flexDirection="column">
          <Text color="red">✗ {planError ?? errorMsg ?? 'Unknown error'}</Text>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: '← Try again', value: 'retry' },
                { label: 'Exit', value: 'exit' },
              ]}
              onSelect={(item) => {
                if (item.value === 'retry') {
                  setPlanError(null);
                  setErrorMsg(null);
                  setPhase('describe');
                } else {
                  onDone({ success: false, summary: planError ?? errorMsg ?? 'Error', filesModified: [] });
                }
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === 'review') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  iterate" hint="↑↓ navigate · Enter confirm · Esc re-describe" />
        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text bold color="cyan">
            {newTasks.length} task{newTasks.length !== 1 ? 's' : ''} planned for{' '}
            <Text color={iterationType === 'bug' ? 'red' : 'green'}>{phaseLabel}</Text> phase:
          </Text>
          <Box marginTop={1} flexDirection="column">
            {newTasks.map((t, i) => (
              <Box key={t.id} marginTop={i === 0 ? 0 : 1} flexDirection="column">
                <Text bold>{i + 1}. {t.title}</Text>
                <Text dimColor>   {t.description}</Text>
                <Text dimColor>   role: {t.role}  ·  phase: {targetPhase} ({phaseLabel})</Text>
              </Box>
            ))}
          </Box>
          <Box marginTop={2}>
            <SelectInput
              items={[
                { label: '▶  Run these tasks', value: 'confirm' },
                { label: '＋  Add to implementation list (run later)', value: 'add-only' },
                { label: '← Re-describe', value: 'back' },
              ]}
              onSelect={async (item) => {
                if (item.value === 'back') {
                  setPhase('describe');
                  return;
                }
                // Both confirm and add-only append the tasks to disk
                try {
                  const updatedPlan = await appendIterationTasks(projectPath, iterationType, newTasks);
                  setPlan(updatedPlan);
                  if (item.value === 'add-only') {
                    // Don't run — go to post-run with an "added" summary
                    setAddedOnly(true);
                    setCompletedTasks([]);
                    setRunSuccess(true);
                    setCurrentResult(null);
                    setPhase('post-run');
                    return;
                  }
                  setAddedOnly(false);
                  setCurrentTaskIndex(0);
                  setPhase('running');
                } catch (err) {
                  setErrorMsg(String(err));
                  setPhase('error');
                }
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  const currentTask = newTasks[currentTaskIndex];

  if (phase === 'running') {
    return (
      <Box flexDirection="column" height="100%">
        <Header
          title=" game-harness  iterate"
          subtitle={`${phaseLabel} · task ${currentTaskIndex + 1}/${newTasks.length}`}
          hint="Esc to cancel"
        />
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" flexGrow={1} marginRight={2}>
            <Box marginBottom={1}>
              <ProgressBar
                used={tokensUsed}
                total={currentTokenBudget > 0 ? currentTokenBudget : (currentTask ? ROLE_TOKEN_BUDGET[currentTask.role] ?? 200_000 : 200_000)}
                label="tokens"
                width={16}
              />
            </Box>
            {budgetPrompt !== null ? (
              <Box
                borderStyle="round"
                {...(budgetPrompt.filesWritten === 0 ? { borderColor: 'red' as const } : { borderColor: 'yellow' as const })}
                paddingX={2}
                paddingY={1}
                flexDirection="column"
              >
                <Text bold {...(budgetPrompt.filesWritten === 0 ? { color: 'red' as const } : { color: 'yellow' as const })}>
                  Token budget reached
                </Text>
                <Text dimColor>
                  {budgetPrompt.used.toLocaleString()} / {budgetPrompt.budget.toLocaleString()} tokens used
                  {'  ·  '}{budgetPrompt.filesWritten} file{budgetPrompt.filesWritten !== 1 ? 's' : ''} written
                </Text>
                {budgetPrompt.filesWritten === 0 && (
                  <Text color="red">No files written yet — extending will likely loop. Re-run instead.</Text>
                )}
                <Box marginTop={1}>
                  <Text>{budgetPrompt.filesWritten === 0 ? 'Extend anyway (+100k)? ' : 'Continue with +100k more tokens? '}</Text>
                  <Text bold color="cyan">[Y] Yes  </Text>
                  <Text bold color="red">[N] No, abort</Text>
                </Box>
              </Box>
            ) : (
              <ChatLog
                entries={entries}
                isRunning={true}
                spinnerLabel={currentTask ? `Running: ${currentTask.title}...` : 'Agent running...'}
                streamingText={streamingText}
              />
            )}
          </Box>

          {/* Right panel: task list */}
          <Box width={28} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            <Text bold dimColor>{phaseLabel}</Text>
            <Box marginTop={1} flexDirection="column">
              {newTasks.map((t, i) => {
                const done = completedTasks.find((c) => c.title === t.title);
                const isActive = i === currentTaskIndex && !done;
                const icon = done ? (done.success ? '✓' : '✗') : isActive ? '⟳' : '○';
                const color =
                  done
                    ? done.success ? ('green' as const) : ('red' as const)
                    : isActive
                    ? ('yellow' as const)
                    : undefined;
                return (
                  <Box key={t.id}>
                    <Text {...(color !== undefined ? { color } : {})}>{icon} </Text>
                    <Text bold={isActive} dimColor={!isActive && !done}>
                      {t.title.slice(0, 22)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── post-run ───────────────────────────────────────────────────────────────
  const allSucceeded = addedOnly || (completedTasks.length > 0 && completedTasks.every((t) => t.success));
  const failedTasks = completedTasks.filter((t) => !t.success);

  return (
    <Box flexDirection="column">
      <Header title=" game-harness  iterate" />
      <Box
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        {...(allSucceeded ? { borderColor: 'green' as const } : { borderColor: 'red' as const })}
        marginX={2}
        marginTop={1}
        flexDirection="column"
      >
        {addedOnly ? (
          <>
            <Text bold color="green">
              ✓ {newTasks.length} task{newTasks.length !== 1 ? 's' : ''} added to {phaseLabel} phase
            </Text>
            <Text dimColor>Run them any time via Implement Task → {phaseLabel}</Text>
          </>
        ) : (
          <>
            <Text bold {...(allSucceeded ? { color: 'green' as const } : { color: 'red' as const })}>
              {allSucceeded
                ? `✓ ${completedTasks.length} task${completedTasks.length !== 1 ? 's' : ''} complete`
                : `✗ ${failedTasks.length} task${failedTasks.length !== 1 ? 's' : ''} failed`}
            </Text>
            {currentResult && (
              <Text dimColor>
                in {currentResult.tokensUsed.input.toLocaleString()}, out{' '}
                {currentResult.tokensUsed.output.toLocaleString()}, cached{' '}
                {currentResult.tokensUsed.cached.toLocaleString()}
              </Text>
            )}
            {failedTasks.length > 0 && (
              <Box marginTop={1} flexDirection="column">
                {failedTasks.map((t) => (
                  <Text key={t.title} color="red">  ✗ {t.title}</Text>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
      <Box marginTop={1} paddingX={2} flexDirection="column">
        <Text bold>What next?</Text>
        <SelectInput
          items={[
            { label: `+ Plan another ${iterationType === 'bug' ? 'fix' : 'feature'}`, value: 'again' },
            { label: '⇄ Switch type', value: 'switch' },
            { label: 'Exit', value: 'exit' },
          ]}
          onSelect={(item) => {
            if (item.value === 'again') {
              setDescriptionInput('');
              setNewTasks([]);
              setCompletedTasks([]);
              setEntries([]);
              setTokensUsed(0);
              setCurrentResult(null);
              setCurrentTaskIndex(0);
              setPlanError(null);
              setAddedOnly(false);
              setPhase('describe');
            } else if (item.value === 'switch') {
              setIterationType((prev) => (prev === 'bug' ? 'feature' : 'bug'));
              setDescriptionInput('');
              setNewTasks([]);
              setCompletedTasks([]);
              setEntries([]);
              setTokensUsed(0);
              setCurrentResult(null);
              setCurrentTaskIndex(0);
              setPlanError(null);
              setAddedOnly(false);
              setPhase('describe');
            } else {
              onDone({
                success: allSucceeded,
                summary: allSucceeded
                  ? `${completedTasks.length} iteration task${completedTasks.length !== 1 ? 's' : ''} completed.`
                  : `${failedTasks.length} task${failedTasks.length !== 1 ? 's' : ''} failed.`,
                filesModified: [],
                ...(projectPath !== '' ? { outputPath: projectPath } : {}),
              });
            }
          }}
        />
      </Box>
    </Box>
  );
}
