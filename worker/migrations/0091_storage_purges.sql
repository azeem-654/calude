-- T-3: a closed workspace's stored files are deleted by a queued job.
--
-- Closing a workspace deleted its rows and left every file it had stored in R2
-- (videos, pictures, booking clips, hosted mail) behind, unreachable but kept
-- and paid for. Deleting a large workspace's files can take longer than one
-- request may run, so the prefixes are queued here and the cron works through
-- them (lib/storageSweep.ts), stamping `done_at` when the prefix lists empty.
--
-- `workspace`, not `account_id`: closeWorkspace deletes every table with an
-- account_id column, and this one must outlive the workspace it is about.
CREATE TABLE IF NOT EXISTS crm_storage_purges (
  prefix     TEXT PRIMARY KEY,
  workspace  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_crm_storage_purges_open ON crm_storage_purges (done_at);
