import { create } from 'zustand';
import type { ChatMessage } from '@shared/domain';
import type { StreamEvent } from '@shared/protocol';

export interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

interface ConversationStore {
  activeConversationId: string;
  messages: Record<string, ChatMessage[]>;
  sessionStatus: string;
  sessionDetail: string;
  latestToolCall: PendingToolCall | null;
  setActiveConversationId: (conversationId: string) => void;
  upsertUserMessage: (conversationId: string, content: string) => void;
  applyEvent: (event: StreamEvent) => void;
}

const DEFAULT_CONVERSATION_ID = 'local-session';

function getConversationMessages(
  messages: Record<string, ChatMessage[]>,
  conversationId: string,
): ChatMessage[] {
  return messages[conversationId] ?? [];
}

export const useConversationStore = create<ConversationStore>((set) => ({
  activeConversationId: DEFAULT_CONVERSATION_ID,
  messages: {},
  sessionStatus: 'starting',
  sessionDetail: 'Waiting for the session manager to attach a MessagePort.',
  latestToolCall: null,
  setActiveConversationId: (conversationId) => {
    set({
      activeConversationId: conversationId,
    });
  },
  upsertUserMessage: (conversationId, content) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [
          ...getConversationMessages(state.messages, conversationId),
          {
            id: `user-${Date.now()}`,
            conversationId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ],
      },
    }));
  },
  applyEvent: (event) => {
    set((state) => {
      if (event.type === 'session-state') {
        return {
          sessionStatus: event.status,
          sessionDetail: event.detail,
        };
      }

      if (event.type === 'tool-call') {
        return {
          latestToolCall: {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
          },
        };
      }

      if (event.type === 'error') {
        const conversationId = event.conversationId ?? state.activeConversationId;
        return {
          messages: {
            ...state.messages,
            [conversationId]: [
              ...getConversationMessages(state.messages, conversationId),
              {
                id: `error-${Date.now()}`,
                conversationId,
                role: 'system',
                content: event.message,
                createdAt: new Date().toISOString(),
                status: 'complete',
              },
            ],
          },
        };
      }

      if (event.type === 'message-start') {
        return {
          messages: {
            ...state.messages,
            [event.conversationId]: [
              ...getConversationMessages(state.messages, event.conversationId),
              {
                id: event.messageId,
                conversationId: event.conversationId,
                role: 'assistant',
                content: '',
                createdAt: event.createdAt,
                status: 'streaming',
              },
            ],
          },
        };
      }

      if (event.type === 'text-delta') {
        return {
          messages: {
            ...state.messages,
            [event.conversationId]: getConversationMessages(state.messages, event.conversationId).map((message) =>
              message.id === event.messageId ? { ...message, content: `${message.content}${event.delta}` } : message,
            ),
          },
        };
      }

      if (event.type === 'message-complete') {
        return {
          messages: {
            ...state.messages,
            [event.conversationId]: getConversationMessages(state.messages, event.conversationId).map((message) =>
              message.id === event.messageId
                ? {
                    ...message,
                    content: event.fullText,
                    status: 'complete',
                  }
                : message,
            ),
          },
        };
      }

      return state;
    });
  },
}));
