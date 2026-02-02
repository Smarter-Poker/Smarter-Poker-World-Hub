-- =============================================================================
-- JARVIS RESPONSE CACHE
-- =============================================================================
-- Caches Grok/Jarvis API responses to avoid redundant API calls
-- Indexed by cache_key (hash of request parameters)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jarvis_response_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT UNIQUE NOT NULL,  -- Hash of request params
    endpoint TEXT NOT NULL,           -- Which API endpoint (explain-hand, analyze-game, etc)
    request_params JSONB NOT NULL,    -- Original request params for debugging
    response_data JSONB NOT NULL,     -- Cached response
    hit_count INTEGER DEFAULT 1,      -- Number of times cache was used
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jarvis_cache_key ON jarvis_response_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_jarvis_cache_endpoint ON jarvis_response_cache(endpoint);
CREATE INDEX IF NOT EXISTS idx_jarvis_cache_expires ON jarvis_response_cache(expires_at);

-- Enable RLS
ALTER TABLE jarvis_response_cache ENABLE ROW LEVEL SECURITY;

-- Service role can manage cache
CREATE POLICY "Service role manages cache"
    ON jarvis_response_cache FOR ALL
    USING (true);

-- Grant access
GRANT ALL ON jarvis_response_cache TO service_role;
GRANT SELECT ON jarvis_response_cache TO authenticated;

-- Cleanup function for expired cache entries (run periodically)
-- DELETE FROM jarvis_response_cache WHERE expires_at < NOW();
