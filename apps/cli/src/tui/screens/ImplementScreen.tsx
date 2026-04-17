import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { resolve } from 'path';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { Header } from '../components/Header.js';
import { ChatLog } from '../components/ChatLog.js';
import { TaskList } from '../components/TaskList.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { CostEstimate } from '../components/CostEstimate.js';
import { Spinner } from '../components/Spinner.js';
import type { DoneData, ChatEntry } from '../types.js';
import { ROLE_TOKEN_BUDGET, type TaskPlan, type TaskState, type TaskResult, planIteration, appendIterationTasks } from '@agent-harness/core';
import type { IterationType } from '@agent-harness/core';
import { runTask, runTasksParallel } from '../../commands/implement-task.js';
import type { BudgetExhaustedDecision } from '@agent-harness/core';
import { loadHarnessConfig } from '../../utils/config-loader.js';

interface ImplementScreenProps {
  options: Record<string, unknown>;
  selectedModel?: string | undefined;
  onAgentStart: () => void;
  onAgentStop: () => void;
  onDone: (data: DoneData) => void;
  onStartGame?: (projectPath: string) => void;
}

type Phase =
  | 'project-input'
  | 'loading'
  | 'picking'
  | 'confirm-cost'
  | 'running'
  | 'running-parallel'
  | 'post-run'
  | 'error'
  // Iteration mini-flow (inline within the picker)
  | 'iteration-type'
  | 'iteration-describe'
  | 'iteration-planning';

interface ParallelTaskStatus {
  task: TaskState;
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  lastMsg: string;
  result?: TaskResult;
}

interface TaskItem {
  label: string;
  value: string;
}

function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return arr[i];
  }
  return undefined;
}

const PICKER_WINDOW = 22;

/**
 * Task picker with built-in filter (press / to activate) and circular wrapping.
 */
