# Studio Electron Desktop App — Conversational Agent UI
# Revised Architecture Plan (v1 + v2)

## Context

The existing `apps/studio` is a minimal React+Vite scaffold. The TUI in `apps/cli` is task-centric: pick a task from a list, run it, see streaming output. We're building a **native Electron desktop app** that pivots to a **conversational agent model** (like Claude Code / Cursor): the user chats with an agent that orchestrates the existing harness toolkit (scaffolding, planning, implementing, iterating, evaluating) by calling them as tools.

The existing `runTask()`, `planGame()`, `iterateGame()`, etc. don't go away — they become **tools** the conversational agent invokes. The user no longer "picks a task from a list and clicks run." They say *"build me a deckbuilder where you fight dragons"* and the agent orchestrates the whole pipeline, narrating its decisions, asking for input when needed.

**Existing CLI-generated projects are not supported in the studio.** The studio is a fresh start — no backwards compatibility with `harness/tasks.json` or prior project structures.

---

## Three Major Design Choices

| Choice | Why |
|--------|-----|
| **Electron + utilityProcess isolation** | Agent loop isolated from IPC host; crash in tool doesn't take down the window |
| **MessagePort (streaming) + tRPC (req/res)** | tRPC subscriptions are fragile for high-rate streams; MessagePort is native and reliable |
| **Conversational agent model** | Natural language interface; existing harness becomes the toolkit |
| **SQLite (WAL) + migrations runner** | Conversations survive restarts; schema evolves safely |
| **Tailwind + shadcn/ui** | Modern component library, dark theme |
| **Anthropic + OpenAI top-level providers (v1)** | Anthropic for model API; OpenAI for users with work subscription via local proxy |
| **LangSmith from v1** | Passive observer; wraps conversation + tool calls; no-op if key absent |
| **Windows-only NSIS + signed installer (v1)** | Azure Trusted Signing; cross-platform post-v1 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                                 │
│  ├── tRPC IPC router (queries + mutations only; no subscriptions) │
│  ├── MessagePortMain bridge (streaming events to renderer)        │
│  ├── DB access layer (better-sqlite3, WAL mode)                  │
│  ├── Project scanner                                             │
│  ├── Godot process manager                                       │
│  ├── safeStorage (DPAPI) — API key read/write                    │
│  └── Port relay to utilityProcess                                │
│           ↕ MessagePort                                          │
│  Agent utilityProcess (Node.js, isolated)                        │
│  ├── Conversation Agent (Anthropic SDK or OpenAI SDK)            │
│  │   └── Tools: scaffold, plan, implement, launch, read_task_plan│
│  ├── Tool registry + approval gate                               │
│  ├── LangSmith tracer (passive; no-op if key absent)             │
│  └── Hard caps: 50 tool calls / 15 min / depth 3                 │
│           ↕ contextBridge (preload.ts)                           │
│  Renderer Process (Chromium)                                     │
│  ├── tRPC client (queries + mutations)                           │
│  ├── MessagePort listener (streaming events)                     │
│  ├── Zustand store (live conversation state)                     │
│  ├── TanStack Query (projects, settings, history)                │
│  └── React + Tailwind + shadcn/ui                                │
│      CSP: default-src 'self'; script-src 'self'                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## v1 Scope

Eight weeks. Five tools. Two providers (Anthropic + OpenAI). Basic LangSmith tracing. Signed NSIS installer.

**v1 includes:**
- Electron shell, utilityProcess agent isolation, MessagePort streaming, tRPC IPC
- SQLite with WAL + migrations runner from day one
- `projects` table with synthetic ID (no path-as-PK)
- `safeStorage` (DPAPI) for all API keys
- Five tools: `scaffold_game`, `plan_game`, `implement_task`, `launch_game`, `read_task_plan`
- Anthropic + OpenAI selectable for top-level conversation; sub-agents always Anthropic
- LangSmith: conversation-level + tool-call spans (passive observer, no-op if key absent)
- Chat UI: Zustand state, single tool-call card, modal approval gate, abort
- Workspace first-run picker; project list; conversation history
- Godot log panel
- Structured file logging (pino/electron-log)
- Azure Trusted Signing + NSIS installer + electron-updater auto-update feed
- DB unit tests, tool contract tests, one playwright-electron e2e smoke test

**v2 (see v2 section below):**
- `run_evals`, `iterate_project`, `generate_assets`, `bash`, `write_file` tools
- Nested sub-agent tool-call rendering
- Budget exhaustion UI variants (Extend / Stop gracefully / Stop and summarize)
- Long-term memory + embeddings (sqlite-vec, @huggingface/transformers)
- Full LangSmith sub-agent trace granularity + memory retrieval spans
- Approval policy settings UI; conversation search; multi-workspace
- Frameless window + custom titlebar; light theme toggle
- Cross-provider sub-agents

---

## Phase 0: Service Layer Extraction (prerequisite, ~3–5 days)

### 0.1 Extract `planGameService()` from `apps/cli/src/commands/plan-game.ts`

`planGame()` currently prompts user for missing args, scaffolds the project, installs deps, prints output, returns `Promise<void>`. It cannot be imported as a tool without side effects.

Extract `planGameService(args: PlanGameArgs): Promise<TaskPlan>` that:
- Accepts all inputs as arguments (no prompts, no spinner, no `process.exit`)
- Returns the completed `TaskPlan` rather than writing it directly
- Caller is responsible for persistence

The existing CLI command becomes a thin wrapper around `planGameService`. Verify CLI behavior is unchanged with existing CLI tests before consuming in the studio.

