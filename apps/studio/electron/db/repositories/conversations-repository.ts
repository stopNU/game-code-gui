import { randomUUID } from 'crypto';
import type { DatabaseConnection, StatementSync } from '../sqlite.js';

type Provider = 'anthropic' | 'openai';
type MessageRole = 'user' | 'assistant' | 'system' | 'error';

interface ConversationRow {
  id: string;
  project_id: string | null;
  title: string;
  model: string | null;
  provider: Provider;
  created_at: number;
  updated_at: number;
  archived: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content_blocks: string;
  created_at: number;
  langsmith_run_id: string | null;
}

export interface ConversationRecord {
  id: string;
  projectId: string | null;
  title: string;
  model: string | null;
  provider: Provider;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  contentBlocks: unknown[];
  createdAt: number;
  langsmithRunId: string | null;
}

function mapConversationRow(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    model: row.model,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived === 1,
  };
}

function mapMessageRow(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    seq: row.seq,
    role: row.role,
    contentBlocks: JSON.parse(row.content_blocks) as unknown[],
    createdAt: row.created_at,
    langsmithRunId: row.langsmith_run_id,
  };
}

export class ConversationsRepository {
  private readonly listAllStatement: StatementSync;
  private readonly listByProjectStatement: StatementSync;
  private readonly getByIdStatement: StatementSync;
  private readonly insertStatement: StatementSync;
  private readonly ensureStatement: StatementSync;
  private readonly deleteStatement: StatementSync;
  private readonly renameStatement: StatementSync;
  private readonly getMessagesStatement: StatementSync;
  private readonly nextSeqStatement: StatementSync;
  private readonly insertMessageStatement: StatementSync;
  private readonly touchStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.listAllStatement = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
    this.listByProjectStatement = db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC');
    this.getByIdStatement = db.prepare('SELECT * FROM conversations WHERE id = ?');
    this.insertStatement = db.prepare(
      `
        INSERT INTO conversations (id, project_id, title, model, provider, created_at, updated_at, archived)
        VALUES (@id, @projectId, @title, @model, @provider, @createdAt, @updatedAt, 0)
      `,
    );
    this.ensureStatement = db.prepare(
      `
        INSERT INTO conversations (id, project_id, title, model, provider, created_at, updated_at, archived)
        VALUES (@id, @projectId, @title, @model, @provider, @createdAt, @updatedAt, 0)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          model = excluded.model,
          provider = excluded.provider,
          updated_at = excluded.updated_at
      `,
    );
    this.deleteStatement = db.prepare('DELETE FROM conversations WHERE id = ?');
    this.renameStatement = db.prepare(
      'UPDATE conversations SET title = @title, updated_at = @updatedAt WHERE id = @id',
    );
    this.getMessagesStatement = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC');
    this.nextSeqStatement = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM messages WHERE conversation_id = ?');
    this.insertMessageStatement = db.prepare(
      `
        INSERT INTO messages (id, conversation_id, seq, role, content_blocks, created_at, langsmith_run_id)
        VALUES (@id, @conversationId, @seq, @role, @contentBlocks, @createdAt, @langsmithRunId)
      `,
    );
    this.touchStatement = db.prepare('UPDATE conversations SET updated_at = @updatedAt WHERE id = @id');
  }

  public list(projectId?: string): ConversationRecord[] {
    const rows =
      projectId === undefined
        ? ((this.listAllStatement.all() as unknown) as ConversationRow[])
        : ((this.listByProjectStatement.all(projectId) as unknown) as ConversationRow[]);
    return rows.map(mapConversationRow);
  }

  public getById(id: string): ConversationRecord | null {
    const row = this.getByIdStatement.get(id) as ConversationRow | undefined;
    return row === undefined ? null : mapConversationRow(row);
  }

  public create(args: {
    projectId?: string | null;
    title: string;
    model?: string | null;
    provider: Provider;
  }): ConversationRecord {
    const now = Date.now();
    const id = randomUUID();

    this.insertStatement.run({
      id,
      projectId: args.projectId ?? null,
      title: args.title,
      model: args.model ?? null,
      provider: args.provider,
      createdAt: now,
      updatedAt: now,
    });

    const conversation = this.getById(id);
    if (conversation === null) {
      throw new Error(`Failed to create conversation ${id}.`);
    }

    return conversation;
  }

  public ensure(args: {
    id: string;
    projectId?: string | null;
    title: string;
    model?: string | null;
    provider: Provider;
  }): ConversationRecord {
    const now = Date.now();
    this.ensureStatement.run({
      id: args.id,
      projectId: args.projectId ?? null,
      title: args.title,
      model: args.model ?? null,
      provider: args.provider,
      createdAt: now,
      updatedAt: now,
    });

    const conversation = this.getById(args.id);
    if (conversation === null) {
      throw new Error(`Failed to ensure conversation ${args.id}.`);
    }

    return conversation;
  }

  public delete(id: string): void {
    this.deleteStatement.run(id);
  }

  public rename(id: string, title: string): ConversationRecord | null {
    this.renameStatement.run({
      id,
      title,
      updatedAt: Date.now(),
    });
    return this.getById(id);
  }

  public getMessages(conversationId: string): MessageRecord[] {
    return (this.getMessagesStatement.all(conversationId) as unknown as MessageRow[]).map(mapMessageRow);
  }

  public createMessage(args: {
    conversationId: string;
    role: MessageRole;
    contentBlocks: unknown[];
    langsmithRunId?: string | null;
  }): MessageRecord {
    const id = randomUUID();
    const createdAt = Date.now();
    const nextSeqRow = this.nextSeqStatement.get(args.conversationId) as { next_seq: number } | undefined;
    const seq = nextSeqRow?.next_seq ?? 1;

    this.insertMessageStatement.run({
      id,
      conversationId: args.conversationId,
      seq,
      role: args.role,
      contentBlocks: JSON.stringify(args.contentBlocks),
      createdAt,
      langsmithRunId: args.langsmithRunId ?? null,
    });
    this.touchStatement.run({
      id: args.conversationId,
      updatedAt: createdAt,
    });

    const messages = this.getMessages(args.conversationId);
    const message = messages.at(-1);
    if (message === undefined) {
      throw new Error(`Failed to create message for conversation ${args.conversationId}.`);
    }

    return message;
  }
}
