import { randomUUID } from 'crypto';
import { MessageChannelMain, type MessagePortMain, utilityProcess, type UtilityProcess } from 'electron';
import type { BrowserWindow } from 'electron';
import type { AgentCommand, AgentDbRequest, AgentPortMessage, StreamEvent } from '../../shared/protocol.js';
import type { StudioDatabase } from '../db/index.js';
import type { GodotManager } from './godot-manager.js';
import type { SettingsService } from './settings-service.js';
import type { StudioLoggerService } from './studio-logger.js';

function createSessionId(): string {
  return `studio-${randomUUID()}`;
}

export class SessionManager {
  private readonly utilityEntryPath: string;
  private readonly browserWindow: BrowserWindow;
  private readonly database: StudioDatabase;
  private readonly godotManager: GodotManager;
  private readonly settingsService: SettingsService;
  private readonly logger: StudioLoggerService;
  private child: UtilityProcess | null = null;
  private utilityPort: MessagePortMain | null = null;
  private rendererPort: MessagePortMain | null = null;
  private rendererPortTransferPending = true;
  private sessionId = createSessionId();
  private lastConversationId: string | null = null;

  public constructor(
    browserWindow: BrowserWindow,
    utilityEntryPath: string,
    database: StudioDatabase,
    godotManager: GodotManager,
    settingsService: SettingsService,
    logger: StudioLoggerService,
  ) {
    this.browserWindow = browserWindow;
    this.utilityEntryPath = utilityEntryPath;
    this.database = database;
    this.godotManager = godotManager;
    this.settingsService = settingsService;
    this.logger = logger;
  }

  public async start(): Promise<void> {
    this.logger.child({ process: 'main', service: 'session-manager' }).info('Starting studio session manager.');
    // Abort any approvals left pending from a previous app session
    this.database.approvals.abortPending();
    this.emitToRenderer({
      type: 'session-state',
      status: 'starting',
      detail: 'Booting isolated agent process.',
    });
    this.spawnChild();
  }

  public attachRenderer(): void {
    const channel = new MessageChannelMain();
    this.rendererPort = channel.port1;
    this.rendererPort.start();
    this.rendererPortTransferPending = false;
    this.browserWindow.webContents.postMessage('studio:port', null, [channel.port2]);
    this.emitToRenderer({
      type: 'session-ready',
      sessionId: this.sessionId,
    });
  }

  public sendCommand(command: AgentCommand): void {
    if (command.type === 'send' || command.type === 'abort') {
      this.lastConversationId = command.conversationId;
    }
    this.utilityPort?.postMessage({
      type: 'command',
      command,
    });
  }

  public handleApprovalDecision(
    approvalId: string,
    decision: 'approved' | 'denied' | 'timeout' | 'aborted',
    scope?: 'once' | 'conversation' | 'project',
  ): void {
    this.utilityPort?.postMessage({
      type: 'approval-decision',
      approvalId,
      decision,
      ...(scope !== undefined ? { scope } : {}),
    });
  }

  public emitStreamEvent(event: StreamEvent): void {
    this.emitToRenderer(event);
  }

  private spawnChild(): void {
    const child = utilityProcess.fork(this.utilityEntryPath, [], {
      serviceName: 'harness-studio-agent',
    });
    this.child = child;

    const channel = new MessageChannelMain();
    this.utilityPort = channel.port1;
    this.utilityPort.start();
    this.utilityPort.on('message', (event) => {
      const payload = event.data as AgentPortMessage;
      if (payload.type === 'utility-message') {
        if (payload.payload.type === 'stream-event') {
          this.emitToRenderer(payload.payload.event);
          return;
        }

        if (payload.payload.type === 'log-line') {
          this.logger.writeRawLine(payload.payload.line);
          return;
        }

        void this.handleDbRequest(payload.payload.requestId, payload.payload.request);
      }
    });

    child.postMessage({ type: 'connect' }, [channel.port2]);
    child.on('exit', (code) => {
      this.logger
        .child({ process: 'main', service: 'session-manager' })
        .warn({ exitCode: code ?? null }, 'Agent utility process exited; restarting session.');
      this.database.approvals.abortPending(this.lastConversationId ?? undefined);
      this.emitToRenderer({
        type: 'error',
        message: `Agent session exited with code ${code ?? 'unknown'}. Restarting isolated process.`,
      });
      this.emitToRenderer({
        type: 'session-state',
        status: 'restarting',
        detail: 'Restarting isolated agent process after exit.',
      });
      this.child = null;
      this.utilityPort = null;
      this.sessionId = createSessionId();
      this.spawnChild();
      this.emitToRenderer({
        type: 'session-ready',
        sessionId: this.sessionId,
      });
    });
  }

