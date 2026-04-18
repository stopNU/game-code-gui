import { LoaderCircle } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Separator } from '@renderer/components/ui/separator';
import { Textarea } from '@renderer/components/ui/textarea';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { useState } from 'react';

export function CenterPanel(): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const conversationId = useConversationStore((state) => state.activeConversationId);
  const messages = useConversationStore((state) => state.messages[conversationId] ?? []);
  const addUserMessage = useConversationStore((state) => state.upsertUserMessage);
  const latestToolCall = useConversationStore((state) => state.latestToolCall);
  const sendMutation = trpc.agent.send.useMutation();
  const model = provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-5.4';

  const onSubmit = async (): Promise<void> => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      return;
    }

    addUserMessage(conversationId, trimmed);
    setPrompt('');
    await sendMutation.mutateAsync({
      conversationId,
      userMessage: trimmed,
      model,
      provider,
    });
  };

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Conversation</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Studio conversation runtime</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sending with {provider} · {model}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-border bg-background/60 p-1">
            <button
              type="button"
              onClick={() => setProvider('anthropic')}
              className={
                provider === 'anthropic'
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full px-3 py-1 text-xs text-muted-foreground'
              }
            >
              Anthropic
            </button>
            <button
              type="button"
              onClick={() => setProvider('openai')}
              className={
                provider === 'openai'
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full px-3 py-1 text-xs text-muted-foreground'
              }
            >
              OpenAI
            </button>
          </div>
          {sendMutation.isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              Sending to utility process
            </div>
          ) : null}
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-5 py-4">
        <div className="space-y-4">
          {latestToolCall !== null ? (
            <div className="max-w-2xl rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm text-foreground">
              <div className="mb-2 text-[10px] uppercase tracking-[0.24em] opacity-70">tool</div>
              <div className="font-medium">{latestToolCall.toolName}</div>
              <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(latestToolCall.input, null, 2)}
              </div>
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-6 text-sm text-muted-foreground">
              The renderer is ready. Ask Harness Studio to plan, scaffold, implement, or launch a project and the
              utility-process agent will stream its work here.
            </div>
          ) : null}
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-2xl rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground'
                  : message.role === 'assistant'
                    ? 'max-w-2xl rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground'
                    : 'max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground'
              }
            >
              <div className="mb-2 text-[10px] uppercase tracking-[0.24em] opacity-70">{message.role}</div>
              <div className="whitespace-pre-wrap">{message.content || 'Streaming...'}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-5">
        <div className="rounded-[28px] bg-background/50 p-3">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Harness Studio to scaffold the next layer of the desktop app..."
            className="min-h-[110px] border-0 bg-transparent px-1 py-1 focus:ring-0"
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={() => void onSubmit()} disabled={sendMutation.isPending}>
              Send to Agent
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
