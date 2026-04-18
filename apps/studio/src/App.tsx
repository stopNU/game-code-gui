import { LeftPanel } from '@renderer/components/layout/left-panel';
import { CenterPanel } from '@renderer/components/layout/center-panel';
import { RightPanel } from '@renderer/components/layout/right-panel';
import { useConversationStream } from '@renderer/hooks/useConversationStream';

export function App(): JSX.Element {
  useConversationStream();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(43,144,217,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(24,214,164,0.12),transparent_22%)]" />
      <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-20" />
      <main className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col gap-5 p-4 lg:p-6">
        <header className="rounded-[28px] border border-border bg-card/80 px-6 py-5 shadow-glow">
          <p className="text-xs uppercase tracking-[0.32em] text-primary">Desktop Studio</p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Electron shell for the agent harness</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Phase 2 wires the studio shell onto SQLite-backed projects, conversations, approvals, and encrypted
                settings while keeping the IPC streaming loop in place for the agent layer.
              </p>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <LeftPanel />
          <CenterPanel />
          <RightPanel />
        </section>
      </main>
    </div>
  );
}
