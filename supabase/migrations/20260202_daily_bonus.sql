-- Daily Training Bonus System
-- Awards diamonds for first training session each day

-- Table to track daily bonus claims
CREATE TABLE IF NOT EXISTS training_daily_bonus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bonus_date DATE NOT NULL DEFAULT CURRENT_DATE,
    diamonds_awarded INTEGER DEFAULT 25,
    claimed_at TIMESTAMPTZ DEFAULT now(),
    streak_bonus INTEGER DEFAULT 0, -- Extra diamonds for consistent training
    UNIQUE(user_id, bonus_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_bonus_user ON training_daily_bonus(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_bonus_date ON training_daily_bonus(bonus_date);

-- Enable RLS
ALTER TABLE training_daily_bonus ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own bonus history" 
    ON training_daily_bonus FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Service manages daily bonus" 
    ON training_daily_bonus FOR ALL 
    USING (true) WITH CHECK (true);
