-- ═══════════════════════════════════════════════════════════════════════════
-- Allow service role to insert into poker_news
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
