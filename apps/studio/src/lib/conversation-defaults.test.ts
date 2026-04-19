import { describe, expect, it } from 'vitest';
import {
  getDefaultConversationConfig,
  resolveConversationConfig,
} from './conversation-defaults.js';

describe('conversation defaults', () => {
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
