---
name: commands
description: "Skill for the Commands area of game-code-gui. 35 symbols across 22 files."
---

# Commands

35 symbols | 22 files | Cohesion: 78%

## When to Use

- Working with code in `apps/`
- Understanding how scaffoldPlanService, planGameService, formatTokenCount work
- Modifying commands-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/cli/src/commands/new-game.ts` | newGame, verifyAndFix, collectAllTasks, findTask |
| `apps/cli/src/utils/output.ts` | spinner, printTable, printSection |
| `apps/cli/src/utils/config-loader.ts` | loadHarnessConfig, loadTasksJson, saveTasksJson |
| `packages/services/src/plan-game.ts` | planGameService, scaffoldProject |
| `packages/services/src/implement-task-shared.ts` | formatTokenCount, formatTokenBreakdownLines |
| `packages/playtest/src/runner/playtest-runner.ts` | godotBin, runPlaytest |
| `packages/evals/src/runner/eval-runner.ts` | checkCIThresholds, buildRegressionReport |
| `apps/cli/src/utils/project-name.ts` | slugifyProjectName, resolveProjectOutputPath |
| `apps/cli/src/commands/runtime-log.ts` | runtimeLogCmd, parseMode |
| `packages/services/src/scaffold-plan.ts` | scaffoldPlanService |

## Entry Points

Start here when exploring this area:

- **`scaffoldPlanService`** (Function) — `packages/services/src/scaffold-plan.ts:13`
- **`planGameService`** (Function) — `packages/services/src/plan-game.ts:18`
- **`formatTokenCount`** (Function) — `packages/services/src/implement-task-shared.ts:119`
- **`formatTokenBreakdownLines`** (Function) — `packages/services/src/implement-task-shared.ts:123`
- **`installDeps`** (Function) — `packages/tools/src/npm/install-deps.ts:60`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `scaffoldPlanService` | Function | `packages/services/src/scaffold-plan.ts` | 13 |
| `planGameService` | Function | `packages/services/src/plan-game.ts` | 18 |
| `formatTokenCount` | Function | `packages/services/src/implement-task-shared.ts` | 119 |
| `formatTokenBreakdownLines` | Function | `packages/services/src/implement-task-shared.ts` | 123 |
| `installDeps` | Function | `packages/tools/src/npm/install-deps.ts` | 60 |
| `runPlaytest` | Function | `packages/playtest/src/runner/playtest-runner.ts` | 41 |
| `checkCIThresholds` | Function | `packages/evals/src/runner/eval-runner.ts` | 152 |
| `buildRegressionReport` | Function | `packages/evals/src/runner/eval-runner.ts` | 235 |
| `generateAllContentArt` | Function | `packages/assets/src/pipeline/content-art-generator.ts` | 161 |
| `slugifyProjectName` | Function | `apps/cli/src/utils/project-name.ts` | 2 |
| `resolveProjectOutputPath` | Function | `apps/cli/src/utils/project-name.ts` | 14 |
| `spinner` | Function | `apps/cli/src/utils/output.ts` | 13 |
| `printTable` | Function | `apps/cli/src/utils/output.ts` | 17 |
| `printSection` | Function | `apps/cli/src/utils/output.ts` | 33 |
| `loadHarnessConfig` | Function | `apps/cli/src/utils/config-loader.ts` | 9 |
| `loadTasksJson` | Function | `apps/cli/src/utils/config-loader.ts` | 27 |
| `saveTasksJson` | Function | `apps/cli/src/utils/config-loader.ts` | 32 |
| `verifyProjectCmd` | Function | `apps/cli/src/commands/verify-project.ts` | 11 |
| `scaffoldPlan` | Function | `apps/cli/src/commands/scaffold-plan.ts` | 11 |
| `runtimeLogCmd` | Function | `apps/cli/src/commands/runtime-log.ts` | 10 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `NewGame → Get` | cross_community | 9 |
| `PlanFeature → Get` | cross_community | 9 |
| `PlanFeature → CanRequesterStop` | cross_community | 9 |
| `RunPlaytestCmd → Get` | cross_community | 9 |
| `PlanGame → Get` | cross_community | 9 |
| `ReconcileRuntimeCmd → Get` | cross_community | 9 |
| `ReconcileRuntimeCmd → CanRequesterStop` | cross_community | 9 |
| `NewGame → Rotate` | cross_community | 8 |
| `NewGame → Enqueue` | cross_community | 8 |
| `NewGame → EmitStatus` | cross_community | 8 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Types | 4 calls |
| Loop | 3 calls |
| Scaffold | 2 calls |
| Pipeline | 2 calls |
| Graph | 1 calls |
| Services | 1 calls |
| Runner | 1 calls |
| Layers | 1 calls |

## How to Explore

1. `gitnexus_context({name: "scaffoldPlanService"})` — see callers and callees
2. `gitnexus_query({query: "commands"})` — find related execution flows
3. Read key files listed above for implementation details
