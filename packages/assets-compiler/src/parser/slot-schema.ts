import { z } from 'zod';
import type { AttackArchetype, OptionalPart } from '../types/enemy-spec.js';

const ATTACK: readonly AttackArchetype[] = ['melee-fast', 'melee-heavy', 'ranged-cast', 'ranged-throw'];
const PARTS: readonly OptionalPart[] = ['weapon', 'cloak', 'shield', 'tail', 'wings'];

export const SlotSchema = z.object({
  id: z.string().min(1).max(48),
  name: z.string().min(1).max(48),
  palette: z.array(z.string()).min(1).max(5),
  materials: z.array(z.string()).max(5),
  mood: z.string().min(1).max(24),
  attackArchetype: z.enum([ATTACK[0], ...ATTACK.slice(1)] as [AttackArchetype, ...AttackArchetype[]]),
  optionalParts: z.array(z.enum([PARTS[0], ...PARTS.slice(1)] as [OptionalPart, ...OptionalPart[]])).max(5),
});

export type SlotData = z.infer<typeof SlotSchema>;
