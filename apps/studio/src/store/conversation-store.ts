import { create } from 'zustand';
import type { ConversationSummary, StudioUpdateState } from '@shared/domain';
import type { StreamEvent } from '@shared/protocol';
import {
  DEFAULT_CONVERSATION_PROVIDER,
  getDefaultModelForProvider,
} from '@renderer/lib/conversation-defaults';
import { splitContentBlocksIntoMessages } from '@renderer/lib/message-content';

let godotLogSeq = 0;

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status: 'streaming' | 'complete';
}

export interface ToolCallRecord {
  toolCallId: string;
  conversationId: string;
  toolName: string;
  input: unknown;
  startedAt: string;
  status: 'running' | 'complete' | 'error';
  progress: string[];
  success?: boolean;
  output?: unknown;
  completedAt?: string;
}

export interface ApprovalRequestRecord {
  id: string;
  conversationId: string;
  toolName: string;
  args: unknown;
  riskLevel: 'low' | 'medium' | 'high';
  rationale: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
  scope?: 'once' | 'conversation' | 'project';
}

export interface TokenUsageRecord {
  input: number;
  output: number;
  cached: number;
}

export type ThemePreference = 'dark' | 'light';

export interface ConversationPreferences {
  title: string;
  projectId: string | null;
  provider: 'anthropic' | 'openai' | 'codex';
  model: string;
  updatedAt: string;
}

interface ConversationStore {
  activeConversationId: string | null;
  selectedProjectId: string | null;
  godotDebuggerEnabled: boolean;
  messages: Record<string, ConversationMessage[]>;
  toolCalls: Record<string, ToolCallRecord[]>;
  approvals: Record<string, ApprovalRequestRecord[]>;
  tokenUsage: Record<string, TokenUsageRecord>;
  conversationPreferences: Record<string, ConversationPreferences>;
  isRunning: Record<string, boolean>;
  theme: ThemePreference;
  sessionStatus: 'starting' | 'ready' | 'restarting' | 'error';
  sessionDetail: string;
  latestToolCall: ToolCallRecord | null;
  latestNotice: string | null;
  updateStatus: StudioUpdateState;
  godotStatus: {
    status: 'running' | 'stopped' | 'crashed';
    projectPath?: string;
    launchedBy?: 'agent' | 'ui';
    ownerConversationId?: string;
    exitCode?: number;
  };
  godotLogs: Array<{
    id: string;
    line: string;
    stream: 'stdout' | 'stderr';
    timestamp: number;
  }>;
  setActiveConversationId: (conversationId: string | null) => void;
  setSelectedProjectId: (projectId: string | null) => void;
  setGodotDebuggerEnabled: (enabled: boolean) => void;
  registerConversations: (conversations: ConversationSummary[]) => void;
  setTheme: (theme: ThemePreference) => void;
  updateConversationPreferences: (
    conversationId: string,
    updates: Partial<Pick<ConversationPreferences, 'provider' | 'model' | 'title' | 'projectId'>>,
  ) => void;
  hydrateMessages: (conversationId: string, messages: ConversationMessage[]) => void;
  hydrateApprovals: (approvals: ApprovalRequestRecord[]) => void;
  hydrateGodotRuntime: (args: {
    status: {
      status: 'running' | 'stopped' | 'crashed';
      projectPath?: string;
      exitCode?: number;
    };
    logs: Array<{
      id: string;
      line: string;
      stream: 'stdout' | 'stderr';
      timestamp: number;
    }>;
  }) => void;
  upsertUserMessage: (conversationId: string, content: string) => void;
  applyEvent: (event: StreamEvent) => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  activeConversationId: null,
  selectedProjectId: null,
  godotDebuggerEnabled: false,
  messages: {} as Record<string, ConversationMessage[]>,
  toolCalls: {} as Record<string, ToolCallRecord[]>,
  approvals: {} as Record<string, ApprovalRequestRecord[]>,
  tokenUsage: {} as Record<string, TokenUsageRecord>,
  conversationPreferences: {} as Record<string, ConversationPreferences>,
  isRunning: {} as Record<string, boolean>,
  theme: 'dark' as const,
  sessionStatus: 'starting' as const,
  sessionDetail: 'Waiting for the session manager to attach a MessagePort.',
  latestToolCall: null as ToolCallRecord | null,
  latestNotice: null as string | null,
  updateStatus: {
    status: 'disabled',
    message: 'Waiting for updater state.',
  } as StudioUpdateState,
  godotStatus: {
    status: 'stopped' as const,
  },
  godotLogs: [] as ConversationStore['godotLogs'],
};

function getConversationMessages(
  messages: Record<string, ConversationMessage[]>,
  conversationId: string,
): ConversationMessage[] {
  return messages[conversationId] ?? [];
}

