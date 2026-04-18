import type { DatabaseConnection, StatementSync } from '../sqlite.js';

export interface ConversationTokensRecord {
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

interface ConversationTokensRow {
  conversation_id: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

function mapRow(row: ConversationTokensRow): ConversationTokensRecord {
  return {
    conversationId: row.conversation_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
  };
}

export class ConversationTokensRepository {
  private readonly getByConversationIdStatement: StatementSync;
  private readonly addStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection) {
    this.getByConversationIdStatement = db.prepare('SELECT * FROM conversation_tokens WHERE conversation_id = ?');
    this.addStatement = db.prepare(
      `
        INSERT INTO conversation_tokens (conversation_id, input_tokens, output_tokens, cached_tokens)
        VALUES (@conversationId, @inputTokens, @outputTokens, @cachedTokens)
        ON CONFLICT(conversation_id) DO UPDATE SET
          input_tokens = conversation_tokens.input_tokens + excluded.input_tokens,
          output_tokens = conversation_tokens.output_tokens + excluded.output_tokens,
          cached_tokens = conversation_tokens.cached_tokens + excluded.cached_tokens
      `,
    );
  }

  public getByConversationId(conversationId: string): ConversationTokensRecord | null {
    const row = this.getByConversationIdStatement.get(conversationId) as ConversationTokensRow | undefined;
    return row === undefined ? null : mapRow(row);
  }

  public add(args: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
  }): ConversationTokensRecord {
    this.addStatement.run(args);
    const tokens = this.getByConversationId(args.conversationId);
    if (tokens === null) {
      throw new Error(`Failed to update tokens for conversation ${args.conversationId}.`);
    }

    return tokens;
  }
}
