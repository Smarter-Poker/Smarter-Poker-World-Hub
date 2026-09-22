# Operational notifications never reach the personal inbox

**Production Alerts fleet, 2026-09-22.** Routing defect, head of the queue.

## What was wrong

`operational_notification_destinations` (the private capture table for the
owner's financial/engine/estate alerts) held 880 rows, one for every
operational notification the platform had produced since 2026-08-31 -- and
every one of those 880 rows was *also* still sitting in the owner's personal
`public.notifications`, and 727 matching rows sat in `push_outbox`, 431 of
which show `status='sent'`: actually delivered to the owner's phone as a push
notification, not merely queued.

Every downstream mask worked: the mirror trigger's `WHEN` guard kept new
operational rows out of `push_outbox` once it was added, the RLS restrictive
policy hid them from direct authenticated reads, and the `personal_notifications`
view filtered them out of every server-side reader (`pages/api/notifications/
feed.js`, `unread-count.js`, `list.js`, `get-header-stats.js`). So the bug was
invisible through the app -- confirmed by re-deriving the same 880 destination
rows and reconciling; there was no duplication or classifier gap, just rows
that were captured into the operational store and then never removed from the
personal one.

## Root cause

`fn_capture_owner_notification_destination()`, the `BEFORE INSERT` trigger
function on `public.notifications`, ended with an unconditional `RETURN NEW`
even after capturing an operational row into
`operational_notification_destinations`. A `BEFORE INSERT` trigger that
returns `NULL` instead aborts the row for that `INSERT` statement -- so the
fix is one line: `RETURN NULL` inside the `IF` branch once the destination
capture and inbox record succeed, keeping `RETURN NEW` for every ordinary
personal notification.

`src/lib/notify.js` had a dependent bug: it read the new row's id back from
the `INSERT ... RETURNING id` result. Once the trigger legitimately suppresses
that row, there is nothing to read back, so the gateway now generates the
notification id itself (`randomUUID()`) before the insert and supplies it
explicitly, so it always knows which row the destination trigger captured --
regardless of whether the personal row round-trips.

## Fix

- `supabase/migrations/20260922133500_operational_notifications_never_reach_the_personal_inbox.sql`
  -- `CREATE OR REPLACE FUNCTION` with the `RETURN NULL`, guarded against the
  known-bad prior source and verified against the known-good new source by
  their `prosrc` md5s, then a bounded backfill delete of the 880 existing
  duplicate rows (only rows this trigger already captured with a confirmed
  `inbox_event_id`, never a blind sweep -- the destination table has no FK to
  `notifications` by design, so the evidence survives the delete).
- `src/lib/notify.js` -- generates and supplies the notification id up front
  for an operational row, since the DB insert now legitimately returns zero
  rows for those.
- `supabase/components/owner-operational-notification-destination.sql` and
  `scripts/ci/probes/owner-operational-notification/inputs/
  owner-notification-catalog-postimage.sql` updated to match, so a fresh
  install and the CI qualification pin both reflect the fixed behavior.
- `__tests__/operational-notification-destination.test.mjs` updated: the
  mock's `notifications` table now returns the same `data: null` a suppressed
  insert legitimately returns in production, for operational rows only. Run
  against the pre-fix gateway code, this reproduces the original bug's
  externally visible symptom (`out.ok === false` for every operational alert)
  and fails; it passes against the fix.

## Hardening

1. Regression test above, checked in beside the fix.
2. The invariant is now structural (an aborted `INSERT`), not a downstream
   filter that has to be re-applied by every reader correctly.
3. The store's own intake measurement (owner-destination row count vs.
   personal-inbox row count for the owner, by type) is the detection rule;
   any recurrence shows up as new drift between the two on the next fleet run.
4. `__tests__/operational-notification-destination.test.mjs` runs in the
   existing required CI on every PR touching this path.
