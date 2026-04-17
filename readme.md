# agent-harness

A CLI that turns a plain-text game brief into a playable Phaser 3 browser game using an AI agent loop. You describe the game; the system plans it, writes the TypeScript, playtests it, and evaluates it.

Two modes are supported:

- **Simple mode** — physics-based arcade games (Pong, Breakout, platformers, shooters). Fast, single-sprint, 2-phase plan.
- **Advanced mode** — data-driven games with complex systems (deckbuilders, roguelikes, RPGs, strategy). Multi-sprint plan, EventBus architecture, StateMachine FSMs, JSON content pipeline, up to 8 phases.

## Requirements

- Node >= 22
- pnpm >= 9
- `ANTHROPIC_API_KEY` — required for all agent commands
- `REPLICATE_API_TOKEN` — required only for `generate-assets`

## Setup

```bash
pnpm install
pnpm build
```

After building, the CLI is available as `game-harness` (via the bin entry in `apps/cli`) or directly:

```bash
node apps/cli/bin/game-harness.js --help
```

---

## Commands

### `new-game` — go from brief to playable game

The primary entry point. Accepts a description (or a full design document via `--brief-file`), analyzes it to select simple or advanced mode, plans the game, scaffolds a Phaser 3 TypeScript project, then runs the agent loop for all applicable phases.

```bash
game-harness new-game
# prompted for description interactively

game-harness new-game --brief "A Pong clone where the ball speeds up on every paddle hit"
game-harness new-game --brief "..." --output ./my-game --width 1280 --height 720
game-harness new-game --brief "..." --plan-only   # scaffold + plan, skip agent loop

# Advanced mode — pass a rich design document
game-harness new-game --brief-file ./design-doc.md
game-harness new-game --brief-file ./design-doc.md --advanced
```

Mode is auto-detected: briefs over 500 characters, or briefs containing data schemas / multi-system architecture, automatically use advanced mode. Use `--advanced` to force it regardless of brief length.

**Options:**

| Flag | Description |
|---|---|
| `-b, --brief <text>` | Game description (prompted if omitted) |
| `--brief-file <path>` | Path to a markdown file containing the game brief |
| `-o, --output <path>` | Output directory (default: `./game-<timestamp>`) |
| `--width <px>` | Canvas width (default: 800) |
| `--height <px>` | Canvas height (default: 600) |
| `--advanced` | Force advanced mode |
| `--plan-only` | Skip the agent loop — useful for inspecting the task plan before committing |

**Simple mode output:**

```
game-<timestamp>/
  docs/game-spec.md          # expanded spec the agents reference
  harness/tasks.json         # full task plan with status + results per task
  harness/memory.json        # cross-task agent memory
  src/game/scenes/           # Phaser scene stubs (BootScene, MenuScene, GameScene, HudScene, ResultScene)
  src/game/entities/         # EntityManager + Entity base
  src/game/state/            # GameState (score, lives, level, save/load)
  src/main.ts                # Phaser config entry point
  package.json / tsconfig.json / vite.config.ts
```

**Advanced mode output:**

```
game-<timestamp>/
  docs/architecture.md       # subsystem map, data schema references, sprint plan
  harness/tasks.json         # all phases (up to 8), with subsystem + schema context per task
  harness/memory.json        # cross-task agent memory
  src/game/core/
    EventBus.ts              # typed pub/sub singleton with harness event log
    StateMachine.ts          # generic FSM + StateMachineRegistry for debug bridge
    ContentLoader.ts         # async JSON content loader with typed getters
  src/game/scenes/           # BootScene + stubs for all scenes in the design
  src/game/state/
    GameState.ts             # run-state persistence via localStorage
  src/game/data/
    schemas/                 # JSON Schema files (one per data type)
    content/                 # seed content files (cards, enemies, relics, etc.)
  src/game/debug/
    HarnessPlugin.ts         # window.__HARNESS__ v2 with dataState, machineStates, eventLog
  package.json / tsconfig.json / vite.config.ts
```

After either command finishes:

```bash
cd game-<timestamp>
npm run dev       # Vite dev server at http://localhost:5173
```

---

### `tui` — full-screen interactive terminal UI

Wraps `new-game` and `implement-task` in an Ink-based TUI with a chat-like interface that streams the agent's tool calls and responses in real time. Requires an interactive TTY.

```bash
# New game with guided setup flow (brief → clarifying questions → live agent feed)
game-harness tui new-game
game-harness tui new-game --brief "A breakout clone with power-ups"

# Iterate on an existing game — interactive task picker + live agent chat
game-harness tui implement-task --project ./my-game
game-harness tui implement-task --project ./my-game --task implement-ball-physics
```

