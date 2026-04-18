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

/** Phase number reserved for bug-fix iteration tasks. */
export const BUG_PHASE = 90;

/** Phase number reserved for new-feature iteration tasks. */
export const FEATURE_PHASE = 91;

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

function inflateIterationTask(t: IterationTask, type: IterationType): TaskState {
  const now = new Date().toISOString();

  // Ensure minimum tool access for code-touching roles
  let toolsAllowed = t.toolsAllowed as string[];
  if (['gameplay', 'qa', 'systems', 'integration-verifier'].includes(t.role)) {
    if (!toolsAllowed.includes('project')) toolsAllowed = ['project', ...toolsAllowed];
    if (!toolsAllowed.includes('npm')) toolsAllowed = [...toolsAllowed, 'npm'];
  }

  return {
    ...t,
    // Force the phase to the correct iteration bucket in case the LLM drifts
    phase: type === 'bug' ? BUG_PHASE : FEATURE_PHASE,
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
async function readLatestEvalFailures(projectPath: string): Promise<string | null> {
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
 * The caller is responsible for writing the updated plan back to disk via
 * `appendIterationTasks`.
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
    tasks.push(inflateIterationTask(result.data, type));
  }

  if (tasks.length === 0) {
    throw new Error('Iteration planner returned no valid tasks');
  }

  return tasks;
}

/**
 * Append a set of iteration tasks to the plan's bugs (90) or features (91)
 * phase, creating the phase entry if it doesn't exist, then persist to disk.
 */
export async function appendIterationTasks(
  projectPath: string,
  type: IterationType,
  newTasks: TaskState[],
): Promise<TaskPlan> {
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const raw = await readFile(tasksPath, 'utf8');
  const plan = JSON.parse(raw) as TaskPlan;

  const targetPhase = type === 'bug' ? BUG_PHASE : FEATURE_PHASE;
  const phaseLabel = type === 'bug' ? 'Bugs' : 'Features';

  const existing = plan.phases.find((p) => p.phase === targetPhase);
  if (existing) {
    existing.tasks.push(...newTasks);
  } else {
    const newPhase: PhasePlan = {
      phase: targetPhase,
      label: phaseLabel,
      tasks: newTasks,
    };
    plan.phases.push(newPhase);
  }

  await writeFile(tasksPath, JSON.stringify(plan, null, 2), 'utf8');
  return plan;
}
