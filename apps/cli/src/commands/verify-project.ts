import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { verifyProject } from '@agent-harness/playtest';
import { c, printSection, printTable, spinner } from '../utils/output.js';

export interface VerifyProjectCommandOptions {
  project: string;
  timeout?: string;
  report?: string;
}

export async function verifyProjectCmd(opts: VerifyProjectCommandOptions): Promise<void> {
  const projectPath = resolve(process.cwd(), opts.project);
  const timeoutMs = opts.timeout !== undefined ? Number.parseInt(opts.timeout, 10) : undefined;

  if (timeoutMs !== undefined && Number.isNaN(timeoutMs)) {
    throw new Error(`Invalid timeout value: ${opts.timeout}`);
  }

  const reportPath = resolve(projectPath, opts.report ?? join('harness', 'verify-project-report.json'));
  const verifySpinner = spinner('Running generated-project verification...');
  const report = await verifyProject({
    projectPath,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (report.passed) {
    verifySpinner.succeed('Generated-project verification passed');
  } else {
    verifySpinner.fail('Generated-project verification failed');
  }

  printSection('Verification Summary');
  printTable([
    { metric: 'passed', value: String(report.passed) },
    { metric: 'requiredScenes', value: report.summary.requiredSceneCount },
    { metric: 'sceneBindingFailures', value: report.summary.sceneBindingFailureCount },
    { metric: 'autoloadFailures', value: report.summary.autoloadFailureCount },
    { metric: 'startupPassed', value: String(report.summary.startupPassed) },
    { metric: 'flowPassed', value: String(report.summary.flowPassed) },
    { metric: 'uiIssueCount', value: report.summary.uiIssueCount },
    { metric: 'milestoneScenes', value: report.summary.milestoneSceneCount },
    { metric: 'milestoneFailures', value: report.summary.milestoneFailureCount },
    { metric: 'structuredReport', value: reportPath },
  ]);

  printSection('Checks');
  printTable([
    { check: 'sceneInspection', passed: String(report.sceneInspection.passed), blockers: report.sceneInspection.blockers.length },
    { check: 'sceneBinding', passed: String(report.sceneBinding.passed), blockers: report.sceneBinding.blockers.length },
    { check: 'autoload', passed: String(report.autoload.passed), blockers: report.autoload.blockers.length },
    { check: 'startup', passed: String(report.startup.passed), blockers: report.startup.blockers.length },
    { check: 'flow', passed: String(report.flow.passed), blockers: report.flow.blockers.length },
    { check: 'ui', passed: String(report.ui.passed), blockers: report.ui.blockers.length },
  ]);

  if (report.blockers.length > 0) {
    printSection('Blockers');
    for (const blocker of report.blockers) {
      console.log(c.error(blocker));
    }
  }

  if (report.milestoneScenes.length > 0) {
    printSection('Milestone Criteria');
    printTable(
      report.milestoneScenes.flatMap((scene) =>
        scene.criteria.map((criterion) => ({
          scene: scene.sceneId,
          criterion: criterion.id,
          passed: criterion.status === 'passed' ? c.success('yes') : c.error('no'),
          detail: criterion.blockers[0] ?? criterion.evidence[0] ?? criterion.description,
        }))),
    );
  }

  if (report.warnings.length > 0) {
    printSection('Warnings');
    for (const warning of report.warnings) {
      console.log(c.warn(warning));
    }
  }

  if (!report.passed) {
    process.exit(1);
  }
}
