extends CanvasLayer

const TOGGLE_KEY := KEY_F3
const COPY_KEY := KEY_F4
const SCENE_POLL_INTERVAL := 0.2
const DEFAULT_MAX_LOG_ENTRIES := 12
const DEFAULT_VISIBLE_PROBLEM_COUNT := 6

var _active := false
var _visible_requested := false
var _scene_poll_elapsed := 0.0
var _current_scene_name := "none"
var _scene_history: Array[String] = []
var _message_entries: Array[Dictionary] = []

var _panel: PanelContainer
var _content_label: RichTextLabel

func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	_active = _should_enable_runtime_overlay()
	_visible_requested = _active and (
		bool(ProjectSettings.get_setting("debug_overlay/start_visible", false))
		or _is_harness_test_mode()
	)
	_build_ui()
	_record_current_scene()
	_connect_event_bus()
	_refresh_visibility()
	_refresh_text()
	set_process(true)
	set_process_input(true)

func _input(event: InputEvent) -> void:
	if not _active:
		return
	if not event is InputEventKey:
		return
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo:
		return
	if key_event.keycode == TOGGLE_KEY:
		_visible_requested = not _visible_requested
		_refresh_visibility()
		_refresh_text()
	elif key_event.keycode == COPY_KEY:
		copy_snapshot_to_clipboard()

func _process(delta: float) -> void:
	_scene_poll_elapsed += delta
	if _scene_poll_elapsed >= SCENE_POLL_INTERVAL:
		_scene_poll_elapsed = 0.0
		_record_current_scene()
	if _panel.visible:
		_refresh_text()

func push_error_message(source: String, message: String) -> void:
	_append_message("error", source, message)
	push_error("[%s] %s" % [source, message])

func push_warning_message(source: String, message: String) -> void:
	_append_message("warning", source, message)
	push_warning("[%s] %s" % [source, message])

func log_info(source: String, message: String) -> void:
	_append_message("info", source, message)

func copy_snapshot_to_clipboard() -> void:
	DisplayServer.clipboard_set(_build_snapshot_text())
	_append_message("info", "DebugOverlay", "Copied overlay snapshot to clipboard.")
	_refresh_text()

func _build_ui() -> void:
	_panel = PanelContainer.new()
	_panel.name = "DebugOverlayPanel"
	_panel.offset_left = 12.0
	_panel.offset_top = 12.0
	_panel.offset_right = 520.0
	_panel.offset_bottom = 292.0
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_panel)

	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 6)
	_panel.add_child(body)

	var title := Label.new()
	title.text = "Debug Overlay  [F3 toggle | F4 copy]"
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(title)

	_content_label = RichTextLabel.new()
	_content_label.bbcode_enabled = false
	_content_label.fit_content = true
	_content_label.scroll_active = false
	_content_label.selection_enabled = false
	_content_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content_label.custom_minimum_size = Vector2(480.0, 230.0)
	body.add_child(_content_label)

func _refresh_visibility() -> void:
	_panel.visible = _active and _visible_requested

func _refresh_text() -> void:
	if _content_label == null:
		return
	_content_label.text = _build_overlay_text()

func _build_overlay_text() -> String:
	var lines: Array[String] = []
	lines.append("Scene: %s" % _current_scene_name)
	lines.append(
		"Run: act %d floor %d hp %d/%d gold %d deck %d relics %d" % [
			RunStateManager.act,
			RunStateManager.floor_number,
			RunStateManager.current_hp,
			RunStateManager.max_hp,
			RunStateManager.gold,
			RunStateManager.deck.size(),
			RunStateManager.relics.size(),
		]
	)
	lines.append(
		"Meta: started %d completed %d high_score %d" % [
			GameState.runs_started,
			GameState.runs_completed,
			GameState.high_score,
		]
	)
	lines.append("Recent warnings/errors:")
	var problem_lines := _get_problem_lines()
	if problem_lines.is_empty():
		lines.append("  none")
	else:
		for line in problem_lines:
			lines.append("  %s" % line)
	return PackedStringArray(lines).join("\n")

