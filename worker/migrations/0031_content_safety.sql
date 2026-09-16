-- ─────────────────────────────────────────────────────────────────────────────
-- Content safety: what was held, why, and what became of the account.
--
-- ── Why this is a ledger and not a flag on the content ──
--
-- The content itself lives in crm_data as an opaque JSON blob the client owns,
-- and putting a "blocked" boolean inside it would put the decision under the
-- control of the thing being judged: the next sync from the browser overwrites
-- the blob, flag and all. A row here is written by the server, keyed by what
-- the content *is*, and the send and publish paths consult it. A customer
-- cannot clear their own hold by pressing save.
--
-- ── Why a hash and not the text ──
--
-- `subject_hash` is what the send path looks up: the same body offered again
-- from a different screen is the same decision. Storing the text as well is
-- deliberate — the owner has to read what they are approving, and a hash is not
-- readable. The text is capped so one pasted novel cannot fill the table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_content_reviews (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  -- email | sms | blog | website | product | shop | social | portfolio | reply
  surface       TEXT NOT NULL,

  -- SHA-256 of the normalised text. The send path's lookup key: the same words
  -- offered again are the same decision, whichever screen they came from.
  subject_hash  TEXT NOT NULL,

  -- What the owner reads. Capped; the decision is about the content, and the
  -- first few thousand characters decide it.
  excerpt       TEXT NOT NULL DEFAULT '',

  -- adult | violence | politics | hate | illegal | other
  category      TEXT NOT NULL,

  -- The terms that matched, so a decision can be explained and a bad rule found.
  matched       TEXT NOT NULL DEFAULT '',

  -- 0-100. Below the review threshold nothing is written here at all.
  score         INTEGER NOT NULL DEFAULT 0,

  -- Whether the AI second pass ran, and what it said. Empty when the lexicon
  -- alone decided — which is most of the time, because the second pass costs
  -- money and only runs near the line.
  ai_verdict    TEXT NOT NULL DEFAULT '',
  ai_reason     TEXT NOT NULL DEFAULT '',

  -- held | approved | rejected
  --
  -- `held` is the only state that stops a send. An approved row is kept rather
  -- than deleted so the same content does not queue again tomorrow, and so the
  -- owner can see what they have already said yes to.
  status        TEXT NOT NULL DEFAULT 'held',
  decided_by    TEXT NOT NULL DEFAULT '',
  decided_at    TEXT,
  note          TEXT NOT NULL DEFAULT '',

  created_at    TEXT NOT NULL
);

-- The send path's question: "is there a live decision about these words for
-- this workspace". Covering both columns so it never reads the table.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_lookup
  ON crm_content_reviews (account_id, subject_hash);
CREATE INDEX IF NOT EXISTS idx_reviews_queue ON crm_content_reviews (status, created_at);

-- ── What became of the account ──
--
-- Separate from crm_workspaces because standing follows the *account*, and one
-- account can own several workspaces. Suspending somebody who simply made a
-- second workspace would otherwise be a suspension they can walk around.
--
-- `ok` is the absence of a row. Only trouble is recorded, so this table stays
-- small and a missing row can never be read as a silent suspension.
CREATE TABLE IF NOT EXISTS crm_account_standing (
  email       TEXT PRIMARY KEY,

  -- warned | suspended
  --
  -- A warned account works normally and is told. A suspended one signs in,
  -- reads and exports, and cannot send or publish — deliberately not a locked
  -- door, because somebody wrongly suspended still owns their customer list and
  -- taking it hostage is not a moderation tool.
  state       TEXT NOT NULL,

  -- Shown to the customer. Written to be read by them, not by us.
  reason      TEXT NOT NULL DEFAULT '',

  -- The clause of the acceptable use policy this rests on, so a suspension can
  -- point at something rather than being an opinion.
  clause      TEXT NOT NULL DEFAULT '',

  set_by      TEXT NOT NULL DEFAULT '',
  -- Set when the customer has seen it. A warning nobody read did not happen.
  seen_at     TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ── Which policy they agreed to ──
--
-- A version and a timestamp, because "they accepted the terms" is worth nothing
-- if nobody can say which terms. Re-agreement is an UPDATE: only the current
-- acceptance matters for whether they may carry on using the product.
CREATE TABLE IF NOT EXISTS crm_policy_acceptance (
  email       TEXT PRIMARY KEY,
  version     TEXT NOT NULL,
  -- The address it was accepted from. Not identification — it is the one fact
  -- that distinguishes "they agreed" from "somebody agreed on their behalf".
  ip          TEXT NOT NULL DEFAULT '',
  accepted_at TEXT NOT NULL
);
