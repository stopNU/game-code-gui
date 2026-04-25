import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { assertWritablePath } from '../guards/protected-paths.js';

interface ApplyPatchInput {
  path: string;
  oldString: string;
  newString: string;
  all?: boolean;
}

interface ApplyPatchOutput {
  path: string;
  replacements: number;
  success: boolean;
}

export const applyPatchTool: ToolContract<ApplyPatchInput, ApplyPatchOutput> = {
  name: 'code__applyPatch',
  group: 'code',
  description:
    'Replace an exact string in a file with new content. Use for targeted edits. Set all=true to replace all occurrences.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relative to project root' },
      oldString: { type: 'string', description: 'Exact text to find and replace' },
      newString: { type: 'string', description: 'Replacement text' },
      all: { type: 'boolean', description: 'Replace all occurrences (default: false)' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  outputSchema: { type: 'object' },
  permissions: ['fs:read', 'fs:write'],
  async execute(input: ApplyPatchInput, ctx: ToolExecutionContext): Promise<ApplyPatchOutput> {
    const fullPath = resolve(ctx.projectPath, input.path);
    assertWritablePath(ctx.projectPath, fullPath, 'code__applyPatch');
    const content = await readFile(fullPath, 'utf8');

    if (!content.includes(input.oldString)) {
      throw new Error(`String not found in ${input.path}: "${input.oldString.slice(0, 80)}..."`);
    }

    let newContent: string;
    let replacements = 0;

    if (input.all) {
      newContent = content.split(input.oldString).join(input.newString);
      replacements = content.split(input.oldString).length - 1;
    } else {
      newContent = content.replace(input.oldString, input.newString);
      replacements = 1;
    }

    await writeFile(fullPath, newContent, 'utf8');
    return { path: input.path, replacements, success: true };
  },
};
