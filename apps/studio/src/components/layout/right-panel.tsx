import { Cpu, PlugZap, RadioTower, ScrollText } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Card } from '@renderer/components/ui/card';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';

export function RightPanel(): JSX.Element {
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const settingsQuery = trpc.settings.getStatus.useQuery();
  const langsmithQuery = trpc.langsmith.getStatus.useQuery();
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const sessionDetail = useConversationStore((state) => state.sessionDetail);
  const latestToolCall = useConversationStore((state) => state.latestToolCall);
  const tokenUsage = useConversationStore((state) =>
    activeConversationId === null ? undefined : state.tokenUsage[activeConversationId],
  );
  const godotStatus = useConversationStore((state) => state.godotStatus);
  const godotLogs = useConversationStore((state) => state.godotLogs);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <RadioTower className="h-4 w-4 text-primary" />
          Session
        </div>
        <Badge className="mb-3">{sessionStatus}</Badge>
        <p className="text-sm text-muted-foreground">{sessionDetail}</p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PlugZap className="h-4 w-4 text-accent" />
          Providers
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Anthropic</span>
            <Badge>{settingsQuery.data?.anthropicConfigured ? 'configured' : 'missing'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenAI</span>
            <Badge>{settingsQuery.data?.openaiConfigured ? 'configured' : 'missing'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>LangSmith</span>
            <Badge>{langsmithQuery.data?.configured ? 'configured' : 'inactive'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Godot</span>
            <Badge>{godotStatus.status}</Badge>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          Live Usage
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Input tokens</span>
            <span>{tokenUsage?.input ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Output tokens</span>
            <span>{tokenUsage?.output ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Cached tokens</span>
            <span>{tokenUsage?.cached ?? 0}</span>
          </div>
        </div>
        {latestToolCall !== null ? (
          <div className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Latest tool</div>
            <div className="mt-2 text-sm font-medium text-foreground">{latestToolCall.toolName}</div>
            <div className="mt-1 text-xs text-muted-foreground">{latestToolCall.status}</div>
          </div>
        ) : null}
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ScrollText className="h-4 w-4 text-primary" />
          Godot Log
        </div>
        <ScrollArea className="min-h-0 flex-1 rounded-2xl bg-background/35 p-3">
          <div className="space-y-2 text-xs text-muted-foreground">
            {godotLogs.length === 0 ? (
              <div>No runtime logs yet. Phase 6 will deepen launch and stop controls.</div>
            ) : (
              godotLogs.slice(-40).map((entry) => (
                <div key={entry.id}>
                  <span className={entry.stream === 'stderr' ? 'text-amber-300' : 'text-primary/80'}>
                    [{entry.stream}]
                  </span>{' '}
                  {entry.line}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
