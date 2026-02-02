-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - ACHIEVEMENTS SYSTEM
-- Track user achievements and badges
-- ═══════════════════════════════════════════════════════════════════════════

-- Achievements table
CREATE TABLE IF NOT EXISTS memory_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, achievement_key)
);

-- Achievement definitions (reference table)
CREATE TABLE IF NOT EXISTS memory_achievement_definitions (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏆',
    category TEXT NOT NULL DEFAULT 'general',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert achievement definitions
INSERT INTO memory_achievement_definitions (key, name, description, icon, category, sort_order) VALUES
    ('first_game', 'First Match', 'Complete your first memory game', '⭐', 'basics', 1),
    ('perfect_memory', 'Perfect Memory', 'Complete a game with 100% accuracy', '💯', 'mastery', 2),
    ('speed_demon', 'Speed Demon', 'Complete a game in under 60 seconds', '⚡', 'speed', 3),
    ('level_5', 'Halfway There', 'Reach Level 5', '📈', 'progress', 4),
    ('level_10', 'Level Master', 'Complete Level 10', '🎯', 'progress', 5),
    ('streak_3', '3-Day Streak', 'Play 3 days in a row', '🔥', 'consistency', 6),
    ('streak_7', 'Week Warrior', 'Play 7 days in a row', '💪', 'consistency', 7),
    ('streak_30', 'Monthly Master', 'Play 30 days in a row', '👑', 'consistency', 8),
    ('diamond_100', 'Diamond Starter', 'Earn 100 diamonds', '💎', 'economy', 9),
    ('diamond_1000', 'Diamond Hunter', 'Earn 1,000 diamonds', '💰', 'economy', 10),
    ('games_10', 'Getting Started', 'Complete 10 games', '🎮', 'games', 11),
    ('games_50', 'Dedicated Player', 'Complete 50 games', '🕹️', 'games', 12),
    ('games_100', 'Memory Veteran', 'Complete 100 games', '🏅', 'games', 13),
    ('grok_5', 'AI Explorer', 'Complete 5 AI-generated scenarios', '🤖', 'ai', 14),
    ('grok_25', 'Grok Genius', 'Complete 25 AI-generated scenarios', '🧠', 'ai', 15),
    ('daily_10', 'Daily Challenger', 'Complete 10 daily challenges', '📅', 'challenges', 16),
    ('perfect_daily', 'Perfect Day', 'Complete a daily challenge with 100% accuracy', '🌟', 'challenges', 17)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON memory_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_key ON memory_achievements(achievement_key);
CREATE INDEX IF NOT EXISTS idx_achievement_defs_category ON memory_achievement_definitions(category);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE memory_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_achievement_definitions ENABLE ROW LEVEL SECURITY;

-- Users can view their own achievements
DROP POLICY IF EXISTS "Users can view own achievements" ON memory_achievements;
CREATE POLICY "Users can view own achievements"
    ON memory_achievements FOR SELECT
    USING (auth.uid() = user_id);

-- Users can earn achievements (insert)
DROP POLICY IF EXISTS "Users can earn achievements" ON memory_achievements;
CREATE POLICY "Users can earn achievements"
    ON memory_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Everyone can view achievement definitions
DROP POLICY IF EXISTS "Everyone can view achievement definitions" ON memory_achievement_definitions;
CREATE POLICY "Everyone can view achievement definitions"
    ON memory_achievement_definitions FOR SELECT
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Unlock achievement
CREATE OR REPLACE FUNCTION unlock_achievement(
    p_user_id UUID,
    p_achievement_key TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_already_unlocked BOOLEAN;
    v_achievement RECORD;
BEGIN
    -- Check if already unlocked
    SELECT EXISTS(
        SELECT 1 FROM memory_achievements
        WHERE user_id = p_user_id AND achievement_key = p_achievement_key
    ) INTO v_already_unlocked;
    
    IF v_already_unlocked THEN
        RETURN jsonb_build_object(
            'success', false,
            'already_unlocked', true
        );
    END IF;
    
    -- Get achievement definition
    SELECT * INTO v_achievement
    FROM memory_achievement_definitions
    WHERE key = p_achievement_key;
    
    IF v_achievement IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Achievement not found'
        );
    END IF;
    
    -- Unlock the achievement
    INSERT INTO memory_achievements (user_id, achievement_key, metadata)
    VALUES (p_user_id, p_achievement_key, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'achievement', jsonb_build_object(
            'key', v_achievement.key,
            'name', v_achievement.name,
            'description', v_achievement.description,
            'icon', v_achievement.icon
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user achievements with definitions
CREATE OR REPLACE FUNCTION get_user_achievements(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', d.key,
            'name', d.name,
            'description', d.description,
            'icon', d.icon,
            'category', d.category,
            'unlocked', a.unlocked_at IS NOT NULL,
            'unlocked_at', a.unlocked_at
        ) ORDER BY d.sort_order
    )
    INTO v_result
    FROM memory_achievement_definitions d
    LEFT JOIN memory_achievements a ON a.achievement_key = d.key AND a.user_id = p_user_id;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION unlock_achievement TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_achievements TO authenticated;
