-- ═══════════════════════════════════════════════════════════════════════════
-- BUG FIX: Live Reactions DB Persistence + Analytics Fix
--
-- PROBLEM: Reactions were ephemeral broadcast-only. The analytics view had no
-- live_reactions table to count from → reaction_count always = 0.
--
-- FIX:
--   1. Create live_reactions table (bucketed by emoji, stream_id, sender_id)
--   2. Update live_stream_analytics view to aggregate from live_reactions
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Create live_reactions table (only store reaction counts, not every event)
CREATE TABLE IF NOT EXISTS live_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for analytics aggregation
CREATE INDEX IF NOT EXISTS idx_live_reactions_stream_id ON live_reactions(stream_id);

-- RLS: anyone authenticated can insert; service role can read all
ALTER TABLE live_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_reactions_insert" ON live_reactions
    FOR INSERT TO authenticated
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY "live_reactions_select" ON live_reactions
    FOR SELECT TO authenticated
    USING (true);

-- 2. Recreate live_stream_analytics view with live_reactions aggregation
-- Note: This view may already exist without live_reactions. We recreate it
-- safely with CREATE OR REPLACE.
CREATE OR REPLACE VIEW live_stream_analytics AS
SELECT
    ls.id,
    ls.broadcaster_id,
    ls.title,
    ls.status,
    ls.started_at,
    ls.ended_at,
    COALESCE(
        EXTRACT(EPOCH FROM (COALESCE(ls.ended_at, now()) - ls.started_at))::INTEGER,
        0
    ) AS duration_seconds,
    COALESCE(ls.peak_viewers, 0) AS peak_viewers,
    COALESCE(ls.viewer_count, 0) AS viewer_count,
    -- Comment count
    (SELECT COUNT(*)::INTEGER FROM live_comments lc WHERE lc.stream_id = ls.id) AS comment_count,
    -- Reaction count from live_reactions table
    (SELECT COUNT(*)::INTEGER FROM live_reactions lr WHERE lr.stream_id = ls.id) AS reaction_count,
    -- Total diamonds received from gifts
    COALESCE(
        (SELECT SUM(amount)::INTEGER FROM live_gifts lg WHERE lg.stream_id = ls.id),
        0
    ) AS total_gifts_received
FROM live_streams ls;

-- Security invoker so RLS applies
ALTER VIEW live_stream_analytics SET (security_invoker = true);

GRANT SELECT ON live_stream_analytics TO authenticated, anon;
