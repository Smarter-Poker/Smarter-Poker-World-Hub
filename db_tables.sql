-- Quiz results
CREATE TABLE IF NOT EXISTS sandbox_quiz_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  scenario_hash TEXT NOT NULL,
  user_action TEXT NOT NULL,
  correct_action TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly spots
CREATE TABLE IF NOT EXISTS sandbox_weekly_spots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_json JSONB NOT NULL,
  correct_action TEXT NOT NULL,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sandbox_quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_weekly_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own quiz" ON sandbox_quiz_results
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own quiz" ON sandbox_quiz_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public weekly spots" ON sandbox_weekly_spots
  FOR SELECT USING (true);
