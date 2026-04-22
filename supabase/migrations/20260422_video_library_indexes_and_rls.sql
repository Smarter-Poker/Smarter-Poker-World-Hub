-- ============================================================
-- VIDEO LIBRARY: Indexes, RLS, Cleanup & Maintenance View
-- ============================================================
-- Migration: 20260422_video_library_indexes_and_rls.sql
-- Applied:   2026-04-22
-- Purpose:
--   1. Ensure unique constraint on youtube_video_id (prevent race dupes)
--   2. Add performance indexes for all filter/sort paths
--   3. Enable RLS with correct read/write policies
--   4. Create a maintenance view for quick health checks
--   5. Auto-delete stale/unplayable videos via scheduled cleanup fn
-- ============================================================

-- ── 1. Unique constraint on youtube_video_id ──────────────────
-- Safe to run even if constraint already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'video_library_videos_youtube_video_id_key'
    ) THEN
        ALTER TABLE video_library_videos
            ADD CONSTRAINT video_library_videos_youtube_video_id_key
            UNIQUE (youtube_video_id);
    END IF;
END $$;

-- ── 2. Performance indexes ─────────────────────────────────────

-- Primary sort: newest scraped first (main feed order)
CREATE INDEX IF NOT EXISTS idx_vlv_scraped_at
    ON video_library_videos (scraped_at DESC NULLS LAST);

-- Source filter (creator filter pills)
CREATE INDEX IF NOT EXISTS idx_vlv_source_id
    ON video_library_videos (source_id);

-- Type filter (cash / tournament)
CREATE INDEX IF NOT EXISTS idx_vlv_type
    ON video_library_videos (type);

-- Compound: source + scraped_at (filter by creator then sort)
CREATE INDEX IF NOT EXISTS idx_vlv_source_scraped
    ON video_library_videos (source_id, scraped_at DESC NULLS LAST);

-- Compound: type + scraped_at
CREATE INDEX IF NOT EXISTS idx_vlv_type_scraped
    ON video_library_videos (type, scraped_at DESC NULLS LAST);

-- Real publish date for chronological ordering
CREATE INDEX IF NOT EXISTS idx_vlv_published_at
    ON video_library_videos (published_at DESC NULLS LAST);

-- Views for "most popular" sort
CREATE INDEX IF NOT EXISTS idx_vlv_views_count
    ON video_library_videos (views_count DESC NULLS LAST);

-- Full-text search on title
CREATE INDEX IF NOT EXISTS idx_vlv_title_trgm
    ON video_library_videos USING gin (to_tsvector('english', title));

-- ── 3. RLS ────────────────────────────────────────────────────

ALTER TABLE video_library_videos ENABLE ROW LEVEL SECURITY;

-- Public read: anyone can browse the library (unauthenticated supported)
DROP POLICY IF EXISTS "video_library_public_read" ON video_library_videos;
CREATE POLICY "video_library_public_read"
    ON video_library_videos
    FOR SELECT
    USING (true);

-- Write: only service role (scraper writes via service key, not anon)
DROP POLICY IF EXISTS "video_library_service_write" ON video_library_videos;
CREATE POLICY "video_library_service_write"
    ON video_library_videos
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ── 4. Health-check view ──────────────────────────────────────

CREATE OR REPLACE VIEW video_library_health AS
SELECT
    source_id,
    COUNT(*)                                          AS total_videos,
    COUNT(*) FILTER (WHERE duration IS NULL)          AS missing_duration,
    COUNT(*) FILTER (WHERE views_count = 0 OR views_count IS NULL) AS zero_views,
    COUNT(*) FILTER (WHERE published_at::date = CURRENT_DATE)     AS fake_dates,
    MAX(scraped_at)                                   AS last_scraped,
    MIN(published_at)                                 AS oldest_video,
    MAX(published_at)                                 AS newest_video
FROM video_library_videos
GROUP BY source_id
ORDER BY total_videos DESC;

COMMENT ON VIEW video_library_health IS
    'Per-creator health metrics for the video library. Check fake_dates to monitor backfill progress.';

-- ── 5. Dead-video cleanup function ────────────────────────────
-- Called by the Python scraper after ingestion to remove 404/private videos.
-- Not scheduled automatically — invoked from scripts/video_library_scraper.py

CREATE OR REPLACE FUNCTION video_library_remove_dead(
    dead_video_ids TEXT[]
)
RETURNS TABLE(deleted_id TEXT, deleted_title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    DELETE FROM video_library_videos
    WHERE youtube_video_id = ANY(dead_video_ids)
    RETURNING youtube_video_id, title;
END;
$$;

-- ── 6. Grant public read on health view ───────────────────────
GRANT SELECT ON video_library_health TO anon, authenticated;
