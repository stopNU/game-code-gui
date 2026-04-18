import { copy, ensureDir } from 'fs-extra';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the monorepo root (4 levels up from dist/scaffold). */
const HARNESS_ROOT = resolve(__dirname, '../../../../');
const HARNESS_CLI_PATH = resolve(HARNESS_ROOT, 'apps/cli/bin/game-harness.js');
import Handlebars from 'handlebars';
import type {
  TaskPlan,
  DataSchemaDef,
  SubsystemDef,
  PreprocessedBrief,
  AdvancedSharedContext,
} from '@agent-harness/core';
import type { GodotProject } from '../types/project.js';
import { selectTemplate } from './template-registry.js';
import { mergeStarterScenes } from './starter-scenes.js';
import { getDefaultRuntimeLayoutConfig } from '../build/runtime-layout.js';
import { writeRuntimeManifest } from '../build/runtime-manifest.js';

export interface ScaffoldOptions {
  outputPath: string;
  plan: TaskPlan;
  preprocessedBrief?: PreprocessedBrief;
}

export async function scaffoldGame(opts: ScaffoldOptions): Promise<GodotProject> {
  const { outputPath, plan } = opts;
  const scaffoldScenes = mergeStarterScenes(plan.scenes);
  const scaffoldPlan: TaskPlan = {
    ...plan,
    scenes: scaffoldScenes,
  };

  await ensureDir(outputPath);

  const template = selectTemplate(scaffoldPlan.genre);
  await copy(template.templateDir, outputPath, { overwrite: true });

  const project: GodotProject = {
    id: toKebab(scaffoldPlan.gameTitle),
    path: outputPath,
    title: scaffoldPlan.gameTitle,
    version: '0.1.0',
    scenes: scaffoldScenes,
    runtimeLayout: getDefaultRuntimeLayoutConfig().canonicalLayoutId,
  };

  const hbsContext = buildHandlebarsContext(scaffoldPlan, project);

  // Interpolate all templatable files including Godot-specific extensions
  const files = await glob('**/*.{gd,tscn,godot,cfg,json,md}', {
    cwd: outputPath,
    ignore: ['node_modules/**', '.godot/**', 'builds/**'],
    absolute: false,
  });

  for (const file of files) {
    const fullPath = join(outputPath, file);
    try {
      const raw = await readFile(fullPath, 'utf8');
      const tmpl = Handlebars.compile(raw, { noEscape: true });
      await writeFile(fullPath, tmpl(hbsContext), 'utf8');
    } catch {
      // Binary or unreadable file — skip
    }
  }

  // Write task plan, memory, and harness config
  await writeFile(
    join(outputPath, 'harness', 'tasks.json'),
    JSON.stringify(scaffoldPlan, null, 2),
    'utf8',
  );
  await writeFile(
    join(outputPath, 'harness', 'memory.json'),
    JSON.stringify(
      { version: '1.0.0', projectId: project.id, entries: [], lastUpdated: new Date().toISOString() },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(
    join(outputPath, 'harness', 'config.json'),
    JSON.stringify(
      {
        harnessRoot: HARNESS_ROOT,
        harnessCliPath: HARNESS_CLI_PATH,
        templateId: template.id,
        criticalFlowConfig: 'res://harness/critical-flow.json',
        runtimeLayout: getDefaultRuntimeLayoutConfig(),
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );

  // Write game-spec.md (overwrite the template placeholder)
  await writeFile(
    join(outputPath, 'docs', 'game-spec.md'),
    buildGameSpec(scaffoldPlan),
    'utf8',
  );

  await scaffoldAdvancedExtras(outputPath, scaffoldPlan, project, opts.preprocessedBrief);
  await writeRuntimeManifest(outputPath);

  return project;
}

// ---------------------------------------------------------------------------
// Advanced scaffolding — scene stubs, schema files, content files
// ---------------------------------------------------------------------------

async function scaffoldAdvancedExtras(
  outputPath: string,
  plan: TaskPlan,
  _project: GodotProject,
  preprocessedBrief?: PreprocessedBrief,
): Promise<void> {
  // Write data schema files
  const schemasDir = join(outputPath, 'src', 'data', 'schemas');
  await mkdir(schemasDir, { recursive: true });
  for (const schema of (plan.dataSchemas ?? []) as DataSchemaDef[]) {
    const schemaFile = join(outputPath, schema.filePath);
    await mkdir(dirname(schemaFile), { recursive: true });
    await writeFile(schemaFile, JSON.stringify(schema.schema, null, 2), 'utf8');
  }

  // Write content manifest files (seeded with example data from the plan)
  const contentDir = join(outputPath, 'src', 'data', 'content');
  await mkdir(contentDir, { recursive: true });
  for (const entry of (plan.contentManifest ?? [])) {
    const contentFile = join(outputPath, entry.filePath);
    await mkdir(dirname(contentFile), { recursive: true });
    // Only write if file doesn't already exist (agents fill this in later)
    try {
      await readFile(contentFile, 'utf8');
      // File exists — don't overwrite
    } catch {
      await writeFile(contentFile, JSON.stringify(entry.data, null, 2), 'utf8');
    }
  }

  // Write architecture.md
  const subsystems = (plan.subsystems ?? []) as SubsystemDef[];
  if (subsystems.length > 0) {
    const archMd = buildArchitectureDoc(plan, subsystems);
    await writeFile(join(outputPath, 'docs', 'architecture.md'), archMd, 'utf8');
  }

  if (plan.architecture !== undefined) {
    await writeFile(
      join(outputPath, 'docs', 'architecture.json'),
      JSON.stringify(plan.architecture, null, 2),
      'utf8',
    );
  }

  const advancedContext = buildAdvancedSharedContext(plan, preprocessedBrief);
  await writeFile(
    join(outputPath, 'docs', 'advanced-context.json'),
    JSON.stringify(advancedContext, null, 2),
    'utf8',
  );
}

function buildAdvancedSharedContext(
  plan: TaskPlan,
  preprocessedBrief?: PreprocessedBrief,
): AdvancedSharedContext {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    gameTitle: preprocessedBrief?.gameTitle ?? plan.gameTitle,
    gameGenre: preprocessedBrief?.gameGenre ?? plan.genre,
    gameBrief: preprocessedBrief?.rawBrief ?? plan.gameBrief,
    summary: preprocessedBrief?.summary ?? plan.coreLoop,
    ...(preprocessedBrief !== undefined ? { classification: preprocessedBrief.classification } : {}),
    subsystems: preprocessedBrief?.extractedSubsystems ?? plan.subsystems ?? [],
    dataSchemas: preprocessedBrief?.extractedSchemas ?? plan.dataSchemas ?? [],
    eventTypes: preprocessedBrief?.eventTypes ?? plan.architecture?.eventTypes ?? [],
    stateMachines: preprocessedBrief?.stateMachines ?? plan.architecture?.stateMachines ?? [],
    sprintPlan: preprocessedBrief?.sprintPlan ?? [],
    mvpFeatures: preprocessedBrief?.mvpFeatures ?? [],
    stretchFeatures: preprocessedBrief?.stretchFeatures ?? [],
  };
}

// ---------------------------------------------------------------------------
// Handlebars context builder
// ---------------------------------------------------------------------------

function buildHandlebarsContext(
  plan: TaskPlan,
  project: GodotProject,
): Record<string, unknown> {
  const nonBootScenes = plan.scenes.filter((s) => s !== 'BootScene');
  const firstScene = nonBootScenes[0] ?? 'MainMenuScene';

  return {
    gameTitle: plan.gameTitle,
    gameBrief: plan.gameBrief,
    genre: plan.genre,
    coreLoop: plan.coreLoop,
    gameId: project.id,
    version: project.version,
    scenes: plan.scenes,
    entities: plan.entities,
    assets: plan.assets,
    controls: plan.controls,
    generatedAt: new Date().toISOString(),
    extraScenes: nonBootScenes,
    firstScene,
    subsystems: plan.subsystems ?? [],
    dataSchemas: plan.dataSchemas ?? [],
    eventTypes: extractEventTypes(plan),
  };
}

function extractEventTypes(plan: TaskPlan): string[] {
  if (plan.architecture !== undefined && plan.architecture.eventTypes.length > 0) {
    return plan.architecture.eventTypes;
  }
  return [
    'card_played', 'card_drawn', 'card_discarded', 'card_exhausted',
    'turn_started', 'turn_ended',
    'damage_dealt', 'damage_taken', 'block_gained',
    'status_applied', 'status_removed', 'status_ticked',
    'enemy_died', 'combat_started', 'combat_ended',
    'node_visited', 'run_started', 'run_ended',
    'gold_gained', 'card_reward_offered', 'relic_acquired',
  ];
}

// ---------------------------------------------------------------------------
// Doc builders
// ---------------------------------------------------------------------------

function buildGameSpec(plan: TaskPlan): string {
  const milestoneScenes = plan.milestoneScenes ?? [];
  return `# ${plan.gameTitle}

## Brief
${plan.gameBrief}

## Genre
${plan.genre}

## Core Loop
${plan.coreLoop}

## Controls
${plan.controls.map((c) => `- ${c}`).join('\n')}

## Scenes
${plan.scenes.map((s) => `- ${s}`).join('\n')}

## Milestone Scene Acceptance
${milestoneScenes.length > 0 ? milestoneScenes.map((scene) => {
  const header = `### ${scene.label} (\`${scene.sceneId}\`)`;
  const action = scene.primaryAction !== undefined
    ? `Primary action: ${scene.primaryAction}`
    : 'Primary action: not specified';
  const criteria = scene.acceptanceCriteria
    .map((criterion) => `- ${criterion.id}: ${criterion.description}`)
    .join('\n');
  return `${header}\n${action}\n${criteria}`;
}).join('\n\n') : '- No milestone scenes were specified in the provided plan.'}

## Entities / Systems
${plan.entities.map((e) => `- ${e}`).join('\n')}

## Assets
${plan.assets.map((a) => `- ${a}`).join('\n')}

---
*Generated by game-harness on ${new Date().toISOString()}*
`;
}

function buildArchitectureDoc(plan: TaskPlan, subsystems: SubsystemDef[]): string {
  const lines = [
    `# ${plan.gameTitle} — Architecture`,
    '',
    '## Module Map',
    '',
  ];

  for (const s of subsystems) {
    lines.push(`### ${s.name} (\`${s.id}\`)`);
    lines.push(s.description);
    if (s.modules.length > 0) {
      lines.push(`**Modules:** ${s.modules.join(', ')}`);
    }
    if (s.dependencies.length > 0) {
      lines.push(`**Depends on:** ${s.dependencies.join(', ')}`);
    }
    lines.push('');
  }

  if ((plan.dataSchemas ?? []).length > 0) {
    lines.push('## Data Schemas', '');
    for (const s of (plan.dataSchemas ?? []) as DataSchemaDef[]) {
      lines.push(`- **${s.name}** → \`${s.filePath}\``);
    }
    lines.push('');
  }

  lines.push(`---\n*Generated by game-harness on ${new Date().toISOString()}*`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
