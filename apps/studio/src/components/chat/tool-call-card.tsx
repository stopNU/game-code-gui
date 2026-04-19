import { CheckCircle2, LoaderCircle, OctagonAlert } from 'lucide-react';
import type { ToolCallRecord } from '@renderer/store/conversation-store';
import { Badge } from '@renderer/components/ui/badge';
import { stringifyJson } from '@renderer/lib/message-content';

interface ToolCallCardProps {
  toolCall: ToolCallRecord;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps): JSX.Element {
  const icon =
    toolCall.status === 'running' ? (
      <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
    ) : toolCall.status === 'complete' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : (
      <OctagonAlert className="h-4 w-4 text-amber-400" />
    );

  return (
    <details className="rounded-2xl border border-border bg-secondary/20 p-3">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon}
            <span className="truncate">{toolCall.toolName}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{summarizeToolCall(toolCall)}</div>
        </div>
        <Badge>{toolCall.status}</Badge>
      </summary>
      <div className="mt-3 space-y-3">
        <pre className="overflow-auto rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
          {stringifyJson(toolCall.input)}
        </pre>
        {toolCall.progress.length > 0 ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {toolCall.progress.map((entry, index) => (
              <div key={`${toolCall.toolCallId}-progress-${index}`}>{entry}</div>
            ))}
          </div>
        ) : null}
        {toolCall.output !== undefined ? (
          <pre className="overflow-auto rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
            {stringifyJson(toolCall.output)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function summarizeToolCall(toolCall: ToolCallRecord): string {
  if (toolCall.toolName === 'codex.command_execution') {
    const command = getRecordString(toolCall.input, 'command');
    if (command !== null) {
      return truncate(command, 120);
    }
  }

  if (toolCall.output !== undefined) {
    const message = getRecordString(toolCall.output, 'message');
    if (message !== null) {
      return truncate(message, 120);
    }
  }

  if (toolCall.progress.length > 0) {
    return truncate(toolCall.progress[toolCall.progress.length - 1] ?? '', 120);
  }

  return 'Open for details';
}

function getRecordString(value: unknown, key: string): string | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entry = (value as Record<string, unknown>)[key];
    return typeof entry === 'string' ? entry : null;
  }

  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
