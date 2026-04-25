import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { TaskPlanSchema, VerificationStepSchema } from '../types/task.js';
import type {
  TaskPlan,
  TaskState,
  SubsystemDef,
  DataSchemaDef,
  ContentEntry,
  ArchitectureContract,
  StateMachineDef,
  SubsystemApiDef,
  MilestoneSceneDefinition,
} from '../types/task.js';
import type { ToolGroupName } from '../types/tool.js';
import { DEFAULT_MODEL } from '../types/agent.js';
import { ADVANCED_DESIGNER_SYSTEM_PROMPT } from '../claude/roles/advanced-designer.js';
import type { PreprocessedBrief } from './brief-preprocessor.js';
import { extractJson, extractJsonCandidates, extractText } from './extract.js';
import { validateTaskPlan } from './plan-validation.js';
import { withRetry } from './retry.js';
import { DEFAULT_RETRY_POLICY } from '../types/agent.js';

// ---------------------------------------------------------------------------
// Zod schemas — what the Advanced Designer agent actually returns
// (no boilerplate fields like status/retries/context — those are added below)
// ---------------------------------------------------------------------------

const AdvancedDesignerTaskSchema = z.object({
  id: z.string(),
  phase: z.number().int().min(1).max(8),
  role: z.enum(['gameplay', 'systems', 'integration-verifier', 'asset', 'qa', 'evaluator', 'balance']),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  toolsAllowed: z.array(
    z.enum(['project', 'code', 'asset', 'playtest', 'eval', 'npm', 'git']),
  ),
  subsystemId: z.string().optional(),
  dataSchemaRefs: z.array(z.string()).optional(),
});

const ContentEntrySchema = z.object({
  schemaId: z.string(),
  filePath: z.string(),
  data: z.array(z.record(z.unknown())),
});

const AdvancedDesignerPlanSchema = z.object({
  gameTitle: z.string(),
  gameBrief: z.string(),
  genre: z.string(),
  coreLoop: z.string(),
  controls: z.array(z.string()),
  scenes: z.array(z.string()),
  milestoneScenes: z.array(z.object({
    sceneId: z.string(),
    label: z.string(),
    primaryAction: z.string().optional(),
    acceptanceCriteria: z.array(z.object({
      id: z.enum([
        'renders-visibly',
        'primary-action-visible',
        'progression-possible',
        'no-runtime-blocker',
      ]),
      description: z.string(),
    })),
  })).default([]),
  entities: z.array(z.string()),
  assets: z.array(z.string()),
  phases: z.array(
    z.object({
      phase: z.number().int().min(1).max(8),
      tasks: z.array(AdvancedDesignerTaskSchema),
    }),
  ),
  verificationSteps: z.array(VerificationStepSchema).default([]),
  contentManifest: z.array(ContentEntrySchema).default([]),
});

type AdvancedDesignerTask = z.infer<typeof AdvancedDesignerTaskSchema>;
type AdvancedDesignerPlan = z.infer<typeof AdvancedDesignerPlanSchema>;

// ---------------------------------------------------------------------------
// Task inflation — converts the minimal designer output to a full TaskState
// ---------------------------------------------------------------------------

