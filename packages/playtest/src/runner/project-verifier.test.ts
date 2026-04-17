import { afterEach, describe, expect, it, vi } from 'vitest';

const inspectActiveScenesMock = vi.fn();
const generateRuntimeManifestMock = vi.fn();
const runSceneBindingValidationMock = vi.fn();
const runAutoloadValidationMock = vi.fn();
const formatRuntimeDependencyIssueMock = vi.fn((issue: { sourcePath: string; sourceLine: number; message: string }) =>
  `${issue.sourcePath}:${issue.sourceLine} ${issue.message}`);
const runPlaytestMock = vi.fn();

vi.mock('@agent-harness/game-adapter', () => ({
  inspectActiveScenes: inspectActiveScenesMock,
  generateRuntimeManifest: generateRuntimeManifestMock,
  runSceneBindingValidation: runSceneBindingValidationMock,
  runAutoloadValidation: runAutoloadValidationMock,
  formatRuntimeDependencyIssue: formatRuntimeDependencyIssueMock,
}));

vi.mock('./playtest-runner.js', () => ({
  runPlaytest: runPlaytestMock,
}));

describe('verifyProject', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates scene binding, autoload, startup, flow, and UI blockers into one report', async () => {
    inspectActiveScenesMock.mockResolvedValue({
      projectPath: 'D:/tmp/game',
      inspectedAt: '2026-04-17T00:00:00.000Z',
      inspectionMode: 'static',
      mainScenePath: 'res://src/main.tscn',
      scenes: [
        {
          kind: 'main-scene',
          sceneId: 'main',
          scenePath: 'res://src/main.tscn',
          required: false,
          exists: true,
          rootNodeType: 'Node',
          attachedScriptPath: 'res://src/main.gd',
          instantiationStatus: 'ready',
          issues: [],
        },
        {
          kind: 'required-scene',
          sceneId: 'CombatScene',
          scenePath: 'res://src/scenes/CombatScene.tscn',
          required: true,
          exists: true,
          rootNodeType: 'Control',
          attachedScriptPath: 'res://src/scenes/CombatScene.gd',
          instantiationStatus: 'missing-script',
          issues: [],
        },
      ],
    });
    generateRuntimeManifestMock.mockResolvedValue({
      autoloads: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
      ],
    });
    runSceneBindingValidationMock.mockResolvedValue({
      success: false,
      entries: [
        {
          scenePath: 'res://src/main.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/main.gd',
          expectedSiblingScriptPath: 'res://src/main.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/CombatScene.tscn',
          rootType: 'Control',
          attachedScriptPath: null,
          expectedSiblingScriptPath: 'res://src/scenes/CombatScene.gd',
          passed: false,
          failureReason: 'Root script is null',
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 12,
      runtimeLogPath: 'D:/tmp/game/harness/runtime-logs/scene.log',
    });
    runAutoloadValidationMock.mockResolvedValue({
      success: false,
      entries: [
        {
          name: 'EventBus',
          scriptPath: 'res://src/autoload/EventBus.gd',
          passed: false,
          errorText: 'Failed to instantiate autoload',
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 8,
      runtimeLogPath: 'D:/tmp/game/harness/runtime-logs/autoload.log',
    });
    runPlaytestMock.mockResolvedValue({
      sessionId: 's1',
      passed: false,
      totalSteps: 2,
      passedSteps: 1,
      failedSteps: 1,
      durationMs: 321,
      screenshots: [],
      errorLog: [
        'Unresolved preload dependency res://src/scenes/MissingScene.tscn',
        'Critical flow failed at "character-select" after "title"',
        'Viewport Small 960x540 clips region Confirm Panel in Character Select by L:0 T:0 R:0 B:48 px',
      ],
      results: [],
      runtimeLogPath: 'D:/tmp/game/harness/runtime-logs/smoke.log',
      dependencyValidation: {
        activeIssues: [],
        inactiveIssues: [
          {
            sourcePath: 'res://src/systems/DeadCode.gd',
            sourceLine: 7,
            dependencyKind: 'class_name',
            dependency: 'MissingHelper',
            message: 'Unresolved class_name dependency MissingHelper',
            active: false,
          },
        ],
      },
      finalState: {
        scene: 'CharacterSelectScene',
        fps: 60,
        gameState: {},
        buttons: [],
        sceneHistory: ['BootScene', 'TitleScene', 'CharacterSelectScene'],
        errorLog: [],
        frameCount: 30,
        timestamp: 1,
        criticalFlow: {
          name: 'deckbuilder-early-run',
          passed: false,
          lastSuccessfulStepId: 'title',
          failureStepId: 'character-select',
          completedSteps: [],
          logs: ['entered CharacterSelectScene'],
          visibilityIssues: [
            {
              scene: 'CharacterSelectScene',
              sceneLabel: 'Character Select',
              targetType: 'region',
              controlId: 'confirm',
              controlLabel: 'Confirm Panel',
              nodePath: 'Center/Confirm',
              viewportId: 'small',
              viewportLabel: 'Small 960x540',
              viewportWidth: 960,
              viewportHeight: 540,
              areaLeft: 0,
              areaTop: 0,
              areaRight: 100,
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
              message: 'Viewport Small 960x540 clips region Confirm Panel in Character Select by L:0 T:0 R:0 B:48 px',
            },
          ],
          inputReachabilityIssues: [],
        },
      },
    });

    const { verifyProject } = await import('./project-verifier.js');
    const report = await verifyProject({ projectPath: 'D:/tmp/game', timeoutMs: 1000 });

    expect(report.passed).toBe(false);
    expect(report.sceneInspection.blockers).toContain('res://src/scenes/CombatScene.tscn is missing-script');
    expect(report.sceneBinding.blockers).toContain(
      'res://src/scenes/CombatScene.tscn failed scene binding validation: Root script is null',
    );
    expect(report.autoload.blockers).toContain(
      'EventBus failed autoload validation: Failed to instantiate autoload',
    );
    expect(report.startup.blockers).toContain('Unresolved preload dependency res://src/scenes/MissingScene.tscn');
    expect(report.flow.blockers).toContain('Critical flow failed at "character-select" after "title"');
    expect(report.ui.blockers).toContain(
      'Viewport Small 960x540 clips region Confirm Panel in Character Select by L:0 T:0 R:0 B:48 px',
    );
    expect(report.warnings).toEqual([
      'res://src/systems/DeadCode.gd:7 Unresolved class_name dependency MissingHelper',
    ]);
  });

  it('passes cleanly when all verification sections succeed', async () => {
    inspectActiveScenesMock.mockResolvedValue({
      projectPath: 'D:/tmp/game',
      inspectedAt: '2026-04-17T00:00:00.000Z',
      inspectionMode: 'static',
      scenes: [
        {
          kind: 'main-scene',
          sceneId: 'main',
          scenePath: 'res://src/main.tscn',
          required: false,
          exists: true,
          rootNodeType: 'Node',
          attachedScriptPath: 'res://src/main.gd',
          instantiationStatus: 'ready',
          issues: [],
        },
      ],
    });
    generateRuntimeManifestMock.mockResolvedValue({
      autoloads: [
        { name: 'EventBus', scriptPath: 'res://src/autoload/EventBus.gd' },
      ],
    });
    runSceneBindingValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          scenePath: 'res://src/main.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/main.gd',
          expectedSiblingScriptPath: 'res://src/main.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 4,
    });
    runAutoloadValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          name: 'EventBus',
          scriptPath: 'res://src/autoload/EventBus.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 4,
    });
    runPlaytestMock.mockResolvedValue({
      sessionId: 's2',
      passed: true,
      totalSteps: 2,
      passedSteps: 2,
      failedSteps: 0,
      durationMs: 100,
      screenshots: [],
      errorLog: [],
      results: [],
      finalState: {
        scene: 'MapScene',
        fps: 60,
        gameState: {},
        buttons: [],
        sceneHistory: ['BootScene', 'TitleScene', 'MapScene'],
        errorLog: [],
        frameCount: 30,
        timestamp: 1,
        criticalFlow: {
          name: 'deckbuilder-early-run',
          passed: true,
          lastSuccessfulStepId: 'map',
          completedSteps: [],
          logs: [],
          visibilityIssues: [],
          inputReachabilityIssues: [],
        },
      },
    });

    const { verifyProject } = await import('./project-verifier.js');
    const report = await verifyProject({ projectPath: 'D:/tmp/game' });

    expect(report.passed).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.summary.startupPassed).toBe(true);
    expect(report.summary.flowPassed).toBe(true);
    expect(report.summary.uiIssueCount).toBe(0);
  });
});
