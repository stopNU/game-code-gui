import { resolve } from 'path';
import { inspectActiveScenes } from '@agent-harness/game-adapter';

export interface InspectScenesOptions {
  project: string;
}

export async function inspectScenesCmd(opts: InspectScenesOptions): Promise<void> {
  const projectPath = resolve(process.cwd(), opts.project);
  const inspection = await inspectActiveScenes(projectPath);
  console.log(JSON.stringify(inspection));
}
