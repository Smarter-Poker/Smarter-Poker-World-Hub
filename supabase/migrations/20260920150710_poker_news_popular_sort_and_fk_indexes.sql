-- Applied to the live project 2026-09-20 (recorded version 20260920150710).
-- Committed here so the repo does not drift from the database.
--
-- /api/news/articles?sort=popular orders by views DESC NULLS LAST, then
-- published_at DESC, always filtered to is_published, and had no index behind
-- it. Verified that `views` is the live counter: increment_news_views() bumps
-- both `views` (sum 15,013) and the legacy `view_count` (sum 596).
-- Partial on is_published keeps the index small while still covering the
-- filter the query always applies.
--
-- EXPLAIN ANALYZE after adding it:
--   Index Scan using idx_poker_news_popular ... Execution Time: 0.333 ms
--   (previously a sequential scan plus a sort)
CREATE INDEX IF NOT EXISTS idx_poker_news_popular
    ON public.poker_news (views DESC NULLS LAST, published_at DESC)
    WHERE is_published;

-- Flagged by Supabase's performance advisor: this FK had no covering index.
CREATE INDEX IF NOT EXISTS idx_poker_news_social_post_id
    ON public.poker_news (social_post_id)
    WHERE social_post_id IS NOT NULL;
