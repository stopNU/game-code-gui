import { z } from 'zod';
import type { AgentRole } from './agent.js';
import type { ToolGroupName } from './tool.js';

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'in-progress'
  | 'blocked'
  | 'review'
  | 'complete'
  | 'failed';

/**
 * Phase number for a task.
 * Simple mode uses phases 1–5; advanced mode may use up to 10.
 */
export type TaskPhase = number;

export type EvalLayerName = 'build' | 'functional' | 'design' | 'data' | 'systems';

export interface RuntimeManifestSceneEntry {
  id: string;
  scenePath: string;
  scriptPath?: string;
}

export interface RuntimeManifestScriptEntry {
  id: string;
  scriptPath: string;
  category: 'autoload' | 'scene' | 'system' | 'script';
}

export interface RuntimeManifestAutoloadEntry {
  name: string;
  scriptPath: string;
}

export interface RuntimeManifestDataRootEntry {
  id: string;
  path: string;
  kind: 'content' | 'schema' | 'data';
}

export interface RuntimeFileManifest {
  version: string;
  generatedAt: string;
  canonicalLayoutId: string;
  manifestPath: string;
  mainScenePath?: string;
  scenes: RuntimeManifestSceneEntry[];
  scripts: RuntimeManifestScriptEntry[];
  autoloads: RuntimeManifestAutoloadEntry[];
  dataRoots: RuntimeManifestDataRootEntry[];
}

export interface RuntimeReconciliationConflict {
  id: string;
  kind:
    | 'mixed-runtime-layout'
    | 'duplicate-implementation'
    | 'manifest-mismatch'
    | 'reference-mismatch'
    | 'scene-instantiation';
  severity: 'error' | 'warning';
  summary: string;
  details: string;
  paths: string[];
  active: boolean;
  authoritativePath?: string;
  conflictingPath?: string;
  suggestedAction: string;
}

export interface RuntimeReconciliationPlanStep {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  details: string;
  targets: string[];
  conflictIds: string[];
}

export interface RuntimeReconciliationActiveFiles {
  scenes: string[];
  scripts: string[];
  autoloads: string[];
  dataRoots: string[];
}

export interface RuntimeReconciliationReport {
  version: string;
  generatedAt: string;
  mode: 'read-only';
  canonicalLayoutId: string;
  manifestPath: string;
  activeRuntimeRoots: string[];
  activeFiles: RuntimeReconciliationActiveFiles;
  conflicts: RuntimeReconciliationConflict[];
  repairPlan: RuntimeReconciliationPlanStep[];
}

export interface InputOutputTokens {
  input: number;
  output: number;
  cached: number;
}

export type TokenUsagePhase = 'main' | 'typecheck-fix' | 'eval-fix';

export interface TokenUsageBreakdownEntry {
  phase: TokenUsagePhase;
  tokensUsed: InputOutputTokens;
}

/**
 * A single step in a game-specific verification sequence.
 * Mirrors PlaytestStep from @agent-harness/playtest but lives in core
 * so TaskPlan can reference it without a circular dependency.
 */
export interface VerificationStep {
  type: string;
  value?: string;
  waitMs?: number;
  /** JS expression evaluated in browser context for 'evaluate' steps. */
  expression?: string;
  /** Timeout in ms for 'wait-for-state' steps. */
  timeoutMs?: number;
  assertion?: {
    path: string;
    operator: string;
    value?: unknown;
  };
}

export type StandardMilestoneCriterionId =
  | 'renders-visibly'
  | 'primary-action-visible'
  | 'progression-possible'
  | 'no-runtime-blocker';

export interface MilestoneSceneCriterion {
  id: StandardMilestoneCriterionId;
  description: string;
}

export interface MilestoneSceneDefinition {
  sceneId: string;
  label: string;
  primaryAction?: string;
  acceptanceCriteria: MilestoneSceneCriterion[];
}

