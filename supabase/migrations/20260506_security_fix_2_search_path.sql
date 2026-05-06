-- ============================================================
-- SECURITY FIX 2: Mutable search_path in SECURITY DEFINER functions
-- Addresses: function_search_path_mutable (14 functions)
-- Fix: Add SET search_path = '' to each function to pin it.
-- Date: 2026-05-06
-- ============================================================

-- 1. sum_agent_volume
CREATE OR REPLACE FUNCTION public.sum_agent_volume(p_club_id uuid, p_agent_id uuid, p_start timestamp with time zone)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total
    FROM public.action_audit_logs
    WHERE club_id = p_club_id AND user_id = p_agent_id AND created_at >= p_start;
    RETURN v_total;
END;
$function$;

-- 2. get_daily_chip_summary
CREATE OR REPLACE FUNCTION public.get_daily_chip_summary(p_club_id uuid, p_type text, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(day_str, total_amount) INTO v_result
    FROM (
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day_str, COALESCE(SUM(amount), 0) AS total_amount
        FROM public.chip_transactions
        WHERE club_id = p_club_id AND transaction_type = p_type AND created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY day_str
    ) sub;
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

-- 3. get_daily_commission_summary
CREATE OR REPLACE FUNCTION public.get_daily_commission_summary(p_club_id uuid, p_agent_id uuid, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(day_str, total_amount) INTO v_result
    FROM (
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day_str, COALESCE(SUM(amount), 0) AS total_amount
        FROM public.commission_history
        WHERE club_id = p_club_id AND agent_id = p_agent_id AND created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY day_str
    ) sub;
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

-- 4. get_max_player_number
CREATE OR REPLACE FUNCTION public.get_max_player_number()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT MAX(player_number::BIGINT)
    FROM public.profiles
    WHERE player_number IS NOT NULL
      AND player_number ~ '^\d+$'
$function$;

-- 5. get_unique_players_24h
CREATE OR REPLACE FUNCTION public.get_unique_players_24h(p_club_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_count bigint;
BEGIN
    SELECT COUNT(DISTINCT player_id) INTO v_count FROM (
        SELECT from_user_id AS player_id FROM public.chip_transactions
        WHERE club_id = p_club_id AND transaction_type IN ('table_win', 'table_loss', 'rake')
          AND created_at >= NOW() - INTERVAL '24 hours' AND from_user_id IS NOT NULL
        UNION
        SELECT to_user_id AS player_id FROM public.chip_transactions
        WHERE club_id = p_club_id AND transaction_type IN ('table_win', 'table_loss', 'rake')
          AND created_at >= NOW() - INTERVAL '24 hours' AND to_user_id IS NOT NULL
    ) sub;
    RETURN v_count;
END;
$function$;

-- 6. is_system_user
CREATE OR REPLACE FUNCTION public.is_system_user(email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT email IS NULL
      OR email LIKE '%@hydra.bot'
      OR email LIKE '%@probe.smarter.poker'
      OR email LIKE '%@probe.smarter.local'
      OR email LIKE '%.invalid'
      OR email LIKE '%@example.com'
      OR email LIKE '%@example.org'
      OR email LIKE '%@example.net'
      OR email LIKE '%@test.local'
      OR email LIKE 'horse_%@%'
      OR email LIKE 'samson-%@%';
$function$;

-- 7. sum_agent_commissions
CREATE OR REPLACE FUNCTION public.sum_agent_commissions(p_club_id uuid, p_agent_id uuid, p_start timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_total bigint; v_paid bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.commission_history
    WHERE club_id = p_club_id AND agent_id = p_agent_id AND created_at >= p_start;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.commission_history
    WHERE club_id = p_club_id AND agent_id = p_agent_id AND status = 'paid' AND created_at >= p_start;

    RETURN jsonb_build_object('total', v_total, 'paid', v_paid);
END;
$function$;

-- 8. sum_anti_farming_ips
CREATE OR REPLACE FUNCTION public.sum_anti_farming_ips(p_ip text, p_start timestamp with time zone)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.anti_farming_ips
    WHERE ip_address = p_ip AND created_at >= p_start;
    RETURN v_total;
END;
$function$;

-- 9. sum_chip_transactions
CREATE OR REPLACE FUNCTION public.sum_chip_transactions(
    p_club_id uuid,
    p_type text,
    p_start timestamp with time zone,
    p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_total bigint;
BEGIN
    IF p_end IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_total
        FROM public.chip_transactions
        WHERE club_id = p_club_id AND transaction_type = p_type
          AND created_at >= p_start AND created_at < p_end;
    ELSE
        SELECT COALESCE(SUM(amount), 0) INTO v_total
        FROM public.chip_transactions
        WHERE club_id = p_club_id AND transaction_type = p_type AND created_at >= p_start;
    END IF;
    RETURN v_total;
END;
$function$;

-- 10. sum_diamond_transactions
CREATE OR REPLACE FUNCTION public.sum_diamond_transactions(p_user_id uuid, p_types text[], p_start timestamp with time zone)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.diamond_transactions
    WHERE user_id = p_user_id AND transaction_type = ANY(p_types) AND created_at >= p_start;
    RETURN v_total;
END;
$function$;

-- 11-14. fn_pio_options_from_solver, fn_chart_options_from_memory, fn_normalize_chart_value, fn_tables_sync_rit
-- These need their full bodies — fetch and add search_path only
ALTER FUNCTION public.fn_pio_options_from_solver SET search_path = '';
ALTER FUNCTION public.fn_chart_options_from_memory SET search_path = '';
ALTER FUNCTION public.fn_normalize_chart_value SET search_path = '';
ALTER FUNCTION public.fn_tables_sync_rit SET search_path = '';
