-- Medical billing / revenue-cycle management (phase 4).
--
-- The install owner runs billing for medical practices; each practice is a
-- customer workspace. Claims carry two statuses that are never merged — the
-- clearinghouse's and the payer's — and money on a claim comes only from a
-- posted remittance row. Every view and change is written to an append-only
-- access log. Rules: worker/src/lib/rcm.ts. Who may do what: routes/rcm.ts.
--
-- No column here holds a patient's name, date of birth, address or SSN: the
-- practice's own account reference is the minimum the work needs. A workspace
-- starts synthetic (references must start SYN-) and goes live only after the
-- install-wide launch blockers are signed off.

-- One row per practice workspace: its data mode and working rules.
CREATE TABLE IF NOT EXISTS crm_rcm_settings (
  account_id          TEXT PRIMARY KEY,
  data_mode           TEXT NOT NULL DEFAULT 'synthetic', -- synthetic | live
  baa_signed_on       TEXT,
  coding_review       INTEGER NOT NULL DEFAULT 1,       -- every claim passes coding review before it is ready
  timely_filing_days  INTEGER NOT NULL DEFAULT 90,      -- for a payer with no limit of its own
  appeal_days         INTEGER NOT NULL DEFAULT 60,
  live_by             TEXT,
  live_at             TEXT,
  updated_at          TEXT NOT NULL
);
-- Live is one-way: a workspace that has held real patient data is never relabelled as test data.
CREATE TRIGGER IF NOT EXISTS trg_rcm_live_one_way
BEFORE UPDATE OF data_mode ON crm_rcm_settings
WHEN OLD.data_mode = 'live' AND NEW.data_mode != 'live'
BEGIN
  SELECT RAISE(ABORT, 'a live workspace cannot go back to synthetic');
END;

