-- ============================================================
-- VIDEO ANALYSIS TABLE
-- ============================================================
-- Migration: 20260425_video_analysis.sql
-- Applied:   2026-04-25
-- Purpose:
--   Cache AI-generated video analysis (chapters, key hands, summary)
--   produced by /api/video/analyze. This prevents re-running Grok
--   on every modal open and supports pre-warming via the scraper.
-- ============================================================

CREATE TABLE IF NOT EXISTS video_analysis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id        TEXT NOT NULL UNIQUE,  -- youtube_video_id
    video_title     TEXT,
    analysis        JSONB,                 -- chapters, keyHands, summary, learningPoints
    has_transcript  BOOLEAN DEFAULT false,
    transcript_length INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookups by video_id (main access pattern)
CREATE INDEX IF NOT EXISTS idx_video_analysis_video_id
    ON video_analysis (video_id);

-- Updated_at index for cache invalidation queries
CREATE INDEX IF NOT EXISTS idx_video_analysis_updated_at
    ON video_analysis (updated_at DESC NULLS LAST);

-- RLS
ALTER TABLE video_analysis ENABLE ROW LEVEL SECURITY;

-- Anyone (auth or anon) can read cached analysis
CREATE POLICY "video_analysis_public_read"
    ON video_analysis
    FOR SELECT
    USING (true);

-- Only service role can write (API uses service key, not anon)
CREATE POLICY "video_analysis_service_write"
    ON video_analysis
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
