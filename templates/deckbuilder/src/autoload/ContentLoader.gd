## ContentLoader — loads all game content from JSON files (Autoload singleton)
## Call load_all() once in BootScene before accessing any content.
## Usage:
##   ContentLoader.get_cards()           → Array[Dictionary]
##   ContentLoader.get_card_by_id("strike") → Dictionary
extends Node

var _cards: Array[Dictionary] = []
var _enemies: Array[Dictionary] = []
var _relics: Array[Dictionary] = []
var _status_effects: Array[Dictionary] = []
var _loaded := false

## Load all content JSON files. Call once in BootScene.create().
func load_all() -> void:
	_cards = _load_json("res://src/data/content/cards.json")
	_enemies = _load_json("res://src/data/content/enemies.json")
	_relics = _load_json("res://src/data/content/relics.json")
	_status_effects = _load_json("res://src/data/content/status_effects.json")
	_loaded = true
	print("[ContentLoader] Loaded: %d cards, %d enemies, %d relics, %d statuses" % [
		_cards.size(), _enemies.size(), _relics.size(), _status_effects.size()
	])

func get_cards() -> Array[Dictionary]:
	return _cards

func get_enemies() -> Array[Dictionary]:
	return _enemies

func get_relics() -> Array[Dictionary]:
	return _relics

func get_status_effects() -> Array[Dictionary]:
	return _status_effects

func get_card_by_id(id: String) -> Dictionary:
	for card in _cards:
		if card.get("id", "") == id:
			return card
	return {}

func get_enemy_by_id(id: String) -> Dictionary:
	for enemy in _enemies:
		if enemy.get("id", "") == id:
			return enemy
	return {}

func get_relic_by_id(id: String) -> Dictionary:
	for relic in _relics:
		if relic.get("id", "") == id:
			return relic
	return {}

func get_status_by_id(id: String) -> Dictionary:
	for status in _status_effects:
		if status.get("id", "") == id:
			return status
	return {}

func is_loaded() -> bool:
	return _loaded

func _load_json(path: String) -> Array[Dictionary]:
	if not FileAccess.file_exists(path):
		DebugOverlay.push_error_message("ContentLoader", "File not found: %s" % path)
		return []
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		DebugOverlay.push_error_message("ContentLoader", "Cannot open: %s" % path)
		return []
	var text: String = file.get_as_text()
	var parsed: Variant = JSON.parse_string(text)
	if parsed == null or not parsed is Array:
		DebugOverlay.push_error_message("ContentLoader", "Invalid JSON array in: %s" % path)
		return []
	var result: Array[Dictionary] = []
	for item in parsed:
		if item is Dictionary:
			result.append(item)
	return result