func _build_snapshot_text() -> String:
	var lines: Array[String] = []
	lines.append("scene=%s" % _current_scene_name)
	lines.append(
		"run act=%d floor=%d hp=%d/%d gold=%d deck=%d relics=%d" % [
			RunStateManager.act,
			RunStateManager.floor_number,
			RunStateManager.current_hp,
			RunStateManager.max_hp,
			RunStateManager.gold,
			RunStateManager.deck.size(),
			RunStateManager.relics.size(),
		]
	)
	lines.append(
		"meta started=%d completed=%d high_score=%d" % [
			GameState.runs_started,
			GameState.runs_completed,
			GameState.high_score,
		]
	)
	if not _scene_history.is_empty():
		lines.append("scene_history=%s" % ", ".join(_scene_history))
	lines.append("messages:")
	for entry in _message_entries:
		lines.append(
			"[%s] %s: %s" % [
				String(entry.get("level", "info")).to_upper(),
				String(entry.get("source", "unknown")),
				String(entry.get("message", "")),
			]
		)
	return PackedStringArray(lines).join("\n")

func _get_problem_lines() -> Array[String]:
	var visible_problem_count := int(
		ProjectSettings.get_setting("debug_overlay/visible_problem_count", DEFAULT_VISIBLE_PROBLEM_COUNT)
	)
	var lines: Array[String] = []
	for i in range(_message_entries.size() - 1, -1, -1):
		var entry := _message_entries[i]
		var level := String(entry.get("level", "info"))
		if level != "warning" and level != "error":
			continue
		lines.append(
			"[%s] %s: %s" % [
				level.to_upper(),
				String(entry.get("source", "unknown")),
				String(entry.get("message", "")),
			]
		)
		if lines.size() >= visible_problem_count:
			break
	lines.reverse()
	return lines

func _append_message(level: String, source: String, message: String) -> void:
	var entry := {
		"level": level,
		"source": source,
		"message": message,
		"scene": _current_scene_name,
		"timestamp_ms": Time.get_ticks_msec(),
	}
	_message_entries.append(entry)
	var max_log_entries := int(ProjectSettings.get_setting("debug_overlay/max_log_entries", DEFAULT_MAX_LOG_ENTRIES))
	while _message_entries.size() > max_log_entries:
		_message_entries.remove_at(0)
	if EventBus.has_signal("debug_message_logged"):
		EventBus.debug_message_logged.emit(level, source, message)

func _record_current_scene() -> void:
	var current_scene := get_tree().current_scene
	var scene_name := current_scene.name if current_scene != null else "none"
	if scene_name == _current_scene_name:
		return
	_current_scene_name = scene_name
	if _scene_history.is_empty() or _scene_history[_scene_history.size() - 1] != scene_name:
		_scene_history.append(scene_name)
		while _scene_history.size() > 8:
			_scene_history.remove_at(0)
	log_info("SceneTree", "Current scene -> %s" % scene_name)

func _connect_event_bus() -> void:
	EventBus.run_started.connect(func() -> void:
		log_info("RunStateManager", "Run started.")
	)
	EventBus.run_ended.connect(func(victory: bool) -> void:
		log_info("RunStateManager", "Run ended. victory=%s" % str(victory))
	)
	EventBus.node_visited.connect(func(node_type: String, floor_number: int) -> void:
		log_info("RunStateManager", "Visited %s on floor %d." % [node_type, floor_number])
	)

func _should_enable_runtime_overlay() -> bool:
	if not bool(ProjectSettings.get_setting("debug_overlay/enabled", true)):
		return false
	return OS.is_debug_build() or _is_harness_test_mode() or bool(
		ProjectSettings.get_setting("debug_overlay/enabled_in_release", false)
	)

func _is_harness_test_mode() -> bool:
	var user_args: PackedStringArray = OS.get_cmdline_user_args()
	if "--harness-test" in user_args:
		return true
	return "--harness-test" in OS.get_cmdline_args()
