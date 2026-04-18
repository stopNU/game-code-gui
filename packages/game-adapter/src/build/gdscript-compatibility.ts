import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { execa } from 'execa';
import type {
  GDScriptWarningSetting,
  GDScriptCompatibilityEntry,
  GDScriptCompatibilityIssue,
  GDScriptCompatibilityOutput,
  GDScriptProjectSettings,
  GDScriptValidationTarget,
  RuntimeFileManifest,
} from '../types/project.js';

function godotBin(): string {
  return process.env['GODOT_PATH'] ?? 'godot';
}

const GDSCRIPT_COMPATIBILITY_VALIDATOR_SCRIPT = `extends SceneTree

func _init() -> void:
	var cli_args := OS.get_cmdline_user_args()
	if cli_args.size() < 2:
		push_error("Expected input and output file paths")
		quit(2)
		return

	var input_path := cli_args[0]
	var output_path := cli_args[1]

	var input_file := FileAccess.open(input_path, FileAccess.READ)
	if input_file == null:
		push_error("Failed to open validator input: %s" % input_path)
		quit(2)
		return

	var parsed_value: Variant = JSON.parse_string(input_file.get_as_text())
	if typeof(parsed_value) != TYPE_ARRAY:
		push_error("Validator input must be a JSON array")
		quit(2)
		return

	var entries: Array = []
	var had_failure := false
	var parsed: Array = parsed_value

	for raw_target in parsed:
		if typeof(raw_target) != TYPE_DICTIONARY:
			had_failure = true
			continue

		var target := raw_target as Dictionary
		var target_id := String(target.get("id", "unknown"))
		var target_kind := String(target.get("kind", "script"))
		var target_path := String(target.get("path", ""))
		var entry := {
			"id": target_id,
			"kind": target_kind,
			"path": target_path,
			"passed": false,
			"loaded": false,
			"instantiated": false
		}

		var resource := load(target_path)
		if resource == null:
			entry["failureReason"] = "Failed to load resource"
			entries.append(entry)
			had_failure = true
			continue

		entry["loaded"] = true

		if target_kind == "scene":
			if not (resource is PackedScene):
				entry["failureReason"] = "Expected PackedScene resource"
				entries.append(entry)
				had_failure = true
				continue

			var instance := (resource as PackedScene).instantiate()
			if instance == null:
				entry["failureReason"] = "PackedScene.instantiate() returned null"
				entries.append(entry)
				had_failure = true
				continue

			entry["instantiated"] = true
			instance.free()
		elif target_kind == "autoload":
			if not (resource is GDScript):
				entry["failureReason"] = "Expected GDScript resource"
				entries.append(entry)
				had_failure = true
				continue

		entry["passed"] = true
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
`;

export async function readGDScriptProjectSettings(projectPath: string): Promise<GDScriptProjectSettings> {
  const projectFilePath = join(projectPath, 'project.godot');
  const defaults: GDScriptProjectSettings = {
    warningsEnabled: true,
    warningSettings: [],
    warningsAsErrors: [],
  };

  if (!existsSync(projectFilePath)) {
    return defaults;
  }

  const source = await readFile(projectFilePath, 'utf8');
  const settings = parseProjectSettings(source);
  const warningSettings = Object.entries(settings)
    .filter(([key]) => key.startsWith('debug/gdscript/warnings/') && key !== 'debug/gdscript/warnings/enable')
    .map(([key, rawValue]) => {
      const level = toWarningLevel(rawValue);
      return level === undefined
        ? null
        : {
          key: key.slice('debug/gdscript/warnings/'.length),
          level,
          rawValue,
        };
    })
    .filter((setting): setting is GDScriptWarningSetting => setting !== null)
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    warningsEnabled: toBoolean(settings['debug/gdscript/warnings/enable']) ?? true,
    warningSettings,
    warningsAsErrors: warningSettings
      .filter((setting) => setting.level === 'error')
      .map((setting) => setting.key),
  };
}

export function collectGDScriptValidationTargets(
  manifest: RuntimeFileManifest,
): GDScriptValidationTarget[] {
  const targets: GDScriptValidationTarget[] = [];
  const seenPaths = new Set<string>();

  const pushTarget = (target: GDScriptValidationTarget): void => {
    if (seenPaths.has(target.path)) {
      return;
    }

    seenPaths.add(target.path);
    targets.push(target);
  };

  for (const autoload of manifest.autoloads) {
    pushTarget({
      id: autoload.name,
      kind: 'autoload',
      path: autoload.scriptPath,
    });
  }

  if (manifest.mainScenePath !== undefined) {
    pushTarget({
      id: 'main',
      kind: 'scene',
      path: manifest.mainScenePath,
    });
  }

  for (const scene of manifest.scenes) {
    pushTarget({
      id: scene.id,
      kind: 'scene',
      path: scene.scenePath,
    });
  }

  return targets;
}

