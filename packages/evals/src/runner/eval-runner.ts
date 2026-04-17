import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { EvalScenario, EvalDataset, EvalLayerName, EvalContext, EvalResult } from '../types/scenario.js';
import type {
  ScoreResult,
  EvalReport,
  ReportSummary,
  LayerSummary,
  CIThreshold,
  RegressionReport,
  RegressionEntry,
} from '../types/report.js';
import { DEFAULT_CI_THRESHOLDS } from '../types/report.js';
import { runBuildEval } from '../layers/build-eval.js';
import { runFunctionalEval } from '../layers/functional-eval.js';
import { runDesignEval } from '../layers/design-eval.js';
import { runDataEval } from '../layers/data-eval.js';
import { runSystemsEval } from '../layers/systems-eval.js';
import { runDeckbuilderEval } from '../layers/deckbuilder-eval.js';

export interface EvalRunOptions {
  projectPath: string;
  dataset: EvalDataset;
  layers?: EvalLayerName[];
  reportOutputDir?: string;
}

export async function runEvals(opts: EvalRunOptions): Promise<EvalReport> {
  const { dataset, layers, projectPath } = opts;
  const scenarios = layers
    ? dataset.scenarios.filter((s) => layers.includes(s.layer))
    : dataset.scenarios;

  const scores: ScoreResult[] = [];

  for (const scenario of scenarios) {
    // Inject project path if not set
    const s: EvalScenario = {
      ...scenario,
      inputs: {
        ...scenario.inputs,
        projectPath: scenario.inputs.projectPath || projectPath,
      },
    };

    let result: ScoreResult;
    try {
      switch (s.layer) {
        case 'build':
          result = await runBuildEval(s);
          break;
        case 'functional':
          result = await runFunctionalEval(s);
          break;
        case 'design':
          result = await runDesignEval(s);
          break;
        case 'data': {
          const ctx: EvalContext = { projectPath: s.inputs.projectPath };
          const evalResult: EvalResult = await runDataEval(ctx);
          result = evalResultToScoreResult(s, evalResult);
          break;
        }
        case 'systems': {
          const ctx: EvalContext = { projectPath: s.inputs.projectPath };
          const evalResult: EvalResult = await runSystemsEval(ctx);
          result = evalResultToScoreResult(s, evalResult);
          break;
        }
        case 'deckbuilder': {
          const ctx: EvalContext = { projectPath: s.inputs.projectPath };
          const evalResult: EvalResult = await runDeckbuilderEval(ctx);
          result = evalResultToScoreResult(s, evalResult);
          break;
        }
        default: {
          const _exhaustive: never = s.layer;
          throw new Error(`Unhandled eval layer: ${String(_exhaustive)}`);
        }
      }
    } catch (err) {
      result = {
        scenarioId: s.id,
        layer: s.layer,
        passed: false,
        totalScore: 0,
        maxScore: s.rubric.dimensions.reduce((acc, d) => acc + d.maxScore, 0),
        ratio: 0,
        dimensions: [],
        durationMs: 0,
        runAt: new Date().toISOString(),
        summary: err instanceof Error ? err.message : String(err),
      };
      console.error(`Eval scenario ${s.id} failed:`, err);
    }

    scores.push(result);
  }

  const report = buildReport(dataset.id, projectPath, scores);

  if (opts.reportOutputDir) {
    await mkdir(opts.reportOutputDir, { recursive: true });
    const filename = `report-${report.reportId.slice(0, 8)}.json`;
    await writeFile(join(opts.reportOutputDir, filename), JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

export function buildReport(
  datasetId: string,
  projectPath: string,
  scores: ScoreResult[],
): EvalReport {
  const byLayer: Partial<Record<EvalLayerName, LayerSummary>> = {};

  for (const layer of ['build', 'functional', 'design', 'data', 'systems', 'deckbuilder'] as EvalLayerName[]) {
    const layerScores = scores.filter((s) => s.layer === layer);
    if (layerScores.length === 0) continue;
    byLayer[layer] = {
      total: layerScores.length,
      passed: layerScores.filter((s) => s.passed).length,
      avgScore: layerScores.reduce((acc, s) => acc + s.ratio, 0) / layerScores.length,
    };
  }

  const summary: ReportSummary = {
    total: scores.length,
    passed: scores.filter((s) => s.passed).length,
    failed: scores.filter((s) => !s.passed && !s.inconclusive).length,
    inconclusive: scores.filter((s) => s.inconclusive).length,
    passRate: scores.length > 0 ? scores.filter((s) => s.passed).length / scores.length : 0,
    avgScore: scores.length > 0 ? scores.reduce((acc, s) => acc + s.ratio, 0) / scores.length : 0,
    byLayer,
  };
  const latestRuntimeLogPath = scores
    .map((score) => score.runtimeLogPath)
    .find((path): path is string => path !== undefined);

  return {
    reportId: randomUUID(),
    datasetId,
    projectPath,
    runAt: new Date().toISOString(),
    scores,
    summary,
    ...(latestRuntimeLogPath !== undefined ? { latestRuntimeLogPath } : {}),
  };
}

export function checkCIThresholds(
  report: EvalReport,
  thresholds: CIThreshold = DEFAULT_CI_THRESHOLDS,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const { byLayer } = report.summary;

  const build = byLayer['build'];
  if (build && build.total > 0) {
    const rate = build.passed / build.total;
    if (rate < thresholds.buildPassRate) {
      failures.push(`Build pass rate ${(rate * 100).toFixed(0)}% < ${(thresholds.buildPassRate * 100).toFixed(0)}%`);
    }
  }

  const functional = byLayer['functional'];
  if (functional && functional.total > 0) {
    const rate = functional.passed / functional.total;
    if (rate < thresholds.functionalPassRate) {
      failures.push(`Functional pass rate ${(rate * 100).toFixed(0)}% < ${(thresholds.functionalPassRate * 100).toFixed(0)}%`);
    }
  }

  const design = byLayer['design'];
  if (design && design.total > 0) {
    const rate = design.passed / design.total;
    if (rate < thresholds.designPassRate) {
      failures.push(`Design pass rate ${(rate * 100).toFixed(0)}% < ${(thresholds.designPassRate * 100).toFixed(0)}%`);
    }
  }

  const data = byLayer['data'];
  if (data && data.total > 0 && thresholds.dataMinScore !== undefined) {
    const avgDataScore = data.avgScore * 10; // ratio -> 0-10
    if (avgDataScore < thresholds.dataMinScore) {
      failures.push(`Data avg score ${avgDataScore.toFixed(1)} < ${thresholds.dataMinScore}`);
    }
  }

  const systems = byLayer['systems'];
  if (systems && systems.total > 0 && thresholds.systemsMinScore !== undefined) {
    const avgSystemsScore = systems.avgScore * 10; // ratio -> 0-10
    if (avgSystemsScore < thresholds.systemsMinScore) {
      failures.push(`Systems avg score ${avgSystemsScore.toFixed(1)} < ${thresholds.systemsMinScore}`);
    }
  }

  const deckbuilder = byLayer['deckbuilder'];
  if (deckbuilder && deckbuilder.total > 0 && thresholds.deckbuilderMinScore !== undefined) {
    const avgDeckbuilderScore = deckbuilder.avgScore * 10; // ratio -> 0-10
    if (avgDeckbuilderScore < thresholds.deckbuilderMinScore) {
      failures.push(`Deckbuilder avg score ${avgDeckbuilderScore.toFixed(1)} < ${thresholds.deckbuilderMinScore}`);
    }
  }

  if (report.summary.avgScore < thresholds.minAvgScore) {
    failures.push(
      `Avg score ${(report.summary.avgScore * 100).toFixed(0)}% < ${(thresholds.minAvgScore * 100).toFixed(0)}%`,
    );
  }

  if (report.summary.inconclusive > 0) {
    failures.push(`${report.summary.inconclusive} scenario(s) were inconclusive and need manual or infra follow-up`);
  }

  return { passed: failures.length === 0, failures };
}

function evalResultToScoreResult(scenario: EvalScenario, evalResult: EvalResult): ScoreResult {
  return {
    scenarioId: scenario.id,
    layer: scenario.layer,
    passed: evalResult.passed,
    totalScore: evalResult.score,
    maxScore: 10,
    ratio: evalResult.score / 10,
    dimensions: [],
    durationMs: 0,
    runAt: new Date().toISOString(),
    ...(evalResult.summary !== undefined ? { summary: evalResult.summary } : {}),
  };
}

export function buildRegressionReport(
  baseline: EvalReport,
  current: EvalReport,
): RegressionReport {
  const regressions: RegressionEntry[] = [];
  const improvements: RegressionEntry[] = [];

  for (const curr of current.scores) {
    const base = baseline.scores.find((s) => s.scenarioId === curr.scenarioId);
    if (!base) continue;
    const delta = curr.ratio - base.ratio;
    if (Math.abs(delta) < 0.05) continue; // ignore tiny changes

    const entry: RegressionEntry = {
      scenarioId: curr.scenarioId,
      baselineScore: base.ratio,
      currentScore: curr.ratio,
      delta,
    };

    if (delta < 0) regressions.push(entry);
    else improvements.push(entry);
  }

  return {
    baselineReportId: baseline.reportId,
    currentReportId: current.reportId,
    regressions,
    improvements,
  };
}
