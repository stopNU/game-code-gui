import { writeFile } from 'fs/promises';
import { join } from 'path';
import {
  runAgentLoop,
  runClaudeCodeLoop,
  runCodexLoop,
  Tracer,
  FULL_DEV_POLICY,
  defaultAgentConfig,
  getModelProvider,
  ROLE_TOKEN_BUDGET,
  type AgentConfig,
  type AgentContext,
  type BudgetExhaustedDecision,
  type ClaudeMessage,
  type InputOutputTokens,
  type TaskPlan,
  type TaskResult,
  type TaskState,
} from '@agent-harness/core';
import { ALL_TOOLS } from '@agent-harness/tools';
import { prepareTaskContext } from './implement-task-context.js';
import { verifyAndRepair } from './implement-task-repair.js';
import { persistTaskSummary, rolePrompt, withTokenBreakdown } from './implement-task-shared.js';

/**
 * Core task executor shared by the CLI command and the new-game auto-implement loop.
 * Returns the TaskResult while callers decide how to present it.
 */
export async function runTask(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  onProgress?: (msg: string) => void,
  mode: 'simple' | 'advanced' = 'simple',
  onToolCallDetail?: (call: { name: string; input: Record<string, unknown> }) => void,
  onAgentMessage?: (message: ClaudeMessage) => void,
  onTokens?: (tokens: InputOutputTokens) => void,
  signal?: AbortSignal,
  onText?: (delta: string) => void,
  model?: string,
  persistPlan?: (plan: TaskPlan) => Promise<void>,
  onBudgetExhausted?: (used: number, budget: number, filesWritten: number) => Promise<BudgetExhaustedDecision>,
  reconciliationReportPath?: string,
): Promise<TaskResult> {
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const memoryPath = join(projectPath, 'harness', 'memory.json');
  const persist = persistPlan ?? ((currentPlan: TaskPlan) => writeFile(tasksPath, JSON.stringify(currentPlan, null, 2), 'utf8'));
  const { memory } = await prepareTaskContext(projectPath, memoryPath, task, plan, mode, reconciliationReportPath);

  await persist(plan);

  const tracer = new Tracer(task.id, task.role);
  const agentConfig: AgentConfig = {
    ...defaultAgentConfig(task.role, rolePrompt(task.role, mode, task)),
    toolGroups: task.toolsAllowed,
    permissions: FULL_DEV_POLICY,
    ...(model !== undefined ? { model } : {}),
  };

  const ctx: AgentContext = {
    config: agentConfig,
    task,
    memory,
    conversationHistory: [],
    traceId: tracer.traceId,
    iterationCount: 0,
    tokenBudget: ROLE_TOKEN_BUDGET[task.role] ?? 200_000,
    tokenUsed: 0,
  };

  const allowedTools = ALL_TOOLS.filter((tool) => task.toolsAllowed.includes(tool.group));
  let toolCallCount = 0;
  const provider = getModelProvider(agentConfig.model);
  const loopOptions = {
    maxIterations: 30,
    retryPolicy: {
      maxRetries: 6,
      baseDelayMs: 5000,
      maxDelayMs: 120000,
      backoffMultiplier: 2,
      retryableErrors: ['overloaded_error', 'rate_limit_error'],
    },
    ...(signal !== undefined ? { signal } : {}),
    onToolCall: ({ name, input }: { name: string; input: Record<string, unknown> }) => {
      toolCallCount++;
      onProgress?.(`[${toolCallCount}] ${name}`);
      onToolCallDetail?.({ name, input });
    },
    onMessage: (message: ClaudeMessage) => {
      onAgentMessage?.(message);
    },
    onTokens: (tokens: InputOutputTokens) => {
      onTokens?.(tokens);
    },
    ...(onText !== undefined ? { onText } : {}),
    ...(onBudgetExhausted !== undefined ? { onBudgetExhausted } : {}),
  };

  const rawResult = provider === 'openai-codex'
    ? await runCodexLoop(ctx, loopOptions)
    : provider === 'claude-code'
      ? await runClaudeCodeLoop(ctx, loopOptions)
      : await runAgentLoop(ctx, loopOptions, { tools: allowedTools });
  const result = withTokenBreakdown(rawResult, 'main');

  const codeRoles: TaskState['role'][] = [
    'gameplay',
    'systems',
    'integration-verifier',
    'asset',
    'balance',
    'designer',
  ];
  const finalResult = provider !== 'openai-codex' && provider !== 'claude-code' && codeRoles.includes(task.role)
    ? await verifyAndRepair(projectPath, task, plan, result, agentConfig, mode, signal, onProgress, onText)
    : result;

  task.status = finalResult.success ? 'complete' : 'failed';
  task.result = finalResult;
  task.completedAt = new Date().toISOString();
  task.updatedAt = task.completedAt;
  if (!finalResult.success) {
    task.error = finalResult.summary;
  }

  if (finalResult.success) {
    await persistTaskSummary(projectPath, memoryPath, task, finalResult);
  }

  await persist(plan);
  return finalResult;
}
