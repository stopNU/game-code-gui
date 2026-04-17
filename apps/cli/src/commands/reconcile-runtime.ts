import { dirname, join, resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { generateRuntimeReconciliationReport } from '@agent-harness/game-adapter';
import { c, printSection, printTable, spinner } from '../utils/output.js';

export interface ReconcileRuntimeCommandOptions {
  project: string;
  report?: string;
}

export async function reconcileRuntimeCmd(opts: ReconcileRuntimeCommandOptions): Promise<void> {
  const projectPath = resolve(process.cwd(), opts.project);
  const reportPath = resolve(projectPath, opts.report ?? join('harness', 'runtime-reconciliation-report.json'));

  const reconcileSpinner = spinner('Reconciling runtime drift (read-only)...');
  const report = await generateRuntimeReconciliationReport(projectPath);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (report.conflicts.length === 0) {
    reconcileSpinner.succeed('No runtime drift detected');
  } else {
    reconcileSpinner.warn(`Found ${report.conflicts.length} runtime drift conflict(s)`);
  }

  printSection('Reconciliation Summary');
  printTable([
    { metric: 'mode', value: report.mode },
    { metric: 'canonicalLayout', value: report.canonicalLayoutId },
    { metric: 'activeRoots', value: report.activeRuntimeRoots.join(', ') || 'none' },
    { metric: 'conflicts', value: report.conflicts.length },
    { metric: 'repairSteps', value: report.repairPlan.length },
    { metric: 'reportPath', value: reportPath },
  ]);

  if (report.conflicts.length > 0) {
    printSection('Conflicts');
    for (const conflict of report.conflicts) {
      const label = conflict.severity === 'error' ? c.error(conflict.summary) : c.warn(conflict.summary);
      console.log(label);
      console.log(c.dim(`  ${conflict.details}`));
      if (conflict.paths.length > 0) {
        console.log(c.dim(`  paths: ${conflict.paths.join(', ')}`));
      }
    }
  }

  if (report.repairPlan.length > 0) {
    printSection('Repair Plan');
    printTable(report.repairPlan.map((step) => ({
      id: step.id,
      priority: step.priority,
      title: step.title,
      targets: step.targets.join(', ') || 'none',
    })));
  }
}
