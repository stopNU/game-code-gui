import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { validateRuntimeLayout } from './runtime-layout.js';

describe('runtime layout validation', () => {
  it('passes for the canonical src layout', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-layout-pass-'));
    await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
    await mkdir(join(projectPath, 'harness'), { recursive: true });
    await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');
    await writeFile(join(projectPath, 'project.godot'), 'run/main_scene="res://src/main.tscn"\n', 'utf8');

    const result = await validateRuntimeLayout(projectPath);

    expect(result.success).toBe(true);
    expect(result.authoritativeRuntimeRoots).toContain('src');
    expect(result.activeRuntimeRoots).toContain('src');
    expect(result.duplicateSubsystems).toHaveLength(0);
  });

  it('fails when src and scripts layouts are both active with duplicate subsystems', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-layout-fail-'));
    await mkdir(join(projectPath, 'src', 'autoload'), { recursive: true });
    await mkdir(join(projectPath, 'scripts', 'core'), { recursive: true });
    await writeFile(join(projectPath, 'src', 'autoload', 'EventBus.gd'), 'extends Node\n', 'utf8');
    await writeFile(join(projectPath, 'scripts', 'core', 'EventBus.gd'), 'extends Node\n', 'utf8');
    await writeFile(
      join(projectPath, 'project.godot'),
      [
        'run/main_scene="res://src/main.tscn"',
        'EventBus="*res://scripts/core/EventBus.gd"',
        'HarnessPlugin="*res://src/autoload/HarnessPlugin.gd"',
      ].join('\n'),
      'utf8',
    );

    const result = await validateRuntimeLayout(projectPath);

    expect(result.success).toBe(false);
    expect(result.activeRuntimeRoots).toContain('src');
    expect(result.activeRuntimeRoots).toContain('scripts');
    expect(result.duplicateSubsystems).toEqual([
      {
        subsystem: 'EventBus',
        authoritativePath: 'src/autoload/EventBus.gd',
        conflictingPath: 'scripts/core/EventBus.gd',
      },
    ]);
    expect(result.issues.some((issue) => issue.includes('Mixed active runtime layout detected across roots:'))).toBe(true);
  });
});
