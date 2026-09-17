-- ─────────────────────────────────────────────────────────────────────────────
-- Tax.
--
-- ── What this is, and firmly what it is not ──
--
-- It is a rate per country that a checkout can apply and a receipt can name.
-- That is what a small shop selling into a handful of countries actually needs,
-- and it is the difference between a VAT-registered business being able to use
-- this at all and not.
--
-- It is **not** a tax engine. It does not know about US state and city nexus,
-- about which of forty-five states tax delivery, about digital-goods place-of-
-- supply rules, or about EU OSS thresholds. Pretending otherwise would be the
-- worst kind of wrong here: quietly under-collecting for a year is a bill with
-- interest on it, and the shopkeeper would have no reason to look.
--
-- So the screen says so, and anybody whose situation is more complicated than
-- "one rate per country" is told to get advice rather than trust this.
--
-- ── Basis points ──
--
-- `percent_bp` is hundredths of a percent: 20% is 2000, and New York's 8.875%
-- is 887.5 — which is why it cannot be a whole percent. Stored as an integer
-- because a tax rate held as a float is a rounding error on every order.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_tax_rates (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  -- What the receipt calls it: "VAT", "Sales tax", "GST".
  name          TEXT NOT NULL DEFAULT 'Tax',

  -- Comma-separated ISO country codes, or '' for everywhere else — the same
  -- shape and the same fallback rule as the shipping rates, so a shopkeeper
  -- who has learned one has learned both.
  countries     TEXT NOT NULL DEFAULT '',

  -- Hundredths of a percent. 2000 = 20%. 888 = 8.88%.
  percent_bp    INTEGER NOT NULL DEFAULT 0,

  position      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tax_account ON crm_tax_rates (account_id, position);

-- ── Whether the prices already include it ──
--
-- The single most important setting here, and the one that differs by
-- hemisphere. A UK shop lists £120 and that £120 *contains* £20 of VAT; a US
-- shop lists $100 and adds tax at the till. Getting it backwards either
-- overcharges every buyer by the tax rate or absorbs it out of the margin, and
-- both look completely normal on screen.
--
-- Defaults to 1 — included — because that is the norm where most of this
-- install's customers are, and because the failure it causes is visible (a
-- total that does not move) rather than silent (a margin quietly eaten).
ALTER TABLE crm_storefront ADD COLUMN prices_include_tax INTEGER NOT NULL DEFAULT 1;

-- What an order was actually taxed, frozen onto it like the price, the code
-- and the delivery. A rate changed next April must not restate last year's
-- receipts.
ALTER TABLE crm_orders ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_orders ADD COLUMN tax_label TEXT NOT NULL DEFAULT '';
