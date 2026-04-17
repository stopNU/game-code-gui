import { execa } from 'execa';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { truncateTail, SCRIPT_OUTPUT_MAX_LINES } from '../truncate.js';

/** Standalone helper — runs a pnpm script in the given directory and returns stdout+stderr. */
export async function runScript(
  projectPath: string,
  script: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const result = await execa('pnpm', ['run', script], {
    cwd: projectPath,
    reject: false,
    timeout: 120000,
  });
  return {
    success: (result.exitCode ?? 0) === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

interface RunScriptInput {
  script: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

interface RunScriptOutput {
  script: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
  durationMs: number;
  /** True when stdout was longer than SCRIPT_OUTPUT_MAX_LINES and was tail-truncated. */
  stdoutTruncated: boolean;
  /** True when stderr was longer than SCRIPT_OUTPUT_MAX_LINES and was tail-truncated. */
  stderrTruncated: boolean;
}

export const runScriptTool: ToolContract<RunScriptInput, RunScriptOutput> = {
  name: 'npm__runScript',
  group: 'npm',
  description:
    'Run an npm/pnpm script in the project directory. ' +
    `stdout and stderr are each capped at ${SCRIPT_OUTPUT_MAX_LINES} lines (tail kept — errors appear last).`,
  inputSchema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Script name from package.json scripts' },
      args: { type: 'array', items: { type: 'string' }, description: 'Additional arguments' },
      cwd: { type: 'string', description: 'Working directory relative to project root (default: root)' },
      timeoutMs: { type: 'number', description: 'Timeout in ms (default: 60000)' },
    },
    required: ['script'],
  },
  outputSchema: { type: 'object' },
  permissions: ['npm:run'],
  async execute(input: RunScriptInput, ctx: ToolExecutionContext): Promise<RunScriptOutput> {
    const cwd = input.cwd
      ? new URL(input.cwd, `file://${ctx.projectPath}/`).pathname
      : ctx.projectPath;
    const start = Date.now();

    try {
      const result = await execa('pnpm', ['run', input.script, ...(input.args ?? [])], {
        cwd,
        timeout: input.timeoutMs ?? 60000,
        reject: false,
      });

      const { text: stdout, truncated: stdoutTruncated } = truncateTail(result.stdout ?? '', SCRIPT_OUTPUT_MAX_LINES);
      const { text: stderr, truncated: stderrTruncated } = truncateTail(result.stderr ?? '', SCRIPT_OUTPUT_MAX_LINES);

      return {
        script: input.script,
        exitCode: result.exitCode ?? 0,
        stdout,
        stderr,
        success: (result.exitCode ?? 0) === 0,
        durationMs: Date.now() - start,
        stdoutTruncated,
        stderrTruncated,
      };
    } catch (err) {
      return {
        script: input.script,
        exitCode: 1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        success: false,
        durationMs: Date.now() - start,
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    }
  },
};