-- The install-wide HIPAA launch blockers (lib/rcm.ts HIPAA_BLOCKERS), signed off by the owner.
CREATE TABLE IF NOT EXISTS crm_rcm_blockers (
  key      TEXT PRIMARY KEY,
  done_by  TEXT NOT NULL,
  done_at  TEXT NOT NULL,
  note     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS crm_rcm_practices (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  npi         TEXT NOT NULL DEFAULT '',
  specialty   TEXT NOT NULL DEFAULT '',
  synthetic   INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_practices_account ON crm_rcm_practices(account_id);

CREATE TABLE IF NOT EXISTS crm_rcm_providers (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  practice_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  npi          TEXT NOT NULL,
  specialty    TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  synthetic    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_providers_account ON crm_rcm_providers(account_id);

CREATE TABLE IF NOT EXISTS crm_rcm_payers (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  payer_code          TEXT NOT NULL DEFAULT '',
  kind                TEXT NOT NULL,
  timely_filing_days  INTEGER,
  fee_schedule        TEXT NOT NULL DEFAULT '{}',  -- JSON {code: contracted allowed cents per unit}
  synthetic           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_payers_account ON crm_rcm_payers(account_id);

CREATE TABLE IF NOT EXISTS crm_rcm_claims (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  claim_no           TEXT NOT NULL,             -- ours: the patient control number sent on the claim
  practice_id        TEXT NOT NULL,
  provider_id        TEXT NOT NULL,
  payer_id           TEXT NOT NULL,
  patient_ref        TEXT NOT NULL,
  synthetic          INTEGER NOT NULL DEFAULT 1,
  service_from       TEXT NOT NULL,
  service_to         TEXT NOT NULL,
  diagnoses          TEXT NOT NULL DEFAULT '[]',
  work_status        TEXT NOT NULL,             -- draft | coding_review | ready | submitted | closed
  ch_status          TEXT NOT NULL DEFAULT 'not_sent',
  ch_reason          TEXT NOT NULL DEFAULT '',
  ch_at              TEXT,
  payer_status       TEXT NOT NULL DEFAULT 'none',
  payer_claim_no     TEXT NOT NULL DEFAULT '',
  payer_at           TEXT,
  billed_cents       INTEGER NOT NULL DEFAULT 0,
  allowed_cents      INTEGER,
  paid_cents         INTEGER NOT NULL DEFAULT 0,
  patient_resp_cents INTEGER NOT NULL DEFAULT 0,
  adjust_cents       INTEGER NOT NULL DEFAULT 0,
  first_submitted_at TEXT,
  closed_reason      TEXT NOT NULL DEFAULT '',
  idem_key           TEXT,
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcm_claim_no ON crm_rcm_claims(account_id, claim_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcm_claim_idem ON crm_rcm_claims(account_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcm_claims_status ON crm_rcm_claims(account_id, work_status, ch_status, payer_status);

CREATE TABLE IF NOT EXISTS crm_rcm_lines (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  claim_id           TEXT NOT NULL,
  line_no            INTEGER NOT NULL,
  code               TEXT NOT NULL,
  modifiers          TEXT NOT NULL DEFAULT '[]',
  units              INTEGER NOT NULL,
  charge_cents       INTEGER NOT NULL CHECK (charge_cents > 0),
  dx_pointers        TEXT NOT NULL DEFAULT '[1]',
  allowed_cents      INTEGER,
  paid_cents         INTEGER NOT NULL DEFAULT 0,
  patient_resp_cents INTEGER NOT NULL DEFAULT 0,
  adjust_cents       INTEGER NOT NULL DEFAULT 0,
  remitted           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rcm_lines_claim ON crm_rcm_lines(claim_id, line_no);

CREATE TABLE IF NOT EXISTS crm_rcm_denials (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  claim_id      TEXT NOT NULL,
  line_id       TEXT,
  group_code    TEXT NOT NULL DEFAULT '',
  carc          TEXT NOT NULL DEFAULT '',
  rarc          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  denied_on     TEXT NOT NULL,
  appeal_by     TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  source        TEXT NOT NULL,               -- remit | manual
  remit_row_id  TEXT,
  resolved_by   TEXT,
  resolved_at   TEXT,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_account ON crm_rcm_denials(account_id, status);

CREATE TABLE IF NOT EXISTS crm_rcm_appeals (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  denial_id        TEXT NOT NULL,
  claim_id         TEXT NOT NULL,
  level            INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL,            -- drafting | submitted | won | partial | lost | withdrawn
  submitted_on     TEXT,
  due_on           TEXT,
  recovered_cents  INTEGER NOT NULL DEFAULT 0,
  summary          TEXT NOT NULL DEFAULT '',
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  decided_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_denial ON crm_rcm_appeals(denial_id);

-- One imported remittance file. The same file twice is refused by its hash.
CREATE TABLE IF NOT EXISTS crm_rcm_remits (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  checks          TEXT NOT NULL DEFAULT '[]',
  file_paid_cents INTEGER NOT NULL,
  posted_cents    INTEGER NOT NULL DEFAULT 0,
  deposit_cents   INTEGER,
  rows_total      INTEGER NOT NULL,
  rows_posted     INTEGER NOT NULL DEFAULT 0,
  rows_unmatched  INTEGER NOT NULL DEFAULT 0,
  rows_duplicate  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,              -- unreconciled | reconciled
  synthetic       INTEGER NOT NULL DEFAULT 1,
  imported_by     TEXT NOT NULL,
  imported_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcm_remit_file ON crm_rcm_remits(account_id, file_hash);

-- Every row of every file, with what became of it. A row's key is unique per
-- workspace: a payment resent in another file is recorded as a duplicate and
-- never posted twice.
CREATE TABLE IF NOT EXISTS crm_rcm_remit_rows (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  remit_id           TEXT NOT NULL,
  row_no             INTEGER NOT NULL,
  row_key            TEXT NOT NULL,
  claim_no           TEXT NOT NULL DEFAULT '',
  payer_claim_no     TEXT NOT NULL DEFAULT '',
  service_date       TEXT NOT NULL DEFAULT '',
  code               TEXT NOT NULL,
  billed_cents       INTEGER NOT NULL DEFAULT 0,
  allowed_cents      INTEGER NOT NULL DEFAULT 0,
  paid_cents         INTEGER NOT NULL DEFAULT 0,
  patient_resp_cents INTEGER NOT NULL DEFAULT 0,
  adj_group          TEXT NOT NULL DEFAULT '',
  carc               TEXT NOT NULL DEFAULT '',
  rarc               TEXT NOT NULL DEFAULT '',
  check_no           TEXT NOT NULL DEFAULT '',
  paid_on            TEXT NOT NULL DEFAULT '',
  outcome            TEXT NOT NULL,          -- posted | unmatched | duplicate | set_aside
  claim_id           TEXT,
  line_id            TEXT,
  set_aside_reason   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rcm_remit_rows_remit ON crm_rcm_remit_rows(remit_id, row_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcm_remit_row_posted ON crm_rcm_remit_rows(account_id, row_key) WHERE outcome = 'posted';
-- A posted payment is history: its amounts and where it went are never rewritten.
CREATE TRIGGER IF NOT EXISTS trg_rcm_row_posted
BEFORE UPDATE OF paid_cents, allowed_cents, patient_resp_cents, claim_id, line_id, row_key ON crm_rcm_remit_rows
WHEN OLD.outcome = 'posted'
BEGIN
  SELECT RAISE(ABORT, 'a posted remittance row is fixed');
END;

CREATE TABLE IF NOT EXISTS crm_rcm_auths (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  practice_id   TEXT NOT NULL,
  payer_id      TEXT NOT NULL,
  patient_ref   TEXT NOT NULL,
  code          TEXT NOT NULL,
  units         INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL,
  auth_no       TEXT NOT NULL DEFAULT '',
  due_on        TEXT,
  requested_on  TEXT,
  decided_on    TEXT,
  valid_from    TEXT,
  valid_to      TEXT,
  synthetic     INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_auths_account ON crm_rcm_auths(account_id, status);

-- Notes on a claim or an authorization. `internal` is the billing team's
-- alone and is never sent to a practice login.
CREATE TABLE IF NOT EXISTS crm_rcm_notes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  claim_id    TEXT,
  auth_id     TEXT,
  visibility  TEXT NOT NULL,                 -- internal | practice
  kind        TEXT NOT NULL DEFAULT 'note',  -- note | request
  body        TEXT NOT NULL,
  by_email    TEXT NOT NULL,
  by_role     TEXT NOT NULL,                 -- biller | practice
  at          TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rcm_notes_claim ON crm_rcm_notes(account_id, claim_id);

-- Who looked at or changed what, when. Never updated or deleted, by the app or anything else.
CREATE TABLE IF NOT EXISTS crm_rcm_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,
  claim_id    TEXT,
  kind        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '{}',
  by_email    TEXT NOT NULL,
  by_role     TEXT NOT NULL,                 -- biller | practice | owner
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rcm_events_account ON crm_rcm_events(account_id, id);
CREATE INDEX IF NOT EXISTS idx_rcm_events_claim ON crm_rcm_events(claim_id, id);
CREATE TRIGGER IF NOT EXISTS trg_rcm_events_no_update
BEFORE UPDATE ON crm_rcm_events
BEGIN
  SELECT RAISE(ABORT, 'the access log is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_rcm_events_no_delete
BEFORE DELETE ON crm_rcm_events
BEGIN
  SELECT RAISE(ABORT, 'the access log is append-only');
END;
