-- AppSumo lifetime-deal codes (routes/appsumo.ts).
--
-- A code is a bearer secret until it is redeemed, so only its SHA-256 is kept:
-- a database export cannot be turned back into codes somebody could spend.
-- The owner downloads the list once, when it is made or imported, and hands
-- it to AppSumo.
--
-- status: unused → redeemed (by owner_email) → revoked (AppSumo refunded it).
-- A revoked code is never reused; the subscriber's tier is worked out again
-- from the codes they still hold.
CREATE TABLE IF NOT EXISTS crm_appsumo_codes (
  code_hash     TEXT PRIMARY KEY,
  batch         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unused',
  owner_email   TEXT,
  redeemed_at   TEXT,
  revoked_at    TEXT,
  revoked_note  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_appsumo_codes_owner ON crm_appsumo_codes (owner_email);
CREATE INDEX IF NOT EXISTS crm_appsumo_codes_status ON crm_appsumo_codes (status);