function upsertToolCall(list: ToolCallRecord[], next: ToolCallRecord): ToolCallRecord[] {
  const existingIndex = list.findIndex((item) => item.toolCallId === next.toolCallId);
  if (existingIndex === -1) {
    return [...list, next];
  }

  return list.map((item, index) => (index === existingIndex ? { ...item, ...next } : item));
}

function appendNoticeMessage(
  state: ConversationStore,
  conversationId: string,
  content: string,
): Pick<ConversationStore, 'messages' | 'latestNotice'> {
  return {
    latestNotice: content,
    messages: {
      ...state.messages,
      [conversationId]: [
        ...getConversationMessages(state.messages, conversationId),
        {
          id: `notice-${Date.now()}`,
          conversationId,
          role: 'system',
          content,
          createdAt: new Date().toISOString(),
          status: 'complete',
        },
      ],
    },
  };
}

export const useConversationStore = create<ConversationStore>((set) => ({
  ...DEFAULT_STATE,
  setActiveConversationId: (conversationId) => {
    set({
      activeConversationId: conversationId,
    });
  },
  setSelectedProjectId: (projectId) => {
    set({
      selectedProjectId: projectId,
    });
  },
  setGodotDebuggerEnabled: (enabled) => {
    set({
      godotDebuggerEnabled: enabled,
    });
  },
  registerConversations: (conversations) => {
    set((state) => {
      const nextPreferences = { ...state.conversationPreferences };

      for (const conversation of conversations) {
        nextPreferences[conversation.id] = {
          title: conversation.title,
          projectId: conversation.projectId,
          provider: conversation.provider ?? DEFAULT_CONVERSATION_PROVIDER,
          model: conversation.model ?? getDefaultModelForProvider(conversation.provider ?? DEFAULT_CONVERSATION_PROVIDER),
          updatedAt: conversation.updatedAt,
        };
      }

      return {
        conversationPreferences: nextPreferences,
        activeConversationId:
          state.activeConversationId ?? conversations[0]?.id ?? state.activeConversationId,
      };
    });
  },
  setTheme: (theme) => {
    set({
      theme,
    });
  },
  updateConversationPreferences: (conversationId, updates) => {
    set((state) => {
      const existing = state.conversationPreferences[conversationId];
      if (existing === undefined) {
        return state;
      }

      return {
        conversationPreferences: {
          ...state.conversationPreferences,
          [conversationId]: {
            ...existing,
            ...updates,
          },
        },
      };
    });
  },
  hydrateMessages: (conversationId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    }));
  },
  hydrateApprovals: (approvals) => {
    set((state) => {
      const nextApprovals = { ...state.approvals };
      for (const approval of approvals) {
        nextApprovals[approval.conversationId] = upsertApproval(nextApprovals[approval.conversationId] ?? [], approval);
      }

      return {
        approvals: nextApprovals,
      };
    });
  },
  hydrateGodotRuntime: ({ status, logs }) => {
    set({
      godotStatus: status,
      godotLogs: logs,
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
        const nextToolCall: ToolCallRecord = {
          toolCallId: event.toolCallId,
          conversationId: event.conversationId,
          toolName: event.toolName,
          input: event.input,
          startedAt: new Date().toISOString(),
          status: 'running',
          progress: [],
        };

        return {
          latestToolCall: nextToolCall,
          isRunning: {
            ...state.isRunning,
            [event.conversationId]: true,
          },
          toolCalls: {
            ...state.toolCalls,
            [event.conversationId]: upsertToolCall(state.toolCalls[event.conversationId] ?? [], nextToolCall),
          },
        };
      }

      if (event.type === 'tool-progress') {
        return {
          toolCalls: {
            ...state.toolCalls,
            [event.conversationId]: (state.toolCalls[event.conversationId] ?? []).map((call) =>
              call.toolCallId === event.toolCallId
                ? { ...call, progress: [...call.progress, event.message] }
                : call,
            ),
          },
        };
      }

      if (event.type === 'tool-result') {
        return {
          toolCalls: {
            ...state.toolCalls,
            [event.conversationId]: (state.toolCalls[event.conversationId] ?? []).map((call) =>
              call.toolCallId === event.toolCallId
                ? {
                    ...call,
                    status: event.success ? 'complete' : 'error',
                    success: event.success,
                    output: event.output,
                    completedAt: new Date().toISOString(),
                  }
                : call,
            ),
          },
        };
      }

      if (event.type === 'approval-required') {
        const approval: ApprovalRequestRecord = {
          id: event.approvalId,
          conversationId: event.conversationId,
          toolName: event.toolName,
          args: event.args,
          riskLevel: event.riskLevel,
          rationale: event.rationale,
          requestedAt: new Date().toISOString(),
          status: 'pending',
        };

        return {
          approvals: {
            ...state.approvals,
            [event.conversationId]: upsertApproval(state.approvals[event.conversationId] ?? [], approval),
          },
        };
      }

      if (event.type === 'approval-resolved') {
        return {
          approvals: {
            ...state.approvals,
            [event.conversationId]: (state.approvals[event.conversationId] ?? []).map((approval) =>
              approval.id === event.approvalId
                ? {
                    ...approval,
                    status: event.decision,
                  }
                : approval,
            ),
          },
        };
      }

      if (event.type === 'tokens') {
        const existing = state.tokenUsage[event.conversationId] ?? { input: 0, output: 0, cached: 0 };
        return {
          tokenUsage: {
            ...state.tokenUsage,
            [event.conversationId]: {
              input: existing.input + event.input,
              output: existing.output + event.output,
              cached: existing.cached + event.cached,
            },
          },
        };
      }

      if (event.type === 'retrying') {
        return appendNoticeMessage(state, event.conversationId, `Retry ${event.attempt}: ${event.reason}`);
      }

      if (event.type === 'notice') {
        return appendNoticeMessage(state, event.conversationId, event.message);
      }

      if (event.type === 'budget-exhausted') {
        return appendNoticeMessage(
          state,
          event.conversationId,
          `Token budget exhausted for tool call ${event.toolCallId}. Used ${event.tokensUsed}/${event.budget}.`,
        );
      }

      if (event.type === 'cap-exceeded') {
        return appendNoticeMessage(state, event.conversationId, `Agent cap exceeded: ${event.cap}.`);
      }

      if (event.type === 'done') {
        return {
          latestNotice: 'Conversation complete.',
          isRunning: {
            ...state.isRunning,
            [event.conversationId]: false,
          },
        };
      }

      if (event.type === 'update-status') {
        return {
          updateStatus: {
            status: event.status,
            ...(event.version !== undefined ? { version: event.version } : {}),
            ...(event.downloadedVersion !== undefined ? { downloadedVersion: event.downloadedVersion } : {}),
            ...(event.message !== undefined ? { message: event.message } : {}),
          },
        };
      }

      if (event.type === 'error') {
        const conversationId = event.conversationId ?? state.activeConversationId;
        if (conversationId === null) {
          return {
            latestNotice: event.message,
          };
        }

        return {
          ...appendNoticeMessage(state, conversationId, event.message),
          isRunning: {
            ...state.isRunning,
            [conversationId]: false,
          },
        };
      }

      if (event.type === 'message-start') {
        return {
          isRunning: {
            ...state.isRunning,
            [event.conversationId]: true,
          },
          messages: {
            ...state.messages,
            [event.conversationId]: [
              ...getConversationMessages(state.messages, event.conversationId).filter(
                (message) => message.id !== event.messageId,
              ),
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
        if (event.contentBlocks !== undefined) {
          const existing = getConversationMessages(state.messages, event.conversationId);
          const filtered = existing.filter((message) => message.id !== event.messageId);
          const split = splitContentBlocksIntoMessages({
            baseId: event.messageId,
            conversationId: event.conversationId,
            role: 'assistant',
            contentBlocks: event.contentBlocks,
            createdAt: event.completedAt,
            status: 'complete',
          });
          const next = split.length > 0
            ? split
            : [
                {
                  id: event.messageId,
                  conversationId: event.conversationId,
                  role: 'assistant' as const,
                  content: event.fullText,
                  createdAt: event.completedAt,
                  status: 'complete' as const,
                },
              ];

          return {
            messages: {
              ...state.messages,
              [event.conversationId]: [...filtered, ...next],
            },
          };
        }

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

      if (event.type === 'godot-status') {
        return {
          godotStatus: {
            status: event.status,
            ...(event.projectPath !== undefined
              ? { projectPath: event.projectPath }
              : state.godotStatus.projectPath !== undefined
                ? { projectPath: state.godotStatus.projectPath }
                : {}),
            ...(event.launchedBy !== undefined
              ? { launchedBy: event.launchedBy }
              : state.godotStatus.launchedBy !== undefined
                ? { launchedBy: state.godotStatus.launchedBy }
                : {}),
            ...(event.ownerConversationId !== undefined
              ? { ownerConversationId: event.ownerConversationId }
              : state.godotStatus.ownerConversationId !== undefined
                ? { ownerConversationId: state.godotStatus.ownerConversationId }
                : {}),
            ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
          },
        };
      }

      if (event.type === 'godot-log') {
        return {
          godotLogs: [
            ...state.godotLogs.slice(-199),
            {
              id: `${event.timestamp}-${++godotLogSeq}`,
              line: event.line,
              stream: event.stream,
              timestamp: event.timestamp,
            },
          ],
        };
      }

      return state;
    });
  },
  reset: () => {
    set(DEFAULT_STATE);
  },
}));

function upsertApproval(list: ApprovalRequestRecord[], next: ApprovalRequestRecord): ApprovalRequestRecord[] {
  const existingIndex = list.findIndex((item) => item.id === next.id);
  if (existingIndex === -1) {
    return [...list, next];
  }

  return list.map((item, index) => (index === existingIndex ? { ...item, ...next } : item));
}
