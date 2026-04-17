extends Node

const FLOW_CONFIG_PATH := "res://harness/critical-flow.json"
const DEFAULT_STEP_TIMEOUT_MS := 2500
const DEFAULT_VIEWPORT_WIDTH := 1280
const DEFAULT_VIEWPORT_HEIGHT := 720

var _scene_history: Array[String] = []
var _event_log: Array[String] = []
var _error_log: Array[String] = []
var _flow_logs: Array[String] = []

func _ready() -> void:
	_record_current_scene()
	_connect_event_bus()

	if _is_harness_test_mode():
		await _run_harness_test()

func _run_harness_test() -> void:
	var flow_result := await _execute_critical_flow()
	_write_output(flow_result)
	get_tree().quit()

func _connect_event_bus() -> void:
	EventBus.run_started.connect(func() -> void:
		_append_event("run_started")
	)
	EventBus.run_ended.connect(func(victory: bool) -> void:
		_append_event("run_ended:%s" % str(victory))
	)
	EventBus.node_visited.connect(func(node_type: String, floor_number: int) -> void:
		_append_event("node_visited:%s:%d" % [node_type, floor_number])
	)
	EventBus.card_added_to_deck.connect(func(card_id: String) -> void:
		_append_event("card_added_to_deck:%s" % card_id)
	)
	EventBus.relic_acquired.connect(func(relic_id: String) -> void:
		_append_event("relic_acquired:%s" % relic_id)
	)
	EventBus.debug_message_logged.connect(func(level: String, source: String, message: String) -> void:
		if level == "warning" or level == "error":
			_record_error("%s:%s:%s" % [level, source, message])
	)

func _record_current_scene() -> void:
	_record_scene(get_tree().current_scene)

func _record_scene(scene: Node) -> void:
	if scene == null:
		return
	var scene_name := scene.name
	if _scene_history.is_empty() or _scene_history[_scene_history.size() - 1] != scene_name:
		_scene_history.append(scene_name)
		_flow_logs.append("scene:%s" % scene_name)

func _append_event(entry: String) -> void:
	_event_log.append(entry)
	if _event_log.size() > 20:
		_event_log.remove_at(0)

func _append_error(entry: String) -> void:
	_record_error(entry)
	DebugOverlay.push_error_message("HarnessPlugin", entry)

func _record_error(entry: String) -> void:
	_error_log.append(entry)
	if _error_log.size() > 20:
		_error_log.remove_at(0)

func _load_flow_config() -> Dictionary:
	if not FileAccess.file_exists(FLOW_CONFIG_PATH):
		return {}
	var file: FileAccess = FileAccess.open(FLOW_CONFIG_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}

func _user_args() -> PackedStringArray:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.size() > 0:
		return args
	return OS.get_cmdline_args()

func _is_harness_test_mode() -> bool:
	return "--harness-test" in _user_args()

func _resolve_output_path() -> String:
	var args: PackedStringArray = _user_args()
	for i in range(args.size() - 1):
		if args[i] == "--harness-output":
			return String(args[i + 1])
	return "user://test-output.json"