All options from the underlying commands (`--output`, `--advanced`, `--plan-only`, `--mode`, etc.) are accepted.

---

### `implement-task` — re-run or retry a single task

Runs the agent loop for one task from `harness/tasks.json`. Useful when a task failed and you want to retry it, or when you want to implement a specific task manually after using `--plan-only`.

```bash
game-harness implement-task --project ./my-game --task implement-ball-physics
game-harness implement-task --project ./my-game --task implement-card-zones --mode advanced
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <path>` | Path to the game project directory |
| `-t, --task <id>` | Task ID from `harness/tasks.json` |
| `--mode <mode>` | `simple` \| `advanced` — selects role prompt variant (default: `simple`) |

Task IDs are kebab-case strings like `scaffold-boot-scene`, `implement-paddle-input`, `implement-card-zones`. Check `harness/tasks.json` for the full list and their current `status` field (`pending`, `complete`, `failed`, `blocked`).

---

### `plan-feature` — add tasks for a new feature

Decomposes a feature description into new tasks and appends them to `harness/tasks.json`. Does not run any agents — use `implement-task` to execute the new tasks.

```bash
game-harness plan-feature \
  --project ./my-game \
  --feature "Add a power-up that temporarily widens the paddle for 5 seconds"
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <path>` | Path to the game project directory |
| `-f, --feature <text>` | Feature description |

---

### `generate-assets` — generate sprites and audio

Calls the asset pipeline (Replicate by default, falls back to procedural placeholders) to generate image, spritesheet, or audio assets and registers them under the correct key in `src/assets/manifest.json`.

```bash
game-harness generate-assets \
  --project ./my-game \
  --request "A glowing white ball on a dark background" \
  --type image \
  --key ball \
  --width 16 --height 16
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <path>` | Path to the game project directory |
| `-r, --request <text>` | Asset description |
| `--type <type>` | `image` \| `spritesheet` \| `audio` \| `tilemap` (default: `image`) |
| `--key <key>` | Phaser texture key (camelCase) |
| `--width <px>` | Width in pixels (default: 64) |
| `--height <px>` | Height in pixels (default: 64) |

Requires `REPLICATE_API_TOKEN`. Without it, procedural placeholder textures are used.

---

### `run-playtest` — Playwright automation

Launches a headless browser against the running game, reads the `window.__HARNESS__` debug bridge, and produces a playtest report.

```bash
# Start your dev server first, then:
game-harness run-playtest --project ./my-game --url http://localhost:5173

# Or let it start one automatically:
game-harness run-playtest --project ./my-game

# Show the browser window:
game-harness run-playtest --project ./my-game --no-headless
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <path>` | Path to the game project directory |
| `--url <url>` | Dev server URL (auto-started if omitted) |
| `--no-headless` | Show browser window during playtest |

**Advanced mode playtest steps** (in addition to standard click/wait/assert steps):

| Step type | Description |
|---|---|
| `evaluate` | Evaluate a JS expression in page context and assert it's truthy |
| `wait-for-state` | Poll `window.__HARNESS__.getState()` until an assertion passes or timeout |

New assertion operators for `wait-for-state`: `length-gt`, `length-eq`, `has-key`, `matches` (in addition to `eq`, `gt`, `lt`, `gte`, `lte`, `exists`).

---

### `run-evals` — eval layers

Runs automated eval scenarios against the game and reports pass/fail against CI thresholds.

```bash
game-harness run-evals --project ./my-game
game-harness run-evals --project ./my-game --layer build
game-harness run-evals --project ./my-game --layer systems   # advanced mode only
game-harness run-evals --project ./my-game --layer data      # advanced mode only
```

**Options:**

| Flag | Description |
|---|---|
| `-p, --project <path>` | Path to the game project directory |
| `-l, --layer <name>` | `build` \| `functional` \| `design` \| `data` \| `systems` \| `all` (default: `all`) |
| `--dataset <path>` | Custom eval dataset JSON |
| `--baseline <path>` | Baseline report JSON for regression comparison |
| `--no-fail-on-threshold` | Don't exit with code 1 when thresholds fail |

**Eval layers:**

| Layer | Mode | What it checks | Pass threshold |
|---|---|---|---|
| `build` | both | TypeScript compiles, bundle size within limits | — |
| `functional` | both | Scene transitions, scoring, win condition | — |
| `design` | both | HUD readability, no overlapping elements, frame rate | — |
| `data` | advanced | JSON content files: valid schema, string IDs, no duplicates, ≥3 entries | 6.0 / 10 |
| `systems` | advanced | Core system files present with expected exports (EventBus, StateMachine, ContentLoader, GameState, HarnessPlugin) | 6.0 / 10 |

