import { randomUUID } from 'crypto';
import type { DatabaseConnection, StatementSync } from '../sqlite.js';

export interface ProjectRecord {
  id: string;
  normalizedPath: string;
  displayPath: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ProjectRow {
  id: string;
  path: string;
  display_path: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface ProjectWithPlanRow extends ProjectRow {
  plan_json: string;
  plan_updated_at: number;
}

export interface ProjectWithPlanRecord extends ProjectRecord {
  planJson: string;
  planUpdatedAt: number;
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    normalizedPath: row.path,
    displayPath: row.display_path,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectWithPlanRow(row: ProjectWithPlanRow): ProjectWithPlanRecord {
  return {
    ...mapProjectRow(row),
    planJson: row.plan_json,
    planUpdatedAt: row.plan_updated_at,
  };
}

export class ProjectsRepository {
  private readonly listStatement: StatementSync;
  private readonly getByIdStatement: StatementSync;
  private readonly getByPathStatement: StatementSync;
  private readonly upsertStatement: StatementSync;
  private readonly listWithPlansStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.listStatement = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
    this.getByIdStatement = db.prepare('SELECT * FROM projects WHERE id = ?');
    this.getByPathStatement = db.prepare('SELECT * FROM projects WHERE path = ?');
    this.upsertStatement = db.prepare(
      `
        INSERT INTO projects (id, path, display_path, title, created_at, updated_at)
        VALUES (@id, @path, @displayPath, @title, @createdAt, @updatedAt)
        ON CONFLICT(path) DO UPDATE SET
          display_path = excluded.display_path,
          title = excluded.title,
          updated_at = excluded.updated_at
      `,
    );
    this.listWithPlansStatement = db.prepare(
      `
        SELECT
          projects.*,
          task_plans.plan_json,
          task_plans.updated_at AS plan_updated_at
        FROM projects
        INNER JOIN task_plans ON task_plans.project_id = projects.id
        ORDER BY projects.updated_at DESC
      `,
    );
  }

  public listAll(): ProjectRecord[] {
    return (this.listStatement.all() as unknown as ProjectRow[]).map(mapProjectRow);
  }

  public listWithPlans(): ProjectWithPlanRecord[] {
    return (this.listWithPlansStatement.all() as unknown as ProjectWithPlanRow[]).map(mapProjectWithPlanRow);
  }

  public getById(id: string): ProjectRecord | null {
    const row = this.getByIdStatement.get(id) as ProjectRow | undefined;
    return row === undefined ? null : mapProjectRow(row);
  }

  public getByNormalizedPath(normalizedPath: string): ProjectRecord | null {
    const row = this.getByPathStatement.get(normalizedPath) as ProjectRow | undefined;
    return row === undefined ? null : mapProjectRow(row);
  }

  public upsert(args: {
    normalizedPath: string;
    displayPath: string;
    title?: string | null;
  }): ProjectRecord {
    const existing = this.getByNormalizedPath(args.normalizedPath);
    const now = Date.now();
    const id = existing?.id ?? randomUUID();
    const createdAt = existing?.createdAt ?? now;

    this.upsertStatement.run({
      id,
      path: args.normalizedPath,
      displayPath: args.displayPath,
      title: args.title ?? null,
      createdAt,
      updatedAt: now,
    });

    const project = this.getByNormalizedPath(args.normalizedPath);
    if (project === null) {
      throw new Error(`Failed to upsert project for path ${args.displayPath}.`);
    }

    return project;
  }
}
