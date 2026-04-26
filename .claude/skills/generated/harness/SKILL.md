---
name: harness
description: "Skill for the Harness area of game-code-gui. 7 symbols across 3 files."
---

# Harness

7 symbols | 3 files | Cohesion: 80%

## When to Use

- Working with code in `packages/`
- Understanding how handleGodotStop, RightPanel, getState work
- Modifying harness-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/playtest/src/harness/harness-reader.ts` | getState, waitForScene, waitForSceneInHistory, getGameState, getErrors |
| `apps/studio/src/App.tsx` | handleGodotStop |
| `apps/studio/src/components/layout/right-panel.tsx` | RightPanel |

## Entry Points

Start here when exploring this area:

- **`handleGodotStop`** (Function) — `apps/studio/src/App.tsx:268`
- **`RightPanel`** (Function) — `apps/studio/src/components/layout/right-panel.tsx:24`
- **`getState`** (Method) — `packages/playtest/src/harness/harness-reader.ts:17`
- **`waitForScene`** (Method) — `packages/playtest/src/harness/harness-reader.ts:24`
- **`waitForSceneInHistory`** (Method) — `packages/playtest/src/harness/harness-reader.ts:37`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `handleGodotStop` | Function | `apps/studio/src/App.tsx` | 268 |
| `RightPanel` | Function | `apps/studio/src/components/layout/right-panel.tsx` | 24 |
| `getState` | Method | `packages/playtest/src/harness/harness-reader.ts` | 17 |
| `waitForScene` | Method | `packages/playtest/src/harness/harness-reader.ts` | 24 |
| `waitForSceneInHistory` | Method | `packages/playtest/src/harness/harness-reader.ts` | 37 |
| `getGameState` | Method | `packages/playtest/src/harness/harness-reader.ts` | 60 |
| `getErrors` | Method | `packages/playtest/src/harness/harness-reader.ts` | 65 |

## How to Explore

1. `gitnexus_context({name: "handleGodotStop"})` — see callers and callees
2. `gitnexus_query({query: "harness"})` — find related execution flows
3. Read key files listed above for implementation details
