import { access } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  Codex,
  type AgentMessageItem,
  type CommandExecutionItem,
  type ErrorItem,
  type FileChangeItem,
  type ItemCompletedEvent,
  type ItemStartedEvent,
  type ItemUpdatedEvent,
  type McpToolCallItem,
  type ReasoningItem,
  type TodoListItem,
  type WebSearchItem,
} from '@openai/codex-sdk';
import type { AgentContext, AgentLoopOptions, ClaudeMessage } from '../types/agent.js';
import type { TaskResult } from '../types/task.js';
import { buildTaskPrompt } from './task-prompt.js';

export async function runCodexLoop(
  ctx: AgentContext,
  opts: AgentLoopOptions,
): Promise<TaskResult> {
  if (opts.signal?.aborted) {
    return cancelledResult();
  }

  await ensureCodexAuth();

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
  const thread = codex.startThread({
    model: ctx.config.model,
    workingDirectory: ctx.task.context.projectPath,
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    modelReasoningEffort: 'medium',
    webSearchEnabled: false,
    networkAccessEnabled: false,
  });

  let toolCallCount = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let finalResponse = '';
  const filesModified = new Set<string>();
  const streamedText = new Map<string, string>();
  const reportedToolItems = new Set<string>();

  // Hard cap on tool calls to prevent runaway loops. Codex has no equivalent of LangChain's
  // ReAct iteration limit — without this, a model that can't satisfy a task's verification
  // criteria will keep retrying indefinitely (we observed 43+ command_executions on a single
  // verification task with no progress). The runner passes maxIterations=30; Codex tool calls
  // are finer-grained than ReAct turns, so allow at least 60 before bailing.
  const toolCallCap = Math.max(opts.maxIterations ?? 30, 60);

  try {
    const { events } = await thread.runStreamed(buildCodexPrompt(ctx), {
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    });

    for await (const event of events) {
      if (opts.signal?.aborted) {
        return cancelledResult([...filesModified], toolCallCount, {
          input: totalInput,
          output: totalOutput,
          cached: totalCached,
        });
      }

      if (toolCallCount >= toolCallCap) {
        return {
          success: false,
          summary: `Codex loop hit the tool-call cap (${toolCallCap}) without completing the task. The model is likely stuck in a verification retry loop. Inspect filesModified and any error logs to diagnose what verification keeps failing.`,
          filesModified: [...filesModified],
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }

      switch (event.type) {
        case 'item.started':
          handleToolEvent(event, opts, reportedToolItems, () => {
            toolCallCount++;
          });
          handleTextEvent(event, opts, streamedText, false, (text) => {
            finalResponse = text;
          });
          break;
        case 'item.updated':
          handleTextEvent(event, opts, streamedText, false, (text) => {
            finalResponse = text;
          });
          break;
        case 'item.completed':
          handleToolEvent(event, opts, reportedToolItems, () => {
            toolCallCount++;
          });
          handleTextEvent(event, opts, streamedText, true, (text) => {
            finalResponse = text;
          });
          if (event.item.type === 'file_change' && event.item.status === 'completed') {
            for (const change of event.item.changes) {
              filesModified.add(change.path);
            }
          }
          break;
        case 'turn.completed':
          totalInput += event.usage.input_tokens;
          totalOutput += event.usage.output_tokens;
          totalCached += event.usage.cached_input_tokens;
          opts.onTokens?.({
            input: totalInput,
            output: totalOutput,
            cached: totalCached,
          });
          if (finalResponse) {
            opts.onMessage?.({
              role: 'assistant',
              content: finalResponse,
            } satisfies ClaudeMessage);
          }
          break;
        case 'turn.failed':
          return {
            success: false,
            summary: event.error.message,
            filesModified: [...filesModified],
            toolCallCount,
            tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
          };
        case 'error':
          return {
            success: false,
            summary: event.message,
            filesModified: [...filesModified],
            toolCallCount,
            tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
          };
        case 'thread.started':
        case 'turn.started':
          break;
      }
    }
  } catch (error) {
    if (opts.signal?.aborted) {
      return cancelledResult([...filesModified], toolCallCount, {
        input: totalInput,
        output: totalOutput,
        cached: totalCached,
      });
    }

    return {
      success: false,
      summary: error instanceof Error ? error.message : String(error),
      filesModified: [...filesModified],
      toolCallCount,
      tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
    };
  }

  const result: TaskResult = {
    success: true,
    summary: finalResponse.trim() || 'Codex completed the task without a final summary.',
    filesModified: [...filesModified],
    toolCallCount,
    tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
  };
  opts.onComplete?.(result);
  return result;
}

function buildCodexPrompt(ctx: AgentContext): string {
  return [
    'Follow these system instructions exactly:',
    ctx.config.systemPrompt,
    '',
    'Now complete the following task:',
    buildTaskPrompt(ctx),
  ].join('\n');
}

function handleToolEvent(
  event: ItemStartedEvent | ItemCompletedEvent,
  opts: AgentLoopOptions,
  reportedToolItems: Set<string>,
  onCount: () => void,
): void {
  const item = event.item;
  if (reportedToolItems.has(item.id)) {
    return;
  }

  if (item.type === 'command_execution') {
    reportedToolItems.add(item.id);
    onCount();
    opts.onToolCall?.({
      name: 'codex.command_execution',
      input: { command: item.command },
    });
    return;
  }

  if (item.type === 'mcp_tool_call') {
    reportedToolItems.add(item.id);
    onCount();
    opts.onToolCall?.({
      name: `codex.mcp.${item.server}.${item.tool}`,
      input: normalizeUnknownRecord(item.arguments, { server: item.server, tool: item.tool }),
    });
    return;
  }

  if (item.type === 'web_search') {
    reportedToolItems.add(item.id);
    onCount();
    opts.onToolCall?.({
      name: 'codex.web_search',
      input: { query: item.query },
    });
  }
}

function handleTextEvent(
  event: ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent,
  opts: AgentLoopOptions,
  streamedText: Map<string, string>,
  finished: boolean,
  onFinalText: (text: string) => void,
): void {
  const textState = getTextState(event.item);
  if (!textState) {
    return;
  }

  const previous = streamedText.get(textState.id) ?? '';
  const next = textState.text;

  // Debug: log every text event we receive from Codex so we can see whether reasoning /
  // agent_message items actually stream during a run, and whether updates are incremental.
  // Remove once Codex chat streaming is confirmed working end-to-end.
  // eslint-disable-next-line no-console
  console.log(
    `[codex-text] kind=${textState.kind} id=${textState.id} event=${event.type} prevLen=${previous.length} nextLen=${next.length} incremental=${next.startsWith(previous)}`,
  );

  let delta = '';
  if (next.startsWith(previous)) {
    if (next.length > previous.length) {
      delta = next.slice(previous.length);
    }
  } else {
    // Non-incremental rewrite of this item. We've already emitted `previous` and can't
    // retract it from the UI — emit only the portion beyond the previous length, if any,
    // and log a warning. Emitting the full `next` here (as the old code did) caused the
    // entire text to be appended a second time, producing visible duplicates in the bubble.
    // eslint-disable-next-line no-console
    console.warn(
      `[codex-text] non-incremental update for id=${textState.id} kind=${textState.kind}; previous and next diverge. Emitting tail-only diff to avoid duplication.`,
    );
    if (next.length > previous.length) {
      delta = next.slice(previous.length);
    }
  }

  if (delta.length > 0) {
    opts.onText?.(delta);
  }
  if (delta.length > 0 || finished) {
    opts.onTextItem?.({
      itemId: textState.id,
      kind: textState.kind,
      delta,
      finished,
    });
  }

  streamedText.set(textState.id, next);
  if (textState.kind === 'agent_message') {
    onFinalText(next);
  }
}

function getTextState(
  item: AgentMessageItem | CommandExecutionItem | ErrorItem | FileChangeItem | McpToolCallItem | ReasoningItem | TodoListItem | WebSearchItem,
): { id: string; text: string; kind: 'agent_message' | 'error' | 'reasoning' } | undefined {
  if (item.type === 'agent_message' || item.type === 'reasoning') {
    return {
      id: item.id,
      text: item.text,
      kind: item.type,
    };
  }
  if (item.type === 'error') {
    return {
      id: item.id,
      text: item.message,
      kind: 'error',
    };
  }
  return undefined;
}

function normalizeUnknownRecord(
  value: unknown,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallback;
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

function cancelledResult(
  filesModified: string[] = [],
  toolCallCount = 0,
  tokensUsed: TaskResult['tokensUsed'] = { input: 0, output: 0, cached: 0 },
): TaskResult {
  return {
    success: false,
    summary: 'Agent loop cancelled by user.',
    filesModified,
    toolCallCount,
    tokensUsed,
  };
}
