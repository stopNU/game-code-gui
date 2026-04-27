export type AttackArchetype = 'melee-fast' | 'melee-heavy' | 'ranged-cast' | 'ranged-throw';

export type OptionalPart = 'weapon' | 'cloak' | 'shield' | 'tail' | 'wings';

export interface EnemySpec {
  /** Stable identifier used for filenames and Godot node names. Slug-safe. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Free-text source prompt. */
  prompt: string;
  /** Anatomy template id. MVP supports 'humanoid' only. */
  templateId: 'humanoid';
  /** Palette descriptors (used by image-gen + meta). */
  palette: string[];
  /** Material descriptors (rust, bone, leather, etc.). */
  materials: string[];
  /** Mood / vibe descriptor. */
  mood: string;
  /** Archetype controls motion timing. */
  attackArchetype: AttackArchetype;
  /** Optional parts that should be present on the rig. */
  optionalParts: OptionalPart[];
  /** Deterministic seed. Default = hash(prompt). */
  seed: number;
}
