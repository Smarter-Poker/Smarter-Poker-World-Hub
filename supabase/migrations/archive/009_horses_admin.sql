-- ═══════════════════════════════════════════════════════════════════════════
-- 🐴 HORSES ADMIN SCHEMA
-- Settings and controls for the content engine admin panel
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_active column to content_authors if not exists
ALTER TABLE content_authors 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Content Engine Settings
CREATE TABLE IF NOT EXISTS content_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    
    -- Posting Schedule
    posts_per_day INTEGER DEFAULT 20,
    min_delay_minutes INTEGER DEFAULT 30,
    max_delay_minutes INTEGER DEFAULT 120,
    peak_hours INTEGER[] DEFAULT '{9,10,11,12,13,14,15,16,17,18,19,20,21}',
    
    -- AI Settings
    ai_model TEXT DEFAULT 'gpt-4o',
    temperature DECIMAL(3,2) DEFAULT 0.80,
    max_tokens INTEGER DEFAULT 500,
    
    -- Content Mix (posts per type per day)
    mix_strategy_tip INTEGER DEFAULT 5,
    mix_hand_analysis INTEGER DEFAULT 4,
    mix_mindset_post INTEGER DEFAULT 3,
    mix_beginner_guide INTEGER DEFAULT 3,
    mix_advanced_concept INTEGER DEFAULT 2,
    mix_bankroll_advice INTEGER DEFAULT 2,
    mix_tournament_tip INTEGER DEFAULT 3,
    mix_news_commentary INTEGER DEFAULT 2,
    
    -- System Controls
    engine_enabled BOOLEAN DEFAULT TRUE,
    auto_publish BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure only one row
    CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Insert default settings if not exists
INSERT INTO content_settings (id) 
VALUES (1) 
ON CONFLICT (id) DO NOTHING;

-- Function to update settings timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for settings timestamp
DROP TRIGGER IF EXISTS settings_timestamp_trigger ON content_settings;
CREATE TRIGGER settings_timestamp_trigger
    BEFORE UPDATE ON content_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_timestamp();

-- Admin Generation Log
CREATE TABLE IF NOT EXISTS content_generation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by TEXT,
    count_requested INTEGER,
    count_generated INTEGER,
    duration_seconds INTEGER,
    status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- RLS for admin tables
ALTER TABLE content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_generation_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access settings
CREATE POLICY "Admins manage settings" ON content_settings
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'email' = 'admin@smarter.poker');

CREATE POLICY "Admins view generation log" ON content_generation_log
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.jwt() ->> 'email' = 'admin@smarter.poker');

-- View for active horses count
CREATE OR REPLACE VIEW active_horses_count AS
SELECT 
    COUNT(*) FILTER (WHERE is_active = TRUE) as active,
    COUNT(*) FILTER (WHERE is_active = FALSE) as inactive,
    COUNT(*) as total
FROM content_authors;

DO $$ 
BEGIN 
    RAISE NOTICE '🐴 HORSES ADMIN SCHEMA APPLIED SUCCESSFULLY';
END $$;
