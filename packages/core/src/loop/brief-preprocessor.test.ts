import { describe, expect, it, vi } from 'vitest';
import type { ClaudeClient } from '../claude/client.js';
import { preprocessBrief } from './brief-preprocessor.js';

function makeClient(responses: string[]): { client: ClaudeClient; sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn(async () => ({
    message: {
      content: responses.shift() ?? '',
    },
  }));

  return {
    client: { sendMessage } as unknown as ClaudeClient,
    sendMessage,
  };
}

describe('preprocessBrief', () => {
  it('bypasses the analyst for clearly simple short briefs', async () => {
    const { client, sendMessage } = makeClient([]);
    const result = await preprocessBrief('A tiny platformer where you jump over spikes.', client);

    expect(result.mode).toBe('simple');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('routes short but data-driven briefs through the analyst', async () => {
    const brief = 'Make a deckbuilder roguelike with cards, relics, map encounters, and turn-based combat.';
    const { client, sendMessage } = makeClient([
      JSON.stringify({
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
      }),
    ]);

    const result = await preprocessBrief(brief, client);

    expect(result.mode).toBe('advanced');
    expect(result.classification).toBe('data-driven');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('throws when analyst output is invalid twice instead of silently downgrading', async () => {
    const brief = 'Build a deckbuilder with relics, card synergies, map nodes, and event-bus-driven combat.';
    const { client, sendMessage } = makeClient(['not json', 'still not json']);

    await expect(preprocessBrief(brief, client)).rejects.toThrow(/Refusing to fall back to simple mode/);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
