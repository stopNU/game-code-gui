import { execa } from 'execa';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { truncateTail, SCRIPT_OUTPUT_MAX_LINES } from '../truncate.js';

interface InstallDepsInput {
  cwd?: string;
  frozen?: boolean;
}

interface InstallDepsOutput {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export const installDepsTool: ToolContract<InstallDepsInput, InstallDepsOutput> = {
  name: 'npm__installDeps',
  group: 'npm',
  description:
    'Run pnpm install in the project directory. ' +
    `stdout and stderr are each capped at ${SCRIPT_OUTPUT_MAX_LINES} lines.`,
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Working directory relative to project root' },
      frozen: { type: 'boolean', description: 'Use --frozen-lockfile (default: false)' },
    },
  },
  outputSchema: { type: 'object' },
  permissions: ['npm:install'],
  async execute(input: InstallDepsInput, ctx: ToolExecutionContext): Promise<InstallDepsOutput> {
    const cwd = input.cwd
      ? new URL(input.cwd, `file://${ctx.projectPath}/`).pathname
      : ctx.projectPath;
    const start = Date.now();
    const args = ['install'];
    if (input.frozen) args.push('--frozen-lockfile');

    const result = await execa('pnpm', args, { cwd, reject: false, timeout: 120000 });

    const { text: stdout, truncated: stdoutTruncated } = truncateTail(result.stdout ?? '', SCRIPT_OUTPUT_MAX_LINES);
    const { text: stderr, truncated: stderrTruncated } = truncateTail(result.stderr ?? '', SCRIPT_OUTPUT_MAX_LINES);

    return {
      success: (result.exitCode ?? 0) === 0,
      stdout,
      stderr,
      durationMs: Date.now() - start,
      stdoutTruncated,
      stderrTruncated,
    };
  },
};

/** Standalone helper for use outside of tool contracts.
 *  Uses npm so generated game directories (which are not pnpm workspace members)
 *  get their own node_modules rather than being absorbed by the workspace root install. */
export async function installDeps(projectPath: string): Promise<void> {
  const result = await execa('npm', ['install'], { cwd: projectPath, reject: false, timeout: 120000 });
  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(`npm install failed:\n${result.stderr}`);
  }
}
