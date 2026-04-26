import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runAutoAssetPass } from './auto-asset-pass.js';

// Mock the underlying generator — we're testing the orchestration logic
// (skip-when-empty, count-pending, pass-style-guide), not the FAL.ai or
// placeholder pipelines themselves. Those have their own tests.
const generateAllContentArtMock = vi.hoisted(() => vi.fn());
vi.mock('./content-art-generator.js', () => ({
  generateAllContentArt: generateAllContentArtMock,
}));

interface CardSeed {
  id: string;
  artPrompt?: string;
  artKey?: string;
}

async function makeProject(types: { cards?: CardSeed[]; enemies?: CardSeed[]; relics?: CardSeed[] } = {}): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), 'auto-asset-pass-'));
  const contentDir = join(projectPath, 'src', 'data', 'content');
  await mkdir(contentDir, { recursive: true });
  for (const [type, entries] of Object.entries(types)) {
    if (entries) {
      await writeFile(join(contentDir, `${type}.json`), JSON.stringify(entries), 'utf8');
    }
  }
  return projectPath;
}

beforeEach(() => {
  generateAllContentArtMock.mockReset();
  // Default: pretend the generator filled in artKey for everything.
  generateAllContentArtMock.mockImplementation(async (projectPath: string) => {
    const types: ('cards' | 'enemies' | 'relics')[] = ['cards', 'enemies', 'relics'];
    for (const type of types) {
      const path = join(projectPath, 'src', 'data', 'content', `${type}.json`);
      try {
        const fs = await import('fs/promises');
        const raw = await fs.readFile(path, 'utf8');
        const entries = JSON.parse(raw) as CardSeed[];
        const updated = entries.map((e) => ({
          ...e,
          artKey: e.artKey || `${type}_${e.id}`,
        }));
        await fs.writeFile(path, JSON.stringify(updated), 'utf8');
      } catch {
        // file missing — fine
      }
    }
    return { cards: [], enemies: [], relics: [] };
  });
});

describe('runAutoAssetPass', () => {
  it('skips immediately when no content files exist', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'auto-asset-pass-empty-'));
    const result = await runAutoAssetPass(projectPath);
    expect(result.ran).toBe(false);
    expect(result.pendingBefore).toBe(0);
    expect(result.skipReason).toBeDefined();
    expect(generateAllContentArtMock).not.toHaveBeenCalled();
  });

  it('skips when all entries already have artKey set', async () => {
    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: 'a sword', artKey: 'cards_strike' }],
    });
    const result = await runAutoAssetPass(projectPath);
    expect(result.ran).toBe(false);
    expect(result.pendingBefore).toBe(0);
    expect(generateAllContentArtMock).not.toHaveBeenCalled();
  });

  it('runs when at least one entry has artPrompt but no artKey', async () => {
    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: 'a sword', artKey: '' }],
      enemies: [{ id: 'cultist', artPrompt: 'a cultist', artKey: 'enemies_cultist' }],
    });
    const result = await runAutoAssetPass(projectPath);
    expect(result.ran).toBe(true);
    expect(result.pendingBefore).toBe(1);
    expect(generateAllContentArtMock).toHaveBeenCalledOnce();
  });

  it('reports pendingAfter when some entries still lack artKey post-pass', async () => {
    // Generator mock that only fills cards, leaves enemies untouched
    generateAllContentArtMock.mockImplementationOnce(async (projectPath: string) => {
      const fs = await import('fs/promises');
      const cardsPath = join(projectPath, 'src', 'data', 'content', 'cards.json');
      const raw = await fs.readFile(cardsPath, 'utf8');
      const entries = JSON.parse(raw) as CardSeed[];
      const updated = entries.map((e) => ({ ...e, artKey: `cards_${e.id}` }));
      await fs.writeFile(cardsPath, JSON.stringify(updated), 'utf8');
      return { cards: [], enemies: [], relics: [] };
    });

    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: 'a sword', artKey: '' }],
      enemies: [{ id: 'cultist', artPrompt: 'a cultist', artKey: '' }],
    });
    const result = await runAutoAssetPass(projectPath);
    expect(result.ran).toBe(true);
    expect(result.pendingBefore).toBe(2);
    expect(result.pendingAfter).toBe(1); // enemy still pending
  });

  it('forwards styleGuide to the generator when provided', async () => {
    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: 'a sword', artKey: '' }],
    });
    await runAutoAssetPass(projectPath, { styleGuide: 'painterly oil-paint dark fantasy' });
    expect(generateAllContentArtMock).toHaveBeenCalledWith(projectPath, 'painterly oil-paint dark fantasy');
  });

  it('omits styleGuide arg when not provided (uses generator default)', async () => {
    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: 'a sword', artKey: '' }],
    });
    await runAutoAssetPass(projectPath);
    expect(generateAllContentArtMock).toHaveBeenCalledWith(projectPath);
  });

  it('treats entries with empty artPrompt as not pending', async () => {
    const projectPath = await makeProject({
      cards: [{ id: 'strike', artPrompt: '', artKey: '' }],
    });
    const result = await runAutoAssetPass(projectPath);
    // Empty artPrompt means "no art wanted" — not work to do.
    expect(result.ran).toBe(false);
  });

  it('survives malformed JSON in content files', async () => {
    const projectPath = await mkdtemp(join(tmpdir(), 'auto-asset-pass-bad-'));
    const contentDir = join(projectPath, 'src', 'data', 'content');
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'cards.json'), 'not json {{{', 'utf8');

    const result = await runAutoAssetPass(projectPath);
    expect(result.ran).toBe(false);
  });
});
