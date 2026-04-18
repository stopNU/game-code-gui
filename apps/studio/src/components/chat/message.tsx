import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ConversationMessage } from '@renderer/store/conversation-store';
import { cn } from '@renderer/lib/utils';

interface MessageProps {
  message: ConversationMessage;
}

export function Message({ message }: MessageProps): JSX.Element {
  return (
    <div
      className={cn(
        'max-w-3xl rounded-[24px] px-4 py-3 shadow-glow/50',
        message.role === 'user'
          ? 'ml-auto bg-primary text-primary-foreground'
          : message.role === 'assistant'
            ? 'border border-border bg-background/70 text-foreground'
            : 'border border-amber-500/30 bg-amber-500/10 text-foreground',
      )}
    >
      <div className="mb-2 text-[10px] uppercase tracking-[0.26em] opacity-70">{message.role}</div>
      {message.content.length === 0 && message.status === 'streaming' ? (
        <div className="text-sm text-muted-foreground">Thinking...</div>
      ) : (
        <div className="prose prose-invert max-w-none text-sm prose-p:my-2 prose-pre:rounded-xl prose-pre:bg-black/30 prose-code:text-[0.9em]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize, rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
