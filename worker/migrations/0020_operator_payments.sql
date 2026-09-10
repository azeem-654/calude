-- ─────────────────────────────────────────────────────────────────────────────
-- The operator's own payment processor.
--
-- The app charges its own subscribers, and until now it did that with one
-- Worker secret: STRIPE_SECRET_KEY. That works, and it decides for the operator
-- which company they may be paid through — which is a strange thing for a
-- white-label product to insist on, and it made moving to Creem a code change
-- rather than a setting.
--
-- crm_install_providers already exists for exactly this shape of thing: the
-- operator's own accounts, encrypted, one row per kind. A payment processor is
-- another kind. No new table.
-- ─────────────────────────────────────────────────────────────────────────────

-- Whatever the processor needs remembered between calls, opaque to everything
-- else. Creem keeps its plan product ids here, because a recurring charge must
-- name a product and one created per charge would make a new plan every month.
ALTER TABLE crm_install_providers ADD COLUMN provider_ref TEXT NOT NULL DEFAULT '';
