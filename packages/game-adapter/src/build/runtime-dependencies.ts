import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type {
  RuntimeDependencyValidationIssue,
  RuntimeDependencyValidationOutput,
  RuntimeFileManifest,
  RuntimeManifestSceneEntry,
} from '../types/project.js';

interface ScriptMetadata {
  scriptPath: string;
  className?: string;
  references: ScriptReference[];
}

interface ScriptReference {
  kind: 'load' | 'preload' | 'class_name';
  value: string;
  line: number;
}

interface SceneMetadata {
  entry: RuntimeManifestSceneEntry;
  rootName?: string;
}

const BUILTIN_CLASS_NAMES = new Set([
  'Array',
  'AudioStreamPlayer',
  'BaseButton',
  'Button',
  'Callable',
  'Camera2D',
  'CanvasItem',
  'Color',
  'Control',
  'Dictionary',
  'Engine',
  'FileAccess',
  'GDScript',
  'HBoxContainer',
  'Input',
  'ItemList',
  'JSON',
  'Label',
  'Node',
  'Node2D',
  'Object',
  'OS',
  'PackedScene',
  'PackedStringArray',
  'Panel',
  'PanelContainer',
  'PopupPanel',
  'ProgressBar',
  'ProjectSettings',
  'RandomNumberGenerator',
  'Rect2',
  'RefCounted',
  'Resource',
  'ResourceLoader',
  'RichTextLabel',
  'SceneTree',
  'ScrollContainer',
  'String',
  'StringName',
  'TabContainer',
  'Texture2D',
  'TextureRect',
  'Time',
  'Tween',
  'VBoxContainer',
  'Vector2',
  'Vector2i',
  'Vector3',
  'Window',
]);

