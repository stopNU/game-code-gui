import { mkdtempSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { RuntimeFileManifest } from '../types/project.js';
import { validateRuntimeDependencies } from './runtime-dependencies.js';

describe('runtime dependency validation', () => {
  it('fails on unresolved dependencies in active flow scripts and reports dead code separately', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'runtime-deps-'));

    try {
      await mkdir(join(projectPath, 'harness'), { recursive: true });
      await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
      await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });
      await mkdir(join(projectPath, 'src', 'systems'), { recursive: true });

      await writeFile(join(projectPath, 'harness', 'critical-flow.json'), JSON.stringify({
        steps: [
          { id: 'boot', scene: 'BootScene' },
        ],
      }), 'utf8');

      await writeFile(join(projectPath, 'src', 'scenes', 'BootScene.tscn'), [
        '[gd_scene format=3]',
        '[node name="BootScene" type="Control"]',
      ].join('\n'), 'utf8');
      await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');
      await writeFile(join(projectPath, 'src', 'systems', 'Helper.gd'), 'class_name Helper\nextends RefCounted\n', 'utf8');
      await writeFile(join(projectPath, 'src', 'scenes', 'BootScene.gd'), [
        'extends Control',
        'const MissingScene := preload("res://src/scenes/MissingScene.tscn")',
        'var _helper: Helper',
      ].join('\n'), 'utf8');
      await writeFile(join(projectPath, 'src', 'systems', 'DeadCode.gd'), [
        'extends RefCounted',
        'var _ghost: MissingHelper',
      ].join('\n'), 'utf8');

      const manifest: RuntimeFileManifest = {
        version: '1.0.0',
        generatedAt: '2026-04-17T00:00:00.000Z',
        canonicalLayoutId: 'godot-src-v1',
        manifestPath: 'harness/runtime-manifest.json',
        mainScenePath: 'res://src/scenes/BootScene.tscn',
        scenes: [
          {
            id: 'BootScene',
            scenePath: 'res://src/scenes/BootScene.tscn',
            scriptPath: 'res://src/scenes/BootScene.gd',
          },
        ],
        scripts: [
          { id: 'BootScene', scriptPath: 'res://src/scenes/BootScene.gd', category: 'scene' },
          { id: 'Helper', scriptPath: 'res://src/systems/Helper.gd', category: 'system' },
          { id: 'DeadCode', scriptPath: 'res://src/systems/DeadCode.gd', category: 'system' },
        ],
        autoloads: [
          { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
        ],
        dataRoots: [],
      };

      const result = await validateRuntimeDependencies(projectPath, manifest);

      expect(result.success).toBe(false);
      expect(result.activeScriptPaths).toContain('res://src/scenes/BootScene.gd');
      expect(result.activeScriptPaths).toContain('res://src/autoload/EventBus.gd');
      expect(result.inactiveScriptPaths).toContain('res://src/systems/DeadCode.gd');
      expect(result.activeIssues).toEqual([
        expect.objectContaining({
          sourcePath: 'res://src/scenes/BootScene.gd',
          sourceLine: 2,
          dependencyKind: 'preload',
          dependency: 'res://src/scenes/MissingScene.tscn',
          active: true,
        }),
      ]);
      expect(result.inactiveIssues).toEqual([
        expect.objectContaining({
          sourcePath: 'res://src/systems/DeadCode.gd',
          sourceLine: 2,
          dependencyKind: 'class_name',
          dependency: 'MissingHelper',
          active: false,
        }),
      ]);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it('treats root scene names from critical-flow.json as active scene selectors', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'runtime-deps-roots-'));

    try {
      await mkdir(join(projectPath, 'harness'), { recursive: true });
      await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });

      await writeFile(join(projectPath, 'harness', 'critical-flow.json'), JSON.stringify({
        steps: [
          { id: 'title', scene: 'TitleScene' },
        ],
      }), 'utf8');
      await writeFile(join(projectPath, 'src', 'scenes', 'MainMenuScene.tscn'), [
        '[gd_scene format=3]',
        '[node name="TitleScene" type="Control"]',
      ].join('\n'), 'utf8');
      await writeFile(join(projectPath, 'src', 'scenes', 'MainMenuScene.gd'), 'extends Control\n', 'utf8');

      const manifest: RuntimeFileManifest = {
        version: '1.0.0',
        generatedAt: '2026-04-17T00:00:00.000Z',
        canonicalLayoutId: 'godot-src-v1',
        manifestPath: 'harness/runtime-manifest.json',
        scenes: [
          {
            id: 'MainMenuScene',
            scenePath: 'res://src/scenes/MainMenuScene.tscn',
            scriptPath: 'res://src/scenes/MainMenuScene.gd',
          },
        ],
        scripts: [
          { id: 'MainMenuScene', scriptPath: 'res://src/scenes/MainMenuScene.gd', category: 'scene' },
        ],
        autoloads: [],
        dataRoots: [],
      };

      const result = await validateRuntimeDependencies(projectPath, manifest);

      expect(result.activeScriptPaths).toContain('res://src/scenes/MainMenuScene.gd');
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});
