import { readFile } from 'fs/promises';
import { isAbsolute, join, relative } from 'path';
import { writeRuntimeManifest } from '@agent-harness/game-adapter';
import {
  type AdvancedSharedContext,
  type ArchitectureContract,
  type MemoryEntry,
  type RuntimeReconciliationReport,
  type TaskPlan,
  type TaskState,
} from '@agent-harness/core';
import type { SourceInjectionLimits } from './implement-task-types.js';
import { loadMemoryStore } from './implement-task-shared.js';

interface ProjectFileReference {
  absolutePath: string;
  contextPath: string;
}

interface PreparedTaskContext {
  memory: MemoryEntry[];
}

const SMALL_FILE_LINES = 60;

export async function prepareTaskContext(
  projectPath: string,
  memoryPath: string,
  task: TaskState,
  plan: TaskPlan,
  mode: 'simple' | 'advanced',
  reconciliationReportPath?: string,
): Promise<PreparedTaskContext> {
  const memoryStore = await loadMemoryStore(projectPath, memoryPath);
  const dependencySummaries = memoryStore.dependencySummaries(task).map((entry) => entry.value);
  const memory = memoryStore.forTask(task);

  task.context.dependencySummaries = dependencySummaries;
  task.context.memoryKeys = memory.map((entry) => entry.key);
  task.status = 'in-progress';
  task.updatedAt = new Date().toISOString();
  task.context.projectPath = projectPath;

  await attachGameSpecContext(projectPath, task, plan);
  await attachAssetContext(projectPath, task, plan);
  await attachArchitectureContext(projectPath, task, mode);
  await attachAdvancedContext(projectPath, task, mode);
  await attachRuntimeManifestContext(projectPath, task);
  await attachReconciliationReportContext(projectPath, task, reconciliationReportPath);
  await attachRelevantFileContext(projectPath, plan, task);

  return { memory };
}

async function attachGameSpecContext(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
): Promise<void> {
  try {
    await readFile(join(projectPath, 'docs', 'game-spec.md'), 'utf8');
    task.context.gameSpecPath = 'docs/game-spec.md';
  } catch {
    if (plan.gameBrief.length <= 600) {
      task.context.gameSpec = plan.gameBrief;
    }
  }
}

async function attachAssetContext(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
): Promise<void> {
  if (task.role !== 'asset') {
    return;
  }

  const canvasSize = await readCanvasSize(projectPath);
  task.context.canvasWidth = canvasSize.width;
  task.context.canvasHeight = canvasSize.height;
  task.context.visualStyle = buildVisualStyleSummary(plan);
  task.context.plannedEntities = plan.entities;
  task.context.plannedAssets = plan.assets;
  task.context.scenesNeedingBackgrounds = inferScenesNeedingBackgrounds(plan.scenes);
}

async function attachArchitectureContext(
  projectPath: string,
  task: TaskState,
  mode: 'simple' | 'advanced',
): Promise<void> {
  if (
    mode !== 'advanced'
    && task.role !== 'gameplay'
    && task.role !== 'systems'
    && task.role !== 'balance'
  ) {
    return;
  }

  const architecturePath = join(projectPath, 'docs', 'architecture.json');
  try {
    const architecture = JSON.parse(await readFile(architecturePath, 'utf8')) as ArchitectureContract;
    task.context.architecturePath = 'docs/architecture.json';
    task.context.architectureContract = architecture;
    task.context.architectureNotes = summarizeArchitectureForTask(task, architecture);
    appendRelevantFile(task, 'docs/architecture.json');
  } catch {
    // Advanced scaffolds should provide this file, but keep execution resilient when absent.
  }
}

