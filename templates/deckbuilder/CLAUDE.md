# Generated Godot project — agent rules

This is a **generated Godot 4 GDScript deckbuilder** scaffolded from `templates/deckbuilder` by the agent-harness toolchain. It is **not** part of the harness TypeScript code.

## GitNexus

**Do not call any `gitnexus_*` MCP tool while working in this directory.** GitNexus indexes only the harness TS/JS code in the parent monorepo (`packages/`, `apps/`). It has no symbols, call graphs, or processes for any file here. Calls will return empty results or fail; retrying wastes time.

For navigation and impact assessment in this project, use:

- `Read` for `.gd` / `.tscn` / `.tres` / `.json` files
- `Grep` for symbol/identifier search across the project
- `.tscn` files as the source of truth for the scene tree (the script's `@onready var x = $A/B/C` paths must match a real node path inside the corresponding scene)
- The Godot error log itself — it names the exact failing node path or property

## Verification, not impact analysis

Before editing a `.gd` file, the relevant safety check is:

1. Read the failing scene's `.tscn` to confirm the node tree.
2. Grep for the symbol across `src/` to find all references and other places the same pattern is used.
3. After editing, run `godot --headless --check-only --path .` for syntax, then a real launch to verify the runtime behaviour.

## Common Godot 4 gotchas (not exhaustive)

- `node.theme_override_constants.x = v` is **not** a runtime property write — it only works as a `.tscn` declaration. At runtime use `node.add_theme_constant_override("x", v)`. Same pattern for `theme_override_colors`, `theme_override_styles`, `theme_override_fonts`, `theme_override_font_sizes`.
- `@onready var x = $A/B/C` evaluates **once**, on `_ready()`. If a scene path changes, the var stays `null`; add a defensive check at the call site or re-resolve with `get_node_or_null()`.
- Signals declared in autoloads must be emitted through the autoload (`EventBus.foo.emit(...)`) and connected via `EventBus.foo.connect(callable)`.
- `FileAccess.open("user://...", FileAccess.WRITE)` for save data — never `localStorage` or any web/Electron API.

## Headless test contract

The harness expects `harness/test-output.json` and `harness/screenshot.png` to be written by `HarnessPlugin.gd` after a 4-second wait when launched with `--harness-test`. Don't break that contract while editing.
