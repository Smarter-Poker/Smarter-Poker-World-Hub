-- =====================================================================
-- Pass 25b: carve out the token-redeem path in the members self-insert
-- trigger so legitimate invite-token redemption can insert approved
-- members on private groups.
--
-- Pattern: same as `app.hg_self_checkin_allowed` from the seat-claim
-- RPC. The RPC sets `app.hg_token_redeem_allowed='1'` for the duration
-- of its transaction; the trigger permits approved self-INSERT when
-- this GUC is set. Only our redeem RPC sets the flag, and the flag
-- lives in transaction-local session state, so other callers cannot
-- forge it unless they already have execute privilege on an RPC that
-- does — which means they're already trusted.
-- =====================================================================

-- Redeem RPC: set the GUC immediately before the INSERT path.
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

    IF v_group.owner_id = p_caller_user_id THEN
        RETURN jsonb_build_object(
            'success', true, 'via_token', v_token.id,
            'group_id', v_token.group_id, 'already_owner', true
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
                'success', true, 'via_token', v_token.id,
                'group_id', v_token.group_id,
                'already_member', true, 'member_status', 'approved'
            );
        ELSIF v_existing.status IN ('pending', 'declined') THEN
            IF v_token.max_uses IS NOT NULL
               AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
                RAISE EXCEPTION 'TOKEN_EXHAUSTED';
            END IF;
            v_already_state := v_existing.status;
            -- Updating via elevated flow: need trigger bypass
            PERFORM set_config('app.hg_token_redeem_allowed', '1', true);
            UPDATE commander_home_members
               SET status = 'approved', joined_at = NOW()
             WHERE id = v_existing.id;
            PERFORM set_config('app.hg_token_redeem_allowed', '', true);
            v_was_new := true;
        ELSE
            v_already_state := v_existing.status;
            v_was_new := false;
        END IF;
    ELSE
        IF v_token.max_uses IS NOT NULL
           AND COALESCE(v_token.use_count, 0) >= v_token.max_uses THEN
            RAISE EXCEPTION 'TOKEN_EXHAUSTED';
        END IF;
        -- Set GUC so the self-insert trigger allows this approved INSERT
        PERFORM set_config('app.hg_token_redeem_allowed', '1', true);
        INSERT INTO commander_home_members
            (group_id, user_id, role, status, joined_at, created_at)
        VALUES
            (v_token.group_id, p_caller_user_id, 'member', 'approved', NOW(), NOW());
        PERFORM set_config('app.hg_token_redeem_allowed', '', true);
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
        'success', true, 'via_token', v_token.id,
        'group_id', v_token.group_id, 'member_status', 'approved',
        'was_new', v_was_new, 'prior_status', v_already_state
    );
END;
$function$;

-- Trigger: honor the GUC as a bypass signal
CREATE OR REPLACE FUNCTION public.fn_enforce_home_members_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_private boolean;
  v_is_staff   boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Token-redeem path carveout: RPC set this flag immediately before
  -- INSERT/UPDATE and clears it immediately after.
  IF COALESCE(current_setting('app.hg_token_redeem_allowed', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  v_is_staff := fn_home_is_group_staff(auth.uid(), NEW.group_id);
  IF v_is_staff THEN RETURN NEW; END IF;

  IF NEW.user_id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM 'member' THEN
      NEW.role := 'member';
    END IF;

    SELECT is_private INTO v_is_private
      FROM commander_home_groups WHERE id = NEW.group_id;

    IF v_is_private THEN
      NEW.status := 'pending';
    ELSE
      IF COALESCE(NEW.status, '') NOT IN ('pending', 'approved') THEN
        NEW.status := 'pending';
      END IF;
    END IF;

    IF NEW.status = 'approved' AND NEW.joined_at IS NULL THEN
      NEW.joined_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
