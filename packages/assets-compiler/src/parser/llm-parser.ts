import { ClaudeClient } from '@agent-harness/core';
import { SlotSchema, type SlotData } from './slot-schema.js';

const SYSTEM_PROMPT = `You convert short enemy descriptions for a 2D fantasy deckbuilder into a strict JSON spec. \
Output a single JSON object — no prose, no code fence — matching this schema:

{
  "id": "<lower_snake_case slug, <=48 chars, derived from the description>",
  "name": "<Title Case display name, <=48 chars>",
  "palette": ["<color word>", "<color word>", ...]   // 1-5 entries; lowercase common words like "rust", "bone", "ash", "ember", "moss", "shadow", "crimson", "azure", "gold"
  "materials": ["<material>", ...],                   // 0-5 entries; "leather", "iron", "steel", "bronze", "bone", "cloth", "fur", "scale", "plate", "wood", "stone", "flesh"
  "mood": "<one of: menacing, feral, stoic, neutral>",
  "attackArchetype": "<one of: melee-fast, melee-heavy, ranged-cast, ranged-throw>",
  "optionalParts": ["<part>", ...]                    // subset of: weapon, cloak, shield, tail, wings
}

Rules:
- Choose attackArchetype from these cues: spell/wizard/mage→ranged-cast; bow/throw/spear→ranged-throw; \
heavy/giant/hammer/club/brute→melee-heavy; otherwise melee-fast.
- Include "weapon" in optionalParts whenever the description mentions a wielded item (sword, staff, club, etc.).
- Pick concrete palette words; do not invent obscure color names.
- "id" must be derived from the description, not random.`;

export interface LlmParseOptions {
  prompt: string;
  signal?: AbortSignal;
  /** Override model. Default: claude-haiku for speed/cost. */
  model?: string;
  /** Override Claude client (for tests). */
  client?: ClaudeClient;
}

/**
 * Parse an enemy description into structured slots via Claude.
 * Throws if the LLM returns malformed JSON or fails Zod validation —
 * callers should catch and fall back to the rule-based parser.
 */
export async function llmParseSlots(opts: LlmParseOptions): Promise<SlotData> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  const client = opts.client ?? new ClaudeClient();
  const result = await client.sendMessage({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: opts.prompt }],
    model: opts.model ?? 'claude-haiku-4-5-20251001',
    maxTokens: 512,
    temperature: 0,
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  });

  const rawContent = result.message.content;
  const text = (typeof rawContent === 'string'
    ? rawContent
    : rawContent.map((b) => (b as { text?: string }).text ?? '').join('')
  ).trim();
  // Strip an optional code fence the model occasionally adds despite the prompt.
  const fenceStripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(fenceStripped);
  } catch (err) {
    throw new Error(`LLM parser: response was not JSON: ${(err as Error).message}; got: ${fenceStripped.slice(0, 200)}`);
  }
  return SlotSchema.parse(raw);
}
