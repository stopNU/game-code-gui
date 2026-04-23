import { useEffect, useMemo } from 'react';
import type { ConversationMessage } from '@renderer/store/conversation-store';
import { Separator } from '@renderer/components/ui/separator';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { trpc } from '@renderer/lib/trpc';
import { serializeContentBlocks } from '@renderer/lib/message-content';
import {
  DEFAULT_CONVERSATION_PROVIDER,
  getDefaultModelForProvider,
} from '@renderer/lib/conversation-defaults';
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
    activeConversationId === null ? null : (state.messages[activeConversationId] ?? null),
  ) ?? [];
  const toolCalls = useConversationStore((state) =>
    activeConversationId === null ? null : (state.toolCalls[activeConversationId] ?? null),
  ) ?? [];
  const preferences = useConversationStore((state) =>
    activeConversationId === null ? null : state.conversationPreferences[activeConversationId] ?? null,
  );
  const running = useConversationStore((state) =>
    activeConversationId === null ? false : (state.isRunning[activeConversationId] ?? false),
  );
  const tokenUsage = useConversationStore((state) =>
    activeConversationId === null ? undefined : state.tokenUsage[activeConversationId],
  );
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const hydrateMessages = useConversationStore((state) => state.hydrateMessages);
  const addUserMessage = useConversationStore((state) => state.upsertUserMessage);
  const updateConversationPreferences = useConversationStore((state) => state.updateConversationPreferences);
  const settingsStatusQuery = trpc.settings.getStatus.useQuery();

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
  const renameMutation = trpc.conversations.rename.useMutation();

  useEffect(() => {
    if (activeConversationId !== null && messagesQuery.data !== undefined) {
      hydrateMessages(activeConversationId, normalizeDbMessages(messagesQuery.data));
    }
  }, [activeConversationId, hydrateMessages, messagesQuery.data]);

  const sending = sendMutation.isPending;
  const visibleToolCalls = useMemo(() => toolCalls.slice(-4), [toolCalls]);

  const handleSend = async (content: string): Promise<void> => {
    if (activeConversationId === null) {
      return;
    }

    addUserMessage(activeConversationId, content);

    await sendMutation.mutateAsync({
      conversationId: activeConversationId,
      userMessage: content,
      ...(selectedProjectId !== null ? { projectId: selectedProjectId } : {}),
      model: preferences?.model ?? getDefaultModelForProvider(DEFAULT_CONVERSATION_PROVIDER),
      provider: preferences?.provider ?? DEFAULT_CONVERSATION_PROVIDER,
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
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ConversationHeader
        preferences={preferences}
        sessionStatus={sessionStatus}
        tokenUsage={tokenUsage}
        canUseOpenAI={settingsStatusQuery.data?.openaiConfigured ?? false}
        running={running}
        onProviderChange={(provider) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, {
            provider,
            model: getDefaultModelForProvider(provider),
          });
        }}
        onModelChange={(model) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, { model });
        }}
        onRename={async (title) => {
          if (activeConversationId === null) {
            return;
          }

          const renamed = await renameMutation.mutateAsync({ id: activeConversationId, title });
          if (renamed !== null) {
            updateConversationPreferences(activeConversationId, { title: renamed.title });
            await utils.conversations.list.invalidate();
          }
        }}
      />
      <Separator />
      {messagesQuery.isLoading ? (
        <div className="flex flex-1 flex-col gap-4 p-5">
          <Skeleton className="h-20 w-[72%]" />
          <Skeleton className="ml-auto h-16 w-[58%]" />
          <Skeleton className="h-32 w-[80%]" />
        </div>
      ) : (
        <MessageList messages={messages} toolCalls={visibleToolCalls} />
      )}
      <Separator />
      <ChatComposer disabled={activeConversationId === null} sending={running || sending} onSend={handleSend} onAbort={handleAbort} />
    </div>
  );
}
