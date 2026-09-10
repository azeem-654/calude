-- ─────────────────────────────────────────────────────────────────────────────
-- Reminding somebody about the appointment they booked — once.
--
-- The marker goes on the booking, not in Autopilot's ledger, for the same
-- reason `chased_at` went on the order: the ledger's dedupe asks "is there an
-- open action saying this", which is right for a standing condition and wrong
-- for a one-off act against one record. Tomorrow's appointment is still
-- tomorrow's appointment on the next tick, so a reminder driven off the ledger
-- would go out every five minutes until the appointment happened.
-- ─────────────────────────────────────────────────────────────────────────────

-- When the guest was reminded. NULL means never, and only a successful send
-- sets it — a reminder lost to a dead SMTP host should be tried again, not
-- silently counted as delivered.
ALTER TABLE crm_bookings ADD COLUMN reminded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder
  ON crm_bookings (account_id, status, slot_date, reminded_at);
