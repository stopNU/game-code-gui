import { access } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import {
  Codex,
  type ItemStartedEvent,
  type ItemUpdatedEvent,
  type ItemCompletedEvent,
} from '@openai/codex-sdk';
import { buildTaskPrompt } from '../loop/task-prompt.js';
import type { AgentContext } from '../types/agent.js';

export interface CodexChatModelFields {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LangChain BaseChatModel wrapper for the OpenAI Codex SDK.
 *
 * The Codex SDK is an autonomous agent (not a simple chat API), so this
 * wrapper runs the full Codex thread and returns the final text as a single
 * AIMessage. Tool calls within Codex are handled internally by the SDK.
 *
 * To build the Codex prompt, pass `codexCtx` in the call options.
 */
export class CodexChatModel extends BaseChatModel {
  model: string;
  temperature: number;
  maxTokens: number;

  static override lc_name(): string {
    return 'CodexChatModel';
  }

  constructor(fields: CodexChatModelFields) {
    super({});
    this.model = fields.model;
    this.temperature = fields.temperature ?? 0;
    this.maxTokens = fields.maxTokens ?? 8192;
  }

  override _llmType(): string {
    return 'codex';
  }

  override async _generate(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    await ensureCodexAuth();

    const prompt = messages.map((m) => `${m._getType()}: ${m.content}`).join('\n\n');

    const codex = new Codex({
      config: {
        features: {
          personality: false,
          multi_agent: false,
          child_agents_md: false,
          shell_snapshot: false,
        },
      },
    });

    const workingDirectory = (_options as Record<string, unknown>)['workingDirectory'] as string | undefined ?? process.cwd();

    const thread = codex.startThread({
      model: this.model,
      workingDirectory,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
      modelReasoningEffort: 'medium',
      webSearchEnabled: false,
      networkAccessEnabled: false,
    });

    let finalText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    const streamedText = new Map<string, string>();

    const { events } = await thread.runStreamed(prompt, {
      ...((_options as Record<string, unknown>)['signal'] !== undefined
        ? { signal: (_options as Record<string, unknown>)['signal'] as AbortSignal }
        : {}),
    });

    for await (const event of events) {
      switch (event.type) {
        case 'item.started':
        case 'item.updated':
        case 'item.completed': {
          const delta = extractTextDelta(event, streamedText);
          if (delta) {
            finalText += delta;
            runManager?.handleLLMNewToken(delta);
          }
          break;
        }
        case 'turn.completed':
          inputTokens += event.usage.input_tokens;
          outputTokens += event.usage.output_tokens;
          cachedTokens += event.usage.cached_input_tokens;
          break;
        case 'turn.failed':
          throw new Error(event.error.message);
        case 'error':
          throw new Error(event.message);
      }
    }

    const message = new AIMessage(finalText.trim() || 'Codex completed the task.');

    return {
      generations: [{ text: finalText, message }],
      llmOutput: {
        tokenUsage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          cachedTokens,
        },
      },
    };
  }
}

async function ensureCodexAuth(): Promise<void> {
  const authPath = join(homedir(), '.codex', 'auth.json');
  try {
    await access(authPath);
  } catch {
    throw new Error(
      'Codex authentication not found. Run `npx codex` once to sign in with your ChatGPT/Codex subscription, then retry.',
    );
  }
}

type CodexEvent = ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent;

function extractTextDelta(
  event: CodexEvent,
  streamedText: Map<string, string>,
): string {
  const item = event.item;
  if (item.type !== 'agent_message' && item.type !== 'reasoning') {
    return '';
  }

  const current = item.text;
  const previous = streamedText.get(item.id) ?? '';

  if (!current.startsWith(previous)) {
    streamedText.set(item.id, current);
    return current.length > 0 ? current : '';
  }

  const delta = current.slice(previous.length);
  streamedText.set(item.id, current);
  return delta;
}

// Re-export buildTaskPrompt for use in agent-graph
export type { AgentContext };
