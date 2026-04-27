import type { AttackArchetype, EnemySpec, OptionalPart } from '../types/enemy-spec.js';

/**
 * Phase 1 prompt parser: deterministic, rule-based.
 * Phase 2 will swap in an LLM-backed parser via @agent-harness/core.
 */

const ATTACK_KEYWORDS: Array<[AttackArchetype, RegExp]> = [
  ['ranged-cast', /\b(cast|spell|magic|wizard|mage|caster|sorcer|witch|warlock|shaman)/i],
  ['ranged-throw', /\b(throw|thrown|bow|arrow|archer|sling|spit|spear)/i],
  ['melee-heavy', /\b(heavy|slow|hammer|club|axe|smash|crush|tank|brute|giant)/i],
  ['melee-fast', /\b(fast|quick|nimble|dagger|knife|swift|shadow|assassin)/i],
];

const OPTIONAL_PART_KEYWORDS: Array<[OptionalPart, RegExp]> = [
  ['weapon', /\b(sword|axe|hammer|staff|spear|club|dagger|wand|bow|mace|scepter)/i],
  ['cloak', /\b(cloak|robe|cape|hood|mantle)/i],
  ['shield', /\b(shield|buckler)/i],
  ['tail', /\btail/i],
  ['wings', /\bwings?\b/i],
];

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'enemy';
}

function detectAttackArchetype(prompt: string): AttackArchetype {
  for (const [archetype, re] of ATTACK_KEYWORDS) {
    if (re.test(prompt)) return archetype;
  }
  return 'melee-fast';
}

function detectOptionalParts(prompt: string): OptionalPart[] {
  const out: OptionalPart[] = [];
  for (const [part, re] of OPTIONAL_PART_KEYWORDS) {
    if (re.test(prompt)) out.push(part);
  }
  return out;
}

function detectPalette(prompt: string): string[] {
  const colors = ['rust', 'bone', 'soot', 'ember', 'ash', 'moss', 'jade', 'crimson',
    'azure', 'gold', 'silver', 'shadow', 'blood', 'ivory', 'obsidian'];
  const found = colors.filter((c) => new RegExp(`\\b${c}`, 'i').test(prompt));
  return found.length > 0 ? found : ['shadow', 'bone'];
}

function detectMaterials(prompt: string): string[] {
  const mats = ['leather', 'iron', 'steel', 'bronze', 'bone', 'cloth', 'fur', 'scale',
    'plate', 'wood', 'stone', 'flesh', 'rust'];
  return mats.filter((m) => new RegExp(`\\b${m}`, 'i').test(prompt));
}

function detectMood(prompt: string): string {
  if (/\b(menacing|sinister|evil|dark|grim|dread)/i.test(prompt)) return 'menacing';
  if (/\b(fierce|wild|feral|savage|raging|fury)/i.test(prompt)) return 'feral';
  if (/\b(noble|stoic|ancient|wise|regal)/i.test(prompt)) return 'stoic';
  return 'neutral';
}

export interface ParseOptions {
  prompt: string;
  templateId?: 'humanoid';
  id?: string;
  name?: string;
  seed?: number;
  overrides?: Partial<Pick<EnemySpec, 'palette' | 'materials' | 'mood' | 'attackArchetype' | 'optionalParts'>>;
}

export function parsePrompt(opts: ParseOptions): EnemySpec {
  const prompt = opts.prompt.trim();
  if (!prompt) {
    throw new Error('parsePrompt: prompt is empty');
  }
  const o = opts.overrides ?? {};
  const id = opts.id ?? slugify(prompt.split(/[,.]/)[0] ?? prompt);
  const name = opts.name ?? id.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ');
  return {
    id,
    name,
    prompt,
    templateId: opts.templateId ?? 'humanoid',
    palette: o.palette ?? detectPalette(prompt),
    materials: o.materials ?? detectMaterials(prompt),
    mood: o.mood ?? detectMood(prompt),
    attackArchetype: o.attackArchetype ?? detectAttackArchetype(prompt),
    optionalParts: o.optionalParts ?? detectOptionalParts(prompt),
    seed: opts.seed ?? hashSeed(prompt),
  };
}
