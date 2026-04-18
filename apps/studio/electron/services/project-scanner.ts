import { basename } from 'path';
import { existsSync } from 'fs';
import type { ProjectDetails, ProjectPlanSummary, ProjectSummary } from '../../shared/domain.js';
import { isPathInsideRoot } from '../db/normalize-path.js';
import type { ProjectsRepository } from '../db/repositories/projects-repository.js';
import type { TaskPlansRepository } from '../db/repositories/task-plans-repository.js';

interface TaskLike {
  id?: unknown;
  title?: unknown;
  status?: unknown;
}

function summarizePlan(planJson: string): ProjectPlanSummary {
  const parsed = JSON.parse(planJson) as Record<string, unknown>;
  let taskCount = 0;
  let completeCount = 0;

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value !== 'object' || value === null) {
      return;
    }

    const candidate = value as TaskLike & Record<string, unknown>;
    if (
      typeof candidate.id === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.status === 'string'
    ) {
      taskCount += 1;
      if (candidate.status === 'complete') {
        completeCount += 1;
      }
    }

    for (const nestedValue of Object.values(candidate)) {
      visit(nestedValue);
    }
  };

  visit(parsed);

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
        const planSummary = summarizePlan(project.planJson);
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
          updatedAt: new Date(Math.max(project.updatedAt, project.planUpdatedAt)).toISOString(),
        };
      });
  }

  public getInfo(projectId: string): ProjectDetails | null {
    const project = this.projectsRepository.getById(projectId);
    if (project === null) {
      return null;
    }

    const taskPlan = this.taskPlansRepository.getByProjectId(projectId);
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
    const taskPlan = this.taskPlansRepository.getByProjectId(projectId);
    if (taskPlan === null) {
      return null;
    }

    return JSON.parse(taskPlan.planJson) as unknown;
  }
}
