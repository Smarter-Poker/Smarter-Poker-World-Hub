-- STREAM-POLISH-R3 CHAT-MOD-3: tunable slow-mode delay.
--
-- The slow_mode boolean was added in 20260503_live_streams_slow_mode_column.sql
-- but the matching slow_mode_delay column never landed. /api/live/comment.js
-- has been hardcoding DEFAULT_SLOW_MODE_DELAY_SECS=3 as a result; the inline
-- comment there flags it as BUG-FIX-CMT-2 awaiting this migration.
--
-- This adds the column so broadcasters can tune the slow-mode pacing
-- (e.g. 10s during a hectic stream, 1s for a chill one). Range: 1-120s.
-- Default 3 preserves the current effective behavior.

ALTER TABLE public.live_streams
    ADD COLUMN IF NOT EXISTS slow_mode_delay INTEGER NOT NULL DEFAULT 3;

-- Constraint added separately so it can be dropped/replaced later without
-- needing to re-add the column itself.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'live_streams_slow_mode_delay_range'
    ) THEN
        ALTER TABLE public.live_streams
            ADD CONSTRAINT live_streams_slow_mode_delay_range
            CHECK (slow_mode_delay BETWEEN 1 AND 120);
    END IF;
END $$;

COMMENT ON COLUMN public.live_streams.slow_mode_delay IS
    'Seconds between comments when slow_mode=true. Range 1-120. Default 3.';
