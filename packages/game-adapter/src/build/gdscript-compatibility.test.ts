import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'fs';
import { rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { RuntimeFileManifest } from '../types/project.js';
import {
  collectGDScriptValidationTargets,
  formatGDScriptCompatibilityIssue,
  parseGDScriptCompatibilityIssues,
  readGDScriptProjectSettings,
} from './gdscript-compatibility.js';

describe('gdscript compatibility', () => {
  it('parses configured warning strictness from project.godot', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'gdscript-settings-'));
    try {
      await writeFile(join(projectPath, 'project.godot'), [
        '[debug]',
        'gdscript/warnings/enable=true',
        'gdscript/warnings/inference_on_variant=2',
        'gdscript/warnings/unused_variable=1',
        'gdscript/warnings/untyped_declaration=0',
        '',
      ].join('\n'), 'utf8');

      const settings = await readGDScriptProjectSettings(projectPath);

      expect(settings.warningsEnabled).toBe(true);
      expect(settings.warningsAsErrors).toEqual(['inference_on_variant']);
      expect(settings.warningSettings).toEqual([
        { key: 'inference_on_variant', level: 'error', rawValue: '2' },
        { key: 'untyped_declaration', level: 'ignore', rawValue: '0' },
        { key: 'unused_variable', level: 'warn', rawValue: '1' },
      ]);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('collects autoloads, scenes, and script dependencies from the runtime manifest', () => {
    const manifest: RuntimeFileManifest = {
      version: '1.0.0',
      generatedAt: '2026-04-17T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      mainScenePath: 'res://src/main.tscn',
      scenes: [
        { id: 'main', scenePath: 'res://src/main.tscn', scriptPath: 'res://src/main.gd' },
        { id: 'CombatScene', scenePath: 'res://src/scenes/CombatScene.tscn', scriptPath: 'res://src/scenes/CombatScene.gd' },
      ],
      scripts: [
        { id: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', category: 'autoload' },
        { id: 'CombatScene', scriptPath: 'res://src/scenes/CombatScene.gd', category: 'scene' },
        { id: 'CombatEngine', scriptPath: 'res://src/systems/CombatEngine.gd', category: 'system' },
      ],
      autoloads: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
      ],
      dataRoots: [],
    };

    expect(collectGDScriptValidationTargets(manifest)).toEqual([
      { id: 'EventBus', kind: 'autoload', path: 'res://src/autoload/EventBus.gd' },
      { id: 'main', kind: 'scene', path: 'res://src/main.tscn' },
      { id: 'CombatScene', kind: 'scene', path: 'res://src/scenes/CombatScene.tscn' },
      { id: 'CombatScene', kind: 'script', path: 'res://src/scenes/CombatScene.gd' },
      { id: 'CombatEngine', kind: 'script', path: 'res://src/systems/CombatEngine.gd' },
    ]);
  });

  it('extracts strict-mode file and line diagnostics from Godot output', () => {
    const issues = parseGDScriptCompatibilityIssues([
      'SCRIPT ERROR: Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
      '   at: GDScript::reload (res://src/autoload/DebugOverlay.gd:213)',
      'ERROR: Failed to load script "res://src/autoload/ContentLoader.gd" with error "Compilation failed".',
      '   at: load (modules/gdscript/gdscript.cpp:2907)',
      '',
    ].join('\n'));

    expect(issues).toEqual([
      {
        severity: 'error',
        message: 'Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
        filePath: 'res://src/autoload/DebugOverlay.gd',
        line: 213,
        treatedAsError: true,
        rawText: [
          'SCRIPT ERROR: Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
          'at: GDScript::reload (res://src/autoload/DebugOverlay.gd:213)',
        ].join('\n'),
      },
      {
        severity: 'error',
        message: 'Failed to load script "res://src/autoload/ContentLoader.gd" with error "Compilation failed".',
        treatedAsError: false,
        rawText: [
          'ERROR: Failed to load script "res://src/autoload/ContentLoader.gd" with error "Compilation failed".',
          'at: load (modules/gdscript/gdscript.cpp:2907)',
        ].join('\n'),
      },
    ]);
    expect(formatGDScriptCompatibilityIssue(issues[0]!)).toBe(
      'res://src/autoload/DebugOverlay.gd:213 Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
    );
  });
});
