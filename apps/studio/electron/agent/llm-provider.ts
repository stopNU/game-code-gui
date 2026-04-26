import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage, AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { DEFAULT_RETRY_POLICY, withRetry } from '@agent-harness/core';
import type { ClaudeContentBlock, ClaudeMessage, InputOutputTokens, ToolContract } from '@agent-harness/core';

export interface ProviderStreamResult {
  message: ClaudeMessage;
  stopReason: string;
  tokens: InputOutputTokens;
}

export interface LLMProvider {
  streamMessage(args: {
    messages: ClaudeMessage[];
    tools: ToolContract[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (event: { type: 'text-delta'; delta: string } | { type: 'retrying'; attempt: number; reason: string }) => void;
  }): Promise<ProviderStreamResult>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function claudeToLC(msg: ClaudeMessage): BaseMessage {
  if (typeof msg.content === 'string') {
    return msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content);
  }

  const blocks = msg.content as ClaudeContentBlock[];

  if (msg.role === 'user') {
    const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');
    if (toolResultBlocks.length > 0) {
      const block = toolResultBlocks[0]!;
      const content =
        typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content ?? '');
      return new ToolMessage({
        content,
        tool_call_id: block.tool_use_id ?? '',
      });
    }

    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');
    return new HumanMessage(text);
  }

  // assistant role
  const textContent = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use' && b.id && b.name)
    .map((b) => ({
      id: b.id as string,
      name: b.name as string,
      args: b.input ?? {},
      type: 'tool_call' as const,
    }));

  if (toolCalls.length > 0) {
    return new AIMessage({ content: textContent, tool_calls: toolCalls });
  }
  return new AIMessage(textContent);
}

function lcToClaudeMessage(msg: AIMessage): ClaudeMessage {
  const textContent = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content
          .filter((b) => typeof b === 'object' && (b as { type?: string }).type === 'text')
          .map((b) => (b as { text?: string }).text ?? '')
          .join('\n')
      : '';

  const toolBlocks: ClaudeContentBlock[] =
    msg.tool_calls?.map((call) => ({
      type: 'tool_use' as const,
      ...(call.id !== undefined ? { id: call.id } : {}),
      name: call.name,
      input: call.args as Record<string, unknown>,
    })) ?? [];

  const content: ClaudeContentBlock[] = [];
  if (textContent.length > 0) {
    content.push({ type: 'text', text: textContent });
  }
  content.push(...toolBlocks);

  return {
    role: 'assistant',
    content: content.length === 1 && content[0]!.type === 'text'
      ? content[0]!.text ?? ''
      : content,
  };
}

function toLC(tools: ToolContract[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

function extractTokens(response: AIMessage): InputOutputTokens {
  const usage = response.usage_metadata as Record<string, unknown> | undefined;
  const inputDetails = usage?.['input_token_details'] as Record<string, unknown> | undefined;
  return {
    input: (usage?.['input_tokens'] as number | undefined) ?? 0,
    output: (usage?.['output_tokens'] as number | undefined) ?? 0,
    cached: (inputDetails?.['cache_read'] as number | undefined) ?? 0,
  };
}

async function invokeWithStreaming(
  model: BaseChatModel,
  messages: BaseMessage[],
  signal: AbortSignal,
  onText: (delta: string) => void,
): Promise<AIMessage> {
  const chunks: string[] = [];
  const stream = await model.stream(messages, {
    signal,
    callbacks: [{
      handleLLMNewToken(token: string) {
        chunks.push(token);
        onText(token);
      },
    }],
  });

  // Consume stream to get the final message
  let lastMsg: AIMessage | undefined;
  for await (const chunk of stream) {
    lastMsg = chunk as unknown as AIMessage;
  }

  // If streaming didn't give us a final message, invoke non-streaming
  if (!lastMsg) {
    return model.invoke(messages, { signal }) as Promise<AIMessage>;
  }

  return lastMsg;
}

// ---------------------------------------------------------------------------
// Anthropic provider via ChatAnthropic
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  constructor(private readonly apiKey?: string) {}

  async streamMessage(args: {
    messages: ClaudeMessage[];
    tools: ToolContract[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (event: { type: 'text-delta'; delta: string } | { type: 'retrying'; attempt: number; reason: string }) => void;
  }): Promise<ProviderStreamResult> {
    return withRetry(
      async () => {
        const apiKey = this.apiKey ?? process.env['ANTHROPIC_API_KEY'];
        const model = new ChatAnthropic({
          model: args.model,
          maxTokens: 16_384,
          temperature: 0,
          ...(apiKey !== undefined ? { apiKey } : {}),
        });

        const lcMessages: BaseMessage[] = [
          new SystemMessage(args.system),
          ...args.messages.flatMap((m) => {
            // Expand user messages with multiple tool_result blocks into separate ToolMessages
            if (m.role === 'user' && Array.isArray(m.content)) {
              const blocks = m.content as ClaudeContentBlock[];
              const toolResults = blocks.filter((b) => b.type === 'tool_result');
              if (toolResults.length > 1) {
                return toolResults.map((b) => new ToolMessage({
                  content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? ''),
                  tool_call_id: b.tool_use_id ?? '',
                }));
              }
            }
            return [claudeToLC(m)];
          }),
        ];

        const modelWithTools = args.tools.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (model as any).bindTools(toLC(args.tools)) as unknown as BaseChatModel
          : model;

        const stream = modelWithTools.stream(lcMessages, {
          signal: args.signal,
        });

        let accumulated: AIMessageChunk | undefined;
        for await (const chunk of await stream) {
          if (typeof chunk.content === 'string' && chunk.content.length > 0) {
            args.onEvent({ type: 'text-delta', delta: chunk.content });
          } else if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Array<{ type?: string; text?: string }>) {
              if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
                args.onEvent({ type: 'text-delta', delta: part.text });
              }
            }
          }
          accumulated = accumulated === undefined ? chunk : accumulated.concat(chunk);
        }

        if (accumulated === undefined) {
          // Stream produced nothing — fall back to a non-streaming call.
          const response = await model.invoke(lcMessages, { signal: args.signal }) as AIMessage;
          return {
            message: lcToClaudeMessage(response),
            stopReason: (response.response_metadata?.['stop_reason'] as string | undefined) ?? 'end_turn',
            tokens: extractTokens(response),
          };
        }

        const response = accumulated as unknown as AIMessage;
        return {
          message: lcToClaudeMessage(response),
          stopReason: (response.response_metadata?.['stop_reason'] as string | undefined) ?? 'end_turn',
          tokens: extractTokens(response),
        };
      },
      {
        ...DEFAULT_RETRY_POLICY,
        retryableErrors: ['429', '529', '500', '501', '502', '503', '504', ...DEFAULT_RETRY_POLICY.retryableErrors],
      },
      (attempt: number, error: Error) => {
        args.onEvent({ type: 'retrying', attempt, reason: error.message });
      },
      args.signal,
    );
  }
}

