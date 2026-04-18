import { useEffect, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { LeftPanel } from '@renderer/components/layout/left-panel';
import { CenterPanel } from '@renderer/components/layout/center-panel';
import { RightPanel } from '@renderer/components/layout/right-panel';
import { CommandPalette } from '@renderer/components/command-palette';
import { ApprovalDialog } from '@renderer/components/approvals/approval-dialog';
import { SettingsDialog } from '@renderer/components/settings/settings-dialog';
import { Button } from '@renderer/components/ui/button';
import { useConversationStream } from '@renderer/hooks/useConversationStream';
import { trpc } from '@renderer/lib/trpc';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';

const THEME_STORAGE_KEY = 'harness-studio.theme';

export function App(): JSX.Element {
  useConversationStream();

  const utils = trpc.useUtils();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const hydrateApprovals = useConversationStore((state) => state.hydrateApprovals);
  const theme = useConversationStore((state) => state.theme);
  const setTheme = useConversationStore((state) => state.setTheme);
  const activeConversationRunning = useConversationStore((state) =>
    activeConversationId === null ? false : (state.isRunning[activeConversationId] ?? false),
  );
  const approvals = useConversationStore((state) =>
    activeConversationId === null ? null : (state.approvals[activeConversationId] ?? null),
  ) ?? [];
  const setActiveConversationId = useConversationStore((state) => state.setActiveConversationId);
  const registerConversations = useConversationStore((state) => state.registerConversations);
  const conversationsQuery = trpc.conversations.list.useQuery(undefined);
  const decideApproval = trpc.approvals.decide.useMutation();
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      registerConversations([conversation]);
      setActiveConversationId(conversation.id);
      await utils.conversations.list.invalidate();
    },
  });
  const abortConversation = trpc.agent.abort.useMutation();

  const createConversationFromCurrentContext = (): void => {
    void createConversation.mutateAsync({
      projectId: selectedProjectId,
      ...getDefaultConversationConfig(selectedProjectId),
    });
  };

  const navigateConversation = (direction: -1 | 1): void => {
    const conversations = conversationsQuery.data ?? [];
    if (conversations.length === 0) {
      return;
    }

    const currentIndex = conversations.findIndex((conversation) => conversation.id === activeConversationId);
    const safeIndex = currentIndex === -1 ? 0 : (currentIndex + direction + conversations.length) % conversations.length;
    setActiveConversationId(conversations[safeIndex]?.id ?? null);
  };
  const pendingApprovalsQuery = trpc.approvals.listPending.useQuery(
    activeConversationId === null ? undefined : { conversationId: activeConversationId },
    {
      enabled: activeConversationId !== null,
    },
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
        void abortConversation.mutateAsync({
          conversationId: activeConversationId,
        });
        return;
      }

      if (event.key === 'Escape' && commandPaletteOpen) {
        event.preventDefault();
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [abortConversation, activeConversationId, activeConversationRunning, commandPaletteOpen, conversationsQuery.data, createConversation, selectedProjectId, setActiveConversationId]);

  const pendingApproval = approvals.find((approval) => approval.status === 'pending') ?? null;

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(199,102,43,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(28,179,138,0.12),transparent_22%)]" />
      <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-20" />
      <main className="relative mx-auto flex h-full max-w-[1880px] flex-col gap-5 overflow-hidden p-4 lg:p-6">
        <header className="shrink-0 rounded-[28px] border border-border bg-card/85 px-6 py-5 shadow-glow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-primary">Harness Studio</p>
              <h1 className="mt-3 text-3xl font-semibold text-foreground">Conversational control room for the harness</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Phase 8 brings the desktop shell together with workspace-aware settings, keyboard shortcuts, inline
                conversation polish, token budgeting, and light-theme support.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSettingsOpen(true);
                }}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Settings
              </Button>
              <Button
                onClick={() => {
                  createConversationFromCurrentContext();
                }}
                disabled={createConversation.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Conversation
              </Button>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
          <LeftPanel />
          <CenterPanel />
          <RightPanel />
        </section>
      </main>

      <ApprovalDialog
        approval={pendingApproval}
        submitting={decideApproval.isPending}
        onDecision={async (decision, scope) => {
          if (pendingApproval === null) {
            return;
          }

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
