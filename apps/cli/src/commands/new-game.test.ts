import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlan } from '@agent-harness/core';

const loadHarnessConfigMock = vi.fn();
const printSectionMock = vi.fn();
const resolveProjectOutputPathMock = vi.fn();
const planGameServiceMock = vi.fn();
const readFileMock = vi.fn();
const runTaskMock = vi.fn();

const createSpinner = () => ({
  text: '',
  succeed: vi.fn(),
  fail: vi.fn(),
});

const spinnerInstances: Array<ReturnType<typeof createSpinner>> = [];
const spinnerMock = vi.fn(() => {
  const instance = createSpinner();
  spinnerInstances.push(instance);
  return instance;
});

vi.mock('@agent-harness/services', () => ({
  planGameService: planGameServiceMock,
}));

vi.mock('@agent-harness/tools', () => ({
  runScript: vi.fn(),
}));

vi.mock('../utils/config-loader.js', () => ({
  loadHarnessConfig: loadHarnessConfigMock,
}));

vi.mock('../utils/output.js', () => ({
  spinner: spinnerMock,
  c: {
    warn: (value: string) => value,
    info: (value: string) => value,
    path: (value: string) => value,
    success: (value: string) => value,
  },
  printSection: printSectionMock,
}));

vi.mock('../utils/project-name.js', () => ({
  resolveProjectOutputPath: resolveProjectOutputPathMock,
}));

vi.mock('./implement-task.js', () => ({
  runTask: runTaskMock,
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

describe('newGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spinnerInstances.length = 0;

    const plan: TaskPlan = {
      gameTitle: 'Dragon Cards',
      gameBrief: 'Fight dragons with cards.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and defeat dragons.',
      controls: ['Mouse'],
      scenes: ['CombatScene'],
      milestoneScenes: [],
      entities: ['Dragon'],
      assets: ['Cards'],
      phases: [],
      verificationSteps: [],
    };

    planGameServiceMock.mockResolvedValue(plan);
    resolveProjectOutputPathMock.mockReturnValue('D:/projects/dragon-cards');
  });

  it('delegates planning/scaffolding/install work to the shared service', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { newGame } = await import('./new-game.js');

    await newGame({
      brief: 'Build me a dragon deckbuilder',
      output: './dragon-cards',
      planOnly: true,
    });

    expect(loadHarnessConfigMock).toHaveBeenCalledTimes(1);
    expect(resolveProjectOutputPathMock).toHaveBeenCalledWith('./dragon-cards', 'game');
    expect(planGameServiceMock).toHaveBeenCalledWith({
      brief: 'Build me a dragon deckbuilder',
      outputPath: 'D:/projects/dragon-cards',
      onStageChange: expect.any(Function),
      onInstallDepsError: expect.any(Function),
    });
    expect(runTaskMock).not.toHaveBeenCalled();
    expect(printSectionMock).toHaveBeenCalledWith('Done (plan only)');

    logSpy.mockRestore();
  });

  it('reads the brief from a file before delegating to the shared service', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readFileMock.mockResolvedValue('Build me a dragon deckbuilder from file');
    const { newGame } = await import('./new-game.js');

    await newGame({
      briefFile: './brief.md',
      output: './dragon-cards',
      planOnly: true,
    });

    expect(readFileMock).toHaveBeenCalled();
    expect(planGameServiceMock).toHaveBeenCalledWith({
      brief: 'Build me a dragon deckbuilder from file',
      outputPath: 'D:/projects/dragon-cards',
      onStageChange: expect.any(Function),
      onInstallDepsError: expect.any(Function),
    });

    logSpy.mockRestore();
  });
});
