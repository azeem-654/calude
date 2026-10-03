-- AI Prospecting inside AI Autopilot: every prospect a project has, and the
-- daily finders that keep adding to it (worker/src/prospectFinderTick.ts,
-- routes/finders.ts).
--
-- Why a table of its own rather than only the Contacts blob: Contacts are the
-- browser's, synced as one document per workspace. The cron adds daily finds
-- to that document too, but the browser can overwrite it with a copy taken
-- before the cron ran. This table is the record of what each project found
-- and added; a reconcile pass puts back any contact a stale write removed.

CREATE TABLE IF NOT EXISTS crm_prospect_finders (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  workflow_id   TEXT NOT NULL DEFAULT '',     -- the project workflow that shows it; switching that off pauses this
  name          TEXT NOT NULL DEFAULT '',
  trades        TEXT NOT NULL DEFAULT '[]',   -- JSON: ["real estate agents", "property managers"]
  places        TEXT NOT NULL DEFAULT '[]',   -- JSON: ["Richmond, Virginia", "Norfolk, Virginia"]
  source        TEXT NOT NULL DEFAULT 'free', -- 'free' (business directories) | 'register'
  per_day       INTEGER NOT NULL DEFAULT 20,  -- new reachable leads to add a day
  list_id       TEXT NOT NULL DEFAULT '',     -- the project's audience list (crm_contact_lists id)
  status        TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'exhausted'
  status_reason TEXT NOT NULL DEFAULT '',
  cursor        INTEGER NOT NULL DEFAULT 0,   -- index into the trades × places rotation
  page_token    TEXT NOT NULL DEFAULT '',     -- the next page of the current search
  done_keys     TEXT NOT NULL DEFAULT '[]',   -- JSON: "trade|place" searches already run to the end
  day           TEXT NOT NULL DEFAULT '',     -- UTC date the counters below belong to
  day_added     INTEGER NOT NULL DEFAULT 0,
  day_searches  INTEGER NOT NULL DEFAULT 0,
  day_reads     INTEGER NOT NULL DEFAULT 0,
  next_run_at   TEXT NOT NULL DEFAULT '',
  last_run_at   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finders_due ON crm_prospect_finders (status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_finders_project ON crm_prospect_finders (account_id, project_id);

-- One row per business a project found or was given. `status`:
--   candidate — found, website not read yet
--   ready     — has an address that did not fail its check; waiting for today's allowance
--   added     — in Contacts and on the project's list (`contact_id`)
--   no_email  — nothing to write to (no website, none published, or every address bounced)
--   known     — already in this workspace's Contacts before the finder found it
CREATE TABLE IF NOT EXISTS crm_project_prospects (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  finder_id     TEXT NOT NULL DEFAULT '',     -- '' when added by hand from AI Prospecting
  ref           TEXT NOT NULL,                -- the source's own id for the business
  name          TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  person_name   TEXT NOT NULL DEFAULT '',
  person_role   TEXT NOT NULL DEFAULT '',
  company_number TEXT NOT NULL DEFAULT '',
  email_status  TEXT NOT NULL DEFAULT '',     -- the address check: valid | domain_ok | risky | invalid | unknown
  query         TEXT NOT NULL DEFAULT '',     -- "trade|place" that found it
  source        TEXT NOT NULL DEFAULT '',     -- free | osm | register | google | manual
  status        TEXT NOT NULL DEFAULT 'candidate',
  contact_id    TEXT NOT NULL DEFAULT '',
  found_at      TEXT NOT NULL,                -- when its source answered
  added_at      TEXT NOT NULL DEFAULT '',     -- when it joined the audience
  UNIQUE (account_id, project_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_pp_project ON crm_project_prospects (account_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_finder ON crm_project_prospects (finder_id, status);

-- What each finder step did, for the project's Prospects tab and the owner.
CREATE TABLE IF NOT EXISTS crm_finder_runs (
  id          TEXT PRIMARY KEY,
  finder_id   TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,        -- 'search' | 'read' | 'add' | 'exhausted' | 'paused' | 'error'
  detail      TEXT NOT NULL DEFAULT '',
  found       INTEGER NOT NULL DEFAULT 0,
  added       INTEGER NOT NULL DEFAULT 0,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finder_runs ON crm_finder_runs (account_id, project_id, at);

-- Texts to a found business only with its own say-so: the opt-in page
-- (/api/sms-optin.php) records it here, and the SMS senders check it for
-- anybody who is still a prospect.
CREATE TABLE IF NOT EXISTS crm_sms_consents (
  account_id  TEXT NOT NULL,
  phone       TEXT NOT NULL,        -- E.164
  contact_id  TEXT NOT NULL DEFAULT '',
  wording     TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL,
  PRIMARY KEY (account_id, phone)
);
