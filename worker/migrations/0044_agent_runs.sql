-- ─────────────────────────────────────────────────────────────────────────────
-- Workflows that are not about a person.
--
-- ── The gap this fills ──
--
-- Every workflow so far starts when somebody does something — a form is filled
-- in, a tag is added — and walks one contact through the graph. That is the
-- right model for follow-up and the wrong one for the thing customers keep
-- asking for: "read our portfolio and write us a social post every morning".
-- There is no contact in that sentence. Forcing one would mean inventing a
-- fake person to stand in the graph, and every send step downstream would then
-- happily email them.
--
-- So a trigger may instead be a *schedule*, and a graph on a schedule runs with
-- no contact at all. `triggerMatches()` already refuses these, because no
-- contact event ever has kind 'schedule' — the two passes cannot collide.
--
-- ── Why the run history is its own table ──
--
-- `crm_automation_runs` is one row per *person* standing in a graph, with a
-- node they are waiting at and a due time. A content run has none of that: it
-- happens once, produces a thing, and is over. Squeezing it into that table
-- would mean a contact_id column that is always null and a status that never
-- means what it says.
--
-- What this table is really for is the answer to "what has it actually made
-- for me": each row names what was produced and where it landed, so the
-- project's Assets tab can link straight to the record rather than telling
-- somebody to go and look.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_agent_runs (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  workflow_id  TEXT NOT NULL,
  node_id      TEXT NOT NULL DEFAULT '',

  -- social | blog | email_campaign — what the agent was asked to produce.
  produces     TEXT NOT NULL DEFAULT '',

  -- ok | failed | skipped. A run that could not read its source is `failed`
  -- and says why; one whose source had nothing new is `skipped`, which is not
  -- the same thing and must not be reported as one. A feed with no new items
  -- is the ordinary case on most mornings.
  outcome      TEXT NOT NULL DEFAULT 'ok',
  detail       TEXT NOT NULL DEFAULT '',

  -- Where what it made can be opened, as {kind, id, label, route}. Null when
  -- nothing was made.
  link         TEXT,

  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs
  ON crm_agent_runs (account_id, project_id, created_at DESC);

-- ── When this graph last ran ──
--
-- On the workflow rather than in a settings blob, because "daily" means daily
-- *for this workflow*: two agents on one project may be daily and weekly, and a
-- single stamp would make the weekly one run every day or the daily one once a
-- week. Null means it has never run, which is treated as due.
ALTER TABLE crm_project_workflows ADD COLUMN last_run_at TEXT;