Export `planGameService` from `@agent-harness/core` or a new `@agent-harness/services` package.

### 0.2 Update `planIteration()` (v2 prerequisite — defer until `iterate_project` tool is scheduled)

`planIteration()` in `packages/core/src/loop/iterate.ts` falls back to Anthropic models only. Before wrapping as a tool, it must accept `model?: string` and pass it through. Defer to v2 when `iterate_project` tool is scheduled.

---

## Phase 1: Electron Bootstrap + Process Isolation + IPC Wiring

### 1.1 Restructure `apps/studio`

Rebuild in place (keep `@agent-harness/studio` workspace slot). Existing placeholder pages removed and replaced.

**Files to delete:**
- `src/App.tsx`, `src/pages/TasksPage.tsx`, `src/pages/EvalReportsPage.tsx`, `src/pages/ScreenshotsPage.tsx`
- `src/main.tsx`, `vite.config.ts`, `tsconfig.json`

v1 file tree:
```
apps/studio/
  package.json
  electron-builder.yml
  electron.vite.config.ts
  tsconfig.json
  tsconfig.main.json
  tsconfig.renderer.json
  tailwind.config.ts
  postcss.config.js
  index.html
  electron/
    main.ts                       # window + IPC + port relay + DB access only
    preload.ts
    agent-process.ts              # utilityProcess entry point
    trpc/
      router.ts
      routers/
        projects.ts
        conversations.ts
        agent.ts                  # send/abort mutations; stream is MessagePort
        approvals.ts
        godot.ts
        settings.ts
        langsmith.ts
      context.ts
    services/
      project-scanner.ts
      godot-manager.ts
      session-manager.ts          # manages port to utilityProcess; restarts on crash
    db/
      index.ts                    # singleton Database, WAL + pragmas on open
      migrations/
        001_initial.sql
        002_projects_table.sql    # each migration is numbered + transactional
      migration-runner.ts         # checks PRAGMA user_version, applies deltas
      projects.ts
      conversations.ts
      messages.ts
      task-plans.ts
      settings.ts                 # reads/writes via safeStorage for key-type entries
      approvals.ts
  agent/                          # runs inside utilityProcess
    index.ts                      # entry point — receives port, spawns agent
    conversation-agent.ts
    conversation-agent-prompt.ts
    tool-registry.ts
    approval-gate.ts
    tools/
      scaffoldGame.ts
      planGame.ts
      implementTask.ts
      launchGame.ts
      readTaskPlan.ts
    langsmith/
      tracer.ts                   # passive wrapper; no-op if LANGSMITH_API_KEY absent
      spans.ts
  shared/
    protocol.ts                   # MessagePort event types (StreamEvent union)
    trpc-types.ts
    domain.ts
  src/
    main.tsx
    App.tsx
    index.css
    lib/
      trpc.ts
      query-client.ts
      port.ts                     # singleton MessagePort to main
    store/
      conversation-store.ts       # Zustand; live messages, streaming state
    hooks/
      useConversationStream.ts    # subscribes port, writes to Zustand
      useGodotEvents.ts
    components/
      layout/
        LeftPanel.tsx
        CenterPanel.tsx
        RightPanel.tsx
      chat/
        ConversationView.tsx
        MessageList.tsx
        Message.tsx               # markdown via react-markdown + rehype-sanitize + rehype-highlight
        ToolCallCard.tsx
        ChatComposer.tsx
        StreamingCursor.tsx
      conversations/
        ConversationsList.tsx
        NewConversationButton.tsx
      approvals/
        ApprovalDialog.tsx        # modal only in v1
      project/
        ProjectList.tsx
        ProjectInfo.tsx
      godot/
        GodotLauncher.tsx
        GodotLog.tsx
      ui/                         # shadcn components
```

### 1.2 Install Dependencies

**v1 RC dependencies:**
- `electron@^41.x`
- `better-sqlite3@^11.0.0`
- `react`, `react-dom`
- `@trpc/server@^11`, `@trpc/client@^11`, `@trpc/react-query@^11`
- `electron-trpc@^0.7.1` (req/res only; no subscriptions for streaming)
- `@tanstack/react-query@^5.59`
- `zod@^3.23`, `nanoid@^5`, `superjson@^2.2`
- `zustand@^5`
- `anthropic` (Anthropic SDK)
- `openai` (OpenAI SDK — top-level agent only)
- `langsmith@^0.2` (passive tracer; no-op if key absent)
- `pino@^9` + `pino-pretty` (structured logging, main + utilityProcess)
- `electron-updater@^6`
- `react-markdown`, `rehype-sanitize`, `rehype-highlight`
- `@agent-harness/core`, `@agent-harness/game-adapter`, `@agent-harness/tools`, `@agent-harness/assets`, `@agent-harness/evals` (`workspace:*`)

**DevDependencies:**
- `electron-builder@^25`
- `electron-vite@^2.3`
- `@electron/rebuild@^3.6`
- `@types/better-sqlite3`, `@types/node`
- `tailwindcss`, `postcss`, `autoprefixer`
- `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`
- `playwright`, `@playwright/test`, `playwright-electron` (e2e)
- `vitest` (unit + contract tests)

**postinstall:** `electron-rebuild -f -w better-sqlite3`

**Doctor script** (`scripts/doctor.ts`): loads `better-sqlite3` and calls `db.prepare('SELECT 1').get()` against Electron's actual ABI before dev starts. Fail fast if rebuild is stale.

### 1.3 electron-vite config + Tailwind + shadcn

