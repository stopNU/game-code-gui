---
name: layers
description: "Skill for the Layers area of game-code-gui. 18 symbols across 8 files."
---

# Layers

18 symbols | 8 files | Cohesion: 82%

## When to Use

- Working with code in `packages/`
- Understanding how runEvals, buildReport, runFunctionalEval work
- Modifying layers-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/evals/src/layers/systems-eval.ts` | getRequiredRuntimeScenes, getDeclaredAutoloads, runSystemsEval, buildScriptReferenceAudit, addActiveOwner (+1) |
| `packages/evals/src/runner/eval-runner.ts` | runEvals, buildReport, evalResultToScoreResult |
| `packages/evals/src/layers/functional-eval.ts` | runFunctionalEval, readVisibilityIssues |
| `packages/evals/src/layers/deckbuilder-eval.ts` | readContentFile, runDeckbuilderEval |
| `packages/evals/src/layers/build-eval.ts` | runBuildEval, buildScoreResult |
| `packages/services/src/implement-task-repair.ts` | runSelectedEvals |
| `packages/evals/src/layers/design-eval.ts` | runDesignEval |
| `packages/evals/src/layers/data-eval.ts` | runDataEval |

## Entry Points

Start here when exploring this area:

- **`runEvals`** (Function) — `packages/evals/src/runner/eval-runner.ts:28`
- **`buildReport`** (Function) — `packages/evals/src/runner/eval-runner.ts:111`
- **`runFunctionalEval`** (Function) — `packages/evals/src/layers/functional-eval.ts:4`
- **`runDesignEval`** (Function) — `packages/evals/src/layers/design-eval.ts:7`
- **`runDeckbuilderEval`** (Function) — `packages/evals/src/layers/deckbuilder-eval.ts:27`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `runEvals` | Function | `packages/evals/src/runner/eval-runner.ts` | 28 |
| `buildReport` | Function | `packages/evals/src/runner/eval-runner.ts` | 111 |
| `runFunctionalEval` | Function | `packages/evals/src/layers/functional-eval.ts` | 4 |
| `runDesignEval` | Function | `packages/evals/src/layers/design-eval.ts` | 7 |
| `runDeckbuilderEval` | Function | `packages/evals/src/layers/deckbuilder-eval.ts` | 27 |
| `runDataEval` | Function | `packages/evals/src/layers/data-eval.ts` | 5 |
| `runBuildEval` | Function | `packages/evals/src/layers/build-eval.ts` | 10 |
| `runSystemsEval` | Function | `packages/evals/src/layers/systems-eval.ts` | 158 |
| `runSelectedEvals` | Function | `packages/services/src/implement-task-repair.ts` | 235 |
| `evalResultToScoreResult` | Function | `packages/evals/src/runner/eval-runner.ts` | 220 |
| `readVisibilityIssues` | Function | `packages/evals/src/layers/functional-eval.ts` | 64 |
| `readContentFile` | Function | `packages/evals/src/layers/deckbuilder-eval.ts` | 15 |
| `buildScoreResult` | Function | `packages/evals/src/layers/build-eval.ts` | 88 |
| `getRequiredRuntimeScenes` | Function | `packages/evals/src/layers/systems-eval.ts` | 92 |
| `getDeclaredAutoloads` | Function | `packages/evals/src/layers/systems-eval.ts` | 115 |
| `buildScriptReferenceAudit` | Function | `packages/evals/src/layers/systems-eval.ts` | 300 |
| `addActiveOwner` | Function | `packages/evals/src/layers/systems-eval.ts` | 366 |
| `formatScriptReferenceAudit` | Function | `packages/evals/src/layers/systems-eval.ts` | 380 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunEvalRepairPass → MapRow` | cross_community | 7 |
| `RunEvalsCmd → MapRow` | cross_community | 6 |
| `RunEvalRepairPass → GodotBin` | cross_community | 6 |
| `RunEvalRepairPass → Run` | cross_community | 6 |
| `RunSystemsEval → MapRow` | cross_community | 6 |
| `RunEvalsCmd → GodotBin` | cross_community | 5 |
| `RunEvalsCmd → Run` | cross_community | 5 |
| `RunEvalRepairPass → BuildScoreResult` | cross_community | 5 |
| `RunEvalRepairPass → ReadVisibilityIssues` | cross_community | 5 |
| `RunSystemsEval → Run` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Repositories | 2 calls |
| Commands | 1 calls |

## How to Explore

1. `gitnexus_context({name: "runEvals"})` — see callers and callees
2. `gitnexus_query({query: "layers"})` — find related execution flows
3. Read key files listed above for implementation details
