import { describe, expect, it, vi } from 'vitest';
import type { EvalScenario } from '../types/scenario.js';
import { runBuildEval } from './build-eval.js';

const { runTypeCheckMock } = vi.hoisted(() => ({
  runTypeCheckMock: vi.fn(),
}));
const { runBuildMock } = vi.hoisted(() => ({
  runBuildMock: vi.fn(),
}));
const { readRuntimeManifestMock } = vi.hoisted(() => ({
  readRuntimeManifestMock: vi.fn(),
}));
const { validateRuntimeManifestMock } = vi.hoisted(() => ({
  validateRuntimeManifestMock: vi.fn(),
}));
const { readRuntimeErrorSummaryMock } = vi.hoisted(() => ({
  readRuntimeErrorSummaryMock: vi.fn(),
}));

vi.mock('@agent-harness/game-adapter', () => ({
  runTypeCheck: runTypeCheckMock,
  runBuild: runBuildMock,
  readRuntimeManifest: readRuntimeManifestMock,
  validateRuntimeManifest: validateRuntimeManifestMock,
  readRuntimeErrorSummary: readRuntimeErrorSummaryMock,
}));

const scenario: EvalScenario = {
  id: 'build-001',
  name: 'Build scenario',
  description: 'Build validation',
  layer: 'build',
  gameSpec: '',
  inputs: { projectPath: '/tmp/project' },
  expectedOutputs: { buildSuccess: true, typecheckPasses: true, bundleSizeKbMax: 3072 },
  rubric: {
    dimensions: [
      { name: 'typecheck', description: '', maxScore: 10, automated: true },
      { name: 'build', description: '', maxScore: 10, automated: true },
    ],
    passingThreshold: 0.8,
  },
  tags: [],
  version: '1.0.0',
  createdAt: '2026-04-16T00:00:00.000Z',
};

describe('build eval', () => {
  it('fails when the runtime manifest is missing or stale', async () => {
    readRuntimeManifestMock.mockRejectedValue(new Error('ENOENT: runtime manifest missing'));
    runTypeCheckMock.mockResolvedValue({
      success: true,
      errorCount: 0,
      errors: [],
      durationMs: 1,
    });
    runBuildMock.mockResolvedValue({
      success: true,
      sizeKb: 512,
      outputPath: '/tmp/project/builds/game.exe',
      stdout: '',
      stderr: '',
      durationMs: 1,
    });

    const result = await runBuildEval(scenario);

    expect(result.passed).toBe(false);
    expect(result.dimensions.find((dimension) => dimension.name === 'runtimeManifest')?.score).toBe(0);
    expect(result.dimensions.find((dimension) => dimension.name === 'runtimeManifest')?.rationale).toContain('runtime manifest missing');
  });

  it('passes the runtime-manifest dimension when every entry resolves', async () => {
    readRuntimeManifestMock.mockResolvedValue({ manifestPath: 'harness/runtime-manifest.json' });
    validateRuntimeManifestMock.mockResolvedValue({
      success: true,
      manifestPath: 'harness/runtime-manifest.json',
      issues: [],
    });
    runTypeCheckMock.mockResolvedValue({
      success: true,
      errorCount: 0,
      errors: [],
      durationMs: 1,
    });
    runBuildMock.mockResolvedValue({
      success: true,
      sizeKb: 512,
      outputPath: '/tmp/project/builds/game.exe',
      stdout: '',
      stderr: '',
      durationMs: 1,
    });

    const result = await runBuildEval(scenario);

    expect(result.passed).toBe(true);
    expect(result.dimensions.find((dimension) => dimension.name === 'runtimeManifest')?.score).toBe(10);
    expect(validateRuntimeManifestMock).toHaveBeenCalledWith('/tmp/project', { manifestPath: 'harness/runtime-manifest.json' });
  });

  it('fails verification when strict-mode compatibility blockers are reported', async () => {
    readRuntimeManifestMock.mockResolvedValue({ manifestPath: 'harness/runtime-manifest.json' });
    validateRuntimeManifestMock.mockResolvedValue({
      success: true,
      manifestPath: 'harness/runtime-manifest.json',
      issues: [],
    });
    runTypeCheckMock.mockResolvedValue({
      success: false,
      errorCount: 1,
      errors: [
        'res://src/autoload/DebugOverlay.gd:213 Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
      ],
      durationMs: 5,
      targetsChecked: 12,
    });
    readRuntimeErrorSummaryMock.mockResolvedValue({
      logPath: '/tmp/project/harness/logs/typecheck.log',
      mode: 'typecheck',
      startedAt: '2026-04-17T00:00:00.000Z',
      totalMatches: 1,
      lines: ['SCRIPT ERROR: Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)'],
    });
    runBuildMock.mockResolvedValue({
      success: true,
      sizeKb: 512,
      outputPath: '/tmp/project/builds/game.exe',
      stdout: '',
      stderr: '',
      durationMs: 1,
    });

    const result = await runBuildEval(scenario);

    expect(result.passed).toBe(false);
    expect(result.dimensions.find((dimension) => dimension.name === 'typecheck')?.score).toBe(8);
    expect(result.runtimeErrorSummary).toEqual([
      'SCRIPT ERROR: Parse Error: The variable type is being inferred from a Variant value, so it will be typed as Variant. (Warning treated as error.)',
    ]);
  });
});
