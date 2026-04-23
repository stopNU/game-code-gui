import { describe, expect, it, vi } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { runAgentLoop } from './agent-loop.js';
import type { AgentContext } from '../types/agent.js';
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
  it('returns success when model returns no tool calls', async () => {
    const model = createMockModel([
      new AIMessage('Task complete.'),
    ]);
    const result = await runAgentLoop(createContext(), { maxIterations: 3, retryPolicy }, { chatModel: model.instance, tools: [] });
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Task complete.');
  });

  it('executes tool calls and loops back to model', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tool: ToolContract<any, any> = {
      name: 'project__readFile',
      group: 'project',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      outputSchema: { type: 'object' },
      permissions: [],
      execute,
    };

    const toolCallMsg = new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'project__readFile', args: { path: 'src/index.ts' }, type: 'tool_call' }] });
    const finalMsg = new AIMessage('done');

    const model = createMockModel([toolCallMsg, finalMsg]);
    const result = await runAgentLoop(createContext(), { maxIterations: 5, retryPolicy }, { chatModel: model.instance, tools: [tool] });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(model.calls).toHaveLength(2);
  });

  it('blocks repeated identical tool calls', async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const tool: ToolContract<any, any> = {
      name: 'project__readFile',
      group: 'project',
      description: 'Read a file.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      outputSchema: { type: 'object' },
      permissions: [],
      execute,
    };

    const makeToolCall = () => new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'project__readFile', args: { path: 'src/index.ts' }, type: 'tool_call' as const }] });

    const model = createMockModel([
      makeToolCall(),
      makeToolCall(),
      makeToolCall(),
      new AIMessage('done'),
    ]);

    const result = await runAgentLoop(createContext(), { maxIterations: 5, retryPolicy }, { chatModel: model.instance, tools: [tool] });

    // Two real executions, third blocked by repeat stall
    expect(execute).toHaveBeenCalledTimes(2);
    // The fourth model call sees a tool_result with the stall error
    const lastMessages = model.calls[3] as BaseMessage[];
    const lastMsg = lastMessages?.at(-1);
    expect(lastMsg?.content).toContain('Repeated tool call detected');
  });

  it('passes AbortSignal and returns cancelled when aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const model = createMockModel([new AIMessage('should not reach')]);
    const result = await runAgentLoop(
      createContext(),
      { maxIterations: 3, retryPolicy, signal: controller.signal },
      { chatModel: model.instance, tools: [] },
    );

    expect(result.success).toBe(false);
    expect(result.summary).toContain('cancelled');
    expect(model.calls).toHaveLength(0);
  });

  it('seeds asset tasks with explicit asset planning context', async () => {
    const model = createMockModel([new AIMessage('done')]);
    const ctx = createContext();
    ctx.config.role = 'asset';
    ctx.task.role = 'asset';
    ctx.task.context.canvasWidth = 1024;
    ctx.task.context.canvasHeight = 768;
    ctx.task.context.visualStyle = 'Chunky pixel art with warm desert colors.';
    ctx.task.context.plannedEntities = ['Player', 'Scarab', 'Coin'];
    ctx.task.context.scenesNeedingBackgrounds = ['MenuScene', 'GameScene', 'ResultScene'];
    ctx.task.context.plannedAssets = ['player sprite', 'scarab sprite', 'desert background'];

    await runAgentLoop(ctx, { maxIterations: 1, retryPolicy }, { chatModel: model.instance, tools: [] });

    const firstMessages = model.calls[0] as BaseMessage[];
    // The second message is the HumanMessage with the task prompt
    const humanMsg = firstMessages?.[1];
    const content = typeof humanMsg?.content === 'string' ? humanMsg.content : JSON.stringify(humanMsg?.content);
    expect(content).toContain('Asset Planning Context');
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

function createMockModel(responses: AIMessage[]): {
  calls: BaseMessage[][];
  instance: BaseChatModel;
} {
  const calls: BaseMessage[][] = [];
  const instance = {
    bindTools() { return this; },
    async invoke(messages: BaseMessage[]) {
      calls.push([...messages]);
      const response = responses.shift();
      if (!response) throw new Error('No mock response available');
      return response;
    },
  } as unknown as BaseChatModel;

  return { calls, instance };
}
