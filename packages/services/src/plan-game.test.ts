import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreprocessedBrief, TaskPlan } from '@agent-harness/core';

const preprocessBriefMock = vi.fn();
const createAdvancedPlanMock = vi.fn();
const scaffoldGameMock = vi.fn();
const installDepsMock = vi.fn();
const createChatModelMock = vi.fn();

vi.mock('@agent-harness/core', () => ({
  createChatModel: createChatModelMock,
  preprocessBrief: preprocessBriefMock,
  createAdvancedPlan: createAdvancedPlanMock,
}));

vi.mock('@agent-harness/game-adapter', () => ({
  scaffoldGame: scaffoldGameMock,
}));

vi.mock('@agent-harness/tools', () => ({
  installDeps: installDepsMock,
}));

describe('planGameService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createChatModelMock.mockReturnValue({ kind: 'client' });
    scaffoldGameMock.mockResolvedValue(undefined);
    installDepsMock.mockResolvedValue(undefined);
  });

  it('plans, scaffolds, installs dependencies, and returns the task plan', async () => {
    const preprocessedBrief: PreprocessedBrief = {
      rawBrief: 'A dragon deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Dragon Cards',
      summary: 'Fight dragons with cards.',
      extractedSubsystems: [],
      extractedSchemas: [],
      sprintPlan: [],
      mvpFeatures: [],
      stretchFeatures: [],
      eventTypes: [],
      stateMachines: [],
      sections: [],
    };
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

    preprocessBriefMock.mockResolvedValue(preprocessedBrief);
    createAdvancedPlanMock.mockResolvedValue(plan);

    const { planGameService } = await import('./plan-game.js');
    const stages: string[] = [];
    const result = await planGameService({
      brief: 'A dragon deckbuilder.',
      outputPath: 'D:/tmp/dragon-cards',
      onStageChange: (stage) => {
        stages.push(stage);
      },
    });

    expect(createChatModelMock).toHaveBeenCalledTimes(1);
    expect(preprocessBriefMock).toHaveBeenCalledWith('A dragon deckbuilder.', { kind: 'client' });
    expect(createAdvancedPlanMock).toHaveBeenCalledWith(preprocessedBrief, { kind: 'client' });
    expect(scaffoldGameMock).toHaveBeenCalledWith({
      outputPath: 'D:/tmp/dragon-cards',
      plan,
      preprocessedBrief,
    });
    expect(installDepsMock).toHaveBeenCalledWith('D:/tmp/dragon-cards');
    expect(stages).toEqual(['preprocessing', 'planning', 'scaffolding', 'installing-deps']);
    expect(result).toBe(plan);
  });

  it('returns the plan even when dependency installation fails', async () => {
    const preprocessedBrief: PreprocessedBrief = {
      rawBrief: 'A dragon deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Dragon Cards',
      summary: 'Fight dragons with cards.',
      extractedSubsystems: [],
      extractedSchemas: [],
      sprintPlan: [],
      mvpFeatures: [],
      stretchFeatures: [],
      eventTypes: [],
      stateMachines: [],
      sections: [],
    };
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
    const error = new Error('npm install failed');

    preprocessBriefMock.mockResolvedValue(preprocessedBrief);
    createAdvancedPlanMock.mockResolvedValue(plan);
    installDepsMock.mockRejectedValue(error);

    const onInstallDepsError = vi.fn();
    const { planGameService } = await import('./plan-game.js');
    const result = await planGameService({
      brief: 'A dragon deckbuilder.',
      outputPath: 'D:/tmp/dragon-cards',
      onInstallDepsError,
    });

    expect(onInstallDepsError).toHaveBeenCalledWith(error);
    expect(result).toBe(plan);
  });
});
