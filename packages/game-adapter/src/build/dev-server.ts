import { execa } from 'execa';
import { createWriteStream } from 'fs';
import { finished } from 'stream/promises';
import type { DevServerHandle } from '../types/project.js';
import { createRuntimeLogReference } from './runtime-logs.js';

/** Resolve the Godot 4 binary path via env var or fall back to `godot` in PATH. */
function godotBin(): string {
  return process.env['GODOT_PATH'] ?? 'godot';
}

/**
 * Launch the Godot project in a native desktop window.
 *
 * Spawns `godot --path {projectPath}` and returns a handle with `stop()`.
 * Unlike a web dev server, there is no URL — Godot opens a native OS window.
 */
export async function startDevServer(projectPath: string): Promise<DevServerHandle> {
  const logReference = await createRuntimeLogReference(projectPath, 'play');
  const logStream = createWriteStream(logReference.logPath, { flags: 'a' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = execa(godotBin(), ['--path', projectPath], {
    cwd: projectPath,
    reject: false,
    detached: false,
  });
  proc.stdout?.pipe(logStream, { end: false });
  proc.stderr?.pipe(logStream, { end: false });

  // Give Godot a moment to start before returning
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));

  return {
    logPath: logReference.logPath,
    stop: async () => {
      proc.kill('SIGTERM');
      await new Promise<void>((res) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (proc as any).on?.('exit', () => res());
        setTimeout(res, 3000);
      });
      logStream.end();
      await finished(logStream).catch(() => undefined);
    },
  };
}
