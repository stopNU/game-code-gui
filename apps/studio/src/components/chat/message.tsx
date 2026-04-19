import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ConversationMessage } from '@renderer/store/conversation-store';
import { cn } from '@renderer/lib/utils';

interface MessageProps {
  message: ConversationMessage;
}

function getSystemMessageTone(content: string): 'success' | 'error' | 'default' {
  if (content.startsWith('Task complete:')) {
    return 'success';
  }

  if (content.startsWith('Task failed:')) {
    return 'error';
  }

  return 'default';
}

export function Message({ message }: MessageProps): JSX.Element {
  const systemTone = message.role === 'system' ? getSystemMessageTone(message.content) : 'default';

  return (
    <div
      className={cn(
        'min-w-0 max-w-3xl rounded-[24px] px-4 py-3 shadow-glow/50',
        message.role === 'user'
          ? 'ml-auto bg-primary text-primary-foreground'
          : message.role === 'assistant'
            ? 'border border-border bg-background/70 text-foreground'
            : systemTone === 'success'
              ? 'border border-accent/30 bg-accent/10 text-accent'
              : systemTone === 'error'
                ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                : 'border border-amber-500/30 bg-amber-500/10 text-foreground',
      )}
    >
      <div className="mb-2 text-[10px] uppercase tracking-[0.26em] opacity-70">{message.role}</div>
      {message.content.length === 0 && message.status === 'streaming' ? (
        <div className="text-sm text-muted-foreground">Thinking...</div>
      ) : (
        <div
          className={cn(
            'min-w-0 max-w-none overflow-y-auto text-sm break-words [&_*]:max-w-full [&_code]:break-words [&_li]:break-words [&_p]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words',
            systemTone === 'success' || systemTone === 'error'
              ? 'max-h-64 leading-6'
              : 'max-h-64 prose prose-invert prose-p:my-2 prose-pre:max-h-64 prose-pre:overflow-auto prose-pre:rounded-xl prose-pre:bg-black/30 prose-code:text-[0.9em]',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize, rehypeHighlight]}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
