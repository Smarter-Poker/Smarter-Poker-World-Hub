-- ============================================================================
-- Migration: Missing RPCs called by code but never defined
-- Date: 2026-03-02
--
-- 6 RPCs that code calls but don't exist in DB:
--   1. get_diamond_balance — training/tournaments.js (blocks ALL paid tournament entries)
--   2. get_unread_leak_alerts — jarvis/leak-alert.js (Jarvis AI leak detection)
--   3. increment_home_game_stats — commander home-games (stat tracking)
--   4. increment_table_hands — commander dealer hand count
--   5. increment_post_count — social interactions (comment counts)
--   6. increment_sandbox_count — sandbox analytics
--
-- Also: check_duplicate_clips, fn_test_rls_as_user, get_auth_users_by_email,
--        get_policies, get_user_by_email — admin/debug only, excluded.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. get_diamond_balance
-- CRITICAL: Without this, paid training tournaments always return
--           "Insufficient diamonds" because balance query returns null.
-- Called by: pages/api/training/tournaments.js
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_diamond_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT COALESCE(diamond_balance, 0) INTO v_balance
  FROM profiles WHERE id = p_user_id;

  RETURN COALESCE(v_balance, 0);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. get_unread_leak_alerts
-- Called by: pages/api/jarvis/leak-alert.js
-- Returns count of unread leak alerts for a user
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_leak_alerts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count INTEGER;
  v_alerts JSONB;
BEGIN
  -- Check if leak_alerts table exists (may not if Jarvis module not deployed)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leak_alerts') THEN
    EXECUTE format(
      'SELECT count(*) FROM leak_alerts WHERE user_id = $1 AND read_at IS NULL'
    ) INTO v_count USING p_user_id;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(row_to_json(la)), ''[]''::jsonb) FROM (
        SELECT id, alert_type, title, description, severity, created_at
        FROM leak_alerts WHERE user_id = $1 AND read_at IS NULL
        ORDER BY created_at DESC LIMIT 10
      ) la'
    ) INTO v_alerts USING p_user_id;
  ELSE
    v_count := 0;
    v_alerts := '[]'::JSONB;
  END IF;

  RETURN jsonb_build_object('count', v_count, 'alerts', v_alerts);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. increment_home_game_stats
-- Called by: pages/api/commander/home-games/events/[id].js
-- Increments stat counters on home_game_events
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_home_game_stats(
  p_event_id UUID,
  p_field TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_field = 'rsvp_count' THEN
    UPDATE home_game_events
    SET rsvp_count = COALESCE(rsvp_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_event_id;
  ELSIF p_field = 'check_in_count' THEN
    UPDATE home_game_events
    SET check_in_count = COALESCE(check_in_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_event_id;
  ELSIF p_field = 'hand_count' THEN
    UPDATE home_game_events
    SET hand_count = COALESCE(hand_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_event_id;
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. increment_table_hands
-- Called by: pages/api/commander/dealer/hand-count.js
-- Atomically increments hand count on commander_tables
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_table_hands(
  p_table_id UUID,
  p_increment INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE commander_tables
  SET total_hands = COALESCE(total_hands, 0) + p_increment,
      updated_at = NOW()
  WHERE id = p_table_id
  RETURNING total_hands INTO v_new_count;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Table not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'total_hands', v_new_count);
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. increment_post_count
-- Called by: pages/api/social/interactions.js (with .catch())
-- Atomically increments a counter field on social_posts
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_post_count(
  p_post_id UUID,
  p_field TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_field = 'comment_count' THEN
    UPDATE social_posts
    SET comment_count = COALESCE(comment_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_post_id;
  ELSIF p_field = 'like_count' THEN
    UPDATE social_posts
    SET like_count = COALESCE(like_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_post_id;
  ELSIF p_field = 'share_count' THEN
    UPDATE social_posts
    SET share_count = COALESCE(share_count, 0) + p_increment, updated_at = NOW()
    WHERE id = p_post_id;
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. increment_sandbox_count
-- Called by: pages/api/assistant/sandbox/analyze.js (with .catch())
-- Tracks sandbox usage per user for analytics
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_sandbox_count(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET sandbox_count = COALESCE(sandbox_count, 0) + 1
  WHERE id = p_user_id;
  -- Silently succeeds even if column doesn't exist (no-op)
EXCEPTION WHEN undefined_column THEN
  NULL; -- Column not yet added, skip
END;
$$;
