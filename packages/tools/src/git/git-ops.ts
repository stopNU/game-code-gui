import { simpleGit } from 'simple-git';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { truncateTail, DIFF_MAX_LINES } from '../truncate.js';

// git.status
interface GitStatusOutput {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  isClean: boolean;
}

export const gitStatusTool: ToolContract<Record<string, never>, GitStatusOutput> = {
  name: 'git__status',
  group: 'git',
  description: 'Get current git status of the project.',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object' },
  permissions: ['git:read'],
  async execute(_input: Record<string, never>, ctx: ToolExecutionContext): Promise<GitStatusOutput> {
    const git = simpleGit(ctx.projectPath);
    const status = await git.status();
    return {
      staged: status.staged,
      unstaged: status.modified,
      untracked: status.not_added,
      isClean: status.isClean(),
    };
  },
};

// git.diff
interface GitDiffInput {
  staged?: boolean;
  filePath?: string;
}

interface GitDiffOutput {
  diff: string;
  truncated: boolean;
}

export const gitDiffTool: ToolContract<GitDiffInput, GitDiffOutput> = {
  name: 'git__diff',
  group: 'git',
  description:
    `Get diff of current changes. Capped at ${DIFF_MAX_LINES} lines. ` +
    'Use filePath to narrow to a specific file if the diff is truncated.',
  inputSchema: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged diff (default: false)' },
      filePath: { type: 'string', description: 'Limit diff to a specific file' },
    },
  },
  outputSchema: { type: 'object' },
  permissions: ['git:read'],
  async execute(input: GitDiffInput, ctx: ToolExecutionContext): Promise<GitDiffOutput> {
    const git = simpleGit(ctx.projectPath);
    const args = input.staged ? ['--staged'] : [];
    if (input.filePath) args.push('--', input.filePath);
    const raw = await git.diff(args);
    const { text: diff, truncated } = truncateTail(raw, DIFF_MAX_LINES);
    return { diff, truncated };
  },
};

// git.commit
interface GitCommitInput {
  message: string;
  addAll?: boolean;
}

interface GitCommitOutput {
  hash: string;
  message: string;
  filesChanged: number;
}

export const gitCommitTool: ToolContract<GitCommitInput, GitCommitOutput> = {
  name: 'git__commit',
  group: 'git',
  description: 'Stage and commit changes with a message.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message' },
      addAll: { type: 'boolean', description: 'Stage all changes before commit (default: true)' },
    },
    required: ['message'],
  },
  outputSchema: { type: 'object' },
  permissions: ['git:write'],
  async execute(input: GitCommitInput, ctx: ToolExecutionContext): Promise<GitCommitOutput> {
    const git = simpleGit(ctx.projectPath);
    if (input.addAll !== false) await git.add('-A');
    const result = await git.commit(input.message);
    return {
      hash: result.commit,
      message: input.message,
      filesChanged: result.summary.changes,
    };
  },
};
