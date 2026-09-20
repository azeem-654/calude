-- ─────────────────────────────────────────────────────────────────────────────
-- A project's own workflows.
--
-- ── Why these are not `crm_automations` ──
--
-- Marketing → Automations is a workspace-wide list somebody builds by hand. An
-- AI Autopilot project's workflows belong to *that project*: they are written
-- for one client, in that client's voice, against that client's forms, and they
-- are switched on and off with the project. Sharing one list would mean an
-- agency running six clients sees thirty-odd workflows in a single column with
-- nothing but the name to tell them apart, and deleting a project would either
-- orphan its rules or silently take somebody else's with it.
--
-- So they are separate lists, on separate screens, and neither writes the
-- other's rows.
--
-- ── Why they are on the server rather than in the browser blob ──
--
-- `crm_automations` is part of the localStorage document the browser syncs up,
-- which the Worker may read and must never write. That is fine for a list a
-- person edits. It is wrong for these: a project's workflows are written by the
-- AI on a tick with nobody signed in, and a scheduler has no browser to sync
-- from — the same reason the mailbox and the domain records live here.
--
-- ── What is deliberately shared ──
--
-- The engine. `automationEngine.ts` executes both, from whichever table they
-- came. Two executors would be two implementations of wait, condition and
-- send, and they would drift the first time either was fixed — which is exactly
-- the failure this codebase keeps finding. Separate data, separate screens, one
-- thing that runs them.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_project_workflows (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  project_id   TEXT NOT NULL,

  name         TEXT NOT NULL DEFAULT '',
  -- The one line under the name: what it is for, in the customer's words.
  description  TEXT NOT NULL DEFAULT '',

  -- draft | active | paused
  --
  -- Everything the AI writes arrives as `draft`, never `active`. Each of these
  -- sends something, and switching one on for somebody is a permission they
  -- never gave.
  status       TEXT NOT NULL DEFAULT 'draft',

  -- The graph, as the canvas draws it and the engine walks it: an array of
  -- {id, type, label, config, nextId, yesId, noId}. JSON rather than a row per
  -- node because it is read and written whole, always, and a node table would
  -- buy nothing but joins.
  nodes        TEXT NOT NULL DEFAULT '[]',

  -- The order the customer arranged them in, which is the order the canvas
  -- draws and numbers them.
  position     INTEGER NOT NULL DEFAULT 0,

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_workflows
  ON crm_project_workflows (account_id, project_id, position);

-- The engine's own query: every live graph in a workspace, whoever owns it.
CREATE INDEX IF NOT EXISTS idx_project_workflows_live
  ON crm_project_workflows (account_id, status);

-- ── Which list a run came from ──
--
-- A run points at a graph by id, and there are now two places a graph can live.
-- Without this the engine would have to guess, and a project workflow sharing
-- an id shape with a marketing automation would be looked up in the wrong list
-- and reported as deleted — stopping a run that was working perfectly.
--
-- Defaults to 'marketing' so every run that already exists keeps resolving
-- exactly where it always did.
ALTER TABLE crm_automation_runs ADD COLUMN workflow_source TEXT NOT NULL DEFAULT 'marketing';
