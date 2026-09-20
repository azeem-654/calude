-- ─────────────────────────────────────────────────────────────────────────────
-- Automations that actually run.
--
-- ── What was here before ──
--
-- `crm_automations` — the node graph somebody builds in Marketing → Automations,
-- with a trigger, waits, conditions, "send email", "send SMS", tags and tasks —
-- has existed for a long time and **nothing has ever executed it**. There is no
-- runner in the Worker and none in the browser. A customer could draw a
-- follow-up, switch it to Active, watch the enrolled count sit at zero, and
-- never be told that the thing they built does nothing at all.
--
-- That is the exact failure this project has a rule against. A drawing of an
-- automation is worse than no automation, because the customer stops doing the
-- follow-up by hand.
--
-- ── Why the state lives here and not in the graph ──
--
-- The graph is part of the browser-owned blob: the app writes `crm_automations`
-- to localStorage and `serverData` pushes it to D1. The Worker may *read* that
-- safely and must never write it — a browser that syncs up afterwards would
-- overwrite whatever the cron had put there, which is how a half-finished run
-- would silently restart from the top.
--
-- So the graph stays the customer's document and the *run* is server state, in
-- a real table with real columns, exactly like the domain and mailbox work.
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per (automation, contact) enrolment. Where that person has got to.
CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,

  automation_id  TEXT NOT NULL,
  -- Copied rather than joined: the graph can be renamed or deleted from the
  -- browser at any moment, and a run has to still be able to say what it was.
  automation_name TEXT NOT NULL DEFAULT '',

  -- At enrolment this is the *engagement* person's id, because the CRM contact
  -- does not exist yet: the contact list is the browser's document and nothing
  -- has written to it. `mark_merged` swaps it for the real CRM id the moment
  -- the browser creates one. Until then the three fields below are how the
  -- engine knows who it is talking to, which is why they are copied rather
  -- than looked up.
  contact_id     TEXT NOT NULL,
  contact_name   TEXT NOT NULL DEFAULT '',
  contact_email  TEXT NOT NULL DEFAULT '',
  contact_phone  TEXT NOT NULL DEFAULT '',

  -- Where in the graph. Empty once the run is over.
  node_id        TEXT NOT NULL DEFAULT '',
  -- When the next node may run. A wait is just this, pushed forward.
  due_at         TEXT NOT NULL,

  -- active | done | stopped | failed
  --
  -- `stopped` and `failed` are deliberately different. Stopped is a decision —
  -- the graph was paused, the person unsubscribed, the contact was deleted.
  -- Failed is the product not working. Collapsing them would hide every broken
  -- automation inside a number that also counts the ones working correctly.
  status         TEXT NOT NULL DEFAULT 'active',
  detail         TEXT NOT NULL DEFAULT '',

  -- What set it off, kept so a run can be traced back to the form or the tag.
  trigger_kind   TEXT NOT NULL DEFAULT '',
  trigger_ref    TEXT NOT NULL DEFAULT '',

  -- A cheap loop brake. See the engine: a graph whose nodes point in a circle
  -- would otherwise run for ever, a tick at a time, sending on every pass.
  steps_taken    INTEGER NOT NULL DEFAULT 0,

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- The tick's query: what is due, oldest first.
CREATE INDEX IF NOT EXISTS idx_autorun_due ON crm_automation_runs (status, due_at);
CREATE INDEX IF NOT EXISTS idx_autorun_account ON crm_automation_runs (account_id, created_at DESC);
-- Enrolment checks the same person is not already in the same graph.
CREATE UNIQUE INDEX IF NOT EXISTS idx_autorun_once
  ON crm_automation_runs (account_id, automation_id, contact_id);

-- Every node a run passed through, and what it did.
--
-- Separate from the run because a run has one position and a history of many
-- steps, and because "why did Rita get that email" is answered by the history
-- rather than by where she is now.
CREATE TABLE IF NOT EXISTS crm_automation_log (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  node_id     TEXT NOT NULL DEFAULT '',
  node_type   TEXT NOT NULL DEFAULT '',
  -- ok | skipped | failed
  status      TEXT NOT NULL DEFAULT 'ok',
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autolog_run ON crm_automation_log (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_autolog_account ON crm_automation_log (account_id, created_at DESC);

-- ── Changes the engine wants made to a contact ──
--
-- "Add tag", "update field" and "assign to" all edit a contact, and the contact
-- list is the browser's document. The Worker writing it directly is the bug
-- described at the top of this file, arriving from the other direction.
--
-- So the engine records what it wants done and the browser applies it, the same
-- one-way route the engagement captures already take: the server proposes, the
-- browser — the only writer — disposes, and `applied_at` means it has landed so
-- it is never applied twice.
CREATE TABLE IF NOT EXISTS crm_contact_changes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  contact_id  TEXT NOT NULL,
  -- add_tag | remove_tag | set_field | assign
  kind        TEXT NOT NULL,
  field       TEXT NOT NULL DEFAULT '',
  value       TEXT NOT NULL DEFAULT '',
  -- What asked for it, so a surprising change on a contact can be traced.
  source      TEXT NOT NULL DEFAULT '',
  source_id   TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  applied_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_changes_pending
  ON crm_contact_changes (account_id, applied_at, created_at);
