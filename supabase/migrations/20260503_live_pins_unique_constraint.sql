-- ═══════════════════════════════════════════════════════════════════════════
-- BUG FIX: live_pins — add UNIQUE(stream_id) constraint
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM: moderate.js uses upsert({ onConflict: 'stream_id' }) to enforce
-- one-pin-per-stream, but the live_pins table had no UNIQUE(stream_id)
-- constraint. Without the DB-level constraint, Supabase's upsert falls back
-- to a plain INSERT — every pin_comment call silently inserted a new row,
-- causing duplicate pins to accumulate. The DELETE (unpin) matched on
-- stream_id and deleted all rows (accidentally correct), but the SELECT
-- behavior was unpredictable.
--
-- FIX: Add the UNIQUE constraint so upsert behaves as intended.
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove any duplicate rows first (keep the latest pinned row per stream)
DELETE FROM public.live_pins
WHERE id NOT IN (
    SELECT DISTINCT ON (stream_id) id
    FROM public.live_pins
    ORDER BY stream_id, created_at DESC
);

-- Add the unique constraint
ALTER TABLE public.live_pins
    ADD CONSTRAINT live_pins_stream_id_unique UNIQUE (stream_id);
