-- The owner's help button (the install owner's widget marked in_app — the one
-- on the public site and in the app's corner, routes/engage.ts houseWidgetKey):
-- the owner's request of 2026-11-07, applied once to the row itself rather than
-- forced in code, so Customer Engagement → the widget's settings show exactly
-- what the button offers and the owner can change it back there.
--
--  - "Start an online call" (voice) and "Share your screen with us" (screen)
--    are switched off.
--  - "Book a strategy call" is switched on: the widget's `meeting` feature
--    opens /book/<booking_slug>, and 'strategy-call' is the operator's own
--    reserved booking page (lib/strategyCall.ts), which widget.js names
--    "Book a strategy call". While bookings are closed that page sends the
--    visitor to the site's enquiry form, so the button never leads nowhere.
--
-- Only the install owner's widget: the single crm_users row with
-- account_id IS NULL AND role = 'agency', through the workspaces they own —
-- the same test houseWidgetKey uses. A customer's widget is never touched.
-- Run on a database with no such widget (a fresh one) it changes nothing.
UPDATE crm_widgets
SET features = (
      SELECT json_group_array(value) FROM (
        SELECT value FROM json_each(crm_widgets.features)
        WHERE value NOT IN ('voice', 'screen', 'meeting')
        UNION ALL SELECT 'meeting'
      )
    ),
    booking_slug = 'strategy-call',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE in_app = 1
  AND json_valid(features)
  AND account_id IN (
    SELECT ws.account_id FROM crm_workspaces ws
    JOIN crm_users u ON u.email = ws.owner_email
    WHERE u.account_id IS NULL AND u.role = 'agency'
  );
