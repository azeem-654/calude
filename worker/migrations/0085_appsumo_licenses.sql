-- AppSumo Licensing (v2): the webhook-and-OAuth way a buyer activates, beside
-- the codes in 0084 (routes/appsumoLicense.ts).
--
-- AppSumo sends purchase → activate → (upgrade | downgrade)* → deactivate for
-- each license, and every upgrade or downgrade arrives as a NEW license_key
-- naming the old one in prev_key. The old row becomes 'replaced'.
--
-- status: pending (purchased) → active → replaced | deactivated.
-- 'replaced' and 'deactivated' are terminal: a replayed or late event for such
-- a key is acknowledged and ignored, so an old signed "activate" can never
-- bring a refunded license back.
--
-- owner_email is filled when the buyer, back from AppSumo's OAuth, claims it
-- while signed in. claim_hash is the SHA-256 of the one-use link that carries
-- them from the OAuth return through sign-up; it is cleared when used.
--
-- parent_key / plan_name / units are AppSumo's deal add-ons. None is sold, so
-- they are recorded and never counted toward a tier.
CREATE TABLE IF NOT EXISTS crm_appsumo_licenses (
  license_key   TEXT PRIMARY KEY,
  prev_key      TEXT,
  parent_key    TEXT,
  plan_name     TEXT,
  units         INTEGER,
  tier          INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending',
  owner_email   TEXT,
  last_event    TEXT,
  last_event_ms INTEGER,
  reason        TEXT,
  claim_hash    TEXT,
  claim_expires TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_appsumo_licenses_owner ON crm_appsumo_licenses (owner_email);
CREATE INDEX IF NOT EXISTS crm_appsumo_licenses_claim ON crm_appsumo_licenses (claim_hash);
