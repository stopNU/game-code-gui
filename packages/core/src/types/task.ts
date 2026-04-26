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
 * Generated GDScript deckbuilder plans may use up to 10 phases.
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

/**
 * Visual direction for the game, committed up front by the designer phase so
 * the gameplay agent has concrete art-direction guidance when building scenes.
 * Palette values are 6-digit hex strings without alpha (e.g. "#1a1226").
 */
export interface StyleNote {
  mood: string;
  palette: {
    bgDeep: string;
    bgPanel: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    text: string;
    textDim: string;
  };
  typographyNote: string;
  artDirection: string;
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
  /** Visual direction (palette, mood, art-direction) for the gameplay and asset agents. */
  styleNote?: StyleNote;
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
  styleNote: z.object({
    mood: z.string(),
    palette: z.object({
      bgDeep: z.string(),
      bgPanel: z.string(),
      accent: z.string(),
      success: z.string(),
      warning: z.string(),
      danger: z.string(),
      text: z.string(),
      textDim: z.string(),
    }),
    typographyNote: z.string(),
    artDirection: z.string(),
  }).optional(),
  subsystems: z.array(SubsystemDefSchema).optional(),
  dataSchemas: z.array(DataSchemaDefSchema).optional(),
  contentManifest: z.array(ContentEntrySchema).optional(),
  architecture: ArchitectureContractSchema.optional(),
});

const VALID_TASK_STATUSES = new Set<TaskStatus>([
  'pending',
  'planning',
  'in-progress',
  'blocked',
  'review',
  'complete',
  'failed',
]);

const VALID_AGENT_ROLES = new Set<AgentRole>([
  'designer',
  'gameplay',
  'asset',
  'qa',
  'evaluator',
  'systems',
  'integration-verifier',
  'balance',
]);

