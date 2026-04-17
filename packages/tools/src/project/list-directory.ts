import { readdir, stat } from 'fs/promises';
import { resolve, join } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';

interface ListDirectoryInput {
  path?: string;
  recursive?: boolean;
  extensions?: string[];
}

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

interface ListDirectoryOutput {
  path: string;
  entries: FileEntry[];
  total: number;
}

export const listDirectoryTool: ToolContract<ListDirectoryInput, ListDirectoryOutput> = {
  name: 'project__listDirectory',
  group: 'project',
  description: 'List files in the project directory. Optionally recursive and filtered by extension.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to project root (default: root)' },
      recursive: { type: 'boolean', default: false },
      extensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'File extensions to include, e.g. [".ts", ".json"]',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      entries: { type: 'array' },
      total: { type: 'number' },
    },
  },
  permissions: ['fs:read'],
  async execute(input: ListDirectoryInput, ctx: ToolExecutionContext): Promise<ListDirectoryOutput> {
    const basePath = input.path ?? '.';
    const fullPath = resolve(ctx.projectPath, basePath);
    const entries = await collectEntries(fullPath, basePath, input.recursive ?? false, input.extensions);
    return { path: basePath, entries, total: entries.length };
  },
};

async function collectEntries(
  fullPath: string,
  relPath: string,
  recursive: boolean,
  extensions?: string[],
): Promise<FileEntry[]> {
  const items = await readdir(fullPath);
  const results: FileEntry[] = [];

  for (const item of items) {
    if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
    const itemFull = join(fullPath, item);
    const itemRel = join(relPath, item);
    const s = await stat(itemFull);

    if (s.isDirectory()) {
      results.push({ path: itemRel, type: 'directory' });
      if (recursive) {
        const children = await collectEntries(itemFull, itemRel, true, extensions);
        results.push(...children);
      }
    } else {
      if (extensions && !extensions.some((ext) => item.endsWith(ext))) continue;
      results.push({ path: itemRel, type: 'file', size: s.size });
    }
  }

  return results;
}
