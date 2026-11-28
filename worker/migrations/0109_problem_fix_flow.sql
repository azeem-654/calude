-- Report a problem → testing first, then the owner's "Push it live" (owner,
-- 2026-11-28; lib/problemFix.ts).
--
-- kind: what the customer sent — bug | improvement (to a feature they use) |
--       feature (something new). It sets the time the customer is told and
--       the words of every message; the path is the same for all three.
--
-- What the session says when the fix is on testing, kept apart so the owner's
-- "ready to test" email can lay it out: what changed, what the customer will
-- see, what else is better, and the owner's own steps to check it on testing.
-- commit_sha is the fix's commit, so the session that promotes can check it
-- reached main.
--
-- status gains `promoting`: the owner pressed Push it live and a session was
-- started to promote testing to live; it ends `fixed` (live, customer told) or
-- back at `ready` with the reason in `error`.
ALTER TABLE crm_problem_fixes ADD COLUMN kind TEXT NOT NULL DEFAULT 'bug';
ALTER TABLE crm_problem_fixes ADD COLUMN changed TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_problem_fixes ADD COLUMN customer_sees TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_problem_fixes ADD COLUMN improved TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_problem_fixes ADD COLUMN test_steps TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_problem_fixes ADD COLUMN commit_sha TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_problem_fixes ADD COLUMN ready_at TEXT;
ALTER TABLE crm_problem_fixes ADD COLUMN promoted_at TEXT;
