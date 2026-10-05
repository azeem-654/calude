-- Phones running the Protected Central apps, for push notifications (lib/push.ts).
-- A token is one app install on one phone; it follows whoever signed in on it last,
-- and the workspace that was open — alerts go to the phones of that workspace.
CREATE TABLE IF NOT EXISTS crm_push_devices (
  token        TEXT PRIMARY KEY,
  user_email   TEXT NOT NULL,
  account_id   TEXT NOT NULL,
  platform     TEXT NOT NULL DEFAULT '',   -- android | ios
  app          TEXT NOT NULL DEFAULT '',   -- customer | support
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_error   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_push_devices_account ON crm_push_devices(account_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON crm_push_devices(user_email);
