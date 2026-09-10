-- ─────────────────────────────────────────────────────────────────────────────
-- Autopilot following an order up, without following it up twice.
--
-- The dedupe everywhere else in Autopilot is "is there already an open action
-- with this summary". That is right for standing conditions — twelve contacts
-- are still uncontacted tomorrow — and wrong for a one-off act against one
-- record. A chase whose action has been marked Done would be planned again the
-- next morning, and again the morning after, because the order is still
-- unpaid. The customer gets a reminder a day until they buy or report it.
--
-- So the fact lives on the order, which is the only thing that knows.
-- ─────────────────────────────────────────────────────────────────────────────

-- When a payment reminder was sent. One is a nudge; a series is why a sending
-- domain ends up on a blocklist, so nothing here ever sets it twice.
ALTER TABLE crm_orders ADD COLUMN chased_at TEXT;

-- When the buyer was told their order was received. Separate from chased_at
-- because a buyer can be thanked without ever having been chased, and one
-- column would make "already handled" mean two different things.
ALTER TABLE crm_orders ADD COLUMN thanked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_followup
  ON crm_orders (account_id, status, chased_at, thanked_at);
