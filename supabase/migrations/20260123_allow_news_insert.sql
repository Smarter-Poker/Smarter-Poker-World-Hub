-- ═══════════════════════════════════════════════════════════════════════════
-- Allow service role to insert into poker_news and poker_videos
-- Migration: 20260123_allow_news_insert.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow service role to insert news articles
CREATE POLICY "Service role can insert poker_news" ON poker_news
    FOR INSERT
    WITH CHECK (true);

-- Allow service role to update news articles
CREATE POLICY "Service role can update poker_news" ON poker_news
    FOR UPDATE
    USING (true);

-- Allow service role to insert videos
CREATE POLICY "Service role can insert poker_videos" ON poker_videos
    FOR INSERT
    WITH CHECK (true);

-- Allow service role to update videos
CREATE POLICY "Service role can update poker_videos" ON poker_videos
    FOR UPDATE
    USING (true);
