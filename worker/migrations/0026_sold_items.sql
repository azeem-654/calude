-- ─────────────────────────────────────────────────────────────────────────────
-- What was sold, what it cost, and what it made.
--
-- ── Why a table rather than a query over the orders ──
--
-- An order knows what was quoted. It does not know what the supplier actually
-- charged, and those are different numbers: a premium name, a promotional
-- price, a TLD whose wholesale moved between the quote and the registration.
-- Reporting margin from the quote alone reports the margin we *hoped* for.
--
-- So each thing is written down at the moment it is provisioned, with the
-- figure the supplier really charged beside the figure the customer really
-- paid. That makes the earnings report arithmetic on facts rather than an
-- estimate, and it makes a loss visible — which a quote-based report cannot
-- show, because a quote is never a loss.
--
-- ── Cost never leaves the Worker ──
--
-- `cost_cents` is readable only by the install owner's own endpoints. Nothing
-- customer-facing selects from this table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_sold_items (
  id          TEXT PRIMARY KEY,

  -- Which workspace it was sold to, and which order it came from. The order can
  -- be empty: a mailbox added later from the mailbox manager is a real sale
  -- with no setup order behind it, and leaving it out would quietly understate
  -- earnings.
  account_id  TEXT NOT NULL,
  order_id    TEXT NOT NULL DEFAULT '',

  -- domain | mailbox | hosting | crm | content
  kind        TEXT NOT NULL,
  -- The domain, the address, or the service's own name.
  item        TEXT NOT NULL,

  -- What the supplier charged us, as they reported it. Zero when nothing was
  -- charged — a service we provide ourselves costs us nothing per unit, and
  -- recording a guess there would invent a cost of goods that does not exist.
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  -- What the customer paid.
  retail_cents INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',

  -- 'year' for a domain, 'month' for a service, 'once' for anything else. The
  -- report cannot add a yearly figure to a monthly one without knowing which
  -- is which, and a single blended total is true of neither.
  period      TEXT NOT NULL DEFAULT 'once',

  -- Which supplier, for an install that later uses more than one.
  provider    TEXT NOT NULL DEFAULT '',

  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sold_items_account ON crm_sold_items (account_id);
CREATE INDEX IF NOT EXISTS idx_sold_items_order   ON crm_sold_items (order_id);
CREATE INDEX IF NOT EXISTS idx_sold_items_kind    ON crm_sold_items (kind, created_at);

-- One sale is recorded once. A provisioning step that runs twice — which it is
-- designed to survive — must not double the earnings report.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sold_items_unique ON crm_sold_items (account_id, kind, item);
