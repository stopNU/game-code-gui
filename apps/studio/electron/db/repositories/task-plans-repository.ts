import type { DatabaseConnection, StatementSync } from '../sqlite.js';

export interface TaskPlanRecord {
  projectId: string;
  planJson: string;
  updatedAt: number;
}

interface TaskPlanRow {
  project_id: string;
  plan_json: string;
  updated_at: number;
}

function mapTaskPlanRow(row: TaskPlanRow): TaskPlanRecord {
  return {
    projectId: row.project_id,
    planJson: row.plan_json,
    updatedAt: row.updated_at,
  };
}

export class TaskPlansRepository {
  private readonly getByProjectIdStatement: StatementSync;
  private readonly upsertStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.getByProjectIdStatement = db.prepare('SELECT * FROM task_plans WHERE project_id = ?');
    this.upsertStatement = db.prepare(
      `
        INSERT INTO task_plans (project_id, plan_json, updated_at)
        VALUES (@projectId, @planJson, @updatedAt)
        ON CONFLICT(project_id) DO UPDATE SET
          plan_json = excluded.plan_json,
          updated_at = excluded.updated_at
      `,
    );
  }

  public getByProjectId(projectId: string): TaskPlanRecord | null {
    const row = this.getByProjectIdStatement.get(projectId) as TaskPlanRow | undefined;
    return row === undefined ? null : mapTaskPlanRow(row);
  }

  public upsert(args: { projectId: string; planJson: string }): TaskPlanRecord {
    this.upsertStatement.run({
      projectId: args.projectId,
      planJson: args.planJson,
      updatedAt: Date.now(),
    });

    const taskPlan = this.getByProjectId(args.projectId);
    if (taskPlan === null) {
      throw new Error(`Failed to upsert task plan for project ${args.projectId}.`);
    }

    return taskPlan;
  }
}
