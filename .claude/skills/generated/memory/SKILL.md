---
name: memory
description: "Skill for the Memory area of game-code-gui. 21 symbols across 3 files."
---

# Memory

21 symbols | 3 files | Cohesion: 86%

## When to Use

- Working with code in `packages/`
- Understanding how prepareTaskContext, resolveReconciliationReportFile, loadMemoryStore work
- Modifying memory-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/services/src/implement-task-context.ts` | prepareTaskContext, attachGameSpecContext, attachArchitectureContext, attachAdvancedContext, attachRuntimeManifestContext (+5) |
| `packages/core/src/memory/memory-store.ts` | forTask, MemoryStore, set, get, dependencySummaries (+4) |
| `packages/services/src/implement-task-shared.ts` | loadMemoryStore, persistTaskSummary |

## Entry Points

Start here when exploring this area:

- **`prepareTaskContext`** (Function) — `packages/services/src/implement-task-context.ts:25`
- **`resolveReconciliationReportFile`** (Function) — `packages/services/src/implement-task-context.ts:198`
- **`loadMemoryStore`** (Function) — `packages/services/src/implement-task-shared.ts:35`
- **`persistTaskSummary`** (Function) — `packages/services/src/implement-task-shared.ts:49`
- **`MemoryStore`** (Class) — `packages/core/src/memory/memory-store.ts:4`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `MemoryStore` | Class | `packages/core/src/memory/memory-store.ts` | 4 |
| `prepareTaskContext` | Function | `packages/services/src/implement-task-context.ts` | 25 |
| `resolveReconciliationReportFile` | Function | `packages/services/src/implement-task-context.ts` | 198 |
| `loadMemoryStore` | Function | `packages/services/src/implement-task-shared.ts` | 35 |
| `persistTaskSummary` | Function | `packages/services/src/implement-task-shared.ts` | 49 |
| `forTask` | Method | `packages/core/src/memory/memory-store.ts` | 68 |
| `set` | Method | `packages/core/src/memory/memory-store.ts` | 12 |
| `get` | Method | `packages/core/src/memory/memory-store.ts` | 32 |
| `dependencySummaries` | Method | `packages/core/src/memory/memory-store.ts` | 92 |
| `setTaskSummary` | Method | `packages/core/src/memory/memory-store.ts` | 107 |
| `delete` | Method | `packages/core/src/memory/memory-store.ts` | 125 |
| `toFile` | Method | `packages/core/src/memory/memory-store.ts` | 129 |
| `fromFile` | Method | `packages/core/src/memory/memory-store.ts` | 138 |
| `attachGameSpecContext` | Function | `packages/services/src/implement-task-context.ts` | 53 |
| `attachArchitectureContext` | Function | `packages/services/src/implement-task-context.ts` | 86 |
| `attachAdvancedContext` | Function | `packages/services/src/implement-task-context.ts` | 102 |
| `attachRuntimeManifestContext` | Function | `packages/services/src/implement-task-context.ts` | 119 |
| `attachReconciliationReportContext` | Function | `packages/services/src/implement-task-context.ts` | 130 |
| `toProjectFileReference` | Function | `packages/services/src/implement-task-context.ts` | 220 |
| `appendRelevantFile` | Function | `packages/services/src/implement-task-context.ts` | 233 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunTask → Delete` | cross_community | 7 |
| `PersistTaskSummary → Delete` | intra_community | 6 |
| `RunTasksParallel → ForTask` | cross_community | 5 |
| `RunTasksParallel → AttachGameSpecContext` | cross_community | 5 |
| `RunTask → MemoryStore` | cross_community | 5 |
| `RunOne → MemoryStore` | cross_community | 5 |
| `PersistTaskSummary → MemoryStore` | intra_community | 4 |
| `AttachReconciliationReportContext → ToProjectFileReference` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_13 | 1 calls |
| Cluster_14 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "prepareTaskContext"})` — see callers and callees
2. `gitnexus_query({query: "memory"})` — find related execution flows
3. Read key files listed above for implementation details
