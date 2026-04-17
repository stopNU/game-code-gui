import { z } from 'zod';
import { ClaudeClient } from '../claude/client.js';
import type { TaskPlan, TaskState } from '../types/task.js';
import { DEFAULT_MODEL } from '../types/agent.js';
import { extractJson, extractText } from './extract.js';

function inflateTask(t: z.infer<typeof DesignerTaskSchema>): TaskState {
  const now = new Date().toISOString();

  let toolsAllowed = t.toolsAllowed as string[];
  if (
    t.role === 'gameplay'
    || t.role === 'qa'
    || t.role === 'evaluator'
    || t.role === 'systems'
    || t.role === 'integration-verifier'
  ) {
    if (!toolsAllowed.includes('project')) toolsAllowed = ['project', ...toolsAllowed];
    if (!toolsAllowed.includes('npm')) toolsAllowed = [...toolsAllowed, 'npm'];
  }
  if (t.role === 'balance') {
    if (!toolsAllowed.includes('project')) toolsAllowed = ['project', ...toolsAllowed];
    if (!toolsAllowed.includes('eval')) toolsAllowed = [...toolsAllowed, 'eval'];
  }

  return {
    ...t,
    toolsAllowed: toolsAllowed as import('../types/tool.js').ToolGroupName[],
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

const DesignerTaskSchema = z.object({
  id: z.string(),
  phase: z.number().int().min(1),
  role: z.enum([
    'designer',
    'gameplay',
    'asset',
    'qa',
    'evaluator',
    'systems',
    'integration-verifier',
    'balance',
  ]),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  toolsAllowed: z.array(
    z.enum(['project', 'code', 'asset', 'playtest', 'eval', 'npm', 'git']),
  ),
});

export async function decomposeTasks(
  plan: TaskPlan,
  featureDescription: string,
  client?: ClaudeClient,
): Promise<TaskState[]> {
  const c = client ?? new ClaudeClient();

  const prompt = `
Given the existing TaskPlan and the following new feature request, generate an array of new TaskState objects needed to implement the feature.

Existing plan context:
- Game: ${plan.gameTitle}
- Brief: ${plan.gameBrief}

Feature request: ${featureDescription}

Return a JSON array of TaskState objects. Each must have:
- id (kebab-case, unique, prefixed with "feat-")
- phase (1–10, use phase 2 for gameplay code changes)
- role ("gameplay" for code, "systems" for GDScript systems, "asset" for assets, "qa" for tests)
- status: "pending"
- title, description, acceptanceCriteria (array of 2–4 items)
- dependencies (array of task IDs this depends on)
- toolsAllowed (from: project, code, game, asset, npm, git)
- retries: 0, maxRetries: 3
- context: { projectPath: "", gameSpec: "", relevantFiles: [], memoryKeys: [], dependencySummaries: [], previousTaskSummaries: [] }
- createdAt, updatedAt: "${new Date().toISOString()}"
- brief: "${featureDescription}"

Return ONLY the JSON array.`;

  const result = await c.sendMessage({
    model: DEFAULT_MODEL,
    maxTokens: 4096,
    systemPrompt: 'You are an expert Godot 4 deckbuilder game development planner. Return only valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractText(result.message.content);
  const cleaned = extractJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Planner returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) throw new Error('Planner did not return an array');
  return (parsed as z.infer<typeof DesignerTaskSchema>[]).map(inflateTask);
}
