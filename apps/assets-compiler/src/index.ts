export { compileEnemy } from './orchestrator/compile.js';
export type { CompileOptions } from './orchestrator/compile.js';
export { parsePrompt } from './parser/prompt-parser.js';
export type { ParseOptions } from './parser/prompt-parser.js';
export { writeTscn } from './exporter/tscn-writer.js';
export type { ExportInput, ExportedScene } from './exporter/tscn-writer.js';
export { loadTemplate } from './templates/registry.js';
export type { TemplateData } from './templates/registry.js';
export type {
  EnemySpec,
  AttackArchetype,
  OptionalPart,
} from './types/enemy-spec.js';
export type {
  Skeleton,
  Bone,
  Mesh,
  Animation,
  BoneTrack,
  Vec2,
} from './types/skeleton.js';
export type {
  StageResult,
  StageName,
  StageIssue,
  CompileResult,
} from './types/stage-result.js';