func _execute_critical_flow() -> Dictionary:
	var config := _load_flow_config()
	var result := {
		"name": String(config.get("name", "default-critical-flow")),
		"passed": false,
		"completedSteps": [],
		"logs": _flow_logs.duplicate(),
		"visibilityIssues": [],
		"inputReachabilityIssues": [],
	}

	var steps_variant: Variant = config.get("steps", [])
	if not steps_variant is Array:
		_append_error("Critical flow config is missing a steps array.")
		result["failureStepId"] = "config"
		result["logs"] = _flow_logs.duplicate()
		return result

	var steps: Array = steps_variant
	var default_timeout_ms := int(config.get("timeoutMs", DEFAULT_STEP_TIMEOUT_MS))
	var last_successful_step_id := ""

	for step_variant in steps:
		if not step_variant is Dictionary:
			continue
		var step: Dictionary = step_variant
		var step_id := String(step.get("id", "unknown-step"))
		var step_label := String(step.get("label", step_id))
		var step_type := String(step.get("type", "scene"))
		var timeout_ms := int(step.get("timeoutMs", default_timeout_ms))
		var step_result := {
			"id": step_id,
			"label": step_label,
			"type": step_type,
			"passed": false,
			"scene": get_tree().current_scene.name if get_tree().current_scene else "none",
			"timeoutMs": timeout_ms,
			"timestamp": Time.get_ticks_msec(),
		}

		var ok := false
		var error_text := ""
		if step_type == "scene":
			var expected_scene := String(step.get("scene", ""))
			ok = await _wait_for_scene(expected_scene, timeout_ms)
			step_result["scene"] = get_tree().current_scene.name if get_tree().current_scene else "none"
			if not ok:
				error_text = "Expected scene %s within %dms" % [expected_scene, timeout_ms]
			else:
				var visibility_issues := await _run_visibility_checks_for_scene(expected_scene, config)
				var input_reachability_issues := await _run_input_reachability_checks_for_scene(expected_scene, config)
				if not visibility_issues.is_empty():
					step_result["visibilityIssues"] = visibility_issues
					var result_visibility_issues: Array = result["visibilityIssues"]
					result_visibility_issues.append_array(visibility_issues)
					result["visibilityIssues"] = result_visibility_issues
				if not input_reachability_issues.is_empty():
					step_result["inputReachabilityIssues"] = input_reachability_issues
					var result_input_issues: Array = result["inputReachabilityIssues"]
					result_input_issues.append_array(input_reachability_issues)
					result["inputReachabilityIssues"] = result_input_issues
				if not visibility_issues.is_empty() or not input_reachability_issues.is_empty():
					ok = false
					if not input_reachability_issues.is_empty():
						error_text = String(input_reachability_issues[0].get("message", "Input reachability validation failed"))
					else:
						error_text = String(visibility_issues[0].get("message", "Visibility validation failed"))
				_flow_logs.append("step:%s reached scene %s" % [step_id, expected_scene])
		elif step_type == "action":
			var action_variant: Variant = step.get("action", {})
			if action_variant is Dictionary:
				var action: Dictionary = action_variant
				var action_result: Dictionary = await _execute_action(action)
				ok = bool(action_result.get("ok", false))
				if not ok:
					error_text = String(action_result.get("error", "Unknown action failure"))
				else:
					_flow_logs.append("step:%s action executed" % step_id)
			else:
				error_text = "Action step missing action payload"
		else:
			error_text = "Unsupported critical flow step type: %s" % step_type

		step_result["passed"] = ok
		if not ok:
			step_result["error"] = error_text
			result["failureStepId"] = step_id
			if last_successful_step_id != "":
				result["lastSuccessfulStepId"] = last_successful_step_id
			var completed_steps: Array = result["completedSteps"]
			completed_steps.append(step_result)
			result["completedSteps"] = completed_steps
			_flow_logs.append("step:%s failed: %s" % [step_id, error_text])
			result["logs"] = _flow_logs.duplicate()
			return result
		last_successful_step_id = step_id
		var completed_steps_ok: Array = result["completedSteps"]
		completed_steps_ok.append(step_result)
		result["completedSteps"] = completed_steps_ok

	result["passed"] = true
	if last_successful_step_id != "":
		result["lastSuccessfulStepId"] = last_successful_step_id
	result["logs"] = _flow_logs.duplicate()
	return result

