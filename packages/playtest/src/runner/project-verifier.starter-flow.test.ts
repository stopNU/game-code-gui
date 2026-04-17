import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { TaskPlan } from '@agent-harness/core';
import { scaffoldGame } from '../../../game-adapter/src/scaffold/scaffolder.js';

const {
  runSceneBindingValidationMock,
  runAutoloadValidationMock,
  runPlaytestMock,
} = vi.hoisted(() => ({
  runSceneBindingValidationMock: vi.fn(),
  runAutoloadValidationMock: vi.fn(),
  runPlaytestMock: vi.fn(),
}));

vi.mock('@agent-harness/game-adapter', async () => {
  const actual = await vi.importActual<typeof import('@agent-harness/game-adapter')>('@agent-harness/game-adapter');

  return {
    ...actual,
    runSceneBindingValidation: runSceneBindingValidationMock,
    runAutoloadValidation: runAutoloadValidationMock,
  };
});

vi.mock('./playtest-runner.js', () => ({
  runPlaytest: runPlaytestMock,
}));

function buildPlan(): TaskPlan {
  return {
    gameTitle: 'Verifier Starter Flow',
    gameBrief: 'Ensure template starter scenes stay in the generated verification path.',
    genre: 'deckbuilder',
    coreLoop: 'Start at the title, pick a character, and land on the map.',
    controls: ['Mouse'],
    scenes: ['CombatScene'],
    milestoneScenes: [
      {
        sceneId: 'MainMenuScene',
        label: 'Main Menu',
        primaryAction: 'Start New Run',
        acceptanceCriteria: [
          { id: 'renders-visibly', description: 'The main menu renders visibly.' },
          { id: 'primary-action-visible', description: 'The Start New Run control is visible.' },
          { id: 'progression-possible', description: 'The flow can progress from the main menu.' },
          { id: 'no-runtime-blocker', description: 'No runtime blocker prevents starting a run.' },
        ],
      },
      {
        sceneId: 'CharacterSelectScene',
        label: 'Character Select',
        primaryAction: 'Confirm Selection',
        acceptanceCriteria: [
          { id: 'renders-visibly', description: 'The character select screen renders visibly.' },
          { id: 'primary-action-visible', description: 'The confirm action is visible.' },
          { id: 'progression-possible', description: 'The flow can progress through character select.' },
          { id: 'no-runtime-blocker', description: 'No runtime blocker prevents confirmation.' },
        ],
      },
      {
        sceneId: 'MapScene',
        label: 'Map',
        primaryAction: 'Map progression',
        acceptanceCriteria: [
          { id: 'renders-visibly', description: 'The map renders visibly.' },
          { id: 'primary-action-visible', description: 'The map progression content is visible.' },
          { id: 'progression-possible', description: 'The flow can reach the map milestone.' },
          { id: 'no-runtime-blocker', description: 'No runtime blocker prevents the map from loading.' },
        ],
      },
    ],
    entities: ['Card', 'Enemy'],
    assets: ['Cards'],
    phases: [],
    verificationSteps: [],
  };
}

describe('verifyProject starter flow', () => {
  it('verifies scaffolded template starter scenes through generated-project verification', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'verify-project-starter-'));
    await scaffoldGame({ outputPath: projectPath, plan: buildPlan() });

    runSceneBindingValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          scenePath: 'res://src/main.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/scenes/BootScene.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/BootScene.tscn',
          rootType: 'Node',
          attachedScriptPath: 'res://src/scenes/BootScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/BootScene.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/MainMenuScene.tscn',
          rootType: 'Control',
          attachedScriptPath: 'res://src/scenes/MainMenuScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/MainMenuScene.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/CharacterSelectScene.tscn',
          rootType: 'Control',
          attachedScriptPath: 'res://src/scenes/CharacterSelectScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/CharacterSelectScene.gd',
          passed: true,
        },
        {
          scenePath: 'res://src/scenes/MapScene.tscn',
          rootType: 'Control',
          attachedScriptPath: 'res://src/scenes/MapScene.gd',
          expectedSiblingScriptPath: 'res://src/scenes/MapScene.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 5,
    });
    runAutoloadValidationMock.mockResolvedValue({
      success: true,
      entries: [
        {
          name: 'ContentLoader',
          scriptPath: 'res://src/autoload/ContentLoader.gd',
          passed: true,
        },
        {
          name: 'EventBus',
          scriptPath: 'res://src/autoload/EventBus.gd',
          passed: true,
        },
        {
          name: 'DebugOverlay',
          scriptPath: 'res://src/autoload/DebugOverlay.gd',
          passed: true,
        },
        {
          name: 'GameState',
          scriptPath: 'res://src/autoload/GameState.gd',
          passed: true,
        },
        {
          name: 'HarnessPlugin',
          scriptPath: 'res://src/autoload/HarnessPlugin.gd',
          passed: true,
        },
        {
          name: 'RunStateManager',
          scriptPath: 'res://src/autoload/RunStateManager.gd',
          passed: true,
        },
      ],
      stdout: '',
      stderr: '',
      durationMs: 5,
    });
    runPlaytestMock.mockResolvedValue({
      sessionId: 'starter-flow',
      passed: true,
      totalSteps: 6,
      passedSteps: 6,
      failedSteps: 0,
      durationMs: 150,
      screenshots: [],
      errorLog: [],
      results: [],
      finalState: {
        scene: 'MapScene',
        fps: 60,
        gameState: {},
        buttons: [],
        sceneHistory: ['BootScene', 'TitleScene', 'CharacterSelectScene', 'MapScene'],
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
    const report = await verifyProject({ projectPath });

    expect(report.passed).toBe(true);
    expect(report.summary.requiredSceneCount).toBe(5);
    expect(report.summary.milestoneSceneCount).toBe(3);
    expect(report.summary.milestoneFailureCount).toBe(0);
    expect(report.sceneInspection.blockers).toEqual([]);
    expect(report.milestoneScenes.every((scene) => scene.passed)).toBe(true);
    expect(report.milestoneScenes[0]?.criteria.map((criterion) => criterion.status)).toEqual([
      'passed',
      'passed',
      'passed',
      'passed',
    ]);
    expect(report.sceneInspection.inspection.scenes.map((scene) => scene.sceneId)).toEqual([
      'main',
      'BootScene',
      'CharacterSelectScene',
      'CombatScene',
      'MainMenuScene',
      'MapScene',
    ]);
    expect(report.startup.sceneHistory).toEqual(['BootScene', 'TitleScene', 'CharacterSelectScene', 'MapScene']);
    expect(report.flow.flowName).toBe('deckbuilder-early-run');
  });
});
