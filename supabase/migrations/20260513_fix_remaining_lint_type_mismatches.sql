-- ═══════════════════════════════════════════════════════════════════════
-- 20260513_fix_remaining_lint_type_mismatches.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3
-- AUTHOR:      antigravity
-- AFFECTS:     functions
-- IRREVERSIBLE: no
--
-- WHY:
--   Supabase db lint flagged two functions for type mismatches that represent
--   actual runtime bugs:
--   1. fn_submit_bug_report_to_admin: called fn_get_or_create_conversation with
--      2 arguments (now dropped) and expected a UUID return (now returns JSONB).
--      If triggered, this would crash the bug reporter.
--   2. fn_check_anti_farming_gift_cap: assigned EXTRACT(DAY FROM interval)
--      which is numeric to an integer variable.
--
-- HOW:
--   - Update fn_submit_bug_report_to_admin to use 3 args and extract ->>'conversation_id'.
--   - Update fn_check_anti_farming_gift_cap to cast EXTRACT to ::int and remove
--     unused variables.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Fix fn_submit_bug_report_to_admin ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_submit_bug_report_to_admin(
    p_sender_id uuid,
    p_subject text,
    p_description text,
    p_priority text DEFAULT 'medium'::text,
    p_current_page text DEFAULT NULL::text,
    p_user_agent text DEFAULT NULL::text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id uuid;
    v_ticket_id uuid;
    v_conversation_id uuid;
    v_conversation_json jsonb;
    v_message_id uuid;
    v_content text;
BEGIN
    -- 1. Get the designated system admin (Smarter Poker Support)
    SELECT id INTO v_admin_id FROM public.profiles 
    WHERE username = 'smarterpoker' LIMIT 1;

    IF v_admin_id IS NULL THEN
        -- Fallback to first super_admin if the specific profile is missing
        SELECT id INTO v_admin_id FROM public.profiles 
        WHERE is_super_admin = true LIMIT 1;
    END IF;

    -- 2. Prevent race conditions: create the core ticket completely first.
    INSERT INTO public.live_help_tickets (
        user_id, subject, description, priority, status
    ) VALUES (
        p_sender_id,
        '[BUG] ' || p_subject,
        p_description || E'\n\n---\nPage: ' || COALESCE(p_current_page, 'unknown') || E'\nUser Agent: ' || COALESCE(p_user_agent, 'unknown') || E'\nReported: ' || now()::text,
        COALESCE(p_priority, 'medium'),
        'open'
    ) RETURNING id INTO v_ticket_id;

    -- 3. Only attempt real-time DM insertion if we have both users.
    IF p_sender_id IS NOT NULL AND v_admin_id IS NOT NULL AND p_sender_id != v_admin_id THEN

        -- Retrieve or provision a safe P2P direct message room (using the updated JSONB signature)
        v_conversation_json := public.fn_get_or_create_conversation(p_sender_id, v_admin_id, 'dm');
        v_conversation_id := (v_conversation_json->>'conversation_id')::uuid;

        -- Build formatted message content to look beautiful in the Messenger UI
        v_content := '🚨 **BUG REPORT** [' || upper(p_priority) || ']' || E'\n' ||
                     '**Subject:** ' || p_subject || E'\n' ||
                     '**Ticket:** BUG-' || upper(substr(v_ticket_id::text, 1, 8)) || E'\n\n' ||
                     p_description;

        -- Send via messaging system, which natively triggers the real-time pipeline event
        v_message_id := public.fn_send_message(v_conversation_id, p_sender_id, v_content);

    END IF;

    RETURN json_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', v_conversation_id,
        'admin_id', v_admin_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ── 2. Fix fn_check_anti_farming_gift_cap ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(
    p_sender_id uuid,
    p_amount integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_created_at timestamptz;
    v_account_age_days integer;
    v_is_trusted boolean;
    v_daily_sent integer;
    v_daily_limit integer := 500;
BEGIN
    SELECT created_at, is_trusted INTO v_created_at, v_is_trusted
    FROM public.profiles WHERE id = p_sender_id;

    -- Type mismatch fix: cast the EXTRACT numeric to int
    v_account_age_days := (EXTRACT(DAY FROM now() - v_created_at))::int;

    IF v_account_age_days < 7 AND NOT COALESCE(v_is_trusted, false) THEN
        RETURN json_build_object(
            'allowed', false,
            'reason', 'NEW_ACCOUNT_COOLDOWN',
            'lift_date', (v_created_at + interval '7 days')
        );
    END IF;

    IF NOT COALESCE(v_is_trusted, false) THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_daily_sent
        FROM public.diamond_transactions
        WHERE sender_id = p_sender_id
          AND type = 'gift'
          AND created_at >= now() - interval '24 hours';

        IF (v_daily_sent + p_amount) > v_daily_limit THEN
            RETURN json_build_object(
                'allowed', false,
                'reason', 'DAILY_GIFT_CAP_EXCEEDED',
                'limit', v_daily_limit,
                'current', v_daily_sent,
                'attempted', p_amount
            );
        END IF;
    END IF;

    RETURN json_build_object('allowed', true);
END;
$$;

COMMIT;
