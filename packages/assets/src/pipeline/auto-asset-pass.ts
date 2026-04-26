import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { generateAllContentArt } from './content-art-generator.js';
import type { ContentArtResult, ContentType } from './content-art-generator.js';

/**
 * Idempotent helper that scans a project's content JSON for entries with
 * `artPrompt` set but `artKey` empty, and runs the asset pipeline for them
 * if any are found. Designed to be called from orchestration code (CLI or
 * Studio) without thinking about phase boundaries — if there's nothing to
 * do it returns immediately.
 *
 * Why orchestration runs this rather than the asset agent: the agent path
 * goes through Bash to run `game-harness generate-assets` (or worse,
 * tries to invoke FAL.ai via tool contracts), which has been failing
 * silently in practice — most generated games ship with empty artKey
 * fields. Pulling the work out of the LLM loop turns a multi-step
 * stochastic call into a deterministic side-effect.
 */

export interface AutoAssetPassResult {
  /** True when at least one entry had work and the pipeline ran. */
  ran: boolean;
  /** Number of entries pending art before the pass. */
  pendingBefore: number;
  /** Number of entries pending art after the pass (failures + skipped). */
  pendingAfter: number;
  /** Per-type generation results when the pass ran; empty record otherwise. */
  results: Record<ContentType, ContentArtResult[]>;
  /** Reason the pass did not run, when ran=false. */
  skipReason?: string;
}

interface ContentEntry {
  id?: string;
  artPrompt?: string;
  artKey?: string;
}

const CONTENT_TYPES: ContentType[] = ['cards', 'enemies', 'relics'];

async function readContentEntries(projectPath: string, type: ContentType): Promise<ContentEntry[]> {
  const filePath = join(projectPath, 'src', 'data', 'content', `${type}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ContentEntry[]) : [];
  } catch {
    return [];
  }
}

function pendingCount(entries: ContentEntry[]): number {
  return entries.filter((e) => typeof e.artPrompt === 'string' && e.artPrompt.length > 0
    && (typeof e.artKey !== 'string' || e.artKey === '')).length;
}

/**
 * Run the asset pass if any pending entries exist. Safe to call repeatedly
 * — when nothing is pending it returns `{ ran: false, ... }` immediately
 * and does no I/O beyond the JSON reads.
 *
 * @param projectPath  Absolute project root.
 * @param opts.styleGuide  Optional style guide string forwarded to the
 *   generator. Pass the design's `styleNote.artDirection` when calling
 *   from orchestration so generated images match the game's identity.
 */
export async function runAutoAssetPass(
  projectPath: string,
  opts: { styleGuide?: string } = {},
): Promise<AutoAssetPassResult> {
  // Phase 1: count pending entries across all types.
  const beforeByType = await Promise.all(
    CONTENT_TYPES.map(async (type) => ({ type, entries: await readContentEntries(projectPath, type) })),
  );
  const pendingBefore = beforeByType.reduce((sum, { entries }) => sum + pendingCount(entries), 0);

  if (pendingBefore === 0) {
    return {
      ran: false,
      pendingBefore: 0,
      pendingAfter: 0,
      results: { cards: [], enemies: [], relics: [] },
      skipReason: 'no entries with artPrompt and empty artKey',
    };
  }

  // Phase 2: run the pipeline for everything pending.
  const results = opts.styleGuide !== undefined
    ? await generateAllContentArt(projectPath, opts.styleGuide)
    : await generateAllContentArt(projectPath);

  // Phase 3: re-count to see how many entries are still missing artKey.
  // generateAllContentArt mutates the JSON files, so a re-read is required.
  const afterByType = await Promise.all(
    CONTENT_TYPES.map(async (type) => ({ type, entries: await readContentEntries(projectPath, type) })),
  );
  const pendingAfter = afterByType.reduce((sum, { entries }) => sum + pendingCount(entries), 0);

  return {
    ran: true,
    pendingBefore,
    pendingAfter,
    results,
  };
}
