import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  generateRuntimeManifest,
  validateRuntimeManifest,
  writeRuntimeManifest,
} from './runtime-manifest.js';

describe('runtime manifest', () => {
  it('captures scenes, scripts, autoloads, and data roots for a Godot project', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-manifest-'));
    await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'systems'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'data', 'content'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'data', 'schemas'), { recursive: true });

    await writeFile(join(projectPath, 'project.godot'), [
      '[application]',
      'run/main_scene="res://src/main.tscn"',
      '',
      '[autoload]',
      'EventBus="*res://src/autoload/EventBus.gd"',
      'ContentLoader="*res://src/autoload/ContentLoader.gd"',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'main.tscn'), '[gd_scene format=3]\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'scenes', 'CombatScene.tscn'), '[gd_scene format=3]\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'scenes', 'CombatScene.gd'), 'extends Control\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'autoload', 'ContentLoader.gd'), 'extends Node\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'systems', 'CombatEngine.gd'), 'extends RefCounted\n', 'utf8');

    const manifest = await generateRuntimeManifest(projectPath);

    expect(manifest.mainScenePath).toBe('res://src/main.tscn');
    expect(manifest.autoloads).toEqual([
      { name: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd' },
      { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
    ]);
    expect(manifest.scenes).toEqual([
      { id: 'main', scenePath: 'res://src/main.tscn' },
      {
        id: 'CombatScene',
        scenePath: 'res://src/scenes/CombatScene.tscn',
        scriptPath: 'res://src/scenes/CombatScene.gd',
      },
    ]);
    expect(manifest.scripts).toEqual([
      { id: 'ContentLoader', scriptPath: 'res://src/autoload/ContentLoader.gd', category: 'autoload' },
      { id: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd', category: 'autoload' },
      { id: 'CombatScene', scriptPath: 'res://src/scenes/CombatScene.gd', category: 'scene' },
      { id: 'CombatEngine', scriptPath: 'res://src/systems/CombatEngine.gd', category: 'system' },
    ]);
    expect(manifest.dataRoots).toEqual([
      { id: 'content', path: 'src/data/content', kind: 'content' },
      { id: 'schemas', path: 'src/data/schemas', kind: 'schema' },
    ]);
  });

  it('fails validation when a manifest entry points to a missing file', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-manifest-invalid-'));
    await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
    await mkdir(join(projectPath, 'harness'), { recursive: true });
    await writeFile(join(projectPath, 'project.godot'), '[autoload]\nEventBus="*res://src/autoload/EventBus.gd"\n', 'utf8');
    await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');

    const manifest = await writeRuntimeManifest(projectPath);
    manifest.autoloads.push({
      name: 'MissingLoader',
      scriptPath: 'res://src/autoload/MissingLoader.gd',
    });

    const result = await validateRuntimeManifest(projectPath, manifest);

    expect(result.success).toBe(false);
    expect(result.issues).toEqual([
      {
        entryType: 'autoload',
        identifier: 'MissingLoader',
        path: 'res://src/autoload/MissingLoader.gd',
        message: 'Autoload entry points to a missing file',
      },
    ]);
  });
});
