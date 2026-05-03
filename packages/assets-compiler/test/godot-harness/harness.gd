extends Node

# Loads a generated enemy bundle and reports its structure as JSON to a file.
# Invocation:
#   godot --headless --path <this-dir> -- --enemy <abs-path-to-enemy.tscn> --report <abs-path-to-report.json>

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var enemy_path := ""
	var report_path := ""
	var i := 0
	while i < args.size():
		var a: String = args[i]
		if a == "--enemy" and i + 1 < args.size():
			enemy_path = args[i + 1]
			i += 2
		elif a == "--report" and i + 1 < args.size():
			report_path = args[i + 1]
			i += 2
		else:
			i += 1

	var report := {
		"ok": false,
		"loaded": false,
		"enemyPath": enemy_path,
		"errors": [],
		"hasSprite": false,
		"hasGroundAnchor": false,
		"spriteOffset": [0.0, 0.0],
	}

	if enemy_path.is_empty() or report_path.is_empty():
		report["errors"].append("missing --enemy or --report arg")
		_write_report(report_path, report)
		get_tree().quit(2)
		return

	var packed: PackedScene = load(enemy_path) as PackedScene
	if packed == null:
		report["errors"].append("ResourceLoader.load returned null/non-PackedScene for %s" % enemy_path)
		_write_report(report_path, report)
		get_tree().quit(3)
		return
	report["loaded"] = true

	var instance: Node = packed.instantiate()
	if instance == null:
		report["errors"].append("instantiate() returned null")
		_write_report(report_path, report)
		get_tree().quit(4)
		return
	add_child(instance)

	var sprite: Sprite2D = instance.get_node_or_null("Sprite") as Sprite2D
	if sprite == null:
		report["errors"].append("Sprite2D not found at 'Sprite'")
	else:
		report["hasSprite"] = true
		report["spriteOffset"] = [sprite.offset.x, sprite.offset.y]
		if sprite.texture == null:
			report["errors"].append("Sprite2D has no texture")

	var anchor: Marker2D = instance.get_node_or_null("GroundAnchor") as Marker2D
	if anchor == null:
		report["errors"].append("Marker2D not found at 'GroundAnchor'")
	else:
		report["hasGroundAnchor"] = true

	report["ok"] = report["errors"].is_empty()
	_write_report(report_path, report)
	get_tree().quit(0 if report["ok"] else 1)

func _write_report(path: String, data: Dictionary) -> void:
	if path.is_empty():
		print(JSON.stringify(data))
		return
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		printerr("could not open %s for writing" % path)
		return
	f.store_string(JSON.stringify(data, "  "))
