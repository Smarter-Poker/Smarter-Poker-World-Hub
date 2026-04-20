-- =====================================================================
-- Pass 16: fix TOCTOU race in redeem_home_group_invite_token.
--
-- BUG:
--   The original flow:
--     1. SELECT token, read v_token.use_count
--     2. Check v_token.use_count >= v_token.max_uses → raise TOKEN_EXHAUSTED
--     3. ... member work ...
--     4. UPDATE set use_count = use_count + 1
--
--   Two concurrent redeems when use_count = max_uses - 1:
--     - Both pass step 2 (both read use_count = max_uses - 1)
--     - Both execute step 4 sequentially → use_count = max_uses + 1
--   One extra over-use permitted. For limited-seat invites this breaks
--   the max_uses contract.
--
-- FIX:
--   Add FOR UPDATE to the initial token SELECT. Concurrent redeems
--   serialize on the row lock. The second caller re-reads the row after
--   the first commits, sees the incremented use_count, and fails the
--   TOKEN_EXHAUSTED check correctly.
--
--   Also close a minor issue: the "already_member" / "already_owner"
--   early returns were issuing audit log entries BEFORE reaching the
--   audit log INSERT — they return before the final INSERT, so no audit
--   was actually written. That's fine. But the failure/no-op cases
--   (banned, pending→approved, etc.) currently don't always log cleanly.
--   Not critical — just cleaning the structure.
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

    -- FOR UPDATE: serialize concurrent redeems on this token row.
    -- Second caller waits for first to commit, then re-reads the
    -- updated use_count, correctly hitting TOKEN_EXHAUSTED if the
    -- first caller consumed the last use.
    SELECT * INTO v_token FROM commander_home_invite_tokens
     WHERE token = p_token AND is_active = true
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
    IF v_token.expires_at IS NOT NULL AND v_token.expires_at < NOW() THEN
        RAISE EXCEPTION 'TOKEN_EXPIRED';
    END IF;
    IF v_token.max_uses IS NOT NULL
       AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
        RAISE EXCEPTION 'TOKEN_EXHAUSTED';
    END IF;

    SELECT * INTO v_group FROM commander_home_groups WHERE id = v_token.group_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
    IF NOT v_group.is_active THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;

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
            RETURN jsonb_build_object(
                'success', true,
                'via_token', v_token.id,
                'group_id', v_token.group_id,
                'already_member', true,
                'member_status', 'approved'
            );
        ELSIF v_existing.status IN ('pending', 'declined') THEN
            v_already_state := v_existing.status;
            UPDATE commander_home_members
               SET status = 'approved',
                   joined_at = NOW()
             WHERE id = v_existing.id;
            v_was_new := true;
        ELSE
            v_already_state := v_existing.status;
            v_was_new := false;
        END IF;
    ELSE
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
