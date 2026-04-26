---
name: electron
description: "Skill for the Electron area of game-code-gui. 9 symbols across 2 files."
---

# Electron

9 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `apps/`
- Understanding how getLogFilePath, readTail work
- Modifying electron-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/electron/main.ts` | getContext, mustGetGodotManager, invokeTrpc, looksLikeWorkspaceRoot, findWorkspaceRoot (+1) |
| `apps/studio/electron/services/studio-logger.ts` | getFilePath, getLogFilePath, readTail |

## Entry Points

Start here when exploring this area:

- **`getLogFilePath`** (Method) — `apps/studio/electron/services/studio-logger.ts:108`
- **`readTail`** (Method) — `apps/studio/electron/services/studio-logger.ts:119`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getLogFilePath` | Method | `apps/studio/electron/services/studio-logger.ts` | 108 |
| `readTail` | Method | `apps/studio/electron/services/studio-logger.ts` | 119 |
| `getContext` | Function | `apps/studio/electron/main.ts` | 151 |
| `mustGetGodotManager` | Function | `apps/studio/electron/main.ts` | 231 |
| `invokeTrpc` | Function | `apps/studio/electron/main.ts` | 239 |
| `looksLikeWorkspaceRoot` | Function | `apps/studio/electron/main.ts` | 24 |
| `findWorkspaceRoot` | Function | `apps/studio/electron/main.ts` | 31 |
| `resolveWorkspaceRoot` | Function | `apps/studio/electron/main.ts` | 47 |
| `getFilePath` | Method | `apps/studio/electron/services/studio-logger.ts` | 21 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ReadTail → GetFilePath` | intra_community | 3 |
| `ResolveWorkspaceRoot → LooksLikeWorkspaceRoot` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "getLogFilePath"})` — see callers and callees
2. `gitnexus_query({query: "electron"})` — find related execution flows
3. Read key files listed above for implementation details
