## RunStateManager — current run state (Autoload singleton)
## Tracks HP, gold, deck, relics, and floor during a run.
## Save/load uses user:// (OS user data directory).
extends Node

const SAVE_PATH := "user://run_save.json"

var current_hp: int = 70
var max_hp: int = 70
var gold: int = 99
var floor_number: int = 0
var act: int = 1
var deck: Array[String] = []  # card IDs
var relics: Array[String] = []  # relic IDs
var map_progress: Dictionary = {}

## Start a new run with default starter deck.
func start_new_run(starter_deck: Array = []) -> void:
	current_hp = 70
	max_hp = 70
	gold = 99
	floor_number = 0
	act = 1
	deck = []
	for card_id in starter_deck:
		deck.append(String(card_id))
	relics = []
	map_progress = {}
	save_run()
	EventBus.run_started.emit()

func heal(amount: int) -> void:
	current_hp = mini(current_hp + amount, max_hp)
	EventBus.hp_changed.emit("player", current_hp, max_hp)

func take_damage(amount: int) -> void:
	current_hp = maxi(current_hp - amount, 0)
	EventBus.hp_changed.emit("player", current_hp, max_hp)
	if current_hp <= 0:
		EventBus.entity_died.emit("player")

func add_gold(amount: int) -> void:
	gold += amount
	EventBus.gold_changed.emit(amount, gold)

func spend_gold(amount: int) -> bool:
	if gold < amount:
		return false
	gold -= amount
	EventBus.gold_changed.emit(-amount, gold)
	return true

func add_card(card_id: String) -> void:
	deck.append(card_id)
	EventBus.card_added_to_deck.emit(card_id)

func remove_card(card_id: String) -> void:
	deck.erase(card_id)
	EventBus.card_removed_from_deck.emit(card_id)

func add_relic(relic_id: String) -> void:
	relics.append(relic_id)
	EventBus.relic_acquired.emit(relic_id)

func advance_floor() -> void:
	floor_number += 1
	if floor_number > 0 and floor_number % 17 == 0:
		act += 1

func is_alive() -> bool:
	return current_hp > 0

func save_run() -> void:
	var data: Dictionary = to_dict()
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))

func load_run() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed == null or not parsed is Dictionary:
		return false
	from_dict(parsed)
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)

func delete_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))

func to_dict() -> Dictionary:
	return {
		"current_hp": current_hp,
		"max_hp": max_hp,
		"gold": gold,
		"floor_number": floor_number,
		"act": act,
		"deck": deck.duplicate(),
		"relics": relics.duplicate(),
		"map_progress": map_progress.duplicate(),
	}

func from_dict(data: Dictionary) -> void:
	current_hp = data.get("current_hp", 70)
	max_hp = data.get("max_hp", 70)
	gold = data.get("gold", 99)
	floor_number = data.get("floor_number", 0)
	act = data.get("act", 1)
	deck = Array(data.get("deck", []), TYPE_STRING, "", null)
	relics = Array(data.get("relics", []), TYPE_STRING, "", null)
	map_progress = data.get("map_progress", {})
