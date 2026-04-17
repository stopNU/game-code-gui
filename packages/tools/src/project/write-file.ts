import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';

interface WriteFileInput {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

interface WriteFileOutput {
  path: string;
  size: number;
  created: boolean;
}

export const writeFileTool: ToolContract<WriteFileInput, WriteFileOutput> = {
  name: 'project__writeFile',
  group: 'project',
  description: 'Write content to a file in the project directory. Creates parent dirs as needed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to project root' },
      content: { type: 'string', description: 'File content to write' },
      encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' },
    },
    required: ['path', 'content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      size: { type: 'number' },
      created: { type: 'boolean' },
    },
  },
  permissions: ['fs:write'],
  async execute(input: WriteFileInput, ctx: ToolExecutionContext): Promise<WriteFileOutput> {
    const fullPath = resolve(ctx.projectPath, input.path);
    await mkdir(dirname(fullPath), { recursive: true });
    const encoding = (input.encoding ?? 'utf8') as BufferEncoding;
    await writeFile(fullPath, input.content, encoding);
    return { path: input.path, size: input.content.length, created: true };
  },
};
