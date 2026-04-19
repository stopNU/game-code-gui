import { useEffect, useMemo, useState } from 'react';
import type { ConversationSummary } from '@shared/domain';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationsList } from '@renderer/components/conversations/conversations-list';
import { DeleteConversationDialog } from '@renderer/components/conversations/delete-conversation-dialog';
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
  const setProject = trpc.conversations.setProject.useMutation();

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const setActiveConversationId = useConversationStore((state) => state.setActiveConversationId);
  const setSelectedProjectId = useConversationStore((state) => state.setSelectedProjectId);
  const registerConversations = useConversationStore((state) => state.registerConversations);

  const visibleConversations = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    if (!selectedProjectId) return all;
    return all.filter((c) => c.projectId === selectedProjectId);
  }, [conversationsQuery.data, selectedProjectId]);

  useEffect(() => {
    if (conversationsQuery.data !== undefined) {
      registerConversations(conversationsQuery.data);
    }
  }, [conversationsQuery.data, registerConversations]);

  const handleSelectConversation = (conversationId: string): void => {
    setActiveConversationId(conversationId);
    if (selectedProjectId !== null) {
      const conversation = visibleConversations.find((c) => c.id === conversationId);
      if (conversation !== undefined && conversation.projectId !== selectedProjectId) {
        void setProject.mutateAsync({ id: conversationId, projectId: selectedProjectId }).then(() => {
          void utils.conversations.list.invalidate();
        });
      }
    }
  };

  const handleCreateConversation = (): void => {
    void createConversation.mutateAsync({
      projectId: selectedProjectId,
      ...getDefaultConversationConfig(selectedProjectId),
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
        creatingConversation={createConversation.isPending}
        onSelect={handleSelectConversation}
        onDelete={(conversation) => setConversationToDelete(conversation)}
        onNew={handleCreateConversation}
      />

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
