-- Lead-to-revenue and the growth service's performance fee (phase 2).
--
-- A server ledger, not a CRM blob: every inquiry a contractor's workspace
-- receives, followed to the job, the money collected and the fee taken of it,
-- with every change written to an append-only event log. The fee is never
-- charged here — a statement is computed, reviewed with the contractor and
-- approved by the install owner, and invoicing happens outside this ledger.
-- See worker/src/lib/leadRevenue.ts for the rules and docs/claude/money.md.

-- The owner's commercial terms, effective-dated and append-only: a new row
-- applies to agreements drafted after its date and never touches one already
-- signed (that agreement holds its own copy).
CREATE TABLE IF NOT EXISTS crm_growth_terms (
  id               TEXT PRIMARY KEY,
  effective_from   TEXT NOT NULL,            -- YYYY-MM-DD
  currency         TEXT NOT NULL DEFAULT 'USD',
  setup_cents      INTEGER NOT NULL,
  monthly_cents    INTEGER NOT NULL,
  performance_bps  INTEGER NOT NULL,
  attribution_days INTEGER NOT NULL,
  exclusions       TEXT NOT NULL DEFAULT '[]', -- JSON list of excluded amount kinds
  note             TEXT NOT NULL DEFAULT '',
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_terms_from ON crm_growth_terms(effective_from);

-- One customer's agreement: a snapshot of the terms at drafting, fixed once signed.
CREATE TABLE IF NOT EXISTS crm_growth_agreements (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  status           TEXT NOT NULL,            -- draft | active | ended
  terms_id         TEXT,
  currency         TEXT NOT NULL,
  setup_cents      INTEGER NOT NULL,
  monthly_cents    INTEGER NOT NULL,
  performance_bps  INTEGER NOT NULL,
  attribution_days INTEGER NOT NULL,
  exclusions       TEXT NOT NULL,
  customer_name    TEXT NOT NULL DEFAULT '',
  signed_by        TEXT NOT NULL DEFAULT '',
  signed_at        TEXT,
  starts_on        TEXT,
  ends_on          TEXT,
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_agreements_account ON crm_growth_agreements(account_id);
-- At most one agreement in force per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_growth_agreement_active ON crm_growth_agreements(account_id) WHERE status = 'active';
-- A signed agreement's commercial terms cannot be rewritten, by the route or by anything else.
CREATE TRIGGER IF NOT EXISTS trg_growth_agreement_fixed
BEFORE UPDATE OF currency, setup_cents, monthly_cents, performance_bps, attribution_days, exclusions, account_id, signed_at, signed_by, starts_on
ON crm_growth_agreements
WHEN OLD.status != 'draft'
BEGIN
  SELECT RAISE(ABORT, 'signed agreement terms are fixed');
END;

-- Every inquiry, followed to the job. First touch (channel, detail, time,
-- agreement) is written once at creation; corrections are events, not edits.
CREATE TABLE IF NOT EXISTS crm_rev_leads (
  id                   TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  service              TEXT NOT NULL DEFAULT '',
  stage                TEXT NOT NULL,
  channel              TEXT NOT NULL,
  channel_detail       TEXT NOT NULL DEFAULT '',
  first_touch_at       TEXT NOT NULL,
  by_service           INTEGER NOT NULL,     -- 1 = brought in by the agreed service work
  agreement_id         TEXT,                 -- the agreement in force at first touch
  existing_customer    INTEGER NOT NULL DEFAULT 0,
  consent              TEXT NOT NULL DEFAULT 'inquiry',
  timezone             TEXT NOT NULL DEFAULT '',
  quote_cents          INTEGER,
  final_cents          INTEGER,
  invoice_ref          TEXT NOT NULL DEFAULT '',
  invoiced_cents       INTEGER,
  invoiced_at          TEXT,
  won_at               TEXT,
  completed_at         TEXT,
  completed_by         TEXT,
  lost_reason          TEXT NOT NULL DEFAULT '',
  idem_key             TEXT,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_leads_account ON crm_rev_leads(account_id, stage);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_leads_idem ON crm_rev_leads(account_id, idem_key) WHERE idem_key IS NOT NULL;

-- Money on a lead. A payment counts toward a fee only once the contractor has
-- confirmed it (or an integration verified it), and only once.
CREATE TABLE IF NOT EXISTS crm_rev_payments (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  lead_id          TEXT NOT NULL,
  kind             TEXT NOT NULL,            -- payment | refund | chargeback
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  excluded_cents   INTEGER NOT NULL DEFAULT 0 CHECK (excluded_cents >= 0),
  received_on      TEXT NOT NULL,            -- YYYY-MM-DD
  method           TEXT NOT NULL,
  verification     TEXT NOT NULL,            -- reported | contractor_confirmed | integration_verified
  reference        TEXT NOT NULL DEFAULT '',
  disputed         INTEGER NOT NULL DEFAULT 0,
  void             INTEGER NOT NULL DEFAULT 0,
  recorded_by      TEXT NOT NULL,
  recorded_at      TEXT NOT NULL,
  confirmed_by     TEXT,
  confirmed_at     TEXT,
  statement_id     TEXT,                     -- the approved statement that counted it
  idem_key         TEXT
);
CREATE INDEX IF NOT EXISTS idx_rev_payments_lead ON crm_rev_payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_rev_payments_account ON crm_rev_payments(account_id, statement_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_payments_idem ON crm_rev_payments(account_id, idem_key) WHERE idem_key IS NOT NULL;
-- Money on an approved statement is history.
CREATE TRIGGER IF NOT EXISTS trg_rev_payment_counted
BEFORE UPDATE OF amount_cents, excluded_cents, kind, received_on, lead_id, void, account_id ON crm_rev_payments
WHEN OLD.statement_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'payment is on an approved statement');
END;

-- Who did what, when. Never updated or deleted by the app.
CREATE TABLE IF NOT EXISTS crm_rev_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  lead_id    TEXT,
  kind       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '{}',
  by_email   TEXT NOT NULL,
  by_role    TEXT NOT NULL,                  -- owner | contractor | system
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_events_lead ON crm_rev_events(lead_id, id);
CREATE INDEX IF NOT EXISTS idx_rev_events_account ON crm_rev_events(account_id, id);

-- A performance-fee statement: computed, reviewed with the contractor, approved by the owner.
CREATE TABLE IF NOT EXISTS crm_rev_statements (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  agreement_id    TEXT NOT NULL,
  label           TEXT NOT NULL,             -- YYYY-MM
  period_end      TEXT NOT NULL,             -- YYYY-MM-DD
  status          TEXT NOT NULL,             -- draft | review | approved | void
  currency        TEXT NOT NULL,
  bps             INTEGER NOT NULL,
  gross_cents     INTEGER NOT NULL,
  excluded_cents  INTEGER NOT NULL,
  refunds_cents   INTEGER NOT NULL,
  carried_cents   INTEGER NOT NULL,
  net_cents       INTEGER NOT NULL,
  fee_cents       INTEGER NOT NULL,
  carry_out_cents INTEGER NOT NULL,
  lines           TEXT NOT NULL,             -- JSON: counted lines and what was held back, and why
  computed_at     TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  sent_at         TEXT,
  approved_by     TEXT,
  approved_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_rev_statements_account ON crm_rev_statements(account_id, period_end);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rev_statement_open ON crm_rev_statements(agreement_id) WHERE status IN ('draft', 'review');

-- A contractor's question about a statement line, and the answer.
CREATE TABLE IF NOT EXISTS crm_rev_queries (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  statement_id  TEXT NOT NULL,
  line_ref      TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,
  by_email      TEXT NOT NULL,
  at            TEXT NOT NULL,
  answer        TEXT NOT NULL DEFAULT '',
  answered_by   TEXT,
  answered_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_rev_queries_statement ON crm_rev_queries(statement_id);

-- What the contractor approves before it happens: call scripts, ad budgets,
-- third-party expenses, campaigns.
CREATE TABLE IF NOT EXISTS crm_rev_approvals (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  amount_cents  INTEGER,
  status        TEXT NOT NULL,               -- pending | approved | declined | withdrawn
  requested_by  TEXT NOT NULL,
  requested_at  TEXT NOT NULL,
  decided_by    TEXT,
  decided_at    TEXT,
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rev_approvals_account ON crm_rev_approvals(account_id, status);

-- Numbers that must not be called, per workspace.
CREATE TABLE IF NOT EXISTS crm_rev_dnc (
  account_id TEXT NOT NULL,
  phone      TEXT NOT NULL,                  -- digits only
  reason     TEXT NOT NULL DEFAULT '',
  added_by   TEXT NOT NULL,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (account_id, phone)
);

-- Calls made by people on the service team. The software places none.
CREATE TABLE IF NOT EXISTS crm_rev_calls (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  lead_id     TEXT,
  phone       TEXT NOT NULL,
  script_id   TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  checks      TEXT NOT NULL DEFAULT '{}',
  called_at   TEXT NOT NULL,
  by_email    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_calls_account ON crm_rev_calls(account_id, called_at);
