extends Control

@onready var run_summary_label: Label = $Margin/Content/RunSummaryLabel

func _ready() -> void:
	var deck_size := RunStateManager.deck.size()
	run_summary_label.text = "Act %d Floor %d | HP %d/%d | Deck %d" % [
		RunStateManager.act,
		RunStateManager.floor_number,
		RunStateManager.current_hp,
		RunStateManager.max_hp,
		deck_size,
	]
