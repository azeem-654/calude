-- The owner's AI health monitor (lib/aiHealth.ts, /api/ai-health.php).
--
-- crm_ai_usage counts requests per model and module, but a failure is only
-- written there when it is a 429: a refused key, a 5xx or a search that came
-- back with nothing to cite left no trace. This is one row per tool
-- (lib/aiTools.ts AI_TOOLS) with the last time it worked and the last time
-- every key failed it, and how many failures in a row — written by
-- lib/aiToolHealth.ts as calls finish (a success at most every ten minutes
-- per isolate, so it costs next to nothing). Never a key, and the error is
-- scrubbed of anything that looks like one before it is stored.
CREATE TABLE IF NOT EXISTS crm_ai_tool_health (
  tool           TEXT PRIMARY KEY,
  last_ok_at     TEXT,
  last_error_at  TEXT,
  last_error     TEXT NOT NULL DEFAULT '',
  fail_streak    INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT
);

-- One row per tool and condition (missing_key, failing, quota80, quota95):
-- when the owner was last mailed about it, so the same thing is mailed at
-- most once a day. `sent_at` is set only when a mail was accepted; a run that
-- could not send (no mailbox connected) writes `outcome` and leaves `sent_at`
-- alone, so the next hourly run tries again rather than pretending it went.
CREATE TABLE IF NOT EXISTS crm_ai_alerts (
  tool             TEXT NOT NULL,
  condition        TEXT NOT NULL,
  sent_at          TEXT,
  last_attempt_at  TEXT,
  outcome          TEXT NOT NULL DEFAULT '',
  detail           TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tool, condition)
);
