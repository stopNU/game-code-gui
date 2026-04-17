import { randomUUID } from 'crypto';
import { readFile, access, rm } from 'fs/promises';
import { join } from 'path';
import { execa } from 'execa';
import {
  createRuntimeLogReference,
  formatRuntimeDependencyIssue,
  generateRuntimeManifest,
  formatRuntimeLayoutIssues,
  summarizeRuntimeErrors,
  validateRuntimeDependencies,
  validateRuntimeLayout,
  writeRuntimeLog,
} from '@agent-harness/game-adapter';
import type {
  PlaytestStep,
  PlaytestResult,
  AssertionResult,
  StateAssertion,
  HarnessState,
} from '../types/harness.js';

/** Resolve the Godot 4 binary path via env var or fall back to `godot` in PATH. */
function godotBin(): string {
  return process.env['GODOT_PATH'] ?? 'godot';
}

export interface RunPlaytestOptions {
  /** Absolute path to the Godot project. */
  projectPath: string;
  /** Timeout in ms waiting for Godot to write test-output.json (default: 30000). */
  timeoutMs?: number;
}

/**
 * Run Godot in headless test mode and assert against the harness output.
 *
 * Spawns: `godot --headless --path {projectPath} -- --harness-test`
 * HarnessPlugin.gd writes `harness/test-output.json` after the boot sequence.
 * This function polls for the file, then runs assertions against the JSON state.
 */
