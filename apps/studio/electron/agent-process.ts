import { Writable } from 'stream';
import type { MessagePortMain } from 'electron';
import pino from 'pino';
import { ConversationAgent } from './agent/conversation-agent.js';
import type { AgentDbRequest, AgentPortMessage, MainDbResponseMessage, StreamEvent } from '../shared/protocol.js';

let port: MessagePortMain | null = null;
const pendingDbRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }
>();

class PortLogStream extends Writable {
  public override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      const line = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : Buffer.from(chunk, encoding).toString('utf8');
      port?.postMessage({
        type: 'utility-message',
        payload: {
          type: 'log-line',
          line,
        },
      } satisfies AgentPortMessage);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

const logger = pino(
  {
    level: process.env['NODE_ENV'] === 'development' ? 'debug' : 'info',
    base: {
      process: 'agent',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  new PortLogStream(),
);

function emit(event: StreamEvent): void {
  port?.postMessage({
    type: 'utility-message',
    payload: {
      type: 'stream-event',
      event,
    },
  } satisfies AgentPortMessage);
}

async function requestDb<T>(request: AgentDbRequest): Promise<T> {
  const currentPort = port;
  if (currentPort === null) {
    throw new Error('Agent port is not connected.');
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return await new Promise<T>((resolve, reject) => {
    pendingDbRequests.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    currentPort.postMessage({
      type: 'utility-message',
      payload: {
        type: 'db-request',
        requestId,
        request,
      },
    } satisfies AgentPortMessage);
  });
}

const agent = new ConversationAgent({
  workspaceRoot: process.cwd(),
  emit,
  ensureConversation: async (args) =>
    await requestDb<{
      id: string;
      projectId: string | null;
      title: string;
      model?: string;
      provider: 'anthropic' | 'openai' | 'codex';
    }>({
      action: 'ensure-conversation',
      conversationId: args.conversationId,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      title: args.title,
      provider: args.provider,
      model: args.model,
    }),
  listMessages: async (conversationId) =>
    await requestDb<
      Array<{
        id: string;
        conversationId: string;
        seq: number;
        role: 'user' | 'assistant' | 'system' | 'error';
        contentBlocks: unknown[];
        createdAt: string;
      }>
    >({
      action: 'list-messages',
      conversationId,
    }),
  createMessage: async (args) =>
    await requestDb<{
      id: string;
      conversationId: string;
      seq: number;
      role: 'user' | 'assistant' | 'system' | 'error';
      contentBlocks: unknown[];
      createdAt: string;
    }>({
      action: 'create-message',
      conversationId: args.conversationId,
      role: args.role,
      contentBlocks: args.contentBlocks,
    }),
  addConversationTokens: async (args) => {
    await requestDb({
      action: 'add-conversation-tokens',
      conversationId: args.conversationId,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cachedTokens: args.cachedTokens,
    });
  },
  getProject: async (projectId) =>
    await requestDb<{
      id: string;
      normalizedPath: string;
      displayPath: string;
      title: string | null;
    } | null>({
      action: 'get-project',
      projectId,
    }),
  getTaskPlan: async (projectId) =>
    await requestDb<{
      projectId: string;
      planJson: string;
      updatedAt: number;
    } | null>({
      action: 'get-task-plan',
      projectId,
    }),
  upsertProject: async (args) =>
    await requestDb<{
      id: string;
      displayPath: string;
      title: string | null;
    }>({
      action: 'upsert-project',
      normalizedPath: args.normalizedPath,
      displayPath: args.displayPath,
      ...(args.title !== undefined ? { title: args.title } : {}),
    }),
  upsertTaskPlan: async (args) => {
    await requestDb({
      action: 'upsert-task-plan',
      projectId: args.projectId,
      planJson: args.planJson,
    });
  },
  launchGodot: async (args) =>
    await requestDb({
      action: 'launch-godot',
      projectPath: args.projectPath,
      launchedBy: 'agent',
      ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
    }),
  stopGodot: async (args) =>
    await requestDb({
      action: 'stop-godot',
      requester: 'agent',
      ...(args.ownerConversationId !== undefined ? { ownerConversationId: args.ownerConversationId } : {}),
      ...(args.force !== undefined ? { force: args.force } : {}),
    }),
  getApiKey: async (provider) =>
    await requestDb<string | null>({
      action: 'get-api-key',
      provider,
    }),
  getLangSmithConfig: async () =>
    await requestDb<{
      enabled: boolean;
      apiKey: string | null;
      projectName: string;
      endpoint: string | null;
    }>({ action: 'get-langsmith-config' }),
  createApproval: async (args) =>
    await requestDb<{
      id: string;
      status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
    }>({
      action: 'create-approval',
      conversationId: args.conversationId,
      toolCallId: args.toolCallId,
      toolName: args.toolName,
      args: args.args,
      argsHash: args.argsHash,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
      riskLevel: args.riskLevel,
      rationale: args.rationale,
    }),
  findApprovalDecision: async (args) =>
    await requestDb<{
      id: string;
      status: 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
    } | null>({
      action: 'find-approval-decision',
      conversationId: args.conversationId,
      toolName: args.toolName,
      argsHash: args.argsHash,
      ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    }),
  resolveApproval: async (args) => {
    await requestDb({
      action: 'resolve-approval',
      approvalId: args.approvalId,
      status: args.status,
      ...(args.scope !== undefined ? { scope: args.scope } : {}),
    });
  },
}, (msg, err) => { if (err !== undefined) { logger.error({ err }, msg); } else { logger.info(msg); } });

process.parentPort?.on('message', (event) => {
  if (event.data?.type !== 'connect') {
    return;
  }

  const [receivedPort] = event.ports as [MessagePortMain | undefined];
  if (receivedPort === undefined) {
    return;
  }

  port = receivedPort;
  port.start();
  logger.info('Agent utility process connected to main session.');
  emit({
    type: 'session-state',
    status: 'ready',
    detail: 'Isolated agent process is connected.',
  });

  port.on('message', (messageEvent) => {
    const data = messageEvent.data as AgentPortMessage | undefined;
    if (data === undefined) {
      return;
    }

    if (data.type === 'db-response') {
      const response = data as MainDbResponseMessage;
      const pending = pendingDbRequests.get(response.requestId);
      if (pending === undefined) {
        return;
      }

      pendingDbRequests.delete(response.requestId);
      if (response.success) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error ?? 'Unknown db relay error.'));
      }
      return;
    }

    if (data.type === 'approval-decision') {
      agent.handleApprovalDecision(data);
      return;
    }

    if (data.type !== 'command') {
      return;
    }

    if (data.command.type === 'abort') {
      logger.warn({ conversationId: data.command.conversationId }, 'Abort requested from renderer.');
      agent.abortConversation(data.command.conversationId);
      void requestDb({
        action: 'stop-godot',
        requester: 'agent',
        ownerConversationId: data.command.conversationId,
      }).catch(() => undefined);
      emit({
        type: 'error',
        conversationId: data.command.conversationId,
        message: 'The current run was aborted from the renderer.',
      });
      return;
    }

    const controller = agent.createController(data.command.conversationId);
    void agent
      .sendMessage({
        conversationId: data.command.conversationId,
        userMessage: data.command.userMessage,
        ...(data.command.projectId !== undefined ? { projectId: data.command.projectId } : {}),
        model: data.command.model,
        provider: data.command.provider,
        signal: controller.signal,
      })
      .catch((error) => {
        logger.error({ conversationId: data.command.conversationId, error: String(error) }, 'Agent turn failed.');
        emit({
          type: 'error',
          conversationId: data.command.conversationId,
          message: String(error),
        });
      });
  });
});
