import { resolve, isAbsolute } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { preprocessBrief, createAdvancedPlan, type PreprocessedBrief, type TaskPlan, type TaskState, type ToolContract } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { planGameService } from '@agent-harness/services';
import { normalizePath } from '../db/normalize-path.js';
import type { StreamEvent } from '../../shared/protocol.js';

function resolveProjectPath(workspaceRoot: string, outputPath: string): string {
  if (isAbsolute(outputPath)) {
    // Strip leading slashes so absolute AI-provided paths resolve under the workspace root
    const relative = outputPath.replace(/^[/\\]+/, '');
    return resolve(workspaceRoot, relative);
  }
  return resolve(workspaceRoot, outputPath);
}

interface ToolBridge {
  workspaceRoot: string;
  emit(event: StreamEvent): void;
  getProject(projectId: string): Promise<{ id: string; normalizedPath: string; displayPath: string; title: string | null } | null>;
  upsertProject(args: { normalizedPath: string; displayPath: string; title?: string | null }): Promise<{ id: string; displayPath: string; title: string | null }>;
  getTaskPlan(projectId: string): Promise<{ projectId: string; planJson: string; updatedAt: number } | null>;
  upsertTaskPlan(args: { projectId: string; planJson: string }): Promise<void>;
  launchGodot(args: { projectPath: string; ownerConversationId?: string }): Promise<unknown>;
  stopGodot(args: { ownerConversationId?: string; force?: boolean }): Promise<unknown>;
  getAnthropicApiKey(): Promise<string | null>;
}

interface StudioToolContext {
  conversationId: string;
  projectId?: string;
  toolCallId: string;
  signal: AbortSignal;
  bridge: ToolBridge;
  projectPath: string;
  taskId: string;
  traceId: string;
  permissions: {
    allowed: Array<'fs:read' | 'fs:write' | 'npm:run' | 'browser:launch'>;
    denied: never[];
  };
}

interface RunTaskModule {
  runTask: (
    projectPath: string,
    task: TaskState,
    plan: TaskPlan,
    onProgress?: (msg: string) => void,
    mode?: 'simple' | 'advanced',
    onToolCallDetail?: (call: { name: string; input: Record<string, unknown> }) => void,
    onAgentMessage?: undefined,
    onTokens?: (tokens: { input: number; output: number; cached: number }) => void,
    signal?: AbortSignal,
    onText?: (delta: string) => void,
    model?: string,
    persistPlan?: (plan: TaskPlan) => Promise<void>,
    onBudgetExhausted?: (used: number, budget: number, filesWritten: number) => Promise<{ action: 'continue' | 'abort'; extraBudget: number }>,
    reconciliationReportPath?: string,
  ) => Promise<{
    success: boolean;
    summary: string;
    filesModified: string[];
    toolCallCount: number;
    tokensUsed: { input: number; output: number; cached: number };
  }>;
}

interface StudioToolDependencies {
  planGameServiceImpl: typeof planGameService;
  scaffoldGameImpl: typeof scaffoldGame;
  loadRunTaskModuleImpl: (workspaceRoot: string) => Promise<RunTaskModule>;
}

const defaultToolDependencies: StudioToolDependencies = {
  planGameServiceImpl: planGameService,
  scaffoldGameImpl: scaffoldGame,
  loadRunTaskModuleImpl: loadRunTaskModule,
};

function toAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }

  return new Error(typeof reason === 'string' && reason.length > 0 ? reason : 'The operation was aborted.');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw toAbortError(signal);
  }
}

async function loadRunTaskModule(workspaceRoot: string): Promise<RunTaskModule> {
  const cliDistPath = resolve(workspaceRoot, 'apps/cli/dist/commands/implement-task.js');
  if (!existsSync(cliDistPath)) {
    throw new Error('Studio needs the built CLI command for implement_task. Run `pnpm build` first.');
  }

  return (await import(pathToFileURL(cliDistPath).href)) as RunTaskModule;
}

