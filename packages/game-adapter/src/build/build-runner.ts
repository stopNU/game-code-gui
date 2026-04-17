import { execa } from 'execa';
import { stat, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import type {
  BuildOutput,
  TypecheckOutput,
  SceneBindingValidationEntry,
  SceneBindingValidationOutput,
  AutoloadValidationTarget,
  AutoloadValidationEntry,
  AutoloadValidationOutput,
} from '../types/project.js';
import { generateRuntimeManifest } from './runtime-manifest.js';
import { validateRuntimeLayout, formatRuntimeLayoutIssues } from './runtime-layout.js';
import { createRuntimeLogReference, writeRuntimeLog } from './runtime-logs.js';
import {
  formatGDScriptCompatibilityIssue,
  runGDScriptCompatibilityValidation,
} from './gdscript-compatibility.js';
import {
  formatRuntimeDependencyIssue,
  validateRuntimeDependencies,
} from './runtime-dependencies.js';

/** Resolve the Godot 4 binary path via env var or fall back to `godot` in PATH. */
function godotBin(): string {
  return process.env['GODOT_PATH'] ?? 'godot';
}

const SCENE_BINDING_VALIDATOR_SCRIPT = `extends SceneTree

func _init() -> void:
	var cli_args := OS.get_cmdline_user_args()
	if cli_args.size() < 2:
		push_error("Expected input and output file paths")
		quit(2)
		return

	var input_path := cli_args[0]
	var output_path := cli_args[1]
	var entries: Array = []
	var had_failure := false

	var input_file := FileAccess.open(input_path, FileAccess.READ)
	if input_file == null:
		push_error("Failed to open validator input: %s" % input_path)
		quit(2)
		return

	var parsed := JSON.parse_string(input_file.get_as_text())
	if typeof(parsed) != TYPE_ARRAY:
		push_error("Validator input must be a JSON array")
		quit(2)
		return

	for raw_scene_path in parsed:
		var scene_path := String(raw_scene_path)
		var expected_script_path := _expected_sibling_script_path(scene_path)
		var entry := {
			"scenePath": scene_path,
			"rootType": "unloaded",
			"attachedScriptPath": null,
			"expectedSiblingScriptPath": expected_script_path,
			"passed": false
		}

		var packed_scene := load(scene_path)
		if packed_scene == null or not (packed_scene is PackedScene):
			entry["failureReason"] = "Failed to load PackedScene"
			entries.append(entry)
			had_failure = true
			continue

		var root := (packed_scene as PackedScene).instantiate()
		if root == null:
			entry["failureReason"] = "PackedScene.instantiate() returned null"
			entries.append(entry)
			had_failure = true
			continue

		entry["rootType"] = root.get_class()
		var script := root.get_script()
		var attached_script_path = script.resource_path if script != null else null
		entry["attachedScriptPath"] = attached_script_path

		if script == null:
			entry["failureReason"] = "Root script is null"
			had_failure = true
		elif expected_script_path != null and String(attached_script_path) != expected_script_path:
			entry["failureReason"] = "Root script does not match expected sibling script"
			had_failure = true
		else:
			entry["passed"] = true

		root.free()
		entries.append(entry)

	var output := {
		"success": not had_failure,
		"entries": entries
	}

	var output_file := FileAccess.open(output_path, FileAccess.WRITE)
	if output_file == null:
		push_error("Failed to open validator output: %s" % output_path)
		quit(2)
		return

	output_file.store_string(JSON.stringify(output, "  "))
	quit(1 if had_failure else 0)

func _expected_sibling_script_path(scene_path: String) -> Variant:
	if not scene_path.ends_with(".tscn"):
		return null
	var base_name := scene_path.get_file().trim_suffix(".tscn")
	return "%s/%s.gd" % [scene_path.get_base_dir(), base_name]
`;

const AUTOLOAD_VALIDATOR_SCRIPT = `extends SceneTree

func _init() -> void:
	var cli_args := OS.get_cmdline_user_args()
	if cli_args.size() < 2:
		push_error("Expected autoload name and script path")
		quit(2)
		return

	var autoload_name := String(cli_args[0])
	var script_path := String(cli_args[1])
	var script_resource := load(script_path)

	if script_resource == null or not (script_resource is GDScript):
		push_error("Failed to load autoload script for %s at %s" % [autoload_name, script_path])
		quit(1)
		return

	var instance = (script_resource as GDScript).new()
	if instance == null:
		push_error("Failed to instantiate autoload %s from %s" % [autoload_name, script_path])
		quit(1)
		return

	if not (instance is Node):
		push_error("Autoload %s from %s does not instantiate to a Node" % [autoload_name, script_path])
		quit(1)
		return

	var node := instance as Node
	node.name = autoload_name
	get_root().add_child(node)
	await process_frame
	node.queue_free()
	await process_frame
	quit(0)
`;

export async function runTypeCheck(projectPath: string): Promise<TypecheckOutput> {
  const start = Date.now();
  const runtimeLayout = await validateRuntimeLayout(projectPath);
  const logReference = await createRuntimeLogReference(projectPath, 'typecheck');
  if (!runtimeLayout.success) {
    const errors = formatRuntimeLayoutIssues(runtimeLayout);
    await writeRuntimeLog(projectPath, logReference, errors.join('\n'));
    return {
      success: false,
      errorCount: errors.length,
      errors,
      durationMs: Date.now() - start,
      runtimeLogPath: logReference.logPath,
    };
  }

  const manifest = await generateRuntimeManifest(projectPath);
  const dependencyValidation = await validateRuntimeDependencies(projectPath, manifest);
  const validation = await runGDScriptCompatibilityValidation(projectPath, manifest);

  const configuredStrictWarnings = validation.settings.warningsAsErrors.length > 0
    ? validation.settings.warningsAsErrors.join(', ')
    : 'none';
  const activeDependencyIssues = dependencyValidation.activeIssues.map((issue) => formatRuntimeDependencyIssue(issue));
  const deadCodeDependencyIssues = dependencyValidation.inactiveIssues.map((issue) => formatRuntimeDependencyIssue(issue));
  const logSections = [
    `GDScript warnings enabled: ${validation.settings.warningsEnabled}`,
    `Configured warnings as errors: ${configuredStrictWarnings}`,
    `Targets checked: ${validation.targets.length}`,
    `Active dependency failures: ${dependencyValidation.activeIssues.length}`,
    `Dead-code dependency failures: ${dependencyValidation.inactiveIssues.length}`,
    ...(activeDependencyIssues.length > 0
      ? ['Active dependency failures:\n' + activeDependencyIssues.join('\n')]
      : []),
    ...(deadCodeDependencyIssues.length > 0
      ? ['Dead-code dependency failures:\n' + deadCodeDependencyIssues.join('\n')]
      : []),
    validation.stdout,
    validation.stderr,
  ].filter((section) => section.trim().length > 0);
  await writeRuntimeLog(projectPath, logReference, logSections.join('\n\n'));

  const entryFailures = validation.entries
    .filter((entry) => !entry.passed)
    .map((entry) => `${entry.path} ${entry.failureReason ?? 'Failed compatibility validation'}`);
  const issueErrors = validation.issues.map((issue) => formatGDScriptCompatibilityIssue(issue));
  const errors = [...activeDependencyIssues, ...issueErrors, ...entryFailures]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 20);

  return {
    success: dependencyValidation.success && validation.success,
    errorCount: activeDependencyIssues.length > 0
      ? activeDependencyIssues.length
      : validation.issues.length > 0
        ? validation.issues.length
        : entryFailures.length,
    errors,
    ...(validation.issues.length > 0 ? { issues: validation.issues } : {}),
    settings: validation.settings,
    targetsChecked: validation.targets.length,
    durationMs: Date.now() - start,
    runtimeLogPath: logReference.logPath,
  };
}

