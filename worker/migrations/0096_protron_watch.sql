-- Protron's campaign watch (worker/src/lib/protronWatch.ts): one row per
-- workspace × campaign × kind of problem, stamped when the customer was last
-- told, so an under-performing campaign is raised once a week, not every hour.
CREATE TABLE IF NOT EXISTS crm_protron_alerts (
  account_id  TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,   -- low_replies | failing_sends
  told_at     TEXT NOT NULL,
  PRIMARY KEY (account_id, source_id, kind)
);
