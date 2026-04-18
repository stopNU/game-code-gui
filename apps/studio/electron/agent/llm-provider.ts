import { ClaudeClient, DEFAULT_RETRY_POLICY, withRetry } from '@agent-harness/core';
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

interface OpenAIResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  cached_input_tokens?: number;
}

interface OpenAIResponseOutputText {
  type: 'output_text' | 'text';
  text?: string;
}

interface OpenAIResponseMessage {
  type: 'message';
  content?: OpenAIResponseOutputText[];
}

interface OpenAIResponseFunctionCall {
  type: 'function_call';
  call_id?: string;
  id?: string;
  name?: string;
  arguments?: string;
}

interface OpenAICompletedResponse {
  output?: Array<OpenAIResponseMessage | OpenAIResponseFunctionCall | Record<string, unknown>>;
  usage?: OpenAIResponseUsage;
}

interface OpenAIStreamEvent {
  type?: string;
  delta?: string;
  response?: OpenAICompletedResponse;
  error?: {
    message?: string;
  };
  message?: string;
}

interface OpenAITextInput {
  type: 'input_text';
  text: string;
}

interface OpenAIMessageInput {
  type: 'message';
  role: 'user' | 'assistant';
  content: OpenAITextInput[];
}

interface OpenAIFunctionCallInput {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

interface OpenAIFunctionCallOutputInput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

type OpenAIInputItem = OpenAIMessageInput | OpenAIFunctionCallInput | OpenAIFunctionCallOutputInput;

function isOpenAIMessageItem(
  item: OpenAIResponseMessage | OpenAIResponseFunctionCall | Record<string, unknown>,
): item is OpenAIResponseMessage {
  return item.type === 'message';
}

function isOpenAIFunctionCallItem(
  item: OpenAIResponseMessage | OpenAIResponseFunctionCall | Record<string, unknown>,
): item is OpenAIResponseFunctionCall {
  return item.type === 'function_call';
}

function ensureAnthropicBlocks(content: string | ClaudeContentBlock[]): ClaudeContentBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return content;
}

function normalizeTextContent(content: string | ClaudeContentBlock[]): string {
  return ensureAnthropicBlocks(content)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function serializeToolResultContent(content: ClaudeContentBlock['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return JSON.stringify(content);
  }

  return '';
}

function safeParseJsonObject(value: string | undefined): Record<string, unknown> {
  if (value === undefined || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { raw: value };
  }

  return {};
}

function toOpenAIInputItems(messages: ClaudeMessage[]): OpenAIInputItem[] {
  const items: OpenAIInputItem[] = [];

  for (const message of messages) {
    const text = normalizeTextContent(message.content);
    if (text.trim().length > 0) {
      items.push({
        type: 'message',
        role: message.role,
        content: [{ type: 'input_text', text }],
      });
    }

    for (const block of ensureAnthropicBlocks(message.content)) {
      if (block.type === 'tool_use' && block.id !== undefined && block.name !== undefined) {
        items.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        });
      }

      if (block.type === 'tool_result' && block.tool_use_id !== undefined) {
        items.push({
          type: 'function_call_output',
          call_id: block.tool_use_id,
          output: serializeToolResultContent(block.content),
        });
      }
    }
  }

  return items;
}

function toOpenAITools(tools: ToolContract[]): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

function mapOpenAIResponseToMessage(response: OpenAICompletedResponse): ClaudeMessage {
  const content: ClaudeContentBlock[] = [];

  for (const item of response.output ?? []) {
    if (isOpenAIMessageItem(item)) {
      const text = (item.content ?? []).map((part: OpenAIResponseOutputText) => part.text ?? '').join('');
      if (text.length > 0) {
        content.push({
          type: 'text',
          text,
        });
      }
    }

    if (isOpenAIFunctionCallItem(item) && item.name !== undefined) {
      const toolUseId = item.call_id ?? item.id ?? item.name;
      content.push({
        type: 'tool_use',
        id: toolUseId,
        name: item.name,
        ...(item.arguments !== undefined ? { input: safeParseJsonObject(item.arguments) } : { input: {} }),
      });
    }
  }

  return {
    role: 'assistant',
    content,
  };
}