/**
 * Export the Godot project as a Windows Desktop standalone binary.
 *
 * Requires export templates to be installed. The export preset "Windows Desktop"
 * must be defined in export_presets.cfg (provided by the deckbuilder template).
 *
 * Output: {projectPath}/builds/game.exe
 */
export async function runBuild(projectPath: string): Promise<BuildOutput> {
  const start = Date.now();
  const runtimeLayout = await validateRuntimeLayout(projectPath);
  const logReference = await createRuntimeLogReference(projectPath, 'build');
  if (!runtimeLayout.success) {
    const stderr = formatRuntimeLayoutIssues(runtimeLayout).join('\n');
    await writeRuntimeLog(projectPath, logReference, stderr);
    return {
      success: false,
      sizeKb: 0,
      outputPath: join(projectPath, 'builds', 'game.exe'),
      stdout: '',
      stderr,
      durationMs: Date.now() - start,
      runtimeLogPath: logReference.logPath,
    };
  }

  const outputExe = join(projectPath, 'builds', 'game.exe');

  const result = await execa(
    godotBin(),
    ['--headless', '--export-release', 'Windows Desktop', outputExe, '--path', projectPath],
    { cwd: projectPath, reject: false, timeout: 300000 },
  );

  let sizeKb = 0;
  try {
    const s = await stat(outputExe);
    sizeKb = Math.round(s.size / 1024);
  } catch {
    // Binary not produced (build failed)
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  await writeRuntimeLog(projectPath, logReference, [stdout, stderr].filter((part) => part.length > 0).join('\n'));

  return {
    success: (result.exitCode ?? 0) === 0,
    sizeKb,
    outputPath: outputExe,
    stdout,
    stderr,
    durationMs: Date.now() - start,
    runtimeLogPath: logReference.logPath,
  };
}

export async function runSceneBindingValidation(
  projectPath: string,
  scenePaths: string[],
): Promise<SceneBindingValidationOutput> {
  const start = Date.now();
  const logReference = await createRuntimeLogReference(projectPath, 'scene-binding');
  const harnessDir = join(projectPath, 'harness');
  const inputPath = join(harnessDir, 'scene-binding-input.json');
  const outputPath = join(harnessDir, 'scene-binding-output.json');
  const scriptPath = join(harnessDir, 'scene-binding-validator.gd');

  await mkdir(harnessDir, { recursive: true });
  await writeFile(inputPath, JSON.stringify(scenePaths, null, 2), 'utf8');
  await writeFile(scriptPath, SCENE_BINDING_VALIDATOR_SCRIPT, 'utf8');

  const result = await execa(
    godotBin(),
    ['--headless', '--path', projectPath, '--script', scriptPath, '--', inputPath, outputPath],
    { cwd: projectPath, reject: false, timeout: 120000 },
  );

  let entries: SceneBindingValidationEntry[] = [];
  try {
    const raw = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as { entries?: SceneBindingValidationEntry[] };
    entries = parsed.entries ?? [];
  } catch {
    entries = scenePaths.map((scenePath) => ({
      scenePath,
      rootType: 'unknown',
      attachedScriptPath: null,
      expectedSiblingScriptPath: expectedSiblingScriptPathFor(scenePath),
      passed: false,
      failureReason: 'Validator did not produce readable output',
    }));
  } finally {
    await Promise.allSettled([
      rm(inputPath, { force: true }),
      rm(outputPath, { force: true }),
      rm(scriptPath, { force: true }),
    ]);
  }

  await writeRuntimeLog(
    projectPath,
    logReference,
    [(result.stdout ?? ''), (result.stderr ?? '')].filter((part) => part.length > 0).join('\n'),
  );

  return {
    success: (result.exitCode ?? 0) === 0 && entries.every((entry) => entry.passed),
    entries,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - start,
    runtimeLogPath: logReference.logPath,
  };
}

export async function runAutoloadValidation(
  projectPath: string,
  autoloads: AutoloadValidationTarget[],
): Promise<AutoloadValidationOutput> {
  const start = Date.now();
  const logReference = await createRuntimeLogReference(projectPath, 'autoload-validation');
  const harnessDir = join(projectPath, 'harness');
  const scriptPath = join(harnessDir, 'autoload-validator.gd');
  const entries: AutoloadValidationEntry[] = [];

  await mkdir(harnessDir, { recursive: true });
  await writeFile(scriptPath, AUTOLOAD_VALIDATOR_SCRIPT, 'utf8');

  let combinedStdout = '';
  let combinedStderr = '';

  try {
    for (const autoload of autoloads) {
      const result = await execa(
        godotBin(),
        ['--headless', '--path', projectPath, '--script', scriptPath, '--', autoload.name, autoload.scriptPath],
        { cwd: projectPath, reject: false, timeout: 120000 },
      );

      combinedStdout += result.stdout ?? '';
      combinedStderr += result.stderr ?? '';

      const errorText = extractAutoloadErrorText(result.stdout ?? '', result.stderr ?? '');
      entries.push({
        name: autoload.name,
        scriptPath: autoload.scriptPath,
        passed: (result.exitCode ?? 0) === 0,
        ...((result.exitCode ?? 0) !== 0
          ? { errorText: errorText || `Autoload ${autoload.name} failed with exit code ${result.exitCode ?? 1}` }
          : {}),
      });
    }
  } finally {
    await rm(scriptPath, { force: true });
  }

  await writeRuntimeLog(
    projectPath,
    logReference,
    [combinedStdout, combinedStderr].filter((part) => part.length > 0).join('\n'),
  );

  return {
    success: entries.every((entry) => entry.passed),
    entries,
    stdout: combinedStdout,
    stderr: combinedStderr,
    durationMs: Date.now() - start,
    runtimeLogPath: logReference.logPath,
  };
}

function expectedSiblingScriptPathFor(scenePath: string): string | null {
  if (!scenePath.endsWith('.tscn')) {
    return null;
  }

  const slashIndex = scenePath.lastIndexOf('/');
  const baseDir = slashIndex >= 0 ? scenePath.slice(0, slashIndex) : '';
  const fileName = slashIndex >= 0 ? scenePath.slice(slashIndex + 1) : scenePath;
  return `${baseDir}/${fileName.replace(/\.tscn$/, '.gd')}`;
}

function extractAutoloadErrorText(stdout: string, stderr: string): string {
  const output = [stdout, stderr]
    .filter((part) => part.trim().length > 0)
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const relevantLines = output.filter((line) =>
    line.includes('ERROR') ||
    line.includes('Parse Error') ||
    line.includes('Script Error') ||
    line.includes('Failed to'),
  );

  return (relevantLines.length > 0 ? relevantLines : output).join(' | ');
}
