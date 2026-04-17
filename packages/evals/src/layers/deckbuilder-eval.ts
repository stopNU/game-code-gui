import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { EvalContext, EvalResult, EvalViolation } from '../types/scenario.js';

interface ContentEntry {
  id?: string;
  name?: string;
  cost?: number;
  act?: number;
  artPrompt?: string;
  artKey?: string;
  [key: string]: unknown;
}

async function readContentFile(projectPath: string, name: string): Promise<ContentEntry[]> {
  const filePath = join(projectPath, 'src', 'data', 'content', name);
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ContentEntry[]) : [];
}

/**
 * Deckbuilder-specific content quality eval.
 * Checks card count, enemy distribution, relic count, cost variety, and artPrompt coverage.
 */
export async function runDeckbuilderEval(ctx: EvalContext): Promise<EvalResult> {
  const violations: EvalViolation[] = [];
  let score = 10;

  const [cards, enemies, relics] = await Promise.all([
    readContentFile(ctx.projectPath, 'cards.json'),
    readContentFile(ctx.projectPath, 'enemies.json'),
    readContentFile(ctx.projectPath, 'relics.json'),
  ]);

  // Card count (minimum 20)
  if (cards.length === 0) {
    violations.push({ file: 'cards.json', issue: 'cards.json missing or empty', severity: 'error' });
    score -= 3;
  } else if (cards.length < 20) {
    violations.push({ file: 'cards.json', issue: `Only ${cards.length} cards (minimum 20)`, severity: 'warning' });
    score -= 1;
  }

  // Enemy count (minimum 9, 3 per act)
  if (enemies.length === 0) {
    violations.push({ file: 'enemies.json', issue: 'enemies.json missing or empty', severity: 'error' });
    score -= 3;
  } else if (enemies.length < 9) {
    violations.push({ file: 'enemies.json', issue: `Only ${enemies.length} enemies (minimum 9, 3 per act)`, severity: 'warning' });
    score -= 1;
  } else {
    // Check act distribution
    const actCounts = [1, 2, 3].map((act) => enemies.filter((e) => e.act === act).length);
    const missingActs = [1, 2, 3].filter((_, i) => actCounts[i] === 0);
    if (missingActs.length > 0) {
      violations.push({
        file: 'enemies.json',
        issue: `No enemies for act(s): ${missingActs.join(', ')}`,
        severity: 'warning',
      });
      score -= 0.5;
    }
  }

  // Relic count (minimum 5)
  if (relics.length === 0) {
    violations.push({ file: 'relics.json', issue: 'relics.json missing or empty', severity: 'error' });
    score -= 2;
  } else if (relics.length < 5) {
    violations.push({ file: 'relics.json', issue: `Only ${relics.length} relics (minimum 5)`, severity: 'warning' });
    score -= 0.5;
  }

  // Cost distribution — must have cards at 0, 1, and 2 cost
  if (cards.length > 0) {
    const costs = new Set(cards.map((c) => c.cost).filter((c) => typeof c === 'number'));
    const missingCosts = [0, 1, 2].filter((c) => !costs.has(c));
    if (missingCosts.length > 0) {
      violations.push({
        file: 'cards.json',
        issue: `Missing cards with cost: ${missingCosts.join(', ')} (power curve too flat)`,
        severity: 'warning',
      });
      score -= 0.5;
    }
  }

  // artPrompt coverage across all content types
  const allEntries = [...cards, ...enemies, ...relics];
  if (allEntries.length > 0) {
    const withPrompt = allEntries.filter((e) => typeof e.artPrompt === 'string' && e.artPrompt !== '').length;
    const coverage = withPrompt / allEntries.length;
    if (coverage < 1.0) {
      const missing = allEntries.length - withPrompt;
      violations.push({
        file: 'content',
        issue: `${missing}/${allEntries.length} entries missing artPrompt (${Math.round(coverage * 100)}% coverage)`,
        severity: coverage < 0.5 ? 'error' : 'warning',
      });
      score -= coverage < 0.5 ? 2 : 0.5;
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const finalScore = Math.max(0, Math.min(10, score));
  const passed = errorCount === 0 && finalScore >= 6;

  const artPromptCoverage = allEntries.length > 0
    ? Math.round(allEntries.filter((e) => typeof e.artPrompt === 'string' && e.artPrompt !== '').length / allEntries.length * 100)
    : 0;

  const summary = violations.length === 0
    ? `Deckbuilder content looks good: ${cards.length} cards, ${enemies.length} enemies, ${relics.length} relics, ${artPromptCoverage}% artPrompt coverage`
    : `${errorCount} error(s), ${warningCount} warning(s). Cards: ${cards.length}, Enemies: ${enemies.length}, Relics: ${relics.length}, artPrompt: ${artPromptCoverage}%`;

  return {
    layerName: 'deckbuilder' as EvalResult['layerName'],
    score: finalScore,
    passed,
    violations,
    summary,
  };
}
