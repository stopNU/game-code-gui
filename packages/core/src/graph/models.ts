import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { MODELS, ROLE_TEMPERATURE, HIGH_TOKEN_ROLES, type AgentRole, type ModelId } from '../types/agent.js';
import { CodexChatModel } from './codex-chat-model.js';
import { ClaudeSubChatModel } from './claude-sub-chat-model.js';

const HIGH_TOKEN_MAX = 16384;
const STANDARD_TOKEN_MAX = 8192;

function maxTokensForRole(role: AgentRole): number {
  return HIGH_TOKEN_ROLES.has(role) ? HIGH_TOKEN_MAX : STANDARD_TOKEN_MAX;
}

function temperatureForRole(role: AgentRole): number {
  return ROLE_TEMPERATURE[role] ?? 0;
}

function providerOf(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.provider ?? 'anthropic';
}

/**
 * Create a LangChain chat model for the given model ID and role.
 * LangSmith auto-traces all invocations when LANGSMITH_API_KEY is set.
 */
export function createChatModel(
  modelId: ModelId | string,
  role: AgentRole,
): BaseChatModel {
  const provider = providerOf(modelId);
  const temperature = temperatureForRole(role);
  const maxTokens = maxTokensForRole(role);

  if (provider === 'openai-codex') {
    return new CodexChatModel({ model: modelId, temperature, maxTokens });
  }

  if (provider === 'claude-code') {
    return new ClaudeSubChatModel({ model: modelId, temperature, maxTokens });
  }

  if (provider === 'openai') {
    const apiKey = process.env['OPENAI_API_KEY'];
    return new ChatOpenAI({
      model: modelId,
      temperature,
      maxTokens,
      ...(apiKey !== undefined ? { apiKey } : {}),
    });
  }

  // Default: Anthropic
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  return new ChatAnthropic({
    model: modelId,
    temperature,
    maxTokens,
    ...(apiKey !== undefined ? { apiKey } : {}),
  });
}

export { maxTokensForRole, temperatureForRole };
