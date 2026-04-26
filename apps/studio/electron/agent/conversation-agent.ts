import { randomUUID } from 'crypto';
import { resolve as resolvePath } from 'path';
import {
  DEFAULT_RETRY_POLICY,
  runCodexLoop,
  type AgentContext,
  type ClaudeContentBlock,
  type ClaudeMessage,
  type TaskState,
  type ToolContract,
} from '@agent-harness/core';
import { buildConversationAgentPrompt } from './conversation-agent-prompt.js';
import { ApprovalGate, type ToolRiskLevel } from './approval-gate.js';
import { AnthropicProvider, OpenAIProvider, claudeToLC, type LLMProvider } from './llm-provider.js';
import { buildToolExecutionContext, createStudioTools } from './tool-registry.js';
import { applyLangSmithEnv } from './langsmith/env.js';
import { buildConversationGraph, CapExceededError } from './conversation-graph.js';
import type { StudioCheckpointer } from './checkpointer.js';
import { HumanMessage } from '@langchain/core/messages';
import type { StreamEvent } from '../../shared/protocol.js';

interface DbMessageRecord {
  id: string;
  conversationId: string;
  seq: number;
  role: 'user' | 'assistant' | 'system' | 'error';
  contentBlocks: unknown[];
  createdAt: string;
}

