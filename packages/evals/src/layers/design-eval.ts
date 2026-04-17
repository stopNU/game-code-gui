// TODO Phase 6: rewrite as Godot screenshot + LLM judge eval.
// The old Playwright-based design eval is not applicable to native Godot projects.
// This stub ensures the eval runner does not crash when design eval is requested.

import type { EvalScenario } from '../types/scenario.js';
import type { ScoreResult } from '../types/report.js';

export async function runDesignEval(scenario: EvalScenario): Promise<ScoreResult> {
  return {
    scenarioId: scenario.id,
    layer: scenario.layer,
    passed: false,
    totalScore: 0,
    maxScore: 10,
    ratio: 0,
    dimensions: [
      {
        name: 'not-implemented',
        description: 'Godot screenshot design eval (Phase 6)',
        score: 0,
        maxScore: 10,
        rationale: 'Design eval for Godot not yet implemented — Phase 6 will add screenshot + LLM judge',
      },
    ],
    durationMs: 0,
    runAt: new Date().toISOString(),
    summary: 'Phase 6 pending',
  };
}
