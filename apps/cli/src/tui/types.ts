export type ChatEntry =
  | { kind: 'system'; text: string; timestamp: number }
  | { kind: 'thinking'; text: string; timestamp: number }
  | { kind: 'tool-call'; toolName: string; input: Record<string, unknown>; timestamp: number }
  | { kind: 'tool-result'; toolName: string; success: boolean; preview: string; timestamp: number }
  | { kind: 'error'; text: string; timestamp: number }
  | { kind: 'done'; success: boolean; summary: string; filesModified: string[]; timestamp: number };

export type ScreenName = 'command' | 'model' | 'setup' | 'implement' | 'plan-review' | 'iterate' | 'done' | 'start-game';

export interface DoneData {
  success: boolean;
  summary: string;
  filesModified: string[];
  gameTitle?: string | undefined;
  outputPath?: string | undefined;
}

export interface TuiProps {
  /** Pre-selected command from CLI args. If omitted, the command picker is shown. */
  command?: 'new-game' | 'plan-game' | 'implement-task' | 'iterate' | null;
  options: Record<string, unknown>;
}
