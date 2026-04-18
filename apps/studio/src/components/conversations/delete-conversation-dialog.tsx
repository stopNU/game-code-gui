import type { ConversationSummary } from '@shared/domain';
import { Button } from '@renderer/components/ui/button';

interface DeleteConversationDialogProps {
  conversation: ConversationSummary | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (conversation: ConversationSummary) => Promise<void>;
}

export function DeleteConversationDialog({
  conversation,
  submitting,
  onCancel,
  onConfirm,
}: DeleteConversationDialogProps): JSX.Element | null {
  if (conversation === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-lg rounded-[28px] border border-border bg-card p-6 shadow-glow">
        <div className="text-xs uppercase tracking-[0.26em] text-primary">Delete conversation</div>
        <h3 className="mt-2 text-xl font-semibold text-foreground">{conversation.title}</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          This removes the conversation and its message history from Studio. This action cannot be undone.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirm(conversation)} disabled={submitting}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
