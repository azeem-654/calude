-- ─────────────────────────────────────────────────────────────────────────────
-- Telling the customer what happened while they were not looking.
--
-- Supervised autopilot only works if the supervision is possible. Everything
-- held for approval sits in a queue on a screen, and a customer who does not
-- open the app does not know it is there — so the thing they agreed to review
-- never gets reviewed, and Autopilot looks like it stopped working.
--
-- One column, because the rule is one digest a day and the only thing needed to
-- enforce it is when the last one went.
-- ─────────────────────────────────────────────────────────────────────────────

-- When a digest was last *sent*, not last considered. A morning with nothing
-- worth saying sends nothing and leaves this alone, so the next real digest is
-- not delayed by a quiet day.
ALTER TABLE crm_autopilot ADD COLUMN last_digest_at TEXT;
