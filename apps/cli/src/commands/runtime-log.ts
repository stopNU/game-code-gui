import { resolve } from 'path';
import { readRuntimeErrorSummary, resolveLatestRuntimeLog } from '@agent-harness/game-adapter';
import type { RuntimeLogMode } from '@agent-harness/game-adapter';
import { c, printSection, printTable } from '../utils/output.js';

export interface RuntimeLogOptions {
  project: string;
  mode?: string;
}

export async function runtimeLogCmd(opts: RuntimeLogOptions): Promise<void> {
  const projectPath = resolve(process.cwd(), opts.project);
  const mode = parseMode(opts.mode);
  const reference = await resolveLatestRuntimeLog(projectPath, mode);

  if (reference === null) {
    throw new Error(`No captured runtime log found${mode !== undefined ? ` for mode "${mode}"` : ''}.`);
  }

  const summary = await readRuntimeErrorSummary(projectPath, mode);

  printSection('Latest Runtime Log');
  printTable([
    { metric: 'mode', value: reference.mode },
    { metric: 'startedAt', value: reference.startedAt },
    { metric: 'logPath', value: reference.logPath },
  ]);

  if (summary !== null && summary.lines.length > 0) {
    printSection('Runtime Errors');
    for (const line of summary.lines) {
      console.log(c.warn(line));
    }
  } else {
    console.log(c.info('No runtime error lines matched the latest captured log.'));
  }
}

function parseMode(input?: string): RuntimeLogMode | undefined {
  if (input === undefined || input === 'latest' || input === 'any') {
    return undefined;
  }

  const allowed: RuntimeLogMode[] = ['play', 'smoke', 'build', 'typecheck', 'scene-binding', 'autoload-validation'];
  if ((allowed as string[]).includes(input)) {
    return input as RuntimeLogMode;
  }

  throw new Error(`Invalid runtime log mode: ${input}`);
}
