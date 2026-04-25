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
  const createProject = trpc.projects.create.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
    },
  });
  const sendMessage = trpc.agent.send.useMutation();

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

  const handleProjectCreated = (details: { name: string; projectId: string; path: string; engine: string; provider: string; model: string; template: string; brief: string }): void => {
    const provider = details.provider as 'anthropic' | 'openai' | 'codex';
    // The scaffold mutation already created the directory and DB project record.
    // Just navigate and create the initial conversation.
    setSelectedProjectId(details.projectId);
    setPage('workspace');
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, 'workspace');
      localStorage.setItem(PROJECT_STORAGE_KEY, details.projectId);
    } catch { /* ignore */ }
    void createConversation.mutateAsync({
      projectId: details.projectId,
      title: details.name,
      provider,
      model: details.model,
    }).then((conversation) => {
      if (details.brief.trim()) {
        sendMessage.mutate({
          conversationId: conversation.id,
          userMessage: `Project scaffolded. The game plan is in harness/tasks.json. Brief: ${details.brief}`,
          projectId: details.projectId,
          model: details.model,
          provider,
        });
      }
    });
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
      <header className="z-10 flex h-[46px] shrink-0 items-center gap-2 border-b border-border-1 bg-surface-1 px-3">
        {/* Back to home */}
        <button
          onClick={goHome}
          className="flex cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-2 py-1"
          title="Back to home"
        >
          <span className="font-mono text-11 font-semibold tracking-[0.14em] text-accent">
            HARNESS
          </span>
          <span className="font-mono text-10 text-fg-3">←</span>
        </button>

        <div className="mx-0.5 h-4 w-px bg-border-1" />

        {/* Project name + status */}
        {selectedProject !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-13 font-medium text-fg-0">
              {selectedProject.title ?? selectedProject.name}
            </span>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${selectedProject.status === 'ready' ? 'bg-success' : 'bg-fg-3'}`}
              style={selectedProject.status === 'ready' ? { boxShadow: '0 0 6px #3dca7e66' } : undefined}
            />
            <Badge
              className={`h-5 rounded border px-1.5 font-mono text-10 ${
                selectedProject.status === 'ready'
                  ? 'border-[#1d4a2c] bg-success-lo text-success'
                  : 'border-border-2 bg-surface-4 text-fg-2'
              }`}
            >
              {selectedProject.status}
            </Badge>
          </div>
        ) : (
          <span className="text-13 text-fg-2">No project</span>
        )}

        <div className="flex-1" />

        {/* Provider / model badges from active conversation */}
        {activeConvoPrefs !== null && (
          <>
            <Badge className="h-5 rounded border border-border-2 bg-surface-3 px-1.5 font-mono text-10 text-fg-1">
              {activeConvoPrefs.provider}
            </Badge>
            <Badge className="h-5 rounded border border-accent-lo bg-accent-lo px-1.5 font-mono text-10 text-accent">
              {activeConvoPrefs.model}
            </Badge>
            <div className="mx-0.5 h-4 w-px bg-border-1" />
          </>
        )}

        {/* Godot Launch / Stop */}
        {godotStatus.status === 'running' ? (
          <button
            onClick={handleGodotStop}
            disabled={stopGodot.isPending}
            className="cursor-pointer rounded border border-[#3a1010] bg-transparent px-2.5 py-1 font-mono text-10 text-danger"
          >
            ■ Stop
          </button>
        ) : (
          <button
            onClick={handleGodotLaunch}
            disabled={selectedProjectId === null || launchGodot.isPending}
            className={`rounded border-0 bg-success px-2.5 py-1 font-mono text-10 text-white ${selectedProjectId === null ? 'cursor-default opacity-40' : 'cursor-pointer'}`}
          >
            {launchGodot.isPending ? '◷ Starting…' : '▶ Launch'}
          </button>
        )}

        <div className="mx-0.5 h-4 w-px bg-border-1" />

        {/* Sidebar toggles */}
        <button
          onClick={() => setSidebarOpen((s) => !s)}
          title="Toggle conversations"
          className={`cursor-pointer rounded px-2 py-1 font-mono text-11 ${sidebarOpen ? 'border border-border-2 bg-surface-4 text-fg-1' : 'border border-transparent bg-transparent text-fg-2'}`}
        >⊟</button>
        <button
          onClick={() => setRightOpen((r) => !r)}
          title="Toggle status panel"
          className={`cursor-pointer rounded px-2 py-1 font-mono text-11 ${rightOpen ? 'border border-border-2 bg-surface-4 text-fg-1' : 'border border-transparent bg-transparent text-fg-2'}`}
        >⊞</button>

        <div className="mx-0.5 h-4 w-px bg-border-1" />

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
