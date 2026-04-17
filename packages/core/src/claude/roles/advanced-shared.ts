/**
 * Shared GDScript pattern blocks for Godot 4 deckbuilder roles.
 * Imported by advanced-gameplay.ts and systems.ts.
 */

export const ADVANCED_SHARED_EVENTBUS = `## EventBus (Autoload singleton)

The EventBus autoload is pre-registered in project.godot. Use its signals for all game events.

Emit:   EventBus.card_played.emit(card_id, target_id)
Listen: EventBus.card_played.connect(_on_card_played)

All signals are defined in src/autoload/EventBus.gd - do NOT invent new ones. Add to EventBus.gd if a needed signal is missing.

Key signals:
- card_played(card_id, target_id), card_drawn(card_id), card_discarded(card_id)
- turn_started(is_player_turn), turn_ended(is_player_turn), energy_changed(current, maximum)
- combat_started(enemy_ids), combat_ended(victory)
- damage_dealt(source_id, target_id, amount), damage_taken(entity_id, amount, new_hp)
- block_gained(entity_id, amount), entity_died(entity_id)
- status_applied(entity_id, status_id, stacks), status_removed(entity_id, status_id)
- hp_changed(entity_id, new_hp, max_hp), run_state_changed(field, value)`;

export const ADVANCED_SHARED_FSM = `## State patterns in GDScript

Use an enum + match statement for state machines. Example for CombatScene:

\`\`\`gdscript
enum CombatState { IDLE, PLAYER_TURN, RESOLVING, ENEMY_TURN, VICTORY, DEFEAT }
var _state: CombatState = CombatState.IDLE

func _set_state(new_state: CombatState) -> void:
    _state = new_state
    match _state:
        CombatState.PLAYER_TURN:
            _start_player_turn()
        CombatState.ENEMY_TURN:
            _start_enemy_turn()
        CombatState.VICTORY:
            _on_victory()
        CombatState.DEFEAT:
            _on_defeat()
\`\`\`

Always transition via _set_state() - never write to _state directly.`;

export const ADVANCED_SHARED_RUNTIME_AUTHORITY = `## Runtime authority and active-file verification

Before editing any runtime code, identify the authoritative project-relative path for the subsystem you are touching and use that exact path in your reasoning and summary.

Rules:
- Confirm scene, autoload, and runtime file references against the runtime manifest and reconciliation report before editing
- Treat project.godot, the active .tscn, and the manifest/reconciliation paths as the source of truth for what is live
- When changing flow code, scene transitions, autoload wiring, or startup/combat progression, read the active .tscn and project.godot first
- Prefer the file path marked active or authoritative; do not edit similarly named legacy, duplicate, or inactive files
- If multiple files look relevant, explicitly call out which one is authoritative before making changes`;
