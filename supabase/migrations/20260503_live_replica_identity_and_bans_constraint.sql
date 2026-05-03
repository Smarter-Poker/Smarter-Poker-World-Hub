-- ═══════════════════════════════════════════════════════════════════════════
-- BUG FIX: REPLICA IDENTITY FULL + live_bans unique constraint
-- ═══════════════════════════════════════════════════════════════════════════
-- BUGS FOUND (Deep Audit Pass 3):
--
-- 1. live_comments DELETE realtime events deliver payload.old = {} (empty)
--    without REPLICA IDENTITY FULL. The viewer-side DELETE handler uses
--    payload.old.id to filter comments — without REPLICA IDENTITY FULL, this
--    is always undefined, so NO comment is ever removed from viewer screens
--    when a broadcaster deletes them. The subscriptions are wired correctly but
--    the data they receive is completely empty.
--    ALSO: Supabase's row-level filter (stream_id=eq.X) on DELETE events ONLY
--    works when REPLICA IDENTITY FULL is set — without it, filtered DELETE
--    events are silently dropped and never delivered.
--
-- 2. live_pins REPLICA IDENTITY FULL — same issue (belt-and-suspenders;
--    the current DELETE handler clears state unconditionally so it works
--    by accident, but the stream_id filter won't match without FULL identity).
--
-- 3. live_bans has no UNIQUE(stream_id, banned_user_id) constraint but
--    moderate.js uses upsert({ onConflict: 'stream_id,banned_user_id' }).
--    Without the constraint, every ban_user call inserts a new row, causing
--    duplicate ban records to accumulate.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. REPLICA IDENTITY FULL on live_comments
--    Required so Supabase realtime can include full OLD row data on DELETE,
--    and so row-level filters (stream_id=eq.X) work for DELETE events.
ALTER TABLE public.live_comments REPLICA IDENTITY FULL;

-- 2. REPLICA IDENTITY FULL on live_pins
--    Same reason — ensures filtered DELETE events are delivered to subscribers.
ALTER TABLE public.live_pins REPLICA IDENTITY FULL;

-- 3. live_bans — add composite unique constraint so upsert works correctly.
--    Deduplicate any existing duplicate rows first (keep the latest).
DELETE FROM public.live_bans
WHERE id NOT IN (
    SELECT DISTINCT ON (stream_id, banned_user_id) id
    FROM public.live_bans
    ORDER BY stream_id, banned_user_id, created_at DESC
);

-- Add the composite unique constraint
ALTER TABLE public.live_bans
    ADD CONSTRAINT live_bans_stream_user_unique UNIQUE (stream_id, banned_user_id);

COMMIT;
