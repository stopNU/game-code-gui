extends Node2D

## Demo scene for the assets-compiler static-sprite enemy bundle format.
## Loads a generated enemy.tscn and plants it on a floor Y. Not part of the
## regular game flow — wired into the boot flow only when the harness asks
## for it.
##
## Bundle path can be overridden via OS user args:
##   godot --headless --path . -- --enemy res://path/to/enemy.tscn

const DEFAULT_BUNDLE := "res://src/assets/generated/enemies/sample_humanoid/enemy.tscn"

var _enemy: Node2D = null

func _ready() -> void:
	var bundle_path := _resolve_bundle_path()
	var packed: PackedScene = load(bundle_path) as PackedScene
	if packed == null:
		printerr("EnemySpriteDemo: could not load %s" % bundle_path)
		return
	_enemy = packed.instantiate() as Node2D
	if _enemy == null:
		printerr("EnemySpriteDemo: instantiate failed")
		return
	# Plant the enemy: parent's origin is the foot-center of the figure, so
	# placing it at (centerX, floorY) drops the sprite cleanly on the floor.
	var viewport := get_viewport_rect().size
	_enemy.position = Vector2(viewport.x * 0.5, viewport.y * 0.85)
	add_child(_enemy)
	print("EnemySpriteDemo: loaded %s" % bundle_path)

func _resolve_bundle_path() -> String:
	var args := OS.get_cmdline_user_args()
	for i in range(args.size() - 1):
		if args[i] == "--enemy":
			return args[i + 1]
	return DEFAULT_BUNDLE
