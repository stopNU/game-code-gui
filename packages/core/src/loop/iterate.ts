import { z } from 'zod';
import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ClaudeClient } from '../claude/client.js';
import { DEFAULT_MODEL, getModelProvider } from '../types/agent.js';
import type { TaskPlan, TaskState, PhasePlan } from '../types/task.js';
import { ITERATION_PLANNER_SYSTEM_PROMPT } from '../claude/roles/iterate.js';
import { extractJson, extractText } from './extract.js';
import type { ToolGroupName } from '../types/tool.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Phase number reserved for bug-fix iteration tasks (all bugs share one phase). */
export const BUG_PHASE = 90;

/** First phase number used for feature iterations. Each new feature gets its own incrementing phase. */
export const FEATURE_PHASE_BASE = 91;

/**
 * @deprecated Use {@link nextFeaturePhase}. Kept only as a starting hint; each
 * feature iteration now lands in its own phase >= FEATURE_PHASE_BASE.
 */
export const FEATURE_PHASE = FEATURE_PHASE_BASE;

export type IterationType = 'bug' | 'feature';

// ---------------------------------------------------------------------------
// Minimal schema for what the LLM returns
// ---------------------------------------------------------------------------

const IterationTaskSchema = z.object({
  id: z.string(),
  phase: z.number().int(),
  role: z.enum(['gameplay', 'asset', 'qa', 'systems', 'designer', 'evaluator', 'integration-verifier', 'balance']),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  toolsAllowed: z.array(
    z.enum(['project', 'code', 'game', 'asset', 'playtest', 'eval', 'npm', 'git']),
  ),
});

type IterationTask = z.infer<typeof IterationTaskSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the next phase number to use for a feature iteration. Bugs always
 * share phase 90; features each get their own slot starting at 91 so each
 * feature's tasks form a coherent group with their own label.
 */
export function nextFeaturePhase(plan: TaskPlan): number {
  let max = FEATURE_PHASE_BASE - 1;
  for (const phase of plan.phases) {
    if (phase.phase >= FEATURE_PHASE_BASE && phase.phase > max) {
      max = phase.phase;
    }
  }
  return max + 1;
}

/** Extract every task id present in a plan, for collision detection. */
function collectExistingTaskIds(plan: TaskPlan): Set<string> {
  const ids = new Set<string>();
  for (const phase of plan.phases) {
    for (const t of phase.tasks) {
      ids.add(t.id);
    }
  }
  return ids;
}

/**
 * Rewrite a task id so it is unique within the target phase and clearly
 * attributable to its iteration:
 *
 * - Bugs keep the `bug-` prefix the planner produces; if the resulting id
 *   collides with an existing task we append `-2`, `-3`, ... until unique.
 * - Features get their phase number folded in (`feat-<phase>-...`) so two
 *   features with overlapping descriptions (e.g. both about "double jump")
 *   never collide across iterations.
 */
