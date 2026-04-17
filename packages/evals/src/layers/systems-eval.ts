import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  runSceneBindingValidation,
  runAutoloadValidation,
  validateRuntimeLayout,
  formatRuntimeLayoutIssues,
  generateRuntimeManifest,
} from '@agent-harness/game-adapter';
import type { EvalContext, EvalResult } from '../types/scenario.js';
import type {
  AutoloadValidationTarget,
  AutoloadValidationOutput,
  RuntimeFileManifest,
  SceneBindingValidationOutput,
} from '@agent-harness/game-adapter';

interface GdScriptCheck {
  relPath: string;
  label: string;
  patterns: Array<{ regex: RegExp; desc: string }>;
}

/**
 * GDScript pattern checks for Godot 4 autoloads.
 * Each check validates that the key functions/patterns exist in the .gd file.
 */
const GDSCRIPT_CHECKS: GdScriptCheck[] = [
  {
    relPath: 'src/autoload/EventBus.gd',
    label: 'EventBus',
    patterns: [
      { regex: /extends\s+Node/, desc: 'extends Node' },
      { regex: /^signal\s+\w+/m, desc: 'at least one signal declaration' },
      { regex: /signal\s+card_played/, desc: 'signal card_played' },
      { regex: /signal\s+turn_started|signal\s+turn_ended/, desc: 'signal turn_started or turn_ended' },
    ],
  },
  {
    relPath: 'src/autoload/ContentLoader.gd',
    label: 'ContentLoader',
    patterns: [
      { regex: /extends\s+Node/, desc: 'extends Node' },
      { regex: /func\s+load_all/, desc: 'func load_all' },
      { regex: /func\s+get_cards/, desc: 'func get_cards' },
      { regex: /func\s+get_enemies/, desc: 'func get_enemies' },
      { regex: /FileAccess\.open/, desc: 'FileAccess.open usage' },
      { regex: /JSON\.parse_string/, desc: 'JSON.parse_string usage' },
    ],
  },
  {
    relPath: 'src/autoload/RunStateManager.gd',
    label: 'RunStateManager',
    patterns: [
      { regex: /extends\s+Node/, desc: 'extends Node' },
      { regex: /func\s+save_run/, desc: 'func save_run' },
      { regex: /func\s+load_run/, desc: 'func load_run' },
      { regex: /FileAccess\.open/, desc: 'FileAccess.open usage' },
      { regex: /user:\/\//, desc: 'user:// save path' },
    ],
  },
  {
    relPath: 'src/autoload/HarnessPlugin.gd',
    label: 'HarnessPlugin',
    patterns: [
      { regex: /extends\s+Node/, desc: 'extends Node' },
      { regex: /--harness-test/, desc: '--harness-test CLI arg check' },
      { regex: /test-output\.json/, desc: 'test-output.json write' },
    ],
  },
  {
    relPath: 'src/autoload/DebugOverlay.gd',
    label: 'DebugOverlay',
    patterns: [
      { regex: /extends\s+CanvasLayer/, desc: 'extends CanvasLayer' },
      { regex: /func\s+push_error_message/, desc: 'func push_error_message' },
      { regex: /DisplayServer\.clipboard_set/, desc: 'DisplayServer.clipboard_set usage' },
      { regex: /debug_overlay\/enabled_in_release/, desc: 'release toggle project setting' },
    ],
  },
  {
    relPath: 'src/autoload/GameState.gd',
    label: 'GameState',
    patterns: [
      { regex: /extends\s+Node/, desc: 'extends Node' },
      { regex: /func\s+save/, desc: 'func save' },
      { regex: /func\s+load/, desc: 'func load' },
    ],
  },
];

async function getRequiredRuntimeScenes(projectPath: string): Promise<string[]> {
  const scenePaths: string[] = [];
  const mainScenePath = join(projectPath, 'src', 'main.tscn');
  const scenesDir = join(projectPath, 'src', 'scenes');

  if (existsSync(mainScenePath)) {
    scenePaths.push('res://src/main.tscn');
  }

  if (!existsSync(scenesDir)) {
    return scenePaths;
  }

  const entries = await readdir(scenesDir, { withFileTypes: true });
  const sceneFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tscn'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  scenePaths.push(...sceneFiles.map((fileName) => `res://src/scenes/${fileName}`));
  return scenePaths;
}

async function getDeclaredAutoloads(projectPath: string): Promise<AutoloadValidationTarget[]> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    return [];
  }

  const source = await readFile(projectFilePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const autoloads: AutoloadValidationTarget[] = [];
  let inAutoloadSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inAutoloadSection = trimmed === '[autoload]';
      continue;
    }

    if (!inAutoloadSection || trimmed.length === 0 || trimmed.startsWith(';')) {
      continue;
    }

    const match = /^([^=]+)="(\*?res:\/\/[^"]+)"$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const name = match[1];
    const rawScriptPath = match[2];
    if (name === undefined || rawScriptPath === undefined) {
      continue;
    }

    autoloads.push({
      name: name.trim(),
      scriptPath: rawScriptPath.startsWith('*') ? rawScriptPath.slice(1) : rawScriptPath,
    });
  }

  return autoloads;
}

