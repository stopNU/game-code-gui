import { randomUUID } from 'crypto';
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph';
import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { traceable } from 'langsmith/traceable';
import type { ClaudeContentBlock, ClaudeMessage, ToolContract } from '@agent-harness/core';
import type { LLMProvider } from './llm-provider.js';
import type { ApprovalGate, ToolRiskLevel } from './approval-gate.js';
import { buildToolExecutionContext, summarizeToolResult } from './tool-registry.js';
import type { StudioCheckpointer } from './checkpointer.js';
import type { StreamEvent } from '../../shared/protocol.js';

/**
 * Thrown by the tools node when wall-clock or tool-call caps fire mid-graph. The driver in
 * conversation-agent catches it and emits the matching `cap-exceeded` event before exiting.
 * Throwing (rather than gracefully ending the graph) is the cleanest way to short-circuit a
 * StateGraph turn — there's no "cancel from a node" primitive in LangGraph that wouldn't lose
 * the in-flight assistant message anyway.
 */
export class CapExceededError extends Error {
  constructor(public readonly cap: 'wall-clock' | 'tool-calls') {
    super(`cap exceeded: ${cap}`);
    this.name = 'CapExceededError';
  }
}

export interface ConversationGraphCaps {
  startedAt: number;
  wallClockMs: number;
  maxToolCalls: number;
  toolCallCount: { value: number };
}

interface GraphBridge {
  workspaceRoot: string;
  emit(event: StreamEvent): void;
  createMessage(args: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system' | 'error';
    contentBlocks: unknown[];
  }): Promise<unknown>;
  addConversationTokens(args: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }): Promise<void>;
  getProject(
    projectId: string,
  ): Promise<{ id: string; normalizedPath: string; displayPath: string; title: string | null } | null>;
  upsertProject(args: { normalizedPath: string; displayPath: string; title?: string | null }): Promise<{
    id: string;
    displayPath: string;
    title: string | null;
  }>;
  getTaskPlan(projectId: string): Promise<{ projectId: string; planJson: string; updatedAt: number } | null>;
  upsertTaskPlan(args: { projectId: string; planJson: string }): Promise<void>;
  launchGodot(args: { projectPath: string; ownerConversationId?: string }): Promise<unknown>;
  stopGodot(args: { ownerConversationId?: string; force?: boolean }): Promise<unknown>;
  getAnthropicApiKey(): Promise<string | null>;
}

export interface BuildConversationGraphOpts {
  provider: LLMProvider;
  tools: ToolContract[];
  system: string;
  model: string;
  conversationId: string;
  projectId?: string;
  projectDisplayPath?: string;
  signal: AbortSignal;
  bridge: GraphBridge;
  approvalGate: ApprovalGate;
  caps: ConversationGraphCaps;
  getToolRiskLevel(toolName: string): ToolRiskLevel;
  /**
   * Optional. When supplied, the compiled graph persists state to this checkpointer keyed by
   * `thread_id` (== conversationId). Subsequent turns invoke with only the new user message;
   * the checkpointer rehydrates the rest. Without it the driver must re-seed state every turn.
   */
  checkpointer?: StudioCheckpointer;
}

/**
 * Tool result content can balloon (e.g. a `read_file` of a 200 KB log) and we re-send the full
 * history every iteration. Truncate large `tool_result` blocks before they go to the model — the
 * full payload is still in SQLite for the user to inspect.
 */
function truncateToolResultBlocks(blocks: ClaudeContentBlock[]): ClaudeContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'tool_result' || typeof block.content !== 'string' || block.content.length <= 8_000) {
      return block;
    }
    return {
      ...block,
      content: `${block.content.slice(0, 8_000)}\n[truncated - full result stored in the database]`,
    };
  });
}

function getTextFromContent(content: string | ClaudeContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/**
 * Convert a LangChain `BaseMessage` from graph state back into the `ClaudeMessage` shape that
 * `provider.streamMessage` expects. Inverse of `claudeToLC` in llm-provider.ts.
 *
 * - `ToolMessage` → user role with a `tool_result` block
 * - `AIMessage` with `tool_calls` → assistant with text + `tool_use` blocks
 * - `HumanMessage` / plain `AIMessage` → user / assistant with a single text block
 */
function lcToClaude(msg: BaseMessage): ClaudeMessage {
  // ToolMessage: synthesize a user message containing a tool_result block.
  if ((msg as ToolMessage).tool_call_id !== undefined) {
    const tm = msg as ToolMessage;
    const content =
      typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content ?? '');
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: tm.tool_call_id,
          content,
        },
      ],
    };
  }

  // AIMessage with tool_calls: assistant with text + tool_use blocks.
  const ai = msg as AIMessage;
  if (ai.tool_calls !== undefined && ai.tool_calls.length > 0) {
    const text = typeof ai.content === 'string' ? ai.content : '';
    const blocks: ClaudeContentBlock[] = [];
    if (text.length > 0) {
      blocks.push({ type: 'text', text });
    }
    for (const call of ai.tool_calls) {
      blocks.push({
        type: 'tool_use',
        ...(call.id !== undefined ? { id: call.id } : {}),
        name: call.name,
        input: call.args as Record<string, unknown>,
      });
    }
    return { role: 'assistant', content: blocks };
  }

  // HumanMessage vs plain AIMessage — `_getType()` is the public discriminator.
  const role = msg._getType() === 'human' ? 'user' : 'assistant';
  const text = typeof msg.content === 'string'
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content
          .filter((b) => typeof b === 'object' && (b as { type?: string }).type === 'text')
          .map((b) => (b as { text?: string }).text ?? '')
          .join('')
      : '';
  return { role, content: text };
}

