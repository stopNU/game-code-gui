import { ShieldAlert } from 'lucide-react';
import type { ApprovalRequestRecord } from '@renderer/store/conversation-store';
import { Button } from '@renderer/components/ui/button';
import { stringifyJson } from '@renderer/lib/message-content';

interface ApprovalDialogProps {
  approval: ApprovalRequestRecord | null;
  submitting: boolean;
  onDecision: (decision: 'approved' | 'denied', scope: 'once' | 'conversation' | 'project') => Promise<void>;
}

export function ApprovalDialog({ approval, submitting, onDecision }: ApprovalDialogProps): JSX.Element | null {
  if (approval === null || approval.status !== 'pending') {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="pointer-events-auto w-full max-w-2xl rounded-[28px] border border-border bg-card p-6 shadow-glow">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-500/15 p-3 text-amber-300">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.26em] text-amber-300">Approval required</div>
            <h3 className="mt-2 text-xl font-semibold text-foreground">{approval.toolName}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{approval.rationale}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-background/40 p-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Risk</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{approval.riskLevel}</div>
          </div>
          <pre className="overflow-auto rounded-2xl border border-border bg-background/40 p-4 text-xs text-muted-foreground">
            {stringifyJson(approval.args)}
          </pre>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void onDecision('approved', 'once')} disabled={submitting}>
            Approve once
          </Button>
          <Button variant="outline" onClick={() => void onDecision('approved', 'conversation')} disabled={submitting}>
            Approve for conversation
          </Button>
          <Button variant="outline" onClick={() => void onDecision('approved', 'project')} disabled={submitting}>
            Approve for project
          </Button>
          <Button variant="ghost" onClick={() => void onDecision('denied', 'once')} disabled={submitting}>
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}
