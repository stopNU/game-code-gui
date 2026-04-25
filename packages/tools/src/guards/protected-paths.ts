import { relative, resolve, sep } from 'path';

/**
 * Paths inside a project that the agent is not allowed to write to directly.
 * These are managed by the harness runner (e.g. ImplementTaskRunner) and direct
 * agent edits would bypass type-safe state transitions and cause UI/state drift.
 *
 * Stored as POSIX-style relative paths. Compared case-insensitively on Windows.
 */
const PROTECTED_RELATIVE_PATHS: readonly string[] = [
  'harness/tasks.json',
];

const isWindows = process.platform === 'win32';

function normalizeRelative(input: string): string {
  const normalized = input.split(sep).join('/');
  return isWindows ? normalized.toLowerCase() : normalized;
}

/**
 * Throws if `fullPath` resolves to a path the agent is not permitted to write.
 *
 * @param projectPath Absolute project root.
 * @param fullPath    Absolute path the tool is about to write to.
 * @param toolName    Name of the calling tool, used in the error message.
 */
export function assertWritablePath(projectPath: string, fullPath: string, toolName: string): void {
  const rel = relative(resolve(projectPath), resolve(fullPath));
  if (rel.startsWith('..') || resolve(fullPath) === resolve(projectPath)) {
    return;
  }

  const normalizedRel = normalizeRelative(rel);
  for (const protectedPath of PROTECTED_RELATIVE_PATHS) {
    const protectedNormalized = normalizeRelative(protectedPath);
    if (normalizedRel === protectedNormalized) {
      throw new Error(
        `${toolName}: refusing to write protected path "${protectedPath}". ` +
          `This file is managed by the task runner. To change task status, invoke the implement_task tool ` +
          `(or ImplementTaskRunner) instead of editing it directly.`,
      );
    }
  }
}
