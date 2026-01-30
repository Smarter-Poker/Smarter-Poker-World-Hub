-- ═══════════════════════════════════════════════════════════════════════════
-- GEEVES KNOWLEDGE CACHE SCHEMA
-- Smart caching system to store and reuse Grok responses
-- Saves API costs and speeds up responses for common questions
-- ═══════════════════════════════════════════════════════════════════════════

-- Main knowledge cache table
CREATE TABLE IF NOT EXISTS geeves_knowledge_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Question data
    question_normalized TEXT NOT NULL,  -- Lowercase, trimmed, standardized
    question_hash TEXT NOT NULL UNIQUE, -- MD5 hash for fast lookup
    question_original TEXT NOT NULL,    -- Original question as asked
    
    -- Answer data
    answer TEXT NOT NULL,
    answer_tokens INT,
    
    -- Categorization
    question_type TEXT,  -- 'gto', 'hand_analysis', 'tournament', etc.
    tags TEXT[],         -- Additional tags for search
    
    -- Quality metrics
    times_served INT DEFAULT 0,         -- How many times this answer was used
    total_ratings INT DEFAULT 0,        -- Number of ratings received
    rating_sum INT DEFAULT 0,           -- Sum of all ratings (for average)
    avg_rating NUMERIC(3,2) GENERATED ALWAYS AS (
        CASE WHEN total_ratings > 0 
        THEN rating_sum::numeric / total_ratings 
        ELSE NULL END
    ) STORED,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_served_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    
    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', question_normalized || ' ' || answer)
    ) STORED
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_geeves_cache_hash ON geeves_knowledge_cache(question_hash);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_type ON geeves_knowledge_cache(question_type);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_times_served ON geeves_knowledge_cache(times_served DESC);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_rating ON geeves_knowledge_cache(avg_rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_search ON geeves_knowledge_cache USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_geeves_cache_tags ON geeves_knowledge_cache USING GIN(tags);

-- User ratings for cached answers
CREATE TABLE IF NOT EXISTS geeves_answer_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_id UUID REFERENCES geeves_knowledge_cache(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Each user can only rate each cached answer once
    UNIQUE(cache_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_geeves_ratings_cache ON geeves_answer_ratings(cache_id);
CREATE INDEX IF NOT EXISTS idx_geeves_ratings_user ON geeves_answer_ratings(user_id);

-- Conversation history with cache references
ALTER TABLE geeves_messages ADD COLUMN IF NOT EXISTS cache_id UUID REFERENCES geeves_knowledge_cache(id);
ALTER TABLE geeves_messages ADD COLUMN IF NOT EXISTS from_cache BOOLEAN DEFAULT FALSE;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS FOR SMART CACHING
-- ═══════════════════════════════════════════════════════════════════════════

-- Normalize question for comparison
CREATE OR REPLACE FUNCTION normalize_question(question TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                trim(question),
                '[^a-zA-Z0-9\s]', '', 'g'  -- Remove punctuation
            ),
            '\s+', ' ', 'g'  -- Normalize whitespace
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate question hash
CREATE OR REPLACE FUNCTION question_hash(question TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN md5(normalize_question(question));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Find similar questions using full-text search
CREATE OR REPLACE FUNCTION find_similar_questions(
    search_query TEXT,
    similarity_threshold FLOAT DEFAULT 0.3,
    max_results INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    question_original TEXT,
    answer TEXT,
    question_type TEXT,
    times_served INT,
    avg_rating NUMERIC,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.question_original,
        c.answer,
        c.question_type,
        c.times_served,
        c.avg_rating,
        ts_rank(c.search_vector, plainto_tsquery('english', search_query)) as similarity
    FROM geeves_knowledge_cache c
    WHERE c.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY similarity DESC, c.times_served DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Update cache stats when answer is served
CREATE OR REPLACE FUNCTION increment_cache_served(cache_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE geeves_knowledge_cache
    SET 
        times_served = times_served + 1,
        last_served_at = NOW()
    WHERE id = cache_uuid;
END;
$$ LANGUAGE plpgsql;

-- Update cache rating
CREATE OR REPLACE FUNCTION update_cache_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE geeves_knowledge_cache
    SET 
        total_ratings = total_ratings + 1,
        rating_sum = rating_sum + NEW.rating,
        updated_at = NOW()
    WHERE id = NEW.cache_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cache_rating
    AFTER INSERT ON geeves_answer_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_cache_rating();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE geeves_knowledge_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE geeves_answer_ratings ENABLE ROW LEVEL SECURITY;

-- Knowledge cache is public read (anyone can benefit from cached answers)
CREATE POLICY "Anyone can view cached knowledge"
    ON geeves_knowledge_cache FOR SELECT
    USING (true);

-- Only service role can insert/update cache
CREATE POLICY "Service role can manage cache"
    ON geeves_knowledge_cache FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Users can view all ratings
CREATE POLICY "Anyone can view ratings"
    ON geeves_answer_ratings FOR SELECT
    USING (true);

-- Users can only create their own ratings
CREATE POLICY "Users can rate answers"
    ON geeves_answer_ratings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own ratings
CREATE POLICY "Users can update own ratings"
    ON geeves_answer_ratings FOR UPDATE
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE geeves_knowledge_cache IS 'Cached Grok responses for common poker questions - saves API costs';
COMMENT ON COLUMN geeves_knowledge_cache.question_hash IS 'MD5 hash of normalized question for exact match lookup';
COMMENT ON COLUMN geeves_knowledge_cache.times_served IS 'Number of times this cached answer was served to users';
COMMENT ON COLUMN geeves_knowledge_cache.avg_rating IS 'Auto-calculated average user rating (1-5)';
COMMENT ON FUNCTION normalize_question(TEXT) IS 'Normalizes questions for comparison - lowercase, no punctuation';
COMMENT ON FUNCTION find_similar_questions(TEXT, FLOAT, INT) IS 'Full-text search for similar cached questions';
