import { Cpu, Sparkles } from 'lucide-react';
import type { ConversationPreferences } from '@renderer/store/conversation-store';
import { Badge } from '@renderer/components/ui/badge';

const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-6'],
  openai: ['gpt-5.4'],
} as const;

interface ConversationHeaderProps {
  preferences: ConversationPreferences | null;
  sessionStatus: string;
  onProviderChange: (provider: 'anthropic' | 'openai') => void;
  onModelChange: (model: string) => void;
}

export function ConversationHeader({
  preferences,
  sessionStatus,
  onProviderChange,
  onModelChange,
}: ConversationHeaderProps): JSX.Element {
  const provider = preferences?.provider ?? 'anthropic';
  const model = preferences?.model ?? PROVIDER_MODELS[provider][0];
  const models = PROVIDER_MODELS[provider];

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-primary">Conversation</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{preferences?.title ?? 'Harness Studio'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Natural-language control surface for planning, scaffolding, implementation, and approvals.
          </p>
        </div>
        <Badge className="rounded-full px-3 py-1">
          <Sparkles className="mr-1 h-3 w-3" />
          {sessionStatus}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-background/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          Runtime
        </div>
        <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Provider
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as 'anthropic' | 'openai')}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Model
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none"
          >
            {models.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
