---
name: cluster-8
description: "Skill for the Cluster_8 area of game-code-gui. 11 symbols across 2 files."
---

# Cluster_8

11 symbols | 2 files | Cohesion: 82%

## When to Use

- Working with code in `packages/`
- Understanding how buildRepairTask, withTokenBreakdown, mergeTokenBreakdowns work
- Modifying cluster_8-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/services/src/implement-task-repair.ts` | verifyAndRepair, runTypecheckFixPass, runEvalRepairPass, finalizeEvalRepairOutcome, determineEvalLayers (+3) |
| `packages/services/src/implement-task-shared.ts` | buildRepairTask, withTokenBreakdown, mergeTokenBreakdowns |

## Entry Points

Start here when exploring this area:

- **`buildRepairTask`** (Function) — `packages/services/src/implement-task-shared.ts:66`
- **`withTokenBreakdown`** (Function) — `packages/services/src/implement-task-shared.ts:100`
- **`mergeTokenBreakdowns`** (Function) — `packages/services/src/implement-task-shared.ts:111`
- **`verifyAndRepair`** (Function) — `packages/services/src/implement-task-repair.ts:13`
- **`finalizeEvalRepairOutcome`** (Function) — `packages/services/src/implement-task-repair.ts:191`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `buildRepairTask` | Function | `packages/services/src/implement-task-shared.ts` | 66 |
| `withTokenBreakdown` | Function | `packages/services/src/implement-task-shared.ts` | 100 |
| `mergeTokenBreakdowns` | Function | `packages/services/src/implement-task-shared.ts` | 111 |
| `verifyAndRepair` | Function | `packages/services/src/implement-task-repair.ts` | 13 |
| `finalizeEvalRepairOutcome` | Function | `packages/services/src/implement-task-repair.ts` | 191 |
| `runTypecheckFixPass` | Function | `packages/services/src/implement-task-repair.ts` | 35 |
| `runEvalRepairPass` | Function | `packages/services/src/implement-task-repair.ts` | 106 |
| `determineEvalLayers` | Function | `packages/services/src/implement-task-repair.ts` | 219 |
| `summarizeEvalScores` | Function | `packages/services/src/implement-task-repair.ts` | 245 |
| `buildEvalFeedbackBrief` | Function | `packages/services/src/implement-task-repair.ts` | 261 |
| `summarizeEvalFailures` | Function | `packages/services/src/implement-task-repair.ts` | 276 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunEvalRepairPass → MapRow` | cross_community | 7 |
| `RunEvalRepairPass → GodotBin` | cross_community | 6 |
| `RunEvalRepairPass → Run` | cross_community | 6 |
| `RunEvalRepairPass → BuildScoreResult` | cross_community | 5 |
| `RunEvalRepairPass → ReadVisibilityIssues` | cross_community | 5 |
| `VerifyAndRepair → ProviderOf` | cross_community | 5 |
| `VerifyAndRepair → TemperatureForRole` | cross_community | 5 |
| `VerifyAndRepair → MaxTokensForRole` | cross_community | 5 |
| `VerifyAndRepair → CodexChatModel` | cross_community | 5 |
| `VerifyAndRepair → Run` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Graph | 2 calls |
| Layers | 1 calls |
| Repositories | 1 calls |

## How to Explore

1. `gitnexus_context({name: "buildRepairTask"})` — see callers and callees
2. `gitnexus_query({query: "cluster_8"})` — find related execution flows
3. Read key files listed above for implementation details
