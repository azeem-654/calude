-- ─────────────────────────────────────────────────────────────────────────────
-- A counter per caller, per thing, per window.
--
-- ── Why a table rather than a Durable Object or KV ──
--
-- Because the limits here are not hot paths — a stranger looking up an order,
-- a stranger placing one — and D1 is already open on every one of those
-- requests. A Durable Object would be the right answer at a scale this is not
-- at, and would add a binding, a second failure mode and a cold start to a
-- path whose whole job is to be dull.
--
-- ── Why it is one row and one statement ──
--
-- Read-then-write across two awaits lets two requests both read "4 of 5" and
-- both write "5", which is a limit that can be beaten by holding the button
-- down. The upsert in `lib/rateLimit.ts` decides, resets and counts in a
-- single statement, so concurrent callers queue behind one another in SQLite
-- rather than racing.
--
-- ── What this is not ──
--
-- It is not a defence against a distributed flood: the bucket is usually an IP
-- address, and an attacker with a thousand of them gets a thousand budgets.
-- Cloudflare's own edge is what stands in front of that. This stops one caller
-- hammering one endpoint, which is the realistic abuse of a public shop.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_rate_limits (
  -- '<what>:<who>', e.g. 'order-lookup:203.0.113.7'. Composed by the caller so
  -- two endpoints can never share a budget by accident.
  bucket        TEXT PRIMARY KEY,
  hits          INTEGER NOT NULL DEFAULT 0,
  -- When the current window opened. ISO, so the comparison is a string compare
  -- and needs no date functions.
  window_start  TEXT NOT NULL
);

-- Expired rows are dead weight — every window that ever opened leaves one. The
-- cron sweeps them; the index is what makes that sweep cheap rather than a
-- full scan of every visitor the shop has ever had.
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON crm_rate_limits (window_start);
