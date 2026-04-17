import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type {
  RuntimeFileManifest,
  RuntimeManifestValidationIssue,
  RuntimeReconciliationConflict,
  RuntimeReconciliationPlanStep,
  RuntimeReconciliationReport,
} from '../types/project.js';
import { inspectActiveScenes } from './scene-inspection.js';
import { validateRuntimeDependencies } from './runtime-dependencies.js';
import { validateRuntimeLayout } from './runtime-layout.js';
import { generateRuntimeManifest, readRuntimeManifest, validateRuntimeManifest } from './runtime-manifest.js';

const RECONCILIATION_REPORT_PATH = 'harness/runtime-reconciliation-report.json';
const RECONCILIATION_VERSION = '1.0.0';

export async function generateRuntimeReconciliationReport(
  projectPath: string,
): Promise<RuntimeReconciliationReport> {
  const manifest = await generateRuntimeManifest(projectPath);
  const existingManifest = await readExistingManifest(projectPath);
  const layout = await validateRuntimeLayout(projectPath);
  const manifestValidation = await validateRuntimeManifest(projectPath, manifest);
  const dependencyValidation = await validateRuntimeDependencies(projectPath, manifest);
  const sceneInspection = await inspectActiveScenes(projectPath);

  const conflicts: RuntimeReconciliationConflict[] = [];
  conflicts.push(...mapLayoutConflicts(layout));
  conflicts.push(...mapManifestValidationConflicts(manifestValidation.issues));
  conflicts.push(...mapManifestDiffConflicts(manifest, existingManifest));
  conflicts.push(...mapDependencyConflicts(dependencyValidation.activeIssues, true));
  conflicts.push(...mapDependencyConflicts(dependencyValidation.inactiveIssues, false));
  conflicts.push(...mapSceneConflicts(sceneInspection.scenes));

  const dedupedConflicts = dedupeConflicts(conflicts);

  return {
    version: RECONCILIATION_VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'read-only',
    canonicalLayoutId: manifest.canonicalLayoutId,
    manifestPath: manifest.manifestPath,
    activeRuntimeRoots: [...layout.activeRuntimeRoots].sort((left, right) => left.localeCompare(right)),
    activeFiles: {
      scenes: sceneInspection.scenes
        .filter((scene) => scene.exists)
        .map((scene) => scene.scenePath)
        .sort((left, right) => left.localeCompare(right)),
      scripts: [
        ...new Set([
          ...dependencyValidation.activeScriptPaths,
          ...sceneInspection.scenes
            .map((scene) => scene.attachedScriptPath)
            .filter((path): path is string => path !== null),
        ]),
      ].sort((left, right) => left.localeCompare(right)),
      autoloads: manifest.autoloads.map((entry) => entry.scriptPath).sort((left, right) => left.localeCompare(right)),
      dataRoots: manifest.dataRoots.map((entry) => entry.path).sort((left, right) => left.localeCompare(right)),
    },
    conflicts: dedupedConflicts,
    repairPlan: buildRepairPlan(dedupedConflicts),
  };
}