export async function runSystemsEval(ctx: EvalContext): Promise<EvalResult> {
  let totalPoints = 0;
  let maxPoints = 0;
  const notes: string[] = [];
  const runtimeLayout = await validateRuntimeLayout(ctx.projectPath);

  notes.push(
    `RUNTIME ROOTS: authoritative=${runtimeLayout.authoritativeRuntimeRoots.join(', ')} active=${runtimeLayout.activeRuntimeRoots.join(', ') || 'none'}`,
  );

  if (!runtimeLayout.success) {
    notes.push(...formatRuntimeLayoutIssues(runtimeLayout));
    return {
      layerName: 'systems',
      score: 0,
      passed: false,
      summary: notes.join('; '),
    };
  }

  for (const check of GDSCRIPT_CHECKS) {
    maxPoints += 2;
    const filePath = join(ctx.projectPath, check.relPath);

    if (!existsSync(filePath)) {
      notes.push(`MISSING: ${check.relPath}`);
      continue;
    }

    let source: string;
    try {
      source = await readFile(filePath, 'utf8');
    } catch {
      notes.push(`UNREADABLE: ${check.relPath}`);
      continue;
    }

    const failures = check.patterns
      .filter((p) => !p.regex.test(source))
      .map((p) => p.desc);

    if (failures.length === 0) {
      totalPoints += 2;
      notes.push(`OK: ${check.relPath}`);
    } else {
      notes.push(`INCOMPLETE: ${check.relPath} -- missing: ${failures.join(', ')}`);
    }
  }

  const declaredAutoloads = await getDeclaredAutoloads(ctx.projectPath);
  const runtimeManifest = await generateRuntimeManifest(ctx.projectPath);
  let autoloadValidation: AutoloadValidationOutput = {
    success: declaredAutoloads.length === 0,
    entries: [],
    stdout: '',
    stderr: '',
    durationMs: 0,
  };

  if (declaredAutoloads.length === 0) {
    notes.push('MISSING: no autoloads declared in project.godot');
  } else {
    maxPoints += declaredAutoloads.length;
    autoloadValidation = await runAutoloadValidation(ctx.projectPath, declaredAutoloads);

    for (const entry of autoloadValidation.entries) {
      if (entry.passed) {
        totalPoints += 1;
        notes.push(`AUTOLOAD OK: ${entry.name} -> ${entry.scriptPath}`);
      } else {
        notes.push(
          `AUTOLOAD FAIL: ${entry.name} -> ${entry.scriptPath} error=${entry.errorText ?? 'unknown'}`,
        );
      }
    }
  }

  const runtimeScenes = await getRequiredRuntimeScenes(ctx.projectPath);
  let sceneValidation: SceneBindingValidationOutput = {
    success: runtimeScenes.length === 0,
    entries: [],
    stdout: '',
    stderr: '',
    durationMs: 0,
  };

  if (runtimeScenes.length === 0) {
    notes.push('MISSING: no runtime scenes found under src/main.tscn or src/scenes/*.tscn');
  } else {
    maxPoints += runtimeScenes.length;
    sceneValidation = await runSceneBindingValidation(ctx.projectPath, runtimeScenes);

    for (const entry of sceneValidation.entries) {
      const scriptPath = entry.attachedScriptPath ?? 'null';
      const expectedScriptPath = entry.expectedSiblingScriptPath ?? 'n/a';

      if (entry.passed) {
        totalPoints += 1;
        notes.push(`SCENE OK: ${entry.scenePath} -> ${entry.rootType} script=${scriptPath}`);
      } else {
        notes.push(
          `SCENE FAIL: ${entry.scenePath} -> ${entry.rootType} script=${scriptPath} expected=${expectedScriptPath} reason=${entry.failureReason ?? 'unknown'}`,
        );
      }
    }

    if (!sceneValidation.success && sceneValidation.stderr.trim().length > 0) {
      notes.push(`VALIDATOR STDERR: ${sceneValidation.stderr.trim()}`);
    }
  }

  maxPoints += 2;
  const scriptReferenceAudit = buildScriptReferenceAudit(
    runtimeManifest,
    sceneValidation,
    autoloadValidation,
  );
  if (scriptReferenceAudit.orphanScripts.length === 0 && scriptReferenceAudit.unusedDuplicates.length === 0) {
    totalPoints += 2;
  } else if (scriptReferenceAudit.orphanScripts.length === 0 || scriptReferenceAudit.unusedDuplicates.length === 0) {
    totalPoints += 1;
  }
  notes.push(...formatScriptReferenceAudit(scriptReferenceAudit));

  const score = maxPoints > 0 ? (totalPoints / maxPoints) * 10 : 0;
  const passed = totalPoints === maxPoints;
  const summary = `${totalPoints}/${maxPoints} system points. ${notes.join('; ')}`;

  return {
    layerName: 'systems',
    score,
    passed,
    summary,
  };
}

