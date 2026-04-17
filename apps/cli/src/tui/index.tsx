import React from 'react';
import { render } from 'ink';
import { spawn } from 'child_process';
import { closeSync, openSync } from 'fs';
import { createRuntimeLogReference } from '@agent-harness/game-adapter';
import { App } from './App.js';
import type { TuiProps } from './types.js';

export function startTui(props: TuiProps): void {
  if (!process.stdout.isTTY) {
    console.error('TUI mode requires an interactive terminal. Use standard CLI commands instead.');
    process.exit(1);
  }

  const { unmount, waitUntilExit } = render(
    <App
      {...props}
      onStartGame={(projectPath) => {
        unmount();
        const godot = process.env['GODOT_PATH'] ?? 'godot';
        void createRuntimeLogReference(projectPath, 'play').then((logReference) => {
          process.stdout.write(`\n  Opening ${projectPath} in Godot...\n`);
          process.stdout.write(`  Runtime log: ${logReference.logPath}\n\n`);

          const logFd = openSync(logReference.logPath, 'a');
          const child = spawn(godot, ['--path', projectPath], {
            stdio: ['ignore', logFd, logFd],
            detached: true,
          });

          child.on('error', (err: NodeJS.ErrnoException) => {
            closeSync(logFd);
            process.stderr.write(`\n  Error launching Godot: ${err.message}\n`);
            if (err.code === 'ENOENT') {
              process.stderr.write(
                `  Set GODOT_PATH to your Godot executable, e.g.:\n\n` +
                `    $env:GODOT_PATH = "C:\\Users\\You\\Desktop\\Godot_v4.x.exe"\n\n`,
              );
            }
            process.exit(1);
          });

          child.unref();
          closeSync(logFd);
          process.exit(0);
        }).catch((err: unknown) => {
          process.stderr.write(`\n  Error preparing runtime log capture: ${String(err)}\n`);
          process.exit(1);
        });
      }}
    />,
  );
  waitUntilExit().then(() => process.exit(0)).catch(() => process.exit(1));
}
