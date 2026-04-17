import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { glob } from 'glob';
import type {
  RuntimeFileManifest,
  RuntimeManifestAutoloadEntry,
  RuntimeManifestDataRootEntry,
  RuntimeManifestSceneEntry,
  RuntimeManifestScriptEntry,
  RuntimeManifestValidationIssue,
  RuntimeManifestValidationOutput,
} from '../types/project.js';
import { loadRuntimeLayoutConfig } from './runtime-layout.js';

const RUNTIME_MANIFEST_PATH = 'harness/runtime-manifest.json';
const MANIFEST_VERSION = '1.0.0';

export async function generateRuntimeManifest(projectPath: string): Promise<RuntimeFileManifest> {
  const runtimeLayout = await loadRuntimeLayoutConfig(projectPath);
  const autoloads = await readDeclaredAutoloads(projectPath);
  const scenes = await collectRuntimeScenes(projectPath);
  const scripts = await collectRuntimeScripts(projectPath, autoloads, scenes);
  const dataRoots = await collectDataRoots(projectPath);
  const projectSettings = await readProjectSettings(projectPath);

  return {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    canonicalLayoutId: runtimeLayout.canonicalLayoutId,
    manifestPath: RUNTIME_MANIFEST_PATH,
    ...(projectSettings.mainScenePath !== undefined
      ? { mainScenePath: projectSettings.mainScenePath }
      : {}),
    scenes,
    scripts,
    autoloads,
    dataRoots,
  };
}

export async function writeRuntimeManifest(projectPath: string): Promise<RuntimeFileManifest> {
  const manifest = await generateRuntimeManifest(projectPath);
  const targetPath = join(projectPath, RUNTIME_MANIFEST_PATH);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

export async function readRuntimeManifest(projectPath: string): Promise<RuntimeFileManifest> {
  const manifestPath = join(projectPath, RUNTIME_MANIFEST_PATH);
  const raw = await readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as RuntimeFileManifest;
}

export async function validateRuntimeManifest(
  projectPath: string,
  manifest?: RuntimeFileManifest,
): Promise<RuntimeManifestValidationOutput> {
  const loadedManifest = manifest ?? await readRuntimeManifest(projectPath);
  const issues: RuntimeManifestValidationIssue[] = [];

  if (loadedManifest.version.trim().length === 0) {
    issues.push({
      entryType: 'manifest',
      identifier: 'version',
      message: 'Manifest version is missing',
    });
  }

  if (loadedManifest.canonicalLayoutId.trim().length === 0) {
    issues.push({
      entryType: 'manifest',
      identifier: 'canonicalLayoutId',
      message: 'Canonical runtime layout id is missing',
    });
  }

  if (loadedManifest.mainScenePath !== undefined) {
    recordMissingResPath(
      projectPath,
      loadedManifest.mainScenePath,
      'scene',
      'main',
      'Main scene path points to a missing file',
      issues,
    );
  }

  for (const scene of loadedManifest.scenes) {
    recordMissingResPath(
      projectPath,
      scene.scenePath,
      'scene',
      scene.id,
      'Scene entry points to a missing file',
      issues,
    );
    if (scene.scriptPath !== undefined) {
      recordMissingResPath(
        projectPath,
        scene.scriptPath,
        'scene',
        scene.id,
        'Scene script entry points to a missing file',
        issues,
      );
    }
  }

  for (const script of loadedManifest.scripts) {
    recordMissingResPath(
      projectPath,
      script.scriptPath,
      'script',
      script.id,
      'Script entry points to a missing file',
      issues,
    );
  }

  for (const autoload of loadedManifest.autoloads) {
    recordMissingResPath(
      projectPath,
      autoload.scriptPath,
      'autoload',
      autoload.name,
      'Autoload entry points to a missing file',
      issues,
    );
  }

  for (const dataRoot of loadedManifest.dataRoots) {
    const relativePath = normalizeProjectRelativePath(dataRoot.path);
    if (relativePath === undefined || !existsSync(join(projectPath, relativePath))) {
      issues.push({
        entryType: 'dataRoot',
        identifier: dataRoot.id,
        path: dataRoot.path,
        message: 'Data root entry points to a missing directory',
      });
    }
  }

  return {
    success: issues.length === 0,
    manifestPath: loadedManifest.manifestPath,
    issues,
  };
}

function recordMissingResPath(
  projectPath: string,
  path: string,
  entryType: RuntimeManifestValidationIssue['entryType'],
  identifier: string,
  message: string,
  issues: RuntimeManifestValidationIssue[],
): void {
  const relativePath = normalizeResPath(path);
  if (relativePath === undefined || !existsSync(join(projectPath, relativePath))) {
    issues.push({
      entryType,
      identifier,
      path,
      message,
    });
  }
}

async function collectRuntimeScenes(projectPath: string): Promise<RuntimeManifestSceneEntry[]> {
  const sceneFiles = await glob(['src/main.tscn', 'src/scenes/**/*.tscn'], {
    cwd: projectPath,
    nodir: true,
    ignore: ['.godot/**', 'builds/**', 'node_modules/**'],
    posix: true,
  });

  return sceneFiles
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => {
      const scriptRelative = relativePath.replace(/\.tscn$/, '.gd');
      return {
        id: relativePath === 'src/main.tscn'
          ? 'main'
          : relativePath.split('/').pop()?.replace(/\.tscn$/, '') ?? relativePath,
        scenePath: toResPath(relativePath),
        ...(existsSync(join(projectPath, scriptRelative))
          ? { scriptPath: toResPath(scriptRelative) }
          : {}),
      };
    });
}

