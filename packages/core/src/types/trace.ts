import type { AgentRole } from './agent.js';
import type { InputOutputTokens } from './task.js';

export type TraceEventType =
  | 'tool_call'
  | 'tool_result'
  | 'llm_call'
  | 'llm_response'
  | 'task_start'
  | 'task_complete'
  | 'error';

export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}

export interface TraceEvent {
  eventId: string;
  traceId: string;
  spanId: string;
  type: TraceEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TraceLog {
  traceId: string;
  taskId: string;
  role: AgentRole;
  spans: TraceSpan[];
  events: TraceEvent[];
  totalTokens: InputOutputTokens;
  totalDurationMs: number;
}