function mapOpenAIUsageToTokens(usage?: OpenAIResponseUsage): InputOutputTokens {
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cached: usage?.input_tokens_details?.cached_tokens ?? usage?.cached_input_tokens ?? 0,
  };
}

async function* parseSseEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<OpenAIStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const separatorIndex = buffer.indexOf('\n\n');
      if (separatorIndex === -1) {
        break;
      }

      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLines = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        continue;
      }

      const data = dataLines.join('\n');
      if (data === '[DONE]') {
        continue;
      }

      yield JSON.parse(data) as OpenAIStreamEvent;
    }
  }
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: ClaudeClient;

  public constructor(apiKey?: string) {
    this.client = new ClaudeClient(apiKey);
  }

  public async streamMessage(args: {
    messages: ClaudeMessage[];
    tools: ToolContract[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (event: { type: 'text-delta'; delta: string } | { type: 'retrying'; attempt: number; reason: string }) => void;
  }): Promise<ProviderStreamResult> {
    return withRetry(
      async () => {
        const result = await this.client.sendMessage({
          model: args.model,
          maxTokens: 16_384,
          systemPrompt: args.system,
          messages: args.messages,
          tools: args.tools,
          signal: args.signal,
          onText: (delta: string) => {
            args.onEvent({ type: 'text-delta', delta });
          },
        });

        return {
          message: {
            role: result.message.role,
            content: ensureAnthropicBlocks(result.message.content),
          },
          stopReason: result.stopReason,
          tokens: result.tokens,
        };
      },
      {
        ...DEFAULT_RETRY_POLICY,
        retryableErrors: ['429', '529', '500', '501', '502', '503', '504', ...DEFAULT_RETRY_POLICY.retryableErrors],
      },
      (attempt: number, error: Error) => {
        args.onEvent({
          type: 'retrying',
          attempt,
          reason: error.message,
        });
      },
      args.signal,
    );
  }
}

export class OpenAIProvider implements LLMProvider {
  public constructor(private readonly apiKey?: string) {}

  public async streamMessage(args: {
    messages: ClaudeMessage[];
    tools: ToolContract[];
    system: string;
    model: string;
    signal: AbortSignal;
    onEvent: (event: { type: 'text-delta'; delta: string } | { type: 'retrying'; attempt: number; reason: string }) => void;
  }): Promise<ProviderStreamResult> {
    return withRetry(
      async () => {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey ?? process.env['OPENAI_API_KEY'] ?? ''}`,
          },
          body: JSON.stringify({
            model: args.model,
            instructions: args.system,
            input: toOpenAIInputItems(args.messages),
            tools: toOpenAITools(args.tools),
            stream: true,
          }),
          signal: args.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI Responses API request failed with ${response.status}: ${errorText}`);
        }

        if (response.body === null) {
          throw new Error('OpenAI Responses API returned an empty body.');
        }

        let completedResponse: OpenAICompletedResponse | undefined;

        for await (const event of parseSseEvents(response.body)) {
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            args.onEvent({
              type: 'text-delta',
              delta: event.delta,
            });
            continue;
          }

          if (event.type === 'response.completed') {
            completedResponse = event.response;
            continue;
          }

          if (event.type === 'response.failed' || event.type === 'error') {
            throw new Error(event.error?.message ?? event.message ?? 'OpenAI response generation failed.');
          }
        }

        if (completedResponse === undefined) {
          throw new Error('OpenAI Responses API stream ended without a completed response.');
        }

        return {
          message: mapOpenAIResponseToMessage(completedResponse),
          stopReason: 'end_turn',
          tokens: mapOpenAIUsageToTokens(completedResponse.usage),
        };
      },
      {
        ...DEFAULT_RETRY_POLICY,
        retryableErrors: ['429', '500', '501', '502', '503', '504', ...DEFAULT_RETRY_POLICY.retryableErrors],
      },
      (attempt: number, error: Error) => {
        args.onEvent({
          type: 'retrying',
          attempt,
          reason: error.message,
        });
      },
      args.signal,
    );
  }
}
