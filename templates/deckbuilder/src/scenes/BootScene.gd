## BootScene — entry point, loads all content then transitions to MainMenuScene.
extends Node

func _ready() -> void:
	ContentLoader.load_all()

	if not ContentLoader.is_loaded():
		DebugOverlay.push_error_message("BootScene", "ContentLoader failed to load content.")
		return

	call_deferred("_go_to_title")

func _go_to_title() -> void:
	get_tree().change_scene_to_file("res://src/scenes/MainMenuScene.tscn")
