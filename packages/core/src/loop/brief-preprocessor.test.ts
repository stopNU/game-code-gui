import { describe, expect, it } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { preprocessBrief } from './brief-preprocessor.js';

function makeModel(responses: string[]): { model: BaseChatModel; callCount: () => number } {
  let calls = 0;
  const model = {
    async invoke() {
      calls++;
      const text = responses.shift() ?? '';
      return new AIMessage(text);
    },
  } as unknown as BaseChatModel;
  return { model, callCount: () => calls };
}

const validResponse = JSON.stringify({
  mode: 'advanced',
  classification: 'data-driven',
  gameGenre: 'deckbuilder roguelike',
  gameTitle: 'Relic Run',
  summary: 'A compact deckbuilder.',
  subsystems: [{ id: 'combat', name: 'Combat', description: 'Card combat', dependencies: [], modules: ['CombatEngine'] }],
  dataSchemas: [],
  sprintPlan: ['Core combat'],
  mvpFeatures: ['Play cards'],
  stretchFeatures: [],
  eventTypes: ['ON_CARD_PLAYED'],
  stateMachines: [],
  sections: [],
});

const uid = Date.now();

describe('preprocessBrief', () => {
  it('routes data-driven briefs through the analyst', async () => {
    const brief = `Make a deckbuilder roguelike with cards, relics, map encounters, and turn-based combat. [${uid}a]`;
    const { model, callCount } = makeModel([validResponse]);

    const result = await preprocessBrief(brief, model);

    expect(result.mode).toBe('advanced');
    expect(result.classification).toBe('data-driven');
    expect(callCount()).toBe(1);
  });

  it('returns cached result on second call with same brief', async () => {
    const brief = `Make a deckbuilder with cards and relics. [${uid}b]`;
    const { model: m1 } = makeModel([validResponse]);
    const result1 = await preprocessBrief(brief, m1);

    // Second call — if cache hit, model is never invoked
    const { model: m2, callCount } = makeModel([]);
    const result2 = await preprocessBrief(brief, m2);

    expect(result1.gameTitle).toBe(result2.gameTitle);
    expect(callCount()).toBe(0);
  });

  it('throws when analyst output is invalid twice instead of silently downgrading', async () => {
    const brief = `Build a deckbuilder with relics, card synergies, map nodes, and event-bus-driven combat. [${uid}c]`;
    const { model, callCount } = makeModel(['not json', 'still not json']);

    await expect(preprocessBrief(brief, model)).rejects.toThrow(/Refusing to fall back to simple mode/);
    expect(callCount()).toBe(2);
  });
});
