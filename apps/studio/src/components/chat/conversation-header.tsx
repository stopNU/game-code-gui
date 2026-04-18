import { useEffect, useMemo, useState } from 'react';
import { Cpu, PencilLine, Sparkles } from 'lucide-react';
import type { ConversationPreferences, TokenUsageRecord } from '@renderer/store/conversation-store';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';

const PROVIDER_MODELS = {
  anthropic: ['claude-sonnet-4-6'],
  openai: ['gpt-5.4'],
} as const;

const CONTEXT_BUDGET = 150_000;

interface ConversationHeaderProps {
  preferences: ConversationPreferences | null;
  sessionStatus: string;
  tokenUsage?: TokenUsageRecord | undefined;
  canUseOpenAI: boolean;
  running: boolean;
  onProviderChange: (provider: 'anthropic' | 'openai') => void;
  onModelChange: (model: string) => void;
  onRename: (title: string) => Promise<void>;
}

export function ConversationHeader({
  preferences,
  sessionStatus,
  tokenUsage,
  canUseOpenAI,
  running,
  onProviderChange,
  onModelChange,
  onRename,
}: ConversationHeaderProps): JSX.Element {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(preferences?.title ?? 'Harness Studio');

  useEffect(() => {
    setDraftTitle(preferences?.title ?? 'Harness Studio');
  }, [preferences?.title]);

  const provider = preferences?.provider === 'openai' && !canUseOpenAI ? 'anthropic' : (preferences?.provider ?? 'anthropic');
  const availableProviders = useMemo(() => {
    return canUseOpenAI ? (['anthropic', 'openai'] as const) : (['anthropic'] as const);
  }, [canUseOpenAI]);
  const model = preferences?.model ?? PROVIDER_MODELS[provider][0];
  const models = PROVIDER_MODELS[provider];
  const totalTokens = (tokenUsage?.input ?? 0) + (tokenUsage?.output ?? 0) + (tokenUsage?.cached ?? 0);
  const budgetRatio = Math.min(totalTokens / CONTEXT_BUDGET, 1);

  const commitRename = async (): Promise<void> => {
    const nextTitle = draftTitle.trim();
    if (nextTitle.length === 0 || nextTitle === preferences?.title) {
      setEditingTitle(false);
      setDraftTitle(preferences?.title ?? 'Harness Studio');
      return;
    }

    await onRename(nextTitle);
    setEditingTitle(false);
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.26em] text-primary">Conversation</p>
          {editingTitle ? (
            <div className="mt-2 flex max-w-xl items-center gap-2">
              <Input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitRename();
                  }
                  if (event.key === 'Escape') {
                    setEditingTitle(false);
                    setDraftTitle(preferences?.title ?? 'Harness Studio');
                  }
                }}
                autoFocus
              />
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <h2 className="truncate text-2xl font-semibold text-foreground">{preferences?.title ?? 'Harness Studio'}</h2>
              {preferences !== null ? (
                <Button variant="ghost" className="h-9 rounded-full px-3" onClick={() => setEditingTitle(true)}>
                  <PencilLine className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Natural-language control surface for planning, scaffolding, implementation, and approvals.
          </p>
        </div>
        <Badge className="rounded-full px-3 py-1">
          <Sparkles className="mr-1 h-3 w-3" />
          {running ? 'running' : sessionStatus}
        </Badge>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-background/40 p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-wrap items-center gap-4">
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
              {availableProviders.map((option) => (
                <option key={option} value={option}>
                  {option === 'openai' ? 'OpenAI' : 'Anthropic'}
                </option>
              ))}
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

        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>Context budget</span>
            <span>{totalTokens.toLocaleString()} / {CONTEXT_BUDGET.toLocaleString()}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary transition-[width]"
              style={{ width: `${Math.max(budgetRatio * 100, 2)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
