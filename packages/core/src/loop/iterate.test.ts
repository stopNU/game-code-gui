import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFileMock = vi.fn();
const readdirMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('fs/promises', () => ({
  readFile: readFileMock,
  readdir: readdirMock,
  writeFile: vi.fn(),
}));

vi.mock('../claude/client.js', () => ({
  ClaudeClient: vi.fn().mockImplementation(() => ({
    sendMessage: sendMessageMock,
  })),
}));

describe('planIteration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readdirMock.mockResolvedValue([]);
    readFileMock.mockResolvedValue(JSON.stringify({
      gameTitle: 'Dragon Cards',
      gameBrief: 'Fight dragons with cards.',
      phases: [],
    }));
    sendMessageMock.mockResolvedValue({
      message: {
        content: JSON.stringify([
          {
            id: 'feature-1',
            phase: 1,
            role: 'systems',
            title: 'Add relic hooks',
            description: 'Add relic hooks to the combat loop.',
            acceptanceCriteria: ['Relics can react to combat events'],
            dependencies: [],
            toolsAllowed: ['code'],
          },
        ]),
      },
    });
  });

  it('passes the requested Anthropic model through to ClaudeClient', async () => {
    const { planIteration, FEATURE_PHASE } = await import('./iterate.js');

    const tasks = await planIteration(
      'D:/tmp/project',
      'feature',
      'Add relic hooks',
      { model: 'claude-opus-4-6' },
    );

    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-opus-4-6',
    }));
    expect(tasks[0]?.phase).toBe(FEATURE_PHASE);
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
