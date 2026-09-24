-- ─────────────────────────────────────────────────────────────────────────────
-- What an agent read last time, so it can tell when nothing has changed.
--
-- A feed and a channel carry dates, so "only what is new since the last run"
-- is a date comparison. A website and a web search do not: a page reads the
-- same on Tuesday as on Monday, and a search returns the same five results
-- until something new happens. Without a record of what was read, a daily agent
-- pointed at a company's "news" page writes the same post every morning.
--
-- A hash of what was read, per run. The next run compares; the same hash means
-- nothing new, which is recorded as *skipped* — the ordinary outcome on most
-- days, and deliberately not counted as work done.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_agent_runs ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_agent_runs_node
  ON crm_agent_runs (workflow_id, node_id, created_at DESC);
