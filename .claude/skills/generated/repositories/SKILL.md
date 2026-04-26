---
name: repositories
description: "Skill for the Repositories area of game-code-gui. 46 symbols across 12 files."
---

# Repositories

46 symbols | 12 files | Cohesion: 81%

## When to Use

- Working with code in `apps/`
- Understanding how readPragmaValue, runMigrations, openStudioDatabase work
- Modifying repositories-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/electron/db/repositories/conversations-repository.ts` | delete, deleteAll, getMessages, createMessage, ConversationsRepository (+6) |
| `apps/studio/electron/db/repositories/approvals-repository.ts` | mapApprovalRow, getById, create, findReusableDecision, decide (+2) |
| `apps/studio/electron/db/repositories/projects-repository.ts` | ProjectsRepository, mapProjectRow, mapProjectWithPlanRow, getById, getByNormalizedPath (+1) |
| `apps/studio/electron/db/repositories/task-plans-repository.ts` | mapTaskPlanRow, getByProjectId, upsert, TaskPlansRepository |
| `apps/studio/electron/db/repositories/settings-repository.ts` | get, set, delete, SettingsRepository |
| `apps/studio/electron/db/repositories/conversation-tokens-repository.ts` | ConversationTokensRepository, mapRow, getByConversationId, add |
| `packages/services/src/implement-task-scheduler.ts` | blockDependents, runOne, createSchedulerFailureResult |
| `apps/studio/electron/db/migration-runner.ts` | readPragmaValue, runMigrations |
| `apps/studio/electron/agent/conversation-agent.ts` | parseImplementTaskIntents, parseImplementTaskIntent |
| `apps/cli/src/index.ts` | run |

## Entry Points

Start here when exploring this area:

- **`readPragmaValue`** (Function) — `apps/studio/electron/db/migration-runner.ts:6`
- **`runMigrations`** (Function) — `apps/studio/electron/db/migration-runner.ts:16`
- **`openStudioDatabase`** (Function) — `apps/studio/electron/db/index.ts:22`
- **`blockDependents`** (Function) — `packages/services/src/implement-task-scheduler.ts:62`
- **`runOne`** (Function) — `packages/services/src/implement-task-scheduler.ts:99`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `TaskPlansRepository` | Class | `apps/studio/electron/db/repositories/task-plans-repository.ts` | 22 |
| `SettingsRepository` | Class | `apps/studio/electron/db/repositories/settings-repository.ts` | 12 |
| `ProjectsRepository` | Class | `apps/studio/electron/db/repositories/projects-repository.ts` | 50 |
| `ConversationsRepository` | Class | `apps/studio/electron/db/repositories/conversations-repository.ts` | 73 |
| `ConversationTokensRepository` | Class | `apps/studio/electron/db/repositories/conversation-tokens-repository.ts` | 25 |
| `ApprovalsRepository` | Class | `apps/studio/electron/db/repositories/approvals-repository.ts` | 58 |
| `readPragmaValue` | Function | `apps/studio/electron/db/migration-runner.ts` | 6 |
| `runMigrations` | Function | `apps/studio/electron/db/migration-runner.ts` | 16 |
| `openStudioDatabase` | Function | `apps/studio/electron/db/index.ts` | 22 |
| `blockDependents` | Function | `packages/services/src/implement-task-scheduler.ts` | 62 |
| `runOne` | Function | `packages/services/src/implement-task-scheduler.ts` | 99 |
| `parseImplementTaskIntents` | Function | `apps/studio/electron/agent/conversation-agent.ts` | 817 |
| `parseImplementTaskIntent` | Function | `apps/studio/electron/agent/conversation-agent.ts` | 844 |
| `getByProjectId` | Method | `apps/studio/electron/db/repositories/task-plans-repository.ts` | 39 |
| `upsert` | Method | `apps/studio/electron/db/repositories/task-plans-repository.ts` | 44 |
| `get` | Method | `apps/studio/electron/db/repositories/settings-repository.ts` | 29 |
| `set` | Method | `apps/studio/electron/db/repositories/settings-repository.ts` | 34 |
| `delete` | Method | `apps/studio/electron/db/repositories/settings-repository.ts` | 44 |
| `delete` | Method | `apps/studio/electron/db/repositories/conversations-repository.ts` | 195 |
| `deleteAll` | Method | `apps/studio/electron/db/repositories/conversations-repository.ts` | 199 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunEvalRepairPass → MapRow` | cross_community | 7 |
| `RunEvalsCmd → MapRow` | cross_community | 6 |
| `RunEvalRepairPass → Run` | cross_community | 6 |
| `ScaffoldPlanService → MapRow` | cross_community | 6 |
| `RunSystemsEval → MapRow` | cross_community | 6 |
| `InflateAdvancedPlan → MapRow` | cross_community | 6 |
| `ValidateTaskPlan → MapRow` | cross_community | 6 |
| `AttachRelevantFileContext → MapRow` | cross_community | 6 |
| `ScaffoldProject → MapRow` | cross_community | 6 |
| `RunCodexConversation → MapRow` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cluster_6 | 1 calls |
| Types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "readPragmaValue"})` — see callers and callees
2. `gitnexus_query({query: "repositories"})` — find related execution flows
3. Read key files listed above for implementation details