  private emitToRenderer(event: StreamEvent): void {
    if (this.rendererPortTransferPending) {
      return;
    }

    this.rendererPort?.postMessage(event);
  }

  private async handleDbRequest(requestId: string, request: AgentDbRequest): Promise<void> {
    try {
      const result = await this.dispatchDbRequest(request);
      this.utilityPort?.postMessage({
        type: 'db-response',
        requestId,
        success: true,
        result,
      } satisfies AgentPortMessage);
    } catch (error) {
      this.utilityPort?.postMessage({
        type: 'db-response',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies AgentPortMessage);
    }
  }

  private async dispatchDbRequest(request: AgentDbRequest): Promise<unknown> {
    switch (request.action) {
      case 'ensure-conversation': {
        const conversation = this.database.conversations.ensure({
          id: request.conversationId,
          ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
          title: request.title,
          model: request.model,
          provider: request.provider,
        });
        return {
          id: conversation.id,
          projectId: conversation.projectId,
          title: conversation.title,
          ...(conversation.model !== null ? { model: conversation.model } : {}),
          provider: conversation.provider,
        };
      }
      case 'get-conversation':
        return this.database.conversations.getById(request.conversationId);
      case 'list-messages':
        return this.database.conversations.getMessages(request.conversationId).map((message) => ({
          id: message.id,
          conversationId: message.conversationId,
          seq: message.seq,
          role: message.role,
          contentBlocks: message.contentBlocks,
          createdAt: new Date(message.createdAt).toISOString(),
        }));
      case 'create-message': {
        const message = this.database.conversations.createMessage({
          conversationId: request.conversationId,
          role: request.role,
          contentBlocks: request.contentBlocks,
          ...(request.langsmithRunId !== undefined ? { langsmithRunId: request.langsmithRunId } : {}),
        });
        return {
          id: message.id,
          conversationId: message.conversationId,
          seq: message.seq,
          role: message.role,
          contentBlocks: message.contentBlocks,
          createdAt: new Date(message.createdAt).toISOString(),
        };
      }
      case 'add-conversation-tokens':
        return this.database.conversationTokens.add({
          conversationId: request.conversationId,
          inputTokens: request.inputTokens,
          outputTokens: request.outputTokens,
          cachedTokens: request.cachedTokens,
        });
      case 'get-project':
        return this.database.projects.getById(request.projectId);
      case 'upsert-project':
        return this.database.projects.upsert({
          normalizedPath: request.normalizedPath,
          displayPath: request.displayPath,
          ...(request.title !== undefined ? { title: request.title } : {}),
        });
      case 'get-task-plan':
        return this.database.taskPlans.getByProjectId(request.projectId);
      case 'upsert-task-plan':
        return this.database.taskPlans.upsert({
          projectId: request.projectId,
          planJson: request.planJson,
        });
      case 'create-approval':
        return this.database.approvals.create({
          id: randomUUID(),
          conversationId: request.conversationId,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          args: request.args,
          argsHash: request.argsHash,
          ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
          riskLevel: request.riskLevel,
          rationale: request.rationale,
        });
      case 'find-approval-decision':
        return this.database.approvals.findReusableDecision({
          conversationId: request.conversationId,
          toolName: request.toolName,
          argsHash: request.argsHash,
          ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
        });
      case 'resolve-approval':
        return this.database.approvals.decide({
          id: request.approvalId,
          status: request.status,
          ...(request.scope !== undefined ? { scope: request.scope } : {}),
          decidedBy: request.decidedBy ?? 'studio',
        });
      case 'abort-pending-approvals':
        this.database.approvals.abortPending(request.conversationId);
        return { ok: true };
      case 'get-api-key':
        return this.settingsService.getApiKey(request.provider);
      case 'get-claude-code-token':
        return this.settingsService.getClaudeCodeToken();
      case 'get-langsmith-config':
        return this.settingsService.getLangSmithRuntimeConfig();
      case 'launch-godot':
        return await this.godotManager.launch({
          projectPath: request.projectPath,
          launchedBy: request.launchedBy,
          ...(request.ownerConversationId !== undefined ? { ownerConversationId: request.ownerConversationId } : {}),
        });
      case 'stop-godot':
        return await this.godotManager.stop({
          requester: request.requester,
          ...(request.ownerConversationId !== undefined ? { ownerConversationId: request.ownerConversationId } : {}),
          ...(request.force !== undefined ? { force: request.force } : {}),
        });
      default:
        throw new Error(`Unhandled db request ${(request as { action: string }).action}.`);
    }
  }
}
