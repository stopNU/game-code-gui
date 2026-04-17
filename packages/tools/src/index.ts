// Project tools
export { readFileTool } from './project/read-file.js';
export { writeFileTool } from './project/write-file.js';
export { listDirectoryTool } from './project/list-directory.js';
export { searchFilesTool } from './project/search-files.js';

// Code tools
export { applyPatchTool } from './code/apply-patch.js';
export { insertBlockTool } from './code/insert-block.js';

// Npm tools
export { runScriptTool, runScript } from './npm/run-script.js';
export { installDepsTool, installDeps } from './npm/install-deps.js';

// Git tools
export { gitStatusTool, gitDiffTool, gitCommitTool } from './git/git-ops.js';

// Asset tools
export { generateImageTool } from './asset/generate-image.js';
export { generateBatchTool } from './asset/generate-batch.js';

// Convenience: all tools grouped by name
import { readFileTool } from './project/read-file.js';
import { writeFileTool } from './project/write-file.js';
import { listDirectoryTool } from './project/list-directory.js';
import { searchFilesTool } from './project/search-files.js';
import { applyPatchTool } from './code/apply-patch.js';
import { insertBlockTool } from './code/insert-block.js';
import { runScriptTool } from './npm/run-script.js';
import { installDepsTool } from './npm/install-deps.js';
import { gitStatusTool, gitDiffTool, gitCommitTool } from './git/git-ops.js';
import { generateImageTool } from './asset/generate-image.js';
import { generateBatchTool } from './asset/generate-batch.js';
import type { ToolContract } from '@agent-harness/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: ToolContract<any, any>[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  searchFilesTool,
  applyPatchTool,
  insertBlockTool,
  runScriptTool,
  installDepsTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  generateImageTool,
  generateBatchTool,
];