func _wait_for_scene(expected_scene: String, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() <= deadline:
		_record_current_scene()
		var current_scene := get_tree().current_scene
		if current_scene != null and current_scene.name == expected_scene:
			return true
		await get_tree().process_frame
	return false

func _execute_action(action: Dictionary) -> Dictionary:
	var action_type := String(action.get("type", ""))
	if action_type != "call_method":
		return { "ok": false, "error": "Unsupported action type: %s" % action_type }

	var current_scene := get_tree().current_scene
	if current_scene == null:
		return { "ok": false, "error": "No active scene for critical flow action" }

	var method_name := String(action.get("method", ""))
	if method_name == "" or not current_scene.has_method(method_name):
		return { "ok": false, "error": "Scene %s is missing method %s" % [current_scene.name, method_name] }

	var args_variant: Variant = action.get("args", [])
	var args: Array = []
	if args_variant is Array:
		args = args_variant
	current_scene.callv(method_name, args)
	await get_tree().process_frame
	return { "ok": true }

func _run_visibility_checks_for_scene(scene_name: String, config: Dictionary) -> Array:
	var visibility_checks_variant: Variant = config.get("visibilityChecks", [])
	if not visibility_checks_variant is Array:
		return []

	var current_scene := get_tree().current_scene
	if current_scene == null:
		return []

	var issues: Array = []
	for check_variant in visibility_checks_variant:
		if not check_variant is Dictionary:
			continue
		var check: Dictionary = check_variant
		if String(check.get("scene", "")) != scene_name:
			continue

		var scene_label := String(check.get("label", scene_name))
		var viewports_variant: Variant = check.get("viewports", [])
		var controls_variant: Variant = check.get("requiredControls", [])
		var regions_variant: Variant = check.get("requiredRegions", [])
		if not viewports_variant is Array or not controls_variant is Array:
			continue

		var window := get_window()
		var original_size := window.size if window != null else Vector2i(DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT)
		for viewport_variant in viewports_variant:
			if not viewport_variant is Dictionary:
				continue
			var viewport_spec: Dictionary = viewport_variant
			_apply_viewport_size(viewport_spec)
			await get_tree().process_frame
			await get_tree().process_frame
			for control_variant in controls_variant:
				if not control_variant is Dictionary:
					continue
				var control_spec: Dictionary = control_variant
				var issue := _check_required_control_visibility(current_scene, scene_name, scene_label, viewport_spec, control_spec)
				if not issue.is_empty():
					issues.append(issue)
					_flow_logs.append("visibility:%s" % String(issue.get("message", "unknown visibility issue")))
			if regions_variant is Array:
				for region_variant in regions_variant:
					if not region_variant is Dictionary:
						continue
					var region_spec: Dictionary = region_variant
					var region_issue := _check_required_region_visibility(current_scene, scene_name, scene_label, viewport_spec, region_spec)
					if not region_issue.is_empty():
						issues.append(region_issue)
						_flow_logs.append("visibility:%s" % String(region_issue.get("message", "unknown visibility issue")))
		_restore_window_size(original_size)
		await get_tree().process_frame
		await get_tree().process_frame

	return issues

func _run_input_reachability_checks_for_scene(scene_name: String, config: Dictionary) -> Array:
	var reachability_checks_variant: Variant = config.get("inputReachabilityChecks", [])
	if not reachability_checks_variant is Array:
		return []

	var current_scene := get_tree().current_scene
	if current_scene == null:
		return []

	var issues: Array = []
	for check_variant in reachability_checks_variant:
		if not check_variant is Dictionary:
			continue
		var check: Dictionary = check_variant
		if String(check.get("scene", "")) != scene_name:
			continue

		var scene_label := String(check.get("label", scene_name))
		var viewports_variant: Variant = check.get("viewports", [])
		var actions_variant: Variant = check.get("requiredActions", [])
		if not viewports_variant is Array or not actions_variant is Array:
			continue

		var window := get_window()
		var original_size := window.size if window != null else Vector2i(DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT)
		for viewport_variant in viewports_variant:
			if not viewport_variant is Dictionary:
				continue
			var viewport_spec: Dictionary = viewport_variant
			_apply_viewport_size(viewport_spec)
			await get_tree().process_frame
			await get_tree().process_frame
			for action_variant in actions_variant:
				if not action_variant is Dictionary:
					continue
				var action_spec: Dictionary = action_variant
				var issue := _check_required_action_reachability(current_scene, scene_name, scene_label, viewport_spec, action_spec)
				if not issue.is_empty():
					issues.append(issue)
					_flow_logs.append("input:%s" % String(issue.get("message", "unknown input reachability issue")))
		_restore_window_size(original_size)
		await get_tree().process_frame
		await get_tree().process_frame

	return issues

func _apply_viewport_size(viewport_spec: Dictionary) -> void:
	var window := get_window()
	if window == null:
		return
	var width := int(viewport_spec.get("width", DEFAULT_VIEWPORT_WIDTH))
	var height := int(viewport_spec.get("height", DEFAULT_VIEWPORT_HEIGHT))
	window.size = Vector2i(width, height)

func _restore_window_size(size: Vector2i) -> void:
	var window := get_window()
	if window == null:
		return
	window.size = size

func _check_required_control_visibility(
	current_scene: Node,
	scene_name: String,
	scene_label: String,
	viewport_spec: Dictionary,
	control_spec: Dictionary
) -> Dictionary:
	var node_path := String(control_spec.get("nodePath", ""))
	var control_label := String(control_spec.get("label", node_path))
	var control_id := String(control_spec.get("id", control_label.to_snake_case()))
	var viewport_label := String(viewport_spec.get("label", "viewport"))
	var viewport_id := String(viewport_spec.get("id", viewport_label.to_snake_case()))
	var viewport_width := int(viewport_spec.get("width", DEFAULT_VIEWPORT_WIDTH))
	var viewport_height := int(viewport_spec.get("height", DEFAULT_VIEWPORT_HEIGHT))

	if node_path == "":
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"control",
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Visibility check for %s in %s is missing a nodePath" % [control_label, scene_label]
		)

	var control := current_scene.get_node_or_null(NodePath(node_path)) as Control
	if control == null:
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"control",
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Visibility check could not find %s at %s in %s" % [control_label, node_path, scene_label]
		)

	if not control.is_visible_in_tree():
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"control",
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Viewport %s hides required control %s in %s" % [viewport_label, control_label, scene_label]
		)

	return _check_rect_visibility(
		scene_name,
		scene_label,
		"control",
		control_id,
		control_label,
		node_path,
		viewport_spec,
		control.get_global_rect()
	)

