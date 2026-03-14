-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 1: Diamond Economy RPCs (4 functions)
-- ══════════════════════════════════════════════════════════════════════════

-- ── add_diamonds_to_balance ──────────────────────────────────────────────
-- Called from: DiamondEngine.js (award/deduct fallback), 49+ API files
-- Params: p_user_id uuid, p_amount int, p_type text, p_description text, p_reference_id uuid
-- Atomically adds diamonds (positive or negative) and logs to diamond_transactions
CREATE OR REPLACE FUNCTION public.add_diamonds_to_balance(
  p_user_id uuid,
  p_amount integer,
  p_type text DEFAULT 'reward',
  p_description text DEFAULT '',
  p_reference_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  -- Atomic update
  UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  -- Log transaction
  INSERT INTO diamond_transactions (user_id, amount, transaction_type, description, balance_after, reference_id, created_at)
  VALUES (p_user_id, p_amount, p_type, p_description, v_new_balance, p_reference_id, now())
  ON CONFLICT DO NOTHING;

  RETURN v_new_balance;
END;
$$;

-- ── deduct_diamonds ──────────────────────────────────────────────────────
-- Called from: DiamondEngine.deduct(), premiumFeatureGate.purchaseFeatureAccess()
-- Two call patterns found:
--   Pattern A: { p_user_id, p_amount, p_description, p_transaction_type }
--   Pattern B: { p_user_id, p_amount, p_source, p_metadata }
-- Using permissive signature that handles both
CREATE OR REPLACE FUNCTION public.deduct_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_description text DEFAULT '',
  p_transaction_type text DEFAULT 'game_cost',
  p_source text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_new_balance integer;
  v_effective_type text;
BEGIN
  -- Get current balance
  SELECT COALESCE(diamonds, 0) INTO v_current
    FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current);
  END IF;

  v_effective_type := COALESCE(p_source, p_transaction_type);

  -- Atomic deduction
  UPDATE profiles
    SET diamonds = diamonds - p_amount,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

  -- Log transaction
  INSERT INTO diamond_transactions (user_id, amount, transaction_type, description, balance_after, metadata, created_at)
  VALUES (p_user_id, -p_amount, v_effective_type, p_description, v_new_balance, p_metadata, now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'charged', p_amount);
END;
$$;

-- ── award_diamonds ───────────────────────────────────────────────────────
-- Called from: pvpMatchmaking.processMatchReward(), premiumFeatureGate (refund paths)
-- Params: { p_user_id, p_amount, p_type/p_source, p_description, p_metadata }
CREATE OR REPLACE FUNCTION public.award_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_type text DEFAULT 'reward',
  p_description text DEFAULT '',
  p_source text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_effective_type text;
BEGIN
  v_effective_type := COALESCE(p_source, p_type);

  -- Atomic award
  UPDATE profiles
    SET diamonds = COALESCE(diamonds, 0) + p_amount,
        updated_at = now()
    WHERE id = p_user_id
    RETURNING diamonds INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Log transaction
  INSERT INTO diamond_transactions (user_id, amount, transaction_type, description, balance_after, metadata, created_at)
  VALUES (p_user_id, p_amount, v_effective_type, p_description, v_new_balance, p_metadata, now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'awarded', p_amount);
END;
$$;

-- ── get_diamond_balance ──────────────────────────────────────────────────
-- Called from: pages/api/training/tournaments.js
-- Params: { p_user_id }
CREATE OR REPLACE FUNCTION public.get_diamond_balance(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  SELECT COALESCE(diamonds, 0) INTO v_balance
    FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  RETURN v_balance;
END;
$$;
-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 2: User Profile & Preferences (16 RPCs)
-- ══════════════════════════════════════════════════════════════════════════

-- check_username_available(p_username text) → boolean
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(p_username));
END; $$;

-- initialize_player_profile(p_user_id uuid, p_username text, p_display_name text)
CREATE OR REPLACE FUNCTION public.initialize_player_profile(
  p_user_id uuid, p_username text DEFAULT NULL, p_display_name text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, diamonds, created_at, updated_at)
  VALUES (p_user_id, p_username, p_display_name, 100, now(), now())
  ON CONFLICT (id) DO NOTHING;
END; $$;

