-- AI Prospecting searches as recurring lead sources for AI Autopilot projects
-- (worker/src/routes/sources.ts, worker/src/lib/prospectSources.ts).
--
-- A search the customer built and tested in AI Prospecting is kept here once,
-- as a definition with an id. A project uses it through a *connection*, which
-- is a row of crm_prospect_finders that names the definition: the same finder
-- engine runs it (prospectFinderTick.ts), with its own schedule, target,
-- verification and next steps. One search can feed several projects and one
-- project can have several searches; nothing about the search is copied into
-- a second engine.

CREATE TABLE IF NOT EXISTS crm_search_definitions (
  id          TEXT PRIMARY KEY,               -- 'ps-…'
  account_id  TEXT NOT NULL,
  key         TEXT NOT NULL,                  -- source|trade|place, normalised: one definition per distinct search
  name        TEXT NOT NULL,                  -- "Dentists — New York City"
  query       TEXT NOT NULL DEFAULT '',       -- the sentence as typed, when there was one
  trade       TEXT NOT NULL,
  place       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'register' (see SOURCE_POLICY)
  filters     TEXT NOT NULL DEFAULT '{}',     -- JSON {website, email, phone}: true = required
  exclusions  TEXT NOT NULL DEFAULT '[]',     -- JSON: words that rule a business out ("franchise")
  version     INTEGER NOT NULL DEFAULT 1,     -- bumped on every change to what it finds
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (account_id, key)
);

-- The connection: everything a project decided about using a search.
-- Finders made before connections existed have search_id '' and run exactly
-- as they did (min_confidence 0 means no confidence gate).
ALTER TABLE crm_prospect_finders ADD COLUMN search_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_prospect_finders ADD COLUMN search_version INTEGER NOT NULL DEFAULT 0;   -- the definition version its criteria came from
ALTER TABLE crm_prospect_finders ADD COLUMN criteria TEXT NOT NULL DEFAULT '{}';        -- JSON: the filters and exclusions in force
ALTER TABLE crm_prospect_finders ADD COLUMN schedule TEXT NOT NULL DEFAULT 'daily';     -- daily | weekdays | weekly | custom | manual
ALTER TABLE crm_prospect_finders ADD COLUMN run_days TEXT NOT NULL DEFAULT '1111111';   -- Monday … Sunday
ALTER TABLE crm_prospect_finders ADD COLUMN run_hour INTEGER NOT NULL DEFAULT 0;        -- local hour a run day starts
ALTER TABLE crm_prospect_finders ADD COLUMN tz TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE crm_prospect_finders ADD COLUMN min_confidence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_prospect_finders ADD COLUMN verify TEXT NOT NULL DEFAULT '{}';          -- JSON: level and the optional rejections
ALTER TABLE crm_prospect_finders ADD COLUMN destination TEXT NOT NULL DEFAULT '{}';     -- JSON: tags, owner, deal, next workflow
ALTER TABLE crm_prospect_finders ADD COLUMN manual_run TEXT NOT NULL DEFAULT '';        -- local date of a run started by hand
ALTER TABLE crm_prospect_finders ADD COLUMN day_examined INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_prospect_finders ADD COLUMN day_rejected TEXT NOT NULL DEFAULT '{}';    -- JSON: reason → count, this run
ALTER TABLE crm_prospect_finders ADD COLUMN live TEXT NOT NULL DEFAULT '';              -- JSON: the candidate being checked and the last few results
CREATE INDEX IF NOT EXISTS idx_finders_search ON crm_prospect_finders (account_id, search_id);

-- What the checks found for each candidate.
ALTER TABLE crm_project_prospects ADD COLUMN search_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_project_prospects ADD COLUMN confidence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_project_prospects ADD COLUMN reject_reason TEXT NOT NULL DEFAULT '';   -- duplicate | suppressed | … (status 'rejected')
ALTER TABLE crm_project_prospects ADD COLUMN checks TEXT NOT NULL DEFAULT '';          -- JSON: each check and its outcome
CREATE INDEX IF NOT EXISTS idx_pp_email ON crm_project_prospects (account_id, project_id, email);
