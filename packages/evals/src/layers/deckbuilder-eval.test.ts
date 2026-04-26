import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runDeckbuilderEval } from './deckbuilder-eval.js';

interface ContentSeed {
  cards?: unknown[];
  enemies?: unknown[];
  relics?: unknown[];
}

interface PlanSeed {
  targets?: {
    cardCount?: number;
    enemyCount?: number;
    relicCount?: number;
    actCount?: number;
    requiredCardCosts?: number[];
  };
}

async function makeProject(content: ContentSeed, plan?: PlanSeed): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'deckbuilder-eval-'));
  const contentDir = join(projectPath, 'src', 'data', 'content');
  await mkdir(contentDir, { recursive: true });
  if (content.cards) {
    await writeFile(join(contentDir, 'cards.json'), JSON.stringify(content.cards), 'utf8');
  }
  if (content.enemies) {
    await writeFile(join(contentDir, 'enemies.json'), JSON.stringify(content.enemies), 'utf8');
  }
  if (content.relics) {
    await writeFile(join(contentDir, 'relics.json'), JSON.stringify(content.relics), 'utf8');
  }
  if (plan) {
    const harnessDir = join(projectPath, 'harness');
    await mkdir(harnessDir, { recursive: true });
    await writeFile(join(harnessDir, 'tasks.json'), JSON.stringify(plan), 'utf8');
  }
  return projectPath;
}

function card(id: string, cost: number, act?: number): Record<string, unknown> {
  const c: Record<string, unknown> = { id, name: id, cost, artPrompt: `art for ${id}` };
  if (act !== undefined) c.act = act;
  return c;
}

function enemy(id: string, act: number): Record<string, unknown> {
  return { id, name: id, act, artPrompt: `art for ${id}` };
}

function relic(id: string): Record<string, unknown> {
  return { id, name: id, artPrompt: `art for ${id}` };
}

