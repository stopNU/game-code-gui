import {
  readRuntimeErrorSummary,
  readRuntimeManifest,
  runBuild,
  runTypeCheck,
  validateRuntimeManifest,
} from '@agent-harness/game-adapter';
import type { EvalScenario } from '../types/scenario.js';
import type { ScoreResult, DimensionScore } from '../types/report.js';

export async function runBuildEval(scenario: EvalScenario): Promise<ScoreResult> {
  const start = Date.now();
  const dimensions: DimensionScore[] = [];

  const projectPath = scenario.inputs.projectPath;
  const expected = scenario.expectedOutputs;

  try {
    const manifest = await readRuntimeManifest(projectPath);
    const manifestValidation = await validateRuntimeManifest(projectPath, manifest);
    dimensions.push({
      name: 'runtimeManifest',
      description: 'Runtime manifest exists and all entries resolve to real files',
      score: manifestValidation.success ? 10 : 0,
      maxScore: 10,
      rationale: manifestValidation.success
        ? 'runtime-manifest.json entries all resolve'
        : manifestValidation.issues
          .map((issue) => `${issue.entryType}:${issue.identifier} ${issue.path ?? ''}`.trim())
          .join('; '),
    });
  } catch (error) {
    dimensions.push({
      name: 'runtimeManifest',
      description: 'Runtime manifest exists and all entries resolve to real files',
      score: 0,
      maxScore: 10,
      rationale: error instanceof Error ? error.message : String(error),
    });
  }

  // Typecheck
  const tc = await runTypeCheck(projectPath);
  const typecheckRuntimeSummary = tc.success ? null : await readRuntimeErrorSummary(projectPath, 'typecheck');
  dimensions.push({
    name: 'typecheck',
    description: 'GDScript syntax check passes',
    score: tc.success ? 10 : Math.max(0, 10 - tc.errorCount * 2),
    maxScore: 10,
    rationale: tc.success ? 'godot --check-only exits 0' : `${tc.errorCount} errors: ${tc.errors[0] ?? ''}`,
  });

  // Build
  const build = await runBuild(projectPath);
  const buildRuntimeSummary = build.success ? null : await readRuntimeErrorSummary(projectPath, 'build');
  dimensions.push({
    name: 'build',
    description: 'Godot export succeeds',
    score: build.success ? 10 : 0,
    maxScore: 10,
    rationale: build.success ? 'godot --export-release exits 0' : build.stderr.slice(0, 100),
  });

  // Binary size
  if (expected.bundleSizeKbMax !== undefined) {
    const withinLimit = build.sizeKb <= expected.bundleSizeKbMax;
    dimensions.push({
      name: 'binarySize',
      description: `Binary size <= ${expected.bundleSizeKbMax} KB`,
      score: withinLimit ? 5 : Math.max(0, 5 - Math.floor((build.sizeKb - expected.bundleSizeKbMax) / 100)),
      maxScore: 5,
      rationale: `${build.sizeKb} KB (limit: ${expected.bundleSizeKbMax} KB)`,
    });
  }

  const runtimeSummary = build.success
    ? (tc.success ? null : typecheckRuntimeSummary)
    : buildRuntimeSummary;

  return buildScoreResult(
    scenario,
    dimensions,
    start,
    runtimeSummary?.logPath,
    runtimeSummary?.lines,
  );
}

function buildScoreResult(
  scenario: EvalScenario,
  dimensions: DimensionScore[],
  startMs: number,
  runtimeLogPath?: string,
  runtimeErrorSummary?: string[],
): ScoreResult {
  const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
  const maxScore = dimensions.reduce((s, d) => s + d.maxScore, 0);
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;
  const manifestDimension = dimensions.find((dimension) => dimension.name === 'runtimeManifest');
  const typecheckDimension = dimensions.find((dimension) => dimension.name === 'typecheck');
  const buildDimension = dimensions.find((dimension) => dimension.name === 'build');
  const passed = ratio >= scenario.rubric.passingThreshold
    && manifestDimension?.score === manifestDimension?.maxScore
    && typecheckDimension?.score === typecheckDimension?.maxScore
    && buildDimension?.score === buildDimension?.maxScore;

  return {
    scenarioId: scenario.id,
    layer: scenario.layer,
    passed,
    totalScore,
    maxScore,
    ratio,
    dimensions,
    durationMs: Date.now() - startMs,
    runAt: new Date().toISOString(),
    ...(runtimeLogPath !== undefined ? { runtimeLogPath } : {}),
    ...(runtimeErrorSummary !== undefined ? { runtimeErrorSummary } : {}),
  };
}
