-- ════════════════════════════════════════════════════════════════════════════
-- M7.5: Index for the M7.1 broadcast hot path
-- ════════════════════════════════════════════════════════════════════════════
-- The worker's broadcast on conversion success runs:
--   UPDATE social_reels SET video_url=...
--    WHERE original_youtube_url = $1 AND id != $2
--
-- Without an index on original_youtube_url, every conversion did a sequential
-- scan over ~10K social_reels rows. With ~768 distinct URLs draining at
-- 6-way concurrency, that's roughly 60K seqscans during the drain — wasted
-- DB CPU + slows broadcast latency.
--
-- Partial index (only non-null) keeps the index small and B-tree ordering
-- makes the equality lookup O(log n).
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_social_reels_original_youtube_url
  ON social_reels (original_youtube_url)
  WHERE original_youtube_url IS NOT NULL;
