import { z } from 'zod';
import { createHash } from 'crypto';
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_MODEL } from '../types/agent.js';
import { BRIEF_ANALYST_SYSTEM_PROMPT } from '../claude/roles/brief-analyst.js';
import type { SubsystemDef, DataSchemaDef, StateMachineDef as TaskStateMachineDef } from '../types/task.js';

export type StateMachineDef = TaskStateMachineDef;
import { extractJson, extractText } from './extract.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BriefSection {
  title: string;
  type: 'mechanics' | 'data-schema' | 'architecture' | 'content' | 'balance' | 'ux' | 'meta';
  summary: string;
}

export interface PreprocessedBrief {
  rawBrief: string;
  /** Always 'advanced' — deckbuilder harness only uses advanced mode. */
  mode: 'advanced';
  /** Always 'data-driven' — deckbuilder harness only generates data-driven games. */
  classification: 'data-driven';
  gameGenre: string;
  gameTitle: string;
  summary: string;
  /** Named subsystems decomposed from the architecture in the brief. */
  extractedSubsystems: SubsystemDef[];
  /** Data schemas defined or implied by the brief. */
  extractedSchemas: DataSchemaDef[];
  /** Sprint descriptions extracted or inferred from the brief. */
  sprintPlan: string[];
  /** Core must-have features for the MVP. */
  mvpFeatures: string[];
  /** Nice-to-have features to implement post-MVP. */
  stretchFeatures: string[];
  /** Event bus event names found in the brief. */
  eventTypes: string[];
  /** State machines described in the brief. */
  stateMachines: StateMachineDef[];
  /** Section-level summaries from the brief. */
  sections: BriefSection[];
}

// ---------------------------------------------------------------------------
// Zod response schema (what the analyst agent must return)
// ---------------------------------------------------------------------------

const SubsystemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dependencies: z.array(z.string()),
  modules: z.array(z.string()),
});

const DataSchemaSchema = z.object({
  id: z.string(),
  name: z.string(),
  filePath: z.string(),
  schema: z.record(z.unknown()),
  examples: z.array(z.record(z.unknown())),
});

const StateMachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  states: z.array(z.string()),
  description: z.string(),
});

const SectionSchema = z.object({
  title: z.string(),
  type: z.enum(['mechanics', 'data-schema', 'architecture', 'content', 'balance', 'ux', 'meta']),
  summary: z.string(),
});

const AnalystResponseSchema = z.object({
  mode: z.enum(['simple', 'advanced']).optional(),
  classification: z.enum(['physics-based', 'data-driven', 'hybrid']).optional(),
  gameGenre: z.string(),
  gameTitle: z.string(),
  summary: z.string(),
  subsystems: z.array(SubsystemSchema).default([]),
  dataSchemas: z.array(DataSchemaSchema).default([]),
  sprintPlan: z.array(z.string()).default([]),
  mvpFeatures: z.array(z.string()).default([]),
  stretchFeatures: z.array(z.string()).default([]),
  eventTypes: z.array(z.string()).default([]),
  stateMachines: z.array(StateMachineSchema).default([]),
  sections: z.array(SectionSchema).default([]),
});

type AnalystResponse = z.infer<typeof AnalystResponseSchema>;


// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

// Bump this when BRIEF_ANALYST_SYSTEM_PROMPT changes in a way that would alter results.
const CACHE_VERSION = 1;
const CACHE_DIR = join(tmpdir(), 'agent-harness-cache', 'brief-preprocessor');

function briefCacheKey(brief: string): string {
  return createHash('sha256').update(`v${CACHE_VERSION}:${brief}`).digest('hex');
}

/** Returns the cached result (without rawBrief) or null on miss. */
async function readBriefCache(key: string): Promise<Omit<PreprocessedBrief, 'rawBrief'> | null> {
  try {
    const data = await fsReadFile(join(CACHE_DIR, `${key}.json`), 'utf8');
    return JSON.parse(data) as Omit<PreprocessedBrief, 'rawBrief'>;
  } catch {
    return null;
  }
}

