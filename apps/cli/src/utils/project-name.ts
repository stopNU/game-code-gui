import { resolve } from 'path';

export function slugifyProjectName(name: string): string {
  const normalized = name
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'game';
}

export function resolveProjectOutputPath(output: string | undefined, gameName: string): string {
  if (output) {
    return resolve(process.cwd(), output);
  }

  return resolve(process.cwd(), slugifyProjectName(gameName));
}
