-- ─────────────────────────────────────────────────────────────────────────────
-- Two small additions, 2026-11-16.
--
-- 1. How long each AI answer took (lib/aiUsage.ts recordAiUse → `ms_total`,
--    summed like the token columns). The usage dashboard divides it by the
--    answers (`ok`) for the average reply time per key and model, so a key
--    or model that has gone slow shows before customers say so.
--
-- 2. The customer's rating of a resolved ticket ("How did we do?" in the help
--    widget, routes/engage.ts `rate_ticket`): 1–5 and an optional comment,
--    changeable, stamped when last given. NULL means not asked or not
--    answered — never a default score.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_ai_usage ADD COLUMN ms_total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE crm_tickets ADD COLUMN csat_score INTEGER;
ALTER TABLE crm_tickets ADD COLUMN csat_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_tickets ADD COLUMN csat_at TEXT;
