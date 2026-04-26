---
name: loop
description: "Skill for the Loop area of game-code-gui. 66 symbols across 11 files."
---

# Loop

66 symbols | 11 files | Cohesion: 75%

## When to Use

- Working with code in `packages/`
- Understanding how decomposeTasks, planIteration, extractText work
- Modifying loop-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/core/src/loop/advanced-planner.ts` | parseDesignerResponse, buildContextBlock, createAdvancedPlan, invoke, withStructuredOutput (+14) |
| `packages/core/src/loop/codex-loop.ts` | runCodexLoop, handleToolEvent, handleTextEvent, getTextState, normalizeUnknownRecord (+3) |
| `packages/core/src/loop/brief-preprocessor.ts` | briefCacheKey, readBriefCache, writeBriefCache, preprocessBrief, wasTruncated (+2) |
| `packages/core/src/loop/extract.ts` | extractText, extractJson, extractJsonCandidates, stripJsonFences, findJsonCandidates (+1) |
| `packages/core/src/loop/retry.ts` | withRetry, sleep, onAbort, throwIfAborted, isAbortError (+1) |
| `packages/core/src/loop/plan-validation.ts` | validateTaskPlan, validateMilestoneScenes, flattenTasks, detectCycles, visit (+1) |
| `packages/core/src/loop/task-prompt.ts` | buildTaskPrompt, buildAnthropicTaskPromptMessage, buildTaskPromptSections, buildAssetPlanningContext, buildRuntimeAuthorityContext |
| `packages/core/src/loop/iterate.ts` | inflateIterationTask, readLatestEvalFailures, planIteration |
| `packages/core/src/claude/client.ts` | ClaudeClient, sendMessage, getTextContent |
| `apps/studio/electron/agent/tool-registry.ts` | buildScaffoldInputFromPlan, buildPlanFromBrief |

## Entry Points

Start here when exploring this area:

- **`decomposeTasks`** (Function) — `packages/core/src/loop/planner.ts:67`
- **`planIteration`** (Function) — `packages/core/src/loop/iterate.ts:137`
- **`extractText`** (Function) — `packages/core/src/loop/extract.ts:98`
- **`preprocessBrief`** (Function) — `packages/core/src/loop/brief-preprocessor.ts:150`
- **`buildScaffoldInputFromPlan`** (Function) — `apps/studio/electron/agent/tool-registry.ts:536`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ClaudeClient` | Class | `packages/core/src/claude/client.ts` | 28 |
| `decomposeTasks` | Function | `packages/core/src/loop/planner.ts` | 67 |
| `planIteration` | Function | `packages/core/src/loop/iterate.ts` | 137 |
| `extractText` | Function | `packages/core/src/loop/extract.ts` | 98 |
| `preprocessBrief` | Function | `packages/core/src/loop/brief-preprocessor.ts` | 150 |
| `buildScaffoldInputFromPlan` | Function | `apps/studio/electron/agent/tool-registry.ts` | 536 |
| `runCodexLoop` | Function | `packages/core/src/loop/codex-loop.ts` | 21 |
| `buildTaskPrompt` | Function | `packages/core/src/loop/task-prompt.ts` | 7 |
| `buildAnthropicTaskPromptMessage` | Function | `packages/core/src/loop/task-prompt.ts` | 12 |
| `withRetry` | Function | `packages/core/src/loop/retry.ts` | 2 |
| `validateTaskPlan` | Function | `packages/core/src/loop/plan-validation.ts` | 2 |
| `extractJson` | Function | `packages/core/src/loop/extract.ts` | 6 |
| `extractJsonCandidates` | Function | `packages/core/src/loop/extract.ts` | 22 |
| `createAdvancedPlan` | Function | `packages/core/src/loop/advanced-planner.ts` | 510 |
| `buildPlanFromBrief` | Function | `apps/studio/electron/agent/tool-registry.ts` | 548 |
| `sendMessage` | Method | `packages/core/src/claude/client.ts` | 38 |
| `invoke` | Method | `packages/core/src/loop/advanced-planner.ts` | 543 |
| `withStructuredOutput` | Method | `packages/core/src/loop/advanced-planner.ts` | 544 |
| `inflateIterationTask` | Function | `packages/core/src/loop/iterate.ts` | 45 |
| `readLatestEvalFailures` | Function | `packages/core/src/loop/iterate.ts` | 81 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `InflateAdvancedPlan → MapRow` | cross_community | 6 |
| `ValidateTaskPlan → MapRow` | cross_community | 6 |
| `RunCodexLoop → BuildAssetPlanningContext` | cross_community | 5 |
| `RunCodexLoop → BuildRuntimeAuthorityContext` | cross_community | 5 |
| `RunCodexLoop → MapRow` | cross_community | 5 |
| `BuildPlanFromBrief → AbortError` | cross_community | 5 |
| `DecomposeTasks → ExtractBalancedJson` | cross_community | 5 |
| `RunTypecheckFixPass → BuildAssetPlanningContext` | cross_community | 5 |
| `RunTypecheckFixPass → BuildRuntimeAuthorityContext` | cross_community | 5 |
| `InflateAdvancedPlan → Run` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Repositories | 4 calls |
| Types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "decomposeTasks"})` — see callers and callees
2. `gitnexus_query({query: "loop"})` — find related execution flows
3. Read key files listed above for implementation details
