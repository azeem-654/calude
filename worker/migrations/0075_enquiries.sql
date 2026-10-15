-- ─────────────────────────────────────────────────────────────────────────────
-- Custom plan enquiries from the public pricing page.
--
-- The Custom tier has no price and no checkout; its button is a short form,
-- and this is where that form lands. The install owner reads them on Sign-ups
-- & trials → Plans & allowances (and gets an email when the install mailbox is
-- validated). Written by an anonymous visitor, so every field is clipped and
-- the route rate-limits per address and per day (routes/allowances.ts).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_enquiries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  company     TEXT NOT NULL DEFAULT '',
  -- JSON array of what they ticked: limits | setup | integrations | invoice | other
  needs       TEXT NOT NULL DEFAULT '[]',
  message     TEXT NOT NULL DEFAULT '',
  -- sent | failed | skipped (no validated install mailbox)
  emailed     TEXT NOT NULL DEFAULT 'skipped',
  handled_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON crm_enquiries(created_at);
