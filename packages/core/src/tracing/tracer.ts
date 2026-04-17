import { randomUUID } from 'crypto';
import type { TraceSpan, TraceEvent, TraceLog, TraceEventType } from '../types/trace.js';
import type { AgentRole } from '../types/agent.js';
import type { InputOutputTokens } from '../types/task.js';

export class Tracer {
  private spans: TraceSpan[] = [];
  private events: TraceEvent[] = [];
  readonly traceId: string;
  private taskId: string;
  private role: AgentRole;

  constructor(taskId: string, role: AgentRole) {
    this.traceId = randomUUID();
    this.taskId = taskId;
    this.role = role;
  }

  startSpan(name: string, attributes: Record<string, string | number | boolean> = {}): string {
    const spanId = randomUUID();
    this.spans.push({
      spanId,
      traceId: this.traceId,
      name,
      startTime: new Date().toISOString(),
      attributes,
      status: 'ok',
    });
    return spanId;
  }

  endSpan(spanId: string, error?: string): void {
    const span = this.spans.find((s) => s.spanId === spanId);
    if (!span) return;
    span.endTime = new Date().toISOString();
    span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
    if (error) {
      span.status = 'error';
      span.error = error;
    }
  }

  addEvent(
    type: TraceEventType,
    spanId: string,
    payload: Record<string, unknown>,
  ): void {
    this.events.push({
      eventId: randomUUID(),
      traceId: this.traceId,
      spanId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    });
  }

  toLog(tokens: InputOutputTokens): TraceLog {
    const totalDurationMs = this.spans.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    return {
      traceId: this.traceId,
      taskId: this.taskId,
      role: this.role,
      spans: this.spans,
      events: this.events,
      totalTokens: tokens,
      totalDurationMs,
    };
  }
}
