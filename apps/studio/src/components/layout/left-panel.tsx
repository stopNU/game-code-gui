import { useEffect } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationsList } from '@renderer/components/conversations/conversations-list';
import { NewConversationButton } from '@renderer/components/conversations/new-conversation-button';
import { ProjectList } from '@renderer/components/project/project-list';

export function LeftPanel(): JSX.Element {
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const conversationsQuery = trpc.conversations.list.useQuery(undefined);
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      useConversationStore.getState().registerConversations([conversation]);
      useConversationStore.getState().setActiveConversationId(conversation.id);
      await utils.conversations.list.invalidate();
    },
  });

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const setActiveConversationId = useConversationStore((state) => state.setActiveConversationId);
  const setSelectedProjectId = useConversationStore((state) => state.setSelectedProjectId);
  const registerConversations = useConversationStore((state) => state.registerConversations);

  useEffect(() => {
    if (conversationsQuery.data !== undefined) {
      registerConversations(conversationsQuery.data);
    }
  }, [conversationsQuery.data, registerConversations]);

  const handleCreateConversation = (): void => {
    void createConversation.mutateAsync({
      projectId: selectedProjectId,
      title: selectedProjectId === null ? 'New conversation' : 'Project conversation',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ProjectList
        projects={projectsQuery.data ?? []}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />
      <ConversationsList
        conversations={conversationsQuery.data ?? []}
        activeConversationId={activeConversationId}
        onSelect={setActiveConversationId}
      />
      <NewConversationButton disabled={createConversation.isPending} onCreate={handleCreateConversation} />
    </div>
  );
}
