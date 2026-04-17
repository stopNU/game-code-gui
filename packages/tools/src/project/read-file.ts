import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { READ_MAX_LINES, formatLines } from '../truncate.js';

interface ReadFileInput {
  path: string;
  encoding?: 'utf8' | 'base64';
  /** 1-based line number to start reading from (default: 1). */
  startLine?: number;
  /** 1-based line number to stop reading at (inclusive). At most READ_MAX_LINES lines are returned. */
  endLine?: number;
}

interface ReadFileOutput {
  path: string;
  content: string;
  encoding: string;
  /** Total number of lines in the file (utf8 only). */
  totalLines: number;
  /** First line number included in content (1-based). */
  startLine: number;
  /** Last line number included in content (1-based). */
  endLine: number;
  /** True when the file has more content than was returned. */
  truncated: boolean;
}

export const readFileTool: ToolContract<ReadFileInput, ReadFileOutput> = {
  name: 'project__readFile',
  group: 'project',
  description:
    'Read a file from the project directory. Returns up to 200 lines (1-based). ' +
    'Use startLine/endLine for large files; totalLines in the response shows remaining sections.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to project root' },
      encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' },
      startLine: { type: 'number', description: '1-based line to start from (default: 1)' },
      endLine: { type: 'number', description: '1-based last line to include (capped at startLine + 199)' },
    },
    required: ['path'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      encoding: { type: 'string' },
      totalLines: { type: 'number' },
      startLine: { type: 'number' },
      endLine: { type: 'number' },
      truncated: { type: 'boolean' },
    },
  },
  permissions: ['fs:read'],
  async execute(input: ReadFileInput, ctx: ToolExecutionContext): Promise<ReadFileOutput> {
    const fullPath = resolve(ctx.projectPath, input.path);
    const encoding = input.encoding ?? 'utf8';

    if (encoding === 'base64') {
      const content = await readFile(fullPath, 'base64');
      return { path: input.path, content, encoding, totalLines: 0, startLine: 0, endLine: 0, truncated: false };
    }

    const raw = await readFile(fullPath, 'utf8');
    const allLines = raw.split('\n');
    const totalLines = allLines.length;

    const startLine = Math.max(1, Math.floor(input.startLine ?? 1));
    // Cap window at READ_MAX_LINES regardless of what the caller requested
    const requestedEnd = input.endLine !== undefined ? Math.floor(input.endLine) : startLine + READ_MAX_LINES - 1;
    const endLine = Math.min(totalLines, requestedEnd, startLine + READ_MAX_LINES - 1);

    const sliced = allLines.slice(startLine - 1, endLine);
    const content = formatLines(sliced, startLine, totalLines);
    const truncated = endLine < totalLines || startLine > 1;

    return { path: input.path, content, encoding, totalLines, startLine, endLine, truncated };
  },
};
