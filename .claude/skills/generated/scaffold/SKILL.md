---
name: scaffold
description: "Skill for the Scaffold area of game-code-gui. 10 symbols across 3 files."
---

# Scaffold

10 symbols | 3 files | Cohesion: 86%

## When to Use

- Working with code in `packages/`
- Understanding how selectTemplate, mergeStarterScenes, scaffoldGame work
- Modifying scaffold-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/game-adapter/src/scaffold/scaffolder.ts` | scaffoldGame, scaffoldAdvancedExtras, buildAdvancedSharedContext, buildHandlebarsContext, extractEventTypes (+3) |
| `packages/game-adapter/src/scaffold/template-registry.ts` | selectTemplate |
| `packages/game-adapter/src/scaffold/starter-scenes.ts` | mergeStarterScenes |

## Entry Points

Start here when exploring this area:

- **`selectTemplate`** (Function) — `packages/game-adapter/src/scaffold/template-registry.ts:34`
- **`mergeStarterScenes`** (Function) — `packages/game-adapter/src/scaffold/starter-scenes.ts:7`
- **`scaffoldGame`** (Function) — `packages/game-adapter/src/scaffold/scaffolder.ts:30`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `selectTemplate` | Function | `packages/game-adapter/src/scaffold/template-registry.ts` | 34 |
| `mergeStarterScenes` | Function | `packages/game-adapter/src/scaffold/starter-scenes.ts` | 7 |
| `scaffoldGame` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 30 |
| `scaffoldAdvancedExtras` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 121 |
| `buildAdvancedSharedContext` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 174 |
| `buildHandlebarsContext` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 200 |
| `extractEventTypes` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 227 |
| `buildGameSpec` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 246 |
| `buildArchitectureDoc` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 288 |
| `toKebab` | Function | `packages/game-adapter/src/scaffold/scaffolder.ts` | 324 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ScaffoldPlanService → MapRow` | cross_community | 6 |
| `ScaffoldProject → MapRow` | cross_community | 6 |
| `ScaffoldPlanService → Run` | cross_community | 5 |
| `ScaffoldProject → Run` | cross_community | 5 |
| `ScaffoldPlan → SelectTemplate` | cross_community | 4 |
| `ScaffoldPlan → ToKebab` | cross_community | 4 |
| `ScaffoldPlanService → ExtractEventTypes` | cross_community | 4 |
| `ScaffoldProject → ExtractEventTypes` | cross_community | 4 |
| `ScaffoldProject → SelectTemplate` | cross_community | 3 |
| `ScaffoldProject → ToKebab` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Repositories | 1 calls |

## How to Explore

1. `gitnexus_context({name: "selectTemplate"})` — see callers and callees
2. `gitnexus_query({query: "scaffold"})` — find related execution flows
3. Read key files listed above for implementation details
