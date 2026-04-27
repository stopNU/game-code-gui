extends Node2D

## Phase 1 prototype scene for the assets-compiler skeletal-enemy bundle format.
## Loads a generated enemy.tscn, plays each stock animation in turn, and prints
## status to stdout. Not part of the regular game flow — wired into the boot
## flow only when the harness asks for it.
##
## Bundle path can be overridden via OS user args:
##   godot --headless --path . -- --enemy res://path/to/enemy.tscn

const DEFAULT_BUNDLE := "res://src/assets/generated/enemies/sample_humanoid/enemy.tscn"
const ANIM_SEQUENCE := ["idle", "attack", "hit", "death"]

var _enemy: Node2D = null
var _player: AnimationPlayer = null
var _seq_index := 0

func _ready() -> void:
	var bundle_path := _resolve_bundle_path()
	var packed: PackedScene = load(bundle_path) as PackedScene
	if packed == null:
		printerr("EnemySkeletalDemo: could not load %s" % bundle_path)
		return
	_enemy = packed.instantiate() as Node2D
	if _enemy == null:
		printerr("EnemySkeletalDemo: instantiate failed")
		return
	_enemy.position = Vector2(get_viewport_rect().size.x * 0.5, get_viewport_rect().size.y * 0.6)
	add_child(_enemy)

	_player = _enemy.get_node_or_null("AnimationPlayer") as AnimationPlayer
	if _player == null:
		printerr("EnemySkeletalDemo: bundle is missing AnimationPlayer")
		return
	_player.animation_finished.connect(_on_anim_finished)
	_play_next()

func _resolve_bundle_path() -> String:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size() - 1):
		if args[i] == "--enemy":
			return args[i + 1]
	return DEFAULT_BUNDLE

func _play_next() -> void:
	var name: String = ANIM_SEQUENCE[_seq_index]
	if _player.has_animation(name):
		print("EnemySkeletalDemo: playing %s" % name)
		_player.play(name)
	else:
		printerr("EnemySkeletalDemo: bundle missing animation '%s'" % name)
		_advance()

func _on_anim_finished(_n: StringName) -> void:
	_advance()

func _advance() -> void:
	_seq_index = (_seq_index + 1) % ANIM_SEQUENCE.size()
	_play_next()
