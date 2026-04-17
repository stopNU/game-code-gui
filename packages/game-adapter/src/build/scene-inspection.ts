import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  ActiveSceneInspectionEntry,
  ActiveSceneInspectionOutput,
  RuntimeFileManifest,
} from '../types/project.js';
import { generateRuntimeManifest } from './runtime-manifest.js';

interface SceneInspectionTarget {
  kind: ActiveSceneInspectionEntry['kind'];
  sceneId: string;
  scenePath: string;
  required: boolean;
}

interface ParsedSceneBinding {
  rootNodeType: string | null;
  attachedScriptPath: string | null;
  issues: string[];
}

export async function inspectActiveScenes(projectPath: string): Promise<ActiveSceneInspectionOutput> {
  const manifest = await generateRuntimeManifest(projectPath);
  const requiredSceneNames = await readRequiredSceneNames(projectPath);
  const targets = collectSceneInspectionTargets(manifest, requiredSceneNames);
  const scenes = await Promise.all(targets.map(async (target) => inspectSceneTarget(projectPath, target)));

  return {
    projectPath,
    inspectedAt: new Date().toISOString(),
    inspectionMode: 'static',
    ...(manifest.mainScenePath !== undefined ? { mainScenePath: manifest.mainScenePath } : {}),
    scenes,
  };
}

async function inspectSceneTarget(
  projectPath: string,
  target: SceneInspectionTarget,
): Promise<ActiveSceneInspectionEntry> {
  const sceneRelativePath = normalizeResPath(target.scenePath);

  if (sceneRelativePath === undefined) {
    return {
      kind: target.kind,
      sceneId: target.sceneId,
      scenePath: target.scenePath,
      required: target.required,
      exists: false,
      rootNodeType: null,
      attachedScriptPath: null,
      instantiationStatus: 'invalid-scene-path',
      issues: ['Scene path is not a valid res:// path'],
    };
  }

  const absoluteScenePath = join(projectPath, sceneRelativePath);
  if (!existsSync(absoluteScenePath)) {
    return {
      kind: target.kind,
      sceneId: target.sceneId,
      scenePath: target.scenePath,
      required: target.required,
      exists: false,
      rootNodeType: null,
      attachedScriptPath: null,
      instantiationStatus: 'missing-scene',
      issues: ['Scene file is missing'],
    };
  }

  const parsed = parseSceneBinding(await readFile(absoluteScenePath, 'utf8'));
  const instantiationStatus = resolveInstantiationStatus(projectPath, parsed);

  return {
    kind: target.kind,
    sceneId: target.sceneId,
    scenePath: target.scenePath,
    required: target.required,
    exists: true,
    rootNodeType: parsed.rootNodeType,
    attachedScriptPath: parsed.attachedScriptPath,
    instantiationStatus,
    issues: parsed.issues,
  };
}

function resolveInstantiationStatus(
  projectPath: string,
  parsed: ParsedSceneBinding,
): ActiveSceneInspectionEntry['instantiationStatus'] {
  if (parsed.rootNodeType === null) {
    return 'missing-root-node';
  }

  if (parsed.issues.includes('Scene root script reference could not be resolved')) {
    return 'unresolved-script';
  }

  if (parsed.attachedScriptPath !== null) {
    const scriptRelativePath = normalizeResPath(parsed.attachedScriptPath);
    if (scriptRelativePath === undefined || !existsSync(join(projectPath, scriptRelativePath))) {
      return 'missing-script';
    }
  }

  return 'ready';
}

