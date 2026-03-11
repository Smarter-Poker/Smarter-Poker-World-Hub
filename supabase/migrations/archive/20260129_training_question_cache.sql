-- ═══════════════════════════════════════════════════════════════════════════
-- TRAINING QUESTION CACHE
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: Cache all Grok-generated questions to prevent repeats and reduce API costs
-- Strategy: Save every Grok-generated question permanently, reuse for all users
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing table if it exists
DROP TABLE IF EXISTS training_question_cache CASCADE;

-- Create question cache table
CREATE TABLE training_question_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Question identification
    question_id TEXT UNIQUE NOT NULL, -- e.g., "grok_mtt-005_1234567890"
    game_id TEXT NOT NULL, -- e.g., "mtt-005"
    engine_type TEXT NOT NULL, -- "PIO", "CHART", "SCENARIO"
    game_type TEXT NOT NULL, -- "cash", "tournament", "sng"
    level INTEGER NOT NULL, -- 1-10
    
    -- Question content (JSON)
    question_data JSONB NOT NULL, -- Full question object
    
    -- Metadata
    generated_at TIMESTAMPTZ DEFAULT now(),
    times_used INTEGER DEFAULT 0, -- Track popularity
    
    -- Indexes for fast lookup
    CONSTRAINT valid_engine_type CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    CONSTRAINT valid_game_type CHECK (game_type IN ('cash', 'tournament', 'sng')),
    CONSTRAINT valid_level CHECK (level BETWEEN 1 AND 10)
);

-- Indexes for fast queries
CREATE INDEX idx_question_cache_game ON training_question_cache(game_id, level, engine_type);
CREATE INDEX idx_question_cache_type ON training_question_cache(game_type, level);
CREATE INDEX idx_question_cache_generated ON training_question_cache(generated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE training_question_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to READ cached questions
CREATE POLICY "Anyone can read cached questions"
    ON training_question_cache FOR SELECT
    USING (true); -- Public read access

-- Only service role can INSERT (API only)
CREATE POLICY "Service role can insert cached questions"
    ON training_question_cache FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Only service role can UPDATE (for times_used counter)
CREATE POLICY "Service role can update cached questions"
    ON training_question_cache FOR UPDATE
    USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Get Random Unseen Question from Cache
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_random_cached_question(
    p_game_id TEXT,
    p_level INTEGER,
    p_engine_type TEXT,
    p_user_id UUID,
    p_seen_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_question JSONB;
BEGIN
    -- Get a random question that the user hasn't seen
    SELECT question_data INTO v_question
    FROM training_question_cache
    WHERE game_id = p_game_id
      AND level = p_level
      AND engine_type = p_engine_type
      AND question_id != ALL(p_seen_ids)
    ORDER BY RANDOM()
    LIMIT 1;
    
    -- Update times_used counter if question found
    IF v_question IS NOT NULL THEN
        UPDATE training_question_cache
        SET times_used = times_used + 1
        WHERE question_data = v_question;
    END IF;
    
    RETURN v_question;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE training_question_cache IS 'Permanent cache of all Grok-generated training questions to prevent repeats and reduce API costs';
COMMENT ON COLUMN training_question_cache.question_id IS 'Unique identifier for the question (e.g., grok_mtt-005_1234567890)';
COMMENT ON COLUMN training_question_cache.game_id IS 'Game identifier from TRAINING_LIBRARY (e.g., mtt-005)';
COMMENT ON COLUMN training_question_cache.engine_type IS 'Question engine: PIO, CHART, or SCENARIO';
COMMENT ON COLUMN training_question_cache.game_type IS 'Game type: cash, tournament, or sng';
COMMENT ON COLUMN training_question_cache.level IS 'Difficulty level (1-10)';
COMMENT ON COLUMN training_question_cache.question_data IS 'Full question object as JSON (includes question, options, answer, explanation)';
COMMENT ON COLUMN training_question_cache.times_used IS 'Number of times this question has been served to users';
