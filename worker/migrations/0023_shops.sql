-- ─────────────────────────────────────────────────────────────────────────────
-- A shop a stranger can actually buy from.
--
-- "Publishing" a website meant setting a status flag: the badge turned green,
-- /preview/<id> rendered it for whoever was already signed in, and no visitor
-- could reach it. That is fine for a brochure nobody was going to visit and
-- useless for selling, so an e-commerce project needs a page that exists
-- without a session and a way to take money from somebody who has never heard
-- of this app.
--
-- The payment half already exists — crm_storefront holds the workspace's own
-- Stripe or Creem key, and lib/payments makes the checkout. What was missing is
-- the shopfront: a public address, a list of what is for sale, and a buy button
-- that a visitor can press.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_shops (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,

  -- Which project this shop belongs to. An e-commerce project owns its
  -- catalogue; a sub-account running three shops for three clients must not
  -- have them share one.
  project_id   TEXT NOT NULL DEFAULT '',

  -- The public address: /shop/<slug>. Unique across the install, because two
  -- shops answering the same URL is one customer's products on another's page.
  slug         TEXT NOT NULL,

  name         TEXT NOT NULL,
  headline     TEXT NOT NULL DEFAULT '',
  about        TEXT NOT NULL DEFAULT '',
  accent       TEXT NOT NULL DEFAULT '#17191c',

  -- draft | published. A draft answers 404 to a visitor rather than showing a
  -- half-built shop with a working buy button on it.
  status       TEXT NOT NULL DEFAULT 'draft',

  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_slug ON crm_shops (slug);
CREATE INDEX IF NOT EXISTS idx_shops_account ON crm_shops (account_id, status);

-- ── Which project a product belongs to ──
--
-- Empty for everything that existed before projects, and those stay visible to
-- the workspace's first shop rather than disappearing to keep a column tidy.
ALTER TABLE crm_products ADD COLUMN project_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_products_project ON crm_products (account_id, project_id, status);

-- ── Where an order came from ──
--
-- An order placed by a visitor on a public shop is a different thing from one
-- somebody typed in after a phone call, and the difference matters when a
-- refund is argued about. `channel` already records 'manual' or the processor;
-- this records which shop, when there was one.
ALTER TABLE crm_orders ADD COLUMN shop_id TEXT NOT NULL DEFAULT '';
