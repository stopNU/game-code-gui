import { useEffect, useMemo, useState } from 'react';
import type { ConversationSummary } from '@shared/domain';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationsList } from '@renderer/components/conversations/conversations-list';
import { DeleteConversationDialog } from '@renderer/components/conversations/delete-conversation-dialog';
import { ProjectList } from '@renderer/components/project/project-list';
import { Button } from '@renderer/components/ui/button';

export function LeftPanel(): JSX.Element {
  const utils = trpc.useUtils();
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(null);
  const [deleteAllPending, setDeleteAllPending] = useState(false);
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
  const deleteAllConversations = trpc.conversations.deleteAll.useMutation();
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

  const handleDeleteAll = (): void => {
    setDeleteAllPending(true);
  };

  const handleDeleteAllConfirm = async (): Promise<void> => {
    await deleteAllConversations.mutateAsync(
      selectedProjectId !== null ? { projectId: selectedProjectId } : undefined,
    );
    registerConversations([]);
    setActiveConversationId(null);
    setDeleteAllPending(false);
    await utils.conversations.list.invalidate();
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
        deletingAll={deleteAllConversations.isPending}
        creatingConversation={createConversation.isPending}
        onSelect={handleSelectConversation}
        onDelete={(conversation) => setConversationToDelete(conversation)}
        onDeleteAll={handleDeleteAll}
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

      {deleteAllPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-lg rounded-[28px] border border-border bg-card p-6 shadow-glow">
            <div className="text-xs uppercase tracking-[0.26em] text-primary">Delete all conversations</div>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              {selectedProjectId !== null ? 'Delete project conversations' : 'Delete all conversations'}
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              This removes {selectedProjectId !== null ? 'all conversations in this project' : 'all conversations'} and their message history from Studio. This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => setDeleteAllPending(false)} disabled={deleteAllConversations.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void handleDeleteAllConfirm()} disabled={deleteAllConversations.isPending}>
                Delete all
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
