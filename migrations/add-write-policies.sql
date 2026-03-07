-- ════════════════════════════════════════════════════════════════════════════════
-- ADD MISSING INSERT/UPDATE/DELETE POLICIES
-- For 23 tables in Smarter Poker World Hub
-- ════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. user_preferences - User-owned table (already has policies, adding DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_delete_own_preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. training_streaks - User-owned table (adding INSERT and DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_streaks" ON training_streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_streaks" ON training_streaks
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. training_scenarios - Public/shared table (admin writes only)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_scenarios" ON training_scenarios
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_scenarios" ON training_scenarios
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_scenarios" ON training_scenarios
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. training_achievement_definitions - Public/shared table (admin writes only)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_achievements" ON training_achievement_definitions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_achievements" ON training_achievement_definitions
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_achievements" ON training_achievement_definitions
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. user_sessions - User-owned table (adding INSERT and DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_sessions" ON user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_sessions" ON user_sessions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_sessions" ON user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. user_mfa_factors - User-owned table (adding INSERT, UPDATE, and DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_mfa" ON user_mfa_factors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_mfa" ON user_mfa_factors
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_mfa" ON user_mfa_factors
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. commander_tournament_templates - Staff writes (using service_role)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "staff_insert_templates" ON commander_tournament_templates
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

CREATE POLICY IF NOT EXISTS "staff_update_templates" ON commander_tournament_templates
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

CREATE POLICY IF NOT EXISTS "staff_delete_templates" ON commander_tournament_templates
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 8. commander_tournament_points - Staff writes (using service_role)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "staff_insert_points" ON commander_tournament_points
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

CREATE POLICY IF NOT EXISTS "staff_update_points" ON commander_tournament_points
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

CREATE POLICY IF NOT EXISTS "staff_delete_points" ON commander_tournament_points
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'staff')
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 9. geeves_conversations - User-owned table (adding UPDATE and DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_update_own_conversations" ON geeves_conversations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_conversations" ON geeves_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 10. geeves_knowledge_cache - Public/shared table (admin writes only)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_cache" ON geeves_knowledge_cache
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_cache" ON geeves_knowledge_cache
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_cache" ON geeves_knowledge_cache
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 11. geeves_answer_ratings - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_ratings" ON geeves_answer_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_ratings" ON geeves_answer_ratings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_ratings" ON geeves_answer_ratings
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 12. god_mode_questions - Public/shared table (admin writes only)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_questions" ON god_mode_questions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_questions" ON god_mode_questions
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_questions" ON god_mode_questions
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 13. endless_high_scores - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_scores" ON endless_high_scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_scores" ON endless_high_scores
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_scores" ON endless_high_scores
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 14. hand_private_state - User-owned (player_id) table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_hands" ON hand_private_state
  FOR INSERT WITH CHECK (auth.uid() = player_id);

CREATE POLICY IF NOT EXISTS "users_update_own_hands" ON hand_private_state
  FOR UPDATE USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_hands" ON hand_private_state
  FOR DELETE USING (auth.uid() = player_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 15. horse_relationships - Service writes only (content engine)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "service_insert_relationships" ON horse_relationships
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service'
  ));

CREATE POLICY IF NOT EXISTS "service_update_relationships" ON horse_relationships
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service'
  ));

CREATE POLICY IF NOT EXISTS "service_delete_relationships" ON horse_relationships
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'service'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 16. leak_hand_examples - Public/shared table (admin writes only)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_examples" ON leak_hand_examples
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_examples" ON leak_hand_examples
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_examples" ON leak_hand_examples
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ───────────────────────────────────────────────────────────────────────────────
-- 17. newsletter_subscribers - Users can insert own subscription and UPDATE/DELETE own
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_subscription" ON newsletter_subscribers
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY IF NOT EXISTS "users_update_subscription" ON newsletter_subscribers
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_subscription" ON newsletter_subscribers
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 18. tournament_alert_preferences - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_alert_preferences" ON tournament_alert_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_alert_preferences" ON tournament_alert_preferences
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_alert_preferences" ON tournament_alert_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 19. survival_progress - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_progress" ON survival_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_progress" ON survival_progress
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_progress" ON survival_progress
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 20. trivia_survival_runs - User-owned table (adding INSERT, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_runs" ON trivia_survival_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_runs" ON trivia_survival_runs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_runs" ON trivia_survival_runs
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 21. user_poker_stats - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_stats" ON user_poker_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_stats" ON user_poker_stats
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_stats" ON user_poker_stats
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 22. video_analysis - User-owned table (adding INSERT, UPDATE, DELETE)
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "users_insert_own_analysis" ON video_analysis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_update_own_analysis" ON video_analysis
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "users_delete_own_analysis" ON video_analysis
  FOR DELETE USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────────
-- 23. venues - Admin writes only
-- ───────────────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "admin_insert_venues" ON venues
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_update_venues" ON venues
  FOR UPDATE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ))
  WITH CHECK (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY IF NOT EXISTS "admin_delete_venues" ON venues
  FOR DELETE USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'
  ));

-- ════════════════════════════════════════════════════════════════════════════════
-- END OF WRITE POLICIES
-- ════════════════════════════════════════════════════════════════════════════════
