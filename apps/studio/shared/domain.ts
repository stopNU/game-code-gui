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

/**
 * Compact summary of the most recent eval report under `harness/baselines/`.
 * Used by the eval-suggestion banner to nudge users to file failures as bugs
 * via `plan_iteration`. Stable `reportId` lets the renderer track per-report
 * dismissals in localStorage so a banner does not reappear after dismissal.
 */
export interface EvalSummary {
  /** Filename of the report without extension, e.g. `report-1234abcd`. Stable across reads. */
  reportId: string;
  hasFailures: boolean;
  failedLayers: string[];
  passedLayers: string[];
  /** ISO timestamp of the report file's mtime. */
  generatedAt: string;
}