export function parseGDScriptCompatibilityIssues(output: string): GDScriptCompatibilityIssue[] {
  const lines = output.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length > 0) {
      blocks.push(current);
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^(SCRIPT ERROR|ERROR):/.test(line)) {
      flush();
      current.push(line.trim());
      continue;
    }

    if (current.length === 0) {
      continue;
    }

    if (line.trim().length === 0) {
      flush();
      continue;
    }

    if (/^(at:|GDScript backtrace|at \[)/.test(line.trim())) {
      current.push(line.trim());
      continue;
    }

    flush();
  }

  flush();

  const issues = blocks.map((block) => toCompatibilityIssue(block)).filter((issue) => issue !== null);
  const deduped: GDScriptCompatibilityIssue[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    const key = `${issue.filePath ?? ''}:${issue.line ?? 0}:${issue.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

export function formatGDScriptCompatibilityIssue(issue: GDScriptCompatibilityIssue): string {
  const location = issue.filePath !== undefined
    ? `${issue.filePath}${issue.line !== undefined ? `:${issue.line}` : ''}`
    : issue.filePath ?? 'unknown';
  return `${location} ${issue.message}`;
}

export async function runGDScriptCompatibilityValidation(
  projectPath: string,
  manifest: RuntimeFileManifest,
): Promise<GDScriptCompatibilityOutput> {
  const start = Date.now();
  const settings = await readGDScriptProjectSettings(projectPath);
  const targets = collectGDScriptValidationTargets(manifest);
  const harnessDir = join(projectPath, 'harness');
  const inputPath = join(harnessDir, 'gdscript-compat-input.json');
  const outputPath = join(harnessDir, 'gdscript-compat-output.json');
  const scriptPath = join(harnessDir, 'gdscript-compat-validator.gd');

  await mkdir(harnessDir, { recursive: true });
  await writeFile(inputPath, JSON.stringify(targets, null, 2), 'utf8');
  await writeFile(scriptPath, GDSCRIPT_COMPATIBILITY_VALIDATOR_SCRIPT, 'utf8');

  const result = await execa(
    godotBin(),
    ['--headless', '--path', projectPath, '--script', scriptPath, '--', inputPath, outputPath],
    { cwd: projectPath, reject: false, timeout: 180000 },
  );

  let entries: GDScriptCompatibilityEntry[] = [];
  try {
    const raw = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as { entries?: GDScriptCompatibilityEntry[] };
    entries = parsed.entries ?? [];
  } catch {
    entries = targets.map((target) => ({
      id: target.id,
      kind: target.kind,
      path: target.path,
      passed: false,
      loaded: false,
      instantiated: false,
      failureReason: 'Validator did not produce readable output',
    }));
  } finally {
    await Promise.allSettled([
      rm(inputPath, { force: true }),
      rm(outputPath, { force: true }),
      rm(scriptPath, { force: true }),
    ]);
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const issues = parseGDScriptCompatibilityIssues([stdout, stderr].filter((part) => part.length > 0).join('\n'));

  return {
    success: (result.exitCode ?? 0) === 0 && entries.every((entry) => entry.passed),
    settings,
    targets,
    entries,
    issues,
    stdout,
    stderr,
    durationMs: Date.now() - start,
  };
}

function parseProjectSettings(source: string): Record<string, string> {
  const settings: Record<string, string> = {};
  const lines = source.split(/\r?\n/);
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) {
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim();
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    const qualifiedKey = currentSection.length > 0 ? `${currentSection}/${key}` : key;
    settings[qualifiedKey] = value;
  }

  return settings;
}

function toBoolean(rawValue: string | undefined): boolean | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  return undefined;
}

function toWarningLevel(rawValue: string): 'ignore' | 'warn' | 'error' | undefined {
  if (rawValue === '0' || rawValue === '"ignore"' || rawValue === '"disabled"') {
    return 'ignore';
  }

  if (rawValue === '1' || rawValue === '"warn"' || rawValue === '"warning"') {
    return 'warn';
  }

  if (rawValue === '2' || rawValue === '"error"') {
    return 'error';
  }

  return undefined;
}

function toCompatibilityIssue(block: string[]): GDScriptCompatibilityIssue | null {
  const [header, ...rest] = block;
  if (header === undefined) {
    return null;
  }

  const headerMatch = /^(SCRIPT ERROR|ERROR):\s*(.+)$/.exec(header);
  if (!headerMatch) {
    return null;
  }

  const message = headerMatch[2];
  if (message === undefined) {
    return null;
  }
  const locationLine = rest.find((line) => line.startsWith('at:'));
  const locationMatch = locationLine !== undefined
    ? /\((res:\/\/[^:]+):(\d+)\)/.exec(locationLine)
    : null;

  return {
    severity: 'error',
    message,
    ...(locationMatch?.[1] !== undefined ? { filePath: locationMatch[1] } : {}),
    ...(locationMatch?.[2] !== undefined ? { line: Number(locationMatch[2]) } : {}),
    treatedAsError: /warning treated as error/i.test(block.join(' ')),
    rawText: block.join('\n'),
  };
}
