extends Control

const STARTER_DECKS := {
	"vanguard": ["strike", "strike", "defend", "defend", "guard_break"],
	"arcanist": ["spark", "spark", "shield", "focus", "nova"],
}

@onready var selection_label: Label = $Center/Panel/SelectionLabel
@onready var vanguard_button: Button = $Center/Panel/CharacterButtons/VanguardButton
@onready var arcanist_button: Button = $Center/Panel/CharacterButtons/ArcanistButton
@onready var confirm_button: Button = $Center/Panel/ConfirmButton

var selected_character: String = "vanguard"

func _ready() -> void:
	vanguard_button.pressed.connect(func() -> void:
		select_character("vanguard")
	)
	arcanist_button.pressed.connect(func() -> void:
		select_character("arcanist")
	)
	confirm_button.pressed.connect(_on_confirm_pressed)
	_refresh_selection_label()

func select_character(character_id: String) -> void:
	if not STARTER_DECKS.has(character_id):
		return
	selected_character = character_id
	_refresh_selection_label()

func confirm_selection_from_harness(character_id: String = "vanguard") -> void:
	select_character(character_id)
	_on_confirm_pressed()

func _on_confirm_pressed() -> void:
	var starter_deck: Array = []
	if STARTER_DECKS.has(selected_character):
		starter_deck = STARTER_DECKS[selected_character].duplicate()
	else:
		starter_deck = STARTER_DECKS["vanguard"].duplicate()
	RunStateManager.start_new_run(starter_deck)
	GameState.record_run_start()
	get_tree().change_scene_to_file("res://src/scenes/MapScene.tscn")

func _refresh_selection_label() -> void:
	selection_label.text = "Selected: %s" % selected_character.capitalize()