/**
 * Build a compiled LangGraph for a Studio conversation turn. Shape matches
 * `packages/core/src/graph/agent-graph.ts` (agent ↔ tools) so each turn produces one nested
 * LangSmith trace: `studio-turn → agent (model call) → tools (per-tool spans) → agent → …`.
 *
 * Deliberately not using LangGraph's prebuilt `ToolNode`: Studio needs a per-call execution
 * context with a fresh `toolCallId`, must pause on the approval gate before running the tool,
 * and emits / persists IPC events around each call. None of those hooks exist on `ToolNode`.
 */
export function buildConversationGraph(opts: BuildConversationGraphOpts) {
  const {
    provider,
    tools,
    system,
    model,
    conversationId,
    projectId,
    projectDisplayPath,
    signal,
    bridge,
    approvalGate,
    caps,
    getToolRiskLevel,
  } = opts;

  // ------------------------------------------------------------------------
  // agent node — calls the LLM, emits text-delta / tokens / message-complete,
  // persists the assistant message, returns the new AIMessage to the graph.
  // ------------------------------------------------------------------------
  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    if (Date.now() - caps.startedAt > caps.wallClockMs) {
      throw new CapExceededError('wall-clock');
    }

    const messageId = randomUUID();
    let streamedText = '';

    bridge.emit({
      type: 'message-start',
      conversationId,
      messageId,
      role: 'assistant',
      createdAt: new Date().toISOString(),
    });

    // Convert state.messages → ClaudeMessage[] for the provider, truncating any oversized
    // tool_result blocks first.
    const history: ClaudeMessage[] = state.messages.map(lcToClaude).map((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? { ...m, content: truncateToolResultBlocks(m.content as ClaudeContentBlock[]) }
        : m,
    );

    const llmResult = await provider.streamMessage({
      messages: history,
      tools,
      system,
      model,
      signal,
      onEvent: (event) => {
        if (event.type === 'text-delta') {
          streamedText += event.delta;
          bridge.emit({
            type: 'text-delta',
            conversationId,
            messageId,
            delta: event.delta,
          });
          return;
        }
        bridge.emit({
          type: 'retrying',
          conversationId,
          attempt: event.attempt,
          reason: event.reason,
        });
      },
    });

    await bridge.addConversationTokens({
      conversationId,
      inputTokens: llmResult.tokens.input,
      outputTokens: llmResult.tokens.output,
      cachedTokens: llmResult.tokens.cached,
    });
    bridge.emit({
      type: 'tokens',
      conversationId,
      input: llmResult.tokens.input,
      output: llmResult.tokens.output,
      cached: llmResult.tokens.cached,
    });

    const contentBlocks = Array.isArray(llmResult.message.content)
      ? (llmResult.message.content as unknown[])
      : [{ type: 'text', text: typeof llmResult.message.content === 'string' ? llmResult.message.content : '' }];

    await bridge.createMessage({
      conversationId,
      role: 'assistant',
      contentBlocks,
    });
    bridge.emit({
      type: 'message-complete',
      conversationId,
      messageId,
      fullText: streamedText.length > 0 ? streamedText : getTextFromContent(llmResult.message.content),
      contentBlocks,
      completedAt: new Date().toISOString(),
    });

    // Build the AIMessage that flows back into graph state. Convert the assistant ClaudeMessage
    // into LangChain form so `toolsCondition` can route based on `tool_calls`.
    const assistantBlocks = Array.isArray(llmResult.message.content)
      ? (llmResult.message.content as ClaudeContentBlock[])
      : [];
    const text = assistantBlocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n');
    const toolCalls = assistantBlocks
      .filter((b) => b.type === 'tool_use' && b.id !== undefined && b.name !== undefined)
      .map((b) => ({
        id: b.id as string,
        name: b.name as string,
        args: (b.input ?? {}) as Record<string, unknown>,
        type: 'tool_call' as const,
      }));

    const aiMessage = toolCalls.length > 0
      ? new AIMessage({ content: text, tool_calls: toolCalls })
      : new AIMessage(typeof llmResult.message.content === 'string' ? llmResult.message.content : text);

    return { messages: [aiMessage] };
  };

  // ------------------------------------------------------------------------
  // tools node — for each tool_call on the last AIMessage: bump cap counter,
  // emit tool-call, run approval gate, execute (wrapped in `traceable` for a
  // per-tool LangSmith span), emit tool-result, persist tool_result.
  // ------------------------------------------------------------------------
  const toolsNode = async (state: typeof MessagesAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage as AIMessage | undefined)?.tool_calls ?? [];
    const newMessages: BaseMessage[] = [];

    for (const call of toolCalls) {
      caps.toolCallCount.value += 1;
      if (caps.toolCallCount.value > caps.maxToolCalls) {
        throw new CapExceededError('tool-calls');
      }

      const toolCallId = call.id ?? randomUUID();
      const tool = tools.find((candidate) => candidate.name === call.name);
      if (tool === undefined) {
        const errOutput = { ok: false, error: `Unknown Studio tool "${call.name}".` };
        bridge.emit({
          type: 'tool-result',
          conversationId,
          toolCallId,
          success: false,
          output: errOutput,
        });
        await bridge.createMessage({
          conversationId,
          role: 'user',
          contentBlocks: [
            { type: 'tool_result', tool_use_id: toolCallId, content: JSON.stringify(errOutput) },
          ],
        });
        newMessages.push(
          new ToolMessage({ content: JSON.stringify(errOutput), tool_call_id: toolCallId }),
        );
        continue;
      }

      bridge.emit({
        type: 'tool-call',
        conversationId,
        toolCallId,
        toolName: call.name,
        input: call.args,
      });

      const approvalDecision = await approvalGate.ensureApproved({
        conversationId,
        toolCallId,
        toolName: call.name,
        input: call.args,
        ...(projectId !== undefined ? { projectId } : {}),
        riskLevel: getToolRiskLevel(call.name),
        rationale: `This tool can modify code, generate a project, or launch external processes.`,
        signal,
      });

      if (approvalDecision !== 'approved') {
        const output = { ok: false, message: `Tool ${call.name} was ${approvalDecision}.` };
        await bridge.createMessage({
          conversationId,
          role: 'user',
          contentBlocks: [
            { type: 'tool_result', tool_use_id: toolCallId, content: JSON.stringify(output) },
          ],
        });
        bridge.emit({
          type: 'tool-result',
          conversationId,
          toolCallId,
          success: false,
          output,
        });
        newMessages.push(
          new ToolMessage({ content: JSON.stringify(output), tool_call_id: toolCallId }),
        );
        continue;
      }

      const ctx = buildToolExecutionContext({
        conversationId,
        ...(projectId !== undefined ? { projectId } : {}),
        ...(projectDisplayPath !== undefined ? { projectPath: projectDisplayPath } : {}),
        toolCallId,
        signal,
        bridge: {
          workspaceRoot: bridge.workspaceRoot,
          emit: (event) => bridge.emit(event),
          getProject: (id) => bridge.getProject(id),
          upsertProject: (toolArgs) => bridge.upsertProject(toolArgs),
          getTaskPlan: (id) => bridge.getTaskPlan(id),
          upsertTaskPlan: (toolArgs) => bridge.upsertTaskPlan(toolArgs),
          launchGodot: (toolArgs) => bridge.launchGodot(toolArgs),
          stopGodot: (toolArgs) => bridge.stopGodot(toolArgs),
          getAnthropicApiKey: () => bridge.getAnthropicApiKey(),
        },
      });

      // Wrap the actual tool execution in `traceable` so it appears as a child run under the
      // `tools` node in LangSmith. Without this the tool calls are invisible — they go through
      // ToolContract.execute, never a LangChain Tool, so LangSmith's auto-tracing doesn't see
      // them.
      const tracedExecute = traceable(
        async (input: unknown) => tool.execute(input, ctx),
        { name: `tool:${call.name}`, run_type: 'tool' },
      );

      let toolOutput: unknown;
      let toolSuccess = true;
      try {
        toolOutput = await tracedExecute(call.args);
      } catch (error) {
        toolSuccess = false;
        toolOutput = { ok: false, error: String(error) };
      }

      const summarized = summarizeToolResult(toolOutput);
      await bridge.createMessage({
        conversationId,
        role: 'user',
        contentBlocks: [
          { type: 'tool_result', tool_use_id: toolCallId, content: summarized },
        ],
      });
      bridge.emit({
        type: 'tool-result',
        conversationId,
        toolCallId,
        success: toolSuccess,
        output: toolOutput,
      });
      newMessages.push(
        new ToolMessage({ content: summarized, tool_call_id: toolCallId }),
      );
    }

    return { messages: newMessages };
  };

  // ------------------------------------------------------------------------
  // Edges: __start__ → agent ; agent → (tools | END) ; tools → agent.
  // We use a custom condition rather than `toolsCondition` so we don't require a typed
  // ToolNode — and so we can keep using BaseMessage tool_calls directly.
  // ------------------------------------------------------------------------
  const routeAfterAgent = (state: typeof MessagesAnnotation.State): 'tools' | typeof END => {
    const last = state.messages[state.messages.length - 1] as AIMessage | undefined;
    return last?.tool_calls !== undefined && last.tool_calls.length > 0 ? 'tools' : END;
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge('__start__', 'agent')
    .addConditionalEdges('agent', routeAfterAgent, ['tools', END])
    .addEdge('tools', 'agent');

  return graph.compile(opts.checkpointer !== undefined ? { checkpointer: opts.checkpointer } : {});
}
