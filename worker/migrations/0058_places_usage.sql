-- Calls that reached Google Places, counted by month, workspace, use and whose key.
--
-- The owner's Google Maps key now serves every customer's prospect search as
-- well as their reviews (lib/googlePlaces.ts), and Google bills it per call.
-- crm_rate_limits cannot answer "how many this month on my key": its windows
-- slide and are pruned daily. This can, cheaply, for Settings → Platform
-- services. One row per (month, workspace, use, whose); a call adds one.
CREATE TABLE IF NOT EXISTS crm_places_usage (
  month      TEXT NOT NULL,             -- 'YYYY-MM', UTC
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,             -- 'prospects' | 'reviews'
  whose      TEXT NOT NULL,             -- 'install' (the owner's key) | 'workspace' (their own)
  calls      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, account_id, kind, whose)
);
