-- ─────────────────────────────────────────────────────────────────────────────
-- Collections.
--
-- ── What a category could not do ──
--
-- A product carries one `category`, which the shop page filters by. That is a
-- taxonomy: a candle is in Candles and nowhere else. Merchandising is a
-- different job — "New in", "Under £20", "Gifts for him", "Summer" — and the
-- same candle belongs in several of those at once, or in none.
--
-- So this is many-to-many and the category stays where it is. They answer
-- different questions and collapsing them would mean a shop choosing between
-- filing its stock and selling it.
--
-- ── Why the order is stored twice ──
--
-- `crm_collections.position` is the order the collections appear in on the
-- shop. `crm_collection_products.position` is the order of the products
-- *within* one collection — the whole point of a hand-built collection is that
-- the shopkeeper decides what is at the top of it, and that order differs per
-- collection for the same product.
--
-- ── account_id on the join table ──
--
-- Denormalised on purpose. Every read here is already scoped to a workspace,
-- and carrying it means a membership row can be checked and deleted without a
-- join back to either parent — which is what stops a stray id from another
-- workspace ever resolving.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_collections (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  name          TEXT NOT NULL,
  -- For the address a collection could be linked at. Unique per workspace, so
  -- two collections cannot both claim /shop/x?in=gifts.
  slug          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',

  position      INTEGER NOT NULL DEFAULT 0,
  -- 'active' or 'off'. A collection being built is not one buyers should see
  -- half of, the same rule as a draft product.
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collections_account ON crm_collections (account_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_slug ON crm_collections (account_id, slug);

CREATE TABLE IF NOT EXISTS crm_collection_products (
  collection_id TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_account ON crm_collection_products (account_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_product ON crm_collection_products (product_id);
