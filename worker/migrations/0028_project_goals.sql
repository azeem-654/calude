-- ─────────────────────────────────────────────────────────────────────────────
-- What the project is actually supposed to achieve, in numbers.
--
-- `objective` is a sentence — "book more EV charger installs". Useful for
-- writing copy, useless for deciding what to do first. A target of fifteen
-- installs a month at £900 each is a different plan from three at £12,000, and
-- the tasks worth doing are different in each: one is a volume problem and the
-- other is a trust problem.
--
-- So the two numbers are asked for and stored beside the sentence, and the
-- starter tasks are generated from all three. Both are optional — somebody who
-- does not know their numbers yet should not be blocked from starting — and
-- when they are absent the generator is told so rather than inventing a target
-- to plan against.
-- ─────────────────────────────────────────────────────────────────────────────

-- How much revenue this project is meant to produce, per month, in whole
-- currency units of the workspace's own currency. 0 means "not said".
ALTER TABLE crm_projects ADD COLUMN revenue_target INTEGER NOT NULL DEFAULT 0;

-- How many customers, jobs, bookings or orders a month. 0 means "not said".
ALTER TABLE crm_projects ADD COLUMN volume_target INTEGER NOT NULL DEFAULT 0;

-- The named business goals somebody picked, as JSON: ["more-leads","retention"].
-- A list rather than one choice, because a real project usually has two.
ALTER TABLE crm_projects ADD COLUMN goals TEXT NOT NULL DEFAULT '[]';
