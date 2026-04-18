import { useEffect, useMemo, useState } from 'react';
import type { ConversationSummary } from '@shared/domain';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationsList } from '@renderer/components/conversations/conversations-list';
import { DeleteConversationDialog } from '@renderer/components/conversations/delete-conversation-dialog';
import { NewConversationButton } from '@renderer/components/conversations/new-conversation-button';
import { ProjectList } from '@renderer/components/project/project-list';

export function LeftPanel(): JSX.Element {
  const utils = trpc.useUtils();
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(null);
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const conversationsQuery = trpc.conversations.list.useQuery(undefined);
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      useConversationStore.getState().registerConversations([conversation]);
      useConversationStore.getState().setActiveConversationId(conversation.id);
      await utils.conversations.list.invalidate();
    },
  });
  const deleteConversation = trpc.conversations.delete.useMutation();

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const setActiveConversationId = useConversationStore((state) => state.setActiveConversationId);
  const setSelectedProjectId = useConversationStore((state) => state.setSelectedProjectId);
  const registerConversations = useConversationStore((state) => state.registerConversations);

  const visibleConversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);

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
        loading={projectsQuery.isLoading}
        selectedProjectId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />
      <ConversationsList
        conversations={visibleConversations}
        activeConversationId={activeConversationId}
        loading={conversationsQuery.isLoading}
        deletingConversationId={deleteConversation.variables?.id ?? null}
        onSelect={setActiveConversationId}
        onDelete={(conversation) => setConversationToDelete(conversation)}
      />
      <NewConversationButton disabled={createConversation.isPending} onCreate={handleCreateConversation} />

      <DeleteConversationDialog
        conversation={conversationToDelete}
        submitting={deleteConversation.isPending}
        onCancel={() => setConversationToDelete(null)}
        onConfirm={async (conversation) => {
          await deleteConversation.mutateAsync({ id: conversation.id });
          const nextConversations = visibleConversations.filter((item) => item.id !== conversation.id);
          registerConversations(nextConversations);
          if (activeConversationId === conversation.id) {
            setActiveConversationId(nextConversations[0]?.id ?? null);
          }
          setConversationToDelete(null);
          await utils.conversations.list.invalidate();
        }}
      />
    </div>
  );
}
