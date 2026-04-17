import { resolve } from 'path';
import { runPlaytest } from '@agent-harness/playtest';
import { spinner, c, printSection, printTable } from '../utils/output.js';

export interface RunPlaytestOptions {
  project: string;
  timeout?: string;
}

export async function runPlaytestCmd(opts: RunPlaytestOptions): Promise<void> {
  const projectPath = resolve(process.cwd(), opts.project);
  const timeoutMs = opts.timeout !== undefined ? Number.parseInt(opts.timeout, 10) : undefined;

  if (timeoutMs !== undefined && Number.isNaN(timeoutMs)) {
    throw new Error(`Invalid timeout value: ${opts.timeout}`);
  }

  const runSpinner = spinner('Running Godot critical flow smoke test...');
  const result = await runPlaytest({
    projectPath,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

  if (result.passed) {
    runSpinner.succeed('Critical flow smoke test passed');
  } else {
    runSpinner.fail('Critical flow smoke test failed');
  }

  printSection('Smoke Test');
  const flow = result.finalState?.criticalFlow;
  const smokeRows = [
    { metric: 'passed', value: String(result.passed) },
    { metric: 'durationMs', value: result.durationMs },
    { metric: 'passedSteps', value: `${result.passedSteps}/${result.totalSteps}` },
    {
      metric: 'lastSuccessfulStep',
      value: flow?.lastSuccessfulStepId ?? 'none',
    },
    {
      metric: 'currentScene',
      value: result.finalState?.scene ?? 'unknown',
    },
    {
      metric: 'runtimeRoots',
      value: result.authoritativeRuntimeRoots?.join(', ') ?? 'unknown',
    },
    {
      metric: 'runtimeLog',
      value: result.runtimeLogPath ?? 'not captured',
    },
  ];
  printTable(smokeRows);

  if (flow !== undefined) {
    printSection('Flow Steps');
    printTable(
      flow.completedSteps.map((step: (typeof flow.completedSteps)[number]) => ({
        id: step.id,
        type: step.type,
        passed: String(step.passed),
        scene: step.scene ?? '',
        detail: step.error ?? '',
      })),
    );
  }

  if (flow?.visibilityIssues !== undefined && flow.visibilityIssues.length > 0) {
    printSection('Layout Overflows');
    printTable(
      flow.visibilityIssues.map((issue) => ({
        scene: issue.sceneLabel,
        target: `${issue.targetType}:${issue.controlLabel}`,
        viewport: issue.viewportLabel,
        area: `${issue.areaLeft},${issue.areaTop} -> ${issue.areaRight},${issue.controlBottom}`,
        overflow: `L${issue.overflowLeftPx}/T${issue.overflowTopPx}/R${issue.overflowRightPx}/B${issue.overflowBottomPx}`,
      })),
    );
  }

  if (result.finalState !== undefined) {
    printSection('Harness State');
    printTable([
      { metric: 'sceneHistory', value: JSON.stringify(result.finalState.sceneHistory) },
      { metric: 'errorLog', value: JSON.stringify(result.finalState.errorLog) },
      {
        metric: 'eventLog',
        value: JSON.stringify(result.finalState.eventLog ?? []),
      },
    ]);
  }

  if (flow !== undefined && flow.logs.length > 0) {
    printSection('Flow Log');
    for (const line of flow.logs) {
      console.log(c.warn(`[critical-flow] ${line}`));
    }
  }

  if (result.errorLog.length > 0) {
    printSection('Diagnostics');
    for (const line of result.errorLog) {
      console.log(c.warn(line));
    }
  }

  if (result.dependencyValidation?.activeIssues.length) {
    printSection('Active Dependency Failures');
    for (const issue of result.dependencyValidation.activeIssues) {
      console.log(c.warn(`${issue.sourcePath}:${issue.sourceLine} ${issue.message}`));
    }
  }

  if (result.dependencyValidation?.inactiveIssues.length) {
    printSection('Dead Code Dependency Failures');
    for (const issue of result.dependencyValidation.inactiveIssues) {
      console.log(c.warn(`${issue.sourcePath}:${issue.sourceLine} ${issue.message}`));
    }
  }

  if (result.runtimeErrorSummary !== undefined && result.runtimeErrorSummary.length > 0) {
    printSection('Runtime Errors');
    for (const line of result.runtimeErrorSummary) {
      console.log(c.warn(line));
    }
  }

  if (!result.passed) {
    process.exit(1);
  }
}
