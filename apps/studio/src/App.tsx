import { useMemo } from 'react';
import { LeftPanel } from '@renderer/components/layout/left-panel';
import { CenterPanel } from '@renderer/components/layout/center-panel';
import { RightPanel } from '@renderer/components/layout/right-panel';
import { ApprovalDialog } from '@renderer/components/approvals/approval-dialog';
import { useConversationStream } from '@renderer/hooks/useConversationStream';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';

export function App(): JSX.Element {
  useConversationStream();

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const hydrateApprovals = useConversationStore((state) => state.hydrateApprovals);
  const approvals = useConversationStore((state) =>
    activeConversationId === null ? [] : state.approvals[activeConversationId] ?? [],
  );
  const decideApproval = trpc.approvals.decide.useMutation();
  const pendingApprovalsQuery = trpc.approvals.listPending.useQuery(
    activeConversationId === null ? undefined : { conversationId: activeConversationId },
    {
      enabled: activeConversationId !== null,
    },
  );

  useMemo(() => {
    if (pendingApprovalsQuery.data !== undefined) {
      hydrateApprovals(
        pendingApprovalsQuery.data.map((approval) => ({
          id: approval.id,
          conversationId: approval.conversationId,
          toolName: approval.toolName,
          args: approval.args,
          riskLevel: (approval.riskLevel ?? 'medium') as 'low' | 'medium' | 'high',
          rationale: approval.reason ?? 'This tool call needs explicit approval.',
          requestedAt: new Date().toISOString(),
          status: approval.status,
          ...(approval.scope !== null && approval.scope !== undefined ? { scope: approval.scope } : {}),
        })),
      );
    }
  }, [hydrateApprovals, pendingApprovalsQuery.data]);

  const pendingApproval = approvals.find((approval) => approval.status === 'pending') ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(199,102,43,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(28,179,138,0.12),transparent_22%)]" />
      <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-20" />
      <main className="relative mx-auto flex min-h-screen max-w-[1880px] flex-col gap-5 p-4 lg:p-6">
        <header className="rounded-[28px] border border-border bg-card/85 px-6 py-5 shadow-glow">
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Harness Studio</p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Conversational control room for the harness</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Phase 5 turns the shell into a usable chat surface with persisted conversations, streaming tool cards,
                live approvals, and model-aware composer controls.
              </p>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
          <LeftPanel />
          <CenterPanel />
          <RightPanel />
        </section>
      </main>

      <ApprovalDialog
        approval={pendingApproval}
        submitting={decideApproval.isPending}
        onDecision={async (decision, scope) => {
          if (pendingApproval === null) {
            return;
          }

          await decideApproval.mutateAsync({
            id: pendingApproval.id,
            decision,
            ...(decision === 'approved' ? { scope } : {}),
          });
        }}
      />
    </div>
  );
}