const RESOURCE_REFERENCE_PATTERN = /\b(preload|load)\s*\(\s*["']([^"']+)["']\s*\)/g;
const CLASS_REFERENCE_PATTERNS = [
  /:\s*([A-Z][A-Za-z0-9_]*)\b/g,
  /->\s*([A-Z][A-Za-z0-9_]*)\b/g,
  /\bas\s+([A-Z][A-Za-z0-9_]*)\b/g,
  /\bis\s+([A-Z][A-Za-z0-9_]*)\b/g,
  /\b([A-Z][A-Za-z0-9_]*)\s*\.new\s*\(/g,
  /Array\s*\[\s*([A-Z][A-Za-z0-9_]*)\s*\]/g,
];

export async function validateRuntimeDependencies(
  projectPath: string,
  manifest: RuntimeFileManifest,
): Promise<RuntimeDependencyValidationOutput> {
  const sceneMetadata = await readSceneMetadata(projectPath, manifest.scenes);
  const scriptPaths = collectManifestScriptPaths(manifest);
  const scriptMetadata = await readScriptMetadata(projectPath, scriptPaths);
  const classRegistry = new Map<string, string>();
  for (const metadata of scriptMetadata.values()) {
    if (metadata.className !== undefined) {
      classRegistry.set(metadata.className, metadata.scriptPath);
    }
  }

  const activeScriptPaths = await collectActiveScriptPaths(projectPath, manifest, sceneMetadata, scriptMetadata, classRegistry);
  const issues: RuntimeDependencyValidationIssue[] = [];

  for (const metadata of scriptMetadata.values()) {
    const isActive = activeScriptPaths.has(metadata.scriptPath);
    for (const reference of metadata.references) {
      if (reference.kind === 'load' || reference.kind === 'preload') {
        const relativePath = normalizeResPath(reference.value);
        if (relativePath === undefined || !existsSync(join(projectPath, relativePath))) {
          issues.push({
            sourcePath: metadata.scriptPath,
            sourceLine: reference.line,
            dependencyKind: reference.kind,
            dependency: reference.value,
            message: `Unresolved ${reference.kind} dependency ${reference.value}`,
            active: isActive,
          });
        }
        continue;
      }

      if (!classRegistry.has(reference.value) && !BUILTIN_CLASS_NAMES.has(reference.value)) {
        issues.push({
          sourcePath: metadata.scriptPath,
          sourceLine: reference.line,
          dependencyKind: 'class_name',
          dependency: reference.value,
          message: `Unresolved class_name dependency ${reference.value}`,
          active: isActive,
        });
      }
    }
  }

  const activeIssues = issues.filter((issue) => issue.active);
  const inactiveIssues = issues.filter((issue) => !issue.active);
  const activeScripts = [...activeScriptPaths].sort((left, right) => left.localeCompare(right));
  const inactiveScripts = [...scriptMetadata.keys()]
    .filter((scriptPath) => !activeScriptPaths.has(scriptPath))
    .sort((left, right) => left.localeCompare(right));

  return {
    success: activeIssues.length === 0,
    activeScriptPaths: activeScripts,
    inactiveScriptPaths: inactiveScripts,
    activeIssues,
    inactiveIssues,
  };
}

export function formatRuntimeDependencyIssue(issue: RuntimeDependencyValidationIssue): string {
  return `${issue.sourcePath}:${issue.sourceLine} ${issue.message}`;
}

async function collectActiveScriptPaths(
  projectPath: string,
  manifest: RuntimeFileManifest,
  sceneMetadata: SceneMetadata[],
  scriptMetadata: Map<string, ScriptMetadata>,
  classRegistry: Map<string, string>,
): Promise<Set<string>> {
  const activeScriptPaths = new Set<string>();
  const queue: string[] = [];
  const activeSceneNames = await readCriticalFlowSceneNames(projectPath);

  const pushScript = (scriptPath?: string): void => {
    if (scriptPath === undefined || !scriptMetadata.has(scriptPath) || activeScriptPaths.has(scriptPath)) {
      return;
    }

    activeScriptPaths.add(scriptPath);
    queue.push(scriptPath);
  };

  for (const autoload of manifest.autoloads) {
    pushScript(autoload.scriptPath);
  }

  if (manifest.mainScenePath !== undefined) {
    const mainScene = sceneMetadata.find((scene) => scene.entry.scenePath === manifest.mainScenePath);
    pushScript(mainScene?.entry.scriptPath);
  }

  for (const scene of sceneMetadata) {
    if (matchesActiveScene(scene, activeSceneNames)) {
      pushScript(scene.entry.scriptPath);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    const metadata = scriptMetadata.get(current);
    if (metadata === undefined) {
      continue;
    }

    for (const reference of metadata.references) {
      if (reference.kind === 'class_name') {
        pushScript(classRegistry.get(reference.value));
        continue;
      }

      const relativePath = normalizeResPath(reference.value);
      if (relativePath === undefined || !existsSync(join(projectPath, relativePath))) {
        continue;
      }

      if (reference.value.endsWith('.gd')) {
        pushScript(reference.value);
        continue;
      }

      if (reference.value.endsWith('.tscn')) {
        const scene = sceneMetadata.find((entry) => entry.entry.scenePath === reference.value);
        pushScript(scene?.entry.scriptPath);
      }
    }
  }

  return activeScriptPaths;
}

function matchesActiveScene(scene: SceneMetadata, activeSceneNames: Set<string>): boolean {
  if (activeSceneNames.size === 0) {
    return false;
  }

  const fileBaseName = scene.entry.scenePath.split('/').pop()?.replace(/\.tscn$/, '');
  return activeSceneNames.has(scene.entry.id)
    || (scene.rootName !== undefined && activeSceneNames.has(scene.rootName))
    || (fileBaseName !== undefined && activeSceneNames.has(fileBaseName));
}

async function readCriticalFlowSceneNames(projectPath: string): Promise<Set<string>> {
  const configPath = join(projectPath, 'harness', 'critical-flow.json');
  if (!existsSync(configPath)) {
    return new Set<string>();
  }

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      steps?: Array<{ scene?: unknown }>;
      visibilityChecks?: Array<{ scene?: unknown }>;
      inputReachabilityChecks?: Array<{ scene?: unknown }>;
    };
    const sceneNames = new Set<string>();

    for (const scene of collectSceneNames(parsed.steps)) {
      sceneNames.add(scene);
    }
    for (const scene of collectSceneNames(parsed.visibilityChecks)) {
      sceneNames.add(scene);
    }
    for (const scene of collectSceneNames(parsed.inputReachabilityChecks)) {
      sceneNames.add(scene);
    }

    return sceneNames;
  } catch {
    return new Set<string>();
  }
}

