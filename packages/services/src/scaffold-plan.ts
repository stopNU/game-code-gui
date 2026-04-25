import { readFile } from 'fs/promises';
import { normalizeTaskPlan } from '@agent-harness/core';
import type { TaskPlan } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { installDeps } from '@agent-harness/tools';

export interface ScaffoldPlanArgs {
  planFile: string;
  outputPath: string;
  onStageChange?: (stage: 'validating' | 'scaffolding' | 'installing-deps') => void;
  onInstallDepsError?: (error: unknown) => void;
}

export async function scaffoldPlanService(args: ScaffoldPlanArgs): Promise<TaskPlan> {
  args.onStageChange?.('validating');

  const raw = await readFile(args.planFile, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Plan file is not valid JSON: ${args.planFile}`);
  }

  // normalizeTaskPlan fills in all missing TaskState boilerplate (status, brief,
  // retries, context, timestamps) so compact planner output works without inflation.
  const plan = normalizeTaskPlan(parsed);

  args.onStageChange?.('scaffolding');
  await scaffoldGame({ outputPath: args.outputPath, plan });

  args.onStageChange?.('installing-deps');
  try {
    await installDeps(args.outputPath);
  } catch (error) {
    args.onInstallDepsError?.(error);
  }

  return plan;
}