- `electron.vite.config.ts` — three sub-configs (main, preload, renderer)
- `agent-process.ts` as a fourth Vite entry in `main` config (output: `agent/agent-process.cjs`)
- Tailwind + shadcn init (New York, dark, neutral)
- shadcn components: `button`, `input`, `textarea`, `scroll-area`, `badge`, `separator`, `dialog`, `select`, `card`, `tabs`, `collapsible`, `tooltip`, `dropdown-menu`, `progress`

**ESM + preload:** With `"type": "module"`, electron-vite bundles main as CJS (`.cjs`) and preload as `.mjs`. BrowserWindow preload path references `.mjs`:
```ts
preload: join(__dirname, '../preload/preload.mjs')
```
Set `sandbox: false, contextIsolation: true` — required by electron-trpc.

**CSP** (set via `webContents.session.webRequest.onHeadersReceived`):
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
```
Block external navigation: handle `will-navigate` and `setWindowOpenHandler` to block all non-`self` navigations.

### 1.4 Main Process: Window + Port relay + DB access

**`electron/main.ts`** responsibilities:
1. Open DB (`initDb()`) with WAL + pragmas + migration runner
2. Resolve `GODOT_PATH`, `CLAUDE_PATH` from DB into `process.env` (Electron does not inherit shell PATH on Windows)
3. Create `BrowserWindow` with explicit CSP
4. Spawn agent `utilityProcess` via `utilityProcess.fork(agentProcessPath)`
5. Create a `MessageChannel`; send one port to the utilityProcess, pass the other to the renderer via `webContents.postMessage`
6. Attach tRPC IPC handler (req/res only)
7. Relay DB calls from utilityProcess (agent needs to write messages/plans; only main holds the DB connection)

**Session manager** (`electron/services/session-manager.ts`): wraps the utilityProcess lifecycle. If the process crashes, emit an `{ type: 'error' }` event on the port, then restart the process and re-establish the port. Pending approvals are resolved to `timeout` on crash (see Phase 3).

### 1.5 Agent utilityProcess entry point

**`electron/agent-process.ts`** (runs isolated):
- Receives its `MessagePort` via `process.parentPort.on('message')`
- Instantiates `ConversationAgent` and `ToolRegistry`
- Listens for `{ type: 'send' | 'abort' }` commands from main
- Emits `StreamEvent` frames on the port

### 1.6 Renderer: tRPC + Zustand + MessagePort

**`src/lib/port.ts`**: singleton port received from `window.electronAPI.port` (exposed via preload). Used by `useConversationStream`.

**`src/lib/trpc.ts`**: `createTRPCReact<AppRouter>()` + `ipcLink()`. For queries and mutations only.

**`src/store/conversation-store.ts`**: Zustand store.
```ts
interface ConversationStore {
  activeConversationId: string | null;
  messages: Record<string, Message[]>;         // by conversationId
  streamingChunks: Record<string, string>;     // by messageId — in-flight text
  pendingApprovals: Record<string, Approval>; // by approvalId
  isRunning: Record<string, boolean>;          // by conversationId
  actions: { ... };
}
```
TanStack Query for: project list, conversation list, settings. Never for live messages.

**`src/main.tsx`**: wrap App in `QueryClientProvider`, `trpc.Provider`, and a `PortProvider` that delivers the MessagePort to `useConversationStream`.

### 1.7 Build Scripts
```json
{
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "preview": "electron-vite preview",
  "package:win": "electron-vite build && electron-builder --win",
  "typecheck": "tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
  "test:unit": "vitest run",
  "test:e2e": "playwright test",
  "doctor": "tsx scripts/doctor.ts"
}
```

### 1.8 electron-builder config (`electron-builder.yml`)

```yaml
appId: com.agent-harness.studio
productName: Harness Studio
directories:
  output: release/
win:
  target: nsis
  signingHashAlgorithms: [sha256]
  sign: scripts/sign.js              # Azure Trusted Signing via @azure/trusted-signing-client
asar: true
asarUnpack:
  - '**/node_modules/better-sqlite3/**'
publish:
  provider: github
  releaseType: release
```

Post-v2 additions to `asarUnpack`:
- `'**/node_modules/sqlite-vec/**'`
- `'**/node_modules/@huggingface/transformers/**'`

---

## Phase 2: SQLite Schema, Migrations, Projects, Settings

### 2.1 DB open-time pragmas (`electron/db/index.ts`)

```ts
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
runMigrations(db);
```

### 2.2 Migration runner (`electron/db/migration-runner.ts`)

```ts
function runMigrations(db: Database) {
  const version = db.pragma('user_version', { simple: true }) as number;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  db.transaction(() => {
    for (const file of files) {
      const num = parseInt(file.split('_')[0]);
      if (num > version) {
        db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        db.pragma(`user_version = ${num}`);
      }
    }
  })();
}
```

Each migration file is self-contained SQL wrapped in a transaction. Never run bare `ALTER TABLE` outside a migration file.

### 2.3 Schema (`electron/db/migrations/001_initial.sql`)

```sql
-- Projects: one row per studio project (synthetic id, normalized path)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,                        -- nanoid
  path TEXT NOT NULL UNIQUE,                  -- normalized: path.win32.normalize().toLowerCase()
  display_path TEXT NOT NULL,                 -- preserved case for display
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_path ON projects(path);

-- Conversations: one row per chat thread
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  model TEXT,
  provider TEXT NOT NULL DEFAULT 'anthropic',  -- 'anthropic' | 'openai'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER DEFAULT 0
);
CREATE INDEX idx_conversations_project ON conversations(project_id, updated_at DESC);