function collectSceneNames(values: Array<{ scene?: unknown }> | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => value.scene)
    .filter((scene): scene is string => typeof scene === 'string' && scene.trim().length > 0);
}

async function readSceneMetadata(projectPath: string, scenes: RuntimeManifestSceneEntry[]): Promise<SceneMetadata[]> {
  const metadata: SceneMetadata[] = [];

  for (const scene of scenes) {
    let rootName: string | undefined;
    const relativePath = normalizeResPath(scene.scenePath);
    if (relativePath !== undefined) {
      const absolutePath = join(projectPath, relativePath);
      if (existsSync(absolutePath)) {
        const source = await readFile(absolutePath, 'utf8');
        const match = /^\[node name="([^"]+)"/m.exec(source);
        rootName = match?.[1];
      }
    }

    metadata.push({ entry: scene, ...(rootName !== undefined ? { rootName } : {}) });
  }

  return metadata;
}

function collectManifestScriptPaths(manifest: RuntimeFileManifest): string[] {
  const scriptPaths = new Set<string>();

  for (const autoload of manifest.autoloads) {
    scriptPaths.add(autoload.scriptPath);
  }
  for (const scene of manifest.scenes) {
    if (scene.scriptPath !== undefined) {
      scriptPaths.add(scene.scriptPath);
    }
  }
  for (const script of manifest.scripts) {
    scriptPaths.add(script.scriptPath);
  }

  return [...scriptPaths];
}

async function readScriptMetadata(projectPath: string, scriptPaths: string[]): Promise<Map<string, ScriptMetadata>> {
  const metadata = new Map<string, ScriptMetadata>();

  for (const scriptPath of scriptPaths) {
    const relativePath = normalizeResPath(scriptPath);
    if (relativePath === undefined) {
      continue;
    }

    const absolutePath = join(projectPath, relativePath);
    if (!existsSync(absolutePath)) {
      metadata.set(scriptPath, { scriptPath, references: [] });
      continue;
    }

    const source = await readFile(absolutePath, 'utf8');
    metadata.set(scriptPath, {
      scriptPath,
      ...extractClassName(source),
      references: extractReferences(source),
    });
  }

  return metadata;
}

function extractClassName(source: string): { className?: string } {
  const match = /^\s*class_name\s+([A-Za-z_][A-Za-z0-9_]*)\b/m.exec(stripComments(source));
  return match?.[1] !== undefined ? { className: match[1] } : {};
}

function extractReferences(source: string): ScriptReference[] {
  const cleanSource = stripComments(source);
  const references: ScriptReference[] = [];

  for (const match of cleanSource.matchAll(RESOURCE_REFERENCE_PATTERN)) {
    const fullMatch = match[0];
    const kind = match[1];
    const value = match[2];
    if ((kind !== 'load' && kind !== 'preload') || value === undefined || fullMatch === undefined) {
      continue;
    }

    references.push({
      kind,
      value,
      line: lineNumberForMatch(cleanSource, match.index ?? 0),
    });
  }

  for (const pattern of CLASS_REFERENCE_PATTERNS) {
    for (const match of cleanSource.matchAll(pattern)) {
      const value = match[1];
      if (value === undefined || BUILTIN_CLASS_NAMES.has(value)) {
        continue;
      }

      references.push({
        kind: 'class_name',
        value,
        line: lineNumberForMatch(cleanSource, match.index ?? 0),
      });
    }
  }

  return dedupeReferences(references);
}

function dedupeReferences(references: ScriptReference[]): ScriptReference[] {
  const deduped: ScriptReference[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    const key = `${reference.kind}:${reference.value}:${reference.line}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(reference);
  }

  return deduped;
}

function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let inString = false;
      let quote = '';
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if ((char === '"' || char === '\'') && (index === 0 || line[index - 1] !== '\\')) {
          if (!inString) {
            inString = true;
            quote = char;
          } else if (quote === char) {
            inString = false;
            quote = '';
          }
        }
        if (char === '#' && !inString) {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join('\n');
}

function lineNumberForMatch(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function normalizeResPath(path: string): string | undefined {
  if (!path.startsWith('res://')) {
    return undefined;
  }

  return path.slice('res://'.length).replace(/\\/g, '/');
}
