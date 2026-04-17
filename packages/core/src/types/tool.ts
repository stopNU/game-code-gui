import type { Permission, PermissionPolicy } from './permissions.js';

export type ToolGroupName =
  | 'project'
  | 'code'
  | 'asset'
  | 'playtest'
  | 'eval'
  | 'npm'
  | 'git';

export type JsonSchema = Record<string, unknown>;

export interface ToolExecutionContext {
  projectPath: string;
  taskId: string;
  traceId: string;
  permissions: PermissionPolicy;
}

export interface ToolContract<TInput = unknown, TOutput = unknown> {
  name: string;
  group: ToolGroupName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permissions: Permission[];
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolGroup {
  name: ToolGroupName;
  tools: ToolContract[];
}

/** Convert a ToolContract array to Anthropic SDK tool definitions */
export function toAnthropicTools(
  tools: ToolContract[],
): Array<{ name: string; description: string; input_schema: JsonSchema }> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
