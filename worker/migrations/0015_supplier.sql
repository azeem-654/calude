-- ─────────────────────────────────────────────────────────────────────────────
-- A supplier who makes and ships the thing.
--
-- The commerce tables assumed the customer holds their own stock. The other
-- half of what was promised is the person with no stock at all: they pick a
-- product, somebody else prints and posts it, and they never touch it.
--
-- `source` and `supplier_ref` were already on crm_products for exactly this, so
-- the product shape does not change. What was missing is the account to buy
-- from, and — the part that actually blocked it — somewhere to put a shipping
-- address. An order carrying only an email address cannot be fulfilled by
-- anybody, and no amount of supplier integration fixes that.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Whose supplier account ──
--
-- Bring-your-own only, and deliberately. Printful bills the account that places
-- the order; placing it on the operator's would make this app the buyer of
-- record for goods it never sees, liable for the chargeback and the customs
-- declaration. Domains are offered managed because a domain is a one-off
-- purchase with no goods and no returns. This is not that.
CREATE TABLE IF NOT EXISTS crm_suppliers (
  account_id   TEXT NOT NULL,

  -- 'printful' today. A column rather than an assumption, so a second supplier
  -- is a row and not a migration.
  provider     TEXT NOT NULL,

  -- {"token": "...", "storeId": "..."} — encrypted with the install secret, the
  -- same as mailbox passwords, and never returned to a browser.
  credentials  TEXT NOT NULL DEFAULT '',

  verified_at  TEXT,
  last_error   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,

  PRIMARY KEY (account_id, provider)
);

-- ── Where it is being sent ──
--
-- Collected by Stripe at checkout rather than typed into this app: the buyer is
-- already filling in a card form on a page that asks for an address correctly
-- for their country, and asking the seller to re-key it afterwards is how the
-- wrong house gets a parcel.
--
-- Separate columns rather than one JSON blob because a supplier API wants them
-- separately and validates each — a missing state_code is refused by name, and
-- a blob makes that error impossible to point at.
ALTER TABLE crm_orders ADD COLUMN ship_name     TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_address1 TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_address2 TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_city     TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_state    TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_zip      TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_country  TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN ship_phone    TEXT NOT NULL DEFAULT '';

-- ── What the supplier did with it ──
--
-- The supplier's own order id, kept so the seller can be told where the parcel
-- is without this app guessing. Empty until it has actually been submitted —
-- which is the difference between "we sent this to be made" and "we have a
-- record that says we did".
ALTER TABLE crm_orders ADD COLUMN supplier_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN supplier_ref      TEXT NOT NULL DEFAULT '';

-- draft | submitted | failed. Draft is what a first submission produces: it
-- reaches the supplier and is not charged or made until confirmed. A wrong
-- guess about somebody's address should cost them a click, not a printed shirt.
ALTER TABLE crm_orders ADD COLUMN supplier_status   TEXT NOT NULL DEFAULT '';
ALTER TABLE crm_orders ADD COLUMN supplier_error    TEXT NOT NULL DEFAULT '';
