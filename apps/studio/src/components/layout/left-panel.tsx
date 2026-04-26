import { useMemo } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';

export function LeftPanel(): JSX.Element {
  const utils = trpc.useUtils();
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const selectedProjectId = useConversationStore((s) => s.selectedProjectId);
  const isRunning = useConversationStore((s) => s.isRunning);
  const godotStatus = useConversationStore((s) => s.godotStatus);
  const godotLogs = useConversationStore((s) => s.godotLogs);
  const setActiveConversationId = useConversationStore((s) => s.setActiveConversationId);
  const registerConversations = useConversationStore((s) => s.registerConversations);

  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const conversationsQuery = trpc.conversations.list.useQuery(undefined);
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      registerConversations([conversation]);
      setActiveConversationId(conversation.id);
      await utils.conversations.list.invalidate();
    },
  });
  const deleteConversation = trpc.conversations.delete.useMutation({
    onSuccess: async () => {
      await utils.conversations.list.invalidate();
    },
  });

  const selectedProject = projectsQuery.data?.find((p) => p.id === selectedProjectId) ?? null;

  const visibleConversations = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    if (selectedProjectId === null) return all;
    return all.filter((c) => c.projectId === selectedProjectId);
  }, [conversationsQuery.data, selectedProjectId]);

  const taskCount = selectedProject?.taskCount ?? 0;
  const completeCount = selectedProject?.completeCount ?? 0;
  const progress = taskCount > 0 ? completeCount / taskCount : 0;

  const recentLogs = godotLogs.slice(-5);
  const logRunning = godotStatus.status === 'running';

  return (
    <div className="flex w-[210px] shrink-0 flex-col overflow-hidden border-r border-border-1 bg-surface-1">
      {/* Project mini-card */}
      <div className="border-b border-border-1 px-3 pb-2.5 pt-3">
        <div className="mb-[7px] font-mono text-10 uppercase tracking-[0.1em] text-fg-2">
          Project
        </div>
        {selectedProject !== null ? (
          <div className="rounded border border-border-2 bg-surface-3 px-2.5 py-2">
            <div className="mb-[3px] text-xs font-medium text-fg-0">
              {selectedProject.title ?? selectedProject.name}
            </div>
            <div className="mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-10 text-fg-2">
              {selectedProject.displayPath ?? selectedProject.path}
            </div>
            <div className="h-[3px] overflow-hidden rounded-sm bg-surface-5">
              <div
                className="h-full rounded-sm bg-accent transition-[width] duration-[400ms]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-9 text-fg-2">
              {completeCount}/{taskCount} tasks complete
            </div>
          </div>
        ) : (
          <div className="text-11 italic text-fg-2">No project selected</div>
        )}
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-auto px-2.5 pb-1 pt-2.5">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-10 uppercase tracking-[0.1em] text-fg-2">
            Conversations
          </span>
          <button
            onClick={() =>
              void createConversation.mutateAsync({
                projectId: selectedProjectId,
                ...getDefaultConversationConfig(selectedProjectId),
              })
            }
            disabled={createConversation.isPending}
            className="cursor-pointer border-0 bg-transparent px-0.5 text-[15px] leading-none text-fg-2"
          >
            +
          </button>
        </div>

        <div className="flex flex-col gap-px">
          {visibleConversations.map((c) => {
            const isActive = activeConversationId === c.id;
            const live = isRunning[c.id] ?? false;
            return (
              <div
                key={c.id}
                onClick={() => setActiveConversationId(c.id)}
                className={[
                  'group cursor-pointer rounded border-l-2 px-[9px] py-2 transition-colors duration-[120ms]',
                  isActive ? 'border-accent bg-surface-4' : 'border-transparent bg-transparent',
                ].join(' ')}
              >
                <div className={`flex items-center gap-[5px] ${c.provider !== undefined || c.model !== null ? 'mb-[3px]' : ''}`}>
                  <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-11 ${isActive ? 'font-medium text-fg-0' : 'font-normal text-fg-1'}`}>
                    {c.title}
                  </span>
                  {live && (
                    <span className="shrink-0 rounded-[3px] border border-border-2 bg-accent-lo px-[5px] py-0.5 font-mono text-9 text-accent">
                      Live
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete conversation "${c.title}"?`)) return;
                      if (isActive) setActiveConversationId(null);
                      void deleteConversation.mutateAsync({ id: c.id });
                    }}
                    disabled={deleteConversation.isPending || live}
                    title={live ? 'Stop the run before deleting' : 'Delete conversation'}
                    className="shrink-0 cursor-pointer border-0 bg-transparent px-1 py-0 text-11 leading-none text-red-500 opacity-0 hover:text-red-400 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
                {(c.provider !== undefined || c.model !== null) && (
                  <div className="font-mono text-10 text-fg-2">
                    {[c.provider, c.model].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
          {visibleConversations.length === 0 && !conversationsQuery.isLoading && (
            <div className="px-[9px] py-2 text-11 italic text-fg-2">
              No conversations yet.
            </div>
          )}
        </div>
      </div>

      {/* Godot log */}
      <div className="shrink-0 border-t border-border-1 px-3 py-2.5">
        <div className="mb-1.5 font-mono text-10 uppercase tracking-[0.1em] text-fg-2">
          Godot Log
        </div>
        <div className={`flex flex-col gap-px font-mono text-10 leading-[1.5] ${logRunning ? 'text-success' : 'text-fg-3'}`}>
          {logRunning ? (
            recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="overflow-hidden text-ellipsis whitespace-nowrap"
                  title={log.line}
                >
                  {log.line.slice(0, 55)}
                </div>
              ))
            ) : (
              <div>▶ Runtime active — streaming</div>
            )
          ) : (
            <div>No runtime logs yet. Launch a project.</div>
          )}
        </div>
      </div>
    </div>
  );
}
