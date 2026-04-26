BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS graph_checkpoints (
  thread_id     TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_id     TEXT,
  type          TEXT,
  checkpoint    BLOB NOT NULL,
  metadata      BLOB NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS graph_checkpoints_thread_idx
  ON graph_checkpoints (thread_id, checkpoint_ns, checkpoint_id DESC);

CREATE TABLE IF NOT EXISTS graph_writes (
  thread_id     TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id       TEXT NOT NULL,
  idx           INTEGER NOT NULL,
  channel       TEXT NOT NULL,
  type          TEXT,
  value         BLOB NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

COMMIT;
