-- Training Question History Table
-- Tracks answered questions to prevent repeats within training sessions

CREATE TABLE IF NOT EXISTS training_question_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  level INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate answers for the same question
  CONSTRAINT unique_user_game_question UNIQUE(user_id, game_id, question_id)
);

-- Index for fast lookups when fetching questions
CREATE INDEX IF NOT EXISTS idx_training_history_user_game 
  ON training_question_history(user_id, game_id);

-- Index for level-based queries
CREATE INDEX IF NOT EXISTS idx_training_history_level 
  ON training_question_history(user_id, game_id, level);

-- RLS Policies
ALTER TABLE training_question_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own history
CREATE POLICY "Users can view own training history"
  ON training_question_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own answers
CREATE POLICY "Users can insert own training answers"
  ON training_question_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Optional: Allow users to delete their own history (for reset)
CREATE POLICY "Users can delete own training history"
  ON training_question_history
  FOR DELETE
  USING (auth.uid() = user_id);
