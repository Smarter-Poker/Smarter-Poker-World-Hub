-- 2026-08-20: clear the stale break flags on already-COMPLETED tournaments.
--
-- endBreak() resets on_break/break_ends_at and never runs if the event
-- finishes DURING a break, so three COMPLETED tournaments were left flagged
-- on_break = true (one reading 1,231 minutes "on break").
--
-- Nothing resumes a COMPLETED event, so play was never affected -- verified
-- that 0 RUNNING tournaments were stuck on a break -- but a finished
-- tournament that reads as stuck is a false signal that costs someone an
-- investigation later.
--
-- The engine no longer creates these (the COMPLETING -> COMPLETED transition
-- clears both flags as of Club Arena 6901125ff); this cleans up the rows that
-- already existed. Scoped to COMPLETED/CANCELLED only, so a genuinely running
-- break is never disturbed.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'clear_stale_on_break_on_completed' on 2026-08-20. Verified after: 0 stale
-- flags remain.
UPDATE tournaments
   SET on_break = false,
       break_ends_at = NULL
 WHERE status IN ('COMPLETED', 'CANCELLED')
   AND on_break IS TRUE;
