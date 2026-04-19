import { existsSync } from 'fs';
import { basename, isAbsolute, join, resolve } from 'path';
import { preprocessBrief, createAdvancedPlan, normalizeTaskPlan, type PreprocessedBrief, type TaskPlan, type TaskState, type ToolContract } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { planGameService, runTask } from '@agent-harness/services';
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

interface StudioProjectRecord {
  id: string;
  normalizedPath: string;
  displayPath: string;
  title: string | null;
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

interface StudioToolDependencies {
  planGameServiceImpl: typeof planGameService;
  scaffoldGameImpl: typeof scaffoldGame;
  runTaskImpl: typeof runTask;
}

const defaultToolDependencies: StudioToolDependencies = {
  planGameServiceImpl: planGameService,
  scaffoldGameImpl: scaffoldGame,
  runTaskImpl: runTask,
};

function formatImplementTaskResult(result: Awaited<ReturnType<typeof runTask>>) {
  if (result.success) {
    return result;
  }

  const verificationNote = result.summary.trim().length > 0
    ? `Implementation produced changes, but verification failed. ${result.summary}`
    : 'Implementation produced changes, but verification failed.';

  return {
    ...result,
    summary: verificationNote,
    failureStage: 'verification' as const,
  };
}

function buildImplementTaskNotice(task: TaskState, result: Awaited<ReturnType<typeof runTask>>): string {
  if (result.success || task.status === 'complete') {
    return `Task complete: ${task.title}`;
  }

  const trimmedSummary = result.summary.trim();
  if (trimmedSummary.length === 0) {
    return `Task failed: ${task.title}`;
  }

  return `Task failed: ${task.title}. ${trimmedSummary}`;
}

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

function resolveWorkspaceProjectPath(workspaceRoot: string, projectId: string): string | null {
  const candidatePath = resolve(workspaceRoot, 'apps', 'studio', 'projects', projectId);
  return existsSync(join(candidatePath, 'project.godot')) ? candidatePath : null;
}

async function getProjectOrRecoverFromWorkspace(
  bridge: ToolBridge,
  projectId: string,
): Promise<StudioProjectRecord | null> {
  const project = await bridge.getProject(projectId);
  if (project !== null) {
    return project;
  }

  const recoveredPath = resolveWorkspaceProjectPath(bridge.workspaceRoot, projectId);
  if (recoveredPath === null) {
    return null;
  }

  return bridge.upsertProject({
    normalizedPath: normalizePath(recoveredPath),
    displayPath: recoveredPath,
    title: basename(recoveredPath),
  }).then(async (upsertedProject) => {
    const persistedProject = await bridge.getProject(upsertedProject.id);
    if (persistedProject !== null) {
      return persistedProject;
    }

    return {
      id: upsertedProject.id,
      normalizedPath: normalizePath(recoveredPath),
      displayPath: recoveredPath,
      title: upsertedProject.title,
    };
  });
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

      const plan = normalizeTaskPlan(planRecord.planJson ? JSON.parse(planRecord.planJson) : null);
      return {
        plan,
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
        failureStage: {
          type: 'string',
          enum: ['verification'],
        },
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

      const project = await getProjectOrRecoverFromWorkspace(ctx.bridge, toolInput.projectId);
      if (project === null) {
        throw new Error(`Unknown project ${toolInput.projectId}.`);
      }

      const taskPlanRecord = await ctx.bridge.getTaskPlan(toolInput.projectId);
      if (taskPlanRecord === null) {
        throw new Error(`Project ${toolInput.projectId} does not have a persisted task plan.`);
      }

      const plan = normalizeTaskPlan(JSON.parse(taskPlanRecord.planJson), project.displayPath);
      await ctx.bridge.upsertTaskPlan({
        projectId: toolInput.projectId,
        planJson: JSON.stringify(plan),
      });
      const task = plan.phases
        .flatMap((phase: TaskPlan['phases'][number]) => phase.tasks)
        .find((candidate: TaskState) => candidate.id === toolInput.taskId);
      if (task === undefined) {
        throw new Error(`Task ${toolInput.taskId} was not found in project ${toolInput.projectId}.`);
      }

      const result = await resolvedDependencies.runTaskImpl(
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

      ctx.bridge.emit({
        type: 'notice',
        conversationId: ctx.conversationId,
        message: buildImplementTaskNotice(task, result),
      });

      return formatImplementTaskResult(result);
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
      const project = await getProjectOrRecoverFromWorkspace(ctx.bridge, toolInput.projectId);
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
  projectPath?: string;
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
    projectPath: args.projectPath ?? args.bridge.workspaceRoot,
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