async function attachAdvancedContext(
  projectPath: string,
  task: TaskState,
  mode: 'simple' | 'advanced',
): Promise<void> {
  if (mode !== 'advanced') {
    return;
  }

  const advancedContextPath = join(projectPath, 'docs', 'advanced-context.json');
  try {
    const advancedSharedContext = JSON.parse(
      await readFile(advancedContextPath, 'utf8'),
    ) as AdvancedSharedContext;
    task.context.advancedContextPath = 'docs/advanced-context.json';
    task.context.advancedSharedContext = advancedSharedContext;
    appendRelevantFile(task, 'docs/advanced-context.json');
  } catch {
    // Older advanced projects may not have this file yet.
  }
}

async function attachRuntimeManifestContext(projectPath: string, task: TaskState): Promise<void> {
  try {
    const runtimeManifest = await writeRuntimeManifest(projectPath);
    task.context.runtimeManifestPath = 'harness/runtime-manifest.json';
    task.context.runtimeManifest = runtimeManifest;
    appendRelevantFile(task, 'harness/runtime-manifest.json');
  } catch {
    // Older projects may not have a runtime manifest yet.
  }
}

async function attachReconciliationReportContext(
  projectPath: string,
  task: TaskState,
  reconciliationReportPath?: string,
): Promise<void> {
  const reportRef = await resolveReconciliationReportFile(projectPath, reconciliationReportPath);
  if (reportRef === undefined) {
    return;
  }

  try {
    const reconciliationReport = JSON.parse(
      await readFile(reportRef.absolutePath, 'utf8'),
    ) as RuntimeReconciliationReport;
    task.context.reconciliationReportPath = reportRef.contextPath;
    task.context.reconciliationReport = reconciliationReport;
    appendRelevantFile(task, reportRef.contextPath);
  } catch {
    // Ignore malformed reports so task execution can continue.
  }
}

async function attachRelevantFileContext(
  projectPath: string,
  plan: TaskPlan,
  task: TaskState,
): Promise<void> {
  const injectionLimits = getSourceInjectionLimits(task.role);
  const allTasks = plan.phases.flatMap((phase) => phase.tasks);
  const dependencyFiles = getTransitiveDependencyFiles(task.id, allTasks, projectPath)
    .slice(0, injectionLimits.maxDependencyFiles);
  const relevantSourceFiles = task.context.relevantFiles.filter((file) => file.endsWith('.ts') || file.endsWith('.js'));
  const candidatePaths = [...new Set([
    ...relevantSourceFiles,
    ...dependencyFiles,
  ])].slice(0, injectionLimits.maxFiles);

  const contents: Record<string, string> = {};
  const fileIndex: Record<string, number> = {};
  let injectedLines = 0;

  for (const relativePath of candidatePaths) {
    try {
      const raw = await readFile(join(projectPath, relativePath), 'utf8');
      const lineCount = raw.split('\n').length;
      const canInline = lineCount <= SMALL_FILE_LINES
        && injectedLines + lineCount <= injectionLimits.maxLines;

      if (canInline) {
        contents[relativePath] = raw;
        injectedLines += lineCount;
        continue;
      }

      fileIndex[relativePath] = lineCount;
    } catch {
      // File may not exist yet, so skip it.
    }
  }

  if (Object.keys(contents).length > 0) {
    task.context.relevantFileContents = contents;
  }
  if (Object.keys(fileIndex).length > 0) {
    task.context.relevantFileIndex = fileIndex;
  }
}

export async function resolveReconciliationReportFile(
  projectPath: string,
  reconciliationReportPath?: string,
): Promise<ProjectFileReference | undefined> {
  const candidates = [
    reconciliationReportPath,
    'harness/runtime-reconciliation-report.json',
  ].filter((value): value is string => value !== undefined);

  for (const candidate of candidates) {
    const reference = toProjectFileReference(projectPath, candidate);
    try {
      await readFile(reference.absolutePath, 'utf8');
      return reference;
    } catch {
      // Keep searching for the first readable report.
    }
  }

  return undefined;
}

function toProjectFileReference(projectPath: string, candidate: string): ProjectFileReference {
  const absolutePath = isAbsolute(candidate) ? candidate : join(projectPath, candidate);
  const projectRelativePath = relative(projectPath, absolutePath).replace(/\\/g, '/');
  const contextPath = projectRelativePath.startsWith('..') || isAbsolute(projectRelativePath)
    ? candidate.replace(/\\/g, '/')
    : projectRelativePath;

  return {
    absolutePath,
    contextPath,
  };
}

