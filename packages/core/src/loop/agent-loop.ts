import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createChatModel } from '../graph/models.js';
import { toLCTools } from '../graph/tools-adapter.js';
import {
  createStallState,
  checkRepeatStall,
  checkWriteStall,
  checkTypecheckStall,
  recordToolWrite,
} from '../graph/stall-detector.js';
import type { AgentContext, AgentLoopOptions, ClaudeMessage } from '../types/agent.js';
import type { TaskResult } from '../types/task.js';
import type { ToolContract, ToolExecutionContext } from '../types/tool.js';
import { buildTaskPrompt } from './task-prompt.js';

export interface AgentLoopDeps {
  tools: ToolContract[];
  /** Inject a custom LangChain model (useful for tests). */
  chatModel?: BaseChatModel;
}

export async function runAgentLoop(
  ctx: AgentContext,
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
): Promise<TaskResult> {
  const model = deps.chatModel ?? createChatModel(ctx.config.model, ctx.config.role);

  const execCtx: ToolExecutionContext = {
    projectPath: ctx.task.context.projectPath,
    taskId: ctx.task.id,
    traceId: ctx.traceId,
    permissions: ctx.config.permissions,
  };

  const lcTools = toLCTools(deps.tools, execCtx);
  const toolMap = new Map<string, DynamicStructuredTool>(lcTools.map((t) => [t.name, t] as [string, DynamicStructuredTool]));
  const contractMap = new Map<string, ToolContract>(deps.tools.map((t) => [t.name, t] as [string, ToolContract]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelWithTools = lcTools.length > 0 ? (model as any).bindTools(lcTools) : model;

  const stall = createStallState();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let toolCallCount = 0;
  const filesModified: string[] = [];

  // Build initial messages
  const messages: BaseMessage[] = [
    new SystemMessage(ctx.config.systemPrompt),
    new HumanMessage(buildTaskPrompt(ctx)),
    ...ctx.conversationHistory.slice(1).map(claudeToLCMessage),
  ];

  for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
    ctx.iterationCount = iteration;

    if (opts.signal?.aborted) {
      return cancelled(filesModified, toolCallCount, totalInput, totalOutput, totalCached);
    }

    // LLM call — LangSmith auto-traces when LANGSMITH_API_KEY env var is set
    const onText = opts.onText;
    const response = await modelWithTools.invoke(
      windowMessages(messages),
      {
        ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
        ...(onText !== undefined
          ? {
              callbacks: [{
                handleLLMNewToken(token: string) { onText(token); },
              }],
            }
          : {}),
        tags: [`role:${ctx.config.role}`, `task:${ctx.task.id}`],
      },
    ) as AIMessage;

    // Extract token usage
    const usage = response.usage_metadata as Record<string, unknown> | undefined;
    if (usage) {
      totalInput += (usage['input_tokens'] as number | undefined) ?? 0;
      totalOutput += (usage['output_tokens'] as number | undefined) ?? 0;
      const inputDetails = usage['input_token_details'] as Record<string, unknown> | undefined;
      totalCached += (inputDetails?.['cache_read'] as number | undefined) ?? 0;
    }

    ctx.tokenUsed = (totalInput - totalCached) + Math.round(totalCached * 0.1) + totalOutput;
    opts.onTokens?.({ input: totalInput, output: totalOutput, cached: totalCached });

    messages.push(response);
    opts.onMessage?.(lcToClaudeMessage(response));

    // Done?
    const hasCalls = response.tool_calls && response.tool_calls.length > 0;
    if (!hasCalls) {
      return {
        success: true,
        summary: getTextContent(response),
        filesModified,
        toolCallCount,
        tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
      };
    }

    // Budget check
    if (ctx.tokenBudget > 0 && ctx.tokenUsed >= ctx.tokenBudget) {
      if (opts.onBudgetExhausted) {
        const decision = await opts.onBudgetExhausted(ctx.tokenUsed, ctx.tokenBudget, filesModified.length);
        if (decision.action === 'continue') {
          ctx.tokenBudget += decision.extraBudget;
        } else {
          return {
            success: false,
            summary: `Token budget exhausted (${ctx.tokenUsed.toLocaleString()} / ${(ctx.tokenBudget - decision.extraBudget).toLocaleString()} tokens used). User chose to stop.`,
            filesModified,
            toolCallCount,
            tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
          };
        }
      } else {
        return {
          success: false,
          summary: `Token budget exhausted (${ctx.tokenUsed.toLocaleString()} / ${ctx.tokenBudget.toLocaleString()} tokens used).`,
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }
    }

    // Execute tool calls
    const toolResults: ToolMessage[] = [];

    for (const call of response.tool_calls!) {
      if (opts.signal?.aborted) {
        return cancelled(filesModified, toolCallCount, totalInput, totalOutput, totalCached);
      }

      toolCallCount++;
      const toolInput = (call.args ?? {}) as Record<string, unknown>;
      opts.onToolCall?.({ name: call.name, input: toolInput });

      const lcTool = toolMap.get(call.name);
      const contract = contractMap.get(call.name);

      if (!lcTool || !contract) {
        toolResults.push(new ToolMessage({
          content: `Error: Unknown tool "${call.name}"`,
          tool_call_id: call.id ?? call.name,
          name: call.name,
        }));
        continue;
      }

      // Stall: repeat check
      const repeatStall = checkRepeatStall(call.name, toolInput, stall);
      if (repeatStall.stalled) {
        toolResults.push(new ToolMessage({
          content: `Error: ${repeatStall.reason}`,
          tool_call_id: call.id ?? call.name,
          name: call.name,
        }));
        continue;
      }

      // Stall: typecheck loop
      const typecheckStall = checkTypecheckStall(call.name, toolInput, stall);
      if (typecheckStall.stalled) {
        return {
          success: false,
          summary: typecheckStall.reason!,
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }

      // Stall: read-without-write
      const writeStall = checkWriteStall(call.name, stall);
      if (writeStall.stalled) {
        return {
          success: false,
          summary: writeStall.reason!,
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }

      try {
        const output = await contract.execute(toolInput, execCtx);
        recordToolWrite(call.name, stall);

        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        if (stall.totalWrites > 0) {
          const pathMatch = outputStr.match(/"path"\s*:\s*"([^"]+)"/);
          if (pathMatch?.[1]) filesModified.push(pathMatch[1]);
        }

        toolResults.push(new ToolMessage({
          content: compressReadFileResult(call.name, outputStr),
          tool_call_id: call.id ?? call.name,
          name: call.name,
        }));
      } catch (err) {
        toolResults.push(new ToolMessage({
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          tool_call_id: call.id ?? call.name,
          name: call.name,
        }));
      }
    }

    messages.push(...toolResults);
  }

  return {
    success: false,
    summary: `Agent loop hit max iterations (${opts.maxIterations})`,
    filesModified,
    toolCallCount,
    tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEEP_EXCHANGES = 10;
const READFILE_HISTORY_PREVIEW = 20;

function windowMessages(messages: BaseMessage[]): BaseMessage[] {
  if (messages.length === 0) return messages;

  const system = messages[0];
  const rest = messages.slice(1);
  const keepLast = KEEP_EXCHANGES * 2;

  if (rest.length <= keepLast) return messages;

  // Start at an odd index (assistant message) relative to rest so alternation is preserved.
  let start = rest.length - keepLast;
  if (start % 2 === 0) start++;

  return [system!, ...rest.slice(start)];
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

function compressReadFileResult(toolName: string, content: string): string {
  if (toolName !== 'project__readFile') return content;
  const lines = content.split('\n');
  if (lines.length <= READFILE_HISTORY_PREVIEW * 2) return content;
  return (
    lines.slice(0, READFILE_HISTORY_PREVIEW).join('\n') +
    `\n// ... (${lines.length - READFILE_HISTORY_PREVIEW} more lines omitted from history — use readFile if needed)`
  );
}

function claudeToLCMessage(msg: ClaudeMessage): BaseMessage {
  if (msg.role === 'user') {
    const textContent = typeof msg.content === 'string'
      ? msg.content
      : (msg.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('\n');
    return new HumanMessage(textContent);
  }
  const textContent = typeof msg.content === 'string'
    ? msg.content
    : (msg.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
  return new AIMessage(textContent);
}

function lcToClaudeMessage(msg: AIMessage): ClaudeMessage {
  return {
    role: 'assistant',
    content: getTextContent(msg),
  };
}

function cancelled(
  filesModified: string[],
  toolCallCount: number,
  totalInput: number,
  totalOutput: number,
  totalCached: number,
): TaskResult {
  return {
    success: false,
    summary: 'Agent loop cancelled by user.',
    filesModified,
    toolCallCount,
    tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
  };
}
