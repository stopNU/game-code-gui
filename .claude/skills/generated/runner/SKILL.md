---
name: runner
description: "Skill for the Runner area of game-code-gui. 12 symbols across 1 files."
---

# Runner

12 symbols | 1 files | Cohesion: 77%

## When to Use

- Working with code in `packages/`
- Understanding how verifyProject work
- Modifying runner-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/playtest/src/runner/project-verifier.ts` | verifyProject, buildSceneInspectionVerification, buildFlowVerification, emptySceneBindingValidation, emptyAutoloadValidation (+7) |

## Entry Points

Start here when exploring this area:

- **`verifyProject`** (Function) — `packages/playtest/src/runner/project-verifier.ts:33`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `verifyProject` | Function | `packages/playtest/src/runner/project-verifier.ts` | 33 |
| `buildSceneInspectionVerification` | Function | `packages/playtest/src/runner/project-verifier.ts` | 128 |
| `buildFlowVerification` | Function | `packages/playtest/src/runner/project-verifier.ts` | 188 |
| `emptySceneBindingValidation` | Function | `packages/playtest/src/runner/project-verifier.ts` | 236 |
| `emptyAutoloadValidation` | Function | `packages/playtest/src/runner/project-verifier.ts` | 246 |
| `readCriticalFlowConfig` | Function | `packages/playtest/src/runner/project-verifier.ts` | 269 |
| `buildMilestoneSceneVerification` | Function | `packages/playtest/src/runner/project-verifier.ts` | 283 |
| `evaluateMilestoneCriterion` | Function | `packages/playtest/src/runner/project-verifier.ts` | 331 |
| `buildStartupVerification` | Function | `packages/playtest/src/runner/project-verifier.ts` | 149 |
| `buildUiVerification` | Function | `packages/playtest/src/runner/project-verifier.ts` | 215 |
| `readFlowMessages` | Function | `packages/playtest/src/runner/project-verifier.ts` | 256 |
| `readUiMessages` | Function | `packages/playtest/src/runner/project-verifier.ts` | 265 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `VerifyProjectCmd → GodotBin` | cross_community | 4 |
| `VerifyProjectCmd → BuildSceneInspectionVerification` | cross_community | 3 |
| `VerifyProjectCmd → EmptySceneBindingValidation` | cross_community | 3 |
| `VerifyProjectCmd → EmptyAutoloadValidation` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Commands | 1 calls |

## How to Explore

1. `gitnexus_context({name: "verifyProject"})` — see callers and callees
2. `gitnexus_query({query: "runner"})` — find related execution flows
3. Read key files listed above for implementation details
