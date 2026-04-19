import type { ConversationSummary } from '@shared/domain';

export type ConversationProvider = NonNullable<ConversationSummary['provider']>;

export const DEFAULT_CONVERSATION_PROVIDER: ConversationProvider = 'anthropic';
export const DEFAULT_CONVERSATION_TITLE = 'New conversation';
export const DEFAULT_PROJECT_CONVERSATION_TITLE = 'Project conversation';

export const PROVIDER_MODELS: Record<ConversationProvider, readonly string[]> = {
  anthropic: ['claude-sonnet-4-6'],
  openai: ['gpt-5.4'],
  codex: ['gpt-5.4'],
};

export function getDefaultModelForProvider(provider: ConversationProvider): string {
  const defaultModel = PROVIDER_MODELS[provider][0];
  if (defaultModel === undefined) {
    throw new Error(`No default model configured for provider: ${provider}`);
  }
  return defaultModel;
}

export function getDefaultConversationTitle(projectId: string | null): string {
  return projectId === null ? DEFAULT_CONVERSATION_TITLE : DEFAULT_PROJECT_CONVERSATION_TITLE;
}

export function getDefaultConversationConfig(projectId: string | null): {
  title: string;
  provider: ConversationProvider;
  model: string;
} {
  return {
    title: getDefaultConversationTitle(projectId),
    provider: DEFAULT_CONVERSATION_PROVIDER,
    model: getDefaultModelForProvider(DEFAULT_CONVERSATION_PROVIDER),
  };
}

export function resolveConversationConfig(
  projectId: string | null,
  runtimePreference?: {
    provider: ConversationProvider;
    model: string;
  } | null,
): {
  title: string;
  provider: ConversationProvider;
  model: string;
} {
  const defaultConfig = getDefaultConversationConfig(projectId);
  if (runtimePreference === null || runtimePreference === undefined) {
    return defaultConfig;
  }

  return {
    title: defaultConfig.title,
    provider: runtimePreference.provider,
    model: runtimePreference.model,
  };
}

export function getAvailableProviders(canUseOpenAI: boolean): readonly ConversationProvider[] {
  return canUseOpenAI ? ['anthropic', 'openai', 'codex'] : ['anthropic', 'codex'];
}

export function getEffectiveProvider(
  provider: ConversationProvider | undefined,
  canUseOpenAI: boolean,
): ConversationProvider {
  if (provider === 'openai' && !canUseOpenAI) {
    return DEFAULT_CONVERSATION_PROVIDER;
  }

  return provider ?? DEFAULT_CONVERSATION_PROVIDER;
}