describe('runDeckbuilderEval — plan-driven targets', () => {
  it('passes a tiny prototype that meets its own small targets', async () => {
    // 10-card prototype, single act, 3 enemies, 2 relics — would fail the
    // legacy 20/9/5 thresholds but should pass its own plan.
    const cards = [
      card('strike', 0), card('defend', 1), card('bash', 2),
      card('cleave', 1), card('ward', 0), card('pommel', 1),
      card('thunderclap', 1), card('iron-wave', 1), card('havoc', 1),
      card('shrug-it-off', 1),
    ];
    const enemies = [enemy('jaw-worm', 1), enemy('cultist', 1), enemy('louse', 1)];
    const relics = [relic('burning-blood'), relic('orichalcum')];
    const projectPath = await makeProject(
      { cards, enemies, relics },
      { targets: { cardCount: 10, enemyCount: 3, relicCount: 2, actCount: 1 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    expect(result.passed).toBe(true);
    expect(violations).toEqual([]);
    expect(result.summary).toContain('plan');
    expect(result.summary).toContain('10/10 cards');
  });

  it('flags content that falls below 80% of plan target', async () => {
    // Plan promises 20 cards, ships 12 → 60% → warning
    const cards = Array.from({ length: 12 }, (_, i) => card(`c${i}`, i % 3));
    const enemies = [enemy('a', 1), enemy('b', 2), enemy('c', 3)];
    const relics = [relic('x'), relic('y'), relic('z'), relic('w'), relic('v')];
    const projectPath = await makeProject(
      { cards, enemies, relics },
      { targets: { cardCount: 20, enemyCount: 3, relicCount: 5, actCount: 3 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    const cardWarning = violations.find((v) => v.file === 'cards.json');
    expect(cardWarning?.severity).toBe('warning');
    expect(cardWarning?.issue).toContain('12');
    expect(cardWarning?.issue).toContain('20');
    expect(cardWarning?.issue).toContain('60%');
  });

  it('errors when content is below 50% of plan target', async () => {
    // Plan promises 20 cards, ships 5 → 25% → error
    const cards = Array.from({ length: 5 }, (_, i) => card(`c${i}`, i % 3));
    const projectPath = await makeProject(
      { cards, enemies: [], relics: [] },
      { targets: { cardCount: 20, enemyCount: 9, relicCount: 5 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    expect(result.passed).toBe(false);
    const cardError = violations.find((v) => v.file === 'cards.json');
    expect(cardError?.severity).toBe('error');
    expect(cardError?.issue).toContain('25%');
  });

  it('falls back to defaults (≥20/≥9/≥5) when plan has no targets', async () => {
    // No tasks.json, ships 3 cards / 3 enemies / 3 relics — same content as
    // the test-game audit. Should be flagged against default thresholds.
    const cards = [card('strike', 0), card('defend', 1), card('bash', 2)];
    const enemies = [enemy('a', 1), enemy('b', 2), enemy('c', 3)];
    const relics = [relic('x'), relic('y'), relic('z')];
    const projectPath = await makeProject({ cards, enemies, relics });

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    expect(result.summary).toContain('default');
    // 3/20 = 15% → error on cards
    const cardViolation = violations.find((v) => v.file === 'cards.json');
    expect(cardViolation?.severity).toBe('error');
    expect(result.passed).toBe(false);
  });

  it('skips act distribution check when plan declares actCount: 1', async () => {
    const cards = [card('strike', 0), card('defend', 1), card('bash', 2)];
    // All enemies in act 1 — would normally trigger "missing act 2/3" warning
    const enemies = [enemy('a', 1), enemy('b', 1), enemy('c', 1)];
    const relics = [relic('x'), relic('y')];
    const projectPath = await makeProject(
      { cards, enemies, relics },
      { targets: { cardCount: 3, enemyCount: 3, relicCount: 2, actCount: 1 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    const actWarning = violations.find((v) => v.issue.includes('act'));
    expect(actWarning).toBeUndefined();
  });

  it('respects custom requiredCardCosts from plan', async () => {
    // Plan only requires costs [0, 1] — 2-cost cards are not mandatory
    const cards = [card('a', 0), card('b', 1), card('c', 0), card('d', 1)];
    const projectPath = await makeProject(
      { cards, enemies: [], relics: [] },
      { targets: { cardCount: 4, enemyCount: 0, relicCount: 0, requiredCardCosts: [0, 1] } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    const costWarning = violations.find((v) => v.issue.includes('cost'));
    expect(costWarning).toBeUndefined();
  });

  it('treats target of 0 as "no content of this type expected"', async () => {
    // A card-only mini-game: no relics promised, none shipped, no penalty.
    const cards = [card('a', 0), card('b', 1)];
    const projectPath = await makeProject(
      { cards, enemies: [], relics: [] },
      { targets: { cardCount: 2, enemyCount: 0, relicCount: 0 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    const relicViolation = violations.find((v) => v.file === 'relics.json');
    expect(relicViolation).toBeUndefined();
  });

  it('still flags missing artPrompts even when counts match', async () => {
    const cards = [
      { id: 'a', cost: 0, artPrompt: '' }, // empty
      { id: 'b', cost: 1, artPrompt: 'real prompt' },
    ];
    const projectPath = await makeProject(
      { cards, enemies: [], relics: [] },
      { targets: { cardCount: 2, enemyCount: 0, relicCount: 0 } },
    );

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    const promptViolation = violations.find((v) => v.file === 'content');
    expect(promptViolation).toBeDefined();
    expect(promptViolation?.issue).toContain('artPrompt');
  });

  it('falls back gracefully if tasks.json is malformed', async () => {
    const cards = [card('a', 0), card('b', 1), card('c', 2)];
    const projectPath = await mkdtemp(join(tmpdir(), 'deckbuilder-eval-'));
    const contentDir = join(projectPath, 'src', 'data', 'content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'cards.json'), JSON.stringify(cards), 'utf8');
    const harnessDir = join(projectPath, 'harness');
    await mkdir(harnessDir, { recursive: true });
    await writeFile(join(harnessDir, 'tasks.json'), 'not valid json {{{', 'utf8');

    const result = await runDeckbuilderEval({ projectPath } as never);
    const violations = result.violations ?? [];
    // Should not throw, should fall back to defaults
    expect(result.summary).toContain('default');
  });
});