export async function writeRuntimeReconciliationReport(
  projectPath: string,
  outputPath = RECONCILIATION_REPORT_PATH,
): Promise<RuntimeReconciliationReport> {
  const report = await generateRuntimeReconciliationReport(projectPath);
  const targetPath = join(projectPath, outputPath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

async function readExistingManifest(projectPath: string): Promise<RuntimeFileManifest | undefined> {
  const manifestPath = join(projectPath, 'harness', 'runtime-manifest.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  try {
    return await readRuntimeManifest(projectPath);
  } catch {
    return undefined;
  }
}

function mapLayoutConflicts(
  layout: Awaited<ReturnType<typeof validateRuntimeLayout>>,
): RuntimeReconciliationConflict[] {
  const conflicts: RuntimeReconciliationConflict[] = [];

  if (layout.issues.some((issue) => issue.startsWith('Mixed active runtime layout detected'))) {
    conflicts.push({
      id: 'layout:mixed-runtime-layout',
      kind: 'mixed-runtime-layout',
      severity: 'error',
      summary: 'Old and new runtime layouts are both active.',
      details: `Active roots: ${layout.activeRuntimeRoots.join(', ') || 'none'}.`,
      paths: layout.activeRuntimeRoots,
      active: true,
      suggestedAction: 'Consolidate runtime references under the canonical layout and remove stale roots from project settings.',
    });
  }

  for (const duplicate of layout.duplicateSubsystems) {
    conflicts.push({
      id: `duplicate:${duplicate.subsystem}:${duplicate.authoritativePath}:${duplicate.conflictingPath}`,
      kind: 'duplicate-implementation',
      severity: 'error',
      summary: `Old and new implementations coexist for ${duplicate.subsystem}.`,
      details: `Authoritative file ${duplicate.authoritativePath} conflicts with ${duplicate.conflictingPath}.`,
      paths: [duplicate.authoritativePath, duplicate.conflictingPath],
      active: true,
      authoritativePath: duplicate.authoritativePath,
      conflictingPath: duplicate.conflictingPath,
      suggestedAction: 'Choose one implementation as authoritative, retarget references to it, and remove or archive the duplicate.',
    });
  }

  return conflicts;
}

function mapManifestValidationConflicts(
  issues: RuntimeManifestValidationIssue[],
): RuntimeReconciliationConflict[] {
  return issues.map((issue) => ({
    id: `manifest-validation:${issue.entryType}:${issue.identifier}:${issue.path ?? issue.message}`,
    kind: 'manifest-mismatch',
    severity: 'error',
    summary: issue.message,
    details: `${issue.entryType} "${issue.identifier}" no longer matches the active runtime files.`,
    paths: issue.path !== undefined ? [issue.path] : [],
    active: true,
    suggestedAction: 'Refresh the runtime manifest and retarget any stale references to existing runtime files.',
  }));
}

function mapManifestDiffConflicts(
  generatedManifest: RuntimeFileManifest,
  existingManifest: RuntimeFileManifest | undefined,
): RuntimeReconciliationConflict[] {
  if (existingManifest === undefined) {
    return [];
  }

  const conflicts: RuntimeReconciliationConflict[] = [];
  conflicts.push(...diffManifestPaths(
    'scene',
    existingManifest.scenes.map((entry) => entry.scenePath),
    generatedManifest.scenes.map((entry) => entry.scenePath),
  ));
  conflicts.push(...diffManifestPaths(
    'script',
    existingManifest.scripts.map((entry) => entry.scriptPath),
    generatedManifest.scripts.map((entry) => entry.scriptPath),
  ));
  conflicts.push(...diffManifestPaths(
    'autoload',
    existingManifest.autoloads.map((entry) => entry.scriptPath),
    generatedManifest.autoloads.map((entry) => entry.scriptPath),
  ));

  return conflicts;
}

function diffManifestPaths(
  entryType: 'scene' | 'script' | 'autoload',
  existingPaths: string[],
  generatedPaths: string[],
): RuntimeReconciliationConflict[] {
  const prior = new Set(existingPaths);
  const current = new Set(generatedPaths);
  const conflicts: RuntimeReconciliationConflict[] = [];

  for (const path of [...prior].filter((value) => !current.has(value)).sort((left, right) => left.localeCompare(right))) {
    conflicts.push({
      id: `manifest-drift:missing:${entryType}:${path}`,
      kind: 'manifest-mismatch',
      severity: 'warning',
      summary: `Stored runtime manifest still references ${entryType} ${path}.`,
      details: `The saved manifest references ${path}, but the current runtime scan did not find it.`,
      paths: [path],
      active: false,
      suggestedAction: 'Refresh the runtime manifest and remove stale references before later repair passes consume it.',
    });
  }

  for (const path of [...current].filter((value) => !prior.has(value)).sort((left, right) => left.localeCompare(right))) {
    conflicts.push({
      id: `manifest-drift:new:${entryType}:${path}`,
      kind: 'manifest-mismatch',
      severity: 'warning',
      summary: `Current runtime scan found a new ${entryType} missing from the stored manifest.`,
      details: `The active project contains ${path}, but the saved manifest has not been refreshed.`,
      paths: [path],
      active: true,
      suggestedAction: 'Refresh the runtime manifest so later implementation prompts use the current runtime layout.',
    });
  }

  return conflicts;
}

function mapDependencyConflicts(
  issues: Awaited<ReturnType<typeof validateRuntimeDependencies>>['activeIssues'],
  active: boolean,
): RuntimeReconciliationConflict[] {
  return issues.map((issue) => ({
    id: `dependency:${issue.sourcePath}:${issue.sourceLine}:${issue.dependencyKind}:${issue.dependency}`,
    kind: 'reference-mismatch',
    severity: active ? 'error' : 'warning',
    summary: issue.message,
    details: `${issue.sourcePath}:${issue.sourceLine} references ${issue.dependency}, which does not resolve in the current runtime.`,
    paths: [issue.sourcePath, issue.dependency],
    active,
    suggestedAction: active
      ? 'Repair or remove the broken runtime reference before relying on this path in future edits.'
      : 'Decide whether the inactive implementation should be deleted, migrated, or reconnected to the canonical runtime.',
  }));
}

function mapSceneConflicts(
  scenes: Awaited<ReturnType<typeof inspectActiveScenes>>['scenes'],
): RuntimeReconciliationConflict[] {
  return scenes
    .filter((scene) => scene.instantiationStatus !== 'ready')
    .map((scene) => ({
      id: `scene:${scene.sceneId}:${scene.instantiationStatus}`,
      kind: 'scene-instantiation',
      severity: scene.required || scene.kind === 'main-scene' ? 'error' : 'warning',
      summary: `Scene ${scene.sceneId} is not ready for runtime use.`,
      details: scene.issues.join(' ') || `Instantiation status: ${scene.instantiationStatus}.`,
      paths: [
        scene.scenePath,
        ...(scene.attachedScriptPath !== null ? [scene.attachedScriptPath] : []),
      ],
      active: scene.required || scene.kind === 'main-scene',
      suggestedAction: 'Repair the scene binding so the root node and attached script both resolve from the canonical runtime layout.',
    }));
}

function dedupeConflicts(conflicts: RuntimeReconciliationConflict[]): RuntimeReconciliationConflict[] {
  const seen = new Set<string>();
  const deduped: RuntimeReconciliationConflict[] = [];

  for (const conflict of conflicts) {
    if (seen.has(conflict.id)) {
      continue;
    }

    seen.add(conflict.id);
    deduped.push({
      ...conflict,
      paths: [...new Set(conflict.paths)].sort((left, right) => left.localeCompare(right)),
    });
  }

  return deduped.sort((left, right) => left.id.localeCompare(right.id));
}

function buildRepairPlan(conflicts: RuntimeReconciliationConflict[]): RuntimeReconciliationPlanStep[] {
  return conflicts.map((conflict, index) => ({
    id: `repair-${index + 1}`,
    priority: conflict.severity === 'error' ? 'high' : conflict.active ? 'medium' : 'low',
    title: repairTitleFor(conflict),
    details: `${conflict.summary} ${conflict.suggestedAction}`.trim(),
    targets: conflict.paths,
    conflictIds: [conflict.id],
  }));
}

function repairTitleFor(conflict: RuntimeReconciliationConflict): string {
  switch (conflict.kind) {
    case 'mixed-runtime-layout':
      return 'Unify runtime layout references';
    case 'duplicate-implementation':
      return 'Collapse duplicate implementations';
    case 'manifest-mismatch':
      return 'Refresh runtime manifest inputs';
    case 'reference-mismatch':
      return 'Repair broken runtime references';
    case 'scene-instantiation':
      return 'Fix scene binding drift';
  }
}