func _check_required_region_visibility(
	current_scene: Node,
	scene_name: String,
	scene_label: String,
	viewport_spec: Dictionary,
	region_spec: Dictionary
) -> Dictionary:
	var node_path := String(region_spec.get("nodePath", ""))
	var region_label := String(region_spec.get("label", node_path))
	var region_id := String(region_spec.get("id", region_label.to_snake_case()))
	var viewport_label := String(viewport_spec.get("label", "viewport"))
	var viewport_id := String(viewport_spec.get("id", viewport_label.to_snake_case()))
	var viewport_width := int(viewport_spec.get("width", DEFAULT_VIEWPORT_WIDTH))
	var viewport_height := int(viewport_spec.get("height", DEFAULT_VIEWPORT_HEIGHT))

	if node_path == "":
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"region",
			region_id,
			region_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Region check for %s in %s is missing a nodePath" % [region_label, scene_label]
		)

	var region := current_scene.get_node_or_null(NodePath(node_path)) as Control
	if region == null:
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"region",
			region_id,
			region_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Region check could not find %s at %s in %s" % [region_label, node_path, scene_label]
		)

	if not region.is_visible_in_tree():
		return _build_visibility_issue(
			scene_name,
			scene_label,
			"region",
			region_id,
			region_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			Rect2(),
			get_viewport().get_visible_rect(),
			"Viewport %s hides required region %s in %s" % [viewport_label, region_label, scene_label]
		)

	return _check_rect_visibility(
		scene_name,
		scene_label,
		"region",
		region_id,
		region_label,
		node_path,
		viewport_spec,
		region.get_global_rect()
	)

