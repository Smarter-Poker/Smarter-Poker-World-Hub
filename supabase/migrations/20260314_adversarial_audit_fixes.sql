-- Phase 16B: Adversarial Audit Bug Fixes
-- Fixes discovered after Phase 16 table drops

-- 1. Recreate tables that were dropped but referenced by RPCs
CREATE TABLE IF NOT EXISTS public.profile_picture_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  media_id uuid,
  url text,
  is_current boolean DEFAULT false,
  set_at timestamptz DEFAULT now(),
  removed_at timestamptz,
  thumbnail_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.profile_picture_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS profile_picture_history_select ON public.profile_picture_history FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS profile_picture_history_insert ON public.profile_picture_history FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS profile_picture_history_update ON public.profile_picture_history FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS profile_picture_history_delete ON public.profile_picture_history FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.memory_achievements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, achievement_key)
);
ALTER TABLE public.memory_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS memory_achievements_select ON public.memory_achievements FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS memory_achievements_insert ON public.memory_achievements FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS memory_achievements_update ON public.memory_achievements FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS memory_achievements_delete ON public.memory_achievements FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.clawback_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  club_id uuid,
  amount numeric DEFAULT 0,
  reason text,
  performed_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clawback_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS clawback_audit_log_select ON public.clawback_audit_log FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS clawback_audit_log_insert ON public.clawback_audit_log FOR INSERT WITH CHECK (true);

-- 2. Fix is_topic_on_cooldown signature
DROP FUNCTION IF EXISTS public.is_topic_on_cooldown(uuid, text);
CREATE OR REPLACE FUNCTION public.is_topic_on_cooldown(p_user_id uuid, p_topic_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last timestamptz;
BEGIN
  SELECT last_used_at INTO v_last FROM topic_cooldowns WHERE user_id = p_user_id AND topic_id = p_topic_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN (now() - v_last) < interval '24 hours';
EXCEPTION WHEN undefined_table THEN RETURN false;
END; $$;

-- 3. Fix deduct_diamonds — single signature matching code callsite
DROP FUNCTION IF EXISTS public.deduct_diamonds(uuid, integer);
DROP FUNCTION IF EXISTS public.deduct_diamonds(uuid, integer, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.deduct_diamonds(
  p_user_id uuid, p_amount integer, p_description text DEFAULT '', p_transaction_type text DEFAULT 'spend'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance integer;
BEGIN
  SELECT COALESCE(diamonds, 0) INTO v_balance FROM profiles WHERE id = p_user_id;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_balance);
  END IF;
  UPDATE profiles SET diamonds = diamonds - p_amount, updated_at = now() WHERE id = p_user_id;
  INSERT INTO diamond_transactions (user_id, amount, type, description, created_at)
  VALUES (p_user_id, -p_amount, p_transaction_type, p_description, now());
  RETURN jsonb_build_object('success', true, 'charged', p_amount, 'balance', v_balance - p_amount);
END; $$;

-- 4. Fix dismiss_celebration — drop 2-param overload
DROP FUNCTION IF EXISTS public.dismiss_celebration(uuid, uuid);

-- 5. Fix unlock_achievement — match p_achievement_id param name from code
DROP FUNCTION IF EXISTS public.unlock_achievement(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.unlock_achievement(uuid, text);
CREATE OR REPLACE FUNCTION public.unlock_achievement(p_user_id uuid, p_achievement_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM memory_achievements WHERE user_id = p_user_id AND achievement_key = p_achievement_id) THEN
    RETURN jsonb_build_object('success', false, 'already_unlocked', true);
  END IF;
  INSERT INTO memory_achievements (user_id, achievement_key, unlocked_at)
  VALUES (p_user_id, p_achievement_id, now())
  ON CONFLICT (user_id, achievement_key) DO NOTHING;
  RETURN jsonb_build_object('success', true, 'achievement_id', p_achievement_id);
END; $$;

-- 6. Fix fn_clawback_chips_atomic — drop conflicting overload
DROP FUNCTION IF EXISTS public.fn_clawback_chips_atomic(uuid, uuid, uuid, numeric);

-- 7. Fix get_user_level_stats — COALESCE type mismatch
DROP FUNCTION IF EXISTS public.get_user_level_stats(uuid);
CREATE OR REPLACE FUNCTION public.get_user_level_stats(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_xp integer; v_level integer;
BEGIN
  SELECT COALESCE(xp, 0) INTO v_xp FROM profiles WHERE id = p_user_id;
  v_level := GREATEST(1, FLOOR(v_xp / 100.0)::integer + 1);
  RETURN jsonb_build_object(
    'xp', COALESCE(v_xp, 0),
    'level', v_level,
    'xp_to_next', (v_level * 100) - COALESCE(v_xp, 0),
    'progress_pct', ROUND((COALESCE(v_xp, 0) % 100)::numeric, 1)
  );
END; $$;
