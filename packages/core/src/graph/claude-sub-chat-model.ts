import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

export interface ClaudeSubChatModelFields {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Stub placeholder for the Claude Code subscription model.
 *
 * The underlying SDK for the claude-sonnet-4-6-sub slot is not yet wired.
 * This class exists so the model registry resolves correctly; implement
 * _generate once the Claude Code subscription SDK is available.
 */
export class ClaudeSubChatModel extends BaseChatModel {
  model: string;
  temperature: number;
  maxTokens: number;

  static override lc_name(): string {
    return 'ClaudeSubChatModel';
  }

  constructor(fields: ClaudeSubChatModelFields) {
    super({});
    this.model = fields.model;
    this.temperature = fields.temperature ?? 0;
    this.maxTokens = fields.maxTokens ?? 8192;
  }

  override _llmType(): string {
    return 'claude-sub';
  }

  override async _generate(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
  ): Promise<ChatResult> {
    throw new Error(
      'ClaudeSubChatModel is not yet implemented. The Claude Code subscription SDK integration is pending.',
    );
  }
}
