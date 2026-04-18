import { useEffect, useMemo, useState } from 'react';
import type { ConversationSummary } from '@shared/domain';
import { Input } from '@renderer/components/ui/input';
import { formatProvider } from '@renderer/lib/utils';

interface CommandPaletteProps {
  open: boolean;
  conversations: ConversationSummary[];
  onClose: () => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onCloseConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
}

export function CommandPalette({
  open,
  conversations,
  onClose,
  onNewConversation,
  onOpenSettings,
  onCloseConversation,
  onSelectConversation,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      return (
        conversation.title.toLowerCase().includes(normalized) ||
        (conversation.model ?? '').toLowerCase().includes(normalized) ||
        (conversation.provider ?? '').toLowerCase().includes(normalized)
      );
    });
  }, [conversations, query]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-6 pt-[12vh]">
      <div className="w-full max-w-2xl rounded-[28px] border border-border bg-card p-4 shadow-glow">
        <div className="text-xs uppercase tracking-[0.28em] text-primary">Command palette</div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search actions and conversations..."
          className="mt-3"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div className="mt-4 grid gap-2">
          <button
            className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-left text-sm text-foreground hover:bg-background/60"
            onClick={() => {
              onNewConversation();
              onClose();
            }}
          >
            New conversation
          </button>
          <button
            className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-left text-sm text-foreground hover:bg-background/60"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          >
            Open settings
          </button>
          <button
            className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-left text-sm text-foreground hover:bg-background/60"
            onClick={() => {
              onCloseConversation();
              onClose();
            }}
          >
            Close current conversation
          </button>
        </div>
        <div className="mt-5 text-xs uppercase tracking-[0.24em] text-muted-foreground">Conversations</div>
        <div className="mt-2 max-h-[44vh] overflow-auto">
          {filteredConversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/20 px-4 py-6 text-sm text-muted-foreground">
              No matches for this search.
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-left hover:bg-background/60"
                  onClick={() => {
                    onSelectConversation(conversation.id);
                    onClose();
                  }}
                >
                  <div className="font-medium text-foreground">{conversation.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {formatProvider(conversation.provider)} · {conversation.model ?? 'default model'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
