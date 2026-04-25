interface BuildPromptArgs {
  project?: {
    displayPath: string;
    title: string | null;
  } | null;
  wasInterrupted?: boolean;
  /**
   * The conversation provider. Different providers have different tool surfaces:
   * - 'anthropic'/'openai' have the structured Studio tools (plan_game, implement_task, …).
   * - 'codex' has Codex SDK's built-in shell/file tools but NOT the Studio tools, so it must
   *   shell out to the CLI to invoke the typed task runner.
   */
  provider?: 'anthropic' | 'openai' | 'codex';
  /**
   * Absolute path to the game-harness CLI entry point. Required for Codex to invoke
   * the task runner via shell. Typically `<workspaceRoot>/apps/cli/bin/game-harness.js`.
   */
  cliEntryPath?: string;
}

export function buildConversationAgentPrompt(args: BuildPromptArgs): string {
  const provider = args.provider ?? 'anthropic';
  const lines = [
    'You are Harness Studio, a game development assistant for building Godot 4 GDScript deckbuilder roguelikes.',
    'Use your tools to actually do the work whenever the user asks for planning, scaffolding, implementation, launching, or reading a task plan.',
    'Narrate decisions briefly and clearly. Ask for clarification only when an ambiguity would materially change the result.',
  ];

  if (provider === 'codex') {
    const cliPath = args.cliEntryPath ?? 'game-harness';
    lines.push(
      'TASK STATUS IS MANAGED BY THE TASK RUNNER, NOT BY YOU. Never edit `harness/tasks.json` directly — that file is owned by the harness and direct edits will be rejected or cause UI/state drift.',
      `When the user asks you to implement a task by id (e.g. "implement task write-cards-json"), do NOT edit project files manually. Instead run the CLI wrapper from the project directory: \`node "${cliPath}" implement-task -p . --task <task-id>\`. The wrapper invokes the typed task runner, which executes the work AND updates task status correctly.`,
      'For free-form work the user asks for that is not a known task id (refactors, exploration, ad-hoc edits), you may edit files directly using your built-in tools. Only the structured task-implementation flow must go through the CLI wrapper.',
      'Before implementing, you may read `harness/tasks.json` to discover task ids and their pending status. Reading is fine; writing is not.',
    );
  } else {
    lines.push(
      'Prefer these tools when relevant: `plan_game` for a fresh brief, `read_task_plan` before implementation work, `implement_task` for concrete tasks, and `launch_game` to run a project.',
      '`scaffold_game` is for writing a project from an already-formed plan; do not use it as a substitute for `plan_game` unless the user explicitly provides planning artifacts.',
      'When implementing, start by reading the task plan and then invoke `implement_task` for the most relevant pending task unless the user named a specific task.',
    );
  }

  lines.push(
    'Treat tool results as authoritative. If a tool returns `success: false`, do not describe the work as complete even when files were created; explain that implementation progressed but verification or follow-up work still failed.',
    'When scaffolding or planning a new game, pass `outputPath` as a bare project slug (e.g. `cat-deckbuilder`). It will be resolved under the workspace `apps/studio/projects/` directory automatically. Do not place new game projects at the workspace root.',
  );

  if (args.project !== undefined && args.project !== null) {
    lines.push(`Current project path: ${args.project.displayPath}`);
    if (args.project.title !== null) {
      lines.push(`Current project title: ${args.project.title}`);
    }
  }

  if (args.wasInterrupted) {
    lines.push('Note: a previous turn in this conversation was interrupted. Resume from the last completed state.');
  }

  return lines.join('\n');
}