export function createStudioTools(dependencies: Partial<StudioToolDependencies> = {}): ToolContract[] {
  const resolvedDependencies = {
    ...defaultToolDependencies,
    ...dependencies,
  };
  const projectToolPermissions = ['fs:read', 'fs:write'] as const;

  const planGameTool: ToolContract = {
    name: 'plan_game',
    group: 'project',
    description: 'Plan and scaffold a new Godot deckbuilder project from a brief. Use this when the user wants a fresh game project.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string' },
        outputPath: { type: 'string' },
      },
      required: ['brief', 'outputPath'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        gameTitle: { type: 'string' },
        taskCount: { type: 'number' },
      },
      required: ['projectId', 'gameTitle', 'taskCount'],
    },
    permissions: [...projectToolPermissions],
    execute: async (input: unknown, rawCtx: unknown) => {
      const ctx = rawCtx as StudioToolContext;
      const toolInput = input as { brief: string; outputPath: string };
      const apiKey = await ctx.bridge.getAnthropicApiKey();
      if (apiKey !== null) {
        process.env['ANTHROPIC_API_KEY'] = apiKey;
      }

      ctx.bridge.emit({
        type: 'tool-progress',
        conversationId: ctx.conversationId,
        toolCallId: ctx.toolCallId,
        message: 'Planning the game brief and scaffolding the Godot project.',
      });

      const outputPath = resolveProjectPath(ctx.bridge.workspaceRoot, toolInput.outputPath);
      const plan = await resolvedDependencies.planGameServiceImpl({
        brief: toolInput.brief,
        outputPath,
      });

      const project = await ctx.bridge.upsertProject({
        normalizedPath: normalizePath(outputPath),
        displayPath: outputPath,
        title: plan.gameTitle,
      });
      await ctx.bridge.upsertTaskPlan({
        projectId: project.id,
        planJson: JSON.stringify(plan),
      });

      return {
        projectId: project.id,
        gameTitle: plan.gameTitle,
        taskCount: plan.phases.reduce((count: number, phase: TaskPlan['phases'][number]) => count + phase.tasks.length, 0),
      };
    },
  };

  const scaffoldGameTool: ToolContract = {
    name: 'scaffold_game',
    group: 'project',
    description: 'Scaffold a project from an existing brief and task plan. Use only when you already have a concrete plan object to scaffold from.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string' },
        plan: { type: 'object' },
        preprocessedBrief: { type: 'object' },
      },
      required: ['outputPath', 'plan', 'preprocessedBrief'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        outputPath: { type: 'string' },
      },
      required: ['projectId', 'outputPath'],
    },
    permissions: [...projectToolPermissions],
    execute: async (input: unknown, rawCtx: unknown) => {
      const ctx = rawCtx as StudioToolContext;
      const toolInput = input as {
        outputPath: string;
        plan: TaskPlan;
        preprocessedBrief: PreprocessedBrief;
      };
      const outputPath = resolveProjectPath(ctx.bridge.workspaceRoot, toolInput.outputPath);
      await resolvedDependencies.scaffoldGameImpl({
        outputPath,
        plan: toolInput.plan,
        preprocessedBrief: toolInput.preprocessedBrief,
      });

      const project = await ctx.bridge.upsertProject({
        normalizedPath: normalizePath(outputPath),
        displayPath: outputPath,
        title: toolInput.plan.gameTitle,
      });
      await ctx.bridge.upsertTaskPlan({
        projectId: project.id,
        planJson: JSON.stringify(toolInput.plan),
      });

      return {
        projectId: project.id,
        outputPath,
      };
    },
  };

  const readTaskPlanTool: ToolContract = {
    name: 'read_task_plan',
    group: 'project',
    description: 'Read the persisted task plan for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        plan: {},
      },
      required: ['plan'],
    },
    permissions: ['fs:read'],
    execute: async (input: unknown, rawCtx: unknown) => {
      const ctx = rawCtx as StudioToolContext;
      const toolInput = input as { projectId: string };
      const planRecord = await ctx.bridge.getTaskPlan(toolInput.projectId);
      if (planRecord === null) {
        return {
          plan: null,
        };
      }

      return {
        plan: JSON.parse(planRecord.planJson) as unknown,
      };
    },
  };

  const implementTaskTool: ToolContract = {
    name: 'implement_task',
    group: 'code',
    description: 'Run the agent loop for a single task in a Studio project. Use after reading a task plan.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['projectId', 'taskId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        summary: { type: 'string' },
      },
      required: ['success', 'summary'],
    },
    permissions: ['fs:read', 'fs:write', 'npm:run'],
    execute: async (input: unknown, rawCtx: unknown) => {
      const ctx = rawCtx as StudioToolContext;
      const toolInput = input as { projectId: string; taskId: string; model?: string };
      const apiKey = await ctx.bridge.getAnthropicApiKey();
      if (apiKey !== null) {
        process.env['ANTHROPIC_API_KEY'] = apiKey;
      }

      const project = await ctx.bridge.getProject(toolInput.projectId);
      if (project === null) {
        throw new Error(`Unknown project ${toolInput.projectId}.`);
      }

      const taskPlanRecord = await ctx.bridge.getTaskPlan(toolInput.projectId);
      if (taskPlanRecord === null) {
        throw new Error(`Project ${toolInput.projectId} does not have a persisted task plan.`);
      }

      const plan = JSON.parse(taskPlanRecord.planJson) as TaskPlan;
      const task = plan.phases
        .flatMap((phase: TaskPlan['phases'][number]) => phase.tasks)
        .find((candidate: TaskState) => candidate.id === toolInput.taskId);
      if (task === undefined) {
        throw new Error(`Task ${toolInput.taskId} was not found in project ${toolInput.projectId}.`);
      }

      const { runTask } = await resolvedDependencies.loadRunTaskModuleImpl(ctx.bridge.workspaceRoot);
      const result = await runTask(
        project.displayPath,
        task,
        plan,
        (message) => {
          ctx.bridge.emit({
            type: 'tool-progress',
            conversationId: ctx.conversationId,
            toolCallId: ctx.toolCallId,
            message,
          });
        },
        'advanced',
        undefined,
        undefined,
        (tokens) => {
          ctx.bridge.emit({
            type: 'tokens',
            conversationId: ctx.conversationId,
            input: tokens.input,
            output: tokens.output,
            cached: tokens.cached,
          });
        },
        ctx.signal,
        undefined,
        toolInput.model,
        async (nextPlan) => {
          await ctx.bridge.upsertTaskPlan({
            projectId: toolInput.projectId,
            planJson: JSON.stringify(nextPlan),
          });
        },
        async (used, budget) => {
          ctx.bridge.emit({
            type: 'budget-exhausted',
            conversationId: ctx.conversationId,
            toolCallId: ctx.toolCallId,
            tokensUsed: used,
            budget,
          });
          return {
            action: 'abort',
            extraBudget: 0,
          };
        },
      );

      return result;
    },
  };

  const launchGameTool: ToolContract = {
    name: 'launch_game',
    group: 'npm',
    description: 'Launch a Godot project through the shared main-process runtime owner.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        headless: { type: 'boolean' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        launched: { type: 'boolean' },
      },
      required: ['launched'],
    },
    permissions: ['browser:launch'],
    execute: async (input: unknown, rawCtx: unknown) => {
      const ctx = rawCtx as StudioToolContext;
      const toolInput = input as { projectId: string; headless?: boolean };
      throwIfAborted(ctx.signal);
      const project = await ctx.bridge.getProject(toolInput.projectId);
      if (project === null) {
        throw new Error(`Unknown project ${toolInput.projectId}.`);
      }
      if (toolInput.headless === true) {
        throw new Error('Shared Studio runtime currently supports windowed launches only.');
      }

      ctx.bridge.emit({
        type: 'tool-progress',
        conversationId: ctx.conversationId,
        toolCallId: ctx.toolCallId,
        message: `Launching ${project.title ?? project.displayPath} through the main-process Godot manager.`,
      });

      if (ctx.signal.aborted) {
        await ctx.bridge.stopGodot({
          ownerConversationId: ctx.conversationId,
          force: true,
        });
        throw toAbortError(ctx.signal);
      }

      const abortPromise = new Promise<never>((_, reject) => {
        if (ctx.signal.aborted) {
          void ctx.bridge.stopGodot({
            ownerConversationId: ctx.conversationId,
            force: true,
          });
          reject(toAbortError(ctx.signal));
          return;
        }

        ctx.signal.addEventListener(
          'abort',
          () => {
            void ctx.bridge.stopGodot({
              ownerConversationId: ctx.conversationId,
              force: true,
            });
            reject(toAbortError(ctx.signal));
          },
          { once: true },
        );
      });

      await Promise.race([
        ctx.bridge.launchGodot({
          projectPath: project.displayPath,
          ownerConversationId: ctx.conversationId,
        }),
        abortPromise,
      ]);

      return {
        launched: true,
      };
    },
  };

  return [planGameTool, scaffoldGameTool, readTaskPlanTool, implementTaskTool, launchGameTool];
}

