import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { assertWritablePath } from '../guards/protected-paths.js';

interface InsertBlockInput {
  path: string;
  content: string;
  position: 'before' | 'after' | 'end' | 'start';
  anchor?: string;
}

interface InsertBlockOutput {
  path: string;
  insertedAt: string;
  success: boolean;
}

export const insertBlockTool: ToolContract<InsertBlockInput, InsertBlockOutput> = {
  name: 'code__insertBlock',
  group: 'code',
  description:
    'Insert a block of code into a file at a specific position. Use anchor to place before/after a specific line.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string', description: 'Code to insert' },
      position: {
        type: 'string',
        enum: ['before', 'after', 'end', 'start'],
        description: '"start"/"end" for file boundaries; "before"/"after" requires anchor',
      },
      anchor: {
        type: 'string',
        description: 'Exact line text to insert before/after (required if position is before/after)',
      },
    },
    required: ['path', 'content', 'position'],
  },
  outputSchema: { type: 'object' },
  permissions: ['fs:read', 'fs:write'],
  async execute(input: InsertBlockInput, ctx: ToolExecutionContext): Promise<InsertBlockOutput> {
    const fullPath = resolve(ctx.projectPath, input.path);
    assertWritablePath(ctx.projectPath, fullPath, 'code__insertBlock');
    const fileContent = await readFile(fullPath, 'utf8');
    let result: string;
    let insertedAt: string;

    if (input.position === 'start') {
      result = input.content + '\n' + fileContent;
      insertedAt = 'file start';
    } else if (input.position === 'end') {
      result = fileContent.trimEnd() + '\n' + input.content + '\n';
      insertedAt = 'file end';
    } else {
      if (!input.anchor) throw new Error('"before"/"after" requires an anchor string');
      if (!fileContent.includes(input.anchor)) {
        throw new Error(`Anchor not found in ${input.path}: "${input.anchor.slice(0, 80)}"`);
      }
      if (input.position === 'before') {
        result = fileContent.replace(input.anchor, input.content + '\n' + input.anchor);
      } else {
        result = fileContent.replace(input.anchor, input.anchor + '\n' + input.content);
      }
      insertedAt = `${input.position} anchor`;
    }

    await writeFile(fullPath, result, 'utf8');
    return { path: input.path, insertedAt, success: true };
  },
};
