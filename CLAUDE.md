# agent-harness

Pnpm + Turborepo monorepo that takes a text brief and produces a playable **Godot 4 GDScript deckbuilder roguelike** via AI agent loops, automated playtesting, and eval gates.

## Requirements

- Node >= 22
- pnpm >= 9
- Godot 4.x installed (set `GODOT_PATH` env var if not in PATH)
- `ANTHROPIC_API_KEY` env var
- `FAL_KEY` env var (optional - for real art generation via fal.ai FLUX/schnell; placeholder PNGs used when absent)

## Common commands

```bash
# Install dependencies
pnpm install

# Build everything (Turbo handles dependency order)
pnpm build

# Typecheck all packages
pnpm typecheck

# Run all tests (requires ANTHROPIC_API_KEY)
pnpm test

# Run the CLI (after build)
node apps/cli/bin/game-harness.js --help

# CLI subcommands
game-harness new-game                          # scaffold + plan + implement a Godot deckbuilder from brief
game-harness new-game --brief "..." --output ./my-game
game-harness new-game --brief-file ./doc.md
game-harness new-game --plan-only              # scaffold + plan, stop before implementation
game-harness plan-game                         # plan + scaffold + install deps, print plan, stop before building
game-harness plan-feature                      # plan a feature with the agent
game-harness implement-task                    # run agent loop to implement a task
game-harness run-playtest -p ./my-game         # read harness/test-output.json from Godot headless run
game-harness run-evals -p ./my-game            # build/data/systems/deckbuilder eval layers
game-harness generate-assets -p ./my-game --content          # generate art for all artPrompt entries (cards/enemies/relics)
game-harness generate-assets -p ./my-game -r "glowing sword" # generate a single asset
game-harness reconcile-runtime -p ./my-game
game-harness runtime-log -p ./my-game
game-harness inspect-scenes -p ./my-game
game-harness verify-project -p ./my-game

# implement-task CLI flags
game-harness implement-task -p ./my-game --task <id>
game-harness implement-task -p ./my-game --resume                # 3 tasks parallel by default
game-harness implement-task -p ./my-game --resume --concurrency 5
game-harness implement-task -p ./my-game --resume --concurrency 1

# Godot project commands (run from inside a generated project)
godot --path .
godot --headless --check-only --path .
godot --headless --path . -- --harness-test
godot --headless --export-release "Windows Desktop" builds/game.exe --path .

# Studio desktop app
pnpm --filter @agent-harness/studio run dev
pnpm --filter @agent-harness/studio run typecheck
pnpm --filter @agent-harness/studio run test:unit
pnpm --filter @agent-harness/studio run build
pnpm --filter @agent-harness/studio run package:win

# Dev (watch mode per package)
pnpm dev

# Clean all build artifacts
pnpm clean

# Build a single package
pnpm --filter @agent-harness/core run build
pnpm --filter @agent-harness/game-adapter run build
```

## Package layout

| Package | Purpose |
|---|---|
| `packages/core` | Agent loop, types, Claude client, role prompts, brief preprocessor, advanced planner, memory, tracing |
| `packages/tools` | Typed ToolContract implementations (fs, code, npm, git) |
| `packages/game-adapter` | Godot scaffolder, template registry, build runner (`godot --headless`), dev server (native window) |
| `packages/assets` | Asset pipeline - fal.ai FLUX/schnell for images, placeholder fallback; `generateContentArt` reads artPrompt fields |
| `packages/playtest` | Godot headless runner - spawns `godot --harness-test`, polls `harness/test-output.json`, runs assertions |
| `packages/evals` | Build/data/systems/deckbuilder eval layers, CI thresholds, regression reports |
| `apps/cli` | `game-harness` CLI entry point |
| `apps/studio` | Electron desktop app for conversational orchestration, approvals, Godot launch/logs, settings, updates, and tracing |
| `templates/deckbuilder` | Handlebars template - Godot 4 GDScript deckbuilder roguelike |

