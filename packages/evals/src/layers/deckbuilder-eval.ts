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

/**
 * Content targets read from `harness/tasks.json`. The planner writes these
 * per-game so a 12-card prototype and a 75-card roguelike each get graded
 * against their own promise. If the plan has no `targets` (older projects,
 * or planner that didn't emit them yet) we fall back to genre defaults
 * matching the historic Slay-the-Spire-shaped thresholds.
 */
interface ResolvedTargets {
  cardCount: number;
  enemyCount: number;
  relicCount: number;
  actCount: number;
  requiredCardCosts: number[];
  /** True when the targets came from the plan; false when we fell back. */
  fromPlan: boolean;
}

const DEFAULT_TARGETS: ResolvedTargets = {
  cardCount: 20,
  enemyCount: 9,
  relicCount: 5,
  actCount: 3,
  requiredCardCosts: [0, 1, 2],
  fromPlan: false,
};

async function readContentFile(projectPath: string, name: string): Promise<ContentEntry[]> {
  const filePath = join(projectPath, 'src', 'data', 'content', name);
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ContentEntry[]) : [];
}

async function readPlanTargets(projectPath: string): Promise<ResolvedTargets> {
  const planPath = join(projectPath, 'harness', 'tasks.json');
  if (!existsSync(planPath)) return DEFAULT_TARGETS;
  try {
    const raw = await readFile(planPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      targets?: {
        cardCount?: number;
        enemyCount?: number;
        relicCount?: number;
        actCount?: number;
        requiredCardCosts?: number[];
      };
    };
    const t = parsed.targets;
    if (!t || typeof t !== 'object') return DEFAULT_TARGETS;
    if (typeof t.cardCount !== 'number' || typeof t.enemyCount !== 'number' || typeof t.relicCount !== 'number') {
      return DEFAULT_TARGETS;
    }
    return {
      cardCount: t.cardCount,
      enemyCount: t.enemyCount,
      relicCount: t.relicCount,
      actCount: typeof t.actCount === 'number' && t.actCount > 0 ? t.actCount : 3,
      requiredCardCosts: Array.isArray(t.requiredCardCosts) && t.requiredCardCosts.length > 0
        ? t.requiredCardCosts.filter((n): n is number => typeof n === 'number')
        : [0, 1, 2],
      fromPlan: true,
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

/**
 * Grade a single content count against its plan target.
 *
 * The shape: 100% of target = full marks; below 80% = warning; below 50% =
 * error; missing/empty file is always an error. This is a relative bar: the
 * planner promises 12 cards → eval expects 12, not 20; promises 80 → expects
 * 80. Score deductions scale with the gap so a 19/20 gets a tiny ding while
 * a 3/20 gets the full -3.
 */
function gradeCount(
  actual: number,
  target: number,
  contentLabel: string,
  fileName: string,
  errorPenalty: number,
  warningPenalty: number,
): { violation?: EvalViolation; deduction: number } {
  if (target <= 0) {
    // Plan declared zero of this content type — nothing to grade.
    return { deduction: 0 };
  }
  if (actual === 0) {
    return {
      violation: { file: fileName, issue: `${fileName} missing or empty (target ${target})`, severity: 'error' },
      deduction: errorPenalty,
    };
  }
  const ratio = actual / target;
  if (ratio < 0.5) {
    return {
      violation: {
        file: fileName,
        issue: `Only ${actual} ${contentLabel} (target ${target}, ${Math.round(ratio * 100)}% of plan)`,
        severity: 'error',
      },
      deduction: errorPenalty * (1 - ratio),
    };
  }
  if (ratio < 0.8) {
    return {
      violation: {
        file: fileName,
        issue: `Only ${actual} ${contentLabel} (target ${target}, ${Math.round(ratio * 100)}% of plan)`,
        severity: 'warning',
      },
      deduction: warningPenalty,
    };
  }
  return { deduction: 0 };
}

/**
 * Deckbuilder-specific content quality eval — plan-driven.
 *
 * Reads `harness/tasks.json` for the planner's `targets` block; falls back
 * to genre defaults if absent. Grades card/enemy/relic counts proportional
 * to the plan's promise rather than against a fixed Slay-the-Spire yardstick.
 *
 * Still checks (orthogonal to counts): act distribution, card-cost variety,
 * artPrompt coverage. Those are about deck health, not size.
 */
export async function runDeckbuilderEval(ctx: EvalContext): Promise<EvalResult> {
  const violations: EvalViolation[] = [];
  let score = 10;

  const [cards, enemies, relics, targets] = await Promise.all([
    readContentFile(ctx.projectPath, 'cards.json'),
    readContentFile(ctx.projectPath, 'enemies.json'),
    readContentFile(ctx.projectPath, 'relics.json'),
    readPlanTargets(ctx.projectPath),
  ]);

  // Counts vs plan targets
  const cardGrade = gradeCount(cards.length, targets.cardCount, 'cards', 'cards.json', 3, 1);
  if (cardGrade.violation) violations.push(cardGrade.violation);
  score -= cardGrade.deduction;

  const enemyGrade = gradeCount(enemies.length, targets.enemyCount, 'enemies', 'enemies.json', 3, 1);
  if (enemyGrade.violation) violations.push(enemyGrade.violation);
  score -= enemyGrade.deduction;

  const relicGrade = gradeCount(relics.length, targets.relicCount, 'relics', 'relics.json', 2, 0.5);
  if (relicGrade.violation) violations.push(relicGrade.violation);
  score -= relicGrade.deduction;

  // Act distribution — orthogonal to count target. Only meaningful when the
  // design actually has multiple acts AND ships at least one enemy per act.
  if (enemies.length > 0 && targets.actCount > 1) {
    const acts = Array.from({ length: targets.actCount }, (_, i) => i + 1);
    const actCounts = acts.map((act) => enemies.filter((e) => e.act === act).length);
    const missingActs = acts.filter((_, i) => actCounts[i] === 0);
    if (missingActs.length > 0) {
      violations.push({
        file: 'enemies.json',
        issue: `No enemies for act(s): ${missingActs.join(', ')}`,
        severity: 'warning',
      });
      score -= 0.5;
    }
  }

  // Cost distribution — flag missing required costs
  if (cards.length > 0) {
    const costs = new Set(cards.map((c) => c.cost).filter((c) => typeof c === 'number'));
    const missingCosts = targets.requiredCardCosts.filter((c) => !costs.has(c));
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

  const targetSource = targets.fromPlan ? 'plan' : 'default';
  const counts = `${cards.length}/${targets.cardCount} cards, ${enemies.length}/${targets.enemyCount} enemies, ${relics.length}/${targets.relicCount} relics`;
  const summary = violations.length === 0
    ? `Deckbuilder content meets plan targets (${targetSource}): ${counts}, ${artPromptCoverage}% artPrompt coverage`
    : `${errorCount} error(s), ${warningCount} warning(s). Targets (${targetSource}): ${counts}, artPrompt: ${artPromptCoverage}%`;

  return {
    layerName: 'deckbuilder' as EvalResult['layerName'],
    score: finalScore,
    passed,
    violations,
    summary,
  };
}
