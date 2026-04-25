import { config } from 'dotenv';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';

export interface HarnessConfig {
  anthropicApiKey: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadHarnessConfig(): HarnessConfig {
  // Load .env from cwd and harness root
  config({ path: resolve(process.cwd(), '.env') });
  config({ path: resolve(import.meta.dirname, '../../../../.env') });

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.',
    );
  }

  return {
    anthropicApiKey: apiKey,
    logLevel: (process.env['LOG_LEVEL'] as HarnessConfig['logLevel']) ?? 'info',
  };
}

export async function loadTasksJson(projectPath: string): Promise<import('@agent-harness/core').TaskPlan> {
  const raw = await readFile(join(projectPath, 'harness', 'tasks.json'), 'utf8');
  return JSON.parse(raw) as import('@agent-harness/core').TaskPlan;
}

export async function saveTasksJson(
  projectPath: string,
  plan: import('@agent-harness/core').TaskPlan,
): Promise<void> {
  const { writeFile, mkdir } = await import('fs/promises');
  const dir = join(projectPath, 'harness');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'tasks.json'), JSON.stringify(plan, null, 2), 'utf8');
}
