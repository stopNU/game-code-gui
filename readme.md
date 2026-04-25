# agent-harness

Pnpm + Turborepo monorepo that takes a text brief and produces a playable Godot 4 GDScript deckbuilder roguelike via AI agent loops, automated playtesting, and eval gates.

## Requirements

- Node >= 22
- pnpm >= 9
- Godot 4.x installed
- `GODOT_PATH` if `godot` is not already on `PATH`
- `ANTHROPIC_API_KEY`
- `FAL_KEY` optional for real art generation via fal.ai; placeholder PNGs are used when absent

## Setup

```bash
pnpm install
pnpm build
```

After building, run the CLI with:

```bash
node apps/cli/bin/game-harness.js --help
```

## Monorepo commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm dev
pnpm clean
```

## Studio desktop app

`apps/studio` is the Electron-based desktop shell for the harness. It is no longer a placeholder React page set.

Current Studio capabilities:

- Start screen (project picker) → Focus Mode workspace with flush side panels
- Conversational agent UI with Anthropic/OpenAI top-level provider selection
- Persisted conversations, projects, approvals, and task plans in SQLite
- ▶ Launch / ■ Stop Godot in the top bar; ⊟ ⊞ toggles for sidebar and status panel
- Live log strip in the left sidebar; full Godot controls in the right panel
- Settings tabs for Workspace, API Keys, LangSmith, Godot, and About
- Keyboard shortcuts: `Ctrl/Cmd+N` new conversation, `Ctrl/Cmd+,` settings, `Esc` abort active run
- LangSmith tracing via standard env vars (`LANGCHAIN_TRACING_V2`) — enabled per turn in settings

Useful Studio commands:

```bash
pnpm --filter @agent-harness/studio run dev
pnpm --filter @agent-harness/studio run typecheck
pnpm --filter @agent-harness/studio run test:unit
pnpm --filter @agent-harness/studio run build
pnpm --filter @agent-harness/studio run package:win
```

## CLI overview

`game-harness` is a Godot-first CLI. There is no Phaser mode and no simple/advanced product split in the generated game output anymore.

### `new-game`

Scaffold a new Godot 4 deckbuilder roguelike from a text brief, generate a plan, install dependencies, and run the implementation loop unless `--plan-only` is set.

```bash
game-harness new-game
game-harness new-game --brief "A cursed forest deckbuilder about trading health for combo turns"
game-harness new-game --brief-file ./design-doc.md
game-harness new-game --brief "..." --output ./my-game
game-harness new-game --brief "..." --plan-only
```

Flags:

| Flag | Description |
|---|---|
| `-n, --name <name>` | Game name used for the default output folder |
| `-b, --brief <text>` | Game description |
| `--brief-file <path>` | Markdown brief file |
| `-o, --output <path>` | Output directory |
| `--plan-only` | Scaffold and plan only; skip implementation |

### `plan-game`

Scaffold the project, install dependencies, and print the implementation plan without running the build/implementation loop.

```bash
game-harness plan-game
game-harness plan-game --brief "A frost-themed deckbuilder with summonable spirits"
game-harness plan-game --brief-file ./brief.md --output ./my-game
```

### `implement-task`

Run the agent loop for a single task, or resume the full remaining task DAG.

```bash
game-harness implement-task -p ./my-game --task implement-card-library
game-harness implement-task -p ./my-game --resume
game-harness implement-task -p ./my-game --resume --concurrency 5
game-harness implement-task -p ./my-game --resume --model sonnet
game-harness implement-task -p ./my-game --resume --reconciliation-report harness/runtime-reconciliation-report.json
```

Flags:

| Flag | Description |
|---|---|
| `-p, --project <path>` | Game project path |
| `-t, --task <id>` | Task ID from `harness/tasks.json` |
| `--resume` | Resume from remaining incomplete tasks |
| `--concurrency <n>` | Parallel task limit in resume mode, default `3` |
| `--model <model>` | Model shorthand or full model ID |
| `--reconciliation-report <path>` | Runtime reconciliation report path relative to the project |

Supported model shorthands:

- `sonnet` -> `claude-sonnet-4-6`
- `opus` -> `claude-opus-4-6`
- `haiku` -> `claude-haiku-4-5-20251001`
- `codex` -> `gpt-5.4`
- `subscription` -> `claude-sonnet-4-6-sub`

### `plan-feature`

Append new feature work to `harness/tasks.json`.

```bash
game-harness plan-feature -p ./my-game --feature "Add a relic drafting screen after each boss"
```

### `run-playtest`

Run the Godot headless critical-flow smoke test and read `harness/test-output.json`.

```bash
game-harness run-playtest -p ./my-game
game-harness run-playtest -p ./my-game --timeout 30000
```

### `run-evals`

Run eval layers against the generated project.

```bash
game-harness run-evals -p ./my-game
game-harness run-evals -p ./my-game --layer build
game-harness run-evals -p ./my-game --layer deckbuilder
game-harness run-evals -p ./my-game --baseline ./old-report.json
```

Flags:

| Flag | Description |
|---|---|
| `-p, --project <path>` | Game project path |
| `-l, --layer <name>` | `build`, `data`, `systems`, `deckbuilder`, `functional`, `design`, or `all` |
| `--dataset <path>` | Custom eval dataset |
| `--baseline <path>` | Baseline report for regression comparison |
| `--no-fail-on-threshold` | Do not exit with code 1 on threshold failure |

### `generate-assets`

Generate art via fal.ai or placeholders. Use `--content` to read `artPrompt` fields from content JSON, or `--request` for a single asset.

```bash
game-harness generate-assets -p ./my-game --content
game-harness generate-assets -p ./my-game --content --style "moody painted fantasy, high readability UI art"
game-harness generate-assets -p ./my-game -r "glowing cursed sword icon" --key relic_cursed_sword --width 64 --height 64
```

Flags:

| Flag | Description |
|---|---|
| `-p, --project <path>` | Game project path |
| `-c, --content` | Generate art for content entries with `artPrompt` |
| `--style <text>` | Style guide applied to content prompts |
| `-r, --request <text>` | Single asset prompt |
| `--type <type>` | Asset type, default `image` |
| `--key <key>` | Asset key |
| `--width <px>` | Width, default `256` |
| `--height <px>` | Height, default `256` |

Without `FAL_KEY`, placeholder assets are generated and still registered.

### Runtime inspection commands

```bash
game-harness reconcile-runtime -p ./my-game
game-harness runtime-log -p ./my-game
game-harness runtime-log -p ./my-game --mode smoke
game-harness inspect-scenes -p ./my-game
game-harness verify-project -p ./my-game
```

- `reconcile-runtime` writes a read-only repair plan report for runtime drift
- `runtime-log` shows the latest captured runtime log path and error summary
- `inspect-scenes` prints compact scene-binding and instantiation status JSON
- `verify-project` runs the generated-project verification suite and writes a JSON report

## Typical workflow

```bash
# 1. Scaffold and implement a game
game-harness new-game --brief "A dark fantasy deckbuilder where relics mutate your hand each turn" --output ./my-game

