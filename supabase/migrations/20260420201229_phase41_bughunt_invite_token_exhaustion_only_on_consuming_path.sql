-- =====================================================================
-- Pass 16b: refine my pass-16 fix. Gate TOKEN_EXHAUSTED only on paths
-- that actually consume a use. Re-redeems by an already-approved member
-- or by the owner should return a success no-op, not hit exhausted.
-- The FOR UPDATE lock is preserved so the race is still closed on the
-- consuming paths.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.redeem_home_group_invite_token(
  p_token text,
  p_caller_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET row_security TO 'off'
AS $function$
DECLARE
    v_token         RECORD;
    v_group         RECORD;
    v_existing      RECORD;
    v_was_new       boolean := false;
    v_already_state text;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() <> p_caller_user_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- FOR UPDATE: serialize concurrent redeems on this token row so the
    -- max_uses check and the use_count increment are atomic for the
    -- consuming paths.
    SELECT * INTO v_token FROM commander_home_invite_tokens
     WHERE token = p_token AND is_active = true
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
    IF v_token.expires_at IS NOT NULL AND v_token.expires_at < NOW() THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_token.group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

    -- Owner no-op: does NOT consume a token use
    IF v_group.owner_id = p_caller_user_id THEN
        RETURN jsonb_build_object(
            'success', true,
            'via_token', v_token.id,
            'group_id', v_token.group_id,
            'already_owner', true
        );
    END IF;

    SELECT * INTO v_existing
      FROM commander_home_members
     WHERE group_id = v_token.group_id AND user_id = p_caller_user_id;

    IF FOUND THEN
        IF v_existing.status = 'banned' THEN
            RAISE EXCEPTION 'BANNED'
                  USING HINT = 'you are banned from this group';
        ELSIF v_existing.status = 'approved' THEN
            -- No-op for already-approved member: do NOT burn a use
            RETURN jsonb_build_object(
                'success', true,
                'via_token', v_token.id,
                'group_id', v_token.group_id,
                'already_member', true,
                'member_status', 'approved'
            );
        ELSIF v_existing.status IN ('pending', 'declined') THEN
            -- Consuming path: check exhaustion before flipping
            IF v_token.max_uses IS NOT NULL
               AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
                RAISE EXCEPTION 'TOKEN_EXHAUSTED';
            END IF;
            v_already_state := v_existing.status;
            UPDATE commander_home_members
               SET status = 'approved',
                   joined_at = NOW()
             WHERE id = v_existing.id;
            v_was_new := true;
        ELSE
            -- Unknown/edge status: leave as is, no-op, don't consume
            v_already_state := v_existing.status;
            v_was_new := false;
        END IF;
    ELSE
        -- New-join path: check exhaustion before inserting
        IF v_token.max_uses IS NOT NULL
           AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
            RAISE EXCEPTION 'TOKEN_EXHAUSTED';
        END IF;
        INSERT INTO commander_home_members
            (group_id, user_id, role, status, joined_at, created_at)
        VALUES
            (v_token.group_id, p_caller_user_id, 'member', 'approved', NOW(), NOW());
        v_was_new := true;
    END IF;

    IF v_was_new THEN
        UPDATE commander_home_invite_tokens
           SET use_count    = COALESCE(use_count, 0) + 1,
               last_used_at = NOW()
         WHERE id = v_token.id;
    END IF;

    INSERT INTO commander_home_audit_log
        (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES
        (v_token.group_id, p_caller_user_id, 'member', p_caller_user_id,
         'joined_via_token',
         jsonb_build_object('token_id', v_token.id, 'was_new', v_was_new,
                            'prior_status', v_already_state));

    RETURN jsonb_build_object(
        'success', true,
        'via_token', v_token.id,
        'group_id', v_token.group_id,
        'member_status', 'approved',
        'was_new', v_was_new,
        'prior_status', v_already_state
    );
END;
$function$;
