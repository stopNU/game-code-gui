import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONVERSATION_PROVIDER,
  getDefaultConversationConfig,
  getDefaultModelForProvider,
  resolveConversationConfig,
} from './conversation-defaults.js';

describe('conversation defaults', () => {
  it('defaults new conversations to codex', () => {
    expect(DEFAULT_CONVERSATION_PROVIDER).toBe('codex');
    expect(getDefaultConversationConfig(null)).toEqual({
      title: 'New conversation',
      provider: 'codex',
      model: getDefaultModelForProvider('codex'),
    });
  });

  it('falls back to the default runtime when there is no active preference', () => {
    expect(resolveConversationConfig('project-1', null)).toEqual(getDefaultConversationConfig('project-1'));
  });

  it('reuses the active runtime provider and model for new task conversations', () => {
    expect(
      resolveConversationConfig('project-1', {
        provider: 'openai',
        model: 'gpt-5.4',
      }),
    ).toEqual({
      title: getDefaultConversationConfig('project-1').title,
      provider: 'openai',
      model: 'gpt-5.4',
    });
  });
});
