import { useEffect } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="border-b border-border-1 px-3.5 py-3">
      <div className="mb-[7px] font-mono text-10 uppercase tracking-wider2 text-fg-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }): JSX.Element {
  return (
    <div className="mb-1 flex items-center justify-between">
      <span className="font-mono text-11 text-fg-2">{label}</span>
      <span className={`font-mono text-10 ${valueClassName ?? 'text-fg-1'}`}>{value}</span>
    </div>
  );
}

export function RightPanel(): JSX.Element {
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const tokenUsage = useConversationStore((state) =>
    activeConversationId === null ? undefined : state.tokenUsage[activeConversationId],
  );
  const godotStatus = useConversationStore((state) => state.godotStatus);
  const godotDebuggerEnabled = useConversationStore((state) => state.godotDebuggerEnabled);
  const setGodotDebuggerEnabled = useConversationStore((state) => state.setGodotDebuggerEnabled);
  const updateStatus = useConversationStore((state) => state.updateStatus);
  const hydrateGodotRuntime = useConversationStore((state) => state.hydrateGodotRuntime);

  const settingsQuery = trpc.settings.getStatus.useQuery();
  const langsmithQuery = trpc.langsmith.getStatus.useQuery();
  const runtimeQuery = trpc.runtime.getStatus.useQuery();
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const godotStatusQuery = trpc.godot.getStatus.useQuery();
  const godotLogsQuery = trpc.godot.getLogs.useQuery();
  const launchGodot = trpc.godot.launch.useMutation();
  const stopGodot = trpc.godot.stop.useMutation();
  const openLogFile = trpc.runtime.openLogFile.useMutation();
  const restartToInstallUpdate = trpc.runtime.restartToInstallUpdate.useMutation();

  useEffect(() => {
    if (runtimeQuery.data !== undefined) {
      useConversationStore.setState({ updateStatus: runtimeQuery.data.updateState });
    }
  }, [runtimeQuery.data]);

  useEffect(() => {
    if (godotStatusQuery.data !== undefined && godotLogsQuery.data !== undefined) {
      hydrateGodotRuntime({ status: godotStatusQuery.data, logs: godotLogsQuery.data });
    }
  }, [godotLogsQuery.data, godotStatusQuery.data, hydrateGodotRuntime]);

  const selectedProject = projectsQuery.data?.find((p) => p.id === selectedProjectId) ?? null;

  const sessionDotCls = sessionStatus === 'ready' ? 'bg-success' : sessionStatus === 'error' ? 'bg-danger' : 'bg-warn';
  const sessionTextCls = sessionStatus === 'ready' ? 'text-success' : sessionStatus === 'error' ? 'text-danger' : 'text-warn';

  return (
    <div className="flex w-[220px] shrink-0 flex-col overflow-auto border-l border-border-1 bg-surface-1">
      {/* Session */}
      <Section title="Session">
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${sessionDotCls}`} />
          <span className={`font-mono text-11 ${sessionTextCls}`}>{sessionStatus}</span>
        </div>
      </Section>

      {/* Providers */}
      <Section title="Providers">
        <Row
          label="Anthropic"
          value={settingsQuery.data?.anthropicConfigured ? 'configured' : 'missing'}
          valueClassName={settingsQuery.data?.anthropicConfigured ? 'text-success' : 'text-danger'}
        />
        <Row
          label="OpenAI"
          value={settingsQuery.data?.openaiConfigured ? 'configured' : 'missing'}
          valueClassName={settingsQuery.data?.openaiConfigured ? 'text-success' : 'text-danger'}
        />
        <Row
          label="LangSmith"
          value={langsmithQuery.data?.configured ? 'configured' : 'inactive'}
          valueClassName={langsmithQuery.data?.configured ? 'text-success' : 'text-fg-2'}
        />
        <Row
          label="Godot"
          value={godotStatus.status}
          valueClassName={godotStatus.status === 'running' ? 'text-success' : 'text-fg-2'}
        />
      </Section>

      {/* Runtime + Godot */}
      <Section title="Runtime">
        <Row label="Version" value={runtimeQuery.data?.appVersion ?? '—'} />
        <Row label="Updates" value={updateStatus.status} />
        <div className="my-2 h-px bg-border-1" />
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-10 text-fg-2">Godot Runtime</span>
          <span className={`font-mono text-10 ${godotStatus.status === 'running' ? 'text-success' : 'text-fg-2'}`}>
            {godotStatus.status}
          </span>
        </div>
        <div className="mb-2 font-mono text-10 text-fg-2">
          {selectedProject?.title ?? selectedProject?.name ?? (selectedProjectId !== null ? 'loading…' : 'No project')}
        </div>
        {/* Debugger toggle */}
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-10 text-fg-2">Debugger</span>
          <button
            onClick={() => setGodotDebuggerEnabled(!godotDebuggerEnabled)}
            className={`cursor-pointer border-0 bg-transparent p-0 font-mono text-10 ${godotDebuggerEnabled ? 'text-accent' : 'text-fg-2'}`}
          >
            {godotDebuggerEnabled ? 'on' : 'off'}
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              if (selectedProjectId === null) return;
              void launchGodot.mutateAsync({ projectId: selectedProjectId, debuggerEnabled: godotDebuggerEnabled }).then((status) => {
                hydrateGodotRuntime({ status, logs: [] });
              });
            }}
            disabled={godotStatus.status === 'running' || selectedProjectId === null || launchGodot.isPending}
            className={[
              'flex-1 rounded-[3px] border-0 py-[5px] font-mono text-10',
              godotStatus.status === 'running' ? 'cursor-default bg-surface-4 text-fg-2' : 'cursor-pointer bg-success text-white',
              selectedProjectId === null ? 'opacity-40' : '',
            ].join(' ')}
          >
            ▶ Launch
          </button>
          <button
            onClick={() => {
              void stopGodot.mutateAsync().then((status) => {
                hydrateGodotRuntime({ status, logs: useConversationStore.getState().godotLogs });
              });
            }}
            disabled={stopGodot.isPending}
            className="cursor-pointer rounded-[3px] border border-border-1 bg-surface-4 px-2.5 py-[5px] font-mono text-10 text-fg-2"
          >
            Stop
          </button>
        </div>
      </Section>

      {/* Live Usage */}
      <Section title="Live Usage">
        <Row label="Input tokens" value={(tokenUsage?.input ?? 0).toLocaleString()} />
        <Row label="Output tokens" value={(tokenUsage?.output ?? 0).toLocaleString()} />
        <Row label="Cached tokens" value={(tokenUsage?.cached ?? 0).toLocaleString()} />
      </Section>

      {/* Actions */}
      <div className="px-3.5 py-2.5">
        <button
          onClick={() => void openLogFile.mutateAsync()}
          disabled={openLogFile.isPending}
          className="mb-1.5 w-full cursor-pointer rounded-[3px] border border-border-2 bg-surface-3 py-[7px] font-mono text-10 text-fg-1"
        >
          ⊡ Open Log File
        </button>
        <button
          onClick={() => void restartToInstallUpdate.mutateAsync()}
          disabled={restartToInstallUpdate.isPending || updateStatus.status !== 'downloaded'}
          className={[
            'w-full rounded-[3px] border border-border-2 bg-surface-3 py-[7px] font-mono text-10',
            updateStatus.status === 'downloaded' ? 'cursor-pointer text-fg-0' : 'cursor-default text-fg-2',
          ].join(' ')}
        >
          ↺ Restart to Update
        </button>
      </div>
    </div>
  );
}
