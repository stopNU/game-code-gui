import type { AgentContext, ClaudeMessage } from '../types/agent.js';

interface TaskPromptSections {
  stable: string[];
  volatile: string[];
}

export function buildTaskPrompt(ctx: AgentContext): string {
  const sections = buildTaskPromptSections(ctx);
  return [...sections.stable, ...sections.volatile].join('\n');
}

export function buildAnthropicTaskPromptMessage(ctx: AgentContext): ClaudeMessage {
  const sections = buildTaskPromptSections(ctx);
  const stableText = sections.stable.join('\n').trim();
  const volatileText = sections.volatile.join('\n').trim();

  const content = [
    {
      type: 'text' as const,
      text: stableText,
      cache_control: { type: 'ephemeral' as const },
    },
    ...(volatileText.length > 0
      ? [{
          type: 'text' as const,
          text: volatileText,
        }]
      : []),
  ];

  return {
    role: 'user',
    content,
  };
}

function buildTaskPromptSections(ctx: AgentContext): TaskPromptSections {
  const taskCtx = ctx.task.context;
  const taskBrief = ctx.task.brief.trim();
  const taskDescription = ctx.task.description.trim();
  const hasFocusedBrief = taskBrief.length > 0 && taskBrief !== taskDescription;
  const primaryTaskText = taskBrief.length > 0 ? taskBrief : taskDescription;

  const contextPrefix: string[] = [];
  if (taskCtx.subsystemId !== undefined) {
    contextPrefix.push(`Subsystem: ${taskCtx.subsystemId}`);
  }
  if (taskCtx.dataSchemaRefs !== undefined) {
    contextPrefix.push(`Data schemas referenced: ${taskCtx.dataSchemaRefs.join(', ')}`);
  }
  if (taskCtx.architectureNotes !== undefined) {
    contextPrefix.push(`Architecture notes: ${taskCtx.architectureNotes}`);
  }
  if (taskCtx.architecturePath !== undefined) {
    contextPrefix.push(`Architecture contract path: ${taskCtx.architecturePath}`);
  }
  if (taskCtx.advancedContextPath !== undefined) {
    contextPrefix.push(`Advanced shared context path: ${taskCtx.advancedContextPath}`);
  }
  if (taskCtx.runtimeManifestPath !== undefined) {
    contextPrefix.push(`Runtime manifest path: ${taskCtx.runtimeManifestPath}`);
  }
  if (taskCtx.reconciliationReportPath !== undefined) {
    contextPrefix.push(`Reconciliation report path: ${taskCtx.reconciliationReportPath}`);
  }

  const stable = [
    ...(contextPrefix.length > 0 ? [...contextPrefix, ''] : []),
    `## Task: ${ctx.task.title}`,
    '',
    primaryTaskText,
    '',
    '**Acceptance criteria:**',
    ...ctx.task.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    '',
    `**Project path:** ${taskCtx.projectPath}`,
  ];

  if (hasFocusedBrief) {
    stable.push('', '**Original task description:**', taskDescription);
  }

  if (taskCtx.gameSpecPath && !hasFocusedBrief) {
    stable.push('', `**Game spec:** \`${taskCtx.gameSpecPath}\` — read this file for full context.`);
  } else if (taskCtx.gameSpec && !hasFocusedBrief) {
    stable.push('', '**Game spec:**', taskCtx.gameSpec);
  }

  if (ctx.task.role === 'asset') {
    const assetPlanningLines = buildAssetPlanningContext(taskCtx);
    if (assetPlanningLines.length > 0) {
      stable.push('', '**Asset Planning Context:**', ...assetPlanningLines);
    }
  }

  if (taskCtx.architectureContract !== undefined) {
    stable.push('', '**Architecture contract:**', '```json', JSON.stringify(taskCtx.architectureContract), '```');
  }

  if (taskCtx.advancedSharedContext !== undefined) {
    stable.push('', '**Advanced shared context:**', '```json', JSON.stringify(taskCtx.advancedSharedContext), '```');
  }

  if (taskCtx.runtimeManifest !== undefined) {
    stable.push('', '**Authoritative runtime file manifest:**', '```json', JSON.stringify(taskCtx.runtimeManifest), '```');
  }

  if (taskCtx.reconciliationReport !== undefined) {
    stable.push('', '**Runtime reconciliation report (read-only):**', '```json', JSON.stringify(taskCtx.reconciliationReport), '```');
  }

  const runtimeAuthorityLines = buildRuntimeAuthorityContext(taskCtx);
  if (runtimeAuthorityLines.length > 0) {
    stable.push('', '**Runtime authority requirements:**', ...runtimeAuthorityLines);
  }

  if (taskCtx.relevantFileContents !== undefined) {
    const entries = Object.entries(taskCtx.relevantFileContents);
    if (entries.length > 0) {
      stable.push(
        '',
        '**Small reference files (pre-loaded):**',
      );
      for (const [path, content] of entries) {
        stable.push('', `\`${path}\``, '```typescript', content, '```');
      }
    }
  }

  if (taskCtx.relevantFileIndex !== undefined) {
    const entries = Object.entries(taskCtx.relevantFileIndex);
    if (entries.length > 0) {
      stable.push(
        '',
        '**Dependency files (read as needed):**',
        ...entries.map(([path, lineCount]) => `- \`${path}\` (${lineCount} lines)`),
      );
    }
  }

  const volatile: string[] = [];

  if (taskCtx.previousTaskSummaries.length > 0) {
    volatile.push('', '**Previously completed tasks (do not duplicate their work):**');
    for (const summary of taskCtx.previousTaskSummaries) {
      volatile.push(`- ${summary}`);
    }
  }

  if (taskCtx.dependencySummaries.length > 0) {
    volatile.push('', '**Dependency handoff summaries (these tasks must be respected):**');
    for (const summary of taskCtx.dependencySummaries) {
      volatile.push(`- ${summary}`);
    }
  }

  if (ctx.memory.length > 0) {
    volatile.push('', '**Relevant memory:**');
    for (const memoryEntry of ctx.memory) {
      const value = memoryEntry.value.length > 200
        ? memoryEntry.value.slice(0, 200) + '…'
        : memoryEntry.value;
      volatile.push(`- ${memoryEntry.key}: ${value}`);
    }
  }

  return { stable, volatile };
}

