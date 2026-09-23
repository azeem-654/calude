-- ─────────────────────────────────────────────────────────────────────────────
-- Making the housekeeping cheap enough to run.
--
-- ── What went wrong ──
--
-- Four prunes ran on every one of the 288 daily ticks, and three of them were
-- "keep the newest N rows", which SQLite can only answer by sorting the whole
-- table and then testing every row against a list of ten thousand ids. On a log
-- holding its cap that is roughly 10,000 rows read per statement per tick —
-- around three million rows a day, from housekeeping alone, to delete nothing
-- at all on almost every run. Cloudflare's warning that the account was at 77%
-- of the daily D1 operation limit was very largely this.
--
-- ── The change ──
--
-- Pruning is now by *age* rather than by count, which an index on `created_at`
-- answers directly: the database reads the rows it is about to delete and no
-- others. And it runs hourly rather than every five minutes, because nothing
-- here is time-sensitive — a log row that lives an extra fifty-five minutes
-- costs nobody anything.
--
-- The existing indexes are all `(account_id, created_at)`, which serves "this
-- workspace's recent log" and cannot serve "everything older than a date"
-- across all workspaces. Hence a plain one on each.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_delivery_age   ON crm_delivery_log (created_at);
CREATE INDEX IF NOT EXISTS idx_autolog_age    ON crm_automation_log (created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_age ON crm_agent_runs (created_at);
