-- PART 1: CLEANUP (Run this first)
DROP TABLE IF EXISTS god_mode_leaderboard CASCADE;
DROP TABLE IF EXISTS god_mode_hand_history CASCADE;
DROP TABLE IF EXISTS god_mode_user_session CASCADE;
DROP TABLE IF EXISTS game_registry CASCADE;
DROP FUNCTION IF EXISTS has_user_seen_hand(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_available_rotation(UUID, TEXT);
DROP FUNCTION IF EXISTS update_session_after_hand(UUID, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS update_updated_at();
