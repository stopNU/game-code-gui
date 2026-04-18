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
    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.26em] text-muted-foreground">Tool call</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon}
            {toolCall.toolName}
          </div>
        </div>
        <Badge>{toolCall.status}</Badge>
      </div>
      <pre className="mt-3 overflow-auto rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
        {stringifyJson(toolCall.input)}
      </pre>
      {toolCall.progress.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {toolCall.progress.map((entry, index) => (
            <div key={`${toolCall.toolCallId}-progress-${index}`}>{entry}</div>
          ))}
        </div>
      ) : null}
      {toolCall.output !== undefined ? (
        <pre className="mt-3 overflow-auto rounded-xl bg-background/60 p-3 text-xs text-muted-foreground">
          {stringifyJson(toolCall.output)}
        </pre>
      ) : null}
    </div>
  );
}
