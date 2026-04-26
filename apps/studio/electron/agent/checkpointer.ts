import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
  getCheckpointId,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
  type ChannelVersions,
} from '@langchain/langgraph-checkpoint';
import type { CheckpointMetadata, PendingWrite, SerializerProtocol } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { DatabaseConnection, StatementSync } from '../db/sqlite.js';

interface CheckpointRow {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_id: string | null;
  type: string | null;
  checkpoint: Uint8Array;
  metadata: Uint8Array;
  created_at: number;
}

interface WriteRow {
  task_id: string;
  channel: string;
  type: string | null;
  value: Uint8Array;
  idx: number;
}

/**
 * SQLite-backed `BaseCheckpointSaver` mirrors the upstream `MemorySaver` contract but persists
 * to the studio database (`graph_checkpoints` + `graph_writes`). Lives in the agent utility
 * process — it opens its own `DatabaseSync` against the same file the main process uses, which
 * is safe because journal_mode=WAL is enabled at open time.
 *
 * State is keyed by (thread_id, checkpoint_ns, checkpoint_id). thread_id == conversationId.
 */
export class StudioCheckpointer extends BaseCheckpointSaver {
  private readonly putStatement: StatementSync;
  private readonly getByIdStatement: StatementSync;
  private readonly getLatestStatement: StatementSync;
  private readonly listWritesStatement: StatementSync;
  private readonly putWriteStatement: StatementSync;
  private readonly listAllStatement: StatementSync;
  private readonly listByThreadStatement: StatementSync;
  private readonly deleteCheckpointsStatement: StatementSync;
  private readonly deleteWritesStatement: StatementSync;
  private readonly hasWriteStatement: StatementSync;

