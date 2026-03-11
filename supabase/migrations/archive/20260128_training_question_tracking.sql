-- Training Games: Question Tracking Tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks seen questions (no-repeat) and answers for stats

-- Table: user_seen_questions
-- Ensures users never see the same question twice
CREATE TABLE IF NOT EXISTS user_seen_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_user_game_question UNIQUE(user_id, game_id, question_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_seen_questions_user_game 
  ON user_seen_questions(user_id, game_id);

-- Table: training_answers
-- Records all answers for progress tracking and analytics
CREATE TABLE IF NOT EXISTS training_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  level INTEGER NOT NULL DEFAULT 1,
  answered_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user progress queries
CREATE INDEX IF NOT EXISTS idx_training_answers_user_game 
  ON training_answers(user_id, game_id);

-- Enable RLS
ALTER TABLE user_seen_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see/modify their own data
CREATE POLICY "Users can view own seen questions"
  ON user_seen_questions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own seen questions"
  ON user_seen_questions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own training answers"
  ON training_answers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training answers"
  ON training_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass for API
CREATE POLICY "Service role full access seen_questions"
  ON user_seen_questions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access training_answers"
  ON training_answers FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
