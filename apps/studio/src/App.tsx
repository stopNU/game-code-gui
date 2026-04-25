import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { LeftPanel } from '@renderer/components/layout/left-panel';
import { CenterPanel } from '@renderer/components/layout/center-panel';
import { RightPanel } from '@renderer/components/layout/right-panel';
import { CommandPalette } from '@renderer/components/command-palette';
import { ApprovalDialog } from '@renderer/components/approvals/approval-dialog';
import { SettingsDialog } from '@renderer/components/settings/settings-dialog';
import { StartScreen } from '@renderer/components/screens/start-screen';
import { NewProjectWizard } from '@renderer/components/screens/new-project-wizard';
import { Button } from '@renderer/components/ui/button';
import { Badge } from '@renderer/components/ui/badge';
import { useConversationStream } from '@renderer/hooks/useConversationStream';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';

const THEME_STORAGE_KEY = 'harness-studio.theme';
const PAGE_STORAGE_KEY = 'harness-studio.page';
const PROJECT_STORAGE_KEY = 'harness-studio.project';

type AppPage = 'home' | 'workspace' | 'new-project';

export function App(): JSX.Element {
  useConversationStream();

  const utils = trpc.useUtils();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [page, setPage] = useState<AppPage>(() => {
    try {
      return (localStorage.getItem(PAGE_STORAGE_KEY) as AppPage | null) ?? 'home';
    } catch {
      return 'home';
    }
  });

  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const hydrateApprovals = useConversationStore((state) => state.hydrateApprovals);
  const theme = useConversationStore((state) => state.theme);
  const setTheme = useConversationStore((state) => state.setTheme);
  const setSelectedProjectId = useConversationStore((state) => state.setSelectedProjectId);
  const activeConversationRunning = useConversationStore((state) =>
    activeConversationId === null ? false : (state.isRunning[activeConversationId] ?? false),
  );
  const godotStatus = useConversationStore((state) => state.godotStatus);
  const godotDebuggerEnabled = useConversationStore((state) => state.godotDebuggerEnabled);
  const hydrateGodotRuntime = useConversationStore((state) => state.hydrateGodotRuntime);
  const approvals = useConversationStore((state) =>
    activeConversationId === null ? null : (state.approvals[activeConversationId] ?? null),
  ) ?? [];
  const setActiveConversationId = useConversationStore((state) => state.setActiveConversationId);
  const registerConversations = useConversationStore((state) => state.registerConversations);
  const activeConvoPrefs = useConversationStore((state) =>
    activeConversationId !== null ? (state.conversationPreferences[activeConversationId] ?? null) : null,
  );

  const conversationsQuery = trpc.conversations.list.useQuery(undefined);
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const decideApproval = trpc.approvals.decide.useMutation();
  const launchGodot = trpc.godot.launch.useMutation();
  const stopGodot = trpc.godot.stop.useMutation();
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      registerConversations([conversation]);
      setActiveConversationId(conversation.id);
      await utils.conversations.list.invalidate();
    },
  });
  const abortConversation = trpc.agent.abort.useMutation();

  const selectedProject =
    selectedProjectId !== null
      ? (projectsQuery.data?.find((p) => p.id === selectedProjectId) ?? null)
      : null;

  const createConversationFromCurrentContext = (): void => {
    void createConversation.mutateAsync({
      projectId: selectedProjectId,
      ...getDefaultConversationConfig(selectedProjectId),
    });
  };

  const navigateConversation = (direction: -1 | 1): void => {
    const conversations = conversationsQuery.data ?? [];
    if (conversations.length === 0) return;
    const currentIndex = conversations.findIndex((c) => c.id === activeConversationId);
    const safeIndex = currentIndex === -1 ? 0 : (currentIndex + direction + conversations.length) % conversations.length;
    setActiveConversationId(conversations[safeIndex]?.id ?? null);
  };

  const openProject = (projectId: string): void => {
    setSelectedProjectId(projectId);
    setPage('workspace');
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, 'workspace');
      localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
    } catch { /* ignore */ }
  };

  const goHome = (): void => {
    setPage('home');
    try { localStorage.setItem(PAGE_STORAGE_KEY, 'home'); } catch { /* ignore */ }
  };

  const handleNewGame = (): void => {
    setPage('new-project');
    try { localStorage.setItem(PAGE_STORAGE_KEY, 'new-project'); } catch { /* ignore */ }
  };

  const handleProjectCreated = (_details: { name: string; path: string; engine: string; provider: string; model: string; template: string; brief: string }): void => {
    setSelectedProjectId(null);
    setPage('workspace');
    try { localStorage.setItem(PAGE_STORAGE_KEY, 'workspace'); } catch { /* ignore */ }
    createConversationFromCurrentContext();
  };

  const pendingApprovalsQuery = trpc.approvals.listPending.useQuery(
    activeConversationId === null ? undefined : { conversationId: activeConversationId },
    { enabled: activeConversationId !== null },
  );

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme);
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (pendingApprovalsQuery.data !== undefined) {
      hydrateApprovals(
        pendingApprovalsQuery.data.map((approval) => ({
          id: approval.id,
          conversationId: approval.conversationId,
          toolName: approval.toolName,
          args: approval.args,
          riskLevel: (approval.riskLevel ?? 'medium') as 'low' | 'medium' | 'high',
          rationale: approval.reason ?? 'This tool call needs explicit approval.',
          requestedAt: new Date().toISOString(),
          status: approval.status,
          ...(approval.scope !== null && approval.scope !== undefined ? { scope: approval.scope } : {}),
        })),
      );
    }
  }, [hydrateApprovals, pendingApprovalsQuery.data]);

  // Restore selected project from localStorage on mount
  useEffect(() => {
    try {
      const storedProjectId = localStorage.getItem(PROJECT_STORAGE_KEY);
      if (storedProjectId !== null && page === 'workspace') {
        setSelectedProjectId(storedProjectId);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createConversationFromCurrentContext();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        setActiveConversationId(null);
        return;
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault();
        navigateConversation(-1);
        return;
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        navigateConversation(1);
        return;
      }
      if (event.key === 'Escape' && activeConversationRunning && activeConversationId !== null) {
        event.preventDefault();
        void abortConversation.mutateAsync({ conversationId: activeConversationId });
        return;
      }
      if (event.key === 'Escape' && commandPaletteOpen) {
        event.preventDefault();
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abortConversation, activeConversationId, activeConversationRunning, commandPaletteOpen, conversationsQuery.data, createConversation, selectedProjectId, setActiveConversationId]);

  const pendingApproval = approvals.find((approval) => approval.status === 'pending') ?? null;

  if (page === 'home') {
    return (
      <>
        <div className="h-screen overflow-hidden bg-background text-foreground">
          <StartScreen onOpenProject={openProject} onNewGame={handleNewGame} />
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme} onThemeChange={setTheme} />
      </>
    );
  }

  if (page === 'new-project') {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <NewProjectWizard onBack={goHome} onCreate={handleProjectCreated} />
      </div>
    );
  }

  const handleGodotLaunch = (): void => {
    if (selectedProjectId === null) return;
    void launchGodot.mutateAsync({ projectId: selectedProjectId, debuggerEnabled: godotDebuggerEnabled }).then((status) => {
      hydrateGodotRuntime({ status, logs: [] });
    });
  };

  const handleGodotStop = (): void => {
    void stopGodot.mutateAsync().then((status) => {
      hydrateGodotRuntime({ status, logs: useConversationStore.getState().godotLogs });
    });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Flat top bar */}
      <header
        className="flex shrink-0 items-center gap-2 px-3"
        style={{
          height: 46,
          background: '#0d1018',
          borderBottom: '1px solid #1a1f30',
          zIndex: 10,
        }}
      >
        {/* Back to home */}
        <button
          onClick={goHome}
          className="flex items-center gap-1.5 rounded px-2 py-1"
          title="Back to home"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em]" style={{ color: '#4d9eff' }}>
            HARNESS
          </span>
          <span className="font-mono text-[10px]" style={{ color: '#363d57' }}>←</span>
        </button>

        <div className="h-4 w-px" style={{ background: '#1a1f30', margin: '0 2px' }} />

        {/* Project name + status */}
        {selectedProject !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium" style={{ color: '#eceef5' }}>
              {selectedProject.title ?? selectedProject.name}
            </span>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: selectedProject.status === 'ready' ? '#3dca7e' : '#363d57',
                boxShadow: selectedProject.status === 'ready' ? '0 0 6px #3dca7e66' : 'none',
              }}
            />
            <Badge
              className="h-5 rounded border px-1.5 font-mono text-[10px]"
              style={{
                color: selectedProject.status === 'ready' ? '#3dca7e' : '#545c7a',
                background: selectedProject.status === 'ready' ? '#14311f' : '#1c2133',
                borderColor: selectedProject.status === 'ready' ? '#1d4a2c' : '#242b3d',
              }}
            >
              {selectedProject.status}
            </Badge>
          </div>
        ) : (
          <span className="text-[13px]" style={{ color: '#545c7a' }}>No project</span>
        )}

        <div className="flex-1" />

        {/* Provider / model badges from active conversation */}
        {activeConvoPrefs !== null && (
          <>
            <Badge className="h-5 rounded border px-1.5 font-mono text-[10px]" style={{ color: '#9aa0bc', background: '#161b28', borderColor: '#242b3d' }}>
              {activeConvoPrefs.provider}
            </Badge>
            <Badge className="h-5 rounded border px-1.5 font-mono text-[10px]" style={{ color: '#4d9eff', background: '#1a3a6e', borderColor: '#1a3a6e' }}>
              {activeConvoPrefs.model}
            </Badge>
            <div className="h-4 w-px" style={{ background: '#1a1f30', margin: '0 2px' }} />
          </>
        )}

        {/* Godot Launch / Stop */}
        {godotStatus.status === 'running' ? (
          <button
            onClick={handleGodotStop}
            disabled={stopGodot.isPending}
            className="rounded px-2.5 py-1 font-mono text-[10px]"
            style={{ background: 'transparent', border: '1px solid #3a1010', color: '#e05252', cursor: 'pointer' }}
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={handleGodotLaunch}
            disabled={selectedProjectId === null || launchGodot.isPending}
            className="rounded px-2.5 py-1 font-mono text-[10px]"
            style={{
              background: '#3dca7e',
              border: 'none',
              color: '#fff',
              cursor: selectedProjectId === null ? 'default' : 'pointer',
              opacity: selectedProjectId === null ? 0.4 : 1,
            }}
          >
            {launchGodot.isPending ? '◷ Starting…' : '▶ Launch'}
          </button>
        )}

        <div className="h-4 w-px" style={{ background: '#1a1f30', margin: '0 2px' }} />

        {/* Sidebar toggles */}
        <button
          onClick={() => setSidebarOpen((s) => !s)}
          title="Toggle conversations"
          className="rounded px-2 py-1 font-mono text-[11px]"
          style={{
            background: sidebarOpen ? '#1c2133' : 'transparent',
            border: `1px solid ${sidebarOpen ? '#242b3d' : 'transparent'}`,
            color: sidebarOpen ? '#9aa0bc' : '#545c7a',
            cursor: 'pointer',
          }}
        >⊟</button>
        <button
          onClick={() => setRightOpen((r) => !r)}
          title="Toggle status panel"
          className="rounded px-2 py-1 font-mono text-[11px]"
          style={{
            background: rightOpen ? '#1c2133' : 'transparent',
            border: `1px solid ${rightOpen ? '#242b3d' : 'transparent'}`,
            color: rightOpen ? '#9aa0bc' : '#545c7a',
            cursor: 'pointer',
          }}
        >⊞</button>

        <div className="h-4 w-px" style={{ background: '#1a1f30', margin: '0 2px' }} />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setSettingsOpen(true)}
          title="Settings (Ctrl+,)"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </header>

      {/* Flush three-column workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && <LeftPanel />}
        <CenterPanel />
        {rightOpen && <RightPanel />}
      </div>

      <ApprovalDialog
        approval={pendingApproval}
        submitting={decideApproval.isPending}
        onDecision={async (decision, scope) => {
          if (pendingApproval === null) return;
          await decideApproval.mutateAsync({
            id: pendingApproval.id,
            decision,
            ...(decision === 'approved' ? { scope } : {}),
          });
          await utils.approvals.listPending.invalidate();
        }}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme} onThemeChange={setTheme} />
      <CommandPalette
        open={commandPaletteOpen}
        conversations={conversationsQuery.data ?? []}
        onClose={() => setCommandPaletteOpen(false)}
        onNewConversation={createConversationFromCurrentContext}
        onOpenSettings={() => setSettingsOpen(true)}
        onCloseConversation={() => setActiveConversationId(null)}
        onSelectConversation={setActiveConversationId}
      />
    </div>
  );
}
