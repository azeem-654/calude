-- ─────────────────────────────────────────────────────────────────────────────
-- Autopilot: the central execution system, and the account it gives of itself.
--
-- Every module in this app works. Every one of them is operated by hand. What a
-- plumber or a consultant signing up actually wants is for the work to happen —
-- the site built, the offer written, the campaigns running, the appointments
-- booked — without learning what a sequence is or in what order to do things.
--
-- Autopilot is the layer that drives the modules that already exist. These two
-- tables are what makes it accountable: one row per workspace saying what it is
-- doing, and one row per action saying what it did, why, and where the real
-- record is.
--
-- ── Why the ledger is on the server ──
--
-- The obvious alternative is to keep it in the workspace's own synced storage
-- with everything else. It cannot be: the whole point is that Autopilot runs
-- when nobody is signed in, so the cron has to be able to write the log, and
-- the cron has no browser. The same reason the mailbox moved here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_autopilot (
  account_id     TEXT PRIMARY KEY,

  -- off:      never set up, or switched off. Nothing runs.
  -- learning: it has the portfolio and is building the first plan.
  -- running:  operating on its cadence.
  -- paused:   the customer pressed pause. Distinct from off, because pausing
  --           keeps the plan and the history; off throws the plan away.
  status         TEXT NOT NULL DEFAULT 'off',

  -- The outcome the customer chose, in their words, kept verbatim. Not a
  -- summary of it — a plan generated from a paraphrase is a plan for something
  -- nobody asked for.
  objective      TEXT NOT NULL DEFAULT '',

  -- What it is allowed to do without asking. AIGuardrails, as JSON: sendEmail
  -- and sendSms default to 'approval', so the first send of each channel waits
  -- for one click and every send after it does not.
  guardrails     TEXT NOT NULL DEFAULT '{}',

  -- The plan it is working through, as JSON. Rewritten each planning tick.
  plan           TEXT NOT NULL DEFAULT '{}',

  last_planned_at TEXT,
  last_acted_at   TEXT,
  last_error      TEXT NOT NULL DEFAULT '',

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- ── Everything it did, and everything it is about to do ──
--
-- One table for both, separated by `status`, rather than a queue table and a
-- history table. A pending action becoming a done one is then an UPDATE and not
-- a move between tables — which is what stops an action being counted twice, or
-- lost between the two writes.
CREATE TABLE IF NOT EXISTS crm_autopilot_actions (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  -- DecisionKind from src/types/aiSalesAgent.ts: plan, create, enrol, send,
  -- observe, book, approval, error…
  kind         TEXT NOT NULL,

  -- pending:  planned, not started.
  -- awaiting: needs a human click, because a guardrail said 'approval'.
  -- done:     carried out.
  -- failed:   attempted and did not work. `detail` says what happened.
  -- skipped:  deliberately not done, and `detail` says why. A skip is not a
  --           failure and must not read as one — "the customer has opted out"
  --           is the system working.
  status       TEXT NOT NULL DEFAULT 'pending',

  -- One line in the words a customer would use: "Wrote a 5-email welcome
  -- sequence".
  summary      TEXT NOT NULL,

  -- Why it decided to. This is the column that makes the log worth reading:
  -- "Sent 40 emails" is a claim, "because these 40 contacts were tagged
  -- new-lead and had not been contacted in 30 days" is something a person can
  -- check and disagree with.
  because      TEXT NOT NULL DEFAULT '',

  -- The real record this produced. `link_kind` is a LinkKind, `link_id` is that
  -- module's own id — never a copy of the record, so following the link means
  -- reading the real thing.
  link_kind    TEXT,
  link_id      TEXT,
  link_label   TEXT,
  link_route   TEXT,

  -- Figures worth showing beside it, as JSON: {"contacts": 40, "steps": 5}
  counts       TEXT NOT NULL DEFAULT '{}',

  detail       TEXT NOT NULL DEFAULT '',

  -- When it should happen. Null means "as soon as the next tick sees it".
  due_at       TEXT,
  created_at   TEXT NOT NULL,
  acted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_autopilot_actions_account
  ON crm_autopilot_actions (account_id, created_at DESC);

-- The tick asks "what is due?" on every run, across every workspace. Without
-- this it is a full scan of the whole table every five minutes, for ever.
CREATE INDEX IF NOT EXISTS idx_autopilot_actions_due
  ON crm_autopilot_actions (status, due_at);
