import { randomUUID } from 'crypto';
import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  RuntimeErrorSummary,
  RuntimeLogIndex,
  RuntimeLogMode,
  RuntimeLogReference,
} from '../types/project.js';

const HARNESS_LOG_DIR = join('harness', 'logs');
const RUNTIME_LOG_INDEX_PATH = join(HARNESS_LOG_DIR, 'latest.json');
const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /Parse Error/i,
  /Script Error/i,
  /Unhandled/i,
  /Invalid call/i,
  /Attempt to call/i,
  /Failed to/i,
  /\bERR(?:OR)?\b/i,
];

export function getRuntimeLogDir(projectPath: string): string {
  return join(projectPath, HARNESS_LOG_DIR);
}

export function getRuntimeLogIndexPath(projectPath: string): string {
  return join(projectPath, RUNTIME_LOG_INDEX_PATH);
}

export async function createRuntimeLogReference(
  projectPath: string,
  mode: RuntimeLogMode,
): Promise<RuntimeLogReference> {
  const logDir = getRuntimeLogDir(projectPath);
  await mkdir(logDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const safeTimestamp = startedAt.replace(/[:.]/g, '-');
  const logPath = join(logDir, `${safeTimestamp}-${mode}-${randomUUID().slice(0, 8)}.log`);
  const reference: RuntimeLogReference = { mode, startedAt, logPath };

  await writeFile(logPath, '', 'utf8');
  await writeRuntimeLogIndex(projectPath, reference);
  return reference;
}

export async function writeRuntimeLog(
  projectPath: string,
  reference: RuntimeLogReference,
  content: string,
): Promise<RuntimeLogReference> {
  await mkdir(getRuntimeLogDir(projectPath), { recursive: true });
  await writeFile(reference.logPath, content, 'utf8');
  await writeRuntimeLogIndex(projectPath, reference);
  return reference;
}

export async function readRuntimeLogIndex(projectPath: string): Promise<RuntimeLogIndex> {
  try {
    const raw = await readFile(getRuntimeLogIndexPath(projectPath), 'utf8');
    const parsed = JSON.parse(raw) as RuntimeLogIndex;
    return { byMode: parsed.byMode ?? {}, ...(parsed.latest !== undefined ? { latest: parsed.latest } : {}) };
  } catch {
    return { byMode: {} };
  }
}

export async function resolveLatestRuntimeLog(
  projectPath: string,
  mode?: RuntimeLogMode,
): Promise<RuntimeLogReference | null> {
  const index = await readRuntimeLogIndex(projectPath);
  const reference = mode === undefined ? index.latest : index.byMode[mode];
  if (reference === undefined) {
    return null;
  }

  try {
    await access(reference.logPath);
    return reference;
  } catch {
    return null;
  }
}

export async function readRuntimeErrorSummary(
  projectPath: string,
  mode?: RuntimeLogMode,
  maxLines = 5,
): Promise<RuntimeErrorSummary | null> {
  const reference = await resolveLatestRuntimeLog(projectPath, mode);
  if (reference === null) {
    return null;
  }

  let raw = '';
  try {
    raw = await readFile(reference.logPath, 'utf8');
  } catch {
    raw = '';
  }

  const summarized = summarizeRuntimeErrors(raw, maxLines);
  return {
    logPath: reference.logPath,
    mode: reference.mode,
    startedAt: reference.startedAt,
    totalMatches: summarized.totalMatches,
    lines: summarized.lines,
  };
}

export function summarizeRuntimeErrors(
  logContent: string,
  maxLines = 5,
): Pick<RuntimeErrorSummary, 'totalMatches' | 'lines'> {
  const lines = logContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const matches: string[] = [];
  for (const line of lines) {
    if (ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
      matches.push(line);
    }
  }

  const deduped: string[] = [];
  for (const line of matches) {
    if (!deduped.includes(line)) {
      deduped.push(line);
    }
  }

  return {
    totalMatches: matches.length,
    lines: deduped.slice(0, maxLines),
  };
}

async function writeRuntimeLogIndex(
  projectPath: string,
  latestReference: RuntimeLogReference,
): Promise<void> {
  const current = await readRuntimeLogIndex(projectPath);
  const index: RuntimeLogIndex = {
    latest: latestReference,
    byMode: {
      ...current.byMode,
      [latestReference.mode]: latestReference,
    },
  };

  await mkdir(getRuntimeLogDir(projectPath), { recursive: true });
  await writeFile(getRuntimeLogIndexPath(projectPath), JSON.stringify(index, null, 2), 'utf8');
}
