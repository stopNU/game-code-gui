import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GodotManager } from './godot-manager.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

function createChildProcessMock() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn((signal?: string) => {
    if (signal === 'SIGTERM') {
      child.emit('exit', 0);
    }
    return true;
  });
  return child;
}

describe('GodotManager', () => {
  const godotBinary = process.env['GODOT_PATH'] ?? 'godot';
  const settingsService = {
    getApiKey: vi.fn((_key: string) => null),
  };
  const emit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('launches with debugger args when requested', async () => {
    const child = createChildProcessMock();
    vi.mocked(spawn).mockReturnValue(child as never);
    const manager = new GodotManager(settingsService as never, emit);

    await manager.launch({
      projectPath: 'D:/games/dragon-deck',
      launchedBy: 'ui',
      debuggerEnabled: true,
    });

    expect(spawn).toHaveBeenCalledWith(
      godotBinary,
      ['-d', '--path', 'D:/games/dragon-deck'],
      expect.objectContaining({
        cwd: 'D:/games/dragon-deck',
        stdio: 'pipe',
      }),
    );
  });

  it('launches without debugger args by default and can still stop cleanly', async () => {
    const child = createChildProcessMock();
    vi.mocked(spawn).mockReturnValue(child as never);
    const manager = new GodotManager(settingsService as never, emit);

    await manager.launch({
      projectPath: 'D:/games/dragon-deck',
      launchedBy: 'ui',
    });

    expect(spawn).toHaveBeenCalledWith(
      godotBinary,
      ['--path', 'D:/games/dragon-deck'],
      expect.objectContaining({
        cwd: 'D:/games/dragon-deck',
        stdio: 'pipe',
      }),
    );

    const status = await manager.stop({
      requester: 'ui',
      force: true,
    });

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(status).toMatchObject({
      status: 'stopped',
      projectPath: 'D:/games/dragon-deck',
      launchedBy: 'ui',
      exitCode: 0,
    });
  });
});