/** Writes result to cache, silently ignoring failures. */
async function writeBriefCache(key: string, result: PreprocessedBrief): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const { rawBrief: _, ...cacheable } = result;
    await fsWriteFile(join(CACHE_DIR, `${key}.json`), JSON.stringify(cacheable));
  } catch {
    // Cache write failure is non-fatal.
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Preprocesses a game brief or design document before it reaches the planner.
 *
 * Sends the brief to the Brief Analyst agent which extracts subsystems,
 * data schemas, sprint plans, event types, and state machines from the document.
 * Always returns mode: 'advanced' and classification: 'data-driven'.
 */
export async function preprocessBrief(
  brief: string,
  chatModel?: BaseChatModel,
  onText?: (delta: string) => void,
): Promise<PreprocessedBrief> {
  // Cache hit — avoid redundant LLM call for identical briefs
  const cacheKey = briefCacheKey(brief);
  const cached = await readBriefCache(cacheKey);
  if (cached) {
    return { ...cached, rawBrief: brief };
  }

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const model = chatModel ?? new ChatAnthropic({
    model: DEFAULT_MODEL,
    maxTokens: 16000,
    temperature: 0.3,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });

  const userPrompt =
    `Analyze the following game design document and return the structured JSON as specified.\n\n` +
    `Document:\n${brief}`;

  const callbacks = onText ? [{ handleLLMNewToken: (token: string) => onText(token) }] : [];

  const firstResponse = await model.invoke(
    [new SystemMessage(BRIEF_ANALYST_SYSTEM_PROMPT), new HumanMessage(userPrompt)],
    { callbacks },
  );

  const text = extractText(typeof firstResponse.content === 'string' ? firstResponse.content : JSON.stringify(firstResponse.content));
  const analysisResult = parseAnalystResponse(text);

  if (analysisResult.success) {
    const result = toPreprocessedBrief(brief, analysisResult.data);
    await writeBriefCache(cacheKey, result);
    return result;
  }

  // One retry with validation errors fed back
  const errorSummary = analysisResult.issues
    .slice(0, 8)
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  const retryResponse = await model.invoke([
    new SystemMessage(BRIEF_ANALYST_SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
    new AIMessage(text),
    new HumanMessage(
      `Your response failed schema validation. Fix these errors and return corrected JSON only:\n` +
      errorSummary,
    ),
  ]);

  const retryText = extractText(typeof retryResponse.content === 'string' ? retryResponse.content : JSON.stringify(retryResponse.content));
  const retryResult = parseAnalystResponse(retryText);

  if (retryResult.success) {
    const result = toPreprocessedBrief(brief, retryResult.data);
    await writeBriefCache(cacheKey, result);
    return result;
  }

  // If both attempts fail, fall back to a simple classification so the
  // pipeline doesn't hard-crash — the advanced planner will work with less context.
  const allIssues = retryResult.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(
    '[brief-preprocessor] Analyst returned invalid structured output twice.\n' +
    'Refusing to fall back to simple mode because that can route data-driven games into the wrong pipeline.\n' +
    allIssues,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParseSuccess = { success: true; data: AnalystResponse };
type ParseFailure = { success: false; issues: Array<{ path: string[]; message: string }> };
type ParseOutcome = ParseSuccess | ParseFailure;

function parseAnalystResponse(raw: string): ParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return {
      success: false,
      issues: [{ path: [], message: `Invalid JSON: ${raw.slice(0, 120)}` }],
    };
  }

  const result = AnalystResponseSchema.safeParse(parsed);
  if (result.success) return { success: true, data: result.data };

  return {
    success: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.map(String),
      message: i.message,
    })),
  };
}

function toPreprocessedBrief(rawBrief: string, data: AnalystResponse): PreprocessedBrief {
  return {
    rawBrief,
    mode: 'advanced',
    classification: 'data-driven',
    gameGenre: data.gameGenre,
    gameTitle: data.gameTitle,
    summary: data.summary,
    extractedSubsystems: data.subsystems as SubsystemDef[],
    extractedSchemas: data.dataSchemas as DataSchemaDef[],
    sprintPlan: data.sprintPlan,
    mvpFeatures: data.mvpFeatures,
    stretchFeatures: data.stretchFeatures,
    eventTypes: data.eventTypes,
    stateMachines: data.stateMachines,
    sections: data.sections,
  };
}