const VALID_TOOL_GROUPS = new Set<ToolGroupName>([
  'project',
  'code',
  'asset',
  'playtest',
  'eval',
  'npm',
  'git',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function defaultToolsForRole(role: AgentRole): ToolGroupName[] {
  switch (role) {
    case 'asset':
      return ['project', 'asset'];
    case 'integration-verifier':
      return ['project', 'code', 'npm', 'playtest'];
    case 'qa':
      return ['project', 'code', 'npm', 'playtest'];
    case 'evaluator':
      return ['project', 'eval'];
    case 'balance':
      return ['project', 'code', 'npm', 'eval'];
    case 'designer':
      return ['project', 'code'];
    case 'systems':
    case 'gameplay':
    default:
      return ['project', 'code', 'npm'];
  }
}

function normalizeTaskContext(
  rawContext: unknown,
  projectPath: string,
): TaskContext {
  const context = isRecord(rawContext) ? rawContext : {};
  const canvasWidth = toFiniteNumber(context['canvasWidth']);
  const canvasHeight = toFiniteNumber(context['canvasHeight']);

  return {
    projectPath: typeof context['projectPath'] === 'string' ? context['projectPath'] : projectPath,
    gameSpec: typeof context['gameSpec'] === 'string' ? context['gameSpec'] : '',
    relevantFiles: toStringArray(context['relevantFiles']),
    memoryKeys: toStringArray(context['memoryKeys']),
    dependencySummaries: toStringArray(context['dependencySummaries']),
    previousTaskSummaries: toStringArray(context['previousTaskSummaries']),
    ...(canvasWidth !== undefined ? { canvasWidth } : {}),
    ...(canvasHeight !== undefined ? { canvasHeight } : {}),
    ...(typeof context['visualStyle'] === 'string' ? { visualStyle: context['visualStyle'] } : {}),
    ...(Array.isArray(context['scenesNeedingBackgrounds'])
      ? { scenesNeedingBackgrounds: toStringArray(context['scenesNeedingBackgrounds']) }
      : {}),
    ...(Array.isArray(context['plannedEntities'])
      ? { plannedEntities: toStringArray(context['plannedEntities']) }
      : {}),
    ...(Array.isArray(context['plannedAssets'])
      ? { plannedAssets: toStringArray(context['plannedAssets']) }
      : {}),
    ...(typeof context['subsystemId'] === 'string' ? { subsystemId: context['subsystemId'] } : {}),
    ...(Array.isArray(context['dataSchemaRefs'])
      ? { dataSchemaRefs: toStringArray(context['dataSchemaRefs']) }
      : {}),
    ...(typeof context['architectureNotes'] === 'string'
      ? { architectureNotes: context['architectureNotes'] }
      : {}),
    ...(typeof context['architecturePath'] === 'string'
      ? { architecturePath: context['architecturePath'] }
      : {}),
    ...(isRecord(context['architectureContract'])
      ? { architectureContract: context['architectureContract'] as unknown as ArchitectureContract }
      : {}),
    ...(typeof context['advancedContextPath'] === 'string'
      ? { advancedContextPath: context['advancedContextPath'] }
      : {}),
    ...(isRecord(context['advancedSharedContext'])
      ? { advancedSharedContext: context['advancedSharedContext'] as unknown as AdvancedSharedContext }
      : {}),
    ...(typeof context['gameSpecPath'] === 'string' ? { gameSpecPath: context['gameSpecPath'] } : {}),
    ...(typeof context['runtimeManifestPath'] === 'string'
      ? { runtimeManifestPath: context['runtimeManifestPath'] }
      : {}),
    ...(isRecord(context['runtimeManifest'])
      ? { runtimeManifest: context['runtimeManifest'] as unknown as RuntimeFileManifest }
      : {}),
    ...(typeof context['reconciliationReportPath'] === 'string'
      ? { reconciliationReportPath: context['reconciliationReportPath'] }
      : {}),
    ...(isRecord(context['reconciliationReport'])
      ? { reconciliationReport: context['reconciliationReport'] as unknown as RuntimeReconciliationReport }
      : {}),
  };
}

function normalizeTaskResult(rawResult: unknown): TaskResult | undefined {
  if (!isRecord(rawResult)) {
    return undefined;
  }

  const tokensUsed = isRecord(rawResult['tokensUsed']) ? rawResult['tokensUsed'] : undefined;
  if (
    typeof rawResult['success'] !== 'boolean'
    || typeof rawResult['summary'] !== 'string'
    || !Array.isArray(rawResult['filesModified'])
    || typeof rawResult['toolCallCount'] !== 'number'
    || tokensUsed === undefined
    || typeof tokensUsed['input'] !== 'number'
    || typeof tokensUsed['output'] !== 'number'
    || typeof tokensUsed['cached'] !== 'number'
  ) {
    return undefined;
  }

  const result: TaskResult = {
    success: rawResult['success'],
    summary: rawResult['summary'],
    filesModified: toStringArray(rawResult['filesModified']),
    toolCallCount: rawResult['toolCallCount'],
    tokensUsed: {
      input: tokensUsed['input'],
      output: tokensUsed['output'],
      cached: tokensUsed['cached'],
    },
  };

  return result;
}

function normalizeTaskState(
  rawTask: unknown,
  phase: number,
  projectPath: string,
  now: string,
  index: number,
): TaskState {
  const task = isRecord(rawTask) ? rawTask : {};
  const role = VALID_AGENT_ROLES.has(task['role'] as AgentRole)
    ? task['role'] as AgentRole
    : 'gameplay';
  const toolsAllowed = Array.isArray(task['toolsAllowed'])
    ? task['toolsAllowed'].filter((tool): tool is ToolGroupName => VALID_TOOL_GROUPS.has(tool as ToolGroupName))
    : [];
  const id = typeof task['id'] === 'string' && task['id'].trim().length > 0
    ? task['id']
    : `phase-${phase}-task-${index + 1}`;
  const description = typeof task['description'] === 'string' ? task['description'] : '';

  const result = normalizeTaskResult(task['result']);

  return {
    id,
    phase: typeof task['phase'] === 'number' ? task['phase'] : phase,
    role,
    status: VALID_TASK_STATUSES.has(task['status'] as TaskStatus)
      ? task['status'] as TaskStatus
      : 'pending',
    title: typeof task['title'] === 'string' && task['title'].trim().length > 0
      ? task['title']
      : id,
    description,
    brief: typeof task['brief'] === 'string' && task['brief'].trim().length > 0
      ? task['brief']
      : description,
    acceptanceCriteria: toStringArray(task['acceptanceCriteria']),
    dependencies: toStringArray(task['dependencies']),
    toolsAllowed: toolsAllowed.length > 0 ? toolsAllowed : defaultToolsForRole(role),
    retries: typeof task['retries'] === 'number' && Number.isFinite(task['retries']) ? task['retries'] : 0,
    maxRetries: typeof task['maxRetries'] === 'number' && Number.isFinite(task['maxRetries']) ? task['maxRetries'] : 3,
    context: normalizeTaskContext(task['context'], projectPath),
    ...(result !== undefined ? { result } : {}),
    ...(typeof task['error'] === 'string' ? { error: task['error'] } : {}),
    createdAt: typeof task['createdAt'] === 'string' ? task['createdAt'] : now,
    updatedAt: typeof task['updatedAt'] === 'string' ? task['updatedAt'] : now,
    ...(typeof task['completedAt'] === 'string' ? { completedAt: task['completedAt'] } : {}),
  };
}

export function normalizeTaskPlan(rawPlan: unknown, projectPath = ''): TaskPlan {
  const plan = isRecord(rawPlan) ? rawPlan : {};
  const now = new Date().toISOString();
  const phases = Array.isArray(plan['phases']) ? plan['phases'] : [];

  const normalized = TaskPlanSchema.parse({
    gameTitle: typeof plan['gameTitle'] === 'string' ? plan['gameTitle'] : 'Untitled Game',
    gameBrief: typeof plan['gameBrief'] === 'string' ? plan['gameBrief'] : '',
    genre: typeof plan['genre'] === 'string' ? plan['genre'] : 'Deckbuilder roguelike',
    coreLoop: typeof plan['coreLoop'] === 'string' ? plan['coreLoop'] : '',
    controls: toStringArray(plan['controls']),
    scenes: toStringArray(plan['scenes']),
    milestoneScenes: Array.isArray(plan['milestoneScenes']) ? plan['milestoneScenes'] : [],
    entities: toStringArray(plan['entities']),
    assets: toStringArray(plan['assets']),
    phases: phases.map((rawPhase, phaseIndex) => {
      const phase = isRecord(rawPhase) ? rawPhase : {};
      const phaseNumber = typeof phase['phase'] === 'number' ? phase['phase'] : phaseIndex + 1;
      return {
        phase: phaseNumber,
        ...(typeof phase['label'] === 'string' ? { label: phase['label'] } : {}),
        tasks: (Array.isArray(phase['tasks']) ? phase['tasks'] : []).map((rawTask, taskIndex) =>
          normalizeTaskState(rawTask, phaseNumber, projectPath, now, taskIndex),
        ),
      };
    }),
    verificationSteps: Array.isArray(plan['verificationSteps']) ? plan['verificationSteps'] : [],
    ...(Array.isArray(plan['subsystems']) ? { subsystems: plan['subsystems'] } : {}),
    ...(Array.isArray(plan['dataSchemas']) ? { dataSchemas: plan['dataSchemas'] } : {}),
    ...(Array.isArray(plan['contentManifest']) ? { contentManifest: plan['contentManifest'] } : {}),
    ...(isRecord(plan['architecture']) ? { architecture: plan['architecture'] } : {}),
  });

  return normalized as unknown as TaskPlan;
}
