import { describe, expect, it } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { PreprocessedBrief } from './brief-preprocessor.js';
import { createAdvancedPlan } from './advanced-planner.js';

function makeClient(response: unknown): BaseChatModel {
  return {
    async invoke() {
      return new AIMessage(JSON.stringify(response));
    },
  } as unknown as BaseChatModel;
}

describe('createAdvancedPlan', () => {
  it('builds an architecture contract from the preprocessed brief', async () => {
    const preprocessed: PreprocessedBrief = {
      rawBrief: 'A turn-based deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Test Deckbuilder',
      summary: 'A test game.',
      extractedSubsystems: [
        {
          id: 'combat-engine',
          name: 'Combat Engine',
          description: 'Resolves card play, enemy actions, and turn flow.',
          dependencies: ['content-loader'],
          modules: ['CombatEngine', 'TurnController'],
        },
        {
          id: 'content-loader',
          name: 'Content Loader',
          description: 'Loads card and enemy content.',
          dependencies: [],
          modules: ['ContentLoader'],
        },
      ],
      extractedSchemas: [],
      sprintPlan: ['Build combat flow'],
      mvpFeatures: ['Play cards'],
      stretchFeatures: [],
      eventTypes: ['ON_CARD_PLAYED', 'ON_TURN_END', 'ON_ENEMY_INTENT'],
      stateMachines: [
        {
          id: 'combat-fsm',
          name: 'Combat FSM',
          states: ['IDLE', 'PLAYER_TURN_ACTIVE', 'ENEMY_TURN_ACTIVE'],
          description: 'Controls turn flow during combat.',
        },
      ],
      sections: [],
    };

    const response = {
      gameTitle: 'Test Deckbuilder',
      gameBrief: 'A test game.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and end turns.',
      controls: ['Mouse'],
      scenes: ['BootScene', 'MainMenuScene', 'CombatScene'],
      entities: ['Player', 'Enemy'],
      assets: ['cards'],
      phases: [
        {
          phase: 1,
          tasks: [
            {
              id: 'build-combat-scene',
              phase: 1,
              role: 'gameplay',
              title: 'Build combat scene',
              description: 'Implement the combat scene.',
              acceptanceCriteria: ['Scene renders'],
              dependencies: [],
              toolsAllowed: ['project', 'code', 'npm'],
              subsystemId: 'combat-engine',
            },
          ],
        },
      ],
      verificationSteps: [],
      contentManifest: [],
    };

    const plan = await createAdvancedPlan(preprocessed, makeClient(response));

    expect(plan.architecture?.eventTypes).toEqual(['ON_CARD_PLAYED', 'ON_TURN_END', 'ON_ENEMY_INTENT']);
    expect(plan.milestoneScenes.map((scene) => scene.sceneId)).toEqual(['MainMenuScene', 'CombatScene']);
    expect(plan.milestoneScenes[0]?.acceptanceCriteria.map((criterion) => criterion.id)).toEqual([
      'renders-visibly',
      'primary-action-visible',
      'progression-possible',
      'no-runtime-blocker',
    ]);
    expect(plan.architecture?.stateMachines[0]?.id).toBe('combat-fsm');
    expect(plan.architecture?.subsystemApis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subsystemId: 'combat-engine',
          exposedEvents: expect.arrayContaining(['ON_CARD_PLAYED', 'ON_TURN_END', 'ON_ENEMY_INTENT']),
          stateMachineIds: ['combat-fsm'],
        }),
        expect.objectContaining({
          subsystemId: 'content-loader',
          contentLoaderMethods: expect.arrayContaining(['getCards', 'getEnemies']),
        }),
      ]),
    );
  });

  it('injects an integration-verifier task after systems and gameplay tasks in a phase', async () => {
    const preprocessed: PreprocessedBrief = {
      rawBrief: 'A turn-based deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Test Deckbuilder',
      summary: 'A test game.',
      extractedSubsystems: [
        {
          id: 'combat-engine',
          name: 'Combat Engine',
          description: 'Resolves card play, enemy actions, and turn flow.',
          dependencies: [],
          modules: ['CombatEngine', 'CombatScene'],
        },
      ],
      extractedSchemas: [],
      sprintPlan: ['Build combat flow'],
      mvpFeatures: ['Play cards'],
      stretchFeatures: [],
      eventTypes: ['ON_CARD_PLAYED', 'ON_TURN_END'],
      stateMachines: [
        {
          id: 'combat-fsm',
          name: 'Combat FSM',
          states: ['IDLE', 'PLAYER_TURN_ACTIVE'],
          description: 'Controls turn flow during combat.',
        },
      ],
      sections: [],
    };

    const response = {
      gameTitle: 'Test Deckbuilder',
      gameBrief: 'A test game.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and end turns.',
      controls: ['Mouse'],
      scenes: ['BootScene', 'CombatScene'],
      entities: ['Player', 'Enemy'],
      assets: ['cards'],
      phases: [
        {
          phase: 1,
          tasks: [
            {
              id: 'implement-combat-fsm',
              phase: 1,
              role: 'systems',
              title: 'Implement combat FSM',
              description: 'Define the combat FSM.',
              acceptanceCriteria: ['FSM exists'],
              dependencies: [],
              toolsAllowed: ['project', 'code'],
              subsystemId: 'combat-engine',
            },
            {
              id: 'wire-combat-scene',
              phase: 1,
              role: 'gameplay',
              title: 'Wire combat scene',
              description: 'Use the combat FSM in the scene.',
              acceptanceCriteria: ['Scene uses FSM'],
              dependencies: ['implement-combat-fsm'],
              toolsAllowed: ['project', 'code'],
              subsystemId: 'combat-engine',
            },
          ],
        },
      ],
      verificationSteps: [],
      contentManifest: [],
    };

    const plan = await createAdvancedPlan(preprocessed, makeClient(response));
    const phaseOneTasks = plan.phases[0]?.tasks ?? [];
    const verifier = phaseOneTasks.find((task) => task.role === 'integration-verifier');

    expect(verifier).toBeDefined();
    expect(verifier?.dependencies).toEqual(['implement-combat-fsm', 'wire-combat-scene']);
    expect(verifier?.toolsAllowed).toEqual(expect.arrayContaining(['project', 'code', 'npm']));
  });

  it('backfills missing integration-verifier dependencies onto planner-provided tasks', async () => {
    const preprocessed: PreprocessedBrief = {
      rawBrief: 'A turn-based deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Test Deckbuilder',
      summary: 'A test game.',
      extractedSubsystems: [
        {
          id: 'combat-engine',
          name: 'Combat Engine',
          description: 'Resolves card play, enemy actions, and turn flow.',
          dependencies: [],
          modules: ['CombatEngine', 'CombatScene'],
        },
      ],
      extractedSchemas: [],
      sprintPlan: ['Build combat flow'],
      mvpFeatures: ['Play cards'],
      stretchFeatures: [],
      eventTypes: ['ON_CARD_PLAYED', 'ON_TURN_END'],
      stateMachines: [
        {
          id: 'combat-fsm',
          name: 'Combat FSM',
          states: ['IDLE', 'PLAYER_TURN_ACTIVE'],
          description: 'Controls turn flow during combat.',
        },
      ],
      sections: [],
    };

    const response = {
      gameTitle: 'Test Deckbuilder',
      gameBrief: 'A test game.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and end turns.',
      controls: ['Mouse'],
      scenes: ['BootScene', 'CombatScene'],
      entities: ['Player', 'Enemy'],
      assets: ['cards'],
      phases: [
        {
          phase: 1,
          tasks: [
            {
              id: 'implement-combat-fsm',
              phase: 1,
              role: 'systems',
              title: 'Implement combat FSM',
              description: 'Define the combat FSM.',
              acceptanceCriteria: ['FSM exists'],
              dependencies: [],
              toolsAllowed: ['project', 'code'],
              subsystemId: 'combat-engine',
            },
            {
              id: 'wire-combat-scene',
              phase: 1,
              role: 'gameplay',
              title: 'Wire combat scene',
              description: 'Use the combat FSM in the scene.',
              acceptanceCriteria: ['Scene uses FSM'],
              dependencies: ['implement-combat-fsm'],
              toolsAllowed: ['project', 'code'],
              subsystemId: 'combat-engine',
            },
            {
              id: 'verify-combat-integration',
              phase: 1,
              role: 'integration-verifier',
              title: 'Verify combat integration',
              description: 'Verify the runtime wiring.',
              acceptanceCriteria: ['Integration works'],
              dependencies: [],
              toolsAllowed: ['project', 'code'],
              subsystemId: 'combat-engine',
            },
          ],
        },
      ],
      verificationSteps: [],
      contentManifest: [],
    };

    const plan = await createAdvancedPlan(preprocessed, makeClient(response));
    const verifier = plan.phases[0]?.tasks.find((task) => task.id === 'verify-combat-integration');

    expect(verifier?.dependencies).toEqual(['implement-combat-fsm', 'wire-combat-scene']);
    expect(verifier?.toolsAllowed).toEqual(expect.arrayContaining(['project', 'code', 'npm']));
  });

  it('wires cross-phase deps for integration-verifier in a phase with no systems/gameplay tasks', async () => {
    const preprocessed: PreprocessedBrief = {
      rawBrief: 'A turn-based deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Test Deckbuilder',
      summary: 'A test game.',
      extractedSubsystems: [],
      extractedSchemas: [],
      sprintPlan: ['Build systems', 'Integration pass'],
      mvpFeatures: ['Play cards'],
      stretchFeatures: [],
      eventTypes: [],
      stateMachines: [],
      sections: [],
    };

    const response = {
      gameTitle: 'Test Deckbuilder',
      gameBrief: 'A test game.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and end turns.',
      controls: ['Mouse'],
      scenes: ['BootScene', 'CombatScene'],
      entities: ['Player', 'Enemy'],
      assets: ['cards'],
      phases: [
        {
          phase: 1,
          tasks: [
            {
              id: 'implement-combat-engine',
              phase: 1,
              role: 'systems',
              title: 'Combat engine',
              description: 'Implement combat engine.',
              acceptanceCriteria: ['Engine exists'],
              dependencies: [],
              toolsAllowed: ['project', 'code'],
            },
            {
              id: 'implement-combat-scene',
              phase: 1,
              role: 'gameplay',
              title: 'Combat scene',
              description: 'Wire combat scene.',
              acceptanceCriteria: ['Scene wired'],
              dependencies: ['implement-combat-engine'],
              toolsAllowed: ['project', 'code'],
            },
          ],
        },
        {
          phase: 2,
          tasks: [
            {
              id: 'final-integration-test',
              phase: 2,
              role: 'integration-verifier',
              title: 'Final integration test',
              description: 'Verify everything is wired.',
              acceptanceCriteria: ['All wired'],
              dependencies: [],
              toolsAllowed: ['project', 'code'],
            },
          ],
        },
      ],
      verificationSteps: [],
      contentManifest: [],
    };

    const plan = await createAdvancedPlan(preprocessed, makeClient(response));
    const verifier = plan.phases[1]?.tasks.find((task) => task.id === 'final-integration-test');

    expect(verifier?.dependencies).toEqual(
      expect.arrayContaining(['implement-combat-engine', 'implement-combat-scene']),
    );
    expect(verifier?.toolsAllowed).toEqual(expect.arrayContaining(['project', 'code', 'npm']));
  });

  it('selects the schema-valid plan object when an earlier JSON array is present in the response', async () => {
    const preprocessed: PreprocessedBrief = {
      rawBrief: 'A turn-based deckbuilder.',
      mode: 'advanced',
      classification: 'data-driven',
      gameGenre: 'deckbuilder',
      gameTitle: 'Test Deckbuilder',
      summary: 'A test game.',
      extractedSubsystems: [],
      extractedSchemas: [],
      sprintPlan: ['Build combat flow'],
      mvpFeatures: ['Play cards'],
      stretchFeatures: [],
      eventTypes: [],
      stateMachines: [],
      sections: [],
    };

    const validPlan = {
      gameTitle: 'Test Deckbuilder',
      gameBrief: 'A test game.',
      genre: 'deckbuilder',
      coreLoop: 'Play cards and end turns.',
      controls: ['Mouse'],
      scenes: ['BootScene', 'CombatScene'],
      entities: ['Player', 'Enemy'],
      assets: ['cards'],
      phases: [
        {
          phase: 1,
          tasks: [
            {
              id: 'implement-combat-loop',
              phase: 1,
              role: 'systems',
              title: 'Implement combat loop',
              description: 'Define the combat loop.',
              acceptanceCriteria: ['Combat loop exists'],
              dependencies: [],
              toolsAllowed: ['project', 'code', 'npm'],
            },
          ],
        },
      ],
      verificationSteps: [],
      contentManifest: [],
    };

    const response = [
      '[{"type":"wait","waitMs":3000}]',
      JSON.stringify(validPlan),
    ].join('\n');

    const client = {
      async invoke() {
        return new AIMessage(response);
      },
    } as unknown as BaseChatModel;

    const plan = await createAdvancedPlan(preprocessed, client);

    expect(plan.gameTitle).toBe('Test Deckbuilder');
    expect(plan.phases[0]?.tasks[0]?.id).toBe('implement-combat-loop');
  });
});
