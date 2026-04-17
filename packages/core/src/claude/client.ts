import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeMessage } from '../types/agent.js';
import type { ToolContract } from '../types/tool.js';
import { toAnthropicTools } from '../types/tool.js';
import type { InputOutputTokens } from '../types/task.js';

export interface SendMessageOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt: string;
  messages: ClaudeMessage[];
  tools?: ToolContract[];
  signal?: AbortSignal;
  /** Called incrementally with each streamed text delta. When provided, streaming is used. */
  onText?: (delta: string) => void;
}

export interface SendMessageResult {
  message: ClaudeMessage;
  stopReason: string;
  tokens: InputOutputTokens;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] });
  }

  async sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
    const tools = opts.tools ? toAnthropicTools(opts.tools) : undefined;
    const baseParams = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0,
      system: [
        {
          type: 'text' as const,
          text: opts.systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: opts.messages as Anthropic.Messages.MessageParam[],
      ...(tools && tools.length > 0 ? { tools: tools as Anthropic.Messages.Tool[] } : {}),
    };

    if (opts.onText) {
      const stream = await this.client.messages.stream(
        baseParams as Anthropic.Messages.MessageStreamParams,
        { ...(opts.signal !== undefined ? { signal: opts.signal } : {}) },
      );
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            opts.onText(event.delta.text);
          }
        }
      } catch (err) {
        await stream.finalMessage().catch(() => undefined);
        throw err;
      }

      const response = await stream.finalMessage();
      return {
        message: {
          role: 'assistant',
          content: response.content as unknown as ClaudeMessage['content'],
        },
        stopReason: response.stop_reason ?? 'end_turn',
        tokens: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cached: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    }

    const response = await this.client.messages.create(
      baseParams as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { ...(opts.signal !== undefined ? { signal: opts.signal } : {}) },
    );

    return {
      message: {
        role: 'assistant',
        content: response.content as unknown as ClaudeMessage['content'],
      },
      stopReason: response.stop_reason ?? 'end_turn',
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cached: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
