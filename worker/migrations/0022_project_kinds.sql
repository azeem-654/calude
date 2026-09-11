-- ─────────────────────────────────────────────────────────────────────────────
-- What kind of project this is.
--
-- The three a customer actually described, and they want different work:
--
--   leadgen      find people who need a dentist, write to them, book them in
--   consultancy  the same shape, selling expertise rather than a service
--   ecommerce    a catalogue, a storefront, orders, and everything after a sale
--
-- Without this every project plans every play, so a dental clinic's lead-gen
-- project spends its mornings chasing unpaid orders it will never have, and an
-- e-commerce project is told there is no sequence to put contacts in. Both are
-- noise, and noise on this board is what makes somebody stop reading it.
--
-- 'general' is the honest default for anything already running: it was planning
-- everything yesterday and will carry on doing so until somebody says what it
-- is, rather than having work silently withdrawn by a migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_projects_kind ON crm_projects (account_id, kind);
