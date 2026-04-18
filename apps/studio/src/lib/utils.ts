import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ConversationSummary } from '@shared/domain';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatProvider(provider: ConversationSummary['provider']): string {
  if (provider === 'openai') {
    return 'OpenAI API';
  }
  if (provider === 'codex') {
    return 'OpenAI Codex';
  }
  return 'Anthropic';
}
