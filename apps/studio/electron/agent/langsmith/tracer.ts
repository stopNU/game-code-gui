import { randomUUID } from 'crypto';
import { Client } from 'langsmith';

export interface LangSmithConfig {
  apiKey: string;
  projectName: string;
  endpoint: string | null;
}

export interface TurnMeta {
  conversationId: string;
  model: string;
  provider: string;
  userMessage: string;
  systemPrompt: string;
  history: unknown[];
}

export class Tracer {
  private readonly client: Client | null;
  private readonly projectName: string;
  private readonly log: (msg: string, err?: unknown) => void;
  private activeRunId: string | null = null;
  private turnTokens = { input: 0, output: 0, cached: 0 };
  private turnAborted = false;
  private finalOutput = '';

  constructor(
    private readonly enabled: boolean,
    config: LangSmithConfig | null,
    log?: (msg: string, err?: unknown) => void,
  ) {
    this.log = log ?? ((msg, err) => { if (err !== undefined) { console.error(msg, err); } else { console.error(msg); } });
    if (enabled && config !== null) {
      this.client = new Client({
        apiKey: config.apiKey,
        autoBatchTracing: false,
        ...(config.endpoint !== null ? { apiUrl: config.endpoint } : {}),
      });
      this.projectName = config.projectName;
      this.log(`[LangSmith] tracer enabled, project="${config.projectName}"`);
    } else {
      this.client = null;
      this.projectName = 'harness-studio';
      this.log(`[LangSmith] tracer disabled (enabled=${enabled}, hasKey=${config !== null})`);
    }
  }

  recordTokens(tokens: { input: number; output: number; cached: number }): void {
    this.turnTokens.input += tokens.input;
    this.turnTokens.output += tokens.output;
    this.turnTokens.cached += tokens.cached;
  }

  markAborted(): void {
    this.turnAborted = true;
  }

  setFinalOutput(text: string): void {
    this.finalOutput = text;
  }

  async wrapConversationTurn(meta: TurnMeta, fn: () => Promise<void>): Promise<void> {
    if (!this.enabled || this.client === null) {
      return fn();
    }

    const runId = randomUUID();
    this.activeRunId = runId;
    this.turnTokens = { input: 0, output: 0, cached: 0 };
    this.turnAborted = false;
    this.finalOutput = '';

    await this.client
      .createRun({
        id: runId,
        name: 'conversation-turn',
        run_type: 'chain',
        project_name: this.projectName,
        inputs: {
          conversationId: meta.conversationId,
          model: meta.model,
          provider: meta.provider,
          userMessage: meta.userMessage,
          systemPrompt: meta.systemPrompt,
          history: meta.history,
        },
        start_time: Date.now(),
      })
      .catch((e: unknown) => { this.log('[LangSmith] createRun failed', e); });

    try {
      await fn();
      const status = this.turnAborted ? 'aborted' : 'complete';
      await this.client
        .updateRun(runId, {
          outputs: {
            status,
            tokens: this.turnTokens,
            ...(this.finalOutput.length > 0 ? { finalAssistantMessage: this.finalOutput } : {}),
          },
          end_time: Date.now(),
        })
        .catch((e: unknown) => { this.log('[LangSmith] updateRun failed', e); });
    } catch (err) {
      await this.client
        .updateRun(runId, {
          error: String(err),
          end_time: Date.now(),
        })
        .catch((e: unknown) => { this.log('[LangSmith] updateRun (error) failed', e); });
      throw err;
    } finally {
      this.activeRunId = null;
    }
  }

  async wrapToolCall(toolName: string, input: unknown, fn: () => Promise<unknown>): Promise<unknown> {
    if (!this.enabled || this.client === null || this.activeRunId === null) {
      return fn();
    }

    const childId = randomUUID();
    await this.client
      .createRun({
        id: childId,
        name: toolName,
        run_type: 'tool',
        project_name: this.projectName,
        parent_run_id: this.activeRunId,
        inputs: { input },
        start_time: Date.now(),
      })
      .catch((e: unknown) => { this.log('[LangSmith] createRun (tool) failed', e); });

    try {
      const result = await fn();
      await this.client
        .updateRun(childId, {
          outputs: { result },
          end_time: Date.now(),
        })
        .catch((e: unknown) => { this.log('[LangSmith] updateRun (tool) failed', e); });
      return result;
    } catch (err) {
      await this.client
        .updateRun(childId, {
          error: String(err),
          end_time: Date.now(),
        })
        .catch((e: unknown) => { this.log('[LangSmith] updateRun (tool error) failed', e); });
      throw err;
    }
  }
}
