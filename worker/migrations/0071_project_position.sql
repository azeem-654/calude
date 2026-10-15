-- ─────────────────────────────────────────────────────────────────────────────
-- The order a workspace's AI Autopilot projects are shown in, as the customer
-- set it.
--
-- The board was ordered by `created_at`, which put a new project last but left
-- nobody able to say "this client comes first". A position is kept per
-- workspace: 1 is the top. A new project is given the workspace's highest + 1
-- (`save_project`), so it lands in the last row; `reorder_projects` rewrites
-- the positions from the list the board sends.
--
-- Existing rows are numbered oldest first — the order they were already shown
-- in — with the id breaking a tie so two projects made in the same second do
-- not share a place.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm_projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE crm_projects SET position = (
  SELECT COUNT(*) FROM crm_projects p2
  WHERE p2.account_id = crm_projects.account_id
    AND (p2.created_at < crm_projects.created_at
      OR (p2.created_at = crm_projects.created_at AND p2.id <= crm_projects.id))
);

CREATE INDEX IF NOT EXISTS idx_projects_position ON crm_projects (account_id, position);
