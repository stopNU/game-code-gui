---
name: types
description: "Skill for the Types area of game-code-gui. 15 symbols across 6 files."
---

# Types

15 symbols | 6 files | Cohesion: 72%

## When to Use

- Working with code in `packages/`
- Understanding how normalizeTaskPlan, rolePrompt, runTask work
- Modifying types-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/core/src/types/task.ts` | isRecord, toStringArray, toFiniteNumber, defaultToolsForRole, normalizeTaskContext (+3) |
| `packages/services/src/implement-task-runner.ts` | runTask, persist |
| `packages/core/src/types/agent.ts` | getModelProvider, defaultAgentConfig |
| `packages/services/src/implement-task-shared.ts` | rolePrompt |
| `packages/core/src/tracing/tracer.ts` | Tracer |
| `packages/core/src/claude/roles/index.ts` | detectNPCs |

## Entry Points

Start here when exploring this area:

- **`normalizeTaskPlan`** (Function) — `packages/core/src/types/task.ts:853`
- **`rolePrompt`** (Function) — `packages/services/src/implement-task-shared.ts:20`
- **`runTask`** (Function) — `packages/services/src/implement-task-runner.ts:28`
- **`persist`** (Function) — `packages/services/src/implement-task-runner.ts:49`
- **`getModelProvider`** (Function) — `packages/core/src/types/agent.ts:129`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Tracer` | Class | `packages/core/src/tracing/tracer.ts` | 5 |
| `normalizeTaskPlan` | Function | `packages/core/src/types/task.ts` | 853 |
| `rolePrompt` | Function | `packages/services/src/implement-task-shared.ts` | 20 |
| `runTask` | Function | `packages/services/src/implement-task-runner.ts` | 28 |
| `persist` | Function | `packages/services/src/implement-task-runner.ts` | 49 |
| `getModelProvider` | Function | `packages/core/src/types/agent.ts` | 129 |
| `defaultAgentConfig` | Function | `packages/core/src/types/agent.ts` | 169 |
| `detectNPCs` | Function | `packages/core/src/claude/roles/index.ts` | 30 |
| `isRecord` | Function | `packages/core/src/types/task.ts` | 671 |
| `toStringArray` | Function | `packages/core/src/types/task.ts` | 675 |
| `toFiniteNumber` | Function | `packages/core/src/types/task.ts` | 683 |
| `defaultToolsForRole` | Function | `packages/core/src/types/task.ts` | 687 |
| `normalizeTaskContext` | Function | `packages/core/src/types/task.ts` | 708 |
| `normalizeTaskResult` | Function | `packages/core/src/types/task.ts` | 770 |
| `normalizeTaskState` | Function | `packages/core/src/types/task.ts` | 804 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunTask → Delete` | cross_community | 7 |
| `ImplementTask → IsRecord` | cross_community | 5 |
| `ImplementTask → ToStringArray` | cross_community | 5 |
| `RunTasksParallel → ForTask` | cross_community | 5 |
| `RunTasksParallel → AttachGameSpecContext` | cross_community | 5 |
| `RunTask → MemoryStore` | cross_community | 5 |
| `RunOne → MemoryStore` | cross_community | 5 |
| `ScaffoldPlan → IsRecord` | cross_community | 5 |
| `ScaffoldPlan → ToStringArray` | cross_community | 5 |
| `ScaffoldPlan → DefaultToolsForRole` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Memory | 2 calls |
| Cluster_8 | 2 calls |
| Roles | 1 calls |
| Loop | 1 calls |
| Graph | 1 calls |

## How to Explore

1. `gitnexus_context({name: "normalizeTaskPlan"})` — see callers and callees
2. `gitnexus_query({query: "types"})` — find related execution flows
3. Read key files listed above for implementation details
