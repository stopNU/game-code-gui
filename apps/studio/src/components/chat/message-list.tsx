import type { ConversationMessage, ToolCallRecord } from '@renderer/store/conversation-store';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Message } from './message';
import { ToolCallCard } from './tool-call-card';

interface MessageListProps {
  messages: ConversationMessage[];
  toolCalls: ToolCallRecord[];
}

export function MessageList({ messages, toolCalls }: MessageListProps): JSX.Element {
  return (
    <ScrollArea className="flex-1 px-5 py-4">
      <div className="space-y-4">
        {messages.length === 0 && toolCalls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/30 p-6 text-sm text-muted-foreground">
            Start with a brief like &quot;plan a cat deckbuilder with two playable archetypes&quot; and the agent will
            stream its reasoning, tool calls, and approvals here.
          </div>
        ) : null}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {toolCalls.length > 0 ? (
          <div className="space-y-3 pt-2">
            {toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.toolCallId} toolCall={toolCall} />
            ))}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}
