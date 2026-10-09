-- The public site's funnel (routes/sitePlan.ts): one row per visitor, event
-- and day. Only an event name, a random visitor id, a catalogue solution key
-- and a device class — never anything the visitor typed.
CREATE TABLE IF NOT EXISTS crm_funnel_events (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  visitor TEXT NOT NULL,
  solution TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  account_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, event, visitor)
);
CREATE INDEX IF NOT EXISTS idx_funnel_events_day ON crm_funnel_events (day, event);