---

## Typical workflows

### Simple game (physics-based)

```bash
# 1. Create a game
game-harness new-game --brief "A breakout clone with 5 levels and a power-up system"

# 2. Play it
cd game-<timestamp>
npm run dev

# 3. Retry a failed task
game-harness implement-task --project ./game-<timestamp> --task implement-ball-physics

# 4. Add a feature
game-harness plan-feature --project ./game-<timestamp> --feature "Add a magnet power-up"
game-harness implement-task --project ./game-<timestamp> --task feat-magnet-powerup

# 5. Generate real assets
game-harness generate-assets --project ./game-<timestamp> \
  --request "retro pixel art paddle, white rectangle" --type image --key paddle

# 6. Run evals
game-harness run-evals --project ./game-<timestamp>
```

### Complex data-driven game (deckbuilder, roguelike, RPG)

```bash
# 1. Write a design document, then scaffold the game
game-harness new-game --brief-file ./my-design-doc.md

# The system will:
#   - Analyze the doc (subsystems, data schemas, state machines, sprint plan)
#   - Select the data-driven-game template
#   - Generate EventBus, StateMachine, ContentLoader, HarnessPlugin v2
#   - Create scene stubs for every scene in the design
#   - Seed JSON content files for cards, enemies, relics, etc.
#   - Run all 8 phases of the agent loop

# 2. Play it
cd game-<timestamp>
npm run dev

# 3. Retry or extend individual tasks with the right role context
game-harness implement-task --project ./game-<timestamp> --task implement-combat-fsm --mode advanced
game-harness implement-task --project ./game-<timestamp> --task balance-card-costs --mode advanced

# 4. Run all eval layers including data + systems checks
game-harness run-evals --project ./game-<timestamp>
```

---

## Advanced mode architecture

Advanced mode projects are built around three core systems that live in `src/game/core/`:

**EventBus** — typed publish/subscribe singleton. All cross-scene communication goes through events. The harness records a ring buffer of recent events for inspection.

**StateMachine** — generic `StateMachine<TState>` with guard-based transitions, enter/exit callbacks, and history. All machines register with `StateMachineRegistry` so the debug bridge can snapshot their states.

**ContentLoader** — async JSON loader for all game content (cards, enemies, relics, maps). Generates typed getters from the data schema manifest. Validates at load time.

The `window.__HARNESS__` debug bridge (v2) exposes:
- `getState()` — includes `gameState`, `dataState` (content counts), `machineStates` (all FSM states), `eventLog` (recent events)
- `setDataState()` — called by BootScene after content loads

**Agent roles in advanced mode:**

| Role | Responsibility |
|---|---|
| `designer` | Architecture, sprint plan, task breakdown |
| `gameplay` | Scenes, UI, player interactions, card zones |
| `systems` | EventBus handlers, FSM definitions, ContentLoader, save/load, pure game logic |
| `balance` | JSON content tuning, power curves, rarity distribution, reference integrity |
| `asset` | Sprites, audio, tilemap generation |
| `qa` | Playtest scripts, harness assertions |
| `evaluator` | Eval scenarios, CI threshold definitions |

---

## Package layout

| Package | Purpose |
|---|---|
| `packages/core` | Agent loop, types, Claude client, role prompts, brief preprocessor, advanced planner |
| `packages/tools` | Typed tool contracts (fs, code, npm, git) |
| `packages/phaser-adapter` | Game scaffolder, template registry, build runner, dev server |
| `packages/assets` | Asset pipeline with Replicate + placeholder fallback |
| `packages/playtest` | Playwright automation + `window.__HARNESS__` debug bridge |
| `packages/evals` | Build/functional/design/data/systems eval layers, CI thresholds, regression reports |
| `apps/cli` | `game-harness` CLI entry point |
| `apps/studio` | React UI for tasks/evals/screenshots (optional) |
| `templates/phaser-game` | Handlebars template — arcade/platformer/shooter/puzzle games |
| `templates/data-driven-game` | Handlebars template — deckbuilders/roguelikes/RPGs/strategy games |

## Monorepo commands

```bash
pnpm build          # build all packages (Turbo handles order)
pnpm typecheck      # typecheck all packages
pnpm test           # run all tests (requires ANTHROPIC_API_KEY)
pnpm dev            # watch mode per package
pnpm clean          # remove all build artifacts
```
