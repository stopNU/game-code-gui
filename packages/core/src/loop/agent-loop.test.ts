import { describe, expect, it, vi } from 'vitest';
import { ClaudeClient } from '../claude/client.js';
import { runAgentLoop } from './agent-loop.js';
import type { AgentContext, ClaudeMessage } from '../types/agent.js';
import type { RetryPolicy } from '../types/agent.js';
import type { ToolContract } from '../types/tool.js';

const retryPolicy: RetryPolicy = {
  maxRetries: 0,
  baseDelayMs: 1,
  maxDelayMs: 1,
  backoffMultiplier: 1,
  retryableErrors: [],
};

describe('runAgentLoop', () => {
  it('returns a tool error instead of executing invalid tool input', async () => {
    const execute = vi.fn();
    const tool: ToolContract<any, any> = {
      name: 'project__readFile',
      group: 'project',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      outputSchema: { type: 'object' },
      permissions: [],
      execute,
    };

    const messages = [
      createToolUseResponse('call-1', 'project__readFile', {}),
      createEndTurnResponse('done'),
    ];
    const client = createMockClient(messages);

    const result = await runAgentLoop(createContext(), { maxIterations: 3, retryPolicy }, { client: client.instance, tools: [tool] });

    expect(result.success).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(client.calls).toHaveLength(2);
    expect((client.calls[1]?.messages as ClaudeMessage[]).at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call-1',
          content: 'Error: Invalid input for tool "project__readFile": missing required field "path"',
        },
      ],
    });
  });

  it('blocks repeated identical tool calls before max iterations', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tool: ToolContract<any, any> = {
      name: 'project__readFile',
      group: 'project',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      outputSchema: { type: 'object' },
      permissions: [],
      execute,
    };

    const repeatedCall = { path: 'src/index.ts' };
    const client = createMockClient([
      createToolUseResponse('call-1', 'project__readFile', repeatedCall),
      createToolUseResponse('call-2', 'project__readFile', repeatedCall),
      createToolUseResponse('call-3', 'project__readFile', repeatedCall),
      createEndTurnResponse('done'),
    ]);

    const result = await runAgentLoop(createContext(), { maxIterations: 5, retryPolicy }, { client: client.instance, tools: [tool] });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect((client.calls[3]?.messages as ClaudeMessage[]).at(-1)).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call-3',
          content:
            'Error: Repeated tool call detected for "project__readFile". Choose a different action or explain why the previous result was insufficient.',
        },
      ],
    });
  });

  it('fails fast when a tool_use turn contains no executable tool calls', async () => {
    const client = createMockClient([
      {
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use' }],
        },
        stopReason: 'tool_use',
      },
    ]);

    const result = await runAgentLoop(createContext(), { maxIterations: 1, retryPolicy }, { client: client.instance, tools: [] });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('did not provide any executable tool calls');
  });

  it('passes AbortSignal through to the client request', async () => {
    const client = createMockClient([createEndTurnResponse('done')]);
    const controller = new AbortController();

    await runAgentLoop(
      createContext(),
      { maxIterations: 1, retryPolicy, signal: controller.signal },
      { client: client.instance, tools: [] },
    );

    expect(client.calls[0]?.signal).toBe(controller.signal);
  });

  it('seeds asset tasks with explicit asset planning context', async () => {
    const client = createMockClient([createEndTurnResponse('done')]);
    const ctx = createContext();
    ctx.config.role = 'asset';
    ctx.task.role = 'asset';
    ctx.task.context.canvasWidth = 1024;
    ctx.task.context.canvasHeight = 768;
    ctx.task.context.visualStyle = 'Chunky pixel art with warm desert colors.';
    ctx.task.context.plannedEntities = ['Player', 'Scarab', 'Coin'];
    ctx.task.context.scenesNeedingBackgrounds = ['MenuScene', 'GameScene', 'ResultScene'];
    ctx.task.context.plannedAssets = ['player sprite', 'scarab sprite', 'desert background'];

    await runAgentLoop(ctx, { maxIterations: 1, retryPolicy }, { client: client.instance, tools: [] });

    const firstPrompt = ((client.calls[0]?.messages as ClaudeMessage[])[0]?.content) as string;
    expect(firstPrompt).toContain('**Asset Planning Context:**');
    expect(firstPrompt).toContain('Canvas size: 1024x768');
    expect(firstPrompt).toContain('Named entities requiring asset coverage: Player, Scarab, Coin');
    expect(firstPrompt).toContain('Scenes needing backgrounds: MenuScene, GameScene, ResultScene');
  });
});

function createContext(): AgentContext {
  return {
    config: {
      role: 'gameplay',
      model: 'claude-sonnet-4-6',
      maxTokens: 1024,
      temperature: 0,
      systemPrompt: 'You are helpful.',
      toolGroups: ['project'],
      memoryScope: 'project',
      permissions: { allowed: [], denied: [] },
    },
    task: {
      id: 'task-1',
      phase: 1,
      role: 'gameplay',
      status: 'pending',
      title: 'Test task',
      description: 'Do a thing.',
      brief: 'Brief',
      acceptanceCriteria: ['Works'],
      dependencies: [],
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
    },
    memory: [],
    conversationHistory: [],
    traceId: 'trace-1',
    iterationCount: 0,
    tokenBudget: 0,
    tokenUsed: 0,
  };
}

function createToolUseResponse(id: string, name: string, input: Record<string, unknown>) {
  return {
    message: {
      role: 'assistant' as const,
      content: [{ type: 'tool_use' as const, id, name, input }],
    },
    stopReason: 'tool_use',
  };
}

function createEndTurnResponse(text: string) {
  return {
    message: {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text }],
    },
    stopReason: 'end_turn',
  };
}

function createMockClient(
  responses: Array<{ message: ClaudeMessage; stopReason: string }>,
): {
  calls: Array<Record<string, unknown>>;
  instance: ClaudeClient;
} {
  const calls: Array<Record<string, unknown>> = [];
  const instance = {
    async sendMessage(opts: Record<string, unknown>) {
      calls.push({
        ...opts,
        ...(Array.isArray(opts.messages) ? { messages: structuredClone(opts.messages) } : {}),
      });
      const response = responses.shift();
      if (!response) {
        throw new Error('No mock response available');
      }

      return {
        ...response,
        tokens: { input: 1, output: 1, cached: 0 },
      };
    },
  } as unknown as ClaudeClient;

  return { calls, instance };
}
