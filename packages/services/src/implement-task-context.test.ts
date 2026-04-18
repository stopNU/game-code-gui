import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveReconciliationReportFile } from './implement-task-context.js';

describe('resolveReconciliationReportFile', () => {
  const createdPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(createdPaths.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    }));
  });

  it('accepts an absolute report path inside the project', async () => {
    const projectPath = join(tmpdir(), `services-refactor-${Date.now()}`);
    const reportPath = join(projectPath, 'harness', 'runtime-reconciliation-report.json');

    createdPaths.push(projectPath);
    await mkdir(join(projectPath, 'harness'), { recursive: true });
    await writeFile(reportPath, '{"version":"1"}', 'utf8');

    const resolved = await resolveReconciliationReportFile(projectPath, reportPath);

    expect(resolved).toEqual({
      absolutePath: reportPath,
      contextPath: 'harness/runtime-reconciliation-report.json',
    });
  });

  it('falls back to the default relative report path', async () => {
    const projectPath = join(tmpdir(), `services-refactor-${Date.now()}-fallback`);
    const reportPath = join(projectPath, 'harness', 'runtime-reconciliation-report.json');

    createdPaths.push(projectPath);
    await mkdir(join(projectPath, 'harness'), { recursive: true });
    await writeFile(reportPath, '{"version":"1"}', 'utf8');

    const resolved = await resolveReconciliationReportFile(projectPath);

    expect(resolved).toEqual({
      absolutePath: reportPath,
      contextPath: 'harness/runtime-reconciliation-report.json',
    });
  });
});
