BEGIN TRANSACTION;

ALTER TABLE approvals ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE approvals ADD COLUMN args_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_approvals_scope
  ON approvals(tool_name, args_hash, project_id, status, scope);

COMMIT;
