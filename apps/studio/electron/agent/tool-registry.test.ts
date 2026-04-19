import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPlan, TaskState } from '@agent-harness/core';
import { buildToolExecutionContext, createStudioTools } from './tool-registry.js';

function createTask(overrides: Partial<TaskState> = {}): TaskState {
  return {
    id: 'task-1',
    phase: 1,
    role: 'gameplay',
    status: 'pending',
    title: 'Implement combat',
    description: 'Build the first combat loop.',
    brief: 'Create a playable first turn.',
    acceptanceCriteria: ['Cards can be played'],
    dependencies: [],
    toolsAllowed: ['code'],
    retries: 0,
    maxRetries: 2,
    context: {
      projectPath: 'D:/games/dragon-deck',
      gameSpec: 'Deckbuilder roguelike',
      relevantFiles: [],
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
    },
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z',
    ...overrides,
  };
}

function createPlan(taskOverrides: Partial<TaskState> = {}): TaskPlan {
  return {
    gameTitle: 'Dragon Deck',
    gameBrief: 'Fight dragons in a deckbuilder.',
    genre: 'Deckbuilder roguelike',
    coreLoop: 'Battle dragons, earn rewards, upgrade deck.',
    controls: ['Mouse'],
    scenes: ['MainMenu', 'Battle'],
    milestoneScenes: [],
    entities: ['Player', 'Dragon'],
    assets: ['Cards'],
    phases: [
      {
        phase: 1,
        tasks: [createTask(taskOverrides)],
      },
    ],
    verificationSteps: [],
  };
}

function createLegacyPlan(): Record<string, unknown> {
  return {
    gameTitle: 'Legacy Dragon Deck',
    gameBrief: 'Fight dragons in a legacy deckbuilder.',
    genre: 'Deckbuilder roguelike',
    coreLoop: 'Battle dragons, earn rewards, upgrade deck.',
    controls: ['Mouse'],
    scenes: ['MainMenu', 'Battle'],
    entities: ['Player', 'Dragon'],
    assets: ['Cards'],
    phases: [
      {
        phase: 1,
        tasks: [
          {
            id: 'task-1',
            phase: 1,
            role: 'asset',
            status: 'pending',
            title: 'Generate assets',
            description: 'Create placeholder art.',
            context: {},
          },
        ],
      },
    ],
  };
}

function createBridge(overrides: Record<string, unknown> = {}) {
  const events: unknown[] = [];
  const bridge = {
    workspaceRoot: 'D:/dev/game-code-gui',
    emit: vi.fn((event) => {
      events.push(event);
    }),
    getProject: vi.fn(async (_projectId: string) => ({
      id: 'project-1',
      normalizedPath: 'd:\\games\\dragon-deck',
      displayPath: 'D:/games/dragon-deck',
      title: 'Dragon Deck',
    })),
    upsertProject: vi.fn(async (args: { normalizedPath: string; displayPath: string; title?: string | null }) => ({
      id: 'project-1',
      displayPath: args.displayPath,
      title: args.title ?? null,
    })),
    getTaskPlan: vi.fn(async (_projectId: string) => ({
      projectId: 'project-1',
      planJson: JSON.stringify(createPlan()),
      updatedAt: Date.now(),
    })),
    upsertTaskPlan: vi.fn(async () => undefined),
    launchGodot: vi.fn(async () => ({ launched: true })),
    stopGodot: vi.fn(async () => ({ status: 'stopped' })),
    getAnthropicApiKey: vi.fn(async () => null),
    ...overrides,
  };

  return { bridge, events };
}

function getTool(name: string, deps?: Parameters<typeof createStudioTools>[0]) {
  const tool = createStudioTools(deps).find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new Error(`Tool ${name} not found.`);
  }

  return tool;
}