export interface TaskContext {
  projectPath: string;
  gameSpec: string;
  relevantFiles: string[];
  memoryKeys: string[];
  /** Direct dependency summaries loaded from persisted task memory. */
  dependencySummaries: string[];
  previousTaskSummaries: string[];
  /** Asset tasks: canvas width for backgrounds/spritesheet planning. */
  canvasWidth?: number;
  /** Asset tasks: canvas height for backgrounds/spritesheet planning. */
  canvasHeight?: number;
  /** Asset tasks: style cues extracted from the brief/plan. */
  visualStyle?: string;
  /** Asset tasks: scenes that should usually receive dedicated backgrounds. */
  scenesNeedingBackgrounds?: string[];
  /** Asset tasks: entity names that need matching sprite/icon coverage. */
  plannedEntities?: string[];
  /** Asset tasks: asset requests from the plan. */
  plannedAssets?: string[];
  /** Advanced mode: which subsystem this task belongs to. */
  subsystemId?: string;
  /** Advanced mode: schema IDs this task should reference when writing data. */
  dataSchemaRefs?: string[];
  /** Advanced mode: architecture notes extracted from the design document. */
  architectureNotes?: string;
  /** Advanced mode: path to the generated architecture contract JSON. */
  architecturePath?: string;
  /** Advanced mode: structured architecture contract for implementation roles. */
  architectureContract?: ArchitectureContract;
  /** Advanced mode: path to the shared preprocessed context JSON. */
  advancedContextPath?: string;
  /** Advanced mode: shared subsystem/event/FSM definitions for every task. */
  advancedSharedContext?: AdvancedSharedContext;
  /** Path to the game spec file (relative to project root). Rendered as a reference so the agent reads it on demand. */
  gameSpecPath?: string;
  /** Path to the runtime file manifest (relative to project root). */
  runtimeManifestPath?: string;
  /** Structured runtime manifest describing authoritative runtime files and roots. */
  runtimeManifest?: RuntimeFileManifest;
  /** Path to the runtime reconciliation report (relative to project root). */
  reconciliationReportPath?: string;
  /** Structured runtime reconciliation report for later repair-aware work. */
  reconciliationReport?: RuntimeReconciliationReport;
  /** Pre-read contents of small relevantFiles (≤ SMALL_FILE_LINES lines), keyed by relative path. Full content injected into prompt. */
  relevantFileContents?: Record<string, string>;
  /** Line counts for larger relevantFiles that are not pre-injected. Rendered as a list so the agent knows what to read. */
  relevantFileIndex?: Record<string, number>;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  toolCallCount: number;
  tokensUsed: InputOutputTokens;
  tokenBreakdown?: TokenUsageBreakdownEntry[];
  evalScores?: Partial<Record<EvalLayerName, number>>;
}

