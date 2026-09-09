-- ─────────────────────────────────────────────────────────────────────────────
-- Give an action's effect a column of its own.
--
-- 0009 had the planner stash what an action *means* — enrol these contacts in
-- that sequence — as JSON in `detail`, and the execution pass read it back from
-- there. `detail` is also where the human-readable outcome goes when the action
-- finishes, so one column was carrying two unrelated things.
--
-- It broke on the path that matters most. Approving a held-back action sets
-- `detail` (to clear any earlier note) and moves it to pending — which wiped
-- the effect. The tick then found an action with nothing to do, carried out
-- nothing, and marked it Done. A customer would have approved sending a
-- campaign to forty people, been told it was done, and had nothing sent: the
-- worst possible failure for this feature, because it reports success.
--
-- Two columns, two jobs. `effect` is what to do and is written once; `detail`
-- is what happened and is written at the end.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_autopilot_actions ADD COLUMN effect TEXT NOT NULL DEFAULT '{"type":"none"}';

-- Carry across anything 0009 already wrote. An action still waiting when this
-- runs has its effect in `detail`; one that has finished has prose there, which
-- is not JSON and is left alone by the guard below.
UPDATE crm_autopilot_actions
   SET effect = detail
 WHERE status IN ('pending', 'awaiting')
   AND detail LIKE '{%'
   AND detail LIKE '%"type"%';

-- And clear those, so `detail` means only one thing from here on.
UPDATE crm_autopilot_actions
   SET detail = ''
 WHERE status IN ('pending', 'awaiting')
   AND detail LIKE '{%'
   AND detail LIKE '%"type"%';
