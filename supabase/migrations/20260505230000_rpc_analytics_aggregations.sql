BEGIN;

-- For club-analytics.js
CREATE OR REPLACE FUNCTION public.sum_chip_transactions(p_club_id uuid, p_type text, p_start timestamptz, p_end timestamptz DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total bigint;
BEGIN
    IF p_end IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_total FROM chip_transactions WHERE club_id = p_club_id AND transaction_type = p_type AND created_at >= p_start AND created_at < p_end;
    ELSE
        SELECT COALESCE(SUM(amount), 0) INTO v_total FROM chip_transactions WHERE club_id = p_club_id AND transaction_type = p_type AND created_at >= p_start;
    END IF;
    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_chip_summary(p_club_id uuid, p_type text, p_days int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(day_str, total_amount) INTO v_result
    FROM (
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day_str, COALESCE(SUM(amount), 0) AS total_amount
        FROM chip_transactions
        WHERE club_id = p_club_id AND transaction_type = p_type AND created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY day_str
    ) sub;
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unique_players_24h(p_club_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count bigint;
BEGIN
    SELECT COUNT(DISTINCT player_id) INTO v_count FROM (
        SELECT from_user_id AS player_id FROM chip_transactions WHERE club_id = p_club_id AND transaction_type IN ('table_win', 'table_loss', 'rake') AND created_at >= NOW() - INTERVAL '24 hours' AND from_user_id IS NOT NULL
        UNION
        SELECT to_user_id AS player_id FROM chip_transactions WHERE club_id = p_club_id AND transaction_type IN ('table_win', 'table_loss', 'rake') AND created_at >= NOW() - INTERVAL '24 hours' AND to_user_id IS NOT NULL
    ) sub;
    RETURN v_count;
END;
$$;

-- For agent-analytics.js
CREATE OR REPLACE FUNCTION public.sum_agent_commissions(p_club_id uuid, p_agent_id uuid, p_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total bigint; v_paid bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total FROM commission_history WHERE club_id = p_club_id AND agent_id = p_agent_id AND created_at >= p_start;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM commission_history WHERE club_id = p_club_id AND agent_id = p_agent_id AND status = 'paid' AND created_at >= p_start;
    RETURN jsonb_build_object('total', v_total, 'paid', v_paid);
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_agent_volume(p_club_id uuid, p_agent_id uuid, p_start timestamptz)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total FROM action_audit_logs WHERE club_id = p_club_id AND user_id = p_agent_id AND created_at >= p_start;
    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_commission_summary(p_club_id uuid, p_agent_id uuid, p_days int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(day_str, total_amount) INTO v_result
    FROM (
        SELECT to_char(created_at, 'YYYY-MM-DD') AS day_str, COALESCE(SUM(amount), 0) AS total_amount
        FROM commission_history
        WHERE club_id = p_club_id AND agent_id = p_agent_id AND created_at >= NOW() - (p_days || ' days')::interval
        GROUP BY day_str
    ) sub;
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- For gift.js
CREATE OR REPLACE FUNCTION public.sum_diamond_transactions(p_user_id uuid, p_types text[], p_start timestamptz)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total FROM diamond_transactions WHERE user_id = p_user_id AND transaction_type = ANY(p_types) AND created_at >= p_start;
    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_anti_farming_ips(p_ip text, p_start timestamptz)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_total bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total FROM anti_farming_ips WHERE ip_address = p_ip AND created_at >= p_start;
    RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sum_chip_transactions(uuid, text, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_chip_summary(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unique_players_24h(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_agent_commissions(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_agent_volume(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_commission_summary(uuid, uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_diamond_transactions(uuid, text[], timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_anti_farming_ips(text, timestamptz) TO authenticated, service_role;

COMMIT;