interface ScriptReferenceAudit {
  activeScripts: Array<{ scriptPath: string; owners: string[] }>;
  unusedDuplicates: Array<{ scriptPath: string; scenePath: string; activeScriptPath: string | null }>;
  orphanScripts: string[];
}

function buildScriptReferenceAudit(
  manifest: RuntimeFileManifest,
  sceneValidation: SceneBindingValidationOutput,
  autoloadValidation: AutoloadValidationOutput,
): ScriptReferenceAudit {
  const activeOwnersByScript = new Map<string, Set<string>>();
  const sceneEntriesByPath = new Map(manifest.scenes.map((scene) => [scene.scenePath, scene] as const));
  const sceneValidationByPath = new Map(
    sceneValidation.entries.map((entry) => [entry.scenePath, entry] as const),
  );

  for (const autoload of manifest.autoloads) {
    addActiveOwner(activeOwnersByScript, autoload.scriptPath, `autoload:${autoload.name}`);
  }

  for (const entry of sceneValidation.entries) {
    if (entry.attachedScriptPath !== null) {
      addActiveOwner(activeOwnersByScript, entry.attachedScriptPath, `scene:${entry.scenePath}`);
    }
  }

  const unusedDuplicates = manifest.scenes
    .flatMap((scene) => {
      if (scene.scriptPath === undefined) {
        return [];
      }

      const validationEntry = sceneValidationByPath.get(scene.scenePath);
      const activeScriptPath = validationEntry?.attachedScriptPath ?? null;
      if (activeScriptPath === scene.scriptPath) {
        return [];
      }

      return [{
        scriptPath: scene.scriptPath,
        scenePath: scene.scenePath,
        activeScriptPath,
      }];
    })
    .sort((left, right) => left.scriptPath.localeCompare(right.scriptPath));

  const unusedDuplicatePaths = new Set(unusedDuplicates.map((entry) => entry.scriptPath));
  const orphanScripts = manifest.scripts
    .map((script) => script.scriptPath)
    .filter((scriptPath) =>
      !activeOwnersByScript.has(scriptPath) && !unusedDuplicatePaths.has(scriptPath),
    )
    .sort((left, right) => left.localeCompare(right));

  const activeScripts = Array.from(activeOwnersByScript.entries())
    .map(([scriptPath, owners]) => ({
      scriptPath,
      owners: Array.from(owners).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.scriptPath.localeCompare(right.scriptPath));

  void autoloadValidation;
  void sceneEntriesByPath;

  return {
    activeScripts,
    unusedDuplicates,
    orphanScripts,
  };
}

function addActiveOwner(
  activeOwnersByScript: Map<string, Set<string>>,
  scriptPath: string,
  owner: string,
): void {
  const owners = activeOwnersByScript.get(scriptPath);
  if (owners !== undefined) {
    owners.add(owner);
    return;
  }

  activeOwnersByScript.set(scriptPath, new Set([owner]));
}

function formatScriptReferenceAudit(audit: ScriptReferenceAudit): string[] {
  const notes: string[] = [];

  if (audit.activeScripts.length === 0) {
    notes.push('ACTIVE SCRIPT FILES: none');
  } else {
    notes.push(
      `ACTIVE SCRIPT FILES: ${audit.activeScripts.map((entry) => `${entry.scriptPath} [${entry.owners.join(', ')}]`).join(', ')}`,
    );
  }

  if (audit.unusedDuplicates.length === 0) {
    notes.push('UNUSED DUPLICATE SCRIPTS: none');
  } else {
    notes.push(
      `UNUSED DUPLICATE SCRIPTS: ${audit.unusedDuplicates
        .map((entry) =>
          `${entry.scriptPath} intended-for=${entry.scenePath} active=${entry.activeScriptPath ?? 'none'}`,
        )
        .join(', ')}`,
    );
  }

  if (audit.orphanScripts.length === 0) {
    notes.push('ORPHAN RUNTIME SCRIPTS: none');
  } else {
    notes.push(`ORPHAN RUNTIME SCRIPTS: ${audit.orphanScripts.join(', ')}`);
  }

  return notes;
}
