import type { TaskPlan, TaskState } from '../types/task.js';

export function validateTaskPlan(plan: TaskPlan): TaskPlan {
  const tasks = flattenTasks(plan);
  const taskById = new Map<string, TaskState>();
  const phaseByTaskId = new Map<string, number>();
  const orderByTaskId = new Map<string, number>();

  tasks.forEach(({ task, phase, order }) => {
    if (task.phase !== phase) {
      throw new Error(
        `Task "${task.id}" declares phase ${task.phase} but is nested under phase ${phase}.`,
      );
    }

    if (taskById.has(task.id)) {
      throw new Error(`Duplicate task id "${task.id}" in generated plan.`);
    }

    taskById.set(task.id, task);
    phaseByTaskId.set(task.id, phase);
    orderByTaskId.set(task.id, order);
  });

  for (const { task } of tasks) {
    for (const dependencyId of task.dependencies) {
      if (dependencyId === task.id) {
        throw new Error(`Task "${task.id}" cannot depend on itself.`);
      }

      const dependency = taskById.get(dependencyId);
      if (dependency === undefined) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dependencyId}".`);
      }

      const dependencyPhase = phaseByTaskId.get(dependencyId)!;
      const dependencyOrder = orderByTaskId.get(dependencyId)!;
      const taskOrder = orderByTaskId.get(task.id)!;

      if (dependencyPhase > task.phase) {
        throw new Error(
          `Task "${task.id}" depends on later-phase task "${dependencyId}" (${dependencyPhase} > ${task.phase}).`,
        );
      }

      if (dependencyPhase === task.phase && dependencyOrder >= taskOrder) {
        throw new Error(
          `Task "${task.id}" depends on "${dependencyId}" in the same phase, but it does not appear earlier in execution order.`,
        );
      }
    }

    if (task.role === 'integration-verifier') {
      const integrationDeps = task.dependencies
        .map((dependencyId) => taskById.get(dependencyId))
        .filter((dependency): dependency is TaskState => dependency !== undefined)
        .filter((dependency) => dependency.role === 'systems' || dependency.role === 'gameplay');

      if (integrationDeps.length === 0) {
        throw new Error(
          `Integration-verifier task "${task.id}" must depend on at least one systems or gameplay task.`,
        );
      }
    }
  }

  detectCycles(taskById);
  validateMilestoneScenes(plan);
  warnOversizedTasks(tasks.map((t) => t.task));
  return plan;
}

function validateMilestoneScenes(plan: TaskPlan): void {
  const standardCriteria = new Set([
    'renders-visibly',
    'primary-action-visible',
    'progression-possible',
    'no-runtime-blocker',
  ] as const);
  const sceneIds = new Set(plan.scenes);
  const milestoneSceneIds = new Set(plan.milestoneScenes.map((scene) => scene.sceneId));

  for (const requiredSceneId of ['MainMenuScene', 'CharacterSelectScene', 'MapScene']) {
    if (sceneIds.has(requiredSceneId) && !milestoneSceneIds.has(requiredSceneId)) {
      throw new Error(`Plan is missing milestone scene acceptance criteria for "${requiredSceneId}".`);
    }
  }

  for (const milestoneScene of plan.milestoneScenes) {
    if (!sceneIds.has(milestoneScene.sceneId)) {
      throw new Error(
        `Milestone scene "${milestoneScene.sceneId}" is not present in the plan scenes list.`,
      );
    }

    const criterionIds = new Set(milestoneScene.acceptanceCriteria.map((criterion) => criterion.id));
    for (const criterionId of standardCriteria) {
      if (!criterionIds.has(criterionId)) {
        throw new Error(
          `Milestone scene "${milestoneScene.sceneId}" is missing standard acceptance criterion "${criterionId}".`,
        );
      }
    }
  }
}

function flattenTasks(plan: TaskPlan): Array<{ task: TaskState; phase: number; order: number }> {
  let order = 0;

  return plan.phases.flatMap((phase) =>
    phase.tasks.map((task) => ({
      task,
      phase: phase.phase,
      order: order++,
    })),
  );
}

function detectCycles(taskById: Map<string, TaskState>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (taskId: string): void => {
    if (visited.has(taskId)) return;

    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      const cycle = [...stack.slice(cycleStart), taskId].join(' -> ');
      throw new Error(`Circular task dependency detected: ${cycle}`);
    }

    visiting.add(taskId);
    stack.push(taskId);

    const task = taskById.get(taskId);
    if (task !== undefined) {
      for (const dependencyId of task.dependencies) {
        visit(dependencyId);
      }
    }

    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const taskId of taskById.keys()) {
    visit(taskId);
  }
}

/**
 * Heuristic checks that warn (to stderr) when a task looks too broad
 * for the agent's token budget. These are warnings, not hard errors —
 * they surface during plan creation so the developer can review.
 */
function warnOversizedTasks(tasks: TaskState[]): void {
  const SCENE_PATTERN = /\b(?:Scene|screen|scene)\b/gi;
  const AND_PATTERN = /\band\b/gi;

  for (const task of tasks) {
    const warnings: string[] = [];
    const text = `${task.title} ${task.description}`;

    // Multiple scenes in one task
    const sceneMatches = text.match(SCENE_PATTERN) ?? [];
    if (sceneMatches.length >= 2 && task.role === 'gameplay') {
      warnings.push('bundles multiple scenes — each scene should be its own task');
    }

    // "and" in title often signals bundled concerns
    const titleAnds = task.title.match(AND_PATTERN) ?? [];
    if (titleAnds.length >= 2) {
      warnings.push('title contains multiple "and" conjunctions — may be bundling separate concerns');
    }

    // Acceptance criteria count — more than 5 suggests the task is too broad
    if (task.acceptanceCriteria.length > 5) {
      warnings.push(`${task.acceptanceCriteria.length} acceptance criteria — consider splitting`);
    }

    for (const w of warnings) {
      console.error(`[plan-validation] WARNING: task "${task.id}" ${w}`);
    }
  }
}
