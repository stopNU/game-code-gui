import { beforeEach, describe, expect, it } from 'vitest';
import { useConversationStore } from './conversation-store.js';

describe('conversation store', () => {
  beforeEach(() => {
    useConversationStore.getState().reset();
  });

  it('appends streaming assistant content and completes the message', () => {
    const store = useConversationStore.getState();

    store.applyEvent({
      type: 'message-start',
      conversationId: 'c1',
      messageId: 'm1',
      role: 'assistant',
      createdAt: '2026-04-18T00:00:00.000Z',
    });
    store.applyEvent({
      type: 'text-delta',
      conversationId: 'c1',
      messageId: 'm1',
      delta: 'Hello',
    });
    store.applyEvent({
      type: 'message-complete',
      conversationId: 'c1',
      messageId: 'm1',
      fullText: 'Hello world',
      completedAt: '2026-04-18T00:00:01.000Z',
    });

    const message = useConversationStore.getState().messages.c1?.[0];
    expect(message?.content).toBe('Hello world');
    expect(message?.status).toBe('complete');
  });

  it('tracks tool calls, approvals, and token usage', () => {
    const store = useConversationStore.getState();

    store.applyEvent({
      type: 'tool-call',
      conversationId: 'c1',
      toolCallId: 'tool-1',
      toolName: 'plan_game',
      input: { brief: 'cats' },
    });
    store.applyEvent({
      type: 'tool-progress',
      conversationId: 'c1',
      toolCallId: 'tool-1',
      message: 'Planning...',
    });
    store.applyEvent({
      type: 'approval-required',
      conversationId: 'c1',
      approvalId: 'approval-1',
      toolName: 'plan_game',
      args: { brief: 'cats' },
      riskLevel: 'medium',
      rationale: 'Needs permission',
    });
    store.applyEvent({
      type: 'tokens',
      conversationId: 'c1',
      input: 100,
      output: 50,
      cached: 25,
    });
    store.applyEvent({
      type: 'tool-result',
      conversationId: 'c1',
      toolCallId: 'tool-1',
      success: true,
      output: { ok: true },
    });

    const state = useConversationStore.getState();
    expect(state.toolCalls.c1?.[0]?.progress).toEqual(['Planning...']);
    expect(state.toolCalls.c1?.[0]?.status).toBe('complete');
    expect(state.approvals.c1?.[0]?.status).toBe('pending');
    expect(state.tokenUsage.c1).toEqual({ input: 100, output: 50, cached: 25 });
  });

  it('updates runtime updater state from stream events', () => {
    const store = useConversationStore.getState();

    store.applyEvent({
      type: 'update-status',
      status: 'downloaded',
      downloadedVersion: '0.2.0',
      message: 'Update ready. Restart to install.',
    });

    expect(useConversationStore.getState().updateStatus).toEqual({
      status: 'downloaded',
      downloadedVersion: '0.2.0',
      message: 'Update ready. Restart to install.',
    });
  });

  it('appends notice events as complete system messages', () => {
    const store = useConversationStore.getState();

    store.applyEvent({
      type: 'notice',
      conversationId: 'c1',
      message: 'Task complete: Implement combat',
    });

    const message = useConversationStore.getState().messages.c1?.[0];
    expect(message).toMatchObject({
      role: 'system',
      content: 'Task complete: Implement combat',
      status: 'complete',
    });
  });
});
