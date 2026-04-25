import type { ToolGroupName } from './tool.js';
import type { MemoryEntry, MemoryScope } from './memory.js';
import type { PermissionPolicy } from './permissions.js';
import type { TaskState } from './task.js';
import type { InputOutputTokens } from './task.js';

export type AgentRole =
  | 'designer'
  | 'brief-analyst'
  | 'gameplay'
  | 'asset'
  | 'qa'
  | 'evaluator'
  /** Advanced mode: implements EventBus handlers, state machines, data validators, run persistence. */
  | 'systems'
  /** Advanced mode: verifies runtime wiring between systems and gameplay after implementation. */
  | 'integration-verifier'
  /** Advanced mode: tunes balance numbers, validates content curves, runs balance analysis. */
  | 'balance';

export interface AgentConfig {
  role: AgentRole;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  toolGroups: ToolGroupName[];
  memoryScope: MemoryScope;
  permissions: PermissionPolicy;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  cache_control?: { type: 'ephemeral' };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
}

export interface AgentContext {
  config: AgentConfig;
  task: TaskState;
  memory: MemoryEntry[];
  conversationHistory: ClaudeMessage[];
  traceId: string;
  iterationCount: number;
  tokenBudget: number;
  tokenUsed: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface BudgetExhaustedDecision {
  action: 'continue' | 'abort';
  extraBudget: number;
}

export interface AgentLoopOptions {
  maxIterations: number;
  retryPolicy: RetryPolicy;
  signal?: AbortSignal;
  onToolCall?: (call: { name: string; input: Record<string, unknown> }) => void;
  onMessage?: (message: ClaudeMessage) => void;
  onTokens?: (tokens: InputOutputTokens) => void;
  onText?: (delta: string) => void;
  onComplete?: (result: import('./task.js').TaskResult) => void;
  /** Called when the token budget is exhausted mid-loop. Return `continue` to extend, `abort` to fail.
   *  `filesWritten` is the number of files modified so far — if 0, extending rarely helps. */
  onBudgetExhausted?: (used: number, budget: number, filesWritten: number) => Promise<BudgetExhaustedDecision>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: ['overloaded_error', 'rate_limit_error', 'api_error'],
};

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const MODELS = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    description: 'Balanced — best speed/quality for most tasks',
    costHint: '$$',
    provider: 'anthropic',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    description: 'Most capable — best for complex multi-file tasks',
    costHint: '$$$$',
    provider: 'anthropic',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    description: 'Fastest and cheapest — good for simple tasks',
    costHint: '$',
    provider: 'anthropic',
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'OpenAI GPT-5.4 via Codex subscription',
    costHint: '$$$',
    provider: 'openai-codex',
  },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];
export type ModelProvider = (typeof MODELS)[number]['provider'];

export function getModelProvider(modelId: string): ModelProvider {
  return MODELS.find((model) => model.id === modelId)?.provider ?? 'anthropic';
}

export const HIGH_TOKEN_ROLES: ReadonlySet<AgentRole> = new Set([
  'gameplay',
  'systems',
  'integration-verifier',
  'designer',
]);

// Creative roles benefit from some randomness; code/data roles need determinism.
export const ROLE_TEMPERATURE: Partial<Record<AgentRole, number>> = {
  designer: 0.4,
  'brief-analyst': 0.3,
  'integration-verifier': 0.1,
};

/**
 * Per-role token budgets for the main agent loop.
 *
 * - gameplay: writes full Godot scenes with boilerplate — needs headroom
 * - systems: moderate reads + writes, but properly scoped tasks should fit
 * - integration-verifier: reads many files, writes targeted fixes
 * - balance: analysis-heavy, reads telemetry data, iterates
 * - asset/qa/evaluator: lighter workloads
 * - designer/brief-analyst: planning only, no file writes
 */
export const ROLE_TOKEN_BUDGET: Record<AgentRole, number> = {
  gameplay: 350_000,
  systems: 200_000,
  'integration-verifier': 200_000,
  balance: 300_000,
  asset: 120_000,
  qa: 150_000,
  evaluator: 150_000,
  designer: 120_000,
  'brief-analyst': 80_000,
};

export function defaultAgentConfig(role: AgentRole, systemPrompt: string): AgentConfig {
  return {
    role,
    model: DEFAULT_MODEL,
    maxTokens: HIGH_TOKEN_ROLES.has(role) ? 16384 : 8192,
    temperature: ROLE_TEMPERATURE[role] ?? 0,
    systemPrompt,
    toolGroups: [],
    memoryScope: 'project',
    permissions: { allowed: [], denied: [] },
  };
}
