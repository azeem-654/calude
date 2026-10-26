-- Industry snapshots and provisioning (phase 3).
--
-- The industry a workspace was set up for, written once: the microsite a
-- customer signed up from (`?industry=`), or the first snapshot installed.
-- An empty string is "not chosen"; the claim is `WHERE industry = ''`, so two
-- tabs racing to claim it cannot both win.
ALTER TABLE crm_workspaces ADD COLUMN industry TEXT NOT NULL DEFAULT '';

-- Every install of a snapshot into a workspace, as it happened. `added` is the
-- item keys it put there: the next install reads them to tell an item the
-- customer deleted (not put back) from one that was never there (added).
CREATE TABLE IF NOT EXISTS crm_snapshot_installs (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  snapshot_id  TEXT NOT NULL,
  version      INTEGER NOT NULL,
  mode         TEXT NOT NULL,            -- signup | install | upgrade | restore
  added        TEXT NOT NULL DEFAULT '[]',
  present      INTEGER NOT NULL DEFAULT 0, -- items already there, left as they were
  skipped      INTEGER NOT NULL DEFAULT 0, -- items the customer had deleted, not put back
  by_email     TEXT NOT NULL,
  by_role      TEXT NOT NULL,            -- owner | customer
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_installs_account ON crm_snapshot_installs(account_id, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_installs_created ON crm_snapshot_installs(created_at);
