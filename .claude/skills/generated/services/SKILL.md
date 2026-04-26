---
name: services
description: "Skill for the Services area of game-code-gui. 60 symbols across 11 files."
---

# Services

60 symbols | 11 files | Cohesion: 85%

## When to Use

- Working with code in `apps/`
- Understanding how handler, emit, normalizePath work
- Modifying services-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/electron/services/settings-service.ts` | get, getWorkspaceRoot, getEffectiveWorkspaceRoot, getApiKey, getClaudeCodeToken (+6) |
| `apps/studio/electron/services/project-scanner.ts` | formatTaskTitle, normalizeTaskStatus, mergeTaskPlanJson, withFallbackTaskTitles, summarizePlan (+5) |
| `apps/studio/electron/services/studio-logger.ts` | child, writeRawLine, _write, writeChunk, rotate (+3) |
| `apps/studio/electron/services/session-manager.ts` | createSessionId, start, attachRenderer, emitStreamEvent, spawnChild (+3) |
| `apps/studio/electron/services/godot-manager.ts` | splitBufferedLines, launch, emitStatus, pushLog, stop (+3) |
| `apps/studio/electron/services/secret-storage.ts` | getSafeStorage, isEncryptionAvailable, encryptString, decryptString, SecretStorage (+2) |
| `apps/studio/electron/main.ts` | createWindow, emitUpdateState, configureAutoUpdates |
| `apps/studio/electron/db/normalize-path.ts` | normalizePath, isPathInsideRoot |
| `packages/playtest/src/harness/harness-reader.ts` | emitToGame |
| `apps/studio/src/lib/port.ts` | handler |

## Entry Points

Start here when exploring this area:

- **`handler`** (Function) — `apps/studio/src/lib/port.ts:8`
- **`emit`** (Function) — `apps/studio/electron/trpc/routers/projects.ts:49`
- **`normalizePath`** (Function) — `apps/studio/electron/db/normalize-path.ts:2`
- **`isPathInsideRoot`** (Function) — `apps/studio/electron/db/normalize-path.ts:7`
- **`ElectronSafeStorageSecretStorage`** (Class) — `apps/studio/electron/services/secret-storage.ts:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ElectronSafeStorageSecretStorage` | Class | `apps/studio/electron/services/secret-storage.ts` | 22 |
| `Base64SecretStorage` | Class | `apps/studio/electron/services/secret-storage.ts` | 38 |
| `handler` | Function | `apps/studio/src/lib/port.ts` | 8 |
| `emit` | Function | `apps/studio/electron/trpc/routers/projects.ts` | 49 |
| `normalizePath` | Function | `apps/studio/electron/db/normalize-path.ts` | 2 |
| `isPathInsideRoot` | Function | `apps/studio/electron/db/normalize-path.ts` | 7 |
| `SecretStorage` | Interface | `apps/studio/electron/services/secret-storage.ts` | 16 |
| `emitToGame` | Method | `packages/playtest/src/harness/harness-reader.ts` | 50 |
| `child` | Method | `apps/studio/electron/services/studio-logger.ts` | 104 |
| `start` | Method | `apps/studio/electron/services/session-manager.ts` | 43 |
| `attachRenderer` | Method | `apps/studio/electron/services/session-manager.ts` | 55 |
| `emitStreamEvent` | Method | `apps/studio/electron/services/session-manager.ts` | 90 |
| `spawnChild` | Method | `apps/studio/electron/services/session-manager.ts` | 94 |
| `emitToRenderer` | Method | `apps/studio/electron/services/session-manager.ts` | 146 |
| `handleDbRequest` | Method | `apps/studio/electron/services/session-manager.ts` | 154 |
| `get` | Method | `apps/studio/electron/services/settings-service.ts` | 36 |
| `getWorkspaceRoot` | Method | `apps/studio/electron/services/settings-service.ts` | 44 |
| `getEffectiveWorkspaceRoot` | Method | `apps/studio/electron/services/settings-service.ts` | 48 |
| `getApiKey` | Method | `apps/studio/electron/services/settings-service.ts` | 58 |
| `getClaudeCodeToken` | Method | `apps/studio/electron/services/settings-service.ts` | 85 |

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

## How to Explore

1. `gitnexus_context({name: "handler"})` — see callers and callees
2. `gitnexus_query({query: "services"})` — find related execution flows
3. Read key files listed above for implementation details
