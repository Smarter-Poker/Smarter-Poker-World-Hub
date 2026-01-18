-- ═══════════════════════════════════════════════════════════════════════════
-- POKER NEWS ARCHIVE TABLE
-- Migration: 20260118_poker_news_table.sql
-- 
-- Creates a comprehensive news archive system for Smarter.Poker
-- Stores all scraped poker news with full-text search, categorization, and
-- social feed integration
-- ═══════════════════════════════════════════════════════════════════════════

-- Create poker_news table
CREATE TABLE IF NOT EXISTS poker_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Article Content
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT, -- Full article text if available
    excerpt TEXT, -- Short excerpt for cards (150 chars)
    
    -- Source Information
    source_name TEXT NOT NULL, -- 'PokerNews', 'CardPlayer', etc.
    source_url TEXT NOT NULL UNIQUE, -- Original article URL (prevents duplicates)
    source_icon TEXT, -- Emoji or icon for source
    
    -- Media
    image_url TEXT,
    image_caption TEXT,
    
    -- Categorization
    category TEXT DEFAULT 'news', -- 'tournament', 'strategy', 'industry', 'news', 'lifestyle'
    tags TEXT[] DEFAULT '{}', -- Array of tags for filtering
    
    -- Metadata
    published_at TIMESTAMPTZ, -- Original publish date from source
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Social Integration
    social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL, -- Link to social feed post
    view_count INTEGER DEFAULT 0,
    
    -- Search
    search_vector TSVECTOR -- For full-text search
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_poker_news_category 
ON poker_news(category);

-- Source filtering
CREATE INDEX IF NOT EXISTS idx_poker_news_source 
ON poker_news(source_name);

-- Date sorting (most recent first)
CREATE INDEX IF NOT EXISTS idx_poker_news_published 
ON poker_news(published_at DESC NULLS LAST);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_poker_news_search 
ON poker_news USING GIN(search_vector);

-- Source URL lookup (for duplicate checking)
CREATE INDEX IF NOT EXISTS idx_poker_news_source_url 
ON poker_news(source_url);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEARCH VECTOR TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

-- Update search vector on insert/update
CREATE OR REPLACE FUNCTION poker_news_search_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poker_news_search_trigger
BEFORE INSERT OR UPDATE ON poker_news
FOR EACH ROW
EXECUTE FUNCTION poker_news_search_update();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE poker_news ENABLE ROW LEVEL SECURITY;

-- Everyone can read news (public access)
CREATE POLICY "News is publicly readable"
ON poker_news FOR SELECT
USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "Service role can manage news"
ON poker_news FOR ALL
USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_poker_news_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poker_news_updated_at
BEFORE UPDATE ON poker_news
FOR EACH ROW
EXECUTE FUNCTION update_poker_news_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Verify table was created
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'poker_news') THEN
        RAISE NOTICE '✅ poker_news table created successfully';
    ELSE
        RAISE EXCEPTION '❌ poker_news table creation failed';
    END IF;
END $$;