function rewriteTaskId(originalId: string, type: IterationType, phase: number, taken: Set<string>): string {
  const stripped = originalId.replace(/^(bug-|feat-)/, '');
  const base = type === 'bug' ? `bug-${stripped}` : `feat-${phase}-${stripped}`;

  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

function inflateIterationTask(t: IterationTask): TaskState {
  const now = new Date().toISOString();

  // Ensure minimum tool access for code-touching roles
  let toolsAllowed = t.toolsAllowed as string[];
  if (['gameplay', 'qa', 'systems', 'integration-verifier'].includes(t.role)) {
    if (!toolsAllowed.includes('project')) toolsAllowed = ['project', ...toolsAllowed];
    if (!toolsAllowed.includes('npm')) toolsAllowed = [...toolsAllowed, 'npm'];
  }

  // Phase is a placeholder here — appendIterationTasks rewrites it to the
  // resolved target phase as it stamps tasks into the plan.
  return {
    ...t,
    toolsAllowed: toolsAllowed as ToolGroupName[],
    status: 'pending',
    brief: t.description,
    retries: 0,
    maxRetries: 3,
    context: {
      projectPath: '',
      gameSpec: '',
      relevantFiles: [],
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Read the most recent eval report from harness/baselines/ and return a
 * compact failure summary string, or null if none found / all passing.
 */
export async function readLatestEvalFailures(projectPath: string): Promise<string | null> {
  const baselinesDir = join(projectPath, 'harness', 'baselines');
  try {
    const files = await readdir(baselinesDir);
    const reports = files
      .filter((f) => f.startsWith('report-') && f.endsWith('.json'))
      .sort(); // alphabetical order is fine for UUID-prefixed names
    if (reports.length === 0) return null;

    const latest = reports[reports.length - 1]!;
    const raw = await readFile(join(baselinesDir, latest), 'utf8');

    const report = JSON.parse(raw) as {
      scores?: Array<{
        layer?: string;
        passed?: boolean;
        summary?: string;
        dimensions?: Array<{ name: string; score: number; rationale: string }>;
      }>;
    };

    const failures = (report.scores ?? []).filter((s) => s.passed === false);
    if (failures.length === 0) return null;

    return failures
      .map((f) => {
        const dims = (f.dimensions ?? [])
          .filter((d) => d.score < 5)
          .map((d) => `    - ${d.name} (${d.score}/10): ${d.rationale}`)
          .join('\n');
        return `[${f.layer ?? 'unknown'}] FAILED: ${f.summary ?? '(no summary)'}${dims ? '\n' + dims : ''}`;
      })
      .join('\n\n');
  } catch {
    return null;
  }
}

/** Default phase label when the caller doesn't supply one. Truncates long descriptions for legibility. */
function defaultPhaseLabel(type: IterationType, description: string): string {
  if (type === 'bug') return 'Bugs';
  const trimmed = description.trim().replace(/\s+/g, ' ');
  const head = trimmed.length > 40 ? `${trimmed.slice(0, 40).trimEnd()}…` : trimmed;
  return `Feature: ${head}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlanIterationOptions {
  model?: string;
}

/**
 * Plan a bug-fix or feature iteration against an existing game project.
 *
 * Reads harness/tasks.json for game context, optionally reads the latest eval
 * report for failure context (bug type only), calls the LLM to produce
 * targeted tasks, and returns them ready to be appended to the plan.
 *
 * The returned tasks carry a placeholder phase value — the actual target phase
 * is resolved by {@link appendIterationTasks} when the tasks are written, so
 * each feature iteration lands in its own phase slot.
 */
export async function planIteration(
  projectPath: string,
  type: IterationType,
  description: string,
  opts?: PlanIterationOptions,
): Promise<TaskState[]> {
  const requestedModel = opts?.model ?? DEFAULT_MODEL;
  const provider = getModelProvider(requestedModel);
  if (provider !== 'anthropic') {
    throw new Error(
      `planIteration only supports Anthropic models right now. Received "${requestedModel}" from provider "${provider}".`,
    );
  }

  const client = new ClaudeClient();

  // Load the existing plan for game context
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const raw = await readFile(tasksPath, 'utf8');
  const plan = JSON.parse(raw) as TaskPlan;

  // For bug reports, include eval failures if available
  let evalContext = '';
  if (type === 'bug') {
    const failures = await readLatestEvalFailures(projectPath);
    if (failures) {
      evalContext = `\n\nEval failure report (most recent run):\n${failures}`;
    }
  }

  // Summarise completed tasks so the LLM knows what exists
  const completedSummaries = plan.phases
    .flatMap((p) => p.tasks)
    .filter((t) => t.status === 'complete' && t.result?.summary)
    .map((t) => `- [${t.id}] ${t.title}: ${t.result!.summary}`)
    .slice(0, 20) // cap at 20 to stay under context limits
    .join('\n');

  const userPrompt = `
Game: ${plan.gameTitle}
Brief: ${plan.gameBrief}
Mode: advanced

Completed implementation tasks (for context):
${completedSummaries || '(none yet)'}
${evalContext}

Iteration type: ${type === 'bug' ? 'Bug Fix' : 'New Feature'}
Request: ${description}

Return ONLY the JSON array of tasks.`.trim();

  const result = await client.sendMessage({
    model: requestedModel,
    maxTokens: 4096,
    temperature: 0.3,
    systemPrompt: ITERATION_PLANNER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = extractText(result.message.content);
  const cleaned = extractJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Iteration planner returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Iteration planner did not return an array');
  }

  // Validate and inflate each task
  const tasks: TaskState[] = [];
  for (const raw of parsed) {
    const result = IterationTaskSchema.safeParse(raw);
    if (!result.success) {
      // Best-effort: skip invalid tasks rather than crashing
      continue;
    }
    tasks.push(inflateIterationTask(result.data));
  }

  if (tasks.length === 0) {
    throw new Error('Iteration planner returned no valid tasks');
  }

  return tasks;
}

export interface AppendIterationOptions {
  /**
   * Display label for the resulting phase. Defaults to "Bugs" for bugs and
   * "Feature: <description>" for features.
   */
  label?: string;
  /**
   * Optional description used to build a default feature label when `label`
   * isn't supplied. Ignored for bugs.
   */
  description?: string;
}

export interface AppendIterationResult {
  plan: TaskPlan;
  phase: number;
  label: string;
  taskIds: string[];
}

/**
 * Append iteration tasks to the plan and persist to disk.
 *
 * - `bug` tasks all land in {@link BUG_PHASE} (90). The phase entry is created
 *   on first use and reused for subsequent bug iterations.
 * - `feature` tasks always land in a brand-new phase at the next available
 *   slot >= 91, so each feature is a coherent collapsible group with its own
 *   label.
 *
 * Task ids are rewritten to be unique across the whole plan; dependency
 * references between newly generated tasks are remapped accordingly so the
 * scheduler can still resolve them.
 */
export async function appendIterationTasks(
  projectPath: string,
  type: IterationType,
  newTasks: TaskState[],
  opts: AppendIterationOptions = {},
): Promise<AppendIterationResult> {
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const raw = await readFile(tasksPath, 'utf8');
  const plan = JSON.parse(raw) as TaskPlan;

  const targetPhase = type === 'bug' ? BUG_PHASE : nextFeaturePhase(plan);
  const label = opts.label ?? defaultPhaseLabel(type, opts.description ?? '');

  const existingIds = collectExistingTaskIds(plan);

  // First pass: figure out new id for each task. Reserve them in `existingIds`
  // so two new tasks in the same batch don't collide either.
  const idRemap = new Map<string, string>();
  for (const task of newTasks) {
    const newId = rewriteTaskId(task.id, type, targetPhase, existingIds);
    idRemap.set(task.id, newId);
    existingIds.add(newId);
  }

  // Second pass: clone tasks with rewritten ids, remapped dependencies, and
  // the resolved target phase stamped on every task.
  const stamped: TaskState[] = newTasks.map((task) => ({
    ...task,
    id: idRemap.get(task.id) ?? task.id,
    phase: targetPhase,
    dependencies: task.dependencies.map((dep) => idRemap.get(dep) ?? dep),
  }));

  if (type === 'bug') {
    const existing = plan.phases.find((p) => p.phase === BUG_PHASE);
    if (existing) {
      existing.tasks.push(...stamped);
      // Keep the existing label if one was already set.
      if (existing.label === undefined || existing.label.length === 0) {
        existing.label = label;
      }
    } else {
      const newPhase: PhasePlan = { phase: BUG_PHASE, label, tasks: stamped };
      plan.phases.push(newPhase);
    }
  } else {
    // Features always start a fresh phase so each feature is self-contained.
    const newPhase: PhasePlan = { phase: targetPhase, label, tasks: stamped };
    plan.phases.push(newPhase);
  }

  await writeFile(tasksPath, JSON.stringify(plan, null, 2), 'utf8');

  return {
    plan,
    phase: targetPhase,
    label,
    taskIds: stamped.map((t) => t.id),
  };
}
