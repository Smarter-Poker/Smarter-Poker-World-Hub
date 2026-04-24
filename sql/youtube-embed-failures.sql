-- ═══════════════════════════════════════════════════════════════════════════
-- YouTube Embed Failures — Server-side tracking of non-embeddable videos
-- Used by: /api/youtube/report-embed-failure
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the tracking table
CREATE TABLE IF NOT EXISTS youtube_embed_failures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT NOT NULL UNIQUE,
    error_code INTEGER NOT NULL DEFAULT 150,
    surface TEXT DEFAULT 'Unknown',
    hit_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE
);

-- Index for fast lookup by video_id (used in feed filtering)
CREATE INDEX IF NOT EXISTS idx_yt_failures_video_id ON youtube_embed_failures(video_id);

-- Index for filtering active (unresolved) failures
CREATE INDEX IF NOT EXISTS idx_yt_failures_active ON youtube_embed_failures(resolved, error_code);

-- RPC to atomically increment hit_count
CREATE OR REPLACE FUNCTION increment_yt_failure_hits(p_video_id TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE youtube_embed_failures
    SET hit_count = hit_count + 1,
        last_seen_at = NOW()
    WHERE video_id = p_video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: Allow service role full access, anon read for filtering
ALTER TABLE youtube_embed_failures ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by API endpoint)
CREATE POLICY "service_role_full_access" ON youtube_embed_failures
    FOR ALL USING (true) WITH CHECK (true);

-- Allow anon to read (for client-side feed filtering if needed)
CREATE POLICY "anon_read_failures" ON youtube_embed_failures
    FOR SELECT USING (true);

-- Comment
COMMENT ON TABLE youtube_embed_failures IS 'Tracks YouTube videos that fail to embed (age-restricted, removed, etc). Used to filter broken videos from feeds.';
