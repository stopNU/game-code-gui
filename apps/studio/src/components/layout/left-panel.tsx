import { useMemo } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';

const S = {
  bg1: '#0d1018',
  bg3: '#161b28',
  bg4: '#1c2133',
  bg5: '#222840',
  border: '#1a1f30',
  border2: '#242b3d',
  text0: '#eceef5',
  text1: '#9aa0bc',
  text2: '#545c7a',
  text3: '#363d57',
  accent: '#4d9eff',
  accentLo: '#1a3a6e',
  green: '#3dca7e',
  mono: "'IBM Plex Mono', monospace",
};

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

  const selectedProject = projectsQuery.data?.find((p) => p.id === selectedProjectId) ?? null;

  const visibleConversations = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    if (selectedProjectId === null) return all;
    return all.filter((c) => c.projectId === selectedProjectId);
  }, [conversationsQuery.data, selectedProjectId]);

  const taskCount = selectedProject?.taskCount ?? 0;
  const completeCount = selectedProject?.completeCount ?? 0;
  const progress = taskCount > 0 ? completeCount / taskCount : 0;

  const latestLog = godotLogs.length > 0 ? (godotLogs[godotLogs.length - 1] ?? null) : null;
  const logRunning = godotStatus.status === 'running';

  return (
    <div
      style={{
        width: 210,
        flexShrink: 0,
        background: S.bg1,
        borderRight: `1px solid ${S.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Project mini-card */}
      <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
          Project
        </div>
        {selectedProject !== null ? (
          <div style={{ background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: S.text0, marginBottom: 3 }}>
              {selectedProject.title ?? selectedProject.name}
            </div>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProject.displayPath ?? selectedProject.path}
            </div>
            <div style={{ height: 3, background: S.bg5, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: S.accent, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 9, fontFamily: S.mono, color: S.text2, marginTop: 4 }}>
              {completeCount}/{taskCount} tasks complete
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: S.text2, fontStyle: 'italic' }}>No project selected</div>
        )}
      </div>

      {/* Conversations list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 10px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: S.text2, fontSize: 15, lineHeight: 1, padding: '0 2px' }}
          >
            +
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {visibleConversations.map((c) => {
            const isActive = activeConversationId === c.id;
            const live = isRunning[c.id] ?? false;
            return (
              <div
                key={c.id}
                onClick={() => setActiveConversationId(c.id)}
                style={{
                  padding: '8px 9px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: isActive ? S.bg4 : 'transparent',
                  borderLeft: `2px solid ${isActive ? S.accent : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: c.provider !== undefined || c.model !== null ? 3 : 0 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? S.text0 : S.text1,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {c.title}
                  </span>
                  {live && (
                    <span style={{
                      fontSize: 9,
                      fontFamily: S.mono,
                      color: S.accent,
                      background: S.accentLo,
                      border: `1px solid ${S.border2}`,
                      borderRadius: 3,
                      padding: '2px 5px',
                    }}>
                      Live
                    </span>
                  )}
                </div>
                {(c.provider !== undefined || c.model !== null) && (
                  <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2 }}>
                    {[c.provider, c.model].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
          {visibleConversations.length === 0 && !conversationsQuery.isLoading && (
            <div style={{ fontSize: 11, color: S.text2, fontStyle: 'italic', padding: '8px 9px' }}>
              No conversations yet.
            </div>
          )}
        </div>
      </div>

      {/* Godot log */}
      <div style={{ borderTop: `1px solid ${S.border}`, padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Godot Log
        </div>
        <div style={{
          fontSize: 10,
          fontFamily: S.mono,
          color: logRunning ? S.green : S.text3,
          lineHeight: 1.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {logRunning
            ? (latestLog !== null ? latestLog.line.slice(0, 55) : '▶ Runtime active — streaming')
            : 'No runtime logs yet. Launch a project.'}
        </div>
      </div>
    </div>
  );
}