-- Messages: one row per turn (canonical Anthropic content-block JSON)
-- role: 'user' | 'assistant' | 'system' | 'error'
-- content_blocks: JSON array — exact Anthropic/OpenAI wire format for that role
-- For rendering: tool-call cards and tool-result rows are derived from content_blocks,
-- not stored separately. This avoids reconstruction bugs.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_blocks TEXT NOT NULL,               -- JSON: MessageParam['content'] array
  created_at INTEGER NOT NULL,
  langsmith_run_id TEXT
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, seq);

-- Token usage per conversation
CREATE TABLE IF NOT EXISTS conversation_tokens (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0
);

-- Task plans: one row per project (replaces harness/tasks.json entirely)
CREATE TABLE IF NOT EXISTS task_plans (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  plan_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Approval requests
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL,
  risk_level TEXT NOT NULL,                   -- 'low' | 'medium' | 'high' | 'destructive'
  rationale TEXT,
  status TEXT NOT NULL,                       -- 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted'
  scope TEXT,                                 -- 'once' | 'conversation' | 'project'
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_approvals_conv ON approvals(conversation_id, status);

-- Settings KV (non-secret values only)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Secret values** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `FAL_KEY`, `LANGSMITH_API_KEY`, `GODOT_PATH`, `CLAUDE_PATH`) are stored via `safeStorage.encryptString()` as base64 blobs in settings, never as plaintext. The DB accessor reads them via `safeStorage.decryptString()`. Never log or serialize decrypted values.

### 2.4 Path normalization

All project paths normalized on insert and lookup:
```ts
function normalizePath(p: string): string {
  return path.win32.normalize(p).toLowerCase().replace(/\\/g, '/');
}
```
Display path preserves original casing. Scanner resolves paths to project IDs before any DB operation.

### 2.5 Project scanner (`electron/services/project-scanner.ts`)

Scans workspace root for subdirectories with a row in `task_plans`. Returns `{ id, displayPath, title, taskCount, completeCount }[]`. No default workspace root — on first launch, if `workspace.root` is absent in settings, open a directory picker dialog immediately after window open. If `workspace.root` exists but path is gone (unmounted drive, moved folder), show picker again with "previous workspace unavailable" notice.

Projects created by the CLI (`harness/tasks.json` on disk, no `task_plans` row) are not surfaced. State this clearly in the UI.

### 2.6 tRPC routers (req/res only)

- `projects.ts`: `list`, `getInfo(id)`, `getPlan(id)`
- `conversations.ts`: `list(projectId?)`, `get(id)`, `create`, `delete`, `rename`, `getMessages(id)` — getMessages returns content_blocks; renderer derives display rows from them
- `agent.ts`: `send({ conversationId, userMessage, projectId?, model?, provider? })`, `abort({ conversationId })`
- `settings.ts`: `get(key)`, `set(key, value)`, `getApiKey(name)`, `setApiKey(name, value)`, `getWorkspaceRoot`, `setWorkspaceRoot`
- `approvals.ts`: `listPending(conversationId?)`, `decide(id, decision, scope?)`
- `godot.ts`: `start(projectId)`, `stop()`, `getStatus()`
- `langsmith.ts`: `getStatus()` — returns `{ configured: boolean, projectName: string, endpoint: string }`

Godot log stream and agent stream are delivered via MessagePort, not tRPC subscriptions.

---

## Phase 3: Conversational Agent Core

### 3.1 Agent utilityProcess isolation

The conversation agent and all tool execution run inside a `utilityProcess`. Main process:
- Holds the DB connection (only main reads/writes SQLite)
- Relays DB calls from the agent via a typed RPC protocol over the same MessagePort
- Restarts the utilityProcess on crash via `session-manager.ts`; pending approvals resolved to `aborted` on crash

### 3.2 Conversation Agent (`electron/agent/conversation-agent.ts`)

**Provider abstraction:** A thin provider interface wraps both Anthropic SDK and OpenAI SDK. Both support streaming + tool calls with compatible but not identical protocols. The adapter normalizes events into `StreamEvent` before emitting on the port.

```ts
interface LLMProvider {
  streamMessage(args: {
    messages: ProviderMessage[];
    tools: ProviderTool[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (e: NormalizedLLMEvent) => void;
  }): Promise<void>;
}

class AnthropicProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }
```

Sub-agents (spawned inside `implement_task`, `run_evals`, etc.) always use Anthropic regardless of the top-level conversation provider.

**Retry:** Wrap SDK calls with exponential backoff on 429/529/500–504, max 3 retries, 1s/2s/4s delays. Emit `{ type: 'retrying', attempt, reason }` event to the UI on each retry.

**Hard caps per turn** (enforced in the agent loop, not the tools):
- Max 50 tool calls
- Max 15 minutes wall-clock
- Max nesting depth 3 (conversation → tool → sub-agent)
- Exceeding any cap: abort turn, append `{ type: 'error', message: 'Cap exceeded: ...' }` to stream

**Context window management:**
- Tool results over 8 KB are stored in full in the DB but replaced in replayed history with `[truncated — full result in message ${id}]`
- After 30 turns or when estimated input tokens exceed 150k, pause and append an assistant message: "This conversation is approaching context limits. I'll summarize what we've accomplished before continuing." Then summarize via a single Haiku call and continue from the summary.