  public constructor(private readonly db: DatabaseConnection, serde?: SerializerProtocol) {
    super(serde);

    this.putStatement = db.prepare(`
      INSERT INTO graph_checkpoints
        (thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO UPDATE SET
        parent_id = excluded.parent_id,
        type = excluded.type,
        checkpoint = excluded.checkpoint,
        metadata = excluded.metadata,
        created_at = excluded.created_at
    `);

    this.getByIdStatement = db.prepare(`
      SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, metadata, created_at
      FROM graph_checkpoints
      WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
    `);

    this.getLatestStatement = db.prepare(`
      SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, metadata, created_at
      FROM graph_checkpoints
      WHERE thread_id = ? AND checkpoint_ns = ?
      ORDER BY checkpoint_id DESC
      LIMIT 1
    `);

    this.listAllStatement = db.prepare(`
      SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, metadata, created_at
      FROM graph_checkpoints
      ORDER BY thread_id ASC, checkpoint_ns ASC, checkpoint_id DESC
    `);

    this.listByThreadStatement = db.prepare(`
      SELECT thread_id, checkpoint_ns, checkpoint_id, parent_id, type, checkpoint, metadata, created_at
      FROM graph_checkpoints
      WHERE thread_id = ?
      ORDER BY checkpoint_ns ASC, checkpoint_id DESC
    `);

    this.listWritesStatement = db.prepare(`
      SELECT task_id, channel, type, value, idx
      FROM graph_writes
      WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
      ORDER BY task_id ASC, idx ASC
    `);

    this.putWriteStatement = db.prepare(`
      INSERT OR REPLACE INTO graph_writes
        (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.hasWriteStatement = db.prepare(`
      SELECT 1 AS hit FROM graph_writes
      WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND task_id = ? AND idx = ?
      LIMIT 1
    `);

    this.deleteCheckpointsStatement = db.prepare(
      'DELETE FROM graph_checkpoints WHERE thread_id = ?',
    );
    this.deleteWritesStatement = db.prepare(
      'DELETE FROM graph_writes WHERE thread_id = ?',
    );
  }

  public async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.['thread_id'] as string | undefined;
    if (threadId === undefined) {
      return undefined;
    }
    const checkpointNs = (config.configurable?.['checkpoint_ns'] as string | undefined) ?? '';
    const requestedId = getCheckpointId(config);

    const row = (requestedId !== undefined && requestedId !== ''
      ? this.getByIdStatement.get(threadId, checkpointNs, requestedId)
      : this.getLatestStatement.get(threadId, checkpointNs)) as CheckpointRow | undefined;
    if (row === undefined) {
      return undefined;
    }

    const checkpoint = (await this.serde.loadsTyped(
      row.type ?? 'json',
      toUint8(row.checkpoint),
    )) as Checkpoint;
    const metadata = (await this.serde.loadsTyped(
      row.type ?? 'json',
      toUint8(row.metadata),
    )) as CheckpointMetadata;

    const writeRows = this.listWritesStatement.all(
      threadId,
      checkpointNs,
      row.checkpoint_id,
    ) as unknown as WriteRow[];
    const pendingWrites: CheckpointTuple['pendingWrites'] = await Promise.all(
      writeRows.map(async (w) => [
        w.task_id,
        w.channel,
        await this.serde.loadsTyped(w.type ?? 'json', toUint8(w.value)),
      ] as [string, string, unknown]),
    );

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };
    if (row.parent_id !== null) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.parent_id,
        },
      };
    }
    return tuple;
  }

  public async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.['thread_id'] as string | undefined;
    const requestedNs = config.configurable?.['checkpoint_ns'] as string | undefined;
    const requestedCheckpointId = config.configurable?.['checkpoint_id'] as string | undefined;
    const before = options?.before?.configurable?.['checkpoint_id'] as string | undefined;
    const filter = options?.filter;
    let remaining = options?.limit;

    const rows = (threadId !== undefined
      ? this.listByThreadStatement.all(threadId)
      : this.listAllStatement.all()) as unknown as CheckpointRow[];

    for (const row of rows) {
      if (requestedNs !== undefined && row.checkpoint_ns !== requestedNs) {
        continue;
      }
      if (requestedCheckpointId !== undefined && row.checkpoint_id !== requestedCheckpointId) {
        continue;
      }
      if (before !== undefined && row.checkpoint_id >= before) {
        continue;
      }

      const metadata = (await this.serde.loadsTyped(
        row.type ?? 'json',
        toUint8(row.metadata),
      )) as CheckpointMetadata;

      if (filter !== undefined) {
        const matches = Object.entries(filter).every(
          ([key, value]) => (metadata as Record<string, unknown>)[key] === value,
        );
        if (!matches) {
          continue;
        }
      }

      if (remaining !== undefined) {
        if (remaining <= 0) {
          return;
        }
        remaining -= 1;
      }

      const checkpoint = (await this.serde.loadsTyped(
        row.type ?? 'json',
        toUint8(row.checkpoint),
      )) as Checkpoint;

      const writeRows = this.listWritesStatement.all(
        row.thread_id,
        row.checkpoint_ns,
        row.checkpoint_id,
      ) as unknown as WriteRow[];
      const pendingWrites = await Promise.all(
        writeRows.map(async (w) => [
          w.task_id,
          w.channel,
          await this.serde.loadsTyped(w.type ?? 'json', toUint8(w.value)),
        ] as [string, string, unknown]),
      );

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint,
        metadata,
        pendingWrites,
      };
      if (row.parent_id !== null) {
        tuple.parentConfig = {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.parent_id,
          },
        };
      }
      yield tuple;
    }
  }

  public async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.['thread_id'] as string | undefined;
    if (threadId === undefined) {
      throw new Error(
        'Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.',
      );
    }
    const checkpointNs = (config.configurable?.['checkpoint_ns'] as string | undefined) ?? '';
    const parentId = (config.configurable?.['checkpoint_id'] as string | undefined) ?? null;

    const prepared = copyCheckpoint(checkpoint);
    const [type, serializedCheckpoint] = await this.serde.dumpsTyped(prepared);
    const [, serializedMetadata] = await this.serde.dumpsTyped(metadata);

    this.putStatement.run(
      threadId,
      checkpointNs,
      checkpoint.id,
      parentId,
      type,
      serializedCheckpoint,
      serializedMetadata,
      Date.now(),
    );

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  public async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = config.configurable?.['thread_id'] as string | undefined;
    if (threadId === undefined) {
      throw new Error(
        'Failed to put writes. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.',
      );
    }
    const checkpointId = config.configurable?.['checkpoint_id'] as string | undefined;
    if (checkpointId === undefined) {
      throw new Error(
        'Failed to put writes. The passed RunnableConfig is missing a required "checkpoint_id" field in its "configurable" property.',
      );
    }
    const checkpointNs = (config.configurable?.['checkpoint_ns'] as string | undefined) ?? '';

    for (let i = 0; i < writes.length; i += 1) {
      const [channel, value] = writes[i] as PendingWrite;
      const mappedIdx = WRITES_IDX_MAP[channel];
      const idx = mappedIdx !== undefined ? mappedIdx : i;

      // Match upstream MemorySaver semantics: positive-idx writes are append-once; if a row
      // already exists for (taskId, idx) skip it. Negative-idx (special channels like errors)
      // always replace.
      if (idx >= 0) {
        const existing = this.hasWriteStatement.get(
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          idx,
        );
        if (existing !== undefined) {
          continue;
        }
      }

      const [type, serializedValue] = await this.serde.dumpsTyped(value);
      this.putWriteStatement.run(
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        idx,
        channel,
        type,
        serializedValue,
      );
    }
  }

  public async deleteThread(threadId: string): Promise<void> {
    this.deleteCheckpointsStatement.run(threadId);
    this.deleteWritesStatement.run(threadId);
  }
}

/**
 * `node:sqlite` returns BLOB columns as Buffer (a Uint8Array subclass) on Node 22+, but in some
 * environments it returns plain Uint8Array. Either way the serializer's `loadsTyped` accepts a
 * `Uint8Array | string`, so we just narrow the type without copying when possible.
 */
function toUint8(value: Uint8Array | Buffer | string): Uint8Array {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  return value;
}