describe('Studio tool contracts', () => {
  beforeEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('plan_game calls planGameService and persists the project plus task plan even without an API key', async () => {
    const plan = createPlan();
    const planGameServiceImpl = vi.fn(async () => plan);
    const { bridge } = createBridge();
    const tool = getTool('plan_game', {
      planGameServiceImpl,
    });

    const result = await tool.execute(
      {
        brief: 'Build a dragon deckbuilder.',
        outputPath: './games/dragon-deck',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        toolCallId: 'tool-1',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(planGameServiceImpl).toHaveBeenCalledWith({
      brief: 'Build a dragon deckbuilder.',
      outputPath: 'D:\\dev\\game-code-gui\\games\\dragon-deck',
    });
    expect(bridge.upsertProject).toHaveBeenCalledTimes(1);
    expect(bridge.upsertTaskPlan).toHaveBeenCalledWith({
      projectId: 'project-1',
      planJson: JSON.stringify(plan),
    });
    expect(result).toEqual({
      projectId: 'project-1',
      gameTitle: 'Dragon Deck',
      taskCount: 1,
    });
    expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('scaffold_game calls scaffoldGame and persists the resulting project', async () => {
    const scaffoldGameImpl = vi.fn(async () => ({
      id: 'project-1',
      path: 'D:/games/dragon-deck',
      title: 'Dragon Deck',
      version: '0.1.0',
      scenes: ['MainMenu', 'Battle'],
      runtimeLayout: 'canonical',
    }));
    const { bridge } = createBridge();
    const tool = getTool('scaffold_game', {
      scaffoldGameImpl,
    });
    const plan = createPlan();
    const preprocessedBrief = {
      originalBrief: 'Build a dragon deckbuilder.',
      normalizedBrief: 'Build a dragon deckbuilder.',
      clarifications: [],
      constraints: [],
      contentRequirements: [],
      systemRequirements: [],
      assetRequirements: [],
      uiRequirements: [],
      gameplayRequirements: [],
      technicalNotes: [],
    };

    const result = await tool.execute(
      {
        outputPath: './games/dragon-deck',
        plan,
        preprocessedBrief,
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        toolCallId: 'tool-2',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(scaffoldGameImpl).toHaveBeenCalledWith({
      outputPath: 'D:\\dev\\game-code-gui\\games\\dragon-deck',
      plan,
      preprocessedBrief,
    });
    expect(bridge.upsertProject).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      projectId: 'project-1',
      outputPath: 'D:\\dev\\game-code-gui\\games\\dragon-deck',
    });
  });

  it('implement_task validates that the requested task exists before invoking runTask', async () => {
    const runTaskImpl = vi.fn();
    const { bridge } = createBridge({
      getTaskPlan: vi.fn(async () => ({
        projectId: 'project-1',
        planJson: JSON.stringify(createPlan({ id: 'different-task' })),
        updatedAt: Date.now(),
      })),
    });
    const tool = getTool('implement_task', {
      runTaskImpl,
    });

    await expect(
      tool.execute(
        {
          projectId: 'project-1',
          taskId: 'task-1',
        },
        buildToolExecutionContext({
          conversationId: 'conversation-1',
          projectId: 'project-1',
          toolCallId: 'tool-3',
          signal: new AbortController().signal,
          bridge: bridge as never,
        }),
      ),
    ).rejects.toThrow('Task task-1 was not found in project project-1.');
    expect(runTaskImpl).not.toHaveBeenCalled();
  });

  it('implement_task invokes runTask, persists updated plans, and emits budget exhaustion events', async () => {
    const nextPlan = createPlan({
      status: 'complete',
      completedAt: '2026-04-18T00:05:00.000Z',
    });
    const runTask = vi.fn(
      async (
        projectPath: string,
        task: TaskState,
        plan: TaskPlan,
        onProgress,
        _mode,
        _onToolCallDetail,
        _onAgentMessage,
        onTokens,
        _signal,
        _onText,
        model,
        persistPlan,
        onBudgetExhausted,
      ) => {
        onProgress?.('Implementing task files.');
        onTokens?.({ input: 12, output: 34, cached: 5 });
        const budgetDecision = await onBudgetExhausted?.(2000, 1500, 3);
        await persistPlan?.(nextPlan);
        return {
          success: budgetDecision?.action === 'abort',
          summary: `${projectPath} :: ${task.id} :: ${plan.gameTitle} :: ${model ?? 'default'}`,
          filesModified: ['src/main.gd'],
          toolCallCount: 2,
          tokensUsed: { input: 12, output: 34, cached: 5 },
        };
      },
    );
    const { bridge, events } = createBridge();
    const tool = getTool('implement_task', {
      runTaskImpl: runTask,
    });

    const result = await tool.execute(
      {
        projectId: 'project-1',
        taskId: 'task-1',
        model: 'claude-sonnet-4-6',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        projectId: 'project-1',
        toolCallId: 'tool-4',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(runTask).toHaveBeenCalledTimes(1);
    expect(bridge.upsertTaskPlan).toHaveBeenCalledWith({
      projectId: 'project-1',
      planJson: JSON.stringify(nextPlan),
    });
    expect(events).toContainEqual({
      type: 'budget-exhausted',
      conversationId: 'conversation-1',
      toolCallId: 'tool-4',
      tokensUsed: 2000,
      budget: 1500,
    });
    expect(events).toContainEqual({
      type: 'tokens',
      conversationId: 'conversation-1',
      input: 12,
      output: 34,
      cached: 5,
    });
    expect(events).toContainEqual({
      type: 'notice',
      conversationId: 'conversation-1',
      message: 'Task complete: Implement combat',
    });
    expect(result).toEqual({
      success: true,
      summary: 'D:/games/dragon-deck :: task-1 :: Dragon Deck :: claude-sonnet-4-6',
      filesModified: ['src/main.gd'],
      toolCallCount: 2,
      tokensUsed: { input: 12, output: 34, cached: 5 },
    });
  });

  it('implement_task hydrates legacy plans before invoking runTask', async () => {
    const runTaskImpl = vi.fn(async (_projectPath: string, task: TaskState) => ({
      success: true,
      summary: `Ran ${task.id}`,
      filesModified: [],
      toolCallCount: 0,
      tokensUsed: { input: 0, output: 0, cached: 0 },
    }));
    const { bridge } = createBridge({
      getTaskPlan: vi.fn(async () => ({
        projectId: 'project-1',
        planJson: JSON.stringify(createLegacyPlan()),
        updatedAt: Date.now(),
      })),
    });
    const tool = getTool('implement_task', {
      runTaskImpl,
    });

    await tool.execute(
      {
        projectId: 'project-1',
        taskId: 'task-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-legacy',
        projectId: 'project-1',
        toolCallId: 'tool-legacy',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(runTaskImpl).toHaveBeenCalledTimes(1);
    const [, taskArg, planArg] = runTaskImpl.mock.calls[0] as unknown as [string, TaskState, TaskPlan];
    expect(taskArg.acceptanceCriteria).toEqual([]);
    expect(taskArg.dependencies).toEqual([]);
    expect(taskArg.toolsAllowed).toEqual(['project', 'asset']);
    expect(taskArg.context.relevantFiles).toEqual([]);
    expect(taskArg.context.previousTaskSummaries).toEqual([]);
    expect(planArg.milestoneScenes).toEqual([]);
    expect(planArg.verificationSteps).toEqual([]);
    expect(bridge.upsertTaskPlan).toHaveBeenCalledWith({
      projectId: 'project-1',
      planJson: JSON.stringify(planArg),
    });
  });

  it('implement_task returns a failure-first summary when verification fails after writing files', async () => {
    const runTaskImpl = vi.fn(async () => ({
      success: false,
      summary: 'Scaffold files were created. Fix pass: 2 type error(s) remain',
      filesModified: ['project.godot', 'src/scenes/BootScene.tscn'],
      toolCallCount: 4,
      tokensUsed: { input: 100, output: 50, cached: 25 },
    }));
    const { bridge } = createBridge();
    const tool = getTool('implement_task', {
      runTaskImpl,
    });

    const result = await tool.execute(
      {
        projectId: 'project-1',
        taskId: 'task-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        projectId: 'project-1',
        toolCallId: 'tool-9',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(result).toEqual({
      success: false,
      summary: 'Implementation produced changes, but verification failed. Scaffold files were created. Fix pass: 2 type error(s) remain',
      failureStage: 'verification',
      filesModified: ['project.godot', 'src/scenes/BootScene.tscn'],
      toolCallCount: 4,
      tokensUsed: { input: 100, output: 50, cached: 25 },
    });
    expect(bridge.emit).toHaveBeenCalledWith({
      type: 'notice',
      conversationId: 'conversation-1',
      message: 'Task failed: Implement combat. Scaffold files were created. Fix pass: 2 type error(s) remain',
    });
  });

  it('read_task_plan returns null when no plan exists and deserializes valid plans', async () => {
    const missingBridge = createBridge({
      getTaskPlan: vi.fn(async () => null),
    }).bridge;
    const tool = getTool('read_task_plan');

    const missingResult = await tool.execute(
      {
        projectId: 'project-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        toolCallId: 'tool-5',
        signal: new AbortController().signal,
        bridge: missingBridge as never,
      }),
    );

    expect(missingResult).toEqual({
      plan: null,
    });

    const presentBridge = createBridge().bridge;
    const presentResult = await tool.execute(
      {
        projectId: 'project-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-1',
        toolCallId: 'tool-6',
        signal: new AbortController().signal,
        bridge: presentBridge as never,
      }),
    );

    expect(presentResult).toEqual({
      plan: createPlan(),
    });
  });

  it('read_task_plan hydrates missing arrays in legacy plans', async () => {
    const legacyBridge = createBridge({
      getTaskPlan: vi.fn(async () => ({
        projectId: 'project-1',
        planJson: JSON.stringify(createLegacyPlan()),
        updatedAt: Date.now(),
      })),
    }).bridge;
    const tool = getTool('read_task_plan');

    const result = await tool.execute(
      {
        projectId: 'project-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-legacy-read',
        toolCallId: 'tool-legacy-read',
        signal: new AbortController().signal,
        bridge: legacyBridge as never,
      }),
    );

    expect(result).toEqual({
      plan: {
        gameTitle: 'Legacy Dragon Deck',
        gameBrief: 'Fight dragons in a legacy deckbuilder.',
        genre: 'Deckbuilder roguelike',
        coreLoop: 'Battle dragons, earn rewards, upgrade deck.',
        controls: ['Mouse'],
        scenes: ['MainMenu', 'Battle'],
        milestoneScenes: [],
        entities: ['Player', 'Dragon'],
        assets: ['Cards'],
        phases: [
          {
            phase: 1,
            tasks: [
              expect.objectContaining({
                id: 'task-1',
                acceptanceCriteria: [],
                dependencies: [],
                toolsAllowed: ['project', 'asset'],
                context: expect.objectContaining({
                  relevantFiles: [],
                  memoryKeys: [],
                  dependencySummaries: [],
                  previousTaskSummaries: [],
                }),
              }),
            ],
          },
        ],
        verificationSteps: [],
      },
    });
  });

  it('launch_game passes ownerConversationId through the Godot manager bridge', async () => {
    const { bridge, events } = createBridge();
    const tool = getTool('launch_game');

    const result = await tool.execute(
      {
        projectId: 'project-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-42',
        projectId: 'project-1',
        toolCallId: 'tool-7',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(bridge.launchGodot).toHaveBeenCalledWith({
      projectPath: 'D:/games/dragon-deck',
      ownerConversationId: 'conversation-42',
    });
    expect(events).toContainEqual({
      type: 'tool-progress',
      conversationId: 'conversation-42',
      toolCallId: 'tool-7',
      message: 'Launching Dragon Deck through the main-process Godot manager.',
    });
    expect(result).toEqual({
      launched: true,
    });
  });

  it('launch_game auto-registers a workspace project when the id matches an on-disk Studio project', async () => {
    const { bridge } = createBridge({
      workspaceRoot: 'D:/dev/game-code-gui',
      getProject: vi.fn(async () => null),
      upsertProject: vi.fn(async (args: { normalizedPath: string; displayPath: string; title?: string | null }) => ({
        id: 'cat-pong',
        displayPath: args.displayPath,
        title: args.title ?? null,
      })),
    });
    const tool = getTool('launch_game');

    const result = await tool.execute(
      {
        projectId: 'cat-pong',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-recover',
        projectId: 'cat-pong',
        projectPath: 'D:/dev/game-code-gui/apps/studio/projects/cat-pong',
        toolCallId: 'tool-recover',
        signal: new AbortController().signal,
        bridge: bridge as never,
      }),
    );

    expect(bridge.upsertProject).toHaveBeenCalledWith({
      normalizedPath: 'd:/dev/game-code-gui/apps/studio/projects/cat-pong',
      displayPath: 'D:\\dev\\game-code-gui\\apps\\studio\\projects\\cat-pong',
      title: 'cat-pong',
    });
    expect(bridge.launchGodot).toHaveBeenCalledWith({
      projectPath: 'D:\\dev\\game-code-gui\\apps\\studio\\projects\\cat-pong',
      ownerConversationId: 'conversation-recover',
    });
    expect(result).toEqual({
      launched: true,
    });
  });

  it('launch_game honours cancellation by stopping the owned Godot session', async () => {
    let resolveLaunch: (() => void) | undefined;
    const { bridge } = createBridge({
      launchGodot: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            resolveLaunch = resolve;
          }),
      ),
    });
    const tool = getTool('launch_game');
    const controller = new AbortController();

    const launchPromise = tool.execute(
      {
        projectId: 'project-1',
      },
      buildToolExecutionContext({
        conversationId: 'conversation-99',
        projectId: 'project-1',
        toolCallId: 'tool-8',
        signal: controller.signal,
        bridge: bridge as never,
      }),
    );

    controller.abort(new Error('launch cancelled'));

    await expect(launchPromise).rejects.toThrow('launch cancelled');
    expect(bridge.stopGodot).toHaveBeenCalledWith({
      ownerConversationId: 'conversation-99',
      force: true,
    });
    resolveLaunch?.();
  });

  it('buildToolExecutionContext prefers an explicit project path and falls back to the workspace root', () => {
    const { bridge } = createBridge();

    const explicit = buildToolExecutionContext({
      conversationId: 'conversation-context',
      projectId: 'project-1',
      projectPath: 'D:/games/dragon-deck',
      toolCallId: 'tool-context-explicit',
      signal: new AbortController().signal,
      bridge: bridge as never,
    });
    const fallback = buildToolExecutionContext({
      conversationId: 'conversation-context',
      toolCallId: 'tool-context-fallback',
      signal: new AbortController().signal,
      bridge: bridge as never,
    });

    expect(explicit.projectPath).toBe('D:/games/dragon-deck');
    expect(fallback.projectPath).toBe('D:/dev/game-code-gui');
  });
});
