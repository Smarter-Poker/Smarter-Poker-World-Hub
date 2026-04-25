-- ============================================================
-- VIDEO ANALYSIS — Library analyze API extension
-- ============================================================
-- Migration: 20260425_video_analysis.sql
-- Applied:   2026-04-25
-- Purpose:
--   The video_analysis table already exists (user hand-analysis feature).
--   This migration safely adds the library-specific columns required by
--   /api/video/analyze for caching Grok-generated chapter markers and
--   hand breakdowns keyed by youtube_video_id.
--
-- NOTE: Uses ADD COLUMN IF NOT EXISTS throughout — fully idempotent.
-- ============================================================

-- Extend existing table with library-analysis columns
ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS video_id        TEXT;
ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS video_title     TEXT;
ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS analysis        JSONB;
ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS has_transcript  BOOLEAN DEFAULT false;
ALTER TABLE video_analysis ADD COLUMN IF NOT EXISTS transcript_length INTEGER DEFAULT 0;

-- Unique index on video_id for upsert { onConflict: 'video_id' }
-- WHERE guard keeps it partial so existing NULL rows aren't affected
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_analysis_video_id_unique
    ON video_analysis(video_id)
    WHERE video_id IS NOT NULL;

-- Performance index for updated_at cache invalidation
CREATE INDEX IF NOT EXISTS idx_video_analysis_updated_at
    ON video_analysis (updated_at DESC NULLS LAST);

-- RLS: ensure service role can write library rows
-- (existing user-scoped policies are preserved)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'video_analysis' AND policyname = 'video_analysis_service_write'
    ) THEN
        CREATE POLICY "video_analysis_service_write"
            ON video_analysis FOR ALL TO service_role
            USING (true) WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'video_analysis' AND policyname = 'video_analysis_public_read'
    ) THEN
        CREATE POLICY "video_analysis_public_read"
            ON video_analysis FOR SELECT
            USING (true);
    END IF;
END $$;
