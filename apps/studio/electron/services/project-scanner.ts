import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ProjectDetails, ProjectPlanSummary, ProjectSummary } from '../../shared/domain.js';
import { isPathInsideRoot } from '../db/normalize-path.js';
import type { ProjectsRepository } from '../db/repositories/projects-repository.js';
import type { TaskPlanRecord, TaskPlansRepository } from '../db/repositories/task-plans-repository.js';
import type { TaskStatus } from '@agent-harness/core';

interface TaskLike {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  result?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  error?: unknown;
}

function formatTaskTitle(taskId: string): string {
  return taskId
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTaskStatus(status: unknown): TaskStatus {
  switch (status) {
    case 'pending':
    case 'planning':
    case 'in-progress':
    case 'blocked':
    case 'review':
    case 'complete':
    case 'failed':
      return status;
    default:
      return 'pending';
  }
}

function summarizePlan(planJson: string): ProjectPlanSummary {
  const parsed = JSON.parse(planJson) as Record<string, unknown>;
  const phases = Array.isArray(parsed['phases']) ? parsed['phases'] : [];
  const tasks = phases.flatMap((phase) => {
    if (typeof phase !== 'object' || phase === null) {
      return [];
    }

    const phaseTasks = (phase as Record<string, unknown>)['tasks'];
    if (!Array.isArray(phaseTasks)) {
      return [];
    }

    return phaseTasks.filter((task): task is TaskLike & Record<string, unknown> => {
      return typeof task === 'object' && task !== null && typeof (task as TaskLike).id === 'string';
    });
  });

  const taskCount = tasks.length;
  const completeCount = tasks.filter((task) => normalizeTaskStatus(task.status) === 'complete').length;

  return {
    title: typeof parsed.gameTitle === 'string' ? parsed.gameTitle : null,
    taskCount,
    completeCount,
  };
}

export class ProjectScanner {
  public constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly taskPlansRepository: TaskPlansRepository,
  ) {}

  public list(workspaceRoot: string): ProjectSummary[] {
    return this.projectsRepository
      .listWithPlans()
      .filter((project) => isPathInsideRoot(project.displayPath, workspaceRoot))
      .map((project) => {
        const taskPlan =
          this.getCurrentTaskPlan(project.id, project.displayPath, project.planJson) ?? {
            projectId: project.id,
            planJson: project.planJson,
            updatedAt: project.planUpdatedAt,
          };
        const planSummary = summarizePlan(taskPlan.planJson);
        const title = project.title ?? planSummary.title ?? basename(project.displayPath);

        return {
          id: project.id,
          name: title,
          title,
          path: project.displayPath,
          displayPath: project.displayPath,
          status: existsSync(project.displayPath) ? 'ready' : 'unknown',
          taskCount: planSummary.taskCount,
          completeCount: planSummary.completeCount,
          updatedAt: new Date(Math.max(project.updatedAt, taskPlan.updatedAt)).toISOString(),
        };
      });
  }

  public getInfo(projectId: string): ProjectDetails | null {
    const project = this.projectsRepository.getById(projectId);
    if (project === null) {
      return null;
    }

    const taskPlan = this.getCurrentTaskPlan(projectId, project.displayPath);
    const planSummary = taskPlan === null ? { title: null, taskCount: 0, completeCount: 0 } : summarizePlan(taskPlan.planJson);
    const title = project.title ?? planSummary.title ?? basename(project.displayPath);

    return {
      id: project.id,
      name: title,
      title,
      path: project.displayPath,
      displayPath: project.displayPath,
      status: existsSync(project.displayPath) ? 'ready' : 'unknown',
      taskCount: planSummary.taskCount,
      completeCount: planSummary.completeCount,
      updatedAt: new Date(Math.max(project.updatedAt, taskPlan?.updatedAt ?? project.updatedAt)).toISOString(),
      hasTaskPlan: taskPlan !== null,
    };
  }

  public getPlan(projectId: string): unknown | null {
    const project = this.projectsRepository.getById(projectId);
    if (project === null) {
      return null;
    }

    const taskPlan = this.getCurrentTaskPlan(projectId, project.displayPath);
    if (taskPlan === null) {
      return null;
    }

    return JSON.parse(taskPlan.planJson) as unknown;
  }

  private getCurrentTaskPlan(
    projectId: string,
    projectPath: string,
    cachedPlanJson?: string,
  ): TaskPlanRecord | null {
    const cachedPlan = this.taskPlansRepository.getByProjectId(projectId);
    const tasksPath = join(projectPath, 'harness', 'tasks.json');
    if (!existsSync(tasksPath)) {
      return cachedPlan;
    }

    try {
      const diskPlanJson = readFileSync(tasksPath, 'utf8');
      const diskPlan = JSON.parse(diskPlanJson) as Record<string, unknown>;
      const mergedPlanJson = this.mergeTaskPlanJson(cachedPlan?.planJson, diskPlan);

      if (cachedPlanJson === undefined || cachedPlanJson !== mergedPlanJson) {
        return this.taskPlansRepository.upsert({
          projectId,
          planJson: mergedPlanJson,
        });
      }
    } catch {
      return cachedPlan;
    }

    return this.taskPlansRepository.getByProjectId(projectId);
  }

  private mergeTaskPlanJson(cachedPlanJson: string | undefined, diskPlan: Record<string, unknown>): string {
    if (cachedPlanJson === undefined) {
      return JSON.stringify(this.withFallbackTaskTitles(diskPlan));
    }

    let cachedPlan: Record<string, unknown>;
    try {
      cachedPlan = JSON.parse(cachedPlanJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify(this.withFallbackTaskTitles(diskPlan));
    }

    const cachedPhases = Array.isArray(cachedPlan['phases']) ? cachedPlan['phases'] : [];
    const diskPhases = Array.isArray(diskPlan['phases']) ? diskPlan['phases'] : [];
    const diskTasksById = new Map<string, TaskLike & Record<string, unknown>>();

    for (const phase of diskPhases) {
      if (typeof phase !== 'object' || phase === null) {
        continue;
      }

      const tasks = (phase as Record<string, unknown>)['tasks'];
      if (!Array.isArray(tasks)) {
        continue;
      }

      for (const task of tasks) {
        if (typeof task !== 'object' || task === null) {
          continue;
        }

        const candidate = task as TaskLike & Record<string, unknown>;
        if (typeof candidate.id === 'string') {
          diskTasksById.set(candidate.id, candidate);
        }
      }
    }

    const mergedPhases = cachedPhases.map((phase) => {
      if (typeof phase !== 'object' || phase === null) {
        return phase;
      }

      const phaseRecord = phase as Record<string, unknown>;
      const tasks = phaseRecord['tasks'];
      if (!Array.isArray(tasks)) {
        return phase;
      }

      return {
        ...phaseRecord,
        tasks: tasks.map((task) => {
          if (typeof task !== 'object' || task === null) {
            return task;
          }

          const taskRecord = task as TaskLike & Record<string, unknown>;
          if (typeof taskRecord.id !== 'string') {
            return task;
          }

          const diskTask = diskTasksById.get(taskRecord.id);
          if (diskTask === undefined) {
            return task;
          }

          return {
            ...taskRecord,
            ...(typeof taskRecord.title === 'string'
              ? {}
              : { title: formatTaskTitle(taskRecord.id) }),
            status: normalizeTaskStatus(diskTask.status ?? taskRecord.status),
            ...(diskTask.result !== undefined ? { result: diskTask.result } : {}),
            ...(typeof diskTask.updatedAt === 'string' ? { updatedAt: diskTask.updatedAt } : {}),
            ...(typeof diskTask.completedAt === 'string' ? { completedAt: diskTask.completedAt } : {}),
            ...(typeof diskTask.error === 'string' ? { error: diskTask.error } : {}),
          };
        }),
      };
    });

    return JSON.stringify({
      ...this.withFallbackTaskTitles(cachedPlan),
      ...(typeof diskPlan['gameTitle'] === 'string' ? { gameTitle: diskPlan['gameTitle'] } : {}),
      phases: mergedPhases,
    });
  }

  private withFallbackTaskTitles(plan: Record<string, unknown>): Record<string, unknown> {
    const phases = Array.isArray(plan['phases']) ? plan['phases'] : [];

    return {
      ...plan,
      phases: phases.map((phase) => {
        if (typeof phase !== 'object' || phase === null) {
          return phase;
        }

        const phaseRecord = phase as Record<string, unknown>;
        const tasks = phaseRecord['tasks'];
        if (!Array.isArray(tasks)) {
          return phase;
        }

        return {
          ...phaseRecord,
          tasks: tasks.map((task) => {
            if (typeof task !== 'object' || task === null) {
              return task;
            }

            const taskRecord = task as TaskLike & Record<string, unknown>;
            if (typeof taskRecord.id !== 'string' || typeof taskRecord.title === 'string') {
              return task;
            }

            return {
              ...taskRecord,
              title: formatTaskTitle(taskRecord.id),
              status: normalizeTaskStatus(taskRecord.status),
            };
          }),
        };
      }),
    };
  }
}
