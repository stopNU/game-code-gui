import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, '../../../../templates');

export interface TemplateManifest {
  /** Unique template identifier */
  id: string;
  name: string;
  /** Game genres this template handles */
  genres: string[];
  /** Absolute path to the template directory */
  templateDir: string;
  /** Capabilities this template provides */
  features: string[];
}

const TEMPLATES: TemplateManifest[] = [
  {
    id: 'deckbuilder',
    name: 'Godot 4 Deckbuilder Roguelike',
    genres: [
      'deckbuilder', 'deckbuilder-roguelike', 'roguelike', 'card-game',
      'turn-based-strategy', 'turn-based', 'rpg', 'strategy',
    ],
    templateDir: resolve(TEMPLATES_ROOT, 'deckbuilder'),
    features: ['godot4', 'gdscript', 'event-bus', 'content-loader', 'run-state', 'harness-plugin'],
  },
];

/**
 * Always returns the deckbuilder template — the only template in this harness.
 */
export function selectTemplate(_genre?: string, _mode?: string): TemplateManifest {
  return TEMPLATES[0]!;
}

/** Get a template by its ID. Throws if not found. */
export function getTemplate(id: string): TemplateManifest {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Template not found: ${id}`);
  return found;
}

/** All registered templates. */
export function listTemplates(): TemplateManifest[] {
  return [...TEMPLATES];
}
