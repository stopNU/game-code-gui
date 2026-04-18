import { useState } from 'react';
import { LoaderCircle, Square, SendHorizonal } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Textarea } from '@renderer/components/ui/textarea';

interface ChatComposerProps {
  disabled?: boolean;
  sending: boolean;
  onSend: (message: string) => Promise<void>;
  onAbort: () => Promise<void>;
}

export function ChatComposer({ disabled, sending, onSend, onAbort }: ChatComposerProps): JSX.Element {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async (): Promise<void> => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      return;
    }

    setPrompt('');
    await onSend(trimmed);
  };

  return (
    <div className="p-5">
      <div className="rounded-[28px] border border-border bg-background/50 p-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask Harness Studio to plan, scaffold, implement, or explain the next move..."
          className="min-h-[110px] border-0 bg-transparent px-1 py-1 focus:ring-0"
          disabled={disabled || sending}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {sending ? 'Agent turn in progress. You can abort the current run.' : 'Shift the harness with natural language.'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void onAbort()} disabled={!sending}>
              <Square className="mr-2 h-4 w-4" />
              Abort
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={disabled || sending}>
              {sending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
