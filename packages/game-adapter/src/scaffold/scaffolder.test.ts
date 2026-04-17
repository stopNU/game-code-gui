import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import type { TaskPlan } from '@agent-harness/core';
import { scaffoldGame } from './scaffolder.js';

function buildPlan(): TaskPlan {
  return {
    gameTitle: 'Starter Flow Test',
    gameBrief: 'Verify starter scenes are scaffolded into generated projects.',
    genre: 'deckbuilder',
    coreLoop: 'Start a run, pick a character, and reach the map.',
    controls: ['Mouse'],
    scenes: ['CombatScene'],
    milestoneScenes: [
      {
        sceneId: 'MainMenuScene',
        label: 'Main Menu',
        primaryAction: 'Start New Run',
        acceptanceCriteria: [
          { id: 'renders-visibly', description: 'The main menu renders visibly.' },
          { id: 'primary-action-visible', description: 'The Start New Run action is visible.' },
          { id: 'progression-possible', description: 'The Start New Run action advances the flow.' },
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
          { id: 'progression-possible', description: 'Selection can advance to the map.' },
          { id: 'no-runtime-blocker', description: 'No runtime blocker prevents confirmation.' },
        ],
      },
      {
        sceneId: 'MapScene',
        label: 'Map',
        primaryAction: 'Map progression',
        acceptanceCriteria: [
          { id: 'renders-visibly', description: 'The map renders visibly.' },
          { id: 'primary-action-visible', description: 'Map progression UI is visible.' },
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

describe('scaffoldGame', () => {
  it('keeps template starter scenes in scaffolded project metadata by default', async () => {
    const outputPath = await mkdtemp(join(tmpdir(), 'starter-scenes-'));

    const project = await scaffoldGame({
      outputPath,
      plan: buildPlan(),
    });

    expect(project.scenes).toEqual([
      'BootScene',
      'MainMenuScene',
      'CharacterSelectScene',
      'MapScene',
      'CombatScene',
    ]);

    const tasks = JSON.parse(
      await readFile(join(outputPath, 'harness', 'tasks.json'), 'utf8'),
    ) as TaskPlan;

    expect(tasks.scenes).toEqual(project.scenes);
    expect(tasks.milestoneScenes.map((scene) => scene.sceneId)).toEqual([
      'MainMenuScene',
      'CharacterSelectScene',
      'MapScene',
    ]);
    await expect(readFile(join(outputPath, 'src', 'scenes', 'MainMenuScene.tscn'), 'utf8')).resolves.toContain(
      '[node name="TitleScene" type="Control"]',
    );
    await expect(readFile(join(outputPath, 'src', 'scenes', 'CharacterSelectScene.tscn'), 'utf8')).resolves.toContain(
      '[node name="CharacterSelectScene" type="Control"]',
    );
    await expect(readFile(join(outputPath, 'src', 'scenes', 'MapScene.tscn'), 'utf8')).resolves.toContain(
      '[node name="MapScene" type="Control"]',
    );
    await expect(readFile(join(outputPath, 'docs', 'game-spec.md'), 'utf8')).resolves.toContain(
      '## Milestone Scene Acceptance',
    );
  });
});