function parseSceneBinding(source: string): ParsedSceneBinding {
  const extResourcePaths = new Map<string, string>();
  const lines = source.split(/\r?\n/);
  let rootNodeType: string | null = null;
  let attachedScriptPath: string | null = null;
  let sawRootNode = false;
  let rootSectionOpen = false;
  let unresolvedScriptReference = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) {
      continue;
    }

    const extResourceMatch = /^\[ext_resource\s+type="[^"]+"\s+path="([^"]+)"\s+id="([^"]+)"\]$/.exec(trimmed);
    if (extResourceMatch !== null) {
      const [, path, id] = extResourceMatch;
      if (path !== undefined && id !== undefined) {
        extResourcePaths.set(id, path);
      }
      continue;
    }

    const nodeHeaderMatch = /^\[node\s+(.+)\]$/.exec(trimmed);
    if (nodeHeaderMatch !== null) {
      if (!sawRootNode) {
        sawRootNode = true;
        rootSectionOpen = true;
        const typeMatch = /type="([^"]+)"/.exec(nodeHeaderMatch[1] ?? '');
        rootNodeType = typeMatch?.[1] ?? null;
      } else {
        rootSectionOpen = false;
      }
      continue;
    }

    if (trimmed.startsWith('[')) {
      rootSectionOpen = false;
      continue;
    }

    if (!rootSectionOpen) {
      continue;
    }

    const scriptMatch = /^script\s*=\s*(.+)$/.exec(trimmed);
    if (scriptMatch === null) {
      continue;
    }

    const scriptValue = scriptMatch[1]?.trim() ?? '';
    const extScriptMatch = /^ExtResource\("([^"]+)"\)$/.exec(scriptValue);
    if (extScriptMatch !== null) {
      attachedScriptPath = extResourcePaths.get(extScriptMatch[1] ?? '') ?? null;
      unresolvedScriptReference = attachedScriptPath === null;
      continue;
    }

    const literalScriptMatch = /^"([^"]+)"$/.exec(scriptValue);
    if (literalScriptMatch !== null) {
      attachedScriptPath = literalScriptMatch[1] ?? null;
      continue;
    }

    unresolvedScriptReference = true;
  }

  const issues: string[] = [];
  if (!sawRootNode) {
    issues.push('Scene root node declaration is missing');
  }
  if (unresolvedScriptReference) {
    issues.push('Scene root script reference could not be resolved');
  }

  return {
    rootNodeType,
    attachedScriptPath,
    issues,
  };
}

function collectSceneInspectionTargets(
  manifest: RuntimeFileManifest,
  requiredSceneNames: string[],
): SceneInspectionTarget[] {
  const manifestScenesById = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
  const targets: SceneInspectionTarget[] = [];
  const seenKeys = new Set<string>();

  const pushTarget = (target: SceneInspectionTarget): void => {
    const key = `${target.kind}:${target.sceneId}:${target.scenePath}`;
    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    targets.push(target);
  };

  if (manifest.mainScenePath !== undefined) {
    pushTarget({
      kind: 'main-scene',
      sceneId: 'main',
      scenePath: manifest.mainScenePath,
      required: false,
    });
  }

  for (const sceneName of requiredSceneNames) {
    const manifestScene = manifestScenesById.get(sceneName);
    pushTarget({
      kind: 'required-scene',
      sceneId: sceneName,
      scenePath: manifestScene?.scenePath ?? `res://src/scenes/${sceneName}.tscn`,
      required: true,
    });
  }

  if (requiredSceneNames.length === 0) {
    for (const scene of manifest.scenes) {
      pushTarget({
        kind: scene.id === 'main' ? 'main-scene' : 'required-scene',
        sceneId: scene.id,
        scenePath: scene.scenePath,
        required: scene.id !== 'main',
      });
    }
  }

  return targets.sort((left, right) =>
    left.scenePath.localeCompare(right.scenePath) || left.sceneId.localeCompare(right.sceneId),
  );
}

async function readRequiredSceneNames(projectPath: string): Promise<string[]> {
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const raw = await readFile(tasksPath, 'utf8');
    const parsed = JSON.parse(raw) as { scenes?: unknown };
    if (!Array.isArray(parsed.scenes)) {
      return [];
    }

    return parsed.scenes
      .filter((scene): scene is string => typeof scene === 'string' && scene.trim().length > 0)
      .filter((scene, index, all) => all.indexOf(scene) === index);
  } catch {
    return [];
  }
}

function normalizeResPath(path: string): string | undefined {
  if (!path.startsWith('res://')) {
    return undefined;
  }

  return path.slice('res://'.length).replace(/\\/g, '/');
}
