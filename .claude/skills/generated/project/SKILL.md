---
name: project
description: "Skill for the Project area of game-code-gui. 8 symbols across 2 files."
---

# Project

8 symbols | 2 files | Cohesion: 59%

## When to Use

- Working with code in `apps/`
- Understanding how resolveConversationConfig, handleRunTask, handleRunPhase work
- Modifying project-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/src/components/project/task-plan-card.tsx` | getTaskLabel, handleRunTask, handleRunPhase, getTaskStatus, PhaseSection (+2) |
| `apps/studio/src/lib/conversation-defaults.ts` | resolveConversationConfig |

## Entry Points

Start here when exploring this area:

- **`resolveConversationConfig`** (Function) — `apps/studio/src/lib/conversation-defaults.ts:38`
- **`handleRunTask`** (Function) — `apps/studio/src/components/project/task-plan-card.tsx:319`
- **`handleRunPhase`** (Function) — `apps/studio/src/components/project/task-plan-card.tsx:343`
- **`TaskPlanCard`** (Function) — `apps/studio/src/components/project/task-plan-card.tsx:249`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `resolveConversationConfig` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 38 |
| `handleRunTask` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 319 |
| `handleRunPhase` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 343 |
| `TaskPlanCard` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 249 |
| `getTaskLabel` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 42 |
| `getTaskStatus` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 27 |
| `PhaseSection` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 54 |
| `TaskPlanModal` | Function | `apps/studio/src/components/project/task-plan-card.tsx` | 138 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleRunPhase → GetDefaultConversationTitle` | cross_community | 4 |
| `HandleRunPhase → GetDefaultModelForProvider` | cross_community | 4 |
| `HandleRunTask → GetDefaultConversationTitle` | cross_community | 4 |
| `HandleRunTask → GetDefaultModelForProvider` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Harness | 3 calls |
| Layout | 1 calls |

## How to Explore

1. `gitnexus_context({name: "resolveConversationConfig"})` — see callers and callees
2. `gitnexus_query({query: "project"})` — find related execution flows
3. Read key files listed above for implementation details