func _check_required_action_reachability(
	current_scene: Node,
	scene_name: String,
	scene_label: String,
	viewport_spec: Dictionary,
	action_spec: Dictionary
) -> Dictionary:
	var action_id := String(action_spec.get("id", "unknown-action"))
	var action_label := String(action_spec.get("label", action_id))
	var node_path := String(action_spec.get("nodePath", ""))
	var control_id := String(action_spec.get("controlId", action_id))
	var control_label := String(action_spec.get("controlLabel", action_label))
	var viewport_label := String(viewport_spec.get("label", "viewport"))
	var viewport_id := String(viewport_spec.get("id", viewport_label.to_snake_case()))
	var viewport_width := int(viewport_spec.get("width", DEFAULT_VIEWPORT_WIDTH))
	var viewport_height := int(viewport_spec.get("height", DEFAULT_VIEWPORT_HEIGHT))

	if node_path == "":
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"missing_control",
			false,
			false,
			"Viewport %s cannot trigger action %s in %s because the control path is missing" % [viewport_label, action_label, scene_label]
		)

	var control := current_scene.get_node_or_null(NodePath(node_path)) as Control
	if control == null:
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"missing_control",
			false,
			false,
			"Viewport %s cannot trigger action %s in %s because control %s is missing at %s" % [
				viewport_label,
				action_label,
				scene_label,
				control_label,
				node_path,
			]
		)

	if not control.is_visible_in_tree():
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"hidden_control",
			true,
			false,
			"Viewport %s cannot trigger action %s in %s because control %s exists but is hidden" % [
				viewport_label,
				action_label,
				scene_label,
				control_label,
			]
		)

	if control.mouse_filter == Control.MOUSE_FILTER_IGNORE:
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"ignored_control",
			true,
			false,
			"Viewport %s cannot trigger action %s in %s because control %s exists but ignores pointer input" % [
				viewport_label,
				action_label,
				scene_label,
				control_label,
			]
		)

	var button := control as BaseButton
	if button != null and button.disabled:
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"disabled_control",
			true,
			false,
			"Viewport %s cannot trigger action %s in %s because control %s exists but is disabled" % [
				viewport_label,
				action_label,
				scene_label,
				control_label,
			]
		)

	var target_rect := control.get_global_rect()
	var visible_rect := get_viewport().get_visible_rect()
	var overflow_left := maxi(0, int(ceil(visible_rect.position.x - target_rect.position.x)))
	var overflow_top := maxi(0, int(ceil(visible_rect.position.y - target_rect.position.y)))
	var overflow_right := maxi(0, int(ceil(target_rect.end.x - visible_rect.end.x)))
	var overflow_bottom := maxi(0, int(ceil(target_rect.end.y - visible_rect.end.y)))
	if overflow_left > 0 or overflow_top > 0 or overflow_right > 0 or overflow_bottom > 0:
		return _build_input_reachability_issue(
			scene_name,
			scene_label,
			action_id,
			action_label,
			control_id,
			control_label,
			node_path,
			viewport_id,
			viewport_label,
			viewport_width,
			viewport_height,
			"clipped_control",
			true,
			false,
			"Viewport %s cannot trigger action %s in %s because control %s exists but is clipped by L:%d T:%d R:%d B:%d px" % [
				viewport_label,
				action_label,
				scene_label,
				control_label,
				overflow_left,
				overflow_top,
				overflow_right,
				overflow_bottom,
			]
		)

	return {}

func _check_rect_visibility(
	scene_name: String,
	scene_label: String,
	target_type: String,
	target_id: String,
	target_label: String,
	node_path: String,
	viewport_spec: Dictionary,
	target_rect: Rect2
) -> Dictionary:
	var viewport_label := String(viewport_spec.get("label", "viewport"))
	var viewport_id := String(viewport_spec.get("id", viewport_label.to_snake_case()))
	var viewport_width := int(viewport_spec.get("width", DEFAULT_VIEWPORT_WIDTH))
	var viewport_height := int(viewport_spec.get("height", DEFAULT_VIEWPORT_HEIGHT))
	var visible_rect := get_viewport().get_visible_rect()
	var overflow_left := maxi(0, int(ceil(visible_rect.position.x - target_rect.position.x)))
	var overflow_top := maxi(0, int(ceil(visible_rect.position.y - target_rect.position.y)))
	var overflow_right := maxi(0, int(ceil(target_rect.end.x - visible_rect.end.x)))
	var overflow_bottom := maxi(0, int(ceil(target_rect.end.y - visible_rect.end.y)))
	var overflow_px := maxi(maxi(overflow_left, overflow_right), maxi(overflow_top, overflow_bottom))
	if overflow_px <= 0:
		return {}

	var message := "Viewport %s clips %s %s in %s by L:%d T:%d R:%d B:%d px (area x:%d y:%d w:%d h:%d)" % [
		viewport_label,
		target_type,
		target_label,
		scene_label,
		overflow_left,
		overflow_top,
		overflow_right,
		overflow_bottom,
		int(round(target_rect.position.x)),
		int(round(target_rect.position.y)),
		int(round(target_rect.size.x)),
		int(round(target_rect.size.y)),
	]
	return _build_visibility_issue(
		scene_name,
		scene_label,
		target_type,
		target_id,
		target_label,
		node_path,
		viewport_id,
		viewport_label,
		viewport_width,
		viewport_height,
		target_rect,
		visible_rect,
		message
	)

