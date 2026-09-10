-- ─────────────────────────────────────────────────────────────────────────────
-- More than one way to be paid.
--
-- crm_storefront was written when Stripe was the only processor, and it says
-- so: the column holding the secret is called stripe_key. That was honest then
-- and is wrong now — a workspace can be paid through Creem instead, and a
-- Creem key sitting in a column called stripe_key is the kind of thing somebody
-- reads at speed and gets wrong.
--
-- So the secret moves to a column that does not name a vendor, and a `provider`
-- column says whose it is. The old column is left in place and backfilled from
-- rather than dropped: it holds live customer credentials, and a migration that
-- destroys those to tidy a name is a bad trade. Nothing reads it after this.
-- ─────────────────────────────────────────────────────────────────────────────

-- Which processor this workspace is connected to. Defaults to stripe because
-- that is what every existing row already is.
ALTER TABLE crm_storefront ADD COLUMN provider TEXT NOT NULL DEFAULT 'stripe';

-- The processor's secret, encrypted, whoever the processor is.
ALTER TABLE crm_storefront ADD COLUMN api_key TEXT NOT NULL DEFAULT '';

-- Anything the processor needs remembered between calls. Creem keeps the id of
-- the workspace's reusable order product here, because a Creem checkout must
-- name a product that already exists and creating one per order would fill the
-- customer's catalogue with a year of sales. Stripe stores nothing.
ALTER TABLE crm_storefront ADD COLUMN provider_ref TEXT NOT NULL DEFAULT '';

-- Every workspace connected before today is on Stripe, and its key is already
-- encrypted with the same install secret, so this is a move rather than a
-- re-encrypt.
UPDATE crm_storefront SET api_key = stripe_key WHERE api_key = '' AND stripe_key != '';