function buildAssetPlanningContext(taskCtx: AgentContext['task']['context']): string[] {
  const lines: string[] = [];

  if (taskCtx.canvasWidth !== undefined && taskCtx.canvasHeight !== undefined) {
    lines.push(`- Canvas size: ${taskCtx.canvasWidth}x${taskCtx.canvasHeight}`);
  } else if (taskCtx.canvasWidth !== undefined || taskCtx.canvasHeight !== undefined) {
    lines.push(`- Canvas size: ${taskCtx.canvasWidth ?? '?'}x${taskCtx.canvasHeight ?? '?'}`);
  }

  if (taskCtx.visualStyle !== undefined) {
    lines.push(`- Visual style cues: ${taskCtx.visualStyle}`);
  }

  if (taskCtx.plannedEntities !== undefined && taskCtx.plannedEntities.length > 0) {
    lines.push(`- Named entities requiring asset coverage: ${taskCtx.plannedEntities.join(', ')}`);
  }

  if (taskCtx.scenesNeedingBackgrounds !== undefined && taskCtx.scenesNeedingBackgrounds.length > 0) {
    lines.push(`- Scenes needing backgrounds: ${taskCtx.scenesNeedingBackgrounds.join(', ')}`);
  }

  if (taskCtx.plannedAssets !== undefined && taskCtx.plannedAssets.length > 0) {
    lines.push(`- Planned asset requests: ${taskCtx.plannedAssets.join(', ')}`);
  }

  lines.push('- Before generating assets, reconcile this list with the game spec and fill any missing entity/background coverage.');
  return lines;
}

function buildRuntimeAuthorityContext(taskCtx: AgentContext['task']['context']): string[] {
  const lines: string[] = [];
  const hasRuntimeContext = taskCtx.runtimeManifest !== undefined || taskCtx.reconciliationReport !== undefined;
  if (!hasRuntimeContext) {
    return lines;
  }

  lines.push('- Before editing, state the authoritative runtime file path for this subsystem and cite the manifest or reconciliation entry that makes it authoritative.');
  lines.push('- Confirm all scene, autoload, and runtime references against the active manifest before touching code.');
  lines.push('- When changing flow code, scene transitions, or autoload wiring, read the active .tscn and project.godot first.');
  lines.push('- Do not edit similarly named inactive, legacy, or duplicate files when an authoritative path is present.');

  if (taskCtx.runtimeManifestPath !== undefined) {
    lines.push(`- Runtime manifest source of truth: \`${taskCtx.runtimeManifestPath}\`.`);
  }

  if (taskCtx.reconciliationReportPath !== undefined) {
    lines.push(`- Reconciliation source of truth: \`${taskCtx.reconciliationReportPath}\`.`);
  }

  if (taskCtx.reconciliationReport?.activeFiles.scenes.length) {
    lines.push(`- Active scenes: ${taskCtx.reconciliationReport.activeFiles.scenes.map((path) => `\`${path}\``).join(', ')}.`);
  }

  if (taskCtx.reconciliationReport?.activeFiles.autoloads.length) {
    lines.push(`- Active autoloads: ${taskCtx.reconciliationReport.activeFiles.autoloads.map((path) => `\`${path}\``).join(', ')}.`);
  }

  return lines;
}