**History format:** Messages are stored as Anthropic `MessageParam['content']` arrays (exact wire format). On replay, rows are read directly and passed to the provider adapter without reconstruction. Provider adapters handle any schema differences between Anthropic and OpenAI.

**Abort cascade:**
1. `AbortController.abort()` called in utilityProcess
2. Anthropic/OpenAI SDK: `{ signal }` on the streaming request — stream closes immediately
3. Godot child processes: SIGTERM → SIGKILL after 3s (via message back to main's godot-manager)
4. Pending approval gates: held Promise resolves with `{ status: 'aborted' }` — approval row updated to `aborted`
5. Sub-agent tool calls: abort propagated via shared `AbortController` instance passed through tool wrappers

Public interface:
```ts
class ConversationAgent {
  async sendMessage(args: {
    conversationId: string;
    userMessage: string;
    projectId?: string;
    model: string;
    provider: 'anthropic' | 'openai';
    signal: AbortSignal;
  }): Promise<void>;
}
```

### 3.3 Tool registry (v1 RC — five tools)

| Tool | Wraps | Risk |
|------|-------|------|
| `scaffold_game` | `scaffoldGame()` from game-adapter | high (creates on disk) |
| `plan_game` | `planGameService()` (Phase 0) | medium |
| `implement_task` | `runTask()` from cli | high |
| `launch_game` | `godotManager.start()` | medium |
| `read_task_plan` | DB read via main relay | low (auto-approve) |

**`implement_task` wrapper:**
- `persistPlan` callback: sends DB upsert RPC to main (never writes `harness/tasks.json`)
- `onBudgetExhausted`: in v1, stops gracefully and emits `{ type: 'budget-exhausted' }` — no interactive options; v2 adds Extend/Summarize
- No `harness/tasks.json` ever written for studio projects

**`scaffold_game` always requires approval** (shows target path). Never auto-approved.

### 3.4 Approval gate (`electron/agent/approval-gate.ts`)

| Risk | Examples | Default |
|------|----------|---------|
| low | `read_task_plan` | Auto-approve |
| medium | `plan_game`, `launch_game` | Auto-approve |
| high | `scaffold_game`, `implement_task` | Require approval |

Flow: tool invoked → gate checks policy → if needed, write `approvals` row with `status='pending'`, pause via held Promise → main relays `{ type: 'approval-required' }` event on MessagePort → renderer shows `ApprovalDialog` → user decides via `trpc.approvals.decide` mutation → main relays decision to utilityProcess → Promise resolves.

**Crash recovery:** on utilityProcess restart, session-manager sets all `pending` approvals for the conversation to `aborted`, appends an interrupted-turn error message. Conversation is left in a clean state; user must re-send to continue.

**Scope options:** `once` (default), `conversation` (remember for this session), `project` (permanent allowlist for this project).

Approval records are scoped by `(tool_name, normalized_args_hash, project_id)` — not just tool name. Approving `implement_task` for one task doesn't approve all future tasks.

### 3.5 Streaming protocol (`shared/protocol.ts`)

```ts
type StreamEvent =
  | { type: 'text-delta'; conversationId: string; messageId: string; delta: string }
  | { type: 'message-complete'; conversationId: string; messageId: string; fullText: string }
  | { type: 'tool-call'; conversationId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; conversationId: string; toolCallId: string; success: boolean; output: unknown }
  | { type: 'tool-progress'; toolCallId: string; message: string }
  | { type: 'tokens'; conversationId: string; input: number; output: number; cached: number }
  | { type: 'approval-required'; conversationId: string; approvalId: string; toolName: string; args: unknown; riskLevel: string; rationale: string }
  | { type: 'approval-resolved'; conversationId: string; approvalId: string; decision: string }
  | { type: 'budget-exhausted'; conversationId: string; toolCallId: string; tokensUsed: number; budget: number }
  | { type: 'retrying'; conversationId: string; attempt: number; reason: string }
  | { type: 'cap-exceeded'; conversationId: string; cap: 'tool-calls' | 'wall-clock' | 'nesting' | 'context' }
  | { type: 'error'; conversationId: string; message: string }
  | { type: 'done'; conversationId: string }
  // Godot events (same port, different type prefix)
  | { type: 'godot-log'; line: string; stream: 'stdout' | 'stderr'; timestamp: number }
  | { type: 'godot-status'; status: 'running' | 'stopped' | 'crashed'; exitCode?: number };
```

**Flush policy:** main accumulates `text-delta` events and flushes every 16 ms or 2 KB, whichever comes first. On overflow (queue > 500), drop `text-delta` (full text is in DB; renderer can re-fetch); never drop `tool-call`, `approval-required`, or `error` events. `message-complete` always carries `fullText` as a resync point.

**Renderer:** `useConversationStream` hook listens on the MessagePort, writes into Zustand store. On `message-complete`, flushes in-flight streaming chunk and marks message done.

### 3.6 System prompt (`electron/agent/conversation-agent-prompt.ts`)

- Identity: "You are Harness Studio, a game development assistant for building Godot 4 GDScript deckbuilder roguelikes."
- Capabilities: scaffold, plan, implement, launch. "Use your tools to actually do the work."
- Conversation style: narrate decisions briefly; ask for clarification when ambiguous.
- Project context: inject game title, task progress (per-phase counts), recent messages summary if context-compressed.
- Sub-agent role awareness (designer, gameplay, systems, etc.) for the implement_task tool.
- If conversation was interrupted: "Note: a previous turn in this conversation was interrupted. Resume from the last completed state."

---

## Phase 4: LangSmith Tracing (v1 — Basic)

LangSmith is a **passive observer** in v1. The agent loop is unchanged; tracing wraps only callbacks. No-op if `LANGSMITH_API_KEY` is absent. App runs identically whether tracing is on or off.

### 4.1 Tracer (`electron/agent/langsmith/tracer.ts`)

```ts
class Tracer {
  constructor(private enabled: boolean, private client: LangSmithClient | null) {}

  wrapConversationTurn(conversationId: string, model: string, fn: () => Promise<void>): Promise<void>;
  wrapToolCall(toolName: string, input: unknown, fn: () => Promise<unknown>): Promise<unknown>;
}
```

If `enabled` is false, both methods call `fn()` directly with no overhead.

### 4.2 What's captured in v1

- **Conversation turn**: one root run per `agent.send` call — inputs (system prompt, history), outputs (final assistant message), token counts, abort status, model/provider
- **Tool invocations**: one child run per tool call — tool name, args, result, wall-clock duration, success/failure

### 4.3 Settings

Keys stored via `safeStorage`: `LANGSMITH_API_KEY`. Non-secret settings in DB: `langsmith.enabled` (default: `false`), `langsmith.projectName` (default: `"harness-studio"`), `langsmith.endpoint` (default: LangSmith cloud).

### 4.4 What's v2

- Sub-agent granularity (one child run per `runAgentLoop` iteration inside `implement_task`)
- Memory retrieval spans
- `langsmith_run_id` on message rows (migration `002`)
- "View trace" button on tool-call cards
- LangSmith settings section in Settings UI

---

## Phase 5: Chat UI

### 5.1 Conversation view (`src/components/chat/ConversationView.tsx`)

Center panel:
- Header: conversation title, model + provider selector, token badge, abort button (when running)
- Messages: virtual scroll (react-window or simple overflow-auto), auto-scroll to bottom
- Composer: multiline textarea, submit on Cmd/Ctrl+Enter

Model selector:
- Dropdown. Anthropic group: claude-opus-4-7, claude-sonnet-4-6, claude-haiku-4-5. OpenAI group: gpt-4o, o3 (shown only if `OPENAI_API_KEY` configured).
- Selection persisted as `agent.defaultModel` + `agent.defaultProvider` in settings.

### 5.2 Message rendering (`src/components/chat/Message.tsx`)

- `user` — right-aligned, neutral bubble
- `assistant` — left-aligned, rendered via `react-markdown` + `rehype-sanitize` + `rehype-highlight`. **Sanitize runs before highlight** to prevent XSS from model-generated content.
- Tool-call and tool-result blocks within an assistant message rendered as `<ToolCallCard>` components derived from `content_blocks`.
- `error` — red banner

### 5.3 Tool call card (`src/components/chat/ToolCallCard.tsx`)

**v1: single flat card per tool call. No nested sub-agent rendering.**

Collapsed summary:
- `implement_task`: `implement_task · {task.title} · {task.role}`
- `plan_game`: `plan_game · {gameTitle}`
- `scaffold_game`: `scaffold_game · {outputPath}`
- `launch_game`: `launch_game · {projectPath}`
- `read_task_plan`: `read_task_plan · {projectPath}`

Expand shows: full args JSON, progress messages (via `tool-progress` events appended in order), final result or error. Spinner while running. Success/fail badge on complete.

Sub-agent output (from `implement_task` internal tool calls): shown as indented log lines under the card — plain text, not nested cards. Nested card rendering is v2.

### 5.4 Composer (`src/components/chat/ChatComposer.tsx`)

- Auto-grow textarea up to 12 lines
- Submit Cmd/Ctrl+Enter; Enter = newline
- Disabled when agent is running (shows Abort button)
- Placeholder: "Build a game..." / "Continue working on {title}..."

### 5.5 Approval UI

**v1: modal dialog only.** No inline banner.

`ApprovalDialog.tsx`: opens automatically when `approval-required` event arrives. Shows: risk level badge, tool name, args summary, rationale. Buttons: **Approve once**, **Approve for this project**, **Deny**. Scope stored with the approval record.

Keyboard: Enter approves, Escape denies when dialog is focused.

### 5.6 Left panel

Top: workspace path + change button. Middle: project list (shadcn Cards). Bottom: conversation list for selected project. Very bottom: "+ New Conversation" button.

---

## Phase 6: Godot Process Management

### 6.1 Godot manager (`electron/services/godot-manager.ts`)

Runs in **main process** (not agent utilityProcess). Singleton wrapping `execa`:
- `start(projectPath)`: spawn `execa(godotBin, ['--path', projectPath], { shell: false })` — never pass path as a string to avoid quoting issues on Windows
- `stop()`: SIGTERM, fallback SIGKILL after 3s
- `getStatus()`: synchronous `{ status: 'running' | 'stopped' | 'crashed', exitCode?, projectPath? }`
- Line-buffered stdout/stderr; on exit capture exit code + last 50 lines of stderr; emit `godot-status: 'crashed'` with that context if non-zero exit

Godot log events emitted on the same MessagePort (different type prefix). Max 1000 log lines in renderer (circular buffer in Zustand).

### 6.2 tRPC router (`electron/trpc/routers/godot.ts`)
- `start(projectId)` mutation — resolves display path, delegates to godot-manager
- `stop()` mutation
- `getStatus()` query

### 6.3 Renderer
- `GodotLauncher.tsx` — Start/Stop button, status badge
- `GodotLog.tsx` — monospace scroll, stderr in red, max 1000 lines, clear button

---

## Phase 7: Logging + Auto-Update + Testing

### 7.1 Structured logging

`pino` in both main process and utilityProcess. Log to `app.getPath('logs')/studio.log`. Rotating (max 5 files × 10 MB). Log levels: `debug` in dev, `info` in prod. Never log decrypted API keys or full message content.

Logs accessible via Settings → "Open Log File" button.

### 7.2 Auto-update (`electron-updater`)

```ts
// In main.ts, after window ready:
autoUpdater.checkForUpdatesAndNotify();
autoUpdater.on('update-downloaded', () => {
  // emit MessagePort event to renderer: { type: 'update-ready' }
});
```

Renderer shows a banner "Update ready — restart to install" with a restart button. Update feed: GitHub Releases. Signed releases only.

### 7.3 Code signing (Azure Trusted Signing)

`scripts/sign.js` using `@azure/trusted-signing-client`. Configured via CI env vars (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, signing account endpoint). Local dev builds are unsigned; CI builds are signed.

### 7.4 Testing

**Unit tests (vitest):**
- `electron/db/*.test.ts` — in-memory SQLite, migration runner, all DB CRUD ops
- `electron/db/migration-runner.test.ts` — version bumping, idempotency, rollback on error

**Contract tests (vitest + mock Anthropic client):**
- `electron/agent/tools/scaffoldGame.test.ts` — mock fs; assert correct args, output shape
- `electron/agent/tools/implementTask.test.ts` — mock `runTask`; assert `persistPlan` callback fires with correct plan; assert abort propagates

**e2e smoke test (playwright-electron):**
- Launch the app in dev mode
- Assert workspace picker appears on first run
- Create a new conversation
- Send "scaffold a deckbuilder called Test"
- Assert approval dialog appears; click Approve
- Assert a tool-call card appears and completes
- Assert conversation is still visible after app restart

---

## Phase 8: Polish

- **Keyboard shortcuts:** Cmd/Ctrl+N new conversation, Cmd/Ctrl+, settings, Esc abort (when running)
- **Settings page:** Workspace tab (root path, change button), API Keys tab (Anthropic key required banner; OpenAI, FAL optional), LangSmith tab (toggle, key, project name, endpoint), Godot tab (resolved path + browse button), About tab (version, log file link, doctor output)
- **Token usage:** progress bar in conversation header (vs. context-window budget)
- **Theme:** dark default; light toggle
- **Conversation rename:** click title in header to edit inline
- **Empty state:** left panel shows "No projects yet — start a conversation to scaffold your first game"

---

---

# v2 Scope

v2 is scheduled after v1 RC ships and the conversational shell is proven stable. Budget v2 separately — it is a significant addition, not an incremental patch.

## v2 Phase A: Additional Tools + iterate_project

Prerequisites: Phase 0.2 (`planIteration` provider-aware extraction).

**New tools:**
| Tool | Notes |
|------|-------|
| `run_evals` | Wraps `runEvals()` from evals package |
| `iterate_project` | Wraps `planIteration()` — requires Phase 0.2 |
| `generate_assets` | Present if `FAL_KEY` configured; shows placeholder badge when absent |
| `read_file` / `list_files` | Read-only; auto-approved |
| `write_file` | Medium-high risk; always requires approval |
| `bash` | Destructive; always requires approval; user must enable in settings |

**Budget exhaustion UI variants:**
- v1 stops gracefully; v2 adds: Extend (add N tokens to budget), Stop gracefully, Stop and summarize
- Stored in `approvals` table with `risk_level = 'budget'`

**Nested sub-agent UI:**
- `ToolCallCard` renders child tool calls recursively (bounded to depth 2 in UI)
- `parentToolCallId` on events links child to parent

## v2 Phase B: Long-term Memory + Embeddings

Add: `sqlite-vec`, `@huggingface/transformers` (note: the old `@xenova/transformers` name is deprecated; use `@huggingface/transformers` which is the same package with updated branding).

Embedder **must** run in a `worker_threads` Worker — `@huggingface/transformers` WASM inference is synchronous and will stall IPC. Add `electron/workers/embedder-worker.ts`; communicate via `MessageChannel`.

**Memory layers:**
- L2: Conversation summaries (Haiku call on archive or 50+ messages)
- L3: Project facts (extracted from turns by summarizer)
- L4: User preferences (persisted across projects)
- L5: Vector index via sqlite-vec (384-dim, Xenova/all-MiniLM-L6-v2)

**Memory tools (agent-facing):** `remember`, `recall`, `forget`, `list_memories`

**Memory UI:** `MemoryDrawer` (Cmd/Ctrl+M) — tabs for Preferences (L4), This project (L3), Summaries (L2). Inline editable. Import/export JSON.

**Schema additions (migration `003`):**
```sql
CREATE TABLE IF NOT EXISTS conversation_summaries ( ... );
CREATE TABLE IF NOT EXISTS memories ( ... );
-- sqlite-vec virtual table created at runtime after extension loads
```

**sqlite-vec path resolution (packaged vs dev):**
```ts
const vecPath = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked/node_modules/sqlite-vec/vec0.dll')
  : require.resolve('sqlite-vec/vec0.dll');
db.loadExtension(vecPath);
```

**Privacy:** all storage local; "Disable memory" master toggle in settings; memory disabled does not disable LangSmith tracing (separate toggle).

## v2 Phase C: Full LangSmith Tracing

- Sub-agent granularity: one child run per `runAgentLoop` iteration inside `implement_task`
- Memory retrieval spans
- Schema migration: `langsmith_run_id` columns on `messages`, `conversations` tables
- "View trace" button on tool-call cards (opens browser)
- LangSmith settings section: toggle, key, project name, endpoint, status indicator, "Open project in LangSmith" link
- What to capture: inputs/outputs, token counts, cost estimates, approval decisions, abort status, errors, memory retrieval results

## v2 Phase D: Polish + Advanced Features

- Frameless window + custom Win32 titlebar
- Slash commands in composer: `/scaffold`, `/plan`, `/run`, `/eval`
- Conversation search (left panel)
- Approval policy settings UI
- Multi-workspace support (workspace switcher; all conversations preserved across switch)
- Light theme
- Cross-provider sub-agents (requires all tool wrappers to thread model choice; iterate_project provider-aware)
- Cross-platform (macOS, Linux) via electron-builder targets
- Sentry crash reporting (optional, gated by user consent in settings)
- Retire the Ink-based CLI TUI: remove the `game-harness tui` command, delete `apps/cli/src/tui`, and scrub TUI references from CLI output, docs, and tests so Studio is the only interactive UI surface

---

## Key Design Decisions

1. **utilityProcess for agent loop** — Main process owns IPC + DB only. Agent crashes don't kill the window. Restart on crash is clean.

2. **MessagePort for streaming; tRPC for req/res** — tRPC subscriptions are fragile for high-rate streams. MessagePort is IPC-native and reliable. Both run through the same preload contextBridge.

3. **Content-block arrays as canonical message format** — Store the exact Anthropic/OpenAI wire format. No reconstruction from flat rows. Provider adapters handle schema differences. This eliminates the #1 class of "malformed history" API errors.

4. **safeStorage (DPAPI) for API keys** — Never plaintext in SQLite. `safeStorage.isEncryptionAvailable()` is always true on Windows 10+. If unavailable (edge case), prompt per-session, don't persist.

5. **Synthetic project ID; normalized path** — `project_path` is not a stable identifier on Windows. Synthetic nanoid as PK; normalize `path.win32.normalize().toLowerCase()` for lookups; preserve display path separately.

6. **Migrations runner from day one** — `PRAGMA user_version` + numbered SQL files. Every schema change ships as a migration, never as a bare `CREATE TABLE IF NOT EXISTS` patch. Prevents silent corruption on upgrade.

7. **Anthropic + OpenAI selectable for top-level agent** — Provider adapter interface normalizes both SDKs. Sub-agents always use Anthropic in v1 (cross-provider sub-agents are v2 and require Phase 0.2).

8. **LangSmith in v1 as passive observer** — Wraps callbacks only; no changes to agent logic. App runs identically if disabled. Conversation + tool-call granularity sufficient for v1 debugging. Sub-agent granularity in v2.

9. **Approval scoped by (tool, args-hash, project)** — Approving `implement_task` for one task doesn't pre-approve all future tasks. Users retain oversight at the task level.

10. **Hard caps per turn** — 50 tool calls / 15 min / depth 3 / 150k input tokens. Prevents runaway conversations. Cap events emit a typed event; UI shows which cap fired.

11. **Abort cascade** — AbortSignal propagates: stream closes, Godot SIGTERM, pending approvals resolve to `aborted`, sub-agent loops stop at next check. No zombie state.

12. **rehype-sanitize before rehype-highlight** — Model-generated content treated as untrusted. Sanitize first; highlight rendered HTML only.

13. **No event sourcing** — Plain SQLite inserts. No replay needed for v1.

14. **Doctor script** — Verifies native modules load against Electron ABI before dev session. Prevents subtle runtime failures from stale rebuilds.

15. **Budget exhaustion simplified in v1** — Stop gracefully only. No Extend/Summarize interactive loop until v2 validates that users actually hit the budget ceiling and want those options.

---

## What Gets Removed / Deprecated

- `apps/studio` placeholder pages — removed
- TUI in `apps/cli` — kept during v1 for continuity; scheduled for removal in v2 once Studio fully replaces it
- `harness/tasks.json` — not written by studio-created projects; CLI path unchanged

---

## Verification (v1 RC)

1. `pnpm run doctor` — native modules confirmed loaded against Electron ABI
2. `pnpm install` — runs electron-rebuild for better-sqlite3
3. `pnpm --filter @agent-harness/studio run test:unit` — DB and contract tests pass
4. `pnpm --filter @agent-harness/studio run dev` — Electron window opens
5. First launch: workspace picker dialog appears; select a directory
6. 3-panel layout visible; projects list empty initially
7. Click "+ New Conversation" — empty chat appears
8. Type *"Build me a deckbuilder where you fight dragons"* — agent responds, approval dialog opens for scaffold_game → approve → tool-call card appears
9. Close and reopen app — conversation history in left panel; click to reload
10. Send *"run the game"* — Godot launches, logs stream into right panel
11. Mid-turn: click Abort — stream stops, no zombie Godot process, conversation remains in clean state
12. utilityProcess crash: kill it from Task Manager — session-manager restarts it, conversation shows "interrupted" error, next message works normally
13. LangSmith configured: runs appear in LangSmith project at conversation + tool-call granularity
14. OpenAI key configured: model selector shows gpt-4o / o3 options; send a message using OpenAI provider; agent responds correctly
15. `pnpm --filter @agent-harness/studio run typecheck` — no errors
16. `pnpm --filter @agent-harness/studio run test:e2e` — smoke test passes
17. `pnpm --filter @agent-harness/studio run package:win` — produces signed .exe in `release/`; SmartScreen does not trigger
