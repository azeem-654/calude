-- ─────────────────────────────────────────────────────────────────────────────
-- Which template a workflow came from.
--
-- ── Why this column exists ──
--
-- The gallery wants to say how often each template has been used, and there was
-- no honest way to answer it. Matching on the workflow's name would break the
-- moment somebody renamed theirs, which is the first thing anybody does.
--
-- The alternative was an invented number, which is what every gallery in this
-- market ships — "8.2K uses" on a product with one install. A count that is
-- real is worth more than a count that is large: it starts at nothing, and
-- everything it later says is true.
--
-- Empty means the workflow was not made from a template — built from scratch,
-- or written by the AI from a sentence. That is most of them, eventually, and
-- it is a fact worth being able to see rather than a gap.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_project_workflows ADD COLUMN template_key TEXT NOT NULL DEFAULT '';

-- The gallery's one query: how many workflows in this workspace came from each
-- template. Without the index it is a scan of every workflow on every load of
-- a screen somebody browses.
CREATE INDEX IF NOT EXISTS idx_project_workflows_template
  ON crm_project_workflows (account_id, template_key);
