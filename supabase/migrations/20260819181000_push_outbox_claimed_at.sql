-- Applied to production 2026-08-19 (name: push_outbox_claimed_at_stuck_detection).
-- requeue_stuck_push_outbox keyed "stuck" on created_at (enqueue time) rather
-- than claim time, so a dispatch run that outlived its 5-minute slot had its
-- in-flight rows requeued and re-sent. Adds push_outbox.claimed_at, stamps it in
-- claim_push_outbox_batch, and repoints the predicate at it.
SELECT 'see supabase migration history: push_outbox_claimed_at_stuck_detection' AS note;
