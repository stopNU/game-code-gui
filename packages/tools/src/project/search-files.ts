import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { resolve } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';

interface SearchFilesInput {
  pattern: string;
  fileGlob?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

interface SearchFilesOutput {
  pattern: string;
  matches: SearchMatch[];
  totalFiles: number;
  totalMatches: number;
}

export const searchFilesTool: ToolContract<SearchFilesInput, SearchFilesOutput> = {
  name: 'project__searchFiles',
  group: 'project',
  description: 'Search for a text pattern across project files. Returns matching lines with context.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text or regex to search for' },
      fileGlob: { type: 'string', description: 'Glob pattern to filter files (default: **/*.ts)' },
      caseSensitive: { type: 'boolean', default: true },
      maxResults: { type: 'number', default: 50 },
    },
    required: ['pattern'],
  },
  outputSchema: { type: 'object' },
  permissions: ['fs:read'],
  async execute(input: SearchFilesInput, ctx: ToolExecutionContext): Promise<SearchFilesOutput> {
    const fileGlob = input.fileGlob ?? '**/*.ts';
    const files = await glob(fileGlob, {
      cwd: ctx.projectPath,
      ignore: ['node_modules/**', 'dist/**'],
      absolute: false,
    });

    const regex = new RegExp(input.pattern, input.caseSensitive === false ? 'gi' : 'g');
    const matches: SearchMatch[] = [];
    const maxResults = input.maxResults ?? 50;
    let totalFiles = 0;

    for (const file of files) {
      if (matches.length >= maxResults) break;
      const content = await readFile(resolve(ctx.projectPath, file), 'utf8');
      const lines = content.split('\n');
      let fileMatched = false;

      lines.forEach((lineText, i) => {
        if (matches.length >= maxResults) return;
        regex.lastIndex = 0;
        const m = regex.exec(lineText);
        if (m) {
          if (!fileMatched) { totalFiles++; fileMatched = true; }
          matches.push({ file, line: i + 1, column: m.index + 1, text: lineText.trim() });
        }
      });
    }

    return { pattern: input.pattern, matches, totalFiles, totalMatches: matches.length };
  },
};
