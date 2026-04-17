import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import type {
  RuntimeLayoutRule,
  RuntimeLayoutConfig,
  RuntimeLayoutDuplicateSubsystem,
  RuntimeLayoutValidationOutput,
} from '../types/project.js';

const DEFAULT_RUNTIME_LAYOUT_CONFIG: RuntimeLayoutConfig = {
  canonicalLayoutId: 'godot-src-v1',
  authoritativeRuntimeRoots: ['src', 'src/autoload', 'src/scenes', 'src/systems'],
  conflictingRuntimeRoots: ['scripts'],
  duplicateSubsystemRules: [
    { authoritative: 'src/autoload', conflicting: 'scripts/core' },
    { authoritative: 'src/scenes', conflicting: 'scripts/scenes' },
    { authoritative: 'src/systems', conflicting: 'scripts/systems' },
    { authoritative: 'src', conflicting: 'scripts' },
  ],
  allowMixedActiveLayouts: false,
};

interface HarnessConfigRuntimeLayout {
  canonicalLayoutId?: unknown;
  authoritativeRuntimeRoots?: unknown;
  conflictingRuntimeRoots?: unknown;
  duplicateSubsystemRules?: unknown;
  allowMixedActiveLayouts?: unknown;
}

export function getDefaultRuntimeLayoutConfig(): RuntimeLayoutConfig {
  return {
    canonicalLayoutId: DEFAULT_RUNTIME_LAYOUT_CONFIG.canonicalLayoutId,
    authoritativeRuntimeRoots: [...DEFAULT_RUNTIME_LAYOUT_CONFIG.authoritativeRuntimeRoots],
    conflictingRuntimeRoots: [...DEFAULT_RUNTIME_LAYOUT_CONFIG.conflictingRuntimeRoots],
    duplicateSubsystemRules: DEFAULT_RUNTIME_LAYOUT_CONFIG.duplicateSubsystemRules.map((rule) => ({
      authoritative: rule.authoritative,
      conflicting: rule.conflicting,
    })),
    allowMixedActiveLayouts: DEFAULT_RUNTIME_LAYOUT_CONFIG.allowMixedActiveLayouts,
  };
}

export async function loadRuntimeLayoutConfig(projectPath: string): Promise<RuntimeLayoutConfig> {
  const configPath = join(projectPath, 'harness', 'config.json');
  if (!existsSync(configPath)) {
    return getDefaultRuntimeLayoutConfig();
  }

  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { runtimeLayout?: HarnessConfigRuntimeLayout };
    return mergeRuntimeLayoutConfig(parsed.runtimeLayout);
  } catch {
    return getDefaultRuntimeLayoutConfig();
  }
}

export async function validateRuntimeLayout(
  projectPath: string,
): Promise<RuntimeLayoutValidationOutput> {
  const config = await loadRuntimeLayoutConfig(projectPath);

  const activeAuthoritativeRoots = await findActiveRoots(projectPath, config.authoritativeRuntimeRoots);
  const activeConflictingRoots = await findActiveRoots(projectPath, config.conflictingRuntimeRoots);
  const duplicateSubsystems = await collectDuplicateSubsystems(projectPath, config.duplicateSubsystemRules);
  const projectRefs = await readProjectRootReferences(projectPath);

  const issues: string[] = [];
  const hasMixedActiveRoots = activeAuthoritativeRoots.length > 0 && activeConflictingRoots.length > 0;
  const hasMixedProjectRefs = projectRefs.hasSrcRefs && projectRefs.hasScriptsRefs;

  if ((hasMixedActiveRoots || hasMixedProjectRefs) && !config.allowMixedActiveLayouts) {
    const activeRoots = [...activeAuthoritativeRoots, ...activeConflictingRoots].join(', ');
    issues.push(
      activeRoots.length > 0
        ? `Mixed active runtime layout detected across roots: ${activeRoots}`
        : 'Mixed runtime layout detected via project.godot resource references',
    );
  }

  for (const duplicate of duplicateSubsystems) {
    issues.push(
      `Duplicate subsystem "${duplicate.subsystem}" found in ${duplicate.authoritativePath} and ${duplicate.conflictingPath}`,
    );
  }

  return {
    success: issues.length === 0,
    canonicalLayoutId: config.canonicalLayoutId,
    allowMixedActiveLayouts: config.allowMixedActiveLayouts,
    authoritativeRuntimeRoots: [...config.authoritativeRuntimeRoots],
    conflictingRuntimeRoots: [...config.conflictingRuntimeRoots],
    activeRuntimeRoots: [...activeAuthoritativeRoots, ...activeConflictingRoots],
    duplicateSubsystems,
    issues,
  };
}

export function formatRuntimeLayoutIssues(result: RuntimeLayoutValidationOutput): string[] {
  const lines = [
    `Canonical layout: ${result.canonicalLayoutId}`,
    `Authoritative roots: ${result.authoritativeRuntimeRoots.join(', ')}`,
  ];

  if (result.conflictingRuntimeRoots.length > 0) {
    lines.push(`Conflicting roots: ${result.conflictingRuntimeRoots.join(', ')}`);
  }

  if (result.activeRuntimeRoots.length > 0) {
    lines.push(`Active roots: ${result.activeRuntimeRoots.join(', ')}`);
  }

  return [...lines, ...result.issues];
}

