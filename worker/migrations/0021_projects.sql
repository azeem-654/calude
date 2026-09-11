-- ─────────────────────────────────────────────────────────────────────────────
-- Projects, and the portfolios they are written from.
--
-- Autopilot was one brain per workspace: one objective, one portfolio, one
-- stream of work. That is right for a plumber and wrong for the people this is
-- actually sold to — an agency whose sub-account serves a dental practice, a
-- gym and a law firm, or one client with three services that need three
-- different campaigns and must not be described in the same words.
--
-- So the unit of work becomes a **project**, and a project names the
-- **portfolio** it speaks for. Many projects, one portfolio: a client with
-- three services is described once and pushed three ways, and correcting their
-- description corrects all three.
--
-- This also absorbs the AI Sales Agent. That module was a second brain with the
-- same job — an objective, a plan, a set of generated campaigns — sitting in a
-- different menu. Two brains is the thing most likely to confuse a customer, so
-- there is one, and a project is what an agent campaign used to be.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Who the work is for ──
--
-- One row per client a workspace serves. The workspace's own existing
-- onboarding profile becomes the first one, so nobody loses what they typed.
CREATE TABLE IF NOT EXISTS crm_portfolios (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  name         TEXT NOT NULL,

  -- The whole profile as the onboarding wizard produces it: company name,
  -- industry, what they do, who buys it, tone, website. Kept as one document
  -- rather than twenty columns because every writer reads all of it at once and
  -- nothing queries across the fields.
  profile      TEXT NOT NULL DEFAULT '{}',

  -- 'manual' when somebody typed it, 'url' when it was read off their website.
  -- Worth knowing: a portfolio inferred from a web page is a starting point a
  -- human should check, and saying which is how the screen can say so.
  source       TEXT NOT NULL DEFAULT 'manual',

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolios_account ON crm_portfolios (account_id, created_at);

-- ── The work itself ──
--
-- What crm_autopilot was, once per project instead of once per workspace. The
-- old table is left in place and read from: it holds live guardrails somebody
-- chose, and dropping it to tidy up would silently re-open every channel they
-- had deliberately held back.
CREATE TABLE IF NOT EXISTS crm_projects (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  -- Which client this speaks for. Not null in practice; a project with no
  -- portfolio has nothing to write from.
  portfolio_id  TEXT NOT NULL DEFAULT '',

  name          TEXT NOT NULL,

  -- One sentence, in the customer's own words, of what this project is for.
  objective     TEXT NOT NULL DEFAULT '',

  -- off | learning | running | paused
  status        TEXT NOT NULL DEFAULT 'learning',

  -- Per project, deliberately. Somebody may let a long-standing client's
  -- project send without asking while a brand new one still waits for approval
  -- on everything, and a workspace-wide setting cannot express that.
  guardrails    TEXT NOT NULL DEFAULT '{}',

  -- Buying domains and mailboxes, as crm_autopilot held it.
  purchase_mode TEXT NOT NULL DEFAULT 'byo',
  pool_target   TEXT NOT NULL DEFAULT '{}',

  last_planned_at TEXT,
  last_acted_at   TEXT,
  last_digest_at  TEXT,
  last_error      TEXT NOT NULL DEFAULT '',

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_account ON crm_projects (account_id, status, created_at);

-- ── Which project an action belongs to ──
--
-- Empty for every row written before today, and those stay readable: the board
-- shows them under the workspace's first project rather than hiding history to
-- keep a column tidy.
ALTER TABLE crm_autopilot_actions ADD COLUMN project_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_actions_project
  ON crm_autopilot_actions (account_id, project_id, created_at DESC);

-- ── Carrying the existing work across ──
--
-- Every workspace that filled in an onboarding profile gets it as a portfolio,
-- named after the company. `json_extract` rather than string surgery, and a
-- fallback name so a half-filled profile still produces something openable.
INSERT INTO crm_portfolios (id, account_id, name, profile, source, created_at, updated_at)
SELECT
  'pf-' || d.account_id,
  d.account_id,
  COALESCE(NULLIF(json_extract(d.v, '$.profile.companyName'), ''), 'Your business'),
  COALESCE(json_extract(d.v, '$.profile'), '{}'),
  'manual',
  datetime('now'),
  datetime('now')
FROM crm_data d
WHERE d.k = 'crm_onboarding'
  AND json_valid(d.v)
  AND NOT EXISTS (SELECT 1 FROM crm_portfolios p WHERE p.account_id = d.account_id);

-- And every workspace already running Autopilot gets one project carrying its
-- objective, its guardrails and its buying settings unchanged.
INSERT INTO crm_projects (
  id, account_id, portfolio_id, name, objective, status,
  guardrails, purchase_mode, pool_target,
  last_planned_at, last_acted_at, last_digest_at, last_error, created_at, updated_at)
SELECT
  'pj-' || a.account_id,
  a.account_id,
  COALESCE((SELECT p.id FROM crm_portfolios p WHERE p.account_id = a.account_id LIMIT 1), ''),
  'Your first project',
  a.objective,
  a.status,
  a.guardrails,
  a.purchase_mode,
  a.pool_target,
  a.last_planned_at, a.last_acted_at, a.last_digest_at, a.last_error,
  a.created_at, a.updated_at
FROM crm_autopilot a
WHERE NOT EXISTS (SELECT 1 FROM crm_projects j WHERE j.account_id = a.account_id);

-- Existing history joins the project it plainly belongs to.
UPDATE crm_autopilot_actions
   SET project_id = 'pj-' || account_id
 WHERE project_id = ''
   AND EXISTS (SELECT 1 FROM crm_projects j WHERE j.id = 'pj-' || crm_autopilot_actions.account_id);
