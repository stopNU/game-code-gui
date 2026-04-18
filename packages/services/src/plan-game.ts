import { ClaudeClient, createAdvancedPlan, preprocessBrief } from '@agent-harness/core';
import type { PreprocessedBrief, TaskPlan } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { installDeps } from '@agent-harness/tools';

export type PlanGameStage =
  | 'preprocessing'
  | 'planning'
  | 'scaffolding'
  | 'installing-deps';

export interface PlanGameArgs {
  brief: string;
  outputPath: string;
  onStageChange?: (stage: PlanGameStage) => void;
  onInstallDepsError?: (error: unknown) => void;
}

export async function planGameService(args: PlanGameArgs): Promise<TaskPlan> {
  const client = new ClaudeClient();

  args.onStageChange?.('preprocessing');
  const preprocessedBrief = await preprocessBrief(args.brief, client);

  args.onStageChange?.('planning');
  const plan = await createAdvancedPlan(preprocessedBrief, client);

  args.onStageChange?.('scaffolding');
  await scaffoldProject(args.outputPath, plan, preprocessedBrief);

  args.onStageChange?.('installing-deps');
  try {
    await installDeps(args.outputPath);
  } catch (error) {
    args.onInstallDepsError?.(error);
  }

  return plan;
}

async function scaffoldProject(
  outputPath: string,
  plan: TaskPlan,
  preprocessedBrief: PreprocessedBrief,
): Promise<void> {
  await scaffoldGame({
    outputPath,
    plan,
    preprocessedBrief,
  });
}