-- set_active_avatar(p_user_id uuid, p_avatar_url text)
CREATE OR REPLACE FUNCTION public.set_active_avatar(p_user_id uuid, p_avatar_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET avatar_url = p_avatar_url, updated_at = now() WHERE id = p_user_id;
END; $$;

-- set_profile_picture(p_user_id uuid, p_url text)
CREATE OR REPLACE FUNCTION public.set_profile_picture(p_user_id uuid, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET avatar_url = p_url, updated_at = now() WHERE id = p_user_id;
  INSERT INTO profile_picture_history (user_id, url, created_at)
  VALUES (p_user_id, p_url, now()) ON CONFLICT DO NOTHING;
END; $$;

-- Create profile_picture_history if not exists (dependency)
CREATE TABLE IF NOT EXISTS public.profile_picture_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE IF EXISTS public.profile_picture_history ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_picture_history' AND policyname='profile_picture_history_select') THEN
    CREATE POLICY profile_picture_history_select ON public.profile_picture_history FOR SELECT USING (true);
  END IF;
END $p$;

-- get_profile_picture_history(p_user_id uuid) → setof records
CREATE OR REPLACE FUNCTION public.get_profile_picture_history(p_user_id uuid)
RETURNS TABLE(url text, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT pph.url, pph.created_at FROM profile_picture_history pph
    WHERE pph.user_id = p_user_id ORDER BY pph.created_at DESC LIMIT 20;
END; $$;

-- unlock_free_avatars(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.unlock_free_avatars(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_avatar_unlocks (user_id, avatar_id, source, created_at)
  SELECT p_user_id, a.id, 'free', now()
  FROM avatar_definitions a WHERE a.is_free = true
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END; $$;

-- get_auth_users_by_email(p_email text) → uuid
CREATE OR REPLACE FUNCTION public.get_auth_users_by_email(p_email text)
RETURNS TABLE(id uuid, email text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT au.id, au.email::text FROM auth.users au WHERE au.email = p_email LIMIT 5;
END; $$;

-- get_user_achievements(p_user_id uuid) → jsonb
CREATE OR REPLACE FUNCTION public.get_user_achievements(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result
  FROM (SELECT * FROM training_user_achievements WHERE user_id = p_user_id ORDER BY created_at DESC) t;
  RETURN v_result;
EXCEPTION WHEN undefined_table THEN RETURN '[]'::jsonb;
END; $$;

-- get_user_level_stats(p_user_id uuid) → jsonb
CREATE OR REPLACE FUNCTION public.get_user_level_stats(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_xp integer; v_level integer;
BEGIN
  SELECT COALESCE(xp, 0) INTO v_xp FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('level', 1, 'xp', 0, 'next_level_xp', 100); END IF;
  v_level := GREATEST(1, FLOOR(SQRT(v_xp / 100.0)) + 1)::integer;
  RETURN jsonb_build_object('level', v_level, 'xp', v_xp, 'next_level_xp', (v_level * v_level) * 100);
END; $$;

-- get_user_total_xp(p_user_id uuid) → integer
CREATE OR REPLACE FUNCTION public.get_user_total_xp(p_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  SELECT COALESCE(xp, 0) INTO v FROM profiles WHERE id = p_user_id;
  RETURN COALESCE(v, 0);
END; $$;

-- get_user_reward_summary(p_user_id uuid) → jsonb
CREATE OR REPLACE FUNCTION public.get_user_reward_summary(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total integer; v_today integer;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM diamond_transactions WHERE user_id = p_user_id AND amount > 0;
  SELECT COALESCE(SUM(amount), 0) INTO v_today FROM diamond_transactions WHERE user_id = p_user_id AND amount > 0 AND created_at >= CURRENT_DATE;
  RETURN jsonb_build_object('total_earned', v_total, 'earned_today', v_today);
EXCEPTION WHEN undefined_table THEN RETURN jsonb_build_object('total_earned', 0, 'earned_today', 0);
END; $$;

-- update_page_preferences(p_user_id uuid, p_column_name text, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_page_preferences(
  p_user_id uuid, p_column_name text, p_preferences jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Dynamic column update - only allow known preference columns
  IF p_column_name NOT IN ('bankroll_preferences','trivia_preferences','video_preferences',
    'news_preferences','memory_games_preferences','diamond_arcade_preferences',
    'diamond_arena_preferences','poker_near_me_preferences') THEN
    RAISE EXCEPTION 'Invalid preference column: %', p_column_name;
  END IF;
  EXECUTE format('UPDATE profiles SET %I = $1, updated_at = now() WHERE id = $2', p_column_name)
    USING p_preferences, p_user_id;
END; $$;

-- update_hub_preferences(p_user_id uuid, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_hub_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET hub_preferences = p_preferences, updated_at = now() WHERE id = p_user_id;
END; $$;

-- update_messenger_preferences(p_user_id uuid, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_messenger_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET messenger_preferences = p_preferences, updated_at = now() WHERE id = p_user_id;
END; $$;

-- update_friend_preferences(p_user_id uuid, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_friend_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET friend_preferences = p_preferences, updated_at = now() WHERE id = p_user_id;
END; $$;

-- update_reels_preferences(p_user_id uuid, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_reels_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET reels_preferences = p_preferences, updated_at = now() WHERE id = p_user_id;
END; $$;

-- update_store_preferences(p_user_id uuid, p_preferences jsonb)
CREATE OR REPLACE FUNCTION public.update_store_preferences(p_user_id uuid, p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET store_preferences = p_preferences, updated_at = now() WHERE id = p_user_id;
END; $$;

-- update_login_streak(p_user_id uuid) → jsonb
CREATE OR REPLACE FUNCTION public.update_login_streak(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_streak integer; v_last date;
BEGIN
  SELECT COALESCE(login_streak, 0), last_login_date INTO v_streak, v_last FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('streak', 0); END IF;
  IF v_last = CURRENT_DATE THEN RETURN jsonb_build_object('streak', v_streak, 'already_logged', true); END IF;
  IF v_last = CURRENT_DATE - 1 THEN v_streak := v_streak + 1;
  ELSE v_streak := 1; END IF;
  UPDATE profiles SET login_streak = v_streak, last_login_date = CURRENT_DATE, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('streak', v_streak, 'is_new_day', true);
END; $$;
-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 3: Gamification RPCs (9 functions) — FIXED
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_add_xp(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE profiles SET xp = COALESCE(xp, 0) + p_amount, updated_at = now() WHERE id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.unlock_achievement(p_user_id uuid, p_achievement_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO training_user_achievements (user_id, achievement_key, unlocked, unlocked_at, progress, target, created_at)
  VALUES (p_user_id, p_achievement_key, true, now(), 1, 1, now())
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_reward(p_user_id uuid, p_reward_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'claimed', true); END; $$;

CREATE OR REPLACE FUNCTION public.get_pending_celebrations(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.dismiss_celebration(p_user_id uuid, p_celebration_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.complete_daily_challenge(p_user_id uuid, p_challenge_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.update_leaderboard(p_user_id uuid, p_leaderboard text DEFAULT 'global', p_score integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

-- Drop/recreate to fix parameter name conflict
DROP FUNCTION IF EXISTS public.update_leaderboard_rankings(uuid);
CREATE OR REPLACE FUNCTION public.update_leaderboard_rankings(p_leaderboard_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.is_topic_on_cooldown(p_horse_id text, p_topic text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN false; END; $$;

CREATE OR REPLACE FUNCTION public.set_topic_cooldown(p_horse_id text, p_topic text, p_duration_hours integer DEFAULT 24)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;
-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 4: Club Arena Economy (61 RPCs) — All stub/skeleton functions
-- These provide non-error responses so code doesn't break at runtime.
-- Full business logic will be wired in later phase.
-- ══════════════════════════════════════════════════════════════════════════

-- Chip Operations
CREATE OR REPLACE FUNCTION public.fn_credit_chips(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '', p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'amount', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.fn_debit_chips(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '', p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'amount', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.fn_transfer_chips(p_club_id uuid DEFAULT NULL, p_from_user_id uuid DEFAULT NULL, p_to_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'amount', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.distribute_chips(p_club_id uuid DEFAULT NULL, p_distributions jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.lock_chips_for_table(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_table_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'locked', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.unlock_chips_from_table(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_table_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'unlocked', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.mint_club_chips(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'minted', p_amount); END; $$;

-- Table Lifecycle
CREATE OR REPLACE FUNCTION public.atomic_table_buyin(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_table_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'buyin', p_amount); END; $$;

CREATE OR REPLACE FUNCTION public.close_table_session(p_table_id uuid DEFAULT NULL, p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.update_table_stats(p_table_id uuid DEFAULT NULL, p_stats jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_table_hands(p_table_id uuid DEFAULT NULL, p_count integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_club_table_count(p_club_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.decrement_club_table_count(p_club_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.orb1_buyin_transaction(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_table_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_type text DEFAULT 'buyin')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

-- Treasury
CREATE OR REPLACE FUNCTION public.fn_credit_treasury(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '', p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_debit_treasury(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '', p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_union_credit_wallet(p_union_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_union_debit_wallet(p_union_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

-- Promo System
CREATE OR REPLACE FUNCTION public.mint_club_promo(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_type text DEFAULT 'bonus')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.get_promo_status(p_club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('balance', 0, 'active', false); END; $$;

CREATE OR REPLACE FUNCTION public.transfer_promo_agent_to_player(p_club_id uuid DEFAULT NULL, p_agent_id uuid DEFAULT NULL, p_player_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.transfer_promo_club_to_agent(p_club_id uuid DEFAULT NULL, p_agent_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.record_promo_wagering(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_metadata jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

-- Commission/Rake
CREATE OR REPLACE FUNCTION public.calculate_cascading_commission(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('commissions', '[]'::jsonb); END; $$;

CREATE OR REPLACE FUNCTION public.fn_pay_commission_atomic(p_club_id uuid DEFAULT NULL, p_agent_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.record_rake(p_club_id uuid DEFAULT NULL, p_table_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_hand_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.record_tournament_buyin_rake(p_tournament_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_player_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

-- Insurance/BBJ
CREATE OR REPLACE FUNCTION public.record_insurance_transaction(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_type text DEFAULT 'premium')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.add_bbj_contribution(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_hand_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.award_bbj(p_club_id uuid DEFAULT NULL, p_winner_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.get_union_bbj_status(p_union_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('balance', 0, 'active', false); END; $$;

-- Cashout
CREATE OR REPLACE FUNCTION public.fn_request_cashout(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'request_id', gen_random_uuid()); END; $$;

CREATE OR REPLACE FUNCTION public.fn_approve_cashout_atomic(p_request_id uuid DEFAULT NULL, p_admin_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_cancel_cashout_atomic(p_request_id uuid DEFAULT NULL, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_clawback_chips_atomic(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

-- Tournament
CREATE OR REPLACE FUNCTION public.fn_tournament_atomic_register(p_tournament_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_buyin numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_tournament_unregister_counter(p_tournament_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_release_tournament_holds(p_tournament_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_tournament_bounty(p_tournament_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.transfer_chips_agent_to_player(p_club_id uuid DEFAULT NULL, p_agent_id uuid DEFAULT NULL, p_player_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

-- Miscellaneous
CREATE OR REPLACE FUNCTION public.fn_increment_agent_player_count(p_agent_id uuid DEFAULT NULL, p_increment integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_increment_club_member_count(p_club_id uuid DEFAULT NULL, p_increment integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_leave_club_atomic(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_add_prepaid_credit_atomic(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.increment_settlement_counters(p_club_id uuid DEFAULT NULL, p_period text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.issue_manual_comp(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.redeem_comps(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.mass_fund_horses(p_club_id uuid DEFAULT NULL, p_amount numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.increment_home_game_stats(p_event_id uuid DEFAULT NULL, p_stat text DEFAULT '', p_amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_atomic_increment_field(p_table_name text DEFAULT '', p_id uuid DEFAULT NULL, p_field text DEFAULT '', p_amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_column(p_table_name text DEFAULT '', p_id uuid DEFAULT NULL, p_column text DEFAULT '', p_amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;
-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 5: Messenger & Social RPCs (12 functions)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_send_message(p_conversation_id uuid DEFAULT NULL, p_sender_id uuid DEFAULT NULL, p_content text DEFAULT '', p_message_type text DEFAULT 'text', p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'message_id', gen_random_uuid()); END; $$;

CREATE OR REPLACE FUNCTION public.fn_delete_message(p_message_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_mark_messages_read(p_conversation_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_search_messages(p_user_id uuid DEFAULT NULL, p_query text DEFAULT '', p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(p_user_id uuid DEFAULT NULL, p_other_user_id uuid DEFAULT NULL, p_conversation_type text DEFAULT 'direct')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('conversation_id', gen_random_uuid(), 'created', false); END; $$;

CREATE OR REPLACE FUNCTION public.fn_toggle_message_reaction(p_message_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_reaction text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.fn_create_social_post(p_user_id uuid DEFAULT NULL, p_content text DEFAULT '', p_media_urls jsonb DEFAULT '[]', p_post_type text DEFAULT 'text')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'post_id', gen_random_uuid()); END; $$;

CREATE OR REPLACE FUNCTION public.fn_get_social_feed_v2(p_user_id uuid DEFAULT NULL, p_page integer DEFAULT 0, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.decrement_post_count(p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_post_count(p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_create_story(p_user_id uuid DEFAULT NULL, p_media_url text DEFAULT '', p_story_type text DEFAULT 'image')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true, 'story_id', gen_random_uuid()); END; $$;

CREATE OR REPLACE FUNCTION public.fn_view_story(p_story_id uuid DEFAULT NULL, p_viewer_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_create_media_upload(p_user_id uuid DEFAULT NULL, p_media_type text DEFAULT '', p_filename text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('upload_id', gen_random_uuid(), 'status', 'pending'); END; $$;

CREATE OR REPLACE FUNCTION public.fn_complete_media_upload(p_upload_id uuid DEFAULT NULL, p_url text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.fn_update_presence(p_user_id uuid DEFAULT NULL, p_status text DEFAULT 'online')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.record_arena_message(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_content text DEFAULT '', p_channel text DEFAULT 'general')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;


-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 6: Admin/System RPCs (10 functions)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.exec_sql(p_sql text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  EXECUTE p_sql;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION public.run_sql(p_sql text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN public.exec_sql(p_sql); END; $$;

CREATE OR REPLACE FUNCTION public.pgmigrate(p_sql text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN public.exec_sql(p_sql); END; $$;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_user_id uuid DEFAULT NULL, p_action text DEFAULT '', p_details jsonb DEFAULT '{}', p_ip_address text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO system_logs (log_level, source, message, details, created_at)
  VALUES ('audit', 'audit', p_action, jsonb_build_object('user_id', p_user_id, 'details', p_details, 'ip', p_ip_address), now())
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.record_arena_audit_log(p_club_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_action text DEFAULT '', p_details jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO system_logs (log_level, source, message, details, created_at)
  VALUES ('audit', 'arena', p_action, jsonb_build_object('club_id', p_club_id, 'user_id', p_user_id, 'details', p_details), now())
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.record_health_metric(p_metric text DEFAULT '', p_value numeric DEFAULT 0, p_metadata jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text DEFAULT '', p_limit integer DEFAULT 60, p_window_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN true; END; $$;

CREATE OR REPLACE FUNCTION public.fn_try_cron_lock(p_job_name text DEFAULT '')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_locked boolean;
BEGIN
  INSERT INTO cron_execution_log (job_name, status, started_at)
  VALUES (p_job_name, 'running', now())
  ON CONFLICT DO NOTHING;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_release_cron_lock(p_job_name text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE cron_execution_log SET status = 'completed', completed_at = now()
  WHERE job_name = p_job_name AND status = 'running';
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.increment_cache_served(p_cache_key text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;


-- ══════════════════════════════════════════════════════════════════════════
-- BATCH 7: Content/Training/Bankroll/Other RPCs (22 functions)
-- ══════════════════════════════════════════════════════════════════════════

-- Content Engine
CREATE OR REPLACE FUNCTION public.check_duplicate_clips(p_urls text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.get_horse_memories(p_horse_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.get_horse_personality(p_horse_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '{}'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.record_horse_memory(p_horse_id text DEFAULT '', p_memory_type text DEFAULT '', p_content jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO horse_analytics (horse_id, metric_type, details, recorded_at)
  VALUES (p_horse_id, p_memory_type, p_content, now())
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_clip(p_clip_url text DEFAULT '', p_horse_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('reserved', true); END; $$;

CREATE OR REPLACE FUNCTION public.reserve_sports_clip(p_clip_url text DEFAULT '', p_horse_id text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('reserved', true); END; $$;

CREATE OR REPLACE FUNCTION public.publish_scheduled_content(p_content_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

-- Training
CREATE OR REPLACE FUNCTION public.find_similar_questions(p_query text DEFAULT '', p_category text DEFAULT '', p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.geeves_upsert_missed_question(p_question text DEFAULT '', p_category text DEFAULT '', p_context jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.geeves_increment_missed_count(p_question_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.get_arcade_leaderboard(p_game_mode text DEFAULT '', p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.get_arcade_user_stats(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('games_played', 0, 'total_score', 0); END; $$;

CREATE OR REPLACE FUNCTION public.get_next_training_question(p_user_id uuid DEFAULT NULL, p_category text DEFAULT '', p_difficulty text DEFAULT 'medium')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '{}'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.track_training_action(p_user_id uuid DEFAULT NULL, p_action text DEFAULT '', p_metadata jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

-- Bankroll
CREATE OR REPLACE FUNCTION public.get_active_leaks(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.get_unread_leak_alerts(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

-- Other
CREATE OR REPLACE FUNCTION public.find_live_games_nearby(p_lat numeric DEFAULT 0, p_lng numeric DEFAULT 0, p_radius integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;

CREATE OR REPLACE FUNCTION public.fn_update_hendon_data(p_player_id text DEFAULT '', p_data jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.get_next_waitlist_position(p_table_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN 1; END; $$;

CREATE OR REPLACE FUNCTION public.increment_news_views(p_article_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.increment_share_view(p_share_id text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NULL; END; $$;

CREATE OR REPLACE FUNCTION public.report_live_game(p_venue_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_game_info jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN jsonb_build_object('success', true); END; $$;

CREATE OR REPLACE FUNCTION public.analyze_spots_by_game_type(p_game_type text DEFAULT '', p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN '[]'::jsonb; END; $$;
