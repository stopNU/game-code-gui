import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const execaMock = vi.fn();
const validateRuntimeLayoutMock = vi.fn();
const createRuntimeLogReferenceMock = vi.fn();
const writeRuntimeLogMock = vi.fn();
const summarizeRuntimeErrorsMock = vi.fn();
const generateRuntimeManifestMock = vi.fn();
const validateRuntimeDependenciesMock = vi.fn();
const formatRuntimeDependencyIssueMock = vi.fn((issue: { sourcePath: string; sourceLine: number; message: string }) =>
  `${issue.sourcePath}:${issue.sourceLine} ${issue.message}`);

vi.mock('execa', () => ({
  execa: execaMock,
}));

vi.mock('@agent-harness/game-adapter', () => ({
  validateRuntimeLayout: validateRuntimeLayoutMock,
  createRuntimeLogReference: createRuntimeLogReferenceMock,
  writeRuntimeLog: writeRuntimeLogMock,
  summarizeRuntimeErrors: summarizeRuntimeErrorsMock,
  generateRuntimeManifest: generateRuntimeManifestMock,
  validateRuntimeDependencies: validateRuntimeDependenciesMock,
  formatRuntimeDependencyIssue: formatRuntimeDependencyIssueMock,
  formatRuntimeLayoutIssues: vi.fn(() => []),
}));

