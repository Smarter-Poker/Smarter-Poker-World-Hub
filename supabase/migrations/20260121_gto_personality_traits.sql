-- ═══════════════════════════════════════════════════════════════════════════
-- 🎰 ADD GTO PLAYING TRAITS TO HORSE PERSONALITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Extends horse_personality with fields for PioSolver integration
-- ═══════════════════════════════════════════════════════════════════════════

-- Add new GTO-specific columns
ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS gto_adherence INTEGER DEFAULT 80 CHECK (gto_adherence BETWEEN 0 AND 100);
-- How strictly they follow solver output (0-100%)

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS deviation_trigger TEXT DEFAULT 'never' 
CHECK (deviation_trigger IN ('never', 'strong_read', 'weak_opponent', 'icm_pressure', 'any_read', 'always'));
-- When they deviate from GTO

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS mixed_strategy_bias TEXT DEFAULT 'balanced'
CHECK (mixed_strategy_bias IN ('balanced', 'aggressive', 'defensive', 'survival', 'situational', 'max_variance'));
-- How they interpret mixed frequency spots

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS preferred_stack_depths INTEGER[] DEFAULT '{40, 60, 100}';
-- Array of preferred stack depths (20, 40, 60, 80, 100, 200)

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS preferred_game_types TEXT[] DEFAULT '{Cash, MTT}';
-- Game types: Cash, MTT, Spin

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS preferred_topologies TEXT[] DEFAULT '{6-Max}';
-- Table sizes: HU, 3-Max, 6-Max, 9-Max

ALTER TABLE horse_personality 
ADD COLUMN IF NOT EXISTS archetype_name TEXT;
-- The playing archetype (GTO_Purist, Balanced, Aggressive_GTO, etc.)

-- Update the get_horse_personality function to include new fields
CREATE OR REPLACE FUNCTION get_horse_personality(p_author_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_personality JSONB;
BEGIN
    SELECT jsonb_build_object(
        -- Core Traits
        'aggression_level', aggression_level,
        'humor_level', humor_level,
        'technical_depth', technical_depth,
        'contrarian_tendency', contrarian_tendency,
        
        -- Playing Philosophy
        'gto_vs_exploitative', gto_vs_exploitative,
        'risk_tolerance', risk_tolerance,
        'gto_adherence', COALESCE(gto_adherence, 80),
        'deviation_trigger', COALESCE(deviation_trigger, 'never'),
        'mixed_strategy_bias', COALESCE(mixed_strategy_bias, 'balanced'),
        
        -- Game Preferences (for querying solved_spots_gold)
        'preferred_stack_depths', COALESCE(preferred_stack_depths, ARRAY[40, 60, 100]),
        'preferred_game_types', COALESCE(preferred_game_types, ARRAY['Cash', 'MTT']),
        'preferred_topologies', COALESCE(preferred_topologies, ARRAY['6-Max']),
        'archetype_name', archetype_name,
        
        -- Flavor
        'preferred_topics', preferred_topics,
        'avoided_topics', avoided_topics,
        'catchphrases', catchphrases,
        'pet_peeves', pet_peeves,
        'origin_story', origin_story,
        'biggest_win', biggest_win,
        'current_goals', current_goals
    ) INTO v_personality
    FROM horse_personality
    WHERE author_id = p_author_id;
    
    RETURN COALESCE(v_personality, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🎮 GTO DECISION HELPER FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════
-- Given a horse and a solved spot, determines what action the horse takes
-- based on their personality traits and the solver's mixed strategy

CREATE OR REPLACE FUNCTION get_horse_action(
    p_author_id INTEGER,
    p_strategy_actions JSONB  -- e.g., {"Raise": {"freq": 0.45}, "Call": {"freq": 0.55}, "Fold": {"freq": 0.0}}
)
RETURNS TEXT AS $$
DECLARE
    v_personality JSONB;
    v_mixed_bias TEXT;
    v_gto_adherence INTEGER;
    v_random FLOAT;
    v_raise_freq FLOAT;
    v_call_freq FLOAT;
    v_fold_freq FLOAT;
    v_adjusted_raise FLOAT;
    v_adjusted_call FLOAT;
BEGIN
    -- Get personality
    v_personality := get_horse_personality(p_author_id);
    v_mixed_bias := v_personality->>'mixed_strategy_bias';
    v_gto_adherence := (v_personality->>'gto_adherence')::INTEGER;
    
    -- Extract frequencies
    v_raise_freq := COALESCE((p_strategy_actions->'Raise'->>'freq')::FLOAT, 0);
    v_call_freq := COALESCE((p_strategy_actions->'Call'->>'freq')::FLOAT, 0);
    v_fold_freq := COALESCE((p_strategy_actions->'Fold'->>'freq')::FLOAT, 0);
    
    -- Adjust based on personality bias
    CASE v_mixed_bias
        WHEN 'aggressive' THEN
            -- Shift probability toward raises
            v_adjusted_raise := LEAST(1.0, v_raise_freq * 1.2);
            v_adjusted_call := v_call_freq * 0.9;
        WHEN 'defensive' THEN
            -- Shift probability toward calls/folds
            v_adjusted_raise := v_raise_freq * 0.8;
            v_adjusted_call := LEAST(1.0, v_call_freq * 1.15);
        WHEN 'survival' THEN
            -- ICM mode: reduce variance
            v_adjusted_raise := v_raise_freq * 0.85;
            v_adjusted_call := v_call_freq * 1.0;
        WHEN 'max_variance' THEN
            -- Degen mode: maximize variance
            IF v_raise_freq > 0.3 THEN
                v_adjusted_raise := LEAST(1.0, v_raise_freq * 1.4);
                v_adjusted_call := v_call_freq * 0.6;
            ELSE
                v_adjusted_raise := v_raise_freq;
                v_adjusted_call := v_call_freq;
            END IF;
        ELSE
            -- 'balanced' or 'situational': use solver frequencies exactly
            v_adjusted_raise := v_raise_freq;
            v_adjusted_call := v_call_freq;
    END CASE;
    
    -- Renormalize
    IF v_adjusted_raise + v_adjusted_call + v_fold_freq > 0 THEN
        DECLARE
            v_total FLOAT := v_adjusted_raise + v_adjusted_call + v_fold_freq;
        BEGIN
            v_adjusted_raise := v_adjusted_raise / v_total;
            v_adjusted_call := v_adjusted_call / v_total;
        END;
    END IF;
    
    -- Generate random number and pick action
    v_random := random();
    
    IF v_random < v_adjusted_raise THEN
        RETURN 'Raise';
    ELSIF v_random < v_adjusted_raise + v_adjusted_call THEN
        RETURN 'Call';
    ELSE
        RETURN 'Fold';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION get_horse_action(INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_horse_action(INTEGER, JSONB) TO anon;
