import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory-store.js';
import type { TaskState, TaskResult } from '../types/task.js';

describe('MemoryStore', () => {
  it('returns dependency summaries by task dependency id', () => {
    const store = new MemoryStore('project-1');
    const dependencyTask = createTask('task-a', []);
    const dependencyResult = createResult('Implemented harnessState.playerX and scene transitions.');

    store.setTaskSummary(dependencyTask, dependencyResult);

    const dependentTask = createTask('task-b', ['task-a']);
    const summaries = store.dependencySummaries(dependentTask);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.key).toBe('task:task-a:summary');
    expect(summaries[0]?.value).toContain('harnessState.playerX');
  });
});

function createTask(id: string, dependencies: string[]): TaskState {
  return {
    id,
    phase: 2,
    role: 'gameplay',
    status: 'pending',
    title: `Task ${id}`,
    description: `Description for ${id}`,
    brief: `Brief for ${id}`,
    acceptanceCriteria: ['Criterion A', 'Criterion B'],
    dependencies,
    toolsAllowed: ['project'],
    retries: 0,
    maxRetries: 0,
    context: {
      projectPath: 'D:/tmp/project',
      gameSpec: '',
      relevantFiles: [],
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
    },
    createdAt: '2026-04-06T00:00:00.000Z',
    updatedAt: '2026-04-06T00:00:00.000Z',
  };
}

function createResult(summary: string): TaskResult {
  return {
    success: true,
    summary,
    filesModified: ['src/game/scenes/GameScene.ts'],
    toolCallCount: 3,
    tokensUsed: { input: 10, output: 20, cached: 0 },
  };
}