async function collectRuntimeScripts(
  projectPath: string,
  autoloads: RuntimeManifestAutoloadEntry[],
  scenes: RuntimeManifestSceneEntry[],
): Promise<RuntimeManifestScriptEntry[]> {
  const scriptFiles = await glob('src/**/*.gd', {
    cwd: projectPath,
    nodir: true,
    ignore: ['.godot/**', 'builds/**', 'node_modules/**'],
    posix: true,
  });
  const autoloadScriptPaths = new Set(autoloads.map((entry) => entry.scriptPath));
  const sceneScriptPaths = new Set(
    scenes
      .map((entry) => entry.scriptPath)
      .filter((value): value is string => value !== undefined),
  );

  return scriptFiles
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => {
      const resPath = toResPath(relativePath);
      const category = autoloadScriptPaths.has(resPath)
        ? 'autoload'
        : sceneScriptPaths.has(resPath)
          ? 'scene'
          : relativePath.startsWith('src/systems/')
            ? 'system'
            : 'script';

      return {
        id: relativePath.split('/').pop()?.replace(/\.gd$/, '') ?? relativePath,
        scriptPath: resPath,
        category,
      };
    });
}

async function collectDataRoots(projectPath: string): Promise<RuntimeManifestDataRootEntry[]> {
  const candidates: RuntimeManifestDataRootEntry[] = [
    { id: 'content', path: 'src/data/content', kind: 'content' },
    { id: 'schemas', path: 'src/data/schemas', kind: 'schema' },
  ];

  const roots: RuntimeManifestDataRootEntry[] = [];
  for (const candidate of candidates) {
    if (existsSync(join(projectPath, candidate.path))) {
      roots.push(candidate);
    }
  }

  return roots;
}

async function readProjectSettings(projectPath: string): Promise<{ mainScenePath?: string }> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    return {};
  }

  const source = await readFile(projectFilePath, 'utf8');
  const mainSceneMatch = source.match(/run\/main_scene="([^"]+)"/);

  return mainSceneMatch?.[1] !== undefined
    ? { mainScenePath: mainSceneMatch[1] }
    : {};
}

async function readDeclaredAutoloads(projectPath: string): Promise<RuntimeManifestAutoloadEntry[]> {
  const projectFilePath = join(projectPath, 'project.godot');
  if (!existsSync(projectFilePath)) {
    return [];
  }

  const source = await readFile(projectFilePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const autoloads: RuntimeManifestAutoloadEntry[] = [];
  let inAutoloadSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inAutoloadSection = trimmed === '[autoload]';
      continue;
    }

    if (!inAutoloadSection || trimmed.length === 0 || trimmed.startsWith(';')) {
      continue;
    }

    const match = /^([^=]+)="(\*?res:\/\/[^"]+)"$/.exec(trimmed);
    if (!match) {
      continue;
    }

    const name = match[1]?.trim();
    const rawScriptPath = match[2];
    if (name === undefined || rawScriptPath === undefined) {
      continue;
    }

    autoloads.push({
      name,
      scriptPath: rawScriptPath.startsWith('*') ? rawScriptPath.slice(1) : rawScriptPath,
    });
  }

  return autoloads.sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeResPath(path: string): string | undefined {
  if (!path.startsWith('res://')) {
    return undefined;
  }

  return path.slice('res://'.length).replace(/\\/g, '/');
}

function normalizeProjectRelativePath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '');
  return normalized.length > 0 ? normalized : undefined;
}

function toResPath(relativePath: string): string {
  return `res://${relativePath.replace(/\\/g, '/')}`;
}
