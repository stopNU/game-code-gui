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
import { AnthropicProvider, OpenAIProvider, type LLMProvider } from './llm-provider.js';
import { buildToolExecutionContext, createStudioTools, summarizeToolResult } from './tool-registry.js';
import { applyLangSmithEnv } from './langsmith/env.js';
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

function getToolRiskLevel(toolName: string): ToolRiskLevel {
  if (toolName === 'read_task_plan' || toolName === 'launch_game' || toolName === 'plan_game') {
    return toolName === 'read_task_plan' ? 'low' : 'medium';
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
    const initialMessages = await this.bridge.listMessages(args.conversationId);
    const initialHistory = initialMessages.map(toClaudeMessage);

    const provider = this.createProvider(args.provider);
    const startedAt = Date.now();
    let toolCallCount = 0;

    while (!args.signal.aborted) {
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        this.bridge.emit({
          type: 'cap-exceeded',
          conversationId: args.conversationId,
          cap: 'wall-clock',
        });
        return;
      }

      if (toolCallCount > 50) {
        this.bridge.emit({
          type: 'cap-exceeded',
          conversationId: args.conversationId,
          cap: 'tool-calls',
        });
        return;
      }

      const storedMessages = await this.bridge.listMessages(args.conversationId);
      const history = storedMessages.map(toClaudeMessage);
      const messageId = randomUUID();
      let streamedText = '';

      this.bridge.emit({
        type: 'message-start',
        conversationId: args.conversationId,
        messageId,
        role: 'assistant',
        createdAt: new Date().toISOString(),
      });

      const llmResult = await provider.streamMessage({
        messages: history.map((message) =>
          message.role === 'user' ? message : { ...message, content: truncateToolResultBlocks(message.content as ClaudeContentBlock[]) },
        ),
        tools: this.tools,
        system: buildConversationAgentPrompt({ project, provider: args.provider, cliEntryPath, model: args.model }),
        model: args.model,
        signal: args.signal,
        onEvent: (event) => {
          if (event.type === 'text-delta') {
            streamedText += event.delta;
            this.bridge.emit({
              type: 'text-delta',
              conversationId: args.conversationId,
              messageId,
              delta: event.delta,
            });
            return;
          }

          this.bridge.emit({
            type: 'retrying',
            conversationId: args.conversationId,
            attempt: event.attempt,
            reason: event.reason,
          });
        },
      });

      await this.bridge.addConversationTokens({
        conversationId: args.conversationId,
        inputTokens: llmResult.tokens.input,
        outputTokens: llmResult.tokens.output,
        cachedTokens: llmResult.tokens.cached,
      });
      this.bridge.emit({
        type: 'tokens',
        conversationId: args.conversationId,
        input: llmResult.tokens.input,
        output: llmResult.tokens.output,
        cached: llmResult.tokens.cached,
      });

      await this.bridge.createMessage({
        conversationId: args.conversationId,
        role: 'assistant',
        contentBlocks: llmResult.message.content as unknown[],
      });
      this.bridge.emit({
        type: 'message-complete',
        conversationId: args.conversationId,
        messageId,
        fullText: streamedText.length > 0 ? streamedText : getTextFromContent(llmResult.message.content),
        completedAt: new Date().toISOString(),
      });

      const toolBlocks = (llmResult.message.content as ClaudeContentBlock[]).filter((block) => block.type === 'tool_use');
      if (toolBlocks.length === 0) {
        this.bridge.emit({
          type: 'done',
          conversationId: args.conversationId,
        });
        return;
      }

      for (const block of toolBlocks) {
        if (block.id === undefined || block.name === undefined || block.input === undefined) {
          continue;
        }

        toolCallCount += 1;
        const tool = this.tools.find((candidate) => candidate.name === block.name);
        if (tool === undefined) {
          throw new Error(`Unknown Studio tool "${block.name}".`);
        }

        this.bridge.emit({
          type: 'tool-call',
          conversationId: args.conversationId,
          toolCallId: block.id,
          toolName: block.name,
          input: block.input,
        });

        const approvalDecision = await this.approvalGate.ensureApproved({
          conversationId: args.conversationId,
          toolCallId: block.id,
          toolName: block.name,
          input: block.input,
          ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
          riskLevel: getToolRiskLevel(block.name),
          rationale: `This tool can modify code, generate a project, or launch external processes.`,
          signal: args.signal,
        });
        if (approvalDecision !== 'approved') {
          const output = {
            ok: false,
            message: `Tool ${block.name} was ${approvalDecision}.`,
          };
          await this.bridge.createMessage({
            conversationId: args.conversationId,
            role: 'user',
            contentBlocks: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(output),
              },
            ],
          });
          this.bridge.emit({
            type: 'tool-result',
            conversationId: args.conversationId,
            toolCallId: block.id,
            success: false,
            output,
          });
          continue;
        }

        let toolOutput: unknown;
        let toolSuccess = true;

        try {
          toolOutput = await tool.execute(
            block.input,
            buildToolExecutionContext({
              conversationId: args.conversationId,
              ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
              ...(project?.displayPath !== undefined ? { projectPath: project.displayPath } : {}),
              toolCallId: block.id as string,
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
            }),
          );
        } catch (error) {
          toolSuccess = false;
          toolOutput = { ok: false, error: String(error) };
        }

        await this.bridge.createMessage({
          conversationId: args.conversationId,
          role: 'user',
          contentBlocks: [
            {
              type: 'tool_result',
              tool_use_id: block.id,
              content: summarizeToolResult(toolOutput),
            },
          ],
        });
        this.bridge.emit({
          type: 'tool-result',
          conversationId: args.conversationId,
          toolCallId: block.id,
          success: toolSuccess,
          output: toolOutput,
        });
      }
    }
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
    const storedMessages = await this.bridge.listMessages(args.conversationId);
    const cliEntryPath = resolvePath(this.bridge.workspaceRoot, 'apps/cli/bin/game-harness.js');
    const systemPrompt = buildConversationAgentPrompt({ project, provider: 'codex', cliEntryPath, model: args.model });
    const messageId = randomUUID();
    let streamedText = '';
    const codexToolCalls: Array<{ id: string; name: string }> = [];

    this.bridge.emit({
      type: 'message-start',
      conversationId: args.conversationId,
      messageId,
      role: 'assistant',
      createdAt: new Date().toISOString(),
    });

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
        onText: (delta) => {
          streamedText += delta;
          this.bridge.emit({
            type: 'text-delta',
            conversationId: args.conversationId,
            messageId,
            delta,
          });
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

    const finalText = streamedText.trim().length > 0 ? streamedText : result.summary;
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
      contentBlocks: [{ type: 'text', text: finalText }],
    });
    this.bridge.emit({
      type: 'message-complete',
      conversationId: args.conversationId,
      messageId,
      fullText: finalText,
      completedAt: new Date().toISOString(),
    });
    this.bridge.emit({
      type: 'done',
      conversationId: args.conversationId,
    });
  }
}

function buildCondensedCodexHistory(messages: DbMessageRecord[], limit = 6): string {
  const tail = messages.slice(-limit);
  if (tail.length === 0) {
    return '';
  }

  return tail
    .map((message) => {
      const content = extractTranscriptContent(message.contentBlocks as ClaudeContentBlock[]);
      const label = message.role === 'assistant' || message.role === 'system' || message.role === 'error' ? 'Assistant' : 'User';
      return `${label}: ${content}`;
    })
    .join('\n\n');
}

function extractTranscriptContent(blocks: ClaudeContentBlock[]): string {
  const parts = blocks.flatMap((block) => {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
      return [block.text.trim()];
    }
    if (block.type === 'tool_use' && block.name !== undefined) {
      return [`[tool use: ${block.name}]`];
    }
    if (block.type === 'tool_result') {
      return ['[tool result]'];
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