func _build_visibility_issue(
	scene_name: String,
	scene_label: String,
	target_type: String,
	target_id: String,
	target_label: String,
	node_path: String,
	viewport_id: String,
	viewport_label: String,
	viewport_width: int,
	viewport_height: int,
	target_rect: Rect2,
	visible_rect: Rect2,
	message: String
) -> Dictionary:
	var overflow_left := maxi(0, int(ceil(visible_rect.position.x - target_rect.position.x)))
	var overflow_top := maxi(0, int(ceil(visible_rect.position.y - target_rect.position.y)))
	var overflow_right := maxi(0, int(ceil(target_rect.end.x - visible_rect.end.x)))
	var overflow_bottom := maxi(0, int(ceil(target_rect.end.y - visible_rect.end.y)))
	var overflow_px := maxi(maxi(overflow_left, overflow_right), maxi(overflow_top, overflow_bottom))
	return {
		"scene": scene_name,
		"sceneLabel": scene_label,
		"targetType": target_type,
		"controlId": target_id,
		"controlLabel": target_label,
		"nodePath": node_path,
		"viewportId": viewport_id,
		"viewportLabel": viewport_label,
		"viewportWidth": viewport_width,
		"viewportHeight": viewport_height,
		"areaLeft": int(round(target_rect.position.x)),
		"areaTop": int(round(target_rect.position.y)),
		"areaRight": int(round(target_rect.end.x)),
		"controlBottom": int(round(target_rect.end.y)),
		"viewportLeft": int(round(visible_rect.position.x)),
		"viewportTop": int(round(visible_rect.position.y)),
		"viewportRight": int(round(visible_rect.end.x)),
		"viewportBottom": int(round(visible_rect.end.y)),
		"overflowLeftPx": overflow_left,
		"overflowTopPx": overflow_top,
		"overflowRightPx": overflow_right,
		"overflowBottomPx": overflow_bottom,
		"overflowPx": overflow_px if overflow_px > 0 else overflow_bottom,
		"message": message,
	}

func _build_input_reachability_issue(
	scene_name: String,
	scene_label: String,
	action_id: String,
	action_label: String,
	control_id: String,
	control_label: String,
	node_path: String,
	viewport_id: String,
	viewport_label: String,
	viewport_width: int,
	viewport_height: int,
	issue_type: String,
	control_found: bool,
	control_usable: bool,
	message: String
) -> Dictionary:
	return {
		"scene": scene_name,
		"sceneLabel": scene_label,
		"actionId": action_id,
		"actionLabel": action_label,
		"controlId": control_id,
		"controlLabel": control_label,
		"nodePath": node_path,
		"viewportId": viewport_id,
		"viewportLabel": viewport_label,
		"viewportWidth": viewport_width,
		"viewportHeight": viewport_height,
		"issueType": issue_type,
		"controlFound": control_found,
		"controlUsable": control_usable,
		"message": message,
	}

func _build_state(flow_result: Dictionary) -> Dictionary:
	_record_current_scene()
	return {
		"scene": get_tree().current_scene.name if get_tree().current_scene else "none",
		"fps": Engine.get_frames_per_second(),
		"gameState": {
			"runs_started": GameState.runs_started,
			"selected_floor": RunStateManager.floor_number,
			"deck_size": RunStateManager.deck.size(),
			"gold": RunStateManager.gold,
		},
		"buttons": [],
		"sceneHistory": _scene_history.duplicate(),
		"errorLog": _error_log.duplicate(),
		"frameCount": Engine.get_process_frames(),
		"timestamp": Time.get_unix_time_from_system(),
		"dataState": {
			"cardCount": ContentLoader.get_cards().size(),
			"enemyCount": ContentLoader.get_enemies().size(),
			"relicCount": ContentLoader.get_relics().size(),
			"statusEffectCount": ContentLoader.get_status_effects().size(),
		},
		"machineStates": {
			"runFlow": "MAP" if get_tree().current_scene and get_tree().current_scene.name == "MapScene" else "BOOT",
		},
		"eventLog": _event_log.duplicate(),
		"criticalFlow": flow_result,
	}

func _write_output(flow_result: Dictionary) -> void:
	var output_path := _resolve_output_path()
	var file := FileAccess.open(output_path, FileAccess.WRITE)
	if file == null:
		_append_error("Cannot write to %s" % output_path)
		return

	file.store_string(JSON.stringify(_build_state(flow_result), "\t"))
	print("[HarnessPlugin] Wrote state to %s" % ProjectSettings.globalize_path(output_path))
