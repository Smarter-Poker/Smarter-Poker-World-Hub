-- Grok Response Cache Table
-- Prevents redundant API calls by caching identical scenario explanations

-- ============================================================================
-- TABLE: grok_explanation_cache
-- Stores Grok-generated explanations keyed by scenario hash
-- ============================================================================

CREATE TABLE IF NOT EXISTS grok_explanation_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cache_key TEXT NOT NULL,
    was_correct BOOLEAN NOT NULL,
    question_hash TEXT NOT NULL,
    game_id TEXT,
    explanation JSONB NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Unique constraint for cache key + correct/incorrect variant
    UNIQUE(cache_key, was_correct)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_grok_cache_key 
    ON grok_explanation_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_grok_cache_game 
    ON grok_explanation_cache(game_id);
CREATE INDEX IF NOT EXISTS idx_grok_cache_created 
    ON grok_explanation_cache(created_at DESC);

-- No RLS needed - this is a system cache accessed only by service role
ALTER TABLE grok_explanation_cache ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service can manage cache"
    ON grok_explanation_cache FOR ALL
    USING (true)
    WITH CHECK (true);

-- Function to increment hit count on cache access
CREATE OR REPLACE FUNCTION increment_cache_hit()
RETURNS TRIGGER AS $$
BEGIN
    NEW.hit_count := COALESCE(OLD.hit_count, 0) + 1;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
