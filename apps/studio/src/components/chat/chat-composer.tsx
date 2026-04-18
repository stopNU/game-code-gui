import { useEffect, useRef, useState } from 'react';
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 12 * 24)}px`;
  }, [prompt]);

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
          ref={textareaRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Ask Harness Studio to plan, scaffold, implement, or explain the next move..."
          className="min-h-[110px] max-h-[288px] resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 focus:ring-0"
          disabled={disabled || sending}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {sending ? 'Agent turn in progress. Press Esc to abort the current run.' : 'Send with Ctrl/Cmd+Enter.'}
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