function TaskPickerList({
  items,
  onSelect,
  filterText,
  onFilterChange,
}: {
  items: TaskItem[];
  onSelect: (item: TaskItem) => void;
  filterText: string;
  onFilterChange: (text: string) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [filterActive, setFilterActive] = useState(false);

  // Keep cursor in bounds when items list changes (e.g. filter narrows list)
  const clampedCursor = Math.min(cursor, Math.max(0, items.length - 1));

  useInput((input, key) => {
    if (filterActive) {
      if (key.escape) {
        onFilterChange('');
        setFilterActive(false);
      } else if (key.return) {
        setFilterActive(false);
      } else if (key.backspace || key.delete) {
        onFilterChange(filterText.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        onFilterChange(filterText + input);
      }
      return;
    }

    if (key.upArrow) {
      setCursor((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
    } else if (key.return && items[clampedCursor]) {
      onSelect(items[clampedCursor]!);
    } else if (input === '/') {
      setFilterActive(true);
    }
  });

  const start = Math.max(0, Math.min(clampedCursor - Math.floor(PICKER_WINDOW / 2), items.length - PICKER_WINDOW));
  const end = Math.min(items.length, start + PICKER_WINDOW);
  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {/* Filter bar */}
      <Box marginBottom={1}>
        {filterActive ? (
          <>
            <Text color="cyan">/ </Text>
            <Text>{filterText}</Text>
            <Text color="cyan">█</Text>
            <Text dimColor>  Esc to clear · Enter to confirm</Text>
          </>
        ) : filterText ? (
          <>
            <Text dimColor>filter: </Text>
            <Text color="cyan">{filterText}</Text>
            <Text dimColor>  / to edit · Esc clears</Text>
          </>
        ) : (
          <Text dimColor>/ to filter</Text>
        )}
      </Box>

      {start > 0 && <Text dimColor>  ↑ {start} more</Text>}
      {visible.map((item, i) => {
        const idx = start + i;
        const isSelected = idx === clampedCursor;
        const isHeader = item.value.startsWith('__phase_') || item.value.startsWith('__collapsed_');
        const isBack = item.value === '__back__';
        const isRunPhase = item.value.startsWith('__run_phase_');
        const isIterationEntry = item.value === '__plan_iteration__';
        if (isIterationEntry) {
          return (
            <Box key={item.value} marginBottom={1}>
              <Text {...(isSelected ? { color: 'magenta' as const } : { dimColor: true })}>
                {isSelected ? '❯ ' : '  '}{item.label}
              </Text>
            </Box>
          );
        }
        if (isHeader) {
          return (
            <Box key={item.value}>
              <Text bold dimColor>{item.label}</Text>
            </Box>
          );
        }
        if (isRunPhase) {
          return (
            <Box key={item.value}>
              <Text {...(isSelected ? { color: 'green' as const } : { dimColor: true })}>
                {isSelected ? '❯ ' : '  '}{item.label}
              </Text>
            </Box>
          );
        }
        if (isBack) {
          return (
            <Box key={item.value} marginTop={1}>
              <Text {...(isSelected ? { color: 'cyan' as const } : { dimColor: true })}>
                {isSelected ? '❯ ' : '  '}{item.label}
              </Text>
            </Box>
          );
        }
        return (
          <Box key={item.value}>
            <Text {...(isSelected ? { color: 'cyan' as const } : {})}>
              {isSelected ? '❯ ' : '  '}{item.label}
            </Text>
          </Box>
        );
      })}
      {end < items.length && <Text dimColor>  ↓ {items.length - end} more</Text>}
    </Box>
  );
}

export function ImplementScreen({
  options,
  selectedModel,
  onAgentStart,
  onAgentStop,
  onDone,
  onStartGame,
}: ImplementScreenProps) {
  const presetProject = options['project'] as string | undefined;
  const preselectedTaskId = options['task'] as string | undefined;
  const resumeMode = options['resume'] === true;
  const modeFlag = options['mode'] as string | undefined;
  const concurrency = Math.max(1, parseInt((options['concurrency'] as string | undefined) ?? '3', 10));
  const { stdout } = useStdout();
  // How many task rows the right panel can show without overflowing the terminal
  const taskListMaxVisible = Math.max(5, (stdout?.rows ?? 40) - 8);

  const [projectInput, setProjectInput] = useState(presetProject ?? '');
  const [projectPath, setProjectPath] = useState(
    presetProject !== undefined ? resolve(process.cwd(), presetProject) : '',
  );
  const [manualEntry, setManualEntry] = useState(false);

  interface DiscoveredGame { path: string; title: string; taskCount: number; completeCount: number }
  const [discoveredGames, setDiscoveredGames] = useState<DiscoveredGame[]>([]);
  const [scanning, setScanning] = useState(false);

  const [phase, setPhase] = useState<Phase>(presetProject !== undefined ? 'loading' : 'project-input');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const agentMode = 'advanced';
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [runSuccess, setRunSuccess] = useState(false);
  const [currentResult, setCurrentResult] = useState<TaskResult | null>(null);
  const [streamingText, setStreamingText] = useState('');

  // Task picker filter
  const [filterText, setFilterText] = useState('');
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());

  // Parallel execution state
  const [parallelStatuses, setParallelStatuses] = useState<Map<string, ParallelTaskStatus>>(new Map());
  const [parallelRanCount, setParallelRanCount] = useState(0);
  const [parallelFailedCount, setParallelFailedCount] = useState(0);
  const parallelPlanRef = useRef<TaskPlan | null>(null);
  const [selectedPhaseNum, setSelectedPhaseNum] = useState<number | null>(null);

  // AbortController for cancellation
  const abortRef = useRef<AbortController | null>(null);

  // Iteration mini-flow state
  const [iterationType, setIterationType] = useState<IterationType>('bug');
  const [iterationDescription, setIterationDescription] = useState('');
  const [iterationPlanError, setIterationPlanError] = useState<string | null>(null);
  const [iterationAddedCount, setIterationAddedCount] = useState<{ count: number; label: string } | null>(null);

  // Budget exhaustion prompt state
  const [budgetPrompt, setBudgetPrompt] = useState<{ used: number; budget: number; filesWritten: number } | null>(null);
  const budgetResolverRef = useRef<((d: BudgetExhaustedDecision) => void) | null>(null);
  // Tracks the current (possibly extended) token budget for the progress bar
  const [currentTokenBudget, setCurrentTokenBudget] = useState(0);

  // Scan CWD for game directories when showing the project picker
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
              const plan = JSON.parse(raw) as { gameTitle?: string; phases?: Array<{ tasks: Array<{ status: string }> }> };
              const allTasks = plan.phases?.flatMap((p) => p.tasks) ?? [];
              found.push({
                path: join(process.cwd(), name),
                title: plan.gameTitle ?? basename(name),
                taskCount: allTasks.length,
                completeCount: allTasks.filter((t) => t.status === 'complete').length,
              });
            } catch { /* not a game dir */ }
          }),
        );
        found.sort((a, b) => a.title.localeCompare(b.title));
        setDiscoveredGames(found);
      } catch { /* ignore readdir errors */ }
      setScanning(false);
    };
    void scan();
  }, [phase, presetProject]); // eslint-disable-line react-hooks/exhaustive-deps

  const append = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const reloadPlanFromDisk = useCallback(async (): Promise<TaskPlan | null> => {
    if (!projectPath) return null;

    const tasksPath = join(projectPath, 'harness', 'tasks.json');
    const raw = await readFile(tasksPath, 'utf8');
    const updatedPlan = JSON.parse(raw) as TaskPlan;
    const allTasks = updatedPlan.phases.flatMap((p) => p.tasks);
    setPlan(updatedPlan);
    setTasks(allTasks);

    if (selectedTask !== null) {
      const refreshedSelectedTask = allTasks.find((t) => t.id === selectedTask.id) ?? null;
      setSelectedTask(refreshedSelectedTask);
    }

    return updatedPlan;
  }, [projectPath, selectedTask]);

  // Esc to cancel running agent; Y/N to respond to budget prompt
  useInput((input, key) => {
    if (budgetPrompt !== null) {
      if (input === 'y' || input === 'Y' || key.return) {
        const extraBudget = 100_000;
        setBudgetPrompt(null);
        setCurrentTokenBudget((prev) => prev + extraBudget);
        budgetResolverRef.current?.({ action: 'continue', extraBudget });
        budgetResolverRef.current = null;
      } else if (input === 'n' || input === 'N' || key.escape) {
        setBudgetPrompt(null);
        budgetResolverRef.current?.({ action: 'abort', extraBudget: 0 });
        budgetResolverRef.current = null;
      }
      return;
    }
    if (key.escape && phase === 'iteration-type') {
      setPhase('picking');
    }
    if (key.escape && phase === 'iteration-describe') {
      setPhase('iteration-type');
    }
    if (key.escape && phase === 'picking' && presetProject === undefined) {
      setPhase('project-input');
    }
    if (key.escape && phase === 'running' && abortRef.current) {
      abortRef.current.abort();
      append({ kind: 'system', text: 'Cancelling agent...', timestamp: Date.now() });
    }
  });

  // Load tasks.json when projectPath is set and phase is 'loading'
  useEffect(() => {
    if (phase !== 'loading' || !projectPath) return;
    try { loadHarnessConfig(); } catch { /* ignore */ }
    const load = async () => {
      try {
        const tasksPath = join(projectPath, 'harness', 'tasks.json');
        const raw = await readFile(tasksPath, 'utf8');
        const loadedPlan = JSON.parse(raw) as TaskPlan;
        const allTasks = loadedPlan.phases.flatMap((p) => p.tasks);
        setPlan(loadedPlan);
        setTasks(allTasks);

        if (preselectedTaskId) {
          const found = allTasks.find((t) => t.id === preselectedTaskId);
          if (!found) {
            setLoadError(`Task "${preselectedTaskId}" not found in harness/tasks.json`);
            setPhase('error');
            return;
          }
          setSelectedTask(found);
          setPhase('confirm-cost');
        } else if (resumeMode) {
          const pending = allTasks.filter(
            (t) => t.status !== 'complete' && t.status !== 'blocked',
          );
          if (pending.length === 0) {
            setLoadError('All tasks are already complete.');
            setPhase('error');
            return;
          }
          // For parallel resume, seed the status map with all pending tasks
          if (concurrency > 1) {
            const initialStatuses = new Map<string, ParallelTaskStatus>();
            allTasks.forEach((t) => {
              initialStatuses.set(t.id, {
                task: t,
                status: t.status === 'complete' ? 'done' : t.status === 'failed' ? 'failed' : 'pending',
                lastMsg: '',
              });
            });
            setParallelStatuses(initialStatuses);
            parallelPlanRef.current = loadedPlan;
          }
          setSelectedTask(pending[0]!);
          setPhase('confirm-cost');
        } else {
          setPhase('picking');
        }
      } catch (err) {
        setLoadError(String(err));
        setPhase('error');
      }
    };
    void load();
  }, [phase, projectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run agent when phase transitions to 'running'
  useEffect(() => {
    if (phase !== 'running' || !selectedTask || !plan) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      onAgentStart();
      setStreamingText('');
      setCurrentResult(null);
      setCurrentTokenBudget(ROLE_TOKEN_BUDGET[selectedTask.role] ?? 200_000);
      append({ kind: 'system', text: `Starting: ${selectedTask.title}`, timestamp: Date.now() });

      try {
        // Re-read plan from disk so statuses are fresh
        const tasksPath = join(projectPath, 'harness', 'tasks.json');
        const freshPlan: TaskPlan = JSON.parse(await readFile(tasksPath, 'utf8')) as TaskPlan;
        const freshTask = freshPlan.phases.flatMap((p) => p.tasks).find((t) => t.id === selectedTask.id);
        if (!freshTask) {
          append({ kind: 'error', text: `Task "${selectedTask.id}" not found in tasks.json`, timestamp: Date.now() });
          setPhase('error');
          return;
        }

        const result = await runTask(
          projectPath,
          freshTask,
          freshPlan,
          undefined,
          agentMode,
          ({ name, input }) => {
            append({ kind: 'tool-call', toolName: name, input, timestamp: Date.now() });
            // Flush streaming text as a thinking entry when a tool call arrives
            setStreamingText((prev) => {
              if (prev.trim()) {
                append({ kind: 'thinking', text: prev.trim(), timestamp: Date.now() });
              }
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
            if (text) {
              // Clear streaming text since we now have the full message
              setStreamingText('');
            }
          },
          ({ input, output }) => {
            setTokensUsed(input + output);
          },
          controller.signal,
          (delta) => {
            setStreamingText((prev) => prev + delta);
          },
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
        setRunSuccess(result.success);
        onAgentStop();
        const updatedPlan = await reloadPlanFromDisk();

        // In resume mode, auto-advance to next task
        if (resumeMode && result.success && updatedPlan !== null) {
          const allTasks = updatedPlan.phases.flatMap((p) => p.tasks);
          const nextTask = allTasks.find(
            (t) => t.status !== 'complete' && t.status !== 'blocked',
          );
          if (nextTask) {
            setPlan(updatedPlan);
            setTasks(allTasks);
            setSelectedTask(nextTask);
            setPhase('confirm-cost');
            return;
          }
        }

        setPhase('post-run');
      } catch (err) {
        setStreamingText('');
        setCurrentResult(null);
        append({ kind: 'error', text: String(err), timestamp: Date.now() });
        onAgentStop();
        try {
          await reloadPlanFromDisk();
        } catch {
          // Keep the original error visible even if refreshing the plan fails.
        }
        setPhase('post-run');
      }
    };

    void run();

    return () => {
      abortRef.current = null;
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parallel resume runner
  useEffect(() => {
    if (phase !== 'running-parallel' || !plan) return;

    const currentPlan = parallelPlanRef.current ?? plan;
    const controller = new AbortController();
    abortRef.current = controller;
    onAgentStart();

    const run = async () => {
      const { ranCount, failedCount } = await runTasksParallel(projectPath, currentPlan, {
        concurrency,
        taskMode: agentMode,
        signal: controller.signal,
        ...(selectedModel !== undefined ? { model: selectedModel } : {}),
        ...(selectedPhaseNum !== null ? { phaseFilter: selectedPhaseNum } : {}),
        onTaskStart: (task) => {
          setParallelStatuses((prev) => {
            const next = new Map(prev);
            next.set(task.id, { task, status: 'running', lastMsg: 'Starting...' });
            return next;
          });
        },
        onProgress: (taskId, msg) => {
          setParallelStatuses((prev) => {
            const existing = prev.get(taskId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(taskId, { ...existing, lastMsg: msg });
            return next;
          });
        },
        onTaskDone: (task, result) => {
          const tuiStatus =
            result.success ? 'done' :
            task.status === 'blocked' ? 'blocked' : 'failed';
          setParallelStatuses((prev) => {
            const next = new Map(prev);
            next.set(task.id, {
              task,
              status: tuiStatus,
              lastMsg: result.success
                ? `Done (${result.toolCallCount} calls)`
                : tuiStatus === 'blocked'
                ? `Blocked — dependency failed`
                : result.summary.slice(0, 120),
              result,
            });
            return next;
          });
          if (result.success) setParallelRanCount((n) => n + 1);
          else setParallelFailedCount((n) => n + 1);
        },
      });
      onAgentStop();
      setParallelRanCount(ranCount);
      setParallelFailedCount(failedCount);
      setRunSuccess(failedCount === 0);
      await reloadPlanFromDisk();
      setSelectedPhaseNum(null);
      setPhase('post-run');
    };

    void run();

    return () => {
      abortRef.current = null;
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Iteration mini-flow: run planIteration when phase is 'iteration-planning'
  useEffect(() => {
    if (phase !== 'iteration-planning') return;
    const run = async () => {
      setIterationPlanError(null);
      try {
        const newTasks = await planIteration(
          projectPath,
          iterationType,
          iterationDescription,
          ...(selectedModel !== undefined ? [{ model: selectedModel }] : [{}]),
        );
        const updatedPlan = await appendIterationTasks(projectPath, iterationType, newTasks);
        const phaseLabel = iterationType === 'bug' ? 'Bugs' : 'Features';
        setIterationAddedCount({ count: newTasks.length, label: phaseLabel });
        setPlan(updatedPlan);
        setTasks(updatedPlan.phases.flatMap((p) => p.tasks));
        setIterationDescription('');
        setPhase('picking');
      } catch (err) {
        setIterationPlanError(String(err));
        setPhase('picking');
      }
    };
    void run();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build filtered, grouped task items for picker
  const filteredPhases = plan?.phases.map((p) => ({
    phase: p.phase,
    tasks: p.tasks.filter((t) => {
      if (!filterText) return true;
      const q = filterText.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q)
      );
    }),
  })).filter((p) => p.tasks.length > 0) ?? [];

  const visibleTaskItems: TaskItem[] = [
    { label: '+ Plan a bug fix or new feature', value: '__plan_iteration__' },
    ...filteredPhases.flatMap((p) => {
      const phaseDisplay = (plan?.phases.find((ph) => ph.phase === p.phase)?.label) ?? `Phase ${p.phase}`;
      const items: TaskItem[] = [
        { label: `── ${phaseDisplay} ──`, value: `__phase_${p.phase}` },
      ];
      if (!collapsedPhases.has(p.phase)) {
        items.push(
          ...p.tasks.map((t) => ({
            label: `  ${statusChar(t)} ${t.title}  (${t.status})`,
            value: t.id,
          })),
        );
      } else {
        items.push({ label: `  (${p.tasks.length} tasks collapsed)`, value: `__collapsed_${p.phase}` });
      }
      const incompleteCount = p.tasks.filter(
        (t) => t.status !== 'complete' && t.status !== 'blocked',
      ).length;
      if (incompleteCount > 0) {
        items.push({
          label: `  ▶ Run all  (${incompleteCount} incomplete)`,
          value: `__run_phase_${p.phase}`,
        });
      }
      return items;
    }),
    ...(presetProject === undefined ? [{ label: '← Back', value: '__back__' }] : []),
  ];

  const againItems: TaskItem[] = [
    ...(runSuccess && projectPath && onStartGame ? [{ label: '▶  Start game', value: 'start' }] : []),
    ...(!runSuccess && selectedTask ? [{ label: '↺ Retry this task', value: 'retry' }] : []),
    { label: 'Run another task', value: 'again' },
    { label: 'Exit', value: 'exit' },
  ];

  if (phase === 'project-input') {
    if (scanning) {
      return (
        <Box flexDirection="column">
          <Header title=" game-harness  implement-task" />
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
          <Header title=" game-harness  implement-task" hint="↑↓ select · Enter confirm" />
          <Box marginTop={1} flexDirection="column" paddingX={2}>
            <Text bold color="cyan">Select a game project:</Text>
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
                setPhase('loading');
              }}
            />
          </Box>
        </Box>
      );
    }

    // Manual entry fallback (no games found, or user chose it)
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  implement-task" hint="Enter to confirm" />
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
                setPhase('loading');
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === 'loading') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  implement-task" />
        <Spinner label="Loading tasks..." />
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Header title=" game-harness  implement-task" />
        <Text color="red">x {loadError ?? 'Unknown error'}</Text>
      </Box>
    );
  }

  const doneEntry = findLast(entries, (e) => e.kind === 'done') as
    | { kind: 'done'; summary: string; filesModified: string[] }
    | undefined;
  const tokenBreakdownLines = currentResult ? formatTokenBreakdownLines(currentResult) : [];

  // Count remaining tasks for resume display
  const remainingCount = tasks.filter(
    (t) => t.status !== 'complete' && t.status !== 'blocked',
  ).length;
  const completedCount = tasks.filter((t) => t.status === 'complete').length;
  const failedTaskCount = tasks.filter((t) => t.status === 'failed').length;
  const activeTaskTitle = selectedTask?.title ?? 'No active task';

  return (
    <Box flexDirection="column" height="100%">
      <Header
        title=" game-harness  implement-task"
        {...(plan?.gameTitle !== undefined
          ? { subtitle: plan.gameTitle + (selectedModel ? ` · ${selectedModel}` : '') }
          : selectedModel
          ? { subtitle: selectedModel }
          : {})}
        {...(phase === 'picking'
          ? { hint: '↑↓ navigate · Enter select · Tab collapse · / filter · Esc back' }
          : phase === 'iteration-type'
          ? { hint: '↑↓ navigate · Enter confirm · Esc back' }
          : phase === 'iteration-describe'
          ? { hint: 'Enter to plan · Esc back' }
          : phase === 'iteration-planning'
          ? { hint: 'Planning...' }
          : phase === 'running' || phase === 'running-parallel'
          ? { hint: 'Esc to cancel' }
          : {})}
      />

      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} marginRight={2}>
          {phase === 'iteration-type' && (
            <Box flexDirection="column">
              <Text bold color="cyan">What would you like to do?</Text>
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    { label: 'Fix a Bug', value: 'bug' },
                    { label: 'Add a Feature', value: 'feature' },
                  ]}
                  onSelect={(item) => {
                    setIterationType(item.value as IterationType);
                    setPhase('iteration-describe');
                  }}
                />
              </Box>
              <Box marginTop={1}>
                <Text dimColor>Esc → back to task list</Text>
              </Box>
            </Box>
          )}

          {phase === 'iteration-describe' && (
            <Box flexDirection="column">
              <Text bold color="cyan">
                {iterationType === 'bug' ? 'Describe the bug:' : 'Describe the feature:'}
              </Text>
              <Text dimColor>
                {iterationType === 'bug'
                  ? 'What is broken and when does it happen?'
                  : 'What should the game do that it currently cannot?'}
              </Text>
              <Box marginTop={1}>
                <TextInput
                  value={iterationDescription}
                  onChange={setIterationDescription}
                  placeholder={
                    iterationType === 'bug'
                      ? "e.g. Player doesn't lose health on collision"
                      : 'e.g. Add a double-jump when Space is pressed in the air'
                  }
                  onSubmit={(val) => {
                    if (!val.trim()) return;
                    setIterationDescription(val.trim());
                    setPhase('iteration-planning');
                  }}
                />
              </Box>
              <Box marginTop={1}>
                <Text dimColor>Enter to plan · Esc → back</Text>
              </Box>
            </Box>
          )}

          {phase === 'iteration-planning' && (
            <Box flexDirection="column">
              <Text bold color="cyan">
                Planning {iterationType === 'bug' ? 'bug fix' : 'feature'}...
              </Text>
              <Text dimColor>{iterationDescription}</Text>
            </Box>
          )}

          {phase === 'picking' && (
            <Box flexDirection="column">
              <Text bold color="cyan">Select a task to implement:</Text>
              {resumeMode && (
                <Text dimColor>Resume mode: {remainingCount} tasks remaining</Text>
              )}
              {iterationAddedCount !== null && (
                <Text color="green">
                  ✓ {iterationAddedCount.count} task{iterationAddedCount.count !== 1 ? 's' : ''} added to {iterationAddedCount.label} phase
                </Text>
              )}
              {iterationPlanError !== null && (
                <Text color="red">✗ Iteration planning failed: {iterationPlanError.slice(0, 80)}</Text>
              )}
              <TaskPickerList
                items={visibleTaskItems}
                filterText={filterText}
                onFilterChange={setFilterText}
                onSelect={(item: TaskItem) => {
                  if (item.value === '__plan_iteration__') {
                    setIterationAddedCount(null);
                    setIterationPlanError(null);
                    setIterationDescription('');
                    setPhase('iteration-type');
                    return;
                  }
                  if (item.value === '__back__') {
                    setPhase('project-input');
                    return;
                  }
                  if (item.value.startsWith('__run_phase_')) {
                    const phaseNum = parseInt(item.value.replace('__run_phase_', ''), 10);
                    const phaseTaskList = tasks.filter((t) => t.phase === phaseNum);
                    const initialStatuses = new Map<string, ParallelTaskStatus>();
                    phaseTaskList.forEach((t) => {
                      initialStatuses.set(t.id, {
                        task: t,
                        status: t.status === 'complete' ? 'done'
                              : t.status === 'failed'   ? 'failed'
                              : 'pending',
                        lastMsg: '',
                      });
                    });
                    setSelectedPhaseNum(phaseNum);
                    setParallelStatuses(initialStatuses);
                    parallelPlanRef.current = plan;
                    setSelectedTask(
                      phaseTaskList.find((t) => t.status !== 'complete' && t.status !== 'blocked') ?? null,
                    );
                    setPhase('confirm-cost');
                    return;
                  }
                  if (item.value.startsWith('__phase_')) {
                    const phaseNum = parseInt(item.value.replace('__phase_', ''), 10);
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phaseNum)) next.delete(phaseNum);
                      else next.add(phaseNum);
                      return next;
                    });
                    return;
                  }
                  if (item.value.startsWith('__collapsed_')) {
                    const phaseNum = parseInt(item.value.replace('__collapsed_', ''), 10);
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      next.delete(phaseNum);
                      return next;
                    });
                    return;
                  }
                  const found = tasks.find((t) => t.id === item.value);
                  if (found) {
                    setSelectedTask(found);
                    setEntries([]);
                    setTokensUsed(0);
                    setPhase('confirm-cost');
                  }
                }}
              />
            </Box>
          )}

          {phase === 'confirm-cost' && selectedTask && plan && (
            <CostEstimate
              task={selectedTask}
              plan={plan}
              mode={agentMode}
              resumeMode={resumeMode}
              {...(selectedPhaseNum !== null
                ? { phaseTasks: tasks.filter((t) => t.phase === selectedPhaseNum) }
                : {})}
              onConfirm={() => {
                if (selectedPhaseNum !== null) {
                  setPhase('running-parallel');
                } else {
                  setPhase(resumeMode && concurrency > 1 ? 'running-parallel' : 'running');
                }
              }}
              onCancel={() => {
                setSelectedPhaseNum(null);
                setSelectedTask(null);
                setPhase('picking');
              }}
            />
          )}

          {phase === 'running' && (
            <Box flexDirection="column">
              <Box marginBottom={1}>
                <ProgressBar used={tokensUsed} total={currentTokenBudget > 0 ? currentTokenBudget : (selectedTask ? ROLE_TOKEN_BUDGET[selectedTask.role] ?? 200_000 : 200_000)} label="tokens" width={16} />
              </Box>
              {budgetPrompt !== null ? (
                <Box borderStyle="round" {...(budgetPrompt.filesWritten === 0 ? { borderColor: 'red' as const } : { borderColor: 'yellow' as const })} paddingX={2} paddingY={1} flexDirection="column">
                  <Text bold {...(budgetPrompt.filesWritten === 0 ? { color: 'red' as const } : { color: 'yellow' as const })}>Token budget reached</Text>
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
                  spinnerLabel={selectedTask ? `Running: ${selectedTask.title}...` : 'Agent running...'}
                  streamingText={streamingText}
                />
              )}
            </Box>
          )}

          {phase === 'running-parallel' && (() => {
            const statuses = Array.from(parallelStatuses.values());
            const total = statuses.length;
            const doneCount = statuses.filter((s) => s.status === 'done').length;
            const failedCount = statuses.filter((s) => s.status === 'failed').length;
            const runningNow = statuses.filter((s) => s.status === 'running');

            // Group by phase number for display
            const byPhase = new Map<number, ParallelTaskStatus[]>();
            statuses.forEach((s) => {
              const ph = s.task.phase;
              if (!byPhase.has(ph)) byPhase.set(ph, []);
              byPhase.get(ph)!.push(s);
            });
            const phaseNums = Array.from(byPhase.keys()).sort((a, b) => a - b);

            return (
              <Box flexDirection="column">
                <Box marginBottom={1}>
                  <Text bold color="cyan">
                    {doneCount}/{total} complete
                    {failedCount > 0 ? <Text color="red">  {statuses.filter((s) => s.status === 'failed').length} failed</Text> : null}
                    {statuses.filter((s) => s.status === 'blocked').length > 0 ? <Text dimColor>  {statuses.filter((s) => s.status === 'blocked').length} blocked</Text> : null}
                    {'  '}
                  </Text>
                  <Text dimColor>[Esc] cancel  ·  running {runningNow.length}/{concurrency}</Text>
                </Box>
                {phaseNums.map((ph) => (
                  <Box key={ph} flexDirection="column" marginBottom={1}>
                    <Text dimColor>── Phase {ph} ──</Text>
                    {byPhase.get(ph)!.map((s) => {
                      const icon =
                        s.status === 'done' ? '✓' :
                        s.status === 'failed' ? '✗' :
                        s.status === 'blocked' ? '⊘' :
                        s.status === 'running' ? '⟳' : '○';
                      const color =
                        s.status === 'done' ? 'green' as const :
                        s.status === 'failed' ? 'red' as const :
                        s.status === 'running' ? 'yellow' as const : undefined;
                      return (
                        <Box key={s.task.id} marginLeft={2}>
                          <Text {...(color !== undefined ? { color } : {})} dimColor={s.status === 'blocked'}>{icon} </Text>
                          <Text bold={s.status === 'running'} dimColor={s.status === 'blocked'}>{s.task.title.slice(0, 36).padEnd(36)}</Text>
                          {s.status === 'running' && (
                            <Text dimColor>  {s.lastMsg.slice(0, 30)}</Text>
                          )}
                          {s.status === 'done' && (
                            <Text dimColor>  {s.lastMsg}</Text>
                          )}
                          {s.status === 'failed' && (
                            <Text color="red">  {s.lastMsg}</Text>
                          )}
                          {s.status === 'blocked' && (
                            <Text dimColor>  {s.lastMsg}</Text>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            );
          })()}

          {phase === 'post-run' && resumeMode && concurrency > 1 && (
            <Box flexDirection="column">
              <Text bold {...(parallelFailedCount === 0 ? { color: 'green' as const } : { color: 'red' as const })}>
                {parallelFailedCount === 0
                  ? `✓ All ${parallelRanCount} tasks complete`
                  : `✗ ${parallelRanCount} done, ${parallelFailedCount} failed`}
              </Text>
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    ...(parallelFailedCount === 0 && projectPath && onStartGame ? [{ label: '▶  Start game', value: 'start' }] : []),
                    ...(parallelFailedCount > 0 ? [{ label: '← Back to task list', value: 'back' }] : []),
                    { label: 'Exit', value: 'exit' },
                  ]}
                  onSelect={(item: TaskItem) => {
                    if (item.value === 'start') {
                      onStartGame!(projectPath);
                    } else if (item.value === 'back') {
                      setSelectedPhaseNum(null);
                      setParallelStatuses(new Map());
                      setParallelRanCount(0);
                      setParallelFailedCount(0);
                      setPhase('picking');
                    } else {
                      onDone({
                        success: parallelFailedCount === 0,
                        summary: `${parallelRanCount} tasks completed, ${parallelFailedCount} failed.`,
                        filesModified: [],
                      });
                    }
                  }}
                />
              </Box>
            </Box>
          )}

          {phase === 'post-run' && !(resumeMode && concurrency > 1) && (
            <Box flexDirection="column">
              <Box borderStyle="round" {...(runSuccess ? { borderColor: 'green' as const } : { borderColor: 'red' as const })} paddingX={2} paddingY={1}>
                <Box flexDirection="column">
                  <Text bold {...(runSuccess ? { color: 'green' as const } : { color: 'red' as const })}>
                    {runSuccess ? '✓ Done' : '✗ Failed'}{'  '}
                  </Text>
                  <Text dimColor>{(doneEntry?.summary ?? '').slice(0, 120)}</Text>
                  {currentResult && (
                    <Box marginTop={1} flexDirection="column">
                      <Text dimColor>
                        total: in {currentResult.tokensUsed.input.toLocaleString()}, out {currentResult.tokensUsed.output.toLocaleString()}, cached {currentResult.tokensUsed.cached.toLocaleString()}
                      </Text>
                      {tokenBreakdownLines.map((line) => (
                        <Text key={line} dimColor>{line}</Text>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
              <Box marginTop={1} flexDirection="column">
                <Text bold>What next?</Text>
                <SelectInput
                  items={againItems}
                  onSelect={(item: TaskItem) => {
                    if (item.value === 'start') {
                      onStartGame!(projectPath);
                    } else if (item.value === 'retry') {
                      setEntries([]);
                      setTokensUsed(0);
                      setCurrentResult(null);
                      setRunSuccess(false);
                      setPhase('running');
                    } else if (item.value === 'again') {
                      setEntries([]);
                      setTokensUsed(0);
                      setCurrentResult(null);
                      setSelectedTask(null);
                      setRunSuccess(false);
                      setPhase('picking');
                    } else {
                      onDone({
                        success: runSuccess,
                        summary: doneEntry?.summary ?? 'Task complete.',
                        filesModified: doneEntry?.filesModified ?? [],
                      });
                    }
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>

        {plan !== null && phase !== 'picking' && phase !== 'confirm-cost' ? (
          <Box width={30} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            {phase === 'running' ? (
              <Box flexDirection="column">
                <Text bold dimColor>Current Task</Text>
                <Box marginTop={1} flexDirection="column">
                  <Text color="cyan">{activeTaskTitle}</Text>
                  {selectedTask ? <Text dimColor>{selectedTask.id}</Text> : null}
                </Box>
                <Box marginTop={1} flexDirection="column">
                  <Text dimColor>Progress</Text>
                  <Text>{completedCount}/{tasks.length} complete</Text>
                  {failedTaskCount > 0 ? <Text color="red">{failedTaskCount} failed</Text> : null}
                  <Text dimColor>{remainingCount} remaining</Text>
                </Box>
                <Box marginTop={1} flexDirection="column">
                  <Text dimColor>Mode</Text>
                  <Text>{agentMode}</Text>
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Text bold dimColor>Project</Text>
                <Box marginTop={1} flexDirection="column">
                  <Text>{completedCount}/{tasks.length} complete</Text>
                  {failedTaskCount > 0 ? <Text color="red">{failedTaskCount} failed</Text> : null}
                  <Text dimColor>{remainingCount} remaining</Text>
                </Box>
                {phase === 'running-parallel' && selectedPhaseNum !== null ? (
                  <Box marginTop={1} flexDirection="column">
                    <Text dimColor>Running phase</Text>
                    <Text color="cyan">Phase {selectedPhaseNum}</Text>
                  </Box>
                ) : null}
                <Box marginTop={1} flexDirection="column">
                  <Text dimColor>Mode</Text>
                  <Text>{agentMode}</Text>
                </Box>
              </Box>
            )}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function statusChar(task: TaskState): string {
  if (task.status === 'complete') return 'v';
  if (task.status === 'failed') return 'x';
  if (task.status === 'in-progress') return '>';
  if (task.status === 'blocked') return 'o';
  return ' ';
}

function formatTokenBreakdownLines(result: TaskResult): string[] {
  const entries = result.tokenBreakdown ?? [];
  if (entries.length === 0) {
    return [];
  }

  return entries.map(({ phase, tokensUsed }) =>
    `${phase}: in ${tokensUsed.input.toLocaleString()}, out ${tokensUsed.output.toLocaleString()}, cached ${tokensUsed.cached.toLocaleString()}`,
  );
}