// ---------------------------------------------------------------------------
// OpenAI provider via ChatOpenAI
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey?: string) {}

  async streamMessage(args: {
    messages: ClaudeMessage[];
    tools: ToolContract[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (event: { type: 'text-delta'; delta: string } | { type: 'retrying'; attempt: number; reason: string }) => void;
  }): Promise<ProviderStreamResult> {
    return withRetry(
      async () => {
        const openAiKey = this.apiKey ?? process.env['OPENAI_API_KEY'];
        const model = new ChatOpenAI({
          model: args.model,
          maxTokens: 16_384,
          temperature: 0,
          ...(openAiKey !== undefined ? { apiKey: openAiKey } : {}),
          streaming: true,
        });

        const lcMessages: BaseMessage[] = [
          new SystemMessage(args.system),
          ...args.messages.flatMap((m) => {
            if (m.role === 'user' && Array.isArray(m.content)) {
              const blocks = m.content as ClaudeContentBlock[];
              const toolResults = blocks.filter((b) => b.type === 'tool_result');
              if (toolResults.length > 1) {
                return toolResults.map((b) => new ToolMessage({
                  content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? ''),
                  tool_call_id: b.tool_use_id ?? '',
                }));
              }
            }
            return [claudeToLC(m)];
          }),
        ];

        const modelWithTools = args.tools.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (model as any).bindTools(toLC(args.tools)) as unknown as BaseChatModel
          : model;

        const stream = modelWithTools.stream(lcMessages, { signal: args.signal });

        let accumulated: AIMessageChunk | undefined;
        for await (const chunk of await stream) {
          if (typeof chunk.content === 'string' && chunk.content.length > 0) {
            args.onEvent({ type: 'text-delta', delta: chunk.content });
          } else if (Array.isArray(chunk.content)) {
            for (const part of chunk.content as Array<{ type?: string; text?: string }>) {
              if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
                args.onEvent({ type: 'text-delta', delta: part.text });
              }
            }
          }
          accumulated = accumulated === undefined ? chunk : accumulated.concat(chunk);
        }

        if (accumulated === undefined) {
          const response = await model.invoke(lcMessages, { signal: args.signal }) as AIMessage;
          return {
            message: lcToClaudeMessage(response),
            stopReason: 'end_turn',
            tokens: extractTokens(response),
          };
        }

        const response = accumulated as unknown as AIMessage;
        return {
          message: lcToClaudeMessage(response),
          stopReason: 'end_turn',
          tokens: extractTokens(response),
        };
      },
      {
        ...DEFAULT_RETRY_POLICY,
        retryableErrors: ['429', '500', '501', '502', '503', '504', ...DEFAULT_RETRY_POLICY.retryableErrors],
      },
      (attempt: number, error: Error) => {
        args.onEvent({ type: 'retrying', attempt, reason: error.message });
      },
      args.signal,
    );
  }
}