export function buildToolExecutionContext(args: {
  conversationId: string;
  projectId?: string;
  toolCallId: string;
  signal: AbortSignal;
  bridge: ToolBridge;
}): StudioToolContext {
  return {
    conversationId: args.conversationId,
    ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    toolCallId: args.toolCallId,
    signal: args.signal,
    bridge: args.bridge,
    projectPath: args.projectId ?? '',
    taskId: args.toolCallId,
    traceId: args.toolCallId,
    permissions: { allowed: ['fs:read', 'fs:write', 'npm:run', 'browser:launch'], denied: [] },
  };
}

export function summarizeToolResult(output: unknown): string {
  const text = JSON.stringify(output);
  return text.length > 8_000 ? `${text.slice(0, 8_000)}\n[truncated - full result stored in the database]` : text;
}

export function buildScaffoldInputFromPlan(args: {
  outputPath: string;
  brief: string;
  plan: TaskPlan;
}): Promise<{ outputPath: string; plan: TaskPlan; preprocessedBrief: PreprocessedBrief }> {
  return preprocessBrief(args.brief).then((preprocessedBrief: PreprocessedBrief) => ({
    outputPath: args.outputPath,
    plan: args.plan,
    preprocessedBrief,
  }));
}

export async function buildPlanFromBrief(brief: string): Promise<{ preprocessedBrief: PreprocessedBrief; plan: TaskPlan }> {
  const preprocessedBrief = await preprocessBrief(brief);
  const plan = await createAdvancedPlan(preprocessedBrief);
  return {
    preprocessedBrief,
    plan,
  };
}
