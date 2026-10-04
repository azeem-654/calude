-- Automation changes to a contact (a tag, a field, an owner) were applied only
-- by a browser with the Engagement screen open, so a tag added at 3am did not
-- exist anywhere the cron could see — a scheduled campaign for that tag missed
-- the contact — until somebody signed in. The tick now applies them to the
-- synced contact list itself and stamps this; `applied_at` stays the
-- browser's, which keeps re-applying (idempotently) until its own copy has it,
-- so a stale browser save cannot lose one.
ALTER TABLE crm_contact_changes ADD COLUMN server_applied_at TEXT;
CREATE INDEX IF NOT EXISTS idx_changes_cloud
  ON crm_contact_changes (server_applied_at, applied_at);
