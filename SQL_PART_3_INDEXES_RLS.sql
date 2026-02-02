-- PART 3: INDEXES AND RLS (Run this third)

CREATE INDEX idx_game_registry_engine ON game_registry(engine_type);
CREATE INDEX idx_game_registry_active ON game_registry(is_active) WHERE is_active = true;
CREATE INDEX idx_game_registry_slug ON game_registry(slug);
CREATE INDEX idx_god_mode_session_user ON god_mode_user_session(user_id);
CREATE INDEX idx_god_mode_session_game ON god_mode_user_session(game_id);
CREATE INDEX idx_god_mode_session_recent ON god_mode_user_session(last_played_at DESC);
CREATE INDEX idx_god_mode_history_user ON god_mode_hand_history(user_id);
CREATE INDEX idx_god_mode_history_user_file ON god_mode_hand_history(user_id, source_file_id);
CREATE INDEX idx_god_mode_history_session ON god_mode_hand_history(session_id);
CREATE INDEX idx_god_mode_history_game ON god_mode_hand_history(game_id);
CREATE INDEX idx_god_mode_history_played ON god_mode_hand_history(played_at DESC);
CREATE INDEX idx_god_mode_leaderboard_rank ON god_mode_leaderboard(game_id, highest_level DESC, best_accuracy DESC);

ALTER TABLE game_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_registry_read" ON game_registry FOR SELECT USING (true);
CREATE POLICY "session_select_own" ON god_mode_user_session FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_insert_own" ON god_mode_user_session FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "session_update_own" ON god_mode_user_session FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "history_select_own" ON god_mode_hand_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "history_insert_own" ON god_mode_hand_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "leaderboard_read" ON god_mode_leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_upsert_own" ON god_mode_leaderboard FOR ALL USING (auth.uid() = user_id);
