import { describe, expect, it, vi, afterEach } from 'vitest';

const runPlaytestMock = vi.fn();

vi.mock('@agent-harness/playtest', () => ({
  runPlaytest: runPlaytestMock,
}));

describe('runFunctionalEval', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fails when the smoke run reports layout overflow issues', async () => {
    runPlaytestMock.mockResolvedValue({
      sessionId: 'session-1',
      passed: false,
      totalSteps: 2,
      passedSteps: 1,
      failedSteps: 1,
      durationMs: 1200,
      screenshots: [],
      errorLog: ['Viewport Small 960x540 clips region Character Select Panel in Character Select by L:0 T:0 R:0 B:48 px (area x:250 y:40 w:460 h:548)'],
      results: [],
      runtimeLogPath: 'D:/tmp/game/harness/logs/smoke.log',
      runtimeErrorSummary: [],
      finalState: {
        scene: 'CharacterSelectScene',
        fps: 60,
        gameState: {},
        buttons: [],
        sceneHistory: [],
        errorLog: [],
        frameCount: 1,
        timestamp: 1,
        criticalFlow: {
          name: 'deckbuilder-early-run',
          passed: false,
          failureStepId: 'character-select',
          completedSteps: [],
          logs: [],
          visibilityIssues: [
            {
              scene: 'CharacterSelectScene',
              sceneLabel: 'Character Select',
              targetType: 'region',
              controlId: 'character-select-panel',
              controlLabel: 'Character Select Panel',
              nodePath: 'Center/Panel',
              viewportId: 'small',
              viewportLabel: 'Small 960x540',
              viewportWidth: 960,
              viewportHeight: 540,
              areaLeft: 250,
              areaTop: 40,
              areaRight: 710,
              controlBottom: 588,
              viewportLeft: 0,
              viewportTop: 0,
              viewportRight: 960,
              viewportBottom: 540,
              overflowLeftPx: 0,
              overflowTopPx: 0,
              overflowRightPx: 0,
              overflowBottomPx: 48,
              overflowPx: 48,
              message:
                'Viewport Small 960x540 clips region Character Select Panel in Character Select by L:0 T:0 R:0 B:48 px (area x:250 y:40 w:460 h:548)',
            },
          ],
        },
      },
    });

    const { runFunctionalEval } = await import('./functional-eval.js');
    const result = await runFunctionalEval({
      id: 'functional-layout',
      name: 'functional layout',
      description: 'functional smoke eval',
      layer: 'functional',
      gameSpec: '',
      inputs: { projectPath: 'D:/tmp/game' },
      expectedOutputs: {},
      rubric: {
        dimensions: [],
        passingThreshold: 0.8,
      },
      tags: [],
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    });

    expect(runPlaytestMock).toHaveBeenCalledWith({ projectPath: 'D:/tmp/game' });
    expect(result.passed).toBe(false);
    expect(result.summary).toContain('Viewport Small 960x540 clips region Character Select Panel');
    expect(result.dimensions.find((dimension) => dimension.name === 'layoutOverflow')?.score).toBe(0);
    expect(result.runtimeLogPath).toBe('D:/tmp/game/harness/logs/smoke.log');
  });
});
