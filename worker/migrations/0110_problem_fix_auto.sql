-- Report a problem → the testing-site fix starts by itself (owner, 2026-11-28;
-- lib/problemFix.ts `startOrAsk`).
--
-- auto_started: 1 when the report was handed to a Claude Code session without
-- the owner's yes. Counted over the last day to cap how many start that way
-- (per customer workspace and in all), so one customer filing report after
-- report cannot spend the owner's Claude plan; past the cap a report waits
-- for the owner as before.
ALTER TABLE crm_problem_fixes ADD COLUMN auto_started INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_problem_fixes_auto ON crm_problem_fixes (auto_started, created_at);
