import type { EnemySpec } from '../types/enemy-spec.js';
import type { StageResult } from '../types/stage-result.js';

export interface EnemyMeta {
  id: string;
  name: string;
  prompt: string;
  templateId: string;
  palette: string[];
  materials: string[];
  mood: string;
  attackArchetype: string;
  optionalParts: string[];
  seed: number;
  /** ISO-8601 timestamp. */
  generatedAt: string;
  /** Per-stage scores. */
  scores: Record<string, number>;
  /** Per-stage retry counts. */
  retries: Record<string, number>;
  /** Compiler version (semver from package.json). */
  compilerVersion: string;
}

export function buildMeta(
  spec: EnemySpec,
  stages: StageResult[],
  compilerVersion: string,
): EnemyMeta {
  const scores: Record<string, number> = {};
  const retries: Record<string, number> = {};
  for (const s of stages) {
    scores[s.stage] = s.score;
    retries[s.stage] = s.retries;
  }
  return {
    id: spec.id,
    name: spec.name,
    prompt: spec.prompt,
    templateId: spec.templateId,
    palette: spec.palette,
    materials: spec.materials,
    mood: spec.mood,
    attackArchetype: spec.attackArchetype,
    optionalParts: spec.optionalParts,
    seed: spec.seed,
    generatedAt: new Date().toISOString(),
    scores,
    retries,
    compilerVersion,
  };
}
