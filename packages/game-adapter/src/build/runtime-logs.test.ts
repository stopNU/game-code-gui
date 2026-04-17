import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeLogReference,
  readRuntimeErrorSummary,
  readRuntimeLogIndex,
  summarizeRuntimeErrors,
  writeRuntimeLog,
} from './runtime-logs.js';

describe('runtime log helpers', () => {
  it('stores latest pointers by mode and overall', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-log-'));
    const reference = await createRuntimeLogReference(projectPath, 'smoke');

    await writeRuntimeLog(projectPath, reference, 'Boot ok\nERROR: boom\n');

    const index = await readRuntimeLogIndex(projectPath);
    expect(index.latest?.logPath).toBe(reference.logPath);
    expect(index.byMode['smoke']?.logPath).toBe(reference.logPath);
  });

  it('extracts a concise runtime error summary', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'runtime-log-summary-'));
    const reference = await createRuntimeLogReference(projectPath, 'play');

    await writeRuntimeLog(projectPath, reference, [
      'Godot Engine v4.4',
      'ERROR: Invalid call. Nonexistent function "foo" in base "Node".',
      'at: _ready (res://src/scenes/MainMenuScene.gd:10)',
      'ERROR: Attempt to call function "bar" in base null instance.',
    ].join('\n'));

    const summary = await readRuntimeErrorSummary(projectPath, 'play');
    expect(summary?.totalMatches).toBe(2);
    expect(summary?.lines).toEqual([
      'ERROR: Invalid call. Nonexistent function "foo" in base "Node".',
      'ERROR: Attempt to call function "bar" in base null instance.',
    ]);
  });

  it('dedupes repeated error lines', () => {
    const summary = summarizeRuntimeErrors([
      'ERROR: duplicate',
      'ERROR: duplicate',
      'Script Error: another issue',
    ].join('\n'));

    expect(summary.totalMatches).toBe(3);
    expect(summary.lines).toEqual(['ERROR: duplicate', 'Script Error: another issue']);
  });
});
