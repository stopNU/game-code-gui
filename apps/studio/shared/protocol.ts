export interface SessionReadyEvent {
  type: 'session-ready';
  sessionId: string;
}

export interface SessionStateEvent {
  type: 'session-state';
  status: 'starting' | 'ready' | 'restarting' | 'error';
  detail: string;
}

export interface MessageStartEvent {
  type: 'message-start';
  conversationId: string;
  messageId: string;
  role: 'assistant';
  createdAt: string;
}

export interface TextDeltaEvent {
  type: 'text-delta';
  conversationId: string;
  messageId: string;
  delta: string;
}

export interface MessageCompleteEvent {
  type: 'message-complete';
  conversationId: string;
  messageId: string;
  fullText: string;
  completedAt: string;
}

export interface ToolCallEvent {
  type: 'tool-call';
  conversationId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: 'tool-result';
  conversationId: string;
  toolCallId: string;
  success: boolean;
  output: unknown;
}

export interface ToolProgressEvent {
  type: 'tool-progress';
  conversationId: string;
  toolCallId: string;
  message: string;
}

export interface TokensEvent {
  type: 'tokens';
  conversationId: string;
  input: number;
  output: number;
  cached: number;
}

export interface ApprovalRequiredEvent {
  type: 'approval-required';
  conversationId: string;
  approvalId: string;
  toolName: string;
  args: unknown;
  riskLevel: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface ApprovalResolvedEvent {
  type: 'approval-resolved';
  conversationId: string;
  approvalId: string;
  decision: 'approved' | 'denied' | 'timeout' | 'aborted';
}

export interface BudgetExhaustedEvent {
  type: 'budget-exhausted';
  conversationId: string;
  toolCallId: string;
  tokensUsed: number;
  budget: number;
}

export interface RetryingEvent {
  type: 'retrying';
  conversationId: string;
  attempt: number;
  reason: string;
}

export interface CapExceededEvent {
  type: 'cap-exceeded';
  conversationId: string;
  cap: 'tool-calls' | 'wall-clock' | 'nesting' | 'context';
}

export interface ErrorEvent {
  type: 'error';
  conversationId?: string;
  message: string;
}

export interface DoneEvent {
  type: 'done';
  conversationId: string;
}

export interface GodotLogEvent {
  type: 'godot-log';
  line: string;
  stream: 'stdout' | 'stderr';
  timestamp: number;
}

export interface GodotStatusEvent {
  type: 'godot-status';
  status: 'running' | 'stopped' | 'crashed';
  projectPath?: string;
  launchedBy?: 'agent' | 'ui';
  ownerConversationId?: string;
  exitCode?: number;
}

export interface UpdateStatusEvent {
  type: 'update-status';
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloaded' | 'error';
  version?: string;
  downloadedVersion?: string;
  message?: string;
}

export type StreamEvent =
  | SessionReadyEvent
  | SessionStateEvent
  | MessageStartEvent
  | TextDeltaEvent
  | MessageCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | ToolProgressEvent
  | TokensEvent
  | ApprovalRequiredEvent
  | ApprovalResolvedEvent
  | BudgetExhaustedEvent
  | RetryingEvent
  | CapExceededEvent
  | ErrorEvent
  | DoneEvent
  | GodotLogEvent
  | GodotStatusEvent
  | UpdateStatusEvent;

export interface AgentSendCommand {
  type: 'send';
  conversationId: string;
  userMessage: string;
  projectId?: string;
  model: string;
  provider: 'anthropic' | 'openai' | 'codex';
}

export interface AgentAbortCommand {
  type: 'abort';
  conversationId: string;
}

export type AgentCommand = AgentSendCommand | AgentAbortCommand;

export interface ApprovalDecisionMessage {
  type: 'approval-decision';
  approvalId: string;
  decision: 'approved' | 'denied' | 'timeout' | 'aborted';
  scope?: 'once' | 'conversation' | 'project';
}

export type AgentDbRequest =
  | {
      action: 'ensure-conversation';
      conversationId: string;
      title: string;
      provider: 'anthropic' | 'openai' | 'codex';
      model: string;
      projectId?: string;
    }
  | {
      action: 'get-conversation';
      conversationId: string;
    }
  | {
      action: 'list-messages';
      conversationId: string;
    }
  | {
      action: 'create-message';
      conversationId: string;
      role: 'user' | 'assistant' | 'system' | 'error';
      contentBlocks: unknown[];
      langsmithRunId?: string | null;
    }
  | {
      action: 'add-conversation-tokens';
      conversationId: string;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
    }
  | {
      action: 'get-project';
      projectId: string;
    }
  | {
      action: 'upsert-project';
      normalizedPath: string;
      displayPath: string;
      title?: string | null;
    }
  | {
      action: 'get-task-plan';
      projectId: string;
    }
  | {
      action: 'upsert-task-plan';
      projectId: string;
      planJson: string;
    }
  | {
      action: 'create-approval';
      conversationId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
      argsHash: string;
      projectId?: string | null;
      riskLevel: 'low' | 'medium' | 'high';
      rationale: string;
    }
  | {
      action: 'find-approval-decision';
      conversationId: string;
      toolName: string;
      argsHash: string;
      projectId?: string | null;
    }
  | {
      action: 'resolve-approval';
      approvalId: string;
      status: 'approved' | 'denied' | 'timeout' | 'aborted';
      scope?: 'once' | 'conversation' | 'project';
      decidedBy?: string;
    }
  | {
      action: 'abort-pending-approvals';
      conversationId?: string;
    }
  | {
      action: 'get-api-key';
      provider: 'anthropic' | 'openai';
    }
  | {
      action: 'get-langsmith-config';
    }
  | {
      action: 'launch-godot';
      projectPath: string;
      launchedBy: 'agent' | 'ui';
      ownerConversationId?: string;
    }
  | {
      action: 'stop-godot';
      requester: 'agent' | 'ui';
      ownerConversationId?: string;
      force?: boolean;
    }
  | {
      action: 'get-claude-code-token';
    };

export interface UtilityEnvelopeMessage {
  type: 'utility-message';
  payload:
    | { type: 'stream-event'; event: StreamEvent }
    | { type: 'db-request'; requestId: string; request: AgentDbRequest }
    | { type: 'log-line'; line: string };
}

export interface MainDbResponseMessage {
  type: 'db-response';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface CommandEnvelopeMessage {
  type: 'command';
  command: AgentCommand;
}

export type AgentPortMessage =
  | CommandEnvelopeMessage
  | ApprovalDecisionMessage
  | UtilityEnvelopeMessage
  | MainDbResponseMessage;
