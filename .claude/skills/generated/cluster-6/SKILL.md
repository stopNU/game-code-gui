---
name: cluster-6
description: "Skill for the Cluster_6 area of game-code-gui. 7 symbols across 2 files."
---

# Cluster_6

7 symbols | 2 files | Cohesion: 84%

## When to Use

- Working with code in `packages/`
- Understanding how makeWriteQueue, runTasksParallel, allTasksList work
- Modifying cluster_6-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/services/src/implement-task-scheduler.ts` | runTasksParallel, allTasksList, phaseTasks, getReady, allSettled (+1) |
| `packages/services/src/implement-task-shared.ts` | makeWriteQueue |

## Entry Points

Start here when exploring this area:

- **`makeWriteQueue`** (Function) — `packages/services/src/implement-task-shared.ts:27`
- **`runTasksParallel`** (Function) — `packages/services/src/implement-task-scheduler.ts:20`
- **`allTasksList`** (Function) — `packages/services/src/implement-task-scheduler.ts:29`
- **`phaseTasks`** (Function) — `packages/services/src/implement-task-scheduler.ts:30`
- **`getReady`** (Function) — `packages/services/src/implement-task-scheduler.ts:47`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `makeWriteQueue` | Function | `packages/services/src/implement-task-shared.ts` | 27 |
| `runTasksParallel` | Function | `packages/services/src/implement-task-scheduler.ts` | 20 |
| `allTasksList` | Function | `packages/services/src/implement-task-scheduler.ts` | 29 |
| `phaseTasks` | Function | `packages/services/src/implement-task-scheduler.ts` | 30 |
| `getReady` | Function | `packages/services/src/implement-task-scheduler.ts` | 47 |
| `allSettled` | Function | `packages/services/src/implement-task-scheduler.ts` | 57 |
| `waitSlot` | Function | `packages/services/src/implement-task-scheduler.ts` | 94 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ImplementTask → AllTasksList` | cross_community | 5 |
| `ImplementTask → Run` | cross_community | 5 |
| `RunTasksParallel → MapRow` | cross_community | 5 |
| `RunTasksParallel → ForTask` | cross_community | 5 |
| `RunTasksParallel → AttachGameSpecContext` | cross_community | 5 |
| `RunTasksParallel → Run` | cross_community | 5 |
| `ImplementTask → CreateSchedulerFailureResult` | cross_community | 4 |
| `RunTasksParallel → Persist` | cross_community | 4 |
| `RunTasksParallel → Tracer` | cross_community | 4 |
| `RunTasksParallel → DefaultAgentConfig` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Repositories | 1 calls |

## How to Explore

1. `gitnexus_context({name: "makeWriteQueue"})` — see callers and callees
2. `gitnexus_query({query: "cluster_6"})` — find related execution flows
3. Read key files listed above for implementation details