export interface TaskState {
  id: string;
  phase: TaskPhase;
  role: AgentRole;
  status: TaskStatus;
  title: string;
  description: string;
  brief: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  toolsAllowed: ToolGroupName[];
  retries: number;
  maxRetries: number;
  context: TaskContext;
  result?: TaskResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PhasePlan {
  phase: TaskPhase;
  /** Optional display label, e.g. "Bugs" or "Features" for iteration phases. */
  label?: string;
  tasks: TaskState[];
}

// ---------------------------------------------------------------------------
// Advanced mode: subsystem and data-schema definitions
// ---------------------------------------------------------------------------

/**
 * A logical subsystem decomposed from the design document.
 * Used in advanced mode to give agents architectural context.
 */
export interface SubsystemDef {
  /** Kebab-case identifier, e.g. "combat-engine" */
  id: string;
  name: string;
  description: string;
  /** IDs of other subsystems this one depends on. */
  dependencies: string[];
  /** Named modules inside this subsystem, e.g. ["CombatEngine", "CardEngine"]. */
  modules: string[];
}

/**
 * A data schema definition extracted from the design document.
 * The agent writes this as a JSON Schema file and populates it with examples.
 */
export interface DataSchemaDef {
  /** Kebab-case identifier, e.g. "card-schema" */
  id: string;
  name: string;
  /** Project-relative path where the schema file should live. */
  filePath: string;
  /** JSON Schema object describing the data shape. */
  schema: Record<string, unknown>;
  /** 1–3 example entries conforming to the schema. */
  examples: Record<string, unknown>[];
}

/**
 * A content manifest entry: a set of data records that should be
 * written to a file during scaffolding.
 */
export interface ContentEntry {
  /** References a DataSchemaDef.id for validation. */
  schemaId: string;
  /** Project-relative path where the content file should be written. */
  filePath: string;
  data: Record<string, unknown>[];
}

export interface StateMachineDef {
  /** Kebab-case identifier, e.g. "combat-fsm" */
  id: string;
  name: string;
  states: string[];
  description: string;
}

export interface SubsystemApiDef {
  subsystemId: string;
  subsystemName: string;
  description: string;
  dependencies: string[];
  modules: string[];
  exposedEvents: string[];
  stateMachineIds: string[];
  contentLoaderMethods: string[];
}

export interface ArchitectureContract {
  version: string;
  generatedAt: string;
  eventTypes: string[];
  stateMachines: StateMachineDef[];
  subsystemApis: SubsystemApiDef[];
}

export interface AdvancedSharedContext {
  version: string;
  generatedAt: string;
  gameTitle: string;
  gameGenre: string;
  gameBrief: string;
  summary: string;
  classification?: 'data-driven';
  subsystems: SubsystemDef[];
  dataSchemas: DataSchemaDef[];
  eventTypes: string[];
  stateMachines: StateMachineDef[];
  sprintPlan: string[];
  mvpFeatures: string[];
  stretchFeatures: string[];
}

export interface TaskPlan {
  gameTitle: string;
  gameBrief: string;
  genre: string;
  coreLoop: string;
  controls: string[];
  scenes: string[];
  milestoneScenes: MilestoneSceneDefinition[];
  entities: string[];
  assets: string[];
  phases: PhasePlan[];
  /** Game-specific playtest steps that verify core input/mechanics work after generation. */
  verificationSteps: VerificationStep[];
  // -- Advanced mode fields (all optional for backward compatibility) --
  /** Subsystems decomposed from the design document. */
  subsystems?: SubsystemDef[];
  /** Data schemas extracted from the design document (cards, enemies, relics, etc.). */
  dataSchemas?: DataSchemaDef[];
  /** Initial content to scaffold into data files. */
  contentManifest?: ContentEntry[];
  /** Structured architecture handoff for advanced implementation roles. */
  architecture?: ArchitectureContract;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const VerificationStepSchema = z.object({
  type: z.string(),
  value: z.string().optional(),
  waitMs: z.number().optional(),
  expression: z.string().optional(),
  timeoutMs: z.number().optional(),
  assertion: z.object({
    path: z.string(),
    operator: z.string(),
    value: z.unknown().optional(),
  }).optional(),
});

export const MilestoneSceneCriterionSchema = z.object({
  id: z.enum([
    'renders-visibly',
    'primary-action-visible',
    'progression-possible',
    'no-runtime-blocker',
  ]),
  description: z.string(),
});

export const MilestoneSceneDefinitionSchema = z.object({
  sceneId: z.string(),
  label: z.string(),
  primaryAction: z.string().optional(),
  acceptanceCriteria: z.array(MilestoneSceneCriterionSchema),
});

export const TaskStateSchema = z.object({
  id: z.string(),
  phase: z.number().int().min(1),
  role: z.enum([
    'designer',
    'gameplay',
    'asset',
    'qa',
    'evaluator',
    'systems',
    'integration-verifier',
    'balance',
  ]),
  status: z.enum([
    'pending',
    'planning',
    'in-progress',
    'blocked',
    'review',
    'complete',
    'failed',
  ]),
  title: z.string(),
  description: z.string(),
  brief: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  toolsAllowed: z.array(
    z.enum(['project', 'code', 'game', 'asset', 'playtest', 'eval', 'npm', 'git']),
  ),
  retries: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
  context: z.lazy(() => TaskContextSchema),
  result: z
    .object({
      success: z.boolean(),
      summary: z.string(),
      filesModified: z.array(z.string()),
      toolCallCount: z.number().int(),
      tokensUsed: z.object({
        input: z.number(),
        output: z.number(),
        cached: z.number(),
      }),
      tokenBreakdown: z.array(
        z.object({
          phase: z.enum(['main', 'typecheck-fix', 'eval-fix']),
          tokensUsed: z.object({
            input: z.number(),
            output: z.number(),
            cached: z.number(),
          }),
        }),
      ).optional(),
      evalScores: z.record(
        z.enum(['build', 'functional', 'design', 'data', 'systems']),
        z.number(),
      ).optional(),
    })
    .optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const SubsystemDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  modules: z.array(z.string()),
});

const DataSchemaDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  filePath: z.string(),
  schema: z.record(z.unknown()),
  examples: z.array(z.record(z.unknown())),
});

const ContentEntrySchema = z.object({
  schemaId: z.string(),
  filePath: z.string(),
  data: z.array(z.record(z.unknown())),
});

const StateMachineDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  states: z.array(z.string()),
  description: z.string(),
});

const SubsystemApiDefSchema = z.object({
  subsystemId: z.string(),
  subsystemName: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  modules: z.array(z.string()),
  exposedEvents: z.array(z.string()),
  stateMachineIds: z.array(z.string()),
  contentLoaderMethods: z.array(z.string()),
});

const ArchitectureContractSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  eventTypes: z.array(z.string()),
  stateMachines: z.array(StateMachineDefSchema),
  subsystemApis: z.array(SubsystemApiDefSchema),
});

const AdvancedSharedContextSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  gameTitle: z.string(),
  gameGenre: z.string(),
  gameBrief: z.string(),
  summary: z.string(),
  classification: z.literal('data-driven').optional(),
  subsystems: z.array(SubsystemDefSchema),
  dataSchemas: z.array(DataSchemaDefSchema),
  eventTypes: z.array(z.string()),
  stateMachines: z.array(StateMachineDefSchema),
  sprintPlan: z.array(z.string()),
  mvpFeatures: z.array(z.string()),
  stretchFeatures: z.array(z.string()),
});

const RuntimeFileManifestSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  canonicalLayoutId: z.string(),
  manifestPath: z.string(),
  mainScenePath: z.string().optional(),
  scenes: z.array(z.object({
    id: z.string(),
    scenePath: z.string(),
    scriptPath: z.string().optional(),
  })),
  scripts: z.array(z.object({
    id: z.string(),
    scriptPath: z.string(),
    category: z.enum(['autoload', 'scene', 'system', 'script']),
  })),
  autoloads: z.array(z.object({
    name: z.string(),
    scriptPath: z.string(),
  })),
  dataRoots: z.array(z.object({
    id: z.string(),
    path: z.string(),
    kind: z.enum(['content', 'schema', 'data']),
  })),
});

const RuntimeReconciliationReportSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  mode: z.literal('read-only'),
  canonicalLayoutId: z.string(),
  manifestPath: z.string(),
  activeRuntimeRoots: z.array(z.string()),
  activeFiles: z.object({
    scenes: z.array(z.string()),
    scripts: z.array(z.string()),
    autoloads: z.array(z.string()),
    dataRoots: z.array(z.string()),
  }),
  conflicts: z.array(z.object({
    id: z.string(),
    kind: z.enum([
      'mixed-runtime-layout',
      'duplicate-implementation',
      'manifest-mismatch',
      'reference-mismatch',
      'scene-instantiation',
    ]),
    severity: z.enum(['error', 'warning']),
    summary: z.string(),
    details: z.string(),
    paths: z.array(z.string()),
    active: z.boolean(),
    authoritativePath: z.string().optional(),
    conflictingPath: z.string().optional(),
    suggestedAction: z.string(),
  })),
  repairPlan: z.array(z.object({
    id: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    title: z.string(),
    details: z.string(),
    targets: z.array(z.string()),
    conflictIds: z.array(z.string()),
  })),
});

const TaskContextSchema = z.object({
  projectPath: z.string(),
  gameSpec: z.string(),
  relevantFiles: z.array(z.string()),
  memoryKeys: z.array(z.string()),
  dependencySummaries: z.array(z.string()),
  previousTaskSummaries: z.array(z.string()),
  canvasWidth: z.number().optional(),
  canvasHeight: z.number().optional(),
  visualStyle: z.string().optional(),
  scenesNeedingBackgrounds: z.array(z.string()).optional(),
  plannedEntities: z.array(z.string()).optional(),
  plannedAssets: z.array(z.string()).optional(),
  subsystemId: z.string().optional(),
  dataSchemaRefs: z.array(z.string()).optional(),
  architectureNotes: z.string().optional(),
  architecturePath: z.string().optional(),
  architectureContract: ArchitectureContractSchema.optional(),
  advancedContextPath: z.string().optional(),
  advancedSharedContext: AdvancedSharedContextSchema.optional(),
  gameSpecPath: z.string().optional(),
  runtimeManifestPath: z.string().optional(),
  runtimeManifest: RuntimeFileManifestSchema.optional(),
  reconciliationReportPath: z.string().optional(),
  reconciliationReport: RuntimeReconciliationReportSchema.optional(),
});

export const TaskPlanSchema = z.object({
  gameTitle: z.string(),
  gameBrief: z.string(),
  genre: z.string(),
  coreLoop: z.string(),
  controls: z.array(z.string()),
  scenes: z.array(z.string()),
  milestoneScenes: z.array(MilestoneSceneDefinitionSchema).default([]),
  entities: z.array(z.string()),
  assets: z.array(z.string()),
  phases: z.array(
    z.object({
      phase: z.number().int().min(1),
      label: z.string().optional(),
      tasks: z.array(TaskStateSchema),
    }),
  ),
  verificationSteps: z.array(VerificationStepSchema).default([]),
  subsystems: z.array(SubsystemDefSchema).optional(),
  dataSchemas: z.array(DataSchemaDefSchema).optional(),
  contentManifest: z.array(ContentEntrySchema).optional(),
  architecture: ArchitectureContractSchema.optional(),
});
