import { useEffect, useMemo } from 'react';
import type { ConversationMessage } from '@renderer/store/conversation-store';
import { Card } from '@renderer/components/ui/card';
import { Separator } from '@renderer/components/ui/separator';
import { trpc } from '@renderer/lib/trpc';
import { serializeContentBlocks } from '@renderer/lib/message-content';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationHeader } from '@renderer/components/chat/conversation-header';
import { MessageList } from '@renderer/components/chat/message-list';
import { ChatComposer } from '@renderer/components/chat/chat-composer';

function normalizeDbMessages(
  messages: Array<{
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system' | 'error';
    contentBlocks: unknown[];
    createdAt: string;
  }>,
): ConversationMessage[] {
  return messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    role: message.role === 'error' ? 'system' : message.role,
    content: serializeContentBlocks(message.contentBlocks),
    createdAt: message.createdAt,
    status: 'complete',
  }));
}

export function CenterPanel(): JSX.Element {
  const utils = trpc.useUtils();
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const messages = useConversationStore((state) =>
    activeConversationId === null ? [] : state.messages[activeConversationId] ?? [],
  );
  const toolCalls = useConversationStore((state) =>
    activeConversationId === null ? [] : state.toolCalls[activeConversationId] ?? [],
  );
  const preferences = useConversationStore((state) =>
    activeConversationId === null ? null : state.conversationPreferences[activeConversationId] ?? null,
  );
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const hydrateMessages = useConversationStore((state) => state.hydrateMessages);
  const addUserMessage = useConversationStore((state) => state.upsertUserMessage);
  const updateConversationPreferences = useConversationStore((state) => state.updateConversationPreferences);

  const messagesQuery = trpc.conversations.getMessages.useQuery(
    { id: activeConversationId ?? '' },
    {
      enabled: activeConversationId !== null,
    },
  );
  const sendMutation = trpc.agent.send.useMutation({
    onSuccess: async () => {
      await utils.conversations.list.invalidate();
    },
  });
  const abortMutation = trpc.agent.abort.useMutation();

  useEffect(() => {
    if (activeConversationId !== null && messagesQuery.data !== undefined) {
      hydrateMessages(activeConversationId, normalizeDbMessages(messagesQuery.data));
    }
  }, [activeConversationId, hydrateMessages, messagesQuery.data]);

  const sending = sendMutation.isPending;
  const visibleToolCalls = useMemo(() => toolCalls.slice(-6), [toolCalls]);

  const handleSend = async (content: string): Promise<void> => {
    if (activeConversationId === null) {
      return;
    }

    addUserMessage(activeConversationId, content);

    await sendMutation.mutateAsync({
      conversationId: activeConversationId,
      userMessage: content,
      ...(selectedProjectId !== null ? { projectId: selectedProjectId } : {}),
      model: preferences?.model ?? 'claude-sonnet-4-6',
      provider: preferences?.provider ?? 'anthropic',
    });
  };

  const handleAbort = async (): Promise<void> => {
    if (activeConversationId === null) {
      return;
    }

    await abortMutation.mutateAsync({
      conversationId: activeConversationId,
    });
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <ConversationHeader
        preferences={preferences}
        sessionStatus={sessionStatus}
        onProviderChange={(provider) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, {
            provider,
            model: provider === 'openai' ? 'gpt-5.4' : 'claude-sonnet-4-6',
          });
        }}
        onModelChange={(model) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, { model });
        }}
      />
      <Separator />
      <MessageList messages={messages} toolCalls={visibleToolCalls} />
      <Separator />
      <ChatComposer disabled={activeConversationId === null} sending={sending} onSend={handleSend} onAbort={handleAbort} />
    </Card>
  );
}
