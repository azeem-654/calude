-- ─────────────────────────────────────────────────────────────────────────────
-- How many instructions a plan includes.
--
-- The box at the top of a project's dashboard sends a sentence to a model, and
-- the operator pays for every one. A text box with no ceiling is a text box
-- somebody pastes a novel into fifty times.
--
-- It sits on the plan rather than on the workspace because it is a thing being
-- sold, not a thing being configured: the day there is a price list, this is
-- one of the numbers on it. Until then zero means "no plan-specific number",
-- and the route falls back to its own default for everybody — so this column
-- existing changes nothing until somebody sets a value.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_plans ADD COLUMN instruction_cap INTEGER NOT NULL DEFAULT 0;