export async function runPlaytest(opts: RunPlaytestOptions): Promise<PlaytestResult> {
  const sessionId = randomUUID();
  const start = Date.now();
  let results: AssertionResult[] = [];
  const errorLog: string[] = [];
  const screenshots: string[] = [];
  const timeoutMs = opts.timeoutMs ?? 30000;
  const runtimeLayout = await validateRuntimeLayout(opts.projectPath);
  const runtimeLogReference = await createRuntimeLogReference(opts.projectPath, 'smoke');

  if (!runtimeLayout.success) {
    const diagnostics = formatRuntimeLayoutIssues(runtimeLayout);
    await writeRuntimeLog(opts.projectPath, runtimeLogReference, diagnostics.join('\n'));
    return {
      sessionId,
      passed: false,
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      durationMs: Date.now() - start,
      screenshots,
      errorLog: diagnostics,
      results,
      authoritativeRuntimeRoots: runtimeLayout.authoritativeRuntimeRoots,
      runtimeLogPath: runtimeLogReference.logPath,
      runtimeErrorSummary: diagnostics.slice(0, 5),
    };
  }

  const manifest = await generateRuntimeManifest(opts.projectPath);
  const dependencyValidation = await validateRuntimeDependencies(opts.projectPath, manifest);
  if (!dependencyValidation.success) {
    const diagnostics = [
      ...dependencyValidation.activeIssues.map((issue) => formatRuntimeDependencyIssue(issue)),
      ...(dependencyValidation.inactiveIssues.length > 0
        ? [
          `Dead-code dependency failures (${dependencyValidation.inactiveIssues.length}) were also found but did not gate verification.`,
          ...dependencyValidation.inactiveIssues.map((issue) => formatRuntimeDependencyIssue(issue)),
        ]
        : []),
    ];
    await writeRuntimeLog(opts.projectPath, runtimeLogReference, diagnostics.join('\n'));
    return {
      sessionId,
      passed: false,
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      durationMs: Date.now() - start,
      screenshots,
      errorLog: diagnostics.slice(0, Math.max(5, dependencyValidation.activeIssues.length)),
      results,
      authoritativeRuntimeRoots: runtimeLayout.authoritativeRuntimeRoots,
      runtimeLogPath: runtimeLogReference.logPath,
      runtimeErrorSummary: diagnostics.slice(0, 5),
      dependencyValidation: {
        activeIssues: dependencyValidation.activeIssues,
        inactiveIssues: dependencyValidation.inactiveIssues,
      },
    };
  }

  const outputPath = join(opts.projectPath, 'harness', 'test-output.json');
  const screenshotPath = join(opts.projectPath, 'harness', 'screenshot.png');

  await rm(outputPath, { force: true }).catch(() => undefined);

  // Spawn Godot headless
  const godotProc = execa(
    godotBin(),
    ['--headless', '--path', opts.projectPath, '--', '--harness-test', '--harness-output', outputPath],
    { cwd: opts.projectPath, reject: false, timeout: timeoutMs + 5000 },
  );

  // Poll for test-output.json
  let state: HarnessState | undefined;
  const deadline = Date.now() + timeoutMs;
  let found = false;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    try {
      await access(outputPath);
      found = true;
      break;
    } catch {
      // file not yet written
    }
  }

  // Kill Godot if still running
  try {
    godotProc.kill('SIGTERM');
  } catch {
    // may have already exited
  }
  const procResult = await godotProc.catch((err: unknown) => {
    errorLog.push(err instanceof Error ? err.message : String(err));
    return { stdout: '', stderr: '' };
  });
  const rawRuntimeLog = [(procResult.stdout ?? ''), (procResult.stderr ?? '')]
    .filter((part) => part.length > 0)
    .join('\n');
  await writeRuntimeLog(opts.projectPath, runtimeLogReference, rawRuntimeLog);

  if (!found) {
    errorLog.push(`Timed out after ${timeoutMs}ms waiting for harness/test-output.json`);
  } else {
    try {
      const raw = await readFile(outputPath, 'utf8');
      state = JSON.parse(raw) as HarnessState;
    } catch (err) {
      errorLog.push(`Failed to parse harness/test-output.json: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Collect screenshot if present
    try {
      await access(screenshotPath);
      screenshots.push(screenshotPath);
    } catch {
      // no screenshot
    }
  }

  if (state?.criticalFlow !== undefined) {
    results = state.criticalFlow.completedSteps.map((step): AssertionResult => ({
      step: {
        type: step.type === 'scene' ? 'wait-for-state' : 'evaluate',
        value: step.id,
        ...(step.timeoutMs !== undefined ? { timeoutMs: step.timeoutMs } : {}),
      },
      passed: step.passed,
      ...(step.scene !== undefined ? { actual: step.scene } : {}),
      ...(step.error !== undefined ? { error: step.error } : {}),
    }));

    if (!state.criticalFlow.passed && state.criticalFlow.failureStepId !== undefined) {
      errorLog.push(
        `Critical flow failed at "${state.criticalFlow.failureStepId}" after "${state.criticalFlow.lastSuccessfulStepId ?? 'none'}"`,
      );
    }
    if (state.criticalFlow.visibilityIssues !== undefined) {
      errorLog.push(...state.criticalFlow.visibilityIssues.map((issue) => issue.message));
    }
    if (state.criticalFlow.inputReachabilityIssues !== undefined) {
      errorLog.push(...state.criticalFlow.inputReachabilityIssues.map((issue) => issue.message));
    }
  } else {
    errorLog.push('Harness output did not include a critical flow result.');
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    sessionId,
    passed: found && failed === 0 && errorLog.length === 0,
    totalSteps: results.length,
    passedSteps: passed,
    failedSteps: failed,
    durationMs: Date.now() - start,
    screenshots,
    errorLog,
    results,
    authoritativeRuntimeRoots: runtimeLayout.authoritativeRuntimeRoots,
    runtimeLogPath: runtimeLogReference.logPath,
    runtimeErrorSummary: summarizeRuntimeErrors(rawRuntimeLog).lines,
    dependencyValidation: {
      activeIssues: dependencyValidation.activeIssues,
      inactiveIssues: dependencyValidation.inactiveIssues,
    },
    ...(state !== undefined ? { finalState: state } : {}),
  };
}

/** Evaluate a single playtest step against the Godot harness JSON state. */
function executeStep(step: PlaytestStep, state: Record<string, unknown>): AssertionResult {
  try {
    switch (step.type) {
      case 'wait':
        // In Godot mode, waiting is handled by HarnessPlugin before it writes the file
        return { step, passed: true };

      case 'assert': {
        if (!step.assertion) throw new Error('assert step requires an assertion');
        const result = evaluateAssertion(step.assertion, state);
        return {
          step,
          passed: result.passed,
          ...(result.actual !== undefined ? { actual: result.actual } : {}),
          ...(result.expected !== undefined ? { expected: result.expected } : {}),
          ...(result.error !== undefined ? { error: result.error } : {}),
        };
      }

      case 'screenshot':
        // Screenshots are captured by HarnessPlugin
        return { step, passed: true };

      default:
        // emit, keypress, click etc. are browser-only — treat as no-op in Godot mode
        return { step, passed: true };
    }
  } catch (err) {
    return { step, passed: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve a dot-notation path against a JSON state object. */
function resolvePath(state: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = state;
  for (const part of parts) {
    current = (current as Record<string, unknown>)?.[part];
  }
  return current;
}

function evaluateAssertion(
  assertion: StateAssertion,
  state: Record<string, unknown>,
): { passed: boolean; actual?: unknown; expected?: unknown; error?: string } {
  const actual = resolvePath(state, assertion.path);
  const expected = assertion.value;

  switch (assertion.operator) {
    case 'exists':
      return { passed: actual !== undefined && actual !== null, actual };
    case 'eq':
      return { passed: actual === expected, actual, expected };
    case 'ne':
      return { passed: actual !== expected, actual, expected };
    case 'gt':
      return {
        passed: typeof actual === 'number' && typeof expected === 'number' && actual > expected,
        actual, expected,
      };
    case 'lt':
      return {
        passed: typeof actual === 'number' && typeof expected === 'number' && actual < expected,
        actual, expected,
      };
    case 'contains':
      return {
        passed: typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected),
        actual, expected,
      };
    case 'length-gt':
      return {
        passed: Array.isArray(actual) && typeof expected === 'number' && actual.length > expected,
        actual: Array.isArray(actual) ? actual.length : actual,
        expected,
      };
    case 'length-eq':
      return {
        passed: Array.isArray(actual) && typeof expected === 'number' && actual.length === expected,
        actual: Array.isArray(actual) ? actual.length : actual,
        expected,
      };
    case 'has-key':
      return {
        passed: typeof actual === 'object' && actual !== null && String(expected) in actual,
        actual, expected,
      };
    case 'matches':
      return {
        passed: new RegExp(String(expected)).test(String(actual)),
        actual, expected,
      };
    default:
      return { passed: false, error: `Unknown operator: ${assertion.operator}` };
  }
}
