// TODO Phase 6: rewrite tests alongside the Godot headless design eval implementation.
import { describe, expect, it } from 'vitest';
import { runDesignEval } from './design-eval.js';

describe('runDesignEval (stub)', () => {
  it('returns a not-implemented result without throwing', async () => {
    const result = await runDesignEval({
      id: 'design-stub',
      name: 'design',
      description: 'design eval stub',
      layer: 'design',
      gameSpec: 'spec',
      inputs: { projectPath: 'D:/tmp/game', actions: [] },
      expectedOutputs: { designCriteria: ['Readable HUD'] },
      rubric: {
        dimensions: [{ name: 'hud', description: 'Readable HUD', maxScore: 10, automated: true }],
        passingThreshold: 0.8,
      },
      tags: [],
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    });

    expect(result.passed).toBe(false);
    expect(result.dimensions[0]?.name).toBe('not-implemented');
  });
});
