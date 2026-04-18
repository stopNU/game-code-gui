import path from 'path';

export function normalizePath(inputPath: string): string {
  const normalized = path.win32.normalize(inputPath.replace(/\//g, '\\'));
  return normalized.toLowerCase().replace(/\\/g, '/');
}

export function isPathInsideRoot(targetPath: string, workspaceRoot: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedRoot = normalizePath(workspaceRoot).replace(/\/+$/, '');

  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}
