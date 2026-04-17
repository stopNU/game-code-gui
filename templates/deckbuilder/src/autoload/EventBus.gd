## EventBus — game-wide signal bus (Autoload singleton)
## All game events are emitted and connected through here.
## Usage:
##   emit:   EventBus.card_played.emit(card_id, target_id)
##   listen: EventBus.card_played.connect(_on_card_played)
extends Node

# --- Card signals ---
signal card_played(card_id: String, target_id: String)
signal card_drawn(card_id: String)
signal card_discarded(card_id: String)
signal card_exhausted(card_id: String)

# --- Turn signals ---
signal turn_started(is_player_turn: bool)
signal turn_ended(is_player_turn: bool)
signal energy_changed(current: int, maximum: int)

# --- Combat signals ---
signal combat_started(enemy_ids: Array)
signal combat_ended(victory: bool)
signal damage_dealt(source_id: String, target_id: String, amount: int)
signal damage_taken(entity_id: String, amount: int, new_hp: int)
signal block_gained(entity_id: String, amount: int)
signal entity_died(entity_id: String)

# --- Status signals ---
signal status_applied(entity_id: String, status_id: String, stacks: int)
signal status_removed(entity_id: String, status_id: String)
signal status_ticked(entity_id: String, status_id: String, stacks: int)

# --- Run signals ---
signal run_started()
signal run_ended(victory: bool)
signal node_visited(node_type: String, floor_number: int)
signal gold_changed(amount: int, new_total: int)
signal card_added_to_deck(card_id: String)
signal card_removed_from_deck(card_id: String)
signal relic_acquired(relic_id: String)
signal hp_changed(entity_id: String, new_hp: int, max_hp: int)
signal run_state_changed(field: String, value: Variant)
signal debug_message_logged(level: String, source: String, message: String)
