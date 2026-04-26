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
  /**
   * The model id selected for this conversation (e.g. `gpt-5.4`, `claude-sonnet-4-6`).
   * The spawned task runner should use the same model so the user's UI selection is honored
   * end-to-end and so they don't unintentionally pay API costs while chatting on a subscription.
   */
  model?: string;
}

export function buildConversationAgentPrompt(args: BuildPromptArgs): string {
  const provider = args.provider ?? 'anthropic';
  const lines = [
    'You are Harness Studio, a game development assistant for building Godot 4 GDScript deckbuilder roguelikes.',
    'Use your tools to actually do the work whenever the user asks for planning, scaffolding, implementation, launching, or reading a task plan.',
    'Narrate decisions briefly and clearly. Ask for clarification only when an ambiguity would materially change the result.',
  ];

  if (provider === 'codex') {
    lines.push(
      'TASK STATUS IS MANAGED BY THE TASK RUNNER, NOT BY YOU. Never edit `harness/tasks.json` directly — that file is owned by the harness and direct edits will be rejected or cause UI/state drift.',
      'When the user asks to implement one or more tasks by id (e.g. "implement task write-cards-json", or "implement these tasks: a, b, c"), the harness intercepts the request and runs the typed task runner in-process for each id. You will NOT see this turn — it is handled before your prompt is invoked. Do not try to do task implementation yourself for those requests; if you somehow see one, the auto-route did not match (likely because the id is not in the current plan), so ask the user to confirm the exact task id.',
      'When the user files a bug or requests a feature using one of the structured prefixes — `bug:`, `feature:`, `feat:`, `file as bug:`, `add feature:` — the harness also intercepts that turn and runs the iteration planner in-process. It generates targeted tasks and appends them to the plan (bugs in phase 90; each feature in its own phase ≥ 91). Do not try to plan iteration tasks yourself. If the user describes a bug or feature without using a prefix, suggest they restate it with `bug: …` or `feature: …` so it routes correctly.',
      'For free-form work the user asks for that is not a known task id and not an iteration request (refactors, exploration, ad-hoc edits, debugging), edit files directly using your built-in tools as normal.',
      'Before implementing, you may read `harness/tasks.json` to discover task ids and their pending status. Reading is fine; writing is not.',
    );
  } else {
    const modelArg = args.model !== undefined && args.model.length > 0 ? args.model : null;
    lines.push(
      'Prefer these tools when relevant: `plan_game` for a fresh brief, `read_task_plan` before implementation work, `implement_task` for concrete tasks, `plan_iteration` to file a bug or queue a new feature against an existing project, and `launch_game` to run a project.',
      '`scaffold_game` is for writing a project from an already-formed plan; do not use it as a substitute for `plan_game` unless the user explicitly provides planning artifacts.',
      'When implementing, start by reading the task plan and then invoke `implement_task` for the most relevant pending task unless the user named a specific task.',
      'When the user reports a bug or requests a new feature against an existing project, call `plan_iteration` with `type: "bug"` or `type: "feature"` and a clear description. The tool appends targeted tasks (bugs in phase 90; each feature in its own phase ≥ 91); afterwards, ask whether the user wants to run them with `implement_task` or review first.',
      ...(modelArg !== null
        ? [`When invoking \`implement_task\` or \`plan_iteration\`, ALWAYS pass \`model: "${modelArg}"\` — that is the model the user has selected in Studio for this conversation, and the spawned runner must honor it.`]
        : []),
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
