-- =====================================================================
-- Pass 25: CRITICAL — commander_home_members self-INSERT integrity.
--
-- BUG:
--   M1 — any authenticated user can self-INSERT into any group with
--        status='approved' and instantly be a member. Private groups'
--        invite/approval flow is bypassed entirely.
--   M2 — also can self-set role='admin' (only blocked above by UNIQUE
--        collision with M1; if run standalone, succeeds).
--
--   Impact: unauthorized access to any private group's content,
--   moderation tools, and member list. This is an IDOR-class hole.
--
-- FIX:
--   BEFORE INSERT trigger (SECURITY DEFINER so it can read group state
--   that callers may not have SELECT on).
--
--   - Staff INSERTs (fn_home_is_group_staff=true) bypass — they're
--     already trusted to add members directly.
--   - Self-INSERT path: force role='member'; status depends on group:
--     * Public group (is_private=false): allow status='approved'
--       (open-join). Force status='pending' otherwise if caller tried
--       something weird.
--     * Private group: force status='pending'. Users cannot self-approve.
--   - Token-redeem path: RPC `redeem_home_group_invite_token` runs as
--     postgres/definer so the service-role bypass covers it cleanly.
-- =====================================================================

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
  -- Service-role / backend path bypass
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff insert: trusted, no sanitization
  v_is_staff := fn_home_is_group_staff(auth.uid(), NEW.group_id);
  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  -- Self-insert path (user_id = caller); any non-self non-staff INSERT
  -- will already be blocked by the INSERT policy.
  IF NEW.user_id = auth.uid() THEN
    -- Role must default to 'member' — no self-promotion
    IF NEW.role IS DISTINCT FROM 'member' THEN
      NEW.role := 'member';
    END IF;

    -- Status depends on group visibility
    SELECT is_private INTO v_is_private
      FROM commander_home_groups WHERE id = NEW.group_id;

    IF v_is_private THEN
      -- Private group: force pending (user must be approved by staff)
      NEW.status := 'pending';
    ELSE
      -- Public group: allow user-supplied status in ('pending','approved')
      IF COALESCE(NEW.status, '') NOT IN ('pending', 'approved') THEN
        NEW.status := 'pending';
      END IF;
    END IF;

    -- joined_at/created_at can only be set if status='approved'
    IF NEW.status = 'approved' AND NEW.joined_at IS NULL THEN
      NEW.joined_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_home_members_self_insert
  ON public.commander_home_members;
CREATE TRIGGER trg_enforce_home_members_self_insert
BEFORE INSERT ON public.commander_home_members
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_home_members_self_insert();