describe('runPlaytest', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fails early on unresolved active runtime dependencies and preserves dead-code reporting', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'playtest-runtime-deps-'));

    validateRuntimeLayoutMock.mockResolvedValue({
      success: true,
      authoritativeRuntimeRoots: ['src', 'src/scenes'],
    });
    createRuntimeLogReferenceMock.mockResolvedValue({
      logPath: join(projectPath, 'logs', 'smoke.log'),
      relativeLogPath: 'logs/smoke.log',
    });
    generateRuntimeManifestMock.mockResolvedValue({ manifestPath: 'harness/runtime-manifest.json' });
    validateRuntimeDependenciesMock.mockResolvedValue({
      success: false,
      activeIssues: [
        {
          sourcePath: 'res://src/scenes/BootScene.gd',
          sourceLine: 14,
          dependencyKind: 'preload',
          dependency: 'res://src/scenes/MissingScene.tscn',
          message: 'Unresolved preload dependency res://src/scenes/MissingScene.tscn',
          active: true,
        },
      ],
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
    });

    const { runPlaytest } = await import('./playtest-runner.js');
    const result = await runPlaytest({ projectPath, timeoutMs: 10 });

    expect(result.passed).toBe(false);
    expect(execaMock).not.toHaveBeenCalled();
    expect(result.dependencyValidation?.activeIssues).toHaveLength(1);
    expect(result.dependencyValidation?.inactiveIssues).toHaveLength(1);
    expect(result.errorLog[0]).toContain('BootScene.gd:14');
    expect(writeRuntimeLogMock).toHaveBeenCalled();
  });

  it('surfaces layout overflow failures from critical flow output', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'playtest-visibility-'));
    const harnessDir = join(projectPath, 'harness');
    await mkdir(harnessDir, { recursive: true });

    const harnessOutput = JSON.stringify({
      scene: 'CharacterSelectScene',
      fps: 60,
      gameState: {},
      buttons: [],
      sceneHistory: ['BootScene', 'TitleScene', 'CharacterSelectScene'],
      errorLog: [],
      frameCount: 12,
      timestamp: 1_717_171_717,
      criticalFlow: {
        name: 'deckbuilder-early-run',
        passed: false,
        lastSuccessfulStepId: 'title',
        failureStepId: 'character-select',
        completedSteps: [
          {
            id: 'title',
            label: 'Title',
            type: 'scene',
            passed: true,
            scene: 'TitleScene',
            timeoutMs: 2500,
            timestamp: 1,
          },
          {
            id: 'character-select',
            label: 'Character Select',
            type: 'scene',
            passed: false,
            scene: 'CharacterSelectScene',
            timeoutMs: 2500,
            timestamp: 2,
            error: 'Viewport Small 960x540 leaves Confirm in Character Select below the fold by 48px',
          },
        ],
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
    });

    validateRuntimeLayoutMock.mockResolvedValue({
      success: true,
      authoritativeRuntimeRoots: ['src', 'src/scenes'],
    });
    createRuntimeLogReferenceMock.mockResolvedValue({
      logPath: join(projectPath, 'logs', 'smoke.log'),
      relativeLogPath: 'logs/smoke.log',
    });
    generateRuntimeManifestMock.mockResolvedValue({ manifestPath: 'harness/runtime-manifest.json' });
    validateRuntimeDependenciesMock.mockResolvedValue({
      success: true,
      activeIssues: [],
      inactiveIssues: [],
    });
    summarizeRuntimeErrorsMock.mockReturnValue({ lines: [] });
    execaMock.mockImplementation((_command, args: string[]) => {
      const outputPath = args[args.indexOf('--harness-output') + 1];
      if (outputPath === undefined) {
        throw new Error('Expected --harness-output argument');
      }
      void writeFile(outputPath, harnessOutput, 'utf8');
      return {
        kill: vi.fn(),
        catch: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
    });

    const { runPlaytest } = await import('./playtest-runner.js');
    const result = await runPlaytest({ projectPath, timeoutMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.failedSteps).toBe(1);
    expect(result.errorLog).toContain('Critical flow failed at "character-select" after "title"');
    expect(result.errorLog).toContain(
      'Viewport Small 960x540 clips region Character Select Panel in Character Select by L:0 T:0 R:0 B:48 px (area x:250 y:40 w:460 h:548)',
    );
  });

  it('surfaces missing and unusable progression actions from critical flow output', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'playtest-input-reachability-'));
    const harnessDir = join(projectPath, 'harness');
    await mkdir(harnessDir, { recursive: true });

    const harnessOutput = JSON.stringify({
      scene: 'CharacterSelectScene',
      fps: 60,
      gameState: {},
      buttons: [],
      sceneHistory: ['BootScene', 'TitleScene', 'CharacterSelectScene'],
      errorLog: [],
      frameCount: 20,
      timestamp: 1_717_171_818,
      criticalFlow: {
        name: 'deckbuilder-early-run',
        passed: false,
        lastSuccessfulStepId: 'start-new-run',
        failureStepId: 'character-select',
        completedSteps: [
          {
            id: 'character-select',
            label: 'Character Select',
            type: 'scene',
            passed: false,
            scene: 'CharacterSelectScene',
            timeoutMs: 2500,
            timestamp: 2,
            error: 'Viewport Small 960x540 shows Confirm but leaves the action unreachable in Character Select',
            inputReachabilityIssues: [
              {
                scene: 'CharacterSelectScene',
                sceneLabel: 'Character Select',
                actionId: 'select-vanguard',
                actionLabel: 'Select Vanguard',
                controlId: 'vanguard',
                controlLabel: 'Vanguard',
                nodePath: 'Center/Panel/CharacterButtons/VanguardButton',
                viewportId: 'small',
                viewportLabel: 'Small 960x540',
                viewportWidth: 960,
                viewportHeight: 540,
                issueType: 'missing_control',
                controlFound: false,
                controlUsable: false,
                message:
                  'Viewport Small 960x540 cannot trigger action Select Vanguard in Character Select because control Vanguard is missing at Center/Panel/CharacterButtons/VanguardButton',
              },
              {
                scene: 'CharacterSelectScene',
                sceneLabel: 'Character Select',
                actionId: 'confirm-selection',
                actionLabel: 'Confirm Selection',
                controlId: 'confirm',
                controlLabel: 'Confirm',
                nodePath: 'Center/Panel/ConfirmButton',
                viewportId: 'small',
                viewportLabel: 'Small 960x540',
                viewportWidth: 960,
                viewportHeight: 540,
                issueType: 'disabled_control',
                controlFound: true,
                controlUsable: false,
                message:
                  'Viewport Small 960x540 cannot trigger action Confirm Selection in Character Select because control Confirm exists but is disabled',
              },
            ],
          },
        ],
        logs: [],
        inputReachabilityIssues: [
          {
            scene: 'CharacterSelectScene',
            sceneLabel: 'Character Select',
            actionId: 'select-vanguard',
            actionLabel: 'Select Vanguard',
            controlId: 'vanguard',
            controlLabel: 'Vanguard',
            nodePath: 'Center/Panel/CharacterButtons/VanguardButton',
            viewportId: 'small',
            viewportLabel: 'Small 960x540',
            viewportWidth: 960,
            viewportHeight: 540,
            issueType: 'missing_control',
            controlFound: false,
            controlUsable: false,
            message:
              'Viewport Small 960x540 cannot trigger action Select Vanguard in Character Select because control Vanguard is missing at Center/Panel/CharacterButtons/VanguardButton',
          },
          {
            scene: 'CharacterSelectScene',
            sceneLabel: 'Character Select',
            actionId: 'confirm-selection',
            actionLabel: 'Confirm Selection',
            controlId: 'confirm',
            controlLabel: 'Confirm',
            nodePath: 'Center/Panel/ConfirmButton',
            viewportId: 'small',
            viewportLabel: 'Small 960x540',
            viewportWidth: 960,
            viewportHeight: 540,
            issueType: 'disabled_control',
            controlFound: true,
            controlUsable: false,
            message:
              'Viewport Small 960x540 cannot trigger action Confirm Selection in Character Select because control Confirm exists but is disabled',
          },
        ],
      },
    });

    validateRuntimeLayoutMock.mockResolvedValue({
      success: true,
      authoritativeRuntimeRoots: ['src', 'src/scenes'],
    });
    createRuntimeLogReferenceMock.mockResolvedValue({
      logPath: join(projectPath, 'logs', 'smoke.log'),
      relativeLogPath: 'logs/smoke.log',
    });
    generateRuntimeManifestMock.mockResolvedValue({ manifestPath: 'harness/runtime-manifest.json' });
    validateRuntimeDependenciesMock.mockResolvedValue({
      success: true,
      activeIssues: [],
      inactiveIssues: [],
    });
    summarizeRuntimeErrorsMock.mockReturnValue({ lines: [] });
    execaMock.mockImplementation((_command, args: string[]) => {
      const outputPath = args[args.indexOf('--harness-output') + 1];
      if (outputPath === undefined) {
        throw new Error('Expected --harness-output argument');
      }
      void writeFile(outputPath, harnessOutput, 'utf8');
      return {
        kill: vi.fn(),
        catch: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
      };
    });

    const { runPlaytest } = await import('./playtest-runner.js');
    const result = await runPlaytest({ projectPath, timeoutMs: 10 });

    expect(result.passed).toBe(false);
    expect(result.failedSteps).toBe(1);
    expect(result.errorLog).toContain(
      'Viewport Small 960x540 cannot trigger action Select Vanguard in Character Select because control Vanguard is missing at Center/Panel/CharacterButtons/VanguardButton',
    );
    expect(result.errorLog).toContain(
      'Viewport Small 960x540 cannot trigger action Confirm Selection in Character Select because control Confirm exists but is disabled',
    );
  });
});
