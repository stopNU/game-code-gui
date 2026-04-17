## GameState — meta game state (Autoload singleton)
## Stores settings and high scores across runs.
extends Node

const SAVE_PATH := "user://game_state.json"

var master_volume: float = 1.0
var sfx_volume: float = 1.0
var music_volume: float = 0.7
var high_score: int = 0
var runs_completed: int = 0
var runs_started: int = 0

func _ready() -> void:
	load_state()

func save_state() -> void:
	var data: Dictionary = {
		"master_volume": master_volume,
		"sfx_volume": sfx_volume,
		"music_volume": music_volume,
		"high_score": high_score,
		"runs_completed": runs_completed,
		"runs_started": runs_started,
	}
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))

func load_state() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var file: FileAccess = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		return
	master_volume = parsed.get("master_volume", 1.0)
	sfx_volume = parsed.get("sfx_volume", 1.0)
	music_volume = parsed.get("music_volume", 0.7)
	high_score = parsed.get("high_score", 0)
	runs_completed = parsed.get("runs_completed", 0)
	runs_started = parsed.get("runs_started", 0)

func record_run_start() -> void:
	runs_started += 1
	save_state()

func record_run_end(score: int) -> void:
	runs_completed += 1
	if score > high_score:
		high_score = score
	save_state()