# 2. Run the smoke test
game-harness run-playtest -p ./my-game

# 3. Run evals
game-harness run-evals -p ./my-game

# 4. Generate content art
game-harness generate-assets -p ./my-game --content

# 5. Resume remaining work if needed
game-harness implement-task -p ./my-game --resume
```

## Generated project conventions

Generated projects are Godot 4 GDScript deckbuilder roguelikes built from the `templates/deckbuilder` template.

Key conventions:

- Autoloads in `project.godot`: `EventBus`, `ContentLoader`, `RunStateManager`, `GameState`, `HarnessPlugin`
- Content data lives in `src/data/content/{cards,enemies,relics,status_effects}.json`
- Every content entry must include `id`, `artPrompt`, and `artKey`
- Generated art keys use `{type}_{id}` and write PNGs to `src/assets/generated/{artKey}.png`
- Save data uses `user://run_save.json`
- Headless smoke tests use `godot --headless --path . -- --harness-test`
- The harness writes `harness/test-output.json` and `harness/screenshot.png`
- Deckbuilder UI uses `Control` nodes, not physics-driven gameplay

Useful Godot commands inside a generated project:

```bash
godot --path .
godot --headless --check-only --path .
godot --headless --path . -- --harness-test
godot --headless --export-release "Windows Desktop" builds/game.exe --path .
```

## Eval layers

| Layer | What it checks | CI threshold |
|---|---|---|
| `build` | Godot syntax/build validation | pass rate 100% |
| `data` | content JSON validity and required fields | score >= 6/10 |
| `systems` | expected GDScript system/autoload structure | score >= 6/10 |
| `deckbuilder` | card/enemy/relic counts and content coverage | score >= 6/10 |
| `functional` | stub for headless playtest-driven checks | pending |
| `design` | stub for screenshot/judge checks | pending |

## Package layout

| Package | Purpose |
|---|---|
| `packages/core` | Agent loop, types, Claude client, prompts, planner, memory, tracing |
| `packages/tools` | Tool contracts for fs, code, npm, git |
| `packages/game-adapter` | Godot scaffolder, template registry, build runner, runtime inspection |
| `packages/assets` | fal.ai image pipeline with placeholder fallback |
| `packages/playtest` | Godot headless smoke test runner |
| `packages/evals` | Eval layers, CI thresholds, regression reports |
| `apps/cli` | `game-harness` CLI |
| `apps/studio` | Electron desktop app for conversational orchestration, approvals, Godot launch/logs, settings, updates, and tracing |
| `templates/deckbuilder` | Godot 4 deckbuilder roguelike template |

## Notes

- `exactOptionalPropertyTypes` is enabled across the repo
- Use `writeFile` + `JSON.stringify` instead of `fs-extra` `writeJson`
- `simple-git` should be imported as `import { simpleGit } from 'simple-git'`
- `ALL_TOOLS` should be typed as `ToolContract<any, any>[]`
- Build order is handled by Turbo across the workspace

## Known drift to clean up

The docs now reflect the current Godot/fal.ai workflow and the Electron-based Studio app. Keep future implementation changes aligned with this workflow so the code and docs stay in sync end to end.
