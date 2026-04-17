import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { generateRuntimeReconciliationReport } from './runtime-reconciliation.js';

describe('runtime reconciliation', () => {
  it('reports duplicate implementations, manifest drift, and broken runtime references without applying repairs', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-reconcile-'));
    await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
    await mkdir(join(projectPath, 'src', 'scenes'), { recursive: true });
    await mkdir(join(projectPath, 'scripts', 'core'), { recursive: true });
    await mkdir(join(projectPath, 'harness'), { recursive: true });

    await writeFile(join(projectPath, 'project.godot'), [
      '[application]',
      'run/main_scene="res://src/main.tscn"',
      '',
      '[autoload]',
      'EventBus="*res://src/autoload/EventBus.gd"',
      'LegacyBus="*res://scripts/core/EventBus.gd"',
    ].join('\n'), 'utf8');

    await writeFile(join(projectPath, 'src', 'main.tscn'), [
      '[gd_scene format=3]',
      '[ext_resource type="Script" path="res://src/scenes/MainScene.gd" id="1"]',
      '[node name="Main" type="Control"]',
      'script = ExtResource("1")',
    ].join('\n'), 'utf8');
    await writeFile(
      join(projectPath, 'src', 'scenes', 'MainScene.gd'),
      'extends Control\nconst LegacyThing = preload("res://scripts/core/MissingThing.gd")\n',
      'utf8',
    );
    await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');
    await writeFile(join(projectPath, 'scripts', 'core', 'EventBus.gd'), 'extends Node\n', 'utf8');

    await writeFile(join(projectPath, 'harness', 'runtime-manifest.json'), JSON.stringify({
      version: '1.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      canonicalLayoutId: 'godot-src-v1',
      manifestPath: 'harness/runtime-manifest.json',
      scenes: [
        { id: 'main', scenePath: 'res://src/old-main.tscn' },
      ],
      scripts: [
        { id: 'OldScene', scriptPath: 'res://src/scenes/OldScene.gd', category: 'scene' },
      ],
      autoloads: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/OldEventBus.gd' },
      ],
      dataRoots: [],
    }, null, 2), 'utf8');

    const report = await generateRuntimeReconciliationReport(projectPath);

    expect(report.mode).toBe('read-only');
    expect(report.conflicts.some((conflict) => conflict.kind === 'mixed-runtime-layout')).toBe(true);
    expect(report.conflicts.some((conflict) => conflict.kind === 'duplicate-implementation')).toBe(true);
    expect(report.conflicts.some((conflict) => conflict.kind === 'manifest-mismatch')).toBe(true);
    expect(report.conflicts.some((conflict) => conflict.kind === 'reference-mismatch')).toBe(true);
    expect(report.repairPlan.length).toBeGreaterThan(0);
    expect(report.activeFiles.scripts).toContain('res://src/autoload/EventBus.gd');
    expect(report.activeFiles.scripts).toContain('res://src/scenes/MainScene.gd');
  });
});
