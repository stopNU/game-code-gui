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
		"bones": [],
		"meshes": [],
		"animations": [],
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

	var skeleton: Skeleton2D = instance.get_node_or_null("Skeleton") as Skeleton2D
	if skeleton == null:
		report["errors"].append("Skeleton2D not found at 'Skeleton'")
	else:
		_collect_bones(skeleton, report["bones"])
		_collect_meshes(skeleton, report["meshes"])

	var anim_player: AnimationPlayer = instance.get_node_or_null("AnimationPlayer") as AnimationPlayer
	if anim_player == null:
		report["errors"].append("AnimationPlayer not found at 'AnimationPlayer'")
	else:
		for anim_name in anim_player.get_animation_list():
			var clip: Animation = anim_player.get_animation(anim_name)
			report["animations"].append({
				"name": String(anim_name),
				"length": clip.length,
				"track_count": clip.get_track_count(),
				"loop_mode": int(clip.loop_mode),
			})

	report["ok"] = report["errors"].is_empty()
	_write_report(report_path, report)
	get_tree().quit(0 if report["ok"] else 1)

func _collect_bones(node: Node, out: Array) -> void:
	for child in node.get_children():
		if child is Bone2D:
			out.append({
				"name": child.name,
				"path": String(child.get_path()),
			})
			_collect_bones(child, out)
		else:
			_collect_bones(child, out)

func _collect_meshes(node: Node, out: Array) -> void:
	for child in node.get_children():
		if child is Polygon2D:
			out.append({
				"name": child.name,
				"path": String(child.get_path()),
				"polygon_size": child.polygon.size(),
			})
		_collect_meshes(child, out)

func _write_report(path: String, data: Dictionary) -> void:
	if path.is_empty():
		print(JSON.stringify(data))
		return
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		printerr("could not open %s for writing" % path)
		return
	f.store_string(JSON.stringify(data, "  "))
