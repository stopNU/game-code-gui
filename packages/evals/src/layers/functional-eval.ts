import { runPlaytest } from '@agent-harness/playtest';
import type { EvalScenario } from '../types/scenario.js';
import type { DimensionScore, ScoreResult } from '../types/report.js';

export async function runFunctionalEval(scenario: EvalScenario): Promise<ScoreResult> {
  const start = Date.now();
  const projectPath = scenario.inputs.projectPath;
  const playtest = await runPlaytest({ projectPath });

  const flow = playtest.finalState?.criticalFlow;
  const visibilityIssues = readVisibilityIssues(flow);
  const layoutIssueCount = visibilityIssues.length;
  const dimensions: DimensionScore[] = [
    {
      name: 'criticalFlow',
      description: 'Critical flow completes in headless Godot',
      score: flow?.passed === true ? 10 : 0,
      maxScore: 10,
      rationale: flow?.passed === true
        ? `Completed ${flow.completedSteps.length} critical flow steps`
        : (playtest.errorLog[0] ?? 'Critical flow did not complete'),
    },
    {
      name: 'layoutOverflow',
      description: 'Configured scenes keep required controls and regions fully visible',
      score: layoutIssueCount === 0 ? 10 : 0,
      maxScore: 10,
      rationale: layoutIssueCount === 0
        ? 'No configured layout overflow issues detected'
        : `${layoutIssueCount} overflow issue(s): ${visibilityIssues[0]?.message ?? 'unknown issue'}`,
    },
    {
      name: 'runtimeErrors',
      description: 'Headless run completes without runtime errors',
      score: playtest.errorLog.length === 0 ? 5 : 0,
      maxScore: 5,
      rationale: playtest.errorLog.length === 0
        ? 'Harness completed without runtime diagnostics'
        : playtest.errorLog[0] ?? 'Harness reported runtime diagnostics',
    },
  ];

  const totalScore = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const maxScore = dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0);
  const ratio = maxScore > 0 ? totalScore / maxScore : 0;

  return {
    scenarioId: scenario.id,
    layer: scenario.layer,
    passed: playtest.passed && ratio >= scenario.rubric.passingThreshold,
    totalScore,
    maxScore,
    ratio,
    dimensions,
    durationMs: Date.now() - start,
    runAt: new Date().toISOString(),
    summary: playtest.passed
      ? 'Critical flow and layout checks passed'
      : (playtest.errorLog[0] ?? 'Headless smoke test failed'),
    ...(playtest.runtimeLogPath !== undefined ? { runtimeLogPath: playtest.runtimeLogPath } : {}),
    ...(playtest.runtimeErrorSummary !== undefined ? { runtimeErrorSummary: playtest.runtimeErrorSummary } : {}),
  };
}

function readVisibilityIssues(flow: unknown): Array<{ message?: string }> {
  if (typeof flow !== 'object' || flow === null || !('visibilityIssues' in flow)) {
    return [];
  }

  const issues = (flow as { visibilityIssues?: unknown }).visibilityIssues;
  return Array.isArray(issues) ? (issues as Array<{ message?: string }>) : [];
}
