import { resolve, join } from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  runEvals,
  checkCIThresholds,
  buildRegressionReport,
  DEFAULT_CI_THRESHOLDS,
} from '@agent-harness/evals';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { spinner, c, printSection, printTable } from '../utils/output.js';
import type { EvalLayerName, EvalDataset, EvalReport } from '@agent-harness/evals';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_DATASET = resolve(__dirname, '../../../../packages/evals/src/data/baseline-scenarios.json');

export interface RunEvalsOptions {
  project: string;
  layer?: string;
  dataset?: string;
  baseline?: string;
  failOnThreshold?: boolean;
}

export async function runEvalsCmd(opts: RunEvalsOptions): Promise<void> {
  loadHarnessConfig();

  const projectPath = resolve(process.cwd(), opts.project);

  // Load dataset
  const datasetPath = opts.dataset ?? BUNDLED_DATASET;
  const datasetRaw = await readFile(datasetPath, 'utf8');
  const dataset: EvalDataset = JSON.parse(datasetRaw) as EvalDataset;

  const layers = opts.layer && opts.layer !== 'all'
    ? [opts.layer as EvalLayerName]
    : undefined;

  const scenarioCount = layers
    ? dataset.scenarios.filter((s) => layers.includes(s.layer)).length
    : dataset.scenarios.length;

  printSection(`Running evals: ${dataset.name}`);
  console.log(c.info(`Scenarios: ${scenarioCount} | Layer: ${opts.layer ?? 'all'}`));

  const evalSpinner = spinner('Running eval suite...');

  const reportDir = join(projectPath, 'harness', 'baselines');
  let report: EvalReport;

  try {
    report = await runEvals({
      projectPath,
      dataset,
      ...(layers ? { layers } : {}),
      reportOutputDir: reportDir,
    });
    evalSpinner.succeed(`Eval complete — ${report.summary.passed}/${report.summary.total} passed`);
  } catch (err) {
    evalSpinner.fail('Eval run failed');
    throw err;
  }

  printSection('Summary');
  printTable([
    { metric: 'Total', value: report.summary.total },
    { metric: 'Passed', value: report.summary.passed },
    { metric: 'Failed', value: report.summary.failed },
    { metric: 'Inconclusive', value: report.summary.inconclusive },
    { metric: 'Pass rate', value: `${(report.summary.passRate * 100).toFixed(0)}%` },
    { metric: 'Avg score', value: `${(report.summary.avgScore * 100).toFixed(0)}%` },
    ...(report.latestRuntimeLogPath !== undefined
      ? [{ metric: 'Latest runtime log', value: report.latestRuntimeLogPath }]
      : []),
  ]);

  // Per-scenario table
  if (report.scores.length > 0) {
    printSection('Scenarios');
    printTable(
      report.scores.map((s) => ({
        id: s.scenarioId,
        layer: s.layer,
        passed: s.inconclusive ? c.warn('infra') : s.passed ? c.success('yes') : c.error('no'),
        score: `${(s.ratio * 100).toFixed(0)}%`,
        ms: s.durationMs,
      })),
    );
  }

  const detailedFailures = report.scores.filter((score) => !score.passed && score.summary);
  if (detailedFailures.length > 0) {
    printSection('Failure details');
    detailedFailures.forEach((score) => {
      console.log(c.error(`${score.scenarioId}: ${score.summary}`));
      if (score.runtimeErrorSummary !== undefined && score.runtimeErrorSummary.length > 0) {
        score.runtimeErrorSummary.forEach((line) => console.log(c.warn(`  ${line}`)));
      } else if (score.runtimeLogPath !== undefined) {
        console.log(c.info(`  runtime log: ${score.runtimeLogPath}`));
      }
    });
  }

  // Load baseline for regression check
  if (opts.baseline) {
    const baselineRaw = await readFile(opts.baseline, 'utf8');
    const baseline: EvalReport = JSON.parse(baselineRaw) as EvalReport;
    const regression = buildRegressionReport(baseline, report);

    if (regression.regressions.length > 0) {
      printSection('Regressions');
      regression.regressions.forEach((r) => {
        console.log(c.error(`${r.scenarioId}: ${(r.baselineScore * 100).toFixed(0)}% → ${(r.currentScore * 100).toFixed(0)}% (${(r.delta * 100).toFixed(0)}%)`));
      });
    }

    if (regression.improvements.length > 0) {
      printSection('Improvements');
      regression.improvements.forEach((r) => {
        console.log(c.success(`${r.scenarioId}: ${(r.baselineScore * 100).toFixed(0)}% → ${(r.currentScore * 100).toFixed(0)}% (+${(r.delta * 100).toFixed(0)}%)`));
      });
    }
  }

  // CI threshold check
  if (opts.failOnThreshold !== false) {
    const ci = checkCIThresholds(report, DEFAULT_CI_THRESHOLDS);
    if (!ci.passed) {
      printSection('CI failures');
      ci.failures.forEach((f) => console.log(c.error(f)));
      process.exit(1);
    } else {
      console.log(c.success('All CI thresholds met'));
    }
  }
}