## Studio desktop app

`apps/studio` is the Electron-based desktop shell for the harness.

Key capabilities:

- Conversational agent UI with Anthropic/OpenAI top-level provider selection
- Persisted conversations, projects, approvals, and task plans in SQLite
- Godot launch/stop controls plus live log streaming
- Settings tabs for Workspace, API Keys, LangSmith, Godot, and About
- Keyboard shortcuts: `Ctrl/Cmd+N` new conversation, `Ctrl/Cmd+,` settings, `Esc` abort active run

UI layout (Focus Mode):
- Start screen → workspace two-page navigation; state persisted in `localStorage`
- Workspace is a flush three-column layout (no padding/gap): left sidebar (210 px) | center chat | right panel (220 px)
- Top bar has ▶ Launch / ■ Stop Godot toggle and ⊟ ⊞ sidebar visibility toggles
- Left sidebar: project mini-card with progress bar, conversations list (Live badge + provider·model), Godot log strip
- Right panel: compact sections (Session, Providers, Runtime + Godot controls, Live Usage, actions)
- Godot runtime status type is `'running' | 'stopped' | 'crashed'` — there is no `'starting'` state

Studio agent provider layer (`apps/studio/electron/agent/llm-provider.ts`):
- Uses **LangChain** (`@langchain/anthropic`, `@langchain/openai`) — not the Anthropic SDK directly
- `AnthropicProvider` wraps `ChatAnthropic`, `OpenAIProvider` wraps `ChatOpenAI`
- LangSmith tracing is **env-var based**: call `applyLangSmithEnv(config)` from `langsmith/env.ts` before each turn to set `LANGCHAIN_TRACING_V2`, `LANGSMITH_API_KEY`, etc. — no custom tracer class

## Key conventions

- `exactOptionalPropertyTypes: true` - use `...(x !== undefined ? { x } : {})` for optional fields; this applies to Ink `<Text color={...}>` too - never pass `color={x | undefined}`, use `{...(active ? { color: 'green' as const } : {})}`
- Each package needs `rootDir: "src"` and `outDir: "dist"` in its own tsconfig (not just base)
- `@types/node` must be a devDep in each Node package; add `"types": ["node"]` to its tsconfig
- `fs-extra`'s `writeJson` is not an ESM named export - use `writeFile` + `JSON.stringify` instead
- `simple-git` uses named import: `import { simpleGit } from 'simple-git'`
- `ALL_TOOLS` array in packages/tools must be typed `ToolContract<any, any>[]` (invariant generics)
- Build order: core -> tools -> game-adapter -> assets -> playtest -> evals -> cli (Turbo handles this)
- When typechecking cross-package, build the dependency first so declaration files are up to date
- Godot binary resolved via `GODOT_PATH` env var, falling back to `godot` in PATH
- **No simple mode** - everything is always advanced/GDScript. `mode` param is ignored; `getSystemPrompt(role)` always returns GDScript role prompts
- **No Phaser, no Vite, no Playwright, no TypeScript in generated games** - all game code is GDScript

## Agent loop conventions

- **Prompt caching**: system prompt is sent as a single-block array with `cache_control: { type: 'ephemeral' }` - requires 1024+ tokens to cache; handled in `packages/core/src/claude/client.ts`
- **History windowing**: the loop keeps `history[0]` (task prompt) + last 10 messages (5 exchanges) to cap input tokens; window slice must start at an odd index (assistant turn) to maintain alternation - enforced in `agent-loop.ts`
- **Temperature**: `designer` = 0.4, `orchestrator` = 0.3, all code-gen roles = 0 (default); retry calls always use 0; set via `ROLE_TEMPERATURE` map in `types/agent.ts`
- **Max tokens**: `gameplay`, `systems`, `designer` roles use 16384; all others use 8192; set via `HIGH_TOKEN_ROLES` in `types/agent.ts`
- **Model selection**: `MODELS` constant in `types/agent.ts` lists available models; shorthand aliases (`sonnet`, `opus`, `haiku`) are resolved in `apps/cli/src/index.ts`
- **Role prompts**: call `getSystemPrompt(role)` - never import individual prompt constants directly; mode param is ignored (always GDScript)
- **Cancellation**: pass `signal?: AbortSignal` in `AgentLoopOptions`; the loop checks it before each iteration and before each tool execution