async function findActiveRoots(projectPath: string, roots: string[]): Promise<string[]> {
  const active: string[] = [];

  for (const root of roots) {
    const absoluteRoot = join(projectPath, root);
    if (!existsSync(absoluteRoot)) {
      continue;
    }

    const matches = await glob('**/*.{gd,tscn}', {
      cwd: absoluteRoot,
      nodir: true,
      ignore: ['.godot/**', 'builds/**', 'node_modules/**'],
    });

    if (matches.length > 0) {
      active.push(root);
    }
  }

  return active;
}

async function collectDuplicateSubsystems(
  projectPath: string,
  rules: RuntimeLayoutRule[],
): Promise<RuntimeLayoutDuplicateSubsystem[]> {
  const duplicates = new Map<string, RuntimeLayoutDuplicateSubsystem>();

  for (const rule of rules) {
    const authoritativeFiles = await collectScriptFiles(projectPath, rule.authoritative);
    const conflictingFiles = await collectScriptFiles(projectPath, rule.conflicting);

    if (authoritativeFiles.size === 0 || conflictingFiles.size === 0) {
      continue;
    }

    for (const [subsystem, authoritativePath] of authoritativeFiles.entries()) {
      const conflictingPath = conflictingFiles.get(subsystem);
      if (conflictingPath === undefined) {
        continue;
      }

      const key = `${subsystem}:${authoritativePath}:${conflictingPath}`;
      duplicates.set(key, {
        subsystem,
        authoritativePath,
        conflictingPath,
      });
    }
  }

  return [...duplicates.values()].sort((left, right) => left.subsystem.localeCompare(right.subsystem));
}

async function collectScriptFiles(
  projectPath: string,
  relativeRoot: string,
): Promise<Map<string, string>> {
  const absoluteRoot = join(projectPath, relativeRoot);
  if (!existsSync(absoluteRoot)) {
    return new Map();
  }

  const files = await glob('**/*.gd', {
    cwd: absoluteRoot,
    nodir: true,
    ignore: ['.godot/**', 'builds/**', 'node_modules/**'],
  });

  const result = new Map<string, string>();
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    const stem = normalized.split('/').pop()?.replace(/\.gd$/, '');
    if (stem === undefined || stem.length === 0) {
      continue;
    }
    result.set(stem, `${relativeRoot}/${normalized}`.replace(/\\/g, '/'));
  }

  return result;
}

async function readProjectRootReferences(
  projectPath: string,
): Promise<{ hasSrcRefs: boolean; hasScriptsRefs: boolean }> {
  const projectFile = join(projectPath, 'project.godot');
  if (!existsSync(projectFile)) {
    return { hasSrcRefs: false, hasScriptsRefs: false };
  }

  try {
    const source = await readFile(projectFile, 'utf8');
    return {
      hasSrcRefs: source.includes('res://src/'),
      hasScriptsRefs: source.includes('res://scripts/'),
    };
  } catch {
    return { hasSrcRefs: false, hasScriptsRefs: false };
  }
}

function mergeRuntimeLayoutConfig(
  candidate: HarnessConfigRuntimeLayout | undefined,
): RuntimeLayoutConfig {
  const defaults = getDefaultRuntimeLayoutConfig();

  if (candidate === undefined) {
    return defaults;
  }

  const authoritativeRuntimeRoots = Array.isArray(candidate.authoritativeRuntimeRoots)
    ? candidate.authoritativeRuntimeRoots.filter((value): value is string => typeof value === 'string')
    : defaults.authoritativeRuntimeRoots;

  const conflictingRuntimeRoots = Array.isArray(candidate.conflictingRuntimeRoots)
    ? candidate.conflictingRuntimeRoots.filter((value): value is string => typeof value === 'string')
    : defaults.conflictingRuntimeRoots;

  const duplicateSubsystemRules = Array.isArray(candidate.duplicateSubsystemRules)
    ? candidate.duplicateSubsystemRules
      .filter((value): value is { authoritative?: unknown; conflicting?: unknown } => typeof value === 'object' && value !== null)
      .flatMap((value) => (
        typeof value.authoritative === 'string' && typeof value.conflicting === 'string'
          ? [{ authoritative: value.authoritative, conflicting: value.conflicting }]
          : []
      ))
    : defaults.duplicateSubsystemRules;

  return {
    canonicalLayoutId: typeof candidate.canonicalLayoutId === 'string'
      ? candidate.canonicalLayoutId
      : defaults.canonicalLayoutId,
    authoritativeRuntimeRoots,
    conflictingRuntimeRoots,
    duplicateSubsystemRules,
    allowMixedActiveLayouts: typeof candidate.allowMixedActiveLayouts === 'boolean'
      ? candidate.allowMixedActiveLayouts
      : defaults.allowMixedActiveLayouts,
  };
}
