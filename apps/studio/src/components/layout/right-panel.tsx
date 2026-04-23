import { useEffect } from 'react';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';

const S = {
  bg1: '#0d1018',
  bg3: '#161b28',
  bg4: '#1c2133',
  border: '#1a1f30',
  border2: '#242b3d',
  text0: '#eceef5',
  text1: '#9aa0bc',
  text2: '#545c7a',
  text3: '#363d57',
  accent: '#4d9eff',
  accentLo: '#1a3a6e',
  green: '#3dca7e',
  greenLo: '#14311f',
  amber: '#f5a83a',
  red: '#e05252',
  mono: "'IBM Plex Mono', monospace",
};

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${S.border}` }}>
      <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontFamily: S.mono, color: S.text2 }}>{label}</span>
      <span style={{ fontSize: 10, fontFamily: S.mono, color: valueColor ?? S.text1 }}>{value}</span>
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

  const sessionColor = sessionStatus === 'ready' ? S.green : sessionStatus === 'error' ? S.red : S.amber;

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: S.bg1,
        borderLeft: `1px solid ${S.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* Session */}
      <Section title="Session">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sessionColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontFamily: S.mono, color: sessionColor }}>{sessionStatus}</span>
        </div>
      </Section>

      {/* Providers */}
      <Section title="Providers">
        <Row
          label="Anthropic"
          value={settingsQuery.data?.anthropicConfigured ? 'configured' : 'missing'}
          valueColor={settingsQuery.data?.anthropicConfigured ? S.green : S.red}
        />
        <Row
          label="OpenAI"
          value={settingsQuery.data?.openaiConfigured ? 'configured' : 'missing'}
          valueColor={settingsQuery.data?.openaiConfigured ? S.green : S.red}
        />
        <Row
          label="LangSmith"
          value={langsmithQuery.data?.configured ? 'configured' : 'inactive'}
          valueColor={langsmithQuery.data?.configured ? S.green : S.text2}
        />
        <Row
          label="Godot"
          value={godotStatus.status}
          valueColor={godotStatus.status === 'running' ? S.green : S.text2}
        />
      </Section>

      {/* Runtime + Godot */}
      <Section title="Runtime">
        <Row label="Version" value={runtimeQuery.data?.appVersion ?? '—'} />
        <Row label="Updates" value={updateStatus.status} />
        <div style={{ height: 1, background: S.border, margin: '8px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontFamily: S.mono, color: S.text2 }}>Godot Runtime</span>
          <span style={{ fontSize: 10, fontFamily: S.mono, color: godotStatus.status === 'running' ? S.green : S.text2 }}>
            {godotStatus.status}
          </span>
        </div>
        <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8 }}>
          {selectedProject?.title ?? selectedProject?.name ?? (selectedProjectId !== null ? 'loading…' : 'No project')}
        </div>
        {/* Debugger toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontFamily: S.mono, color: S.text2 }}>Debugger</span>
          <button
            onClick={() => setGodotDebuggerEnabled(!godotDebuggerEnabled)}
            style={{
              fontSize: 10, fontFamily: S.mono,
              color: godotDebuggerEnabled ? S.accent : S.text2,
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {godotDebuggerEnabled ? 'on' : 'off'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              if (selectedProjectId === null) return;
              void launchGodot.mutateAsync({ projectId: selectedProjectId, debuggerEnabled: godotDebuggerEnabled }).then((status) => {
                hydrateGodotRuntime({ status, logs: [] });
              });
            }}
            disabled={godotStatus.status === 'running' || selectedProjectId === null || launchGodot.isPending}
            style={{
              flex: 1, padding: '5px 0',
              background: godotStatus.status === 'running' ? S.bg4 : S.green,
              color: godotStatus.status === 'running' ? S.text2 : '#fff',
              border: 'none', borderRadius: 3,
              fontSize: 10, cursor: godotStatus.status === 'running' ? 'default' : 'pointer',
              fontFamily: S.mono,
              opacity: selectedProjectId === null ? 0.4 : 1,
            }}
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
            style={{
              padding: '5px 10px', background: S.bg4, color: S.text2,
              border: `1px solid ${S.border}`, borderRadius: 3,
              fontSize: 10, cursor: 'pointer', fontFamily: S.mono,
            }}
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
      <div style={{ padding: '10px 14px' }}>
        <button
          onClick={() => void openLogFile.mutateAsync()}
          disabled={openLogFile.isPending}
          style={{
            width: '100%', background: S.bg3, border: `1px solid ${S.border2}`,
            borderRadius: 3, padding: '7px 0', fontSize: 10, fontFamily: S.mono,
            color: S.text1, cursor: 'pointer', marginBottom: 6,
          }}
        >
          ⊡ Open Log File
        </button>
        <button
          onClick={() => void restartToInstallUpdate.mutateAsync()}
          disabled={restartToInstallUpdate.isPending || updateStatus.status !== 'downloaded'}
          style={{
            width: '100%', background: S.bg3, border: `1px solid ${S.border2}`,
            borderRadius: 3, padding: '7px 0', fontSize: 10, fontFamily: S.mono,
            color: updateStatus.status === 'downloaded' ? S.text0 : S.text2,
            cursor: updateStatus.status === 'downloaded' ? 'pointer' : 'default',
          }}
        >
          ↺ Restart to Update
        </button>
      </div>
    </div>
  );
}
