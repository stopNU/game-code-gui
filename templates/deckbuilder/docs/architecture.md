# {{gameTitle}} — Architecture

## Stack
- **Engine**: Godot 4.3 (GDScript)
- **Distribution**: Windows .exe via export templates

## Autoloads (Singletons)
| Name | File | Purpose |
|------|------|---------|
| EventBus | src/autoload/EventBus.gd | Game-wide signal bus |
| ContentLoader | src/autoload/ContentLoader.gd | Load cards/enemies/relics from JSON |
| RunStateManager | src/autoload/RunStateManager.gd | Current run state (HP, deck, gold, floor) |
| GameState | src/autoload/GameState.gd | Meta state (settings, high scores) |
| DebugOverlay | src/autoload/DebugOverlay.gd | Runtime overlay for scene/state and recent warnings/errors |
| HarnessPlugin | src/autoload/HarnessPlugin.gd | Test harness (headless state output) |

## Debug Overlay
- Available by default in debug builds and harness test runs.
- Toggle with `F3` and copy a text snapshot with `F4`.
- Release exports keep it disabled unless `debug_overlay/enabled_in_release=true` is set in `project.godot`.

## Scene Flow
```
BootScene → MainMenuScene → MapScene → CombatScene
                                     → CardRewardScene
                                     → ShopScene
                                     → RestScene
                              └────→ RunSummaryScene
```

## Data
All game content lives in `src/data/content/` as JSON arrays.
Each entry has `id`, `name`, and `artPrompt` fields.
After `game-harness generate-assets`, entries also have `artKey` pointing to `src/assets/generated/`.

## Systems
| File | Purpose |
|------|---------|
| CombatEngine.gd | Turn loop: player → enemy → death check |
| CardZoneManager.gd | draw/hand/discard/exhaust piles |
| DamageCalculator.gd | damage with strength/vulnerable/weak modifiers |
| EnemyAI.gd | weighted intent selection with repeat cap |
| StatusEffectSystem.gd | EventBus-driven status apply/tick/expire |
| MapGenerator.gd | 3-act layered node graph |