## Godot/GDScript conventions for generated games

- **Autoloads** (singletons) registered in `project.godot`: `EventBus`, `ContentLoader`, `RunStateManager`, `GameState`, `HarnessPlugin`
- **Signals**: declare in `EventBus.gd` with `signal card_played(...)`, emit with `EventBus.card_played.emit(...)`, connect with `.connect()`
- **Content data**: JSON arrays in `src/data/content/{cards,enemies,relics,status_effects}.json`; every entry must have `id`, `artPrompt`, and `artKey` (set after asset generation)
- **Art asset keys**: `{type}_{id}` -> e.g. `cards_strike`, `enemies_cultist` -> PNG at `src/assets/generated/{artKey}.png`
- **Art dimensions**: cards 256x256, enemies 256x384, relics 64x64
- **Save/load**: `FileAccess.open("user://run_save.json", FileAccess.WRITE)` - never localStorage, never Electron IPC
- **Headless test**: `HarnessPlugin.gd` checks `"--harness-test" in OS.get_cmdline_args()`, waits 4 s, writes `harness/test-output.json` + `harness/screenshot.png`, then calls `get_tree().quit()`
- **Critical flow harness**: `harness/critical-flow.json` should validate progression actions, not just scene transitions
- **Input reachability**: treat "control exists" and "control usable" as separate checks; report whether an action failed because its control was missing, hidden, disabled, ignored, or clipped
- **Character select progression**: require both a reachable character-selection action and a reachable confirm action
- **Failure output**: name the specific missing or unreachable action in `criticalFlow.inputReachabilityIssues` and the failing step error
- **No physics** - deckbuilder UI uses `Control` nodes (VBoxContainer, Button, Label, TextureRect), not physics bodies
- **Tween** for card animations: `create_tween().tween_property(card, "position", target, 0.3)`

## Eval layers

| Layer | What it checks | CI threshold |
|---|---|---|
| `build` | `godot --check-only` (GDScript syntax) + `godot --export-release` (binary export) | build pass rate 100% |
| `data` | content JSON valid, non-empty arrays, all entries have `id` + `artPrompt` | score >= 6/10 |
| `systems` | GDScript regex checks on 5 autoload files (EventBus, ContentLoader, RunStateManager, HarnessPlugin, GameState) | score >= 6/10 |
| `deckbuilder` | card count >= 20, enemies >= 9 (3/act), relics >= 5, cost distribution 0/1/2, artPrompt coverage | score >= 6/10 |
| `functional` | stub - Phase 6 placeholder, always returns 0 |
| `design` | stub - Phase 6 placeholder, always returns 0 |

## Content art generation

```bash
# Generate art for all entries with artPrompt but no artKey
game-harness generate-assets -p ./my-game --content

# With custom style guide
game-harness generate-assets -p ./my-game --content --style "pixel art, 16-bit, dark fantasy"

# Single asset
game-harness generate-assets -p ./my-game -r "a glowing red sword" --key cards_inferno --width 256 --height 256
```

`generateAllContentArt(projectPath)` in `@agent-harness/assets` reads artPrompt fields from `src/data/content/{cards,enemies,relics}.json`, calls FAL.ai (or generates placeholders), writes PNGs to `src/assets/generated/`, and sets `artKey` in the JSON.

## Template registry path

`TEMPLATES_ROOT` in `packages/game-adapter/src/scaffold/template-registry.ts` resolves `../../../../templates` relative to `dist/scaffold` (4 levels up to monorepo root). Keep in sync with the scaffolder's copy path.