function inflateAdvancedTask(t: AdvancedDesignerTask): TaskState {
  const now = new Date().toISOString();

  // Guarantee minimum tool access per role
  let toolsAllowed = [...t.toolsAllowed] as string[];

  const needsProjectAndNpm = ['gameplay', 'systems', 'integration-verifier', 'qa', 'evaluator', 'balance'] as const;
  if ((needsProjectAndNpm as readonly string[]).includes(t.role)) {
    if (!toolsAllowed.includes('project')) toolsAllowed = ['project', ...toolsAllowed];
    if (!toolsAllowed.includes('npm')) toolsAllowed = [...toolsAllowed, 'npm'];
  }
  // balance tasks also need eval for running analysis scripts
  if (t.role === 'balance' && !toolsAllowed.includes('eval')) {
    toolsAllowed = [...toolsAllowed, 'eval'];
  }

  return {
    id: t.id,
    phase: t.phase,
    role: t.role,
    status: 'pending',
    title: t.title,
    description: t.description,
    brief: t.description,
    acceptanceCriteria: t.acceptanceCriteria,
    dependencies: t.dependencies,
    toolsAllowed: toolsAllowed as ToolGroupName[],
    retries: 0,
    maxRetries: 3,
    context: {
      projectPath: '',
      gameSpec: '',
      relevantFiles: [],
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
      ...(t.subsystemId !== undefined ? { subsystemId: t.subsystemId } : {}),
      ...(t.dataSchemaRefs !== undefined ? { dataSchemaRefs: t.dataSchemaRefs } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Context builder — converts PreprocessedBrief to a prompt context block
// ---------------------------------------------------------------------------

function buildContextBlock(brief: PreprocessedBrief): string {
  const lines: string[] = [
    '## Game Analysis',
    `Title: ${brief.gameTitle}`,
    `Genre: ${brief.gameGenre}`,
    `Classification: ${brief.classification}`,
    `Summary: ${brief.summary}`,
    '',
  ];

  if (brief.extractedSubsystems.length > 0) {
    lines.push('## Subsystems', '');
    for (const s of brief.extractedSubsystems) {
      const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
      lines.push(`- **${s.name}** [id: ${s.id}]${deps}: ${s.description}`);
      if (s.modules.length > 0) lines.push(`  Modules: ${s.modules.join(', ')}`);
    }
    lines.push('');
  }

  if (brief.extractedSchemas.length > 0) {
    lines.push('## Data Schemas', '');
    for (const s of brief.extractedSchemas) {
      lines.push(`- **${s.name}** [id: ${s.id}] → ${s.filePath}`);
    }
    lines.push('');
  }

  if (brief.stateMachines.length > 0) {
    lines.push('## State Machines', '');
    for (const m of brief.stateMachines) {
      lines.push(`- **${m.name}** [id: ${m.id}]: ${m.description}`);
      lines.push(`  States: ${m.states.join(', ')}`);
    }
    lines.push('');
  }

  if (brief.eventTypes.length > 0) {
    lines.push('## Event Bus Event Types', '');
    lines.push(brief.eventTypes.join(', '));
    lines.push('');
  }

  if (brief.sprintPlan.length > 0) {
    lines.push('## Sprint Plan (map each sprint to a phase)', '');
    brief.sprintPlan.forEach((sprint, i) => lines.push(`Phase ${i + 1}: ${sprint}`));
    lines.push('');
  }

  if (brief.mvpFeatures.length > 0) {
    lines.push('## MVP Must-Have Features', '');
    brief.mvpFeatures.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }

  if (brief.stretchFeatures.length > 0) {
    lines.push('## Stretch (V2+) Features — do NOT plan tasks for these', '');
    brief.stretchFeatures.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Plan inflation — merges designer output with preprocessed data
// ---------------------------------------------------------------------------

function inflateAdvancedPlan(
  plan: AdvancedDesignerPlan,
  preprocessed: PreprocessedBrief,
): TaskPlan {
  const phasesWithIntegration = ensureIntegrationVerifierTasks(plan.phases);
  const architecture = buildArchitectureContract(preprocessed);

  // The TaskPlanSchema now accepts number phases and optional advanced fields
  const inflated = TaskPlanSchema.parse({
    gameTitle: plan.gameTitle,
    gameBrief: plan.gameBrief,
    genre: plan.genre,
    coreLoop: plan.coreLoop,
    controls: plan.controls,
    scenes: plan.scenes,
    milestoneScenes: ensureMilestoneScenes(plan.milestoneScenes ?? [], plan.scenes),
    entities: plan.entities,
    assets: plan.assets,
    phases: phasesWithIntegration.map((p) => ({
      phase: p.phase,
      tasks: p.tasks.map(inflateAdvancedTask),
    })),
    verificationSteps: plan.verificationSteps ?? [],
    subsystems: preprocessed.extractedSubsystems as SubsystemDef[],
    dataSchemas: preprocessed.extractedSchemas as DataSchemaDef[],
    contentManifest: (plan.contentManifest ?? []) as ContentEntry[],
    architecture,
  });

  return validateTaskPlan(inflated as TaskPlan);
}

function ensureMilestoneScenes(
  milestoneScenes: AdvancedDesignerPlan['milestoneScenes'],
  scenes: string[],
): MilestoneSceneDefinition[] {
  // Normalize what the model provided.
  const provided = new Map<string, MilestoneSceneDefinition>();
  for (const scene of milestoneScenes) {
    const normalized: MilestoneSceneDefinition = {
      sceneId: scene.sceneId,
      label: scene.label,
      acceptanceCriteria: ensureStandardCriteria(scene.acceptanceCriteria, scene.primaryAction),
    };
    if (scene.primaryAction !== undefined) {
      normalized.primaryAction = scene.primaryAction;
    }
    provided.set(scene.sceneId, normalized);
  }

  // Auto-fill milestones for every non-Boot scene that the model didn't cover.
  // This guarantees the plan-validation requirement (MainMenu/CharacterSelect/MapScene
  // milestones must exist when those scenes are present) holds even when the
  // model emits a partial milestoneScenes list.
  return scenes
    .filter((sceneId) => sceneId !== 'BootScene')
    .map((sceneId): MilestoneSceneDefinition => {
      const fromModel = provided.get(sceneId);
      if (fromModel !== undefined) return fromModel;

      const primaryAction = defaultPrimaryAction(sceneId);
      const normalized: MilestoneSceneDefinition = {
        sceneId,
        label: humanizeSceneId(sceneId),
        acceptanceCriteria: ensureStandardCriteria([], primaryAction),
      };
      if (primaryAction !== undefined) {
        normalized.primaryAction = primaryAction;
      }
      return normalized;
    });
}

function ensureStandardCriteria(
  criteria: Array<{ id: MilestoneSceneDefinition['acceptanceCriteria'][number]['id']; description: string }>,
  primaryAction?: string,
): MilestoneSceneDefinition['acceptanceCriteria'] {
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion.description]));
  const actionText = primaryAction ?? 'the primary progression action';

  return [
    {
      id: 'renders-visibly',
      description:
        byId.get('renders-visibly')
        ?? 'The scene renders visibly with its required UI region on-screen.',
    },
    {
      id: 'primary-action-visible',
      description:
        byId.get('primary-action-visible')
        ?? `${actionText} is visible when the scene loads.`,
    },
    {
      id: 'progression-possible',
      description:
        byId.get('progression-possible')
        ?? `${actionText} can be used to progress through the milestone flow.`,
    },
    {
      id: 'no-runtime-blocker',
      description:
        byId.get('no-runtime-blocker')
        ?? 'No runtime blocker prevents the scene from loading or advancing.',
    },
  ];
}

function humanizeSceneId(sceneId: string): string {
  return sceneId
    .replace(/Scene$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

function defaultPrimaryAction(sceneId: string): string | undefined {
  switch (sceneId) {
    case 'MainMenuScene':
      return 'Start New Run';
    case 'CharacterSelectScene':
      return 'Confirm Selection';
    case 'MapScene':
      return 'Map progression';
    case 'CombatScene':
      return 'Play a card or end turn';
    case 'CardRewardScene':
      return 'Choose a reward card';
    case 'ShopScene':
      return 'Buy or skip';
    case 'RestScene':
      return 'Rest or upgrade';
    case 'RunSummaryScene':
      return 'Return to menu';
    default:
      return undefined;
  }
}

function ensureIntegrationVerifierTasks(
  phases: AdvancedDesignerPlan['phases'],
): AdvancedDesignerPlan['phases'] {
  // Accumulate systems/gameplay tasks across phases so verifiers in later phases
  // (e.g. a final QA phase with no systems/gameplay tasks of their own) can still
  // be wired to the tasks they depend on from prior phases.
  const cumulativeSystemsOrGameplay: AdvancedDesignerTask[] = [];

  return phases.map((phase) => {
    const tasks = [...phase.tasks];
    const phaseSystemsOrGameplay = tasks.filter((task) => task.role === 'systems' || task.role === 'gameplay');
    const verifierTasks = tasks.filter((task) => task.role === 'integration-verifier');

    // Include this phase's tasks before computing deps so same-phase tasks are reachable.
    cumulativeSystemsOrGameplay.push(...phaseSystemsOrGameplay);

    if (verifierTasks.length > 0) {
      // Fix verifier deps using all systems/gameplay tasks available up to this phase.
      if (cumulativeSystemsOrGameplay.length > 0) {
        return {
          ...phase,
          tasks: verifierTasksHaveDependencies(tasks, cumulativeSystemsOrGameplay),
        };
      }
      return phase;
    }

    if (phaseSystemsOrGameplay.length === 0) {
      return phase;
    }

    const dependencyIds = phaseSystemsOrGameplay.map((task) => task.id);
    const subsystemId = inferSharedSubsystemId(phaseSystemsOrGameplay);
    const dataSchemaRefs = [...new Set(phaseSystemsOrGameplay.flatMap((task) => task.dataSchemaRefs ?? []))];

    tasks.push({
      id: `verify-integration-phase-${phase.phase}`,
      phase: phase.phase,
      role: 'integration-verifier',
      title: `Verify phase ${phase.phase} systems-gameplay integration`,
      description:
        'Trace EventBus, state machine, and content-loader wiring across the systems and gameplay tasks in this phase. Fix any missing registrations, scene hookups, or contract mismatches.',
      acceptanceCriteria: [
        'Every EventBus event consumed by scenes in this phase is emitted by systems code and subscribed with cleanup on scene shutdown',
        'Every state machine used by scenes in this phase is instantiated, transitioned from reachable triggers, and exposed through harness/debug state when relevant',
        'Every ContentLoader getter used by gameplay in this phase matches the on-disk JSON shape and required IDs',
      ],
      dependencies: dependencyIds,
      toolsAllowed: ['project', 'code', 'npm'],
      ...(subsystemId !== undefined ? { subsystemId } : {}),
      ...(dataSchemaRefs.length > 0 ? { dataSchemaRefs } : {}),
    });

    return { ...phase, tasks };
  });
}

function verifierTasksHaveDependencies(
  tasks: AdvancedDesignerPlan['phases'][number]['tasks'],
  systemsOrGameplay: AdvancedDesignerTask[],
): AdvancedDesignerPlan['phases'][number]['tasks'] {
  const dependencyIds = systemsOrGameplay.map((task) => task.id);

  return tasks.map((task) => {
    if (task.role !== 'integration-verifier') {
      return task;
    }

    const relevantDeps = systemsOrGameplay
      .filter((candidate) => {
        if (task.subsystemId === undefined) return true;
        return candidate.subsystemId === task.subsystemId;
      })
      .map((candidate) => candidate.id);

    const mergedDependencies = [...new Set([...task.dependencies, ...(relevantDeps.length > 0 ? relevantDeps : dependencyIds)])];
    return {
      ...task,
      dependencies: mergedDependencies,
      toolsAllowed: task.toolsAllowed.includes('npm') ? task.toolsAllowed : [...task.toolsAllowed, 'npm'],
    };
  });
}

function inferSharedSubsystemId(tasks: AdvancedDesignerTask[]): string | undefined {
  const ids = [...new Set(tasks.map((task) => task.subsystemId).filter((id): id is string => id !== undefined))];
  return ids.length === 1 ? ids[0] : undefined;
}

function buildArchitectureContract(preprocessed: PreprocessedBrief): ArchitectureContract {
  const eventTypes = [...new Set(preprocessed.eventTypes)];
  const stateMachines = preprocessed.stateMachines as StateMachineDef[];

  const subsystemApis: SubsystemApiDef[] = preprocessed.extractedSubsystems.map((subsystem) => {
    const subsystemText = `${subsystem.name} ${subsystem.description} ${subsystem.modules.join(' ')}`.toLowerCase();
    const exposedEvents = eventTypes.filter((eventName) => eventMatchesSubsystem(eventName, subsystemText));
    const stateMachineIds = stateMachines
      .filter((machine) => stateMachineMatchesSubsystem(machine, subsystemText))
      .map((machine) => machine.id);

    return {
      subsystemId: subsystem.id,
      subsystemName: subsystem.name,
      description: subsystem.description,
      dependencies: subsystem.dependencies,
      modules: subsystem.modules,
      exposedEvents,
      stateMachineIds,
      contentLoaderMethods: inferContentLoaderMethods(subsystemText),
    };
  });

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    eventTypes,
    stateMachines,
    subsystemApis,
  };
}

function eventMatchesSubsystem(eventName: string, subsystemText: string): boolean {
  const normalizedEvent = eventName.toLowerCase();
  return extractKeywords(normalizedEvent).some((keyword) => subsystemText.includes(keyword));
}

function stateMachineMatchesSubsystem(machine: StateMachineDef, subsystemText: string): boolean {
  const machineText = `${machine.id} ${machine.name} ${machine.description}`.toLowerCase();
  return extractKeywords(machineText).some((keyword) => subsystemText.includes(keyword));
}

function inferContentLoaderMethods(subsystemText: string): string[] {
  const methods = new Set<string>();
  if (subsystemText.includes('card')) methods.add('getCards');
  if (subsystemText.includes('enemy')) methods.add('getEnemies');
  if (subsystemText.includes('relic')) methods.add('getRelics');
  if (subsystemText.includes('encounter')) methods.add('getEncounters');
  if (subsystemText.includes('node') || subsystemText.includes('map')) methods.add('getMapNodes');
  if (subsystemText.includes('status')) methods.add('getStatuses');
  return [...methods];
}

function extractKeywords(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Creates an implementation plan from a preprocessed design document.
 *
 * Unlike the simple `createPlan()`, this function:
 * - Uses the ADVANCED_DESIGNER_SYSTEM_PROMPT with no hardcoded scene list
 * - Passes subsystems, schemas, state machines, and sprint plan as structured context
 * - Supports phases 1–8 and roles 'systems' / 'integration-verifier' / 'balance'
 * - Stamps the returned TaskPlan with mode:'advanced' and merges
 *   subsystems/dataSchemas from the preprocessed brief
 *
 * This should only be called when preprocessed.mode === 'advanced'.
 */
export async function createAdvancedPlan(
  preprocessed: PreprocessedBrief,
  chatModel?: BaseChatModel,
  onText?: (delta: string) => void,
): Promise<TaskPlan> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const model = chatModel ?? new ChatAnthropic({
    model: DEFAULT_MODEL,
    maxTokens: 32000,
    temperature: 0.4,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });

  const contextBlock = buildContextBlock(preprocessed);

  const userMessage =
    `${contextBlock}\n` +
    `## Original Design Document\n\n` +
    `${preprocessed.rawBrief}\n\n` +
    `---\n\n` +
    `Create a detailed implementation plan JSON for this game. ` +
    `Use the subsystem IDs, schema IDs, phase mapping, and MVP features above as your guide. ` +
    `Set "contentManifest" to an empty array [] — content data will be generated by implementation tasks, not here.\n\n` +
    `Your response MUST be a single JSON object with these top-level keys (in this order):\n` +
    `  "gameTitle", "gameBrief", "genre", "coreLoop", "controls", "scenes", "milestoneScenes", "entities", "assets", "phases", "verificationSteps", "contentManifest"\n\n` +
    `Do NOT return just a tasks array. Do NOT wrap the plan in another object. Do NOT include any prose, markdown, or code fences. ` +
    `Start your response with the character "{" and end with "}".`;

  const callbacks = onText ? [{ handleLLMNewToken: (token: string) => onText(token) }] : [];
  const messages = [new SystemMessage(ADVANCED_DESIGNER_SYSTEM_PROMPT), new HumanMessage(userMessage)];

  // Prefer structured output when the model supports it — eliminates the parse/retry path.
  if (typeof (model as unknown as Record<string, unknown>).withStructuredOutput === 'function') {
    type StructuredRunnable = { invoke(msgs: unknown[], opts?: unknown): Promise<AdvancedDesignerPlan> };
    const structured = (model as unknown as { withStructuredOutput(s: unknown): StructuredRunnable })
      .withStructuredOutput(AdvancedDesignerPlanSchema);
    const plan = await withRetry(
      () => structured.invoke(messages, { callbacks, runName: 'advanced-plan', tags: ['planning', 'designer'] }),
      DEFAULT_RETRY_POLICY,
    );
    return inflateAdvancedPlan(plan, preprocessed);
  }

  // Text-parse fallback (used by test mocks that don't implement withStructuredOutput).
  const firstResponse = await withRetry(
    () => model.invoke(messages, { callbacks, runName: 'advanced-plan', tags: ['planning', 'designer'] }),
    DEFAULT_RETRY_POLICY,
  );

  if (wasTruncated(firstResponse)) {
    throw new Error(
      `Advanced Designer agent response was truncated by max_tokens (32000). ` +
      `The plan is too large for the current token budget. ` +
      `Consider simplifying the brief or reducing MVP features.`,
    );
  }

  const text = extractText(typeof firstResponse.content === 'string' ? firstResponse.content : JSON.stringify(firstResponse.content));
  const planResult = parseDesignerResponse(text);

  if (planResult.success) {
    return inflateAdvancedPlan(planResult.data, preprocessed);
  }

  // One retry with validation errors fed back
  const errorSummary = planResult.issues
    .slice(0, 10)
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  const retryResponse = await withRetry(
    () => model.invoke([
      new SystemMessage(ADVANCED_DESIGNER_SYSTEM_PROMPT),
      new HumanMessage(userMessage),
      new AIMessage(text),
      new HumanMessage(
        `Your previous response failed schema validation:\n${errorSummary}\n\n` +
        `Return the COMPLETE plan as a single JSON object with ALL of these top-level keys present:\n` +
        `{\n` +
        `  "gameTitle": "<short evocative title>",\n` +
        `  "gameBrief": "<expanded 3-5 sentence description>",\n` +
        `  "genre": "deckbuilder-roguelike",\n` +
        `  "coreLoop": "<one sentence>",\n` +
        `  "controls": [ "<string>", ... ],\n` +
        `  "scenes": [ "BootScene", "MainMenuScene", "MapScene", "CombatScene", "CardRewardScene", "ShopScene", "RestScene", "RunSummaryScene" ],\n` +
        `  "milestoneScenes": [ ... ],\n` +
        `  "entities": [ "<string>", ... ],\n` +
        `  "assets": [ "<string>", ... ],\n` +
        `  "phases": [ { "phase": 1, "tasks": [ ... ] }, ... ],\n` +
        `  "verificationSteps": [ ... ],\n` +
        `  "contentManifest": []\n` +
        `}\n\n` +
        `Do NOT return just an array. Do NOT omit any of these keys. Return ONLY the JSON object — start with "{" and end with "}".`,
      ),
    ], { runName: 'advanced-plan-retry', tags: ['planning', 'designer', 'retry'] }),
    DEFAULT_RETRY_POLICY,
  );

  if (wasTruncated(retryResponse)) {
    throw new Error(
      `Advanced Designer retry response was truncated by max_tokens (32000). ` +
      `The plan is too large for the current token budget.`,
    );
  }

  const retryText = extractText(typeof retryResponse.content === 'string' ? retryResponse.content : JSON.stringify(retryResponse.content));
  const retryResult = parseDesignerResponse(retryText);

  if (retryResult.success) {
    return inflateAdvancedPlan(retryResult.data, preprocessed);
  }

  // Both attempts failed — surface a clear error
  const allErrors = retryResult.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Advanced Designer agent returned invalid plan twice:\n${allErrors}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParseSuccess = { success: true; data: AdvancedDesignerPlan };
type ParseFailure = { success: false; issues: Array<{ path: string[]; message: string }> };
type ParseOutcome = ParseSuccess | ParseFailure;

/**
 * Detect Anthropic / OpenAI max_tokens cutoffs in the LangChain response object.
 * When the model hits the cap mid-output, the JSON is truncated and downstream
 * parsing fails with a cryptic SyntaxError. We surface a clearer message instead.
 */
function wasTruncated(response: unknown): boolean {
  if (response === null || typeof response !== 'object') return false;
  const meta = (response as { response_metadata?: Record<string, unknown> }).response_metadata;
  if (meta === undefined) return false;
  const stop = meta['stop_reason'] ?? meta['finish_reason'];
  return stop === 'max_tokens' || stop === 'length';
}

function parseDesignerResponse(raw: string): ParseOutcome {
  const candidates = extractJsonCandidates(raw);
  const rawTargets = candidates.length > 0 ? candidates : [extractJson(raw)];

  // Prefer object candidates — the plan schema is an object, not an array.
  // If the model emits an example JSON array (e.g. acceptanceCriteria) before
  // the actual plan object, source-order iteration would fail on the array first.
  const parseTargets = [
    ...rawTargets.filter((c) => c.trimStart().startsWith('{')),
    ...rawTargets.filter((c) => !c.trimStart().startsWith('{')),
  ];

  let fallbackIssues: Array<{ path: string[]; message: string }> | undefined;

  for (const candidate of parseTargets) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const result = AdvancedDesignerPlanSchema.safeParse(parsed);
    if (result.success) return { success: true, data: result.data };

    // Only collect issues from object-shaped candidates — array root-level
    // mismatches aren't useful feedback for the model on retry.
    if (fallbackIssues === undefined && candidate.trimStart().startsWith('{')) {
      fallbackIssues = result.error.issues.map((i) => ({
        path: i.path.map(String),
        message: i.message,
      }));
    }
  }

  if (fallbackIssues !== undefined) {
    return {
      success: false,
      issues: fallbackIssues,
    };
  }

  // No object candidate was found at all — the response was prose-only or an array.
  if (parseTargets.some((c) => c.trimStart().startsWith('['))) {
    return {
      success: false,
      issues: [{
        path: [],
        message: 'Response was a JSON array, not the expected plan object. Return a single JSON object with top-level keys "gameTitle", "genre", "phases", etc. — not just an array.',
      }],
    };
  }

  return {
    success: false,
    issues: [{ path: [], message: `Invalid JSON: ${raw.slice(0, 120)}` }],
  };
}
