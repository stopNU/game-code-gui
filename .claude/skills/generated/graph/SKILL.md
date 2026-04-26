---
name: graph
description: "Skill for the Graph area of game-code-gui. 28 symbols across 6 files."
---

# Graph

28 symbols | 6 files | Cohesion: 89%

## When to Use

- Working with code in `packages/`
- Understanding how runAgentLoop, toLC, toLCTools work
- Modifying graph-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/core/src/loop/agent-loop.ts` | runAgentLoop, windowMessages, getTextContent, compressReadFileResult, lcToClaudeMessage (+1) |
| `packages/core/src/graph/stall-detector.ts` | createStallState, checkRepeatStall, checkWriteStall, recordToolWrite, checkTypecheckStall (+1) |
| `packages/core/src/graph/agent-graph.ts` | createAgentGraph, buildReActGraph, buildSimpleGraph, invoke, agentNode |
| `packages/core/src/graph/models.ts` | maxTokensForRole, temperatureForRole, providerOf, createChatModel |
| `packages/core/src/graph/codex-chat-model.ts` | CodexChatModel, _generate, ensureCodexAuth, extractTextDelta |
| `packages/core/src/graph/tools-adapter.ts` | jsonSchemaToZod, toLC, toLCTools |

## Entry Points

Start here when exploring this area:

- **`runAgentLoop`** (Function) — `packages/core/src/loop/agent-loop.ts:24`
- **`toLC`** (Function) — `packages/core/src/graph/tools-adapter.ts:65`
- **`toLCTools`** (Function) — `packages/core/src/graph/tools-adapter.ts:93`
- **`createStallState`** (Function) — `packages/core/src/graph/stall-detector.ts:13`
- **`checkRepeatStall`** (Function) — `packages/core/src/graph/stall-detector.ts:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CodexChatModel` | Class | `packages/core/src/graph/codex-chat-model.ts` | 32 |
| `runAgentLoop` | Function | `packages/core/src/loop/agent-loop.ts` | 24 |
| `toLC` | Function | `packages/core/src/graph/tools-adapter.ts` | 65 |
| `toLCTools` | Function | `packages/core/src/graph/tools-adapter.ts` | 93 |
| `createStallState` | Function | `packages/core/src/graph/stall-detector.ts` | 13 |
| `checkRepeatStall` | Function | `packages/core/src/graph/stall-detector.ts` | 27 |
| `checkWriteStall` | Function | `packages/core/src/graph/stall-detector.ts` | 46 |
| `recordToolWrite` | Function | `packages/core/src/graph/stall-detector.ts` | 69 |
| `checkTypecheckStall` | Function | `packages/core/src/graph/stall-detector.ts` | 82 |
| `createChatModel` | Function | `packages/core/src/graph/models.ts` | 25 |
| `createAgentGraph` | Function | `packages/core/src/graph/agent-graph.ts` | 34 |
| `_generate` | Method | `packages/core/src/graph/codex-chat-model.ts` | 52 |
| `invoke` | Method | `packages/core/src/graph/agent-graph.ts` | 22 |
| `windowMessages` | Function | `packages/core/src/loop/agent-loop.ts` | 238 |
| `getTextContent` | Function | `packages/core/src/loop/agent-loop.ts` | 254 |
| `compressReadFileResult` | Function | `packages/core/src/loop/agent-loop.ts` | 265 |
| `lcToClaudeMessage` | Function | `packages/core/src/loop/agent-loop.ts` | 294 |
| `cancelled` | Function | `packages/core/src/loop/agent-loop.ts` | 301 |
| `jsonSchemaToZod` | Function | `packages/core/src/graph/tools-adapter.ts` | 4 |
| `stableStringify` | Function | `packages/core/src/graph/stall-detector.ts` | 105 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `VerifyAndRepair → ProviderOf` | cross_community | 5 |
| `VerifyAndRepair → TemperatureForRole` | cross_community | 5 |
| `VerifyAndRepair → MaxTokensForRole` | cross_community | 5 |
| `VerifyAndRepair → CodexChatModel` | cross_community | 5 |
| `RunTypecheckFixPass → JsonSchemaToZod` | cross_community | 5 |
| `RunTypecheckFixPass → BuildAssetPlanningContext` | cross_community | 5 |
| `RunTypecheckFixPass → BuildRuntimeAuthorityContext` | cross_community | 5 |
| `VerifyAndRepair → CreateStallState` | cross_community | 4 |
| `CreateAgentGraph → ProviderOf` | intra_community | 3 |
| `CreateAgentGraph → TemperatureForRole` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Loop | 1 calls |

## How to Explore

1. `gitnexus_context({name: "runAgentLoop"})` — see callers and callees
2. `gitnexus_query({query: "graph"})` — find related execution flows
3. Read key files listed above for implementation details
