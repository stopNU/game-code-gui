export interface ProjectSummary {
  id: string;
  name: string;
  title?: string;
  path: string;
  displayPath?: string;
  status: 'ready' | 'unknown';
  taskCount?: number;
  completeCount?: number;
  updatedAt?: string;
}

export interface ConversationSummary {
  id: string;
  projectId: string | null;
  title: string;
  model?: string | null;
  provider?: 'anthropic' | 'openai' | 'codex';
  archived?: boolean;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  status: 'streaming' | 'complete';
}

export interface ApprovalRecord {
  id: string;
  conversationId: string;
  toolName: string;
  reason?: string;
  args?: unknown;
  riskLevel?: string;
  scope?: 'once' | 'conversation' | 'project' | null;
  status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
}

export interface GodotStatus {
  status: 'stopped' | 'running' | 'crashed';
  projectPath?: string;
  launchedBy?: 'agent' | 'ui';
  ownerConversationId?: string;
  exitCode?: number;
}

export interface SettingsStatus {
  workspaceRoot: string;
  anthropicConfigured: boolean;
  openaiConfigured: boolean;
  claudeCodeConfigured: boolean;
}

export interface LangSmithStatus {
  configured: boolean;
  enabled: boolean;
  endpoint?: string;
  projectName?: string;
}

export interface StudioUpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloaded' | 'error';
  version?: string;
  downloadedVersion?: string;
  message?: string;
}

export interface ProjectDetails extends ProjectSummary {
  hasTaskPlan: boolean;
}

export interface ProjectPlanSummary {
  title: string | null;
  taskCount: number;
  completeCount: number;
}
