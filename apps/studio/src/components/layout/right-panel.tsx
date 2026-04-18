import { Cpu, PlugZap, RadioTower } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Card } from '@renderer/components/ui/card';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';

export function RightPanel(): JSX.Element {
  const settingsQuery = trpc.settings.getStatus.useQuery();
  const langsmithQuery = trpc.langsmith.getStatus.useQuery();
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const sessionDetail = useConversationStore((state) => state.sessionDetail);
  const latestToolCall = useConversationStore((state) => state.latestToolCall);

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <RadioTower className="h-4 w-4 text-primary" />
          Session State
        </div>
        <Badge className="mb-3">{sessionStatus}</Badge>
        <p className="text-sm text-muted-foreground">{sessionDetail}</p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PlugZap className="h-4 w-4 text-accent" />
          Provider Readiness
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
        </div>
      </Card>

      <Card className="flex-1 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          Latest Routed Event
        </div>
        {latestToolCall === null ? (
          <p className="text-sm text-muted-foreground">
            Tool relay events will appear here once the utility process streams activity over the MessagePort bridge.
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{latestToolCall.toolName}</div>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {JSON.stringify(latestToolCall.input, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
