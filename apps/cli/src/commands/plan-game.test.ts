import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlan } from '@agent-harness/core';

const loadHarnessConfigMock = vi.fn();
const printSectionMock = vi.fn();
const resolveProjectOutputPathMock = vi.fn();
const planGameServiceMock = vi.fn();
const readFileMock = vi.fn();

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

vi.mock('../utils/config-loader.js', () => ({
  loadHarnessConfig: loadHarnessConfigMock,
}));

vi.mock('../utils/output.js', () => ({
  spinner: spinnerMock,
  c: {
    warn: (value: string) => value,
    info: (value: string) => value,
    path: (value: string) => value,
  },
  printSection: printSectionMock,
}));

vi.mock('../utils/project-name.js', () => ({
  resolveProjectOutputPath: resolveProjectOutputPathMock,
}));

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
}));

describe('planGame', () => {
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

  it('loads config, resolves the output path, and delegates to the service', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { planGame } = await import('./plan-game.js');

    await planGame({
      brief: 'Build me a dragon deckbuilder',
      output: './dragon-cards',
    });

    expect(loadHarnessConfigMock).toHaveBeenCalledTimes(1);
    expect(resolveProjectOutputPathMock).toHaveBeenCalledWith('./dragon-cards', 'game');
    expect(planGameServiceMock).toHaveBeenCalledWith({
      brief: 'Build me a dragon deckbuilder',
      outputPath: 'D:/projects/dragon-cards',
      onStageChange: expect.any(Function),
      onInstallDepsError: expect.any(Function),
    });
    expect(printSectionMock).toHaveBeenCalledWith('Creating game plan');
    expect(printSectionMock).toHaveBeenCalledWith('Implementation Plan');
    expect(printSectionMock).toHaveBeenCalledWith('Next Steps');
    expect(spinnerMock).toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('reads the brief from a file before delegating to the service', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readFileMock.mockResolvedValue('Build me a dragon deckbuilder from file');
    const { planGame } = await import('./plan-game.js');

    await planGame({
      briefFile: './brief.md',
      output: './dragon-cards',
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
