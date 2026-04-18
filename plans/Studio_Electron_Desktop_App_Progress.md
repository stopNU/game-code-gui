# Harness Studio Progress Tracker

Source plan: [Studio_Electron_Desktop_App.md](D:\dev\game-code-gui\plans\Studio_Electron_Desktop_App.md)

This document turns the architecture plan into a working checklist so progress is easy to track at a glance.

## Current Status

- Active focus: `Phase 7`
- Completed so far: `Phase 0`, `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`, `Phase 5`, `Phase 6`
- Deferred by design: `Phase 0.2` until `iterate_project` is scheduled

## Phase 0: Service Layer Extraction

- [x] Extract `planGameService(args)` into a reusable service layer with no prompts, spinners, or `process.exit`
- [x] Keep `plan-game` CLI command as a thin wrapper around the service
- [x] Preserve current CLI behavior for scaffold + dependency install flow
- [x] Add verification coverage for the new service and the CLI wrapper
- [x] Decide whether to migrate `new-game` to reuse the same service flow
- [x] Phase 0.2: update `planIteration()` to accept `model?: string` when `iterate_project` work begins

### Notes

- Completed implementation uses a new workspace package: `@agent-harness/services`
- The extracted service currently lives at `packages/services/src/plan-game.ts`
- The CLI wrapper now lives at `apps/cli/src/commands/plan-game.ts`
- Added focused tests for both the service and CLI wrapper
- `new-game` now reuses the same shared planning/scaffold/install service
- `planIteration()` now honors explicit Anthropic model selection and rejects unsupported providers instead of silently falling back

## Phase 1: Electron Bootstrap, Isolation, and IPC

- [x] Rebuild `apps/studio` in place around Electron
- [x] Remove the current placeholder React/Vite pages
- [x] Add `electron.vite.config.ts`, Electron entrypoints, preload, and utility process entry
- [x] Add Tailwind + shadcn/ui base setup
- [x] Wire tRPC IPC for request/response flows
- [x] Wire `MessagePort` streaming between main, utility process, and renderer
- [x] Add session manager for utility process lifecycle and crash recovery
- [x] Add initial build/dev/test/package scripts for studio
- [x] Add `electron-builder.yml`

### Notes

- `apps/studio` now builds as an Electron app with `electron-vite` and separate main, preload, renderer, and utility-process entries
- Added a minimal tRPC router in main plus a renderer client over `ipcRenderer.invoke`
- Added a `SessionManager` that owns the isolated utility process lifecycle and forwards stream events to the renderer over `MessagePort`
- Replaced the placeholder renderer with a three-panel shell backed by Zustand, React Query, Tailwind, and a small shadcn-style component base
- The utility process currently uses a deterministic stub response so IPC and streaming can be verified before the real conversation agent lands in Phase 3
- Verified `pnpm --filter @agent-harness/studio run typecheck`, `test`, and `build`

## Phase 2: SQLite, Projects, and Settings

- [x] Add DB bootstrap with WAL pragmas
- [x] Add migration runner based on `PRAGMA user_version`
- [x] Create initial schema for projects, conversations, messages, approvals, settings, and task plans
- [x] Add DB access modules for each table group
- [x] Implement workspace/project scanning and persistence
- [x] Implement secure settings handling via `safeStorage` for API keys

### Notes

- Studio persistence now lives under `apps/studio/electron/db` with a migration-backed SQLite bootstrap and table-specific repositories
- Main-process tRPC routers now read from the database instead of the Phase 1 in-memory placeholders for projects, conversations, approvals, settings, and LangSmith status
- Workspace project listing is filtered through the new `ProjectScanner`, which only surfaces persisted Studio projects that already have a `task_plans` row
- Secure API-key persistence is handled by `SettingsService`, which uses Electron `safeStorage` when available and falls back to environment variables for read-time status checks
- Verification coverage was added in `apps/studio/electron/db/phase-2.test.ts`
- Implementation uses Node's built-in `node:sqlite` sync API instead of `better-sqlite3` to avoid native-module install friction in this workspace while preserving the Phase 2 storage architecture

## Phase 3: Conversation Agent and Tooling

