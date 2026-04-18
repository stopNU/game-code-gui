import { describe, expect, it } from 'vitest';
import { useConversationStore } from './conversation-store.js';

describe('conversation store', () => {
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
});
