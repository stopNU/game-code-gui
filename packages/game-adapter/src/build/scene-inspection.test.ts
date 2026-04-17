import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { inspectActiveScenes } from './scene-inspection.js';

describe('scene inspection', () => {
  it('reports main and required scene wiring with concise static statuses', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'scene-inspection-'));
    await mkdir(join(projectPath, 'harness'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });

    await writeFile(join(projectPath, 'project.godot'), [
      '[application]',
      'run/main_scene="res://src/main.tscn"',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'harness', 'tasks.json'), JSON.stringify({
      scenes: ['BootScene', 'CombatScene', 'MissingScene'],
    }, null, 2), 'utf8');

    await writeFile(join(projectPath, 'src', 'main.tscn'), [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://src/scenes/BootScene.gd" id="1_boot"]',
      '',
      '[node name="BootScene" type="Node"]',
      'script = ExtResource("1_boot")',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'scenes', 'BootScene.tscn'), [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://src/scenes/BootScene.gd" id="1_boot"]',
      '',
      '[node name="BootScene" type="Node"]',
      'script = ExtResource("1_boot")',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'scenes', 'BootScene.gd'), 'extends Node\n', 'utf8');

    await writeFile(join(projectPath, 'src', 'scenes', 'CombatScene.tscn'), [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[ext_resource type="Script" path="res://src/scenes/CombatScene.gd" id="1_combat"]',
      '',
      '[node name="CombatScene" type="Control"]',
      'script = ExtResource("1_combat")',
    ].join('\n'), 'utf8');

    const result = await inspectActiveScenes(projectPath);

    expect(result.inspectionMode).toBe('static');
    expect(result.mainScenePath).toBe('res://src/main.tscn');
    expect(result.scenes).toEqual([
      {
        kind: 'main-scene',
        sceneId: 'main',
        scenePath: 'res://src/main.tscn',
        required: false,
        exists: true,
        rootNodeType: 'Node',
        attachedScriptPath: 'res://src/scenes/BootScene.gd',
        instantiationStatus: 'ready',
        issues: [],
      },
      {
        kind: 'required-scene',
        sceneId: 'BootScene',
        scenePath: 'res://src/scenes/BootScene.tscn',
        required: true,
        exists: true,
        rootNodeType: 'Node',
        attachedScriptPath: 'res://src/scenes/BootScene.gd',
        instantiationStatus: 'ready',
        issues: [],
      },
      {
        kind: 'required-scene',
        sceneId: 'CombatScene',
        scenePath: 'res://src/scenes/CombatScene.tscn',
        required: true,
        exists: true,
        rootNodeType: 'Control',
        attachedScriptPath: 'res://src/scenes/CombatScene.gd',
        instantiationStatus: 'missing-script',
        issues: [],
      },
      {
        kind: 'required-scene',
        sceneId: 'MissingScene',
        scenePath: 'res://src/scenes/MissingScene.tscn',
        required: true,
        exists: false,
        rootNodeType: null,
        attachedScriptPath: null,
        instantiationStatus: 'missing-scene',
        issues: ['Scene file is missing'],
      },
    ]);
  });

  it('falls back to discovered scenes when no required scene list is present', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'scene-inspection-fallback-'));
    await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });

    await writeFile(join(projectPath, 'project.godot'), [
      '[application]',
      'run/main_scene="res://src/main.tscn"',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'main.tscn'), [
      '[gd_scene load_steps=1 format=3]',
      '',
      '[node name="Main" type="Node"]',
    ].join('\n'), 'utf8');
    await writeFile(join(projectPath, 'src', 'scenes', 'MapScene.tscn'), [
      '[gd_scene load_steps=1 format=3]',
      '',
      '[node name="MapScene" type="Control"]',
    ].join('\n'), 'utf8');

    const result = await inspectActiveScenes(projectPath);

    expect(result.scenes).toEqual([
      {
        kind: 'main-scene',
        sceneId: 'main',
        scenePath: 'res://src/main.tscn',
        required: false,
        exists: true,
        rootNodeType: 'Node',
        attachedScriptPath: null,
        instantiationStatus: 'ready',
        issues: [],
      },
      {
        kind: 'required-scene',
        sceneId: 'MapScene',
        scenePath: 'res://src/scenes/MapScene.tscn',
        required: true,
        exists: true,
        rootNodeType: 'Control',
        attachedScriptPath: null,
        instantiationStatus: 'ready',
        issues: [],
      },
    ]);
  });
});
