// Types  (MODELS + ModelId are included via export *)
export * from './types/agent.js';
export * from './types/task.js';
export { normalizeTaskPlan } from './types/task.js';
export * from './types/tool.js';
export * from './types/trace.js';
export * from './types/memory.js';
export * from './types/permissions.js';

// Claude client (now backed by ChatAnthropic — LangSmith auto-traces when LANGSMITH_API_KEY is set)
export { ClaudeClient } from './claude/client.js';
export type { SendMessageOptions, SendMessageResult } from './claude/client.js';

// LangChain graph layer
export { createAgentGraph } from './graph/agent-graph.js';
export { createChatModel } from './graph/models.js';
export { toLCTools, toLC } from './graph/tools-adapter.js';
export { CodexChatModel } from './graph/codex-chat-model.js';

// Agent roles
export { ASSET_SYSTEM_PROMPT } from './claude/roles/asset.js';
export { QA_SYSTEM_PROMPT } from './claude/roles/qa.js';
export { EVALUATOR_SYSTEM_PROMPT } from './claude/roles/evaluator.js';
export { BRIEF_ANALYST_SYSTEM_PROMPT } from './claude/roles/brief-analyst.js';
export { ADVANCED_DESIGNER_SYSTEM_PROMPT } from './claude/roles/advanced-designer.js';
export { ADVANCED_GAMEPLAY_SYSTEM_PROMPT } from './claude/roles/advanced-gameplay.js';
export { SYSTEMS_SYSTEM_PROMPT } from './claude/roles/systems.js';
export { INTEGRATION_VERIFIER_SYSTEM_PROMPT } from './claude/roles/integration-verifier.js';
export { BALANCE_SYSTEM_PROMPT } from './claude/roles/balance.js';
export { getSystemPrompt, detectNPCs, buildPrompt, SHARED_DISCIPLINE } from './claude/roles/index.js';
export type { SystemPromptOptions } from './claude/roles/index.js';

// Loop
export { runAgentLoop } from './loop/agent-loop.js';
export { runCodexLoop } from './loop/codex-loop.js';
export type { AgentLoopDeps } from './loop/agent-loop.js';
export { withRetry } from './loop/retry.js';
export { decomposeTasks } from './loop/planner.js';
export {
  planIteration,
  appendIterationTasks,
  nextFeaturePhase,
  readLatestEvalFailures,
  BUG_PHASE,
  FEATURE_PHASE,
  FEATURE_PHASE_BASE,
} from './loop/iterate.js';
export type {
  IterationType,
  PlanIterationOptions,
  AppendIterationOptions,
  AppendIterationResult,
} from './loop/iterate.js';
export { preprocessBrief } from './loop/brief-preprocessor.js';
export type { PreprocessedBrief, BriefSection, StateMachineDef } from './loop/brief-preprocessor.js';
export { createAdvancedPlan } from './loop/advanced-planner.js';
export { validateTaskPlan } from './loop/plan-validation.js';
export { extractJson, extractText } from './loop/extract.js';

// Memory
export { MemoryStore } from './memory/memory-store.js';

// Tracing
export { Tracer } from './tracing/tracer.js';