- [x] Add conversation agent running inside `utilityProcess`
- [x] Define shared stream protocol for text, tool calls, approvals, errors, tokens, and Godot events
- [x] Add tool registry with v1 tools
- [x] Implement `scaffold_game` tool
- [x] Implement `plan_game` tool using extracted service
- [x] Implement `implement_task` tool
- [x] Implement `launch_game` tool
- [x] Implement `read_task_plan` tool
- [x] Add approval gate and approval persistence
- [x] Add abort propagation and hard caps
- [x] Add studio system prompt

### Notes

- Replaced the Phase 1 deterministic utility-process stub with a real `ConversationAgent` in `apps/studio/electron/agent`
- Expanded the shared stream protocol in `apps/studio/shared/protocol.ts` to cover tool calls/results, approvals, token updates, retry notices, cap exhaustion, completion, and Godot status/log events
- Added a main-process DB relay so the utility process can persist conversations, messages, token totals, task plans, approval rows, and API-key lookups without owning the SQLite connection
- Added a new SQLite migration, `002_approval_scopes.sql`, so approvals can be scoped by `(tool_name, args_hash, project_id)` and reused for conversation/project-level allow decisions
- Implemented the Phase 3 v1 Studio tools in `apps/studio/electron/agent/tool-registry.ts`: `plan_game`, `scaffold_game`, `implement_task`, `launch_game`, and `read_task_plan`
- `plan_game` uses the extracted `@agent-harness/services` layer and persists the resulting project/task-plan metadata into Studio's database
- `implement_task` now loads the built CLI runner, emits progress and token events back into Studio, persists task-plan updates through the DB callback, and surfaces budget exhaustion to the stream
- Added a Studio-specific system prompt in `conversation-agent-prompt.ts` to steer planning, implementation, task-plan reads, and launch flows
- Added OpenAI provider support alongside Anthropic in `llm-provider.ts` using the OpenAI Responses API with streaming text deltas and function-call mapping into Studio's existing tool protocol
- Updated the temporary center-panel chat UI so provider selection is no longer hardcoded to Anthropic; the renderer can now send either `claude-sonnet-4-6` or `gpt-5.4`
- Verified `pnpm --filter @agent-harness/studio run typecheck`, `test`, and `build`
- Remaining caveat: Phase 3 is compile/test/build verified, but this progress tracker still assumes a follow-up live smoke test with a real OpenAI key and a real Anthropic key if we want explicit runtime validation across both providers

## Phase 4: LangSmith Tracing

- [x] Add passive tracer wrapper
- [x] Trace conversation turns
- [x] Trace tool invocations
- [x] Add LangSmith settings storage and toggles

### Notes

- Added `langsmith@^0.2` to `apps/studio` dependencies
- Created `electron/agent/langsmith/tracer.ts` — `Tracer` class with `wrapConversationTurn` and `wrapToolCall`; completely no-op when disabled or when API key is absent; LangSmith errors are swallowed with `.catch(() => {})` so tracing never disrupts the agent
- Created `electron/agent/langsmith/spans.ts` — shared span shape types for v2 extension
- Added `get-langsmith-config` to the DB relay protocol so the isolated utility process can fetch LangSmith settings from the main-process `SettingsService` at turn start
- `ConversationAgent.sendMessage` now fetches LangSmith config, instantiates a `Tracer`, wraps the entire turn in `wrapConversationTurn`, calls `recordTokens` after each LLM response, and wraps each `tool.execute` call in `wrapToolCall`
- `LangSmithStatus` (domain + router) now includes the `enabled` flag alongside `configured`/`endpoint`/`projectName`
- `session-manager.ts` handles the new `get-langsmith-config` dispatch returning `{ enabled, apiKey, projectName, endpoint }`
- Verified `pnpm --filter @agent-harness/studio run typecheck` — no errors

## Phase 5: Chat UI

- [x] Build 3-panel application layout
- [x] Add conversation list and new conversation flow
- [x] Add conversation header with model/provider selector
- [x] Add message list and markdown rendering
- [x] Add tool call cards
- [x] Add chat composer
- [x] Add approval dialog
- [x] Add live streaming state via Zustand + MessagePort

### Notes

- Replaced the placeholder renderer shell with a true three-panel chat workspace backed by persisted projects and conversations
- Added a richer Zustand conversation store that tracks message hydration, live stream events, tool-call state, approvals, token usage, and Godot runtime status
- Added chat UI components for conversation lists, project context, header selectors, markdown-rendered messages, tool-call cards, and a composer with abort support
- Added an approval modal wired to the existing `approvals.decide` router and `MessagePort` event flow
- Added markdown rendering dependencies: `react-markdown`, `remark-gfm`, `rehype-sanitize`, and `rehype-highlight`
- Verified `pnpm --filter @agent-harness/studio run typecheck`, `test`, and `build`

