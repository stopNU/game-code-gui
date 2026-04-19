import { MessageCircleMore, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ConversationSummary } from '@shared/domain';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { cn, formatProvider } from '@renderer/lib/utils';

interface ConversationsListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loading?: boolean;
  deletingConversationId?: string | null;
  creatingConversation?: boolean;
  onSelect: (conversationId: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onNew: () => void;
}

export function ConversationsList({
  conversations,
  activeConversationId,
  loading,
  deletingConversationId,
  creatingConversation,
  onSelect,
  onDelete,
  onNew,
}: ConversationsListProps): JSX.Element {
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageCircleMore className="h-4 w-4 text-primary" />
        <span className="flex-1">Conversations</span>
        <Button
          variant="ghost"
          className="h-6 w-6 rounded-full p-0"
          onClick={onNew}
          disabled={creatingConversation}
          aria-label="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {loading ? (
          <>
            <Skeleton className="h-[74px] w-full" />
            <Skeleton className="h-[74px] w-full" />
            <Skeleton className="h-[74px] w-full" />
          </>
        ) : null}

        {!loading && conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/20 p-4 text-sm text-muted-foreground">
            Start a conversation and the agent history will land here.
          </div>
        ) : null}

        {!loading
          ? conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'flex items-start gap-2 rounded-2xl border px-3 py-3',
                    isActive
                      ? 'border-primary/60 bg-primary/10 text-foreground'
                      : 'border-transparent bg-background/30 text-muted-foreground hover:border-border hover:bg-background/50',
                  )}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(conversation.id)}>
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{conversation.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]">
                          <span>{formatProvider(conversation.provider)}</span>
                          <span>&bull;</span>
                          <span className="truncate">{conversation.model ?? 'default model'}</span>
                        </div>
                      </div>
                      <Badge className={isActive ? 'bg-primary text-primary-foreground' : ''}>
                        <Sparkles className="mr-1 h-3 w-3" />
                        Live
                      </Badge>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    className="h-9 rounded-full px-3"
                    onClick={() => onDelete(conversation)}
                    disabled={deletingConversationId === conversation.id}
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          : null}
      </div>
    </Card>
  );
}
