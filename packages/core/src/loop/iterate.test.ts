import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileMock = vi.fn();
const readdirMock = vi.fn();
const writeFileMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
  readdir: readdirMock,
  writeFile: writeFileMock,
}));

vi.mock('../claude/client.js', () => ({
  ClaudeClient: vi.fn().mockImplementation(() => ({
    sendMessage: sendMessageMock,
  })),
}));

const baseLLMTask = {
  id: 'feat-relic-hooks',
  phase: 0,
  role: 'systems',
  title: 'Add relic hooks',
  description: 'Add relic hooks to the combat loop.',
  acceptanceCriteria: ['Relics can react to combat events'],
  dependencies: [],
  toolsAllowed: ['code'],
};

describe('planIteration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readdirMock.mockResolvedValue([]);
    readFileMock.mockResolvedValue(JSON.stringify({
      gameTitle: 'Dragon Cards',
      gameBrief: 'Fight dragons with cards.',
      phases: [],
    }));
    writeFileMock.mockResolvedValue(undefined);
    sendMessageMock.mockResolvedValue({
      message: { content: JSON.stringify([baseLLMTask]) },
    });
  });

  it('passes the requested Anthropic model through to ClaudeClient', async () => {
    const { planIteration } = await import('./iterate.js');

    const tasks = await planIteration(
      'D:/tmp/project',
      'feature',
      'Add relic hooks',
      { model: 'claude-opus-4-6' },
    );

    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-opus-4-6',
    }));
    expect(tasks).toHaveLength(1);
    // planIteration leaves a placeholder phase; appendIterationTasks resolves it.
    expect(tasks[0]?.phase).toBe(0);
  });

  it('rejects unsupported non-Anthropic models instead of silently falling back', async () => {
    const { planIteration } = await import('./iterate.js');

    await expect(planIteration(
      'D:/tmp/project',
      'feature',
      'Add relic hooks',
      { model: 'gpt-5.4' },
    )).rejects.toThrow('planIteration only supports Anthropic models right now');

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe('appendIterationTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeFileMock.mockResolvedValue(undefined);
  });

  function makeTask(id: string, deps: string[] = []) {
    return {
      id,
      phase: 0,
      role: 'gameplay',
      status: 'pending',
      title: id,
      description: id,
      brief: id,
      acceptanceCriteria: [],
      dependencies: deps,
      toolsAllowed: ['project'],
      retries: 0,
      maxRetries: 3,
      context: {
        projectPath: '',
        gameSpec: '',
        relevantFiles: [],
        memoryKeys: [],
        dependencySummaries: [],
        previousTaskSummaries: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    } as unknown as import('../types/task.js').TaskState;
  }

  it('lands bug tasks in phase 90 and reuses the phase on subsequent calls', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      gameTitle: 'X', gameBrief: 'Y', phases: [{ phase: 0, tasks: [] }],
    }));

    const { appendIterationTasks, BUG_PHASE } = await import('./iterate.js');
    const r1 = await appendIterationTasks('D:/p', 'bug', [makeTask('bug-foo')]);
    expect(r1.phase).toBe(BUG_PHASE);
    expect(r1.label).toBe('Bugs');
    expect(r1.taskIds).toEqual(['bug-foo']);

    // Second bug append — should land in same phase 90 with collision-safe id.
    const planAfterFirst = JSON.parse((writeFileMock.mock.calls.at(-1)![1] as string));
    readFileMock.mockResolvedValueOnce(JSON.stringify(planAfterFirst));

    const r2 = await appendIterationTasks('D:/p', 'bug', [makeTask('bug-foo')]);
    expect(r2.phase).toBe(BUG_PHASE);
    expect(r2.taskIds).toEqual(['bug-foo-2']);
  });

  it('gives each feature its own incrementing phase starting at 91', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      gameTitle: 'X', gameBrief: 'Y', phases: [{ phase: 0, tasks: [] }],
    }));

    const { appendIterationTasks } = await import('./iterate.js');
    const r1 = await appendIterationTasks('D:/p', 'feature', [makeTask('feat-jump')], { description: 'Add double jump' });
    expect(r1.phase).toBe(91);
    expect(r1.label).toBe('Feature: Add double jump');
    expect(r1.taskIds).toEqual(['feat-91-jump']);

    const planAfterFirst = JSON.parse((writeFileMock.mock.calls.at(-1)![1] as string));
    readFileMock.mockResolvedValueOnce(JSON.stringify(planAfterFirst));

    const r2 = await appendIterationTasks('D:/p', 'feature', [makeTask('feat-jump')], { label: 'Feature: Daily challenge' });
    expect(r2.phase).toBe(92);
    expect(r2.label).toBe('Feature: Daily challenge');
    expect(r2.taskIds).toEqual(['feat-92-jump']);
  });

  it('remaps inter-task dependencies when ids are rewritten', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      gameTitle: 'X', gameBrief: 'Y', phases: [],
    }));

    const { appendIterationTasks } = await import('./iterate.js');
    const r = await appendIterationTasks('D:/p', 'feature', [
      makeTask('feat-a'),
      makeTask('feat-b', ['feat-a']),
    ], { description: 'Add multi-task feature' });

    expect(r.taskIds).toEqual(['feat-91-a', 'feat-91-b']);
    const planJson = writeFileMock.mock.calls.at(-1)![1] as string;
    const written = JSON.parse(planJson) as { phases: Array<{ phase: number; tasks: Array<{ id: string; dependencies: string[] }> }> };
    const featurePhase = written.phases.find((p) => p.phase === 91)!;
    expect(featurePhase.tasks[1]?.dependencies).toEqual(['feat-91-a']);
  });
});