## Phase 6: Godot Process Management

- [x] Add main-process Godot manager
- [x] Add tRPC Godot router
- [x] Add launch/stop controls in renderer
- [x] Add Godot log panel and status display

### Notes

- Added `electron/services/godot-manager.ts`, which owns the native Godot child process in Electron main, tracks current status, captures stdout/stderr logs, and emits `godot-status` / `godot-log` events back through the existing MessagePort stream
- Expanded the tRPC `godot` router with `getStatus`, `getLogs`, `launch`, and `stop`, using persisted Studio project ids to resolve launch targets safely through `ProjectScanner`
- Wired `GodotManager` into `electron/main.ts` and exposed a small `SessionManager.emitStreamEvent()` bridge so main-process runtime events can reach the renderer without going through the utility process
- Added renderer-side `GodotLauncher` and `GodotLog` components plus store hydration for current status/log history so the right panel can both hydrate on load and stay live during runtime events
- Verified `pnpm --filter @agent-harness/studio run typecheck`, `test`, and `build`

## Phase 7: Logging, Updates, and Testing

- [x] Add structured logging in main and utility process
- [ ] Add studio log access from settings
- [x] Add auto-update flow with `electron-updater`
- [x] Add Azure Trusted Signing integration
- [x] Add DB unit tests
- [x] Add tool contract tests
- [x] Add Playwright Electron smoke test

### Notes

- Added shared rotating Studio logging in `apps/studio/electron/services/studio-logger.ts`; Electron main now writes `studio.log`, and utility-process `pino` output is relayed back into the same log file through the existing `MessagePort` bridge
- Added runtime/update plumbing in `apps/studio/electron/main.ts` plus a new tRPC runtime router so the renderer can open the log file and trigger restart-to-install when an update has been downloaded
- Added `electron-updater` integration with typed `update-status` stream events so updater state flows through the same Zustand + MessagePort path as the rest of the Studio runtime
- Added signing/publish scaffolding in `apps/studio/electron-builder.yml` and `apps/studio/scripts/sign.cjs` for Azure Trusted Signing in CI-backed Windows builds
- Added focused Phase 7 coverage in `apps/studio/electron/services/studio-logger.test.ts` and `apps/studio/electron/agent/tool-registry.test.ts`
- Tool contract coverage now exercises the main Studio v1 tools directly through `createStudioTools()`: `plan_game`, `scaffold_game`, `implement_task`, `read_task_plan`, and `launch_game`
- While adding the `launch_game` contract, we found and fixed an abort edge case in `tool-registry.ts`: if the signal was already aborted or aborted mid-launch, the tool could hang instead of stopping the owned Godot session
- `read_task_plan` now returns `{ plan: null }` for missing persisted plans so the registry behavior matches the intended contract instead of throwing
- Added a Playwright Electron smoke harness in `apps/studio/tests/e2e/studio-smoke.spec.ts`, but it is currently opt-in via `RUN_STUDIO_E2E=1` because Electron window attachment has been flaky in this environment
- The current renderer exposes log/update actions in the right-side runtime panel, not in a dedicated Settings page yet; the remaining unchecked item is specifically about moving that access into the eventual Phase 8 settings surface
- Verified `pnpm --filter @agent-harness/studio run typecheck`, `test:unit`, `build`, and `test:e2e` (with the smoke test currently skipped by default unless explicitly enabled)

## Phase 8: Polish

- [ ] Add keyboard shortcuts
- [ ] Build settings page
- [ ] Add token usage progress display
- [ ] Add theme handling
- [ ] Add conversation rename support
- [ ] Add empty states and final UX polish

## v2 Follow-On Work

- [ ] Add `run_evals`, `iterate_project`, `generate_assets`, `read_file`, `list_files`, `write_file`, and `bash` tools
- [ ] Add nested tool-call rendering
- [ ] Add budget exhaustion UI choices
- [ ] Add long-term memory and embeddings
- [ ] Add full LangSmith sub-agent tracing
- [ ] Add conversation search
- [ ] Add approval policy settings UI
- [ ] Add multi-workspace support
- [ ] Add light theme and frameless window polish
- [ ] Add cross-provider sub-agents
- [ ] Add cross-platform packaging