function appendRelevantFile(task: TaskState, filePath: string): void {
  if (!task.context.relevantFiles.includes(filePath)) {
    task.context.relevantFiles = [...task.context.relevantFiles, filePath];
  }
}

function summarizeArchitectureForTask(task: TaskState, architecture: ArchitectureContract): string {
  const subsystemApi = task.context.subsystemId
    ? architecture.subsystemApis.find((api: ArchitectureContract['subsystemApis'][number]) => api.subsystemId === task.context.subsystemId)
    : undefined;
  const stateMachineSummary = architecture.stateMachines
    .map((machine: ArchitectureContract['stateMachines'][number]) => `${machine.id}: [${machine.states.join(', ')}]`)
    .join('; ');

  const lines = [
    `Event types: ${architecture.eventTypes.join(', ') || 'none'}`,
    `State machines: ${stateMachineSummary || 'none'}`,
  ];

  if (subsystemApi) {
    lines.push(
      `Subsystem API (${subsystemApi.subsystemId}): modules=${subsystemApi.modules.join(', ') || 'none'}; `
      + `events=${subsystemApi.exposedEvents.join(', ') || 'none'}; `
      + `contentLoader=${subsystemApi.contentLoaderMethods.join(', ') || 'none'}`,
    );
  }

  return lines.join('\n');
}

async function readCanvasSize(projectPath: string): Promise<{ width: number; height: number }> {
  const fallback = { width: 800, height: 600 };

  try {
    const configPath = join(projectPath, 'src', 'game', 'config.ts');
    const configSource = await readFile(configPath, 'utf8');
    const widthMatch = configSource.match(/export const GAME_WIDTH = (\d+);/);
    const heightMatch = configSource.match(/export const GAME_HEIGHT = (\d+);/);

    return {
      width: widthMatch ? Number(widthMatch[1]) : fallback.width,
      height: heightMatch ? Number(heightMatch[1]) : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function buildVisualStyleSummary(plan: TaskPlan): string {
  return `${plan.genre} game. Brief/style direction: ${plan.gameBrief}`;
}

function inferScenesNeedingBackgrounds(scenes: string[]): string[] {
  return scenes.filter((scene) => !['BootScene', 'HudScene'].includes(scene));
}

function getSourceInjectionLimits(role: TaskState['role']): SourceInjectionLimits {
  switch (role) {
    case 'integration-verifier':
      return { maxFiles: 6, maxLines: 250, maxDependencyFiles: 2 };
    case 'systems':
    case 'gameplay':
      return { maxFiles: 8, maxLines: 300, maxDependencyFiles: 3 };
    case 'balance':
      return { maxFiles: 6, maxLines: 250, maxDependencyFiles: 2 };
    default:
      return { maxFiles: 8, maxLines: 300, maxDependencyFiles: 2 };
  }
}

function getTransitiveDependencyFiles(
  taskId: string,
  allTasks: TaskState[],
  projectPath: string,
): string[] {
  const taskMap = new Map(allTasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const files: string[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }

    visited.add(id);
    const task = taskMap.get(id);
    if (!task) {
      return;
    }

    for (const dependency of task.dependencies) {
      visit(dependency);
    }

    if (!task.result?.filesModified) {
      return;
    }

    for (const absolutePath of task.result.filesModified) {
      if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.js')) {
        continue;
      }

      const relativePath = absolutePath.startsWith(projectPath)
        ? absolutePath.slice(projectPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
        : absolutePath.replace(/\\/g, '/');
      files.push(relativePath);
    }
  };

  const currentTask = taskMap.get(taskId);
  if (currentTask) {
    for (const dependency of currentTask.dependencies) {
      visit(dependency);
    }
  }

  return [...new Set(files)];
}
