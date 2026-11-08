-- After a strategy call the guest is asked how it went (routes/strategyCall.ts
-- strategyReviewAsks, the owner's request of 2026-11-08). The ask carries its
-- own key — the booking's manage key is never stored, only its hash, so the
-- cron that sends the ask cannot reuse it. Only the new key's SHA-256 is kept,
-- like key_hash.
--
-- review_asked_at marks the ask as done (sent, failed or skipped) so a call is
-- asked at most once; the rating and words are the guest's own, shown only in
-- the owner's list.
ALTER TABLE crm_strategy_calls ADD COLUMN review_key_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_strategy_calls ADD COLUMN review_asked_at TEXT;
ALTER TABLE crm_strategy_calls ADD COLUMN review_rating INTEGER;
ALTER TABLE crm_strategy_calls ADD COLUMN review_text TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_strategy_calls ADD COLUMN reviewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_strategy_calls_review_due ON crm_strategy_calls (status, end_ms) WHERE review_asked_at IS NULL;