interface ConversationAgentBridge {
  workspaceRoot: string;
  emit(event: StreamEvent): void;
  /**
   * Optional. When present, the Anthropic/OpenAI graph runs with this checkpointer so prior
   * turns are rehydrated automatically instead of replayed from the messages table each turn.
   */
  checkpointer?: StudioCheckpointer;
  ensureConversation(args: {
    conversationId: string;
    projectId?: string;
    title: string;
    model: string;
    provider: 'anthropic' | 'openai' | 'codex';
  }): Promise<{ id: string; projectId: string | null; title: string; model?: string; provider: 'anthropic' | 'openai' | 'codex' }>;
  listMessages(conversationId: string): Promise<DbMessageRecord[]>;
  createMessage(args: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system' | 'error';
    contentBlocks: unknown[];
  }): Promise<DbMessageRecord>;
  addConversationTokens(args: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }): Promise<void>;
  getProject(projectId: string): Promise<{ id: string; normalizedPath: string; displayPath: string; title: string | null } | null>;
  getTaskPlan(projectId: string): Promise<{ projectId: string; planJson: string; updatedAt: number } | null>;
  upsertProject(args: { normalizedPath: string; displayPath: string; title?: string | null }): Promise<{ id: string; displayPath: string; title: string | null }>;
  upsertTaskPlan(args: { projectId: string; planJson: string }): Promise<void>;
  launchGodot(args: { projectPath: string; ownerConversationId?: string }): Promise<unknown>;
  stopGodot(args: { ownerConversationId?: string; force?: boolean }): Promise<unknown>;
  getApiKey(provider: 'anthropic' | 'openai'): Promise<string | null>;
  getLangSmithConfig(): Promise<{
    enabled: boolean;
    apiKey: string | null;
    projectName: string;
    endpoint: string | null;
  }>;
  createApproval(args: {
    conversationId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
    argsHash: string;
    projectId?: string | null;
    riskLevel: ToolRiskLevel;
    rationale: string;
  }): Promise<{ id: string; status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted' }>;
  findApprovalDecision(args: {
    conversationId: string;
    toolName: string;
    argsHash: string;
    projectId?: string | null;
  }): Promise<{ id: string; status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted' } | null>;
  resolveApproval(args: {
    approvalId: string;
    status: 'approved' | 'denied' | 'timeout' | 'aborted';
    scope?: 'once' | 'conversation' | 'project';
  }): Promise<void>;
}

function toClaudeMessage(record: DbMessageRecord): ClaudeMessage {
  const contentBlocks = record.contentBlocks as ClaudeContentBlock[];
  return {
    role: record.role === 'error' || record.role === 'system' ? 'assistant' : record.role,
    content: contentBlocks,
  };
}

function getToolRiskLevel(toolName: string): ToolRiskLevel {
  if (toolName === 'read_task_plan') {
    return 'low';
  }
  if (toolName === 'launch_game' || toolName === 'plan_game' || toolName === 'plan_iteration') {
    return 'medium';
  }

  return 'high';
}

function getTaskLabelFromUserMessage(userMessage: string): string | null {
  const match = /implement task\s+([^\s:]+)(?::\s*([^\n\r]+))?/i.exec(userMessage);
  if (match === null) {
    return null;
  }

  const title = match[2]?.trim();
  if (title !== undefined && title.length > 0) {
    return title;
  }

  const taskId = match[1]?.trim();
  return taskId !== undefined && taskId.length > 0 ? taskId : null;
}

function truncateNoticeSummary(summary: string, maxLength = 240): string {
  const trimmed = summary.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function buildCodexTaskNotice(args: {
  userMessage: string;
  success: boolean;
  summary: string;
}): string | null {
  const taskLabel = getTaskLabelFromUserMessage(args.userMessage);
  if (taskLabel === null) {
    return null;
  }

  if (args.success) {
    return `Task complete: ${taskLabel}`;
  }

  const detail = truncateNoticeSummary(args.summary);
  return detail.length > 0
    ? `Task failed: ${taskLabel}. ${detail}`
    : `Task failed: ${taskLabel}`;
}

export class ConversationAgent {
  private readonly controllers = new Map<string, AbortController>();
  private readonly approvalGate: ApprovalGate;
  private readonly tools: ToolContract[];
  private readonly log: (msg: string, err?: unknown) => void;

  public constructor(private readonly bridge: ConversationAgentBridge, log?: (msg: string, err?: unknown) => void) {
    this.log = log ?? (() => {});
    this.approvalGate = new ApprovalGate({
      requestApprovalRecord: (args) => this.bridge.createApproval(args),
      findReusableDecision: (args) => this.bridge.findApprovalDecision(args),
      resolveApproval: (args) => this.bridge.resolveApproval(args),
      emit: (event) => this.bridge.emit(event),
    });
    this.tools = createStudioTools();
  }

  public async sendMessage(args: {
    conversationId: string;
    userMessage: string;
    projectId?: string;
    model: string;
    provider: 'anthropic' | 'openai' | 'codex';
    signal: AbortSignal;
  }): Promise<void> {
    if (args.provider !== 'codex') {
      const providerKey = await this.bridge.getApiKey(args.provider);
      if (providerKey !== null) {
        if (args.provider === 'anthropic') {
          process.env['ANTHROPIC_API_KEY'] = providerKey;
        } else {
          process.env['OPENAI_API_KEY'] = providerKey;
        }
      }
    }

    const project = args.projectId === undefined ? null : await this.bridge.getProject(args.projectId);
    await this.bridge.ensureConversation({
      conversationId: args.conversationId,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      title: project?.title ?? 'Studio conversation',
      model: args.model,
      provider: args.provider,
    });

    await this.bridge.createMessage({
      conversationId: args.conversationId,
      role: 'user',
      contentBlocks: [{ type: 'text', text: args.userMessage }],
    });

    const langSmithCfg = await this.bridge.getLangSmithConfig();
    this.log(`[LangSmith] config: enabled=${langSmithCfg.enabled}, hasKey=${langSmithCfg.apiKey !== null}, project=${langSmithCfg.projectName}`);
    applyLangSmithEnv(langSmithCfg);

    if (args.provider === 'codex') {
      await this.runCodexConversation(
        {
          conversationId: args.conversationId,
          userMessage: args.userMessage,
          ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
          model: args.model,
          provider: 'codex',
          signal: args.signal,
        },
        project,
      );
      return;
    }

    const cliEntryPath = resolvePath(this.bridge.workspaceRoot, 'apps/cli/bin/game-harness.js');
    const systemPrompt = buildConversationAgentPrompt({ project, provider: args.provider, cliEntryPath, model: args.model });
    const provider = this.createProvider(args.provider);

    // Caps live in the driver via a closure so the graph nodes can mutate the counter and
    // throw `CapExceededError` to short-circuit the turn. The driver catches and emits the
    // matching `cap-exceeded` event.
    const caps = {
      startedAt: Date.now(),
      wallClockMs: 15 * 60 * 1000,
      maxToolCalls: 50,
      toolCallCount: { value: 0 },
    };

    const checkpointer = this.bridge.checkpointer;

    const graph = buildConversationGraph({
      provider,
      tools: this.tools,
      system: systemPrompt,
      model: args.model,
      conversationId: args.conversationId,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      ...(project?.displayPath !== undefined ? { projectDisplayPath: project.displayPath } : {}),
      signal: args.signal,
      bridge: {
        workspaceRoot: this.bridge.workspaceRoot,
        emit: (event) => this.bridge.emit(event),
        createMessage: (createArgs) => this.bridge.createMessage(createArgs),
        addConversationTokens: (toolArgs) => this.bridge.addConversationTokens(toolArgs),
        getProject: (projectId) => this.bridge.getProject(projectId),
        upsertProject: (toolArgs) => this.bridge.upsertProject(toolArgs),
        getTaskPlan: (projectId) => this.bridge.getTaskPlan(projectId),
        upsertTaskPlan: (toolArgs) => this.bridge.upsertTaskPlan(toolArgs),
        launchGodot: (toolArgs) => this.bridge.launchGodot(toolArgs),
        stopGodot: (toolArgs) => this.bridge.stopGodot(toolArgs),
        getAnthropicApiKey: () => this.bridge.getApiKey('anthropic'),
      },
      approvalGate: this.approvalGate,
      caps,
      getToolRiskLevel,
      ...(checkpointer !== undefined ? { checkpointer } : {}),
    });

    const invokeConfig: {
      signal: AbortSignal;
      runName: string;
      tags: string[];
      recursionLimit: number;
      configurable?: { thread_id: string };
    } = {
      signal: args.signal,
      runName: 'studio-turn',
      tags: [args.provider, args.model],
      // High enough not to be hit normally; cap enforcement is what stops runaway turns.
      recursionLimit: 200,
      ...(checkpointer !== undefined
        ? { configurable: { thread_id: args.conversationId } }
        : {}),
    };

    // With a checkpointer: seed the graph state once on first turn from existing DB messages,
    // then `invoke` only with the new HumanMessage — the checkpointer rehydrates the rest.
    // Without a checkpointer: fall back to the previous behaviour (re-seed from DB every turn).
    let invokeInput: { messages: ReturnType<typeof claudeToLC>[] | [HumanMessage] };
    if (checkpointer !== undefined) {
      const existing = await graph.getState(invokeConfig);
      const existingMessages = existing.values?.messages as unknown[] | undefined;
      if (existingMessages === undefined || existingMessages.length === 0) {
        const records = await this.bridge.listMessages(args.conversationId);
        // Drop the just-inserted user message — graph.invoke will add it below.
        const seedRecords = records.slice(0, -1);
        if (seedRecords.length > 0) {
          await graph.updateState(
            invokeConfig,
            { messages: seedRecords.map(toClaudeMessage).map(claudeToLC) },
          );
        }
      }
      invokeInput = { messages: [new HumanMessage(args.userMessage)] };
    } else {
      const initialRecords = await this.bridge.listMessages(args.conversationId);
      invokeInput = { messages: initialRecords.map(toClaudeMessage).map(claudeToLC) };
    }

    try {
      await graph.invoke(invokeInput, invokeConfig);
    } catch (error) {
      if (error instanceof CapExceededError) {
        this.bridge.emit({
          type: 'cap-exceeded',
          conversationId: args.conversationId,
          cap: error.cap,
        });
        return;
      }
      throw error;
    }

    if (args.signal.aborted) {
      return;
    }

    this.bridge.emit({
      type: 'done',
      conversationId: args.conversationId,
    });
  }

  public abortConversation(conversationId: string): void {
    this.controllers.get(conversationId)?.abort();
  }

  public createController(conversationId: string): AbortController {
    this.controllers.get(conversationId)?.abort();
    const controller = new AbortController();
    this.controllers.set(conversationId, controller);
    return controller;
  }

  public handleApprovalDecision(message: {
    approvalId: string;
    decision: 'approved' | 'denied' | 'timeout' | 'aborted';
    scope?: 'once' | 'conversation' | 'project';
  }): void {
    this.approvalGate.resolveDecision({
      type: 'approval-decision',
      approvalId: message.approvalId,
      decision: message.decision,
      ...(message.scope !== undefined ? { scope: message.scope } : {}),
    });
  }

  private createProvider(provider: 'anthropic' | 'openai'): LLMProvider {
    return provider === 'anthropic' ? new AnthropicProvider() : new OpenAIProvider();
  }

  private async runCodexConversation(
    args: {
      conversationId: string;
      userMessage: string;
      projectId?: string;
      model: string;
      provider: 'codex';
      signal: AbortSignal;
    },
    project: { id: string; normalizedPath: string; displayPath: string; title: string | null } | null,
  ): Promise<void> {
    // Fast path: if the user is asking to implement one or more known tasks by id, route
    // through the structured implement_task tool in-process. This bypasses Codex SDK + the
    // CLI shell-out (both of which are fragile on Windows: spawn EPERM, path-resolution
    // issues, no typed status update). The structured runner handles task status correctly,
    // honors the chat model selection, and reuses Studio's in-process Codex SDK if the
    // selected model resolves to Codex. Free-form Codex chat for anything else still works.
    //
    // We validate ids against the actual plan so identifier-shaped phrases in prose don't
    // false-trigger. Multiple ids in one message are run sequentially — the user can fire a
    // whole phase with one prompt.
    if (args.projectId !== undefined) {
      // Iteration fast-path: file a bug or feature request with an explicit prefix. Runs the
      // iteration planner in-process and appends tasks to the plan, mirroring the implement-task
      // interceptor below. Must run BEFORE parseImplementTaskIntents so a `bug: …` line is never
      // mistaken for a kebab-case id reference.
      const iterationIntent = parseIterationIntent(args.userMessage);
      if (iterationIntent !== null) {
        await this.runStructuredPlanIteration({
          conversationId: args.conversationId,
          projectId: args.projectId,
          type: iterationIntent.type,
          description: iterationIntent.description,
          model: args.model,
          signal: args.signal,
        });
        return;
      }

      const planRecord = await this.bridge.getTaskPlan(args.projectId);
      const validIds = new Set<string>();
      if (planRecord !== null) {
        try {
          const plan = JSON.parse(planRecord.planJson) as { phases?: Array<{ tasks?: Array<{ id?: string }> }> };
          for (const phase of plan.phases ?? []) {
            for (const t of phase.tasks ?? []) {
              if (typeof t.id === 'string') {
                validIds.add(t.id);
              }
            }
          }
        } catch (err) {
          this.log('runCodexConversation: failed to parse task plan for id validation', err);
        }
      }

      const taskIds = parseImplementTaskIntents(args.userMessage, validIds.size > 0 ? validIds : undefined);
      if (taskIds.length > 0) {
        await this.runStructuredImplementTaskBatch({
          conversationId: args.conversationId,
          projectId: args.projectId,
          taskIds,
          model: args.model,
          signal: args.signal,
        });
        return;
      }

      // No literal kebab-case ids in the message, but the user may be using a demonstrative
      // ("this", "that", "those") to refer back to a plan from a prior assistant turn. Ask a
      // fast model to map the demonstrative to plan ids using the prior transcript. Only fires
      // when there's at least one valid task id in the plan and the message looks referential.
      if (validIds.size > 0 && messageHasDemonstrative(args.userMessage)) {
        const priorMessages = await this.bridge.listMessages(args.conversationId);
        const resolvedIds = await this.resolveTaskReferences({
          userMessage: args.userMessage,
          validIds,
          priorMessages: priorMessages.slice(0, -1),
          signal: args.signal,
        });
        if (resolvedIds.length > 0) {
          await this.runStructuredImplementTaskBatch({
            conversationId: args.conversationId,
            projectId: args.projectId,
            taskIds: resolvedIds,
            model: args.model,
            signal: args.signal,
          });
          return;
        }
      }
    }

    const storedMessages = await this.bridge.listMessages(args.conversationId);
    const cliEntryPath = resolvePath(this.bridge.workspaceRoot, 'apps/cli/bin/game-harness.js');
    const systemPrompt = buildConversationAgentPrompt({ project, provider: 'codex', cliEntryPath, model: args.model });
    const codexToolCalls: Array<{ id: string; name: string }> = [];

    // One assistant chat bubble per Codex text item (agent_message / reasoning / error),
    // instead of merging the whole run into a single bubble. We lazily emit message-start
    // when the first delta for an item arrives, then text-delta for each subsequent delta,
    // and message-complete when the item finishes.
    interface CodexItemBubble {
      messageId: string;
      kind: 'agent_message' | 'reasoning' | 'error';
      text: string;
      started: boolean;
      completed: boolean;
    }
    const itemBubbles = new Map<string, CodexItemBubble>();
    const itemOrder: string[] = [];

    const result = await runCodexLoop(
      buildCodexAgentContext({
        conversationId: args.conversationId,
        projectPath: project?.displayPath ?? this.bridge.workspaceRoot,
        systemPrompt,
        model: args.model,
        latestUserMessage: args.userMessage,
        priorHistory: buildCondensedCodexHistory(storedMessages.slice(0, -1)),
      }),
      {
        maxIterations: 1,
        retryPolicy: DEFAULT_RETRY_POLICY,
        signal: args.signal,
        onTextItem: ({ itemId, kind, delta, finished }) => {
          let bubble = itemBubbles.get(itemId);
          if (bubble === undefined) {
            bubble = { messageId: randomUUID(), kind, text: '', started: false, completed: false };
            itemBubbles.set(itemId, bubble);
            itemOrder.push(itemId);
          }

          if (!bubble.started && (delta.length > 0 || finished)) {
            this.bridge.emit({
              type: 'message-start',
              conversationId: args.conversationId,
              messageId: bubble.messageId,
              role: 'assistant',
              createdAt: new Date().toISOString(),
            });
            bubble.started = true;
          }

          if (delta.length > 0) {
            bubble.text += delta;
            this.bridge.emit({
              type: 'text-delta',
              conversationId: args.conversationId,
              messageId: bubble.messageId,
              delta,
            });
          }

          if (finished && !bubble.completed) {
            bubble.completed = true;
            this.bridge.emit({
              type: 'message-complete',
              conversationId: args.conversationId,
              messageId: bubble.messageId,
              fullText: bubble.text,
              contentBlocks: [{ type: 'text', text: bubble.text }],
              completedAt: new Date().toISOString(),
            });
          }
        },
        onToolCall: (call) => {
          const toolCallId = randomUUID();
          codexToolCalls.push({ id: toolCallId, name: call.name });
          this.bridge.emit({
            type: 'tool-call',
            conversationId: args.conversationId,
            toolCallId,
            toolName: call.name,
            input: call.input,
          });
          // LangSmith tracing is handled automatically via env vars — no manual wrap needed.
        },
        onTokens: (tokens) => {
          this.bridge.emit({
            type: 'tokens',
            conversationId: args.conversationId,
            input: tokens.input,
            output: tokens.output,
            cached: tokens.cached,
          });
        },
      },
    );

    for (const toolCall of codexToolCalls) {
      this.bridge.emit({
        type: 'tool-result',
        conversationId: args.conversationId,
        toolCallId: toolCall.id,
        success: result.success,
        output: {
          ok: result.success,
          message: result.success
            ? `Codex completed ${toolCall.name}.`
            : `Codex ended with an error while running ${toolCall.name}.`,
        },
      });
    }

    const completionNotice = buildCodexTaskNotice({
      userMessage: args.userMessage,
      success: result.success,
      summary: result.summary,
    });
    if (completionNotice !== null) {
      this.bridge.emit({
        type: 'notice',
        conversationId: args.conversationId,
        message: completionNotice,
      });
    }

    if (!result.success) {
      throw new Error(result.summary);
    }

    // Close out any text item that was started but never completed (defensive — ordinarily
    // every item.started has a matching item.completed). The bubble would otherwise stay in
    // 'streaming' state in the UI.
    for (const itemId of itemOrder) {
      const bubble = itemBubbles.get(itemId);
      if (bubble === undefined || bubble.completed) {
        continue;
      }
      bubble.completed = true;
      this.bridge.emit({
        type: 'message-complete',
        conversationId: args.conversationId,
        messageId: bubble.messageId,
        fullText: bubble.text,
        contentBlocks: [{ type: 'text', text: bubble.text }],
        completedAt: new Date().toISOString(),
      });
    }

    // Persist one DB content block per text item, so reloading the conversation re-renders
    // the same set of bubbles. If Codex emitted no text items at all (e.g. tool-only turn),
    // fall back to the run summary so the conversation still has a record.
    const persistedBlocks: Array<{ type: 'text'; text: string }> = itemOrder
      .map((id) => itemBubbles.get(id))
      .filter((bubble): bubble is CodexItemBubble => bubble !== undefined && bubble.text.length > 0)
      .map((bubble) => ({ type: 'text' as const, text: bubble.text }));

    if (persistedBlocks.length === 0) {
      persistedBlocks.push({ type: 'text', text: result.summary });
      // Also surface the summary as a chat bubble so the user sees something.
      const fallbackMessageId = randomUUID();
      this.bridge.emit({
        type: 'message-start',
        conversationId: args.conversationId,
        messageId: fallbackMessageId,
        role: 'assistant',
        createdAt: new Date().toISOString(),
      });
      this.bridge.emit({
        type: 'message-complete',
        conversationId: args.conversationId,
        messageId: fallbackMessageId,
        fullText: result.summary,
        contentBlocks: [{ type: 'text', text: result.summary }],
        completedAt: new Date().toISOString(),
      });
    }

    // Token tracking (LangSmith auto-traces via env vars set by applyLangSmithEnv)
    await this.bridge.addConversationTokens({
      conversationId: args.conversationId,
      inputTokens: result.tokensUsed.input,
      outputTokens: result.tokensUsed.output,
      cachedTokens: result.tokensUsed.cached,
    });
    await this.bridge.createMessage({
      conversationId: args.conversationId,
      role: 'assistant',
      contentBlocks: persistedBlocks,
    });
    this.bridge.emit({
      type: 'done',
      conversationId: args.conversationId,
    });
  }

  /**
   * Run an implement_task request directly through the in-process structured tool, bypassing
   * the chat LLM entirely. Used by the Codex chat fast-path so we never depend on a CLI
   * subprocess (Windows EPERM) or on the LLM correctly constructing a wrapper command.
   *
   * Streams the same set of events a normal LLM-driven tool call would produce, so the UI
   * renders identically.
   */
  private async runStructuredImplementTask(args: {
    conversationId: string;
    projectId: string;
    taskId: string;
    model: string;
    signal: AbortSignal;
  }): Promise<{ success: boolean; summary: string }> {
    const tool = this.tools.find((candidate) => candidate.name === 'implement_task');
    if (tool === undefined) {
      throw new Error('implement_task tool is not registered.');
    }

    const messageId = randomUUID();
    const toolCallId = randomUUID();
    const toolInput = { projectId: args.projectId, taskId: args.taskId, model: args.model };

    this.bridge.emit({
      type: 'message-start',
      conversationId: args.conversationId,
      messageId,
      role: 'assistant',
      createdAt: new Date().toISOString(),
    });

    this.bridge.emit({
      type: 'tool-call',
      conversationId: args.conversationId,
      toolCallId,
      toolName: 'implement_task',
      input: toolInput,
    });

    const ctx = buildToolExecutionContext({
      conversationId: args.conversationId,
      projectId: args.projectId,
      toolCallId,
      signal: args.signal,
      bridge: {
        workspaceRoot: this.bridge.workspaceRoot,
        emit: (event) => this.bridge.emit(event),
        getProject: (projectId) => this.bridge.getProject(projectId),
        upsertProject: (toolArgs) => this.bridge.upsertProject(toolArgs),
        getTaskPlan: (projectId) => this.bridge.getTaskPlan(projectId),
        upsertTaskPlan: (toolArgs) => this.bridge.upsertTaskPlan(toolArgs),
        launchGodot: (toolArgs) => this.bridge.launchGodot(toolArgs),
        stopGodot: (toolArgs) => this.bridge.stopGodot(toolArgs),
        getAnthropicApiKey: () => this.bridge.getApiKey('anthropic'),
      },
    });

    let summaryText: string;
    let success = false;

    try {
      const result = await tool.execute(toolInput, ctx) as { success: boolean; summary: string };
      success = result.success === true;
      summaryText = success
        ? `Task \`${args.taskId}\` completed.\n\n${result.summary}`
        : `Task \`${args.taskId}\` failed.\n\n${result.summary}`;

      this.bridge.emit({
        type: 'tool-result',
        conversationId: args.conversationId,
        toolCallId,
        success,
        output: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summaryText = `Task \`${args.taskId}\` crashed before completion: ${message}`;
      this.bridge.emit({
        type: 'tool-result',
        conversationId: args.conversationId,
        toolCallId,
        success: false,
        output: { error: message },
      });
    }

    await this.bridge.createMessage({
      conversationId: args.conversationId,
      role: 'assistant',
      contentBlocks: [{ type: 'text', text: summaryText }],
    });

    this.bridge.emit({
      type: 'message-complete',
      conversationId: args.conversationId,
      messageId,
      fullText: summaryText,
      completedAt: new Date().toISOString(),
    });

    return { success, summary: summaryText };
  }

  /**
   * Run a batch of implement_task requests sequentially in-process. Each task gets its own
   * message-start/tool-call/tool-result/message-complete event sequence so the UI renders one
   * card per task. A single `done` event is emitted at the end of the batch — emitting `done`
   * per-task would confuse the UI's "is this turn over?" tracking.
   *
   * Failures do not abort the batch: subsequent tasks still run so the user sees all results
   * in one go. Cancellation via signal does abort cleanly between tasks.
   */
  private async runStructuredImplementTaskBatch(args: {
    conversationId: string;
    projectId: string;
    taskIds: string[];
    model: string;
    signal: AbortSignal;
  }): Promise<void> {
    for (const taskId of args.taskIds) {
      if (args.signal.aborted) {
        break;
      }
      try {
        await this.runStructuredImplementTask({
          conversationId: args.conversationId,
          projectId: args.projectId,
          taskId,
          model: args.model,
          signal: args.signal,
        });
      } catch (err) {
        this.log(`runStructuredImplementTaskBatch: task ${taskId} threw`, err);
        // Continue to the next task — the per-task method already emitted a tool-result with
        // success=false in this case, so the UI is informed.
      }
    }

    this.bridge.emit({
      type: 'done',
      conversationId: args.conversationId,
    });
  }

  /**
   * Run a plan_iteration request directly through the in-process structured tool. Used by the
   * Codex fast-path so iteration planning works regardless of which provider is selected — the
   * underlying planner is Anthropic-only today, and going through the tool keeps the UI events
   * identical to a normal LLM-driven tool call.
   */
  private async runStructuredPlanIteration(args: {
    conversationId: string;
    projectId: string;
    type: 'bug' | 'feature';
    description: string;
    label?: string;
    model: string;
    signal: AbortSignal;
  }): Promise<void> {
    const tool = this.tools.find((candidate) => candidate.name === 'plan_iteration');
    if (tool === undefined) {
      throw new Error('plan_iteration tool is not registered.');
    }

    const messageId = randomUUID();
    const toolCallId = randomUUID();
    const toolInput: Record<string, unknown> = {
      projectId: args.projectId,
      type: args.type,
      description: args.description,
    };
    if (args.label !== undefined) toolInput['label'] = args.label;

    this.bridge.emit({
      type: 'message-start',
      conversationId: args.conversationId,
      messageId,
      role: 'assistant',
      createdAt: new Date().toISOString(),
    });

    this.bridge.emit({
      type: 'tool-call',
      conversationId: args.conversationId,
      toolCallId,
      toolName: 'plan_iteration',
      input: toolInput,
    });

    const ctx = buildToolExecutionContext({
      conversationId: args.conversationId,
      projectId: args.projectId,
      toolCallId,
      signal: args.signal,
      bridge: {
        workspaceRoot: this.bridge.workspaceRoot,
        emit: (event) => this.bridge.emit(event),
        getProject: (projectId) => this.bridge.getProject(projectId),
        upsertProject: (toolArgs) => this.bridge.upsertProject(toolArgs),
        getTaskPlan: (projectId) => this.bridge.getTaskPlan(projectId),
        upsertTaskPlan: (toolArgs) => this.bridge.upsertTaskPlan(toolArgs),
        launchGodot: (toolArgs) => this.bridge.launchGodot(toolArgs),
        stopGodot: (toolArgs) => this.bridge.stopGodot(toolArgs),
        getAnthropicApiKey: () => this.bridge.getApiKey('anthropic'),
      },
    });

    let summaryText: string;
    let success = false;

    try {
      const result = (await tool.execute(toolInput, ctx)) as {
        ok: boolean;
        phase: number;
        label: string;
        taskIds: string[];
        taskCount: number;
      };
      success = result.ok === true;
      const verb = args.type === 'bug' ? 'Filed bug' : 'Queued feature';
      summaryText = success
        ? `${verb} in phase ${result.phase} ("${result.label}"). ${result.taskCount} task(s) ready: ${result.taskIds
            .map((id) => `\`${id}\``)
            .join(', ')}.`
        : `Failed to plan iteration.`;

      this.bridge.emit({
        type: 'tool-result',
        conversationId: args.conversationId,
        toolCallId,
        success,
        output: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summaryText = `Failed to plan iteration: ${message}`;
      this.bridge.emit({
        type: 'tool-result',
        conversationId: args.conversationId,
        toolCallId,
        success: false,
        output: { error: message },
      });
    }

    await this.bridge.createMessage({
      conversationId: args.conversationId,
      role: 'assistant',
      contentBlocks: [{ type: 'text', text: summaryText }],
    });

    this.bridge.emit({
      type: 'message-complete',
      conversationId: args.conversationId,
      messageId,
      fullText: summaryText,
      completedAt: new Date().toISOString(),
    });

    this.bridge.emit({
      type: 'done',
      conversationId: args.conversationId,
    });
  }

  /**
   * Map a demonstrative reference ("this", "that", "those tasks") back to plan task ids using a
   * fast LLM call. We feed it the recent transcript (with tool-use/tool-result content
   * preserved by the new {@link extractTranscriptContent}) and the set of valid plan ids, and
   * ask for a strict JSON `{taskIds: string[]}` response. Any id not in `validIds` is dropped.
   *
   * Returns an empty array on any failure (parse error, network error, abort, no Anthropic key
   * available). Caller falls back to free-form Codex chat in that case.
   */
  private async resolveTaskReferences(args: {
    userMessage: string;
    validIds: ReadonlySet<string>;
    priorMessages: DbMessageRecord[];
    signal: AbortSignal;
  }): Promise<string[]> {
    const apiKey = await this.bridge.getApiKey('anthropic');
    if (apiKey === null) {
      return [];
    }

    const transcript = buildCondensedCodexHistory(args.priorMessages, {
      tokenBudget: 4000,
      minMessages: 6,
      maxMessages: 30,
    });
    const ids = Array.from(args.validIds);

    const system =
      'You map a user message that uses a demonstrative reference ("this", "that", "those", "these", "it") to plan task ids. ' +
      'Reply with strict JSON of the shape {"taskIds": string[]} and nothing else. ' +
      'Use only ids from the supplied list. Return an empty array if the reference is unclear or does not point at one or more plan tasks.';
    const user = [
      `Valid plan task ids: ${JSON.stringify(ids)}`,
      '',
      'Recent conversation:',
      transcript.length > 0 ? transcript : '[no prior context]',
      '',
      `User's latest message: ${args.userMessage}`,
    ].join('\n');

    try {
      const { ChatAnthropic } = await import('@langchain/anthropic');
      const model = new ChatAnthropic({
        model: 'claude-haiku-4-5',
        maxTokens: 256,
        temperature: 0,
        apiKey,
      });
      const response = await model.invoke(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { signal: args.signal },
      );
      const text =
        typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .filter((b) => typeof b === 'object' && (b as { type?: string }).type === 'text')
                .map((b) => (b as { text?: string }).text ?? '')
                .join('')
            : '';

      const match = /\{[\s\S]*\}/.exec(text);
      if (match === null) {
        return [];
      }
      const parsed = JSON.parse(match[0]) as { taskIds?: unknown };
      if (!Array.isArray(parsed.taskIds)) {
        return [];
      }
      return parsed.taskIds.filter(
        (id): id is string => typeof id === 'string' && args.validIds.has(id),
      );
    } catch (err) {
      this.log('resolveTaskReferences: LLM call failed', err);
      return [];
    }
  }
}

/**
 * Returns true when the message contains a demonstrative pronoun likely to refer to prior
 * conversation context. Used to gate the slower {@link ConversationAgent.resolveTaskReferences}
 * LLM call so we only pay for it when ambiguity is plausible.
 */
function messageHasDemonstrative(message: string): boolean {
  return /\b(this|that|these|those|it)\b/i.test(message);
}

/**
 * Extract task ids the user wants implemented from a chat message. Returns an empty array if
 * the message is not a task-implementation request.
 *
 * Heuristic: the message must contain both "implement" and "task" (case-insensitive). When it
 * does, we extract every kebab-case identifier (≥ 1 hyphen, e.g. `wire-combat-scene-card-play`)
 * that appears in the message. If `validIds` is provided, we filter to ids that are real tasks
 * in the current plan — this is the common case from the conversation-agent caller and avoids
 * false positives on identifier-shaped phrases like `try-this-thing` in free-form prose.
 *
 * Examples that match:
 *   "implement task wire-combat-scene-card-play"
 *   "Please implement task A: ..."
 *   "implement these tasks: a, b, c"
 *   bullet-list of ids under "implement task <id>" intro line
 *
 * Examples that do not match:
 *   "edit this file foo-bar-baz" — no "implement" + "task"
 *   "implement task <id>" — `<id>` is the literal placeholder string, not kebab-case
 */
export function parseImplementTaskIntents(message: string, validIds?: ReadonlySet<string>): string[] {
  if (!/\bimplement/i.test(message) || !/\btasks?\b/i.test(message)) {
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  // Kebab-case: starts with letter, has at least one hyphen, segments are lowercase alphanumeric.
  const idPattern = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/g;
  for (const match of message.toLowerCase().matchAll(idPattern)) {
    const id = match[1];
    if (id === undefined || seen.has(id)) {
      continue;
    }
    if (validIds !== undefined && !validIds.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Parse an iteration request from a chat message. Returns `null` when the message is not a
 * structured iteration request — the caller then falls back to free-form chat.
 *
 * Recognised triggers (case-insensitive, must start the message after optional whitespace):
 *   "bug: <description>"
 *   "feature: <description>"
 *   "feat: <description>"
 *   "file as bug: <description>"
 *   "file bug: <description>"
 *   "add feature: <description>"
 *   "request feature: <description>"
 *
 * Prefix-only matching (no natural-language inference) keeps this conservative — same shape
 * as {@link parseImplementTaskIntents}. The eval-suggestion banner injects messages using the
 * `bug: ` prefix so its CTA flows through the same code path.
 */
export function parseIterationIntent(
  message: string,
): { type: 'bug' | 'feature'; description: string } | null {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const bugPattern = /^(?:bug|file(?:\s+as)?\s+bug)\s*:\s*([\s\S]+)$/i;
  const featurePattern = /^(?:feature|feat|add\s+feature|request\s+feature)\s*:\s*([\s\S]+)$/i;

  const bugMatch = bugPattern.exec(trimmed);
  if (bugMatch !== null) {
    const description = bugMatch[1]?.trim() ?? '';
    if (description.length === 0) return null;
    return { type: 'bug', description };
  }

  const featureMatch = featurePattern.exec(trimmed);
  if (featureMatch !== null) {
    const description = featureMatch[1]?.trim() ?? '';
    if (description.length === 0) return null;
    return { type: 'feature', description };
  }

  return null;
}

/**
 * @deprecated Use {@link parseImplementTaskIntents} which returns all matched ids.
 * Retained for any external callers; returns the first match (if any) for backward compatibility.
 */
export function parseImplementTaskIntent(message: string, validIds?: ReadonlySet<string>): string | null {
  return parseImplementTaskIntents(message, validIds)[0] ?? null;
}

/**
 * Token-budgeted (rough chars/4 estimate) walk-back through prior messages. Replaces the old
 * fixed `slice(-6)` cap which dropped the original turn whenever the assistant emitted >5
 * intermediate narration bubbles in between, breaking referential phrases like "this into
 * harness tasks". Floors at `minMessages` so very short threads still get full context, and
 * hard-caps at `maxMessages` to bound worst-case prompt size.
 */
export function buildCondensedCodexHistory(
  messages: DbMessageRecord[],
  opts: { tokenBudget?: number; minMessages?: number; maxMessages?: number } = {},
): string {
  const tokenBudget = opts.tokenBudget ?? 6000;
  const minMessages = opts.minMessages ?? 10;
  const maxMessages = opts.maxMessages ?? 40;
  const charBudget = tokenBudget * 4;

  if (messages.length === 0) {
    return '';
  }

  const rendered: Array<{ label: string; content: string }> = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as DbMessageRecord;
    const content = extractTranscriptContent(message.contentBlocks as ClaudeContentBlock[]);
    const label =
      message.role === 'assistant' || message.role === 'system' || message.role === 'error'
        ? 'Assistant'
        : 'User';
    const segmentChars = label.length + 2 + content.length;

    if (rendered.length >= minMessages && chars + segmentChars > charBudget) {
      break;
    }
    rendered.push({ label, content });
    chars += segmentChars;

    if (rendered.length >= maxMessages) {
      break;
    }
  }

  return rendered
    .reverse()
    .map(({ label, content }) => `${label}: ${content}`)
    .join('\n\n');
}

/**
 * Extract a Codex-friendly text rendering of a stored message. Tool uses and tool results are
 * preserved (truncated) instead of being collapsed to opaque placeholders — without this, a
 * plan written via the `write_file` tool is invisible on the next turn and the model can't
 * resolve referential phrases like "this".
 */
export function extractTranscriptContent(blocks: ClaudeContentBlock[]): string {
  const parts = blocks.flatMap((block) => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
      return [block.text.trim()];
    }
    if (block.type === 'tool_use' && block.name !== undefined) {
      const args = block.input === undefined ? '' : JSON.stringify(block.input);
      const argsTrunc = args.length > 500 ? `${args.slice(0, 500)}…` : args;
      return [`[tool use: ${block.name}(${argsTrunc})]`];
    }
    if (block.type === 'tool_result') {
      const raw =
        typeof block.content === 'string'
          ? block.content
          : block.content === undefined
            ? ''
            : JSON.stringify(block.content);
      const trunc = raw.length > 1500 ? `${raw.slice(0, 1500)}…` : raw;
      return [`[tool result: ${trunc}]`];
    }
    return [];
  });

  return parts.join('\n').trim() || '[no text content]';
}

function buildCodexAgentContext(args: {
  conversationId: string;
  projectPath: string;
  systemPrompt: string;
  model: string;
  latestUserMessage: string;
  priorHistory: string;
}): AgentContext {
  const task: TaskState = {
    id: `studio-${args.conversationId}`,
    phase: 1,
    role: 'gameplay',
    status: 'in-progress',
    title: 'Studio conversation turn',
    description: [
      'Continue this Harness Studio conversation.',
      'Respect prior context, make workspace changes when needed, and answer the latest user request directly.',
    ].join('\n'),
    brief: args.latestUserMessage,
    acceptanceCriteria: [
      'Respond to the latest user request.',
      'Carry forward relevant prior conversation context.',
      'Make necessary workspace changes directly when appropriate.',
    ],
    dependencies: [],
    toolsAllowed: [],
    retries: 0,
    maxRetries: 0,
    context: {
      projectPath: args.projectPath,
      gameSpec:
        args.priorHistory.trim().length > 0
          ? ['Recent conversation history:', args.priorHistory].join('\n\n')
          : '',
      relevantFiles: [],
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    config: {
      role: 'gameplay',
      model: args.model,
      maxTokens: 16_384,
      temperature: 0,
      systemPrompt: args.systemPrompt,
      toolGroups: [],
      memoryScope: 'project',
      permissions: { allowed: [], denied: [] },
    },
    task,
    memory: [],
    conversationHistory: [],
    traceId: randomUUID(),
    iterationCount: 0,
    tokenBudget: 0,
    tokenUsed: 0,
  };
}
