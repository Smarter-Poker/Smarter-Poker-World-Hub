-- Bankroll Streaks and Achievements
-- Migration for gamification features

-- Streak tracking table
CREATE TABLE IF NOT EXISTS bankroll_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_log_date DATE,
  total_logs INT DEFAULT 0,
  win_streak INT DEFAULT 0,
  loss_streak INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Achievements table
CREATE TABLE IF NOT EXISTS bankroll_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, achievement_key)
);

-- Enable RLS
ALTER TABLE bankroll_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for streaks
CREATE POLICY "Users can view own streaks"
  ON bankroll_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own streaks"
  ON bankroll_streaks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streaks"
  ON bankroll_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for achievements
CREATE POLICY "Users can view own achievements"
  ON bankroll_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON bankroll_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bankroll_streaks_user ON bankroll_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_achievements_user ON bankroll_achievements(user_id);

-- Function to update streak after logging
CREATE OR REPLACE FUNCTION update_bankroll_streak(
  p_user_id UUID,
  p_is_win BOOLEAN DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_last_date DATE;
  v_today DATE := CURRENT_DATE;
  v_streak INT;
BEGIN
  -- Get or create streak record
  INSERT INTO bankroll_streaks (user_id, last_log_date, current_streak, total_logs)
  VALUES (p_user_id, v_today, 1, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    total_logs = bankroll_streaks.total_logs + 1,
    current_streak = CASE
      WHEN bankroll_streaks.last_log_date = v_today THEN bankroll_streaks.current_streak
      WHEN bankroll_streaks.last_log_date = v_today - 1 THEN bankroll_streaks.current_streak + 1
      ELSE 1
    END,
    longest_streak = GREATEST(
      bankroll_streaks.longest_streak,
      CASE
        WHEN bankroll_streaks.last_log_date = v_today THEN bankroll_streaks.current_streak
        WHEN bankroll_streaks.last_log_date = v_today - 1 THEN bankroll_streaks.current_streak + 1
        ELSE 1
      END
    ),
    win_streak = CASE
      WHEN p_is_win IS NULL THEN bankroll_streaks.win_streak
      WHEN p_is_win THEN bankroll_streaks.win_streak + 1
      ELSE 0
    END,
    loss_streak = CASE
      WHEN p_is_win IS NULL THEN bankroll_streaks.loss_streak
      WHEN NOT p_is_win THEN bankroll_streaks.loss_streak + 1
      ELSE 0
    END,
    last_log_date = v_today,
    updated_at = now();

  -- Check and award achievements
  SELECT current_streak INTO v_streak FROM bankroll_streaks WHERE user_id = p_user_id;
  
  -- First log achievement
  IF (SELECT total_logs FROM bankroll_streaks WHERE user_id = p_user_id) = 1 THEN
    INSERT INTO bankroll_achievements (user_id, achievement_key)
    VALUES (p_user_id, 'first_log') ON CONFLICT DO NOTHING;
  END IF;
  
  -- Streak achievements
  IF v_streak >= 7 THEN
    INSERT INTO bankroll_achievements (user_id, achievement_key)
    VALUES (p_user_id, 'streak_7') ON CONFLICT DO NOTHING;
  END IF;
  
  IF v_streak >= 30 THEN
    INSERT INTO bankroll_achievements (user_id, achievement_key)
    VALUES (p_user_id, 'streak_30') ON CONFLICT DO NOTHING;
  END IF;
  
  IF v_streak >= 100 THEN
    INSERT INTO bankroll_achievements (user_id, achievement_key)
    VALUES (p_user_id, 'streak_100') ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
