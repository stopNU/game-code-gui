extends Control

@onready var start_new_run_button: Button = $Center/Menu/StartNewRunButton

func _ready() -> void:
	start_new_run_button.pressed.connect(_on_start_new_run_pressed)

func start_new_run_from_harness() -> void:
	_on_start_new_run_pressed()

func _on_start_new_run_pressed() -> void:
	get_tree().change_scene_to_file("res://src/scenes/CharacterSelectScene.tscn")
