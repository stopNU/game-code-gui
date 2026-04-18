import { MessageCircleMore, Sparkles } from 'lucide-react';
import type { ConversationSummary } from '@shared/domain';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { cn } from '@renderer/lib/utils';

interface ConversationsListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
}

export function ConversationsList({
  conversations,
  activeConversationId,
  onSelect,
}: ConversationsListProps): JSX.Element {
  return (
    <Card className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageCircleMore className="h-4 w-4 text-primary" />
        Conversations
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/20 p-4 text-sm text-muted-foreground">
            Start a conversation and the agent history will land here.
          </div>
        ) : null}
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeConversationId;

          return (
            <Button
              key={conversation.id}
              variant="ghost"
              className={cn(
                'h-auto justify-start rounded-2xl border px-3 py-3 text-left',
                isActive
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-transparent bg-background/30 text-muted-foreground hover:border-border hover:bg-background/50',
              )}
              onClick={() => onSelect(conversation.id)}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{conversation.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em]">
                    <span>{conversation.provider ?? 'anthropic'}</span>
                    <span>•</span>
                    <span className="truncate">{conversation.model ?? 'default model'}</span>
                  </div>
                </div>
                <Badge className={isActive ? 'bg-primary text-primary-foreground' : ''}>
                  <Sparkles className="mr-1 h-3 w-3" />
                  Live
                </Badge>
              </div>
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
