-- ─────────────────────────────────────────────────────────────────────────────
-- Plan allowances: what each package allows, and what has been used.
--
-- The rules are in worker/src/lib/allowances.ts (pure, shared with the
-- browser); the reads and writes in worker/src/lib/allowanceStore.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- One line per thing made that a monthly allowance counts: a social post, an
-- AI Short's first render, a recording processed, a prospect added.
--
-- Keyed by (meter, ref), where ref names the thing (`<workspace>:<post id>`),
-- so a retried job or a redelivered step writes the same key and is counted
-- once — the rule crm_video_usage's (job_id, kind) already follows.
--
-- `subscriber` is the person who pays (the workspace owner's email, or
-- `ws:<id>` for a workspace with no recorded owner), written at the moment of
-- counting: the allowance is theirs across every workspace they own.
CREATE TABLE IF NOT EXISTS crm_usage (
  meter       TEXT NOT NULL,
  ref         TEXT NOT NULL,
  subscriber  TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  -- m:YYYY-MM, UTC
  period      TEXT NOT NULL,
  units       REAL NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (meter, ref)
);
CREATE INDEX IF NOT EXISTS idx_usage_subscriber ON crm_usage(subscriber, meter, period);
CREATE INDEX IF NOT EXISTS idx_usage_account ON crm_usage(account_id, period);

-- The install owner's changes to a plan's numbers (Sign-ups & trials →
-- Plans & allowances). Absent means the number in allowances.ts. `plan_id` is
-- a plan id or 'trial'; `value` -1 is unlimited.
CREATE TABLE IF NOT EXISTS crm_plan_limits (
  plan_id     TEXT NOT NULL,
  meter       TEXT NOT NULL,
  value       INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (plan_id, meter)
);
