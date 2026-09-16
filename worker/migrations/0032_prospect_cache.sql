-- ─────────────────────────────────────────────────────────────────────────────
-- A cache in front of OpenStreetMap, and the reason it is not optional.
--
-- Overpass is free and asks for something in return: the public instances are
-- policed at roughly ten thousand requests a day across everybody, with no
-- service guarantee and an explicit warning that commercial users who lean on
-- them get cut off. Two customers searching "plumbers in Manchester" an hour
-- apart is one question, and asking it twice is how a free dependency stops
-- being available.
--
-- Answers are cached per question rather than per workspace. The high street
-- does not belong to whoever looked it up, and scoping this by account would
-- multiply the request count by the number of customers for no benefit at all.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_prospect_cache (
  -- The normalised question: trade and place, lower-cased and squeezed.
  q          TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  -- Unix seconds. A fortnight: shops do close, but not fast enough to justify
  -- asking a volunteer-run service the same thing every day.
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospect_cache_expiry ON crm_prospect_cache (expires_at);

-- Contact details read off a business's own website, cached separately.
--
-- Separate because it has a different lifetime and a different cost: a page
-- fetch is ours to make and cheap, but doing it once per search result means
-- eighty fetches for one search, and the same business appears in many
-- searches. Keyed by host, because that is what was actually fetched.
CREATE TABLE IF NOT EXISTS crm_prospect_contacts (
  host       TEXT PRIMARY KEY,
  emails     TEXT NOT NULL DEFAULT '',
  -- 1 when the domain publishes MX records, 0 when it does not, -1 when the
  -- lookup itself failed. Three states, because "we could not check" is not
  -- the same as "this address will bounce" and reporting it as such would have
  -- customers deleting good leads.
  mx         INTEGER NOT NULL DEFAULT -1,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_expiry ON crm_prospect_contacts (expires_at);
