import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { ClaudeMessage } from '../types/agent.js';
import type { ToolContract } from '../types/tool.js';
import type { InputOutputTokens } from '../types/task.js';

export interface SendMessageOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  systemPrompt: string;
  messages: ClaudeMessage[];
  tools?: ToolContract[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface SendMessageResult {
  message: ClaudeMessage;
  stopReason: string;
  tokens: InputOutputTokens;
}

/**
 * Thin compatibility shim over ChatAnthropic.
 * All invocations route through LangChain and are auto-traced by LangSmith
 * when LANGSMITH_API_KEY is set in the environment.
 */
export class ClaudeClient {
  private model: ChatAnthropic;

  constructor(apiKey?: string) {
    const resolvedKey = apiKey ?? process.env['ANTHROPIC_API_KEY'];
    this.model = new ChatAnthropic({
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
    });
  }

  async sendMessage(opts: SendMessageOptions): Promise<SendMessageResult> {
    const instance = new ChatAnthropic({
      model: opts.model,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature ?? 0,
      ...(process.env['ANTHROPIC_API_KEY'] !== undefined ? { apiKey: process.env['ANTHROPIC_API_KEY'] } : {}),
    });

    const lcMessages = [
      new SystemMessage(opts.systemPrompt),
      ...opts.messages.map(claudeToLC),
    ];

    const callbacks = opts.onText
      ? [{ handleLLMNewToken: (token: string) => opts.onText!(token) }]
      : [];

    const response = await instance.invoke(lcMessages, {
      callbacks,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    }) as AIMessage;

    const usage = response.usage_metadata as Record<string, unknown> | undefined;
    const inputDetails = usage?.['input_token_details'] as Record<string, unknown> | undefined;

    return {
      message: {
        role: 'assistant',
        content: getTextContent(response),
      },
      stopReason: (response.response_metadata?.['stop_reason'] as string | undefined) ?? 'end_turn',
      tokens: {
        input: (usage?.['input_tokens'] as number | undefined) ?? 0,
        output: (usage?.['output_tokens'] as number | undefined) ?? 0,
        cached: (inputDetails?.['cache_read'] as number | undefined) ?? 0,
      },
    };
  }
}

function claudeToLC(msg: ClaudeMessage) {
  const text = typeof msg.content === 'string'
    ? msg.content
    : (msg.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');

  return msg.role === 'user' ? new HumanMessage(text) : new AIMessage(text);
}

function getTextContent(msg: AIMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b) => typeof b === 'object' && (b as { type?: string }).type === 'text')
      .map((b) => (b as { text?: string }).text ?? '')
      .join('\n');
  }
  return '';
}
