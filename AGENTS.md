# agent-harness

Pnpm + Turborepo monorepo that takes a text brief and produces a playable **Godot 4 GDScript deckbuilder roguelike** via AI agent loops, automated playtesting, and eval gates.

## Requirements

- Node >= 22
- pnpm >= 9
- Godot 4.x installed (set `GODOT_PATH` env var if not in PATH)
- `ANTHROPIC_API_KEY` env var
- `FAL_KEY` env var (optional — for real art generation via fal.ai FLUX/schnell; placeholder PNGs used when absent)

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
game-harness generate-assets -p ./my-game --content          # generate art for all artPrompt entries
game-harness generate-assets -p ./my-game -r "glowing sword" # generate a single asset

# TUI subcommands (full-screen interactive terminal UI, requires a TTY)
game-harness tui                                                 # interactive command + model picker
game-harness tui new-game                                        # chat-like setup + clarifying Q&A
game-harness tui new-game --brief "..."
game-harness tui new-game --model sonnet                         # sonnet/opus/haiku or full model ID
game-harness tui plan-game
game-harness tui plan-game --brief "..." --model sonnet
game-harness tui implement-task
game-harness tui implement-task --project ./my-game
game-harness tui implement-task --project ./my-game --task <id>
game-harness tui implement-task --project ./my-game --resume

# implement-task CLI flags
game-harness implement-task -p ./my-game --task <id>
game-harness implement-task -p ./my-game --resume                # 3 tasks parallel by default
game-harness implement-task -p ./my-game --resume --concurrency 5
game-harness implement-task -p ./my-game --resume --concurrency 1

# Godot commands (run from inside a generated project)
godot --path .                                          # open in Godot editor
godot --headless --check-only --path .                  # GDScript syntax check
godot --headless --path . -- --harness-test             # headless test → harness/test-output.json
godot --headless --export-release "Windows Desktop" builds/game.exe --path .

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
| `packages/assets` | Asset pipeline — fal.ai FLUX/schnell for images, placeholder fallback; `generateContentArt` reads artPrompt fields |
| `packages/playtest` | Godot headless runner — spawns `godot --harness-test`, polls `harness/test-output.json`, runs assertions |
| `packages/evals` | Build/data/systems/deckbuilder eval layers, CI thresholds, regression reports |
| `apps/cli` | `game-harness` CLI entry point |
| `apps/studio` | React UI for tasks/evals/screenshots (optional) |
| `templates/deckbuilder` | Handlebars template — Godot 4 GDScript deckbuilder roguelike |

## Key conventions

- `exactOptionalPropertyTypes: true` — use `...(x !== undefined ? { x } : {})` for optional fields; this applies to Ink `<Text color={...}>` too
- Each package needs `rootDir: "src"` and `outDir: "dist"` in its own tsconfig
- `@types/node` must be a devDep in each Node package; add `"types": ["node"]` to its tsconfig
- `fs-extra`'s `writeJson` is not an ESM named export — use `writeFile` + `JSON.stringify` instead
- `simple-git` uses named import: `import { simpleGit } from 'simple-git'`
- `ALL_TOOLS` array in packages/tools must be typed `ToolContract<any, any>[]` (invariant generics)
- Build order: core → tools → game-adapter → assets → playtest → evals → cli (Turbo handles this)
- Godot binary resolved via `GODOT_PATH` env var, falling back to `godot` in PATH
- **No simple mode** — everything is always advanced/GDScript; `mode` param ignored
- **No Phaser, no Vite, no Playwright, no TypeScript in generated games** — all game code is GDScript

## Agent loop conventions

- **Prompt caching**: system prompt sent with `cache_control: { type: 'ephemeral' }` — requires 1024+ tokens; handled in `packages/core/src/claude/client.ts`
- **History windowing**: keeps `history[0]` (task prompt) + last 10 messages; window slice must start at an odd index — enforced in `agent-loop.ts`
- **Temperature**: `designer` = 0.4, `orchestrator` = 0.3, all code-gen roles = 0; set via `ROLE_TEMPERATURE` in `types/agent.ts`
- **Max tokens**: `gameplay`, `systems`, `designer` = 16384; others = 8192; set via `HIGH_TOKEN_ROLES` in `types/agent.ts`
- **Role prompts**: call `getSystemPrompt(role)` — never import individual prompt constants directly
- **Cancellation**: pass `signal?: AbortSignal` in `AgentLoopOptions`

## Godot/GDScript conventions for generated games

- **Autoloads** registered in `project.godot`: `EventBus`, `ContentLoader`, `RunStateManager`, `GameState`, `HarnessPlugin`
- **Signals**: declare in `EventBus.gd` with `signal card_played(...)`, emit with `EventBus.card_played.emit(...)`, connect with `.connect()`
- **Content data**: JSON arrays in `src/data/content/{cards,enemies,relics,status_effects}.json`
- Every content entry must have `id`, `artPrompt` (non-empty), and `artKey` (set after asset generation)
- **Art asset keys**: `{type}_{id}` → PNG at `src/assets/generated/{artKey}.png`
- **Art dimensions**: cards 256×256, enemies 256×384, relics 64×64
- **Save/load**: `FileAccess.open("user://run_save.json", FileAccess.WRITE)` — never localStorage
- **Headless test**: `HarnessPlugin.gd` checks `"--harness-test" in OS.get_cmdline_args()`, waits 4 s, writes `harness/test-output.json` + `harness/screenshot.png`, then quits
- **Critical flow harness**: `harness/critical-flow.json` should validate required progression actions, not just scene changes
- **Input reachability**: distinguish between a control existing and a control being usable; report whether the action failed because the control was missing, hidden, disabled, ignored, or clipped
- **Character select progression**: require both a reachable character selection action and a reachable confirm action before considering the flow valid
- **Failure output**: identify the specific missing or unreachable action in `criticalFlow.inputReachabilityIssues` / step error text
- **No physics** — deckbuilder UI uses `Control` nodes (VBoxContainer, Button, Label, TextureRect)
- **Tween** for card animations: `create_tween().tween_property(card, "position", target, 0.3)`

## Eval layers

| Layer | What it checks | CI threshold |
|---|---|---|
| `build` | `godot --check-only` (syntax) + `godot --export-release` (binary) | build pass rate 100% |
| `data` | content JSON valid, non-empty, all entries have `id` + `artPrompt` | score ≥ 6/10 |
| `systems` | GDScript regex on 5 autoload files | score ≥ 6/10 |
| `deckbuilder` | card ≥ 20, enemies ≥ 9 (3/act), relics ≥ 5, cost 0/1/2 spread, artPrompt coverage | score ≥ 6/10 |
| `functional` | stub — Godot headless playtest (Phase 6 pending) | — |
| `design` | stub — screenshot + LLM judge (Phase 6 pending) | — |

## Template registry path

`TEMPLATES_ROOT` in `packages/game-adapter/src/scaffold/template-registry.ts` resolves `../../../../templates` relative to `dist/scaffold` (4 levels up to monorepo root). Keep in sync with the scaffolder's copy path.
