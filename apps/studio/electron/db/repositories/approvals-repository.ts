import type { DatabaseConnection, StatementSync } from '../sqlite.js';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout' | 'aborted';
export type ApprovalScope = 'once' | 'conversation' | 'project';

interface ApprovalRow {
  id: string;
  conversation_id: string;
  tool_call_id: string;
  tool_name: string;
  args: string;
  args_hash: string | null;
  project_id: string | null;
  risk_level: string;
  rationale: string | null;
  status: ApprovalStatus;
  scope: ApprovalScope | null;
  decided_by: string | null;
  decided_at: number | null;
  created_at: number;
}

export interface ApprovalRecord {
  id: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  argsHash: string | null;
  projectId: string | null;
  riskLevel: string;
  rationale: string | null;
  status: ApprovalStatus;
  scope: ApprovalScope | null;
  decidedBy: string | null;
  decidedAt: number | null;
  createdAt: number;
}

function mapApprovalRow(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    args: JSON.parse(row.args) as unknown,
    argsHash: row.args_hash,
    projectId: row.project_id,
    riskLevel: row.risk_level,
    rationale: row.rationale,
    status: row.status,
    scope: row.scope,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export class ApprovalsRepository {
  private readonly listPendingStatement: StatementSync;
  private readonly listPendingByConversationStatement: StatementSync;
  private readonly getByIdStatement: StatementSync;
  private readonly insertStatement: StatementSync;
  private readonly decideStatement: StatementSync;
  private readonly findReusableDecisionStatement: StatementSync;
  private readonly abortPendingStatement: StatementSync;
  private readonly abortPendingByConversationStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.listPendingStatement = db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC");
    this.listPendingByConversationStatement = db.prepare(
      "SELECT * FROM approvals WHERE conversation_id = ? AND status = 'pending' ORDER BY created_at DESC",
    );
    this.getByIdStatement = db.prepare('SELECT * FROM approvals WHERE id = ?');
    this.insertStatement = db.prepare(
      `
        INSERT INTO approvals (
          id,
          conversation_id,
          tool_call_id,
          tool_name,
          args,
          args_hash,
          project_id,
          risk_level,
          rationale,
          status,
          scope,
          decided_by,
          decided_at,
          created_at
        ) VALUES (
          @id,
          @conversationId,
          @toolCallId,
          @toolName,
          @args,
          @argsHash,
          @projectId,
          @riskLevel,
          @rationale,
          @status,
          @scope,
          @decidedBy,
          @decidedAt,
          @createdAt
        )
      `,
    );
    this.decideStatement = db.prepare(
      `
        UPDATE approvals
        SET status = @status, scope = @scope, decided_by = @decidedBy, decided_at = @decidedAt
        WHERE id = @id
      `,
    );
    this.findReusableDecisionStatement = db.prepare(
      `
        SELECT *
        FROM approvals
        WHERE tool_name = @toolName
          AND args_hash = @argsHash
          AND status = 'approved'
          AND (
            scope = 'project'
            AND ((project_id IS NULL AND @projectId IS NULL) OR project_id = @projectId)
            OR scope = 'conversation'
            AND conversation_id = @conversationId
          )
        ORDER BY decided_at DESC, created_at DESC
        LIMIT 1
      `,
    );
    this.abortPendingStatement = db.prepare("UPDATE approvals SET status = 'aborted', decided_at = @decidedAt WHERE status = 'pending'");
    this.abortPendingByConversationStatement = db.prepare(
      "UPDATE approvals SET status = 'aborted', decided_at = @decidedAt WHERE status = 'pending' AND conversation_id = @conversationId",
    );
  }

  public listPending(conversationId?: string): ApprovalRecord[] {
    const rows =
      conversationId === undefined
        ? ((this.listPendingStatement.all() as unknown) as ApprovalRow[])
        : ((this.listPendingByConversationStatement.all(conversationId) as unknown) as ApprovalRow[]);
    return rows.map(mapApprovalRow);
  }

  public getById(id: string): ApprovalRecord | null {
    const row = this.getByIdStatement.get(id) as ApprovalRow | undefined;
    return row === undefined ? null : mapApprovalRow(row);
  }

  public create(args: {
    id: string;
    conversationId: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
    argsHash: string;
    projectId?: string | null;
    riskLevel: string;
    rationale: string;
  }): ApprovalRecord {
    this.insertStatement.run({
      id: args.id,
      conversationId: args.conversationId,
      toolCallId: args.toolCallId,
      toolName: args.toolName,
      args: JSON.stringify(args.args),
      argsHash: args.argsHash,
      projectId: args.projectId ?? null,
      riskLevel: args.riskLevel,
      rationale: args.rationale,
      status: 'pending',
      scope: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: Date.now(),
    });

    const approval = this.getById(args.id);
    if (approval === null) {
      throw new Error(`Failed to create approval ${args.id}.`);
    }

    return approval;
  }

  public findReusableDecision(args: {
    conversationId: string;
    toolName: string;
    argsHash: string;
    projectId?: string | null;
  }): ApprovalRecord | null {
    const row = this.findReusableDecisionStatement.get({
      conversationId: args.conversationId,
      toolName: args.toolName,
      argsHash: args.argsHash,
      projectId: args.projectId ?? null,
    }) as ApprovalRow | undefined;
    return row === undefined ? null : mapApprovalRow(row);
  }

  public decide(args: {
    id: string;
    status: Exclude<ApprovalStatus, 'pending'>;
    scope?: ApprovalScope;
    decidedBy?: string;
  }): ApprovalRecord | null {
    this.decideStatement.run({
      id: args.id,
      status: args.status,
      scope: args.scope ?? null,
      decidedBy: args.decidedBy ?? null,
      decidedAt: Date.now(),
    });

    return this.getById(args.id);
  }

  public abortPending(conversationId?: string): void {
    const decidedAt = Date.now();
    if (conversationId === undefined) {
      this.abortPendingStatement.run({ decidedAt });
      return;
    }

    this.abortPendingByConversationStatement.run({
      conversationId,
      decidedAt,
    });
  }
}
