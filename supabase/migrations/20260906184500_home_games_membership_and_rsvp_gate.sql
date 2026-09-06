-- ============================================================================
-- HOME GAMES EMERGENCY GATE: MEMBERSHIP + RSVP BOUNDARY
-- Tier 3 / security-sensitive / guarded migration
-- ============================================================================
--
-- This migration is source-only until an authenticated Supabase operator runs
-- it. It intentionally does not trust club_code as a secret: club_code is a
-- public share/discovery identifier. A private group's club_code may create a
-- pending request, but only its non-public invite_code may qualify for direct
-- approval when requires_approval is false.
--
-- Historical audit limitation:
-- commander_home_join_attempts records success/failure but not whether a
-- successful attempt used club_code or invite_code. Existing approved rows
-- therefore cannot be automatically classified without risking demotion of
-- members a host approved legitimately. The preflight emits the size of that
-- review population. Operators can inspect it with:
--
--   SELECT m.id, m.group_id, m.user_id, m.created_at, m.joined_at
--     FROM public.commander_home_members m
--     JOIN public.commander_home_groups g ON g.id = m.group_id
--    WHERE g.is_private
--      AND COALESCE(g.requires_approval, true)
--      AND m.status = 'approved'
--      AND m.role = 'member'
--      AND m.user_id <> g.owner_id
--    ORDER BY m.created_at DESC;
--
-- Automatic data remediation performed here:
--   1. Rotate invite_code when it overlaps the already-public club_code.
--   2. Quarantine active RSVPs belonging to banned/declined memberships.
-- Both are intentionally irreversible security actions. Never restore an old
-- exposed invite credential or an ineligible active RSVP during rollback.

BEGIN;

-- --------------------------------------------------------------------------
-- PREFLIGHT: abort before mutation if the audited schema/function has drifted.
-- --------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_join_oid oid;
  v_join_def text;
  v_review_count bigint;
  v_overlap_count bigint;
BEGIN
  IF to_regclass('public.commander_home_groups') IS NULL
     OR to_regclass('public.commander_home_members') IS NULL
     OR to_regclass('public.commander_home_games') IS NULL
     OR to_regclass('public.commander_home_rsvps') IS NULL
     OR to_regclass('public.commander_home_join_attempts') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: required Home Games tables are missing';
  END IF;

  IF to_regrole('anon') IS NULL
     OR to_regrole('authenticated') IS NULL
     OR to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: expected Supabase roles are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'commander_home_groups'
       AND column_name = 'settings'
       AND data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: commander_home_groups.settings jsonb is missing';
  END IF;

  v_join_oid := to_regprocedure('public.join_home_group(uuid,uuid,text)');
  IF v_join_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: join_home_group(uuid,uuid,text) is missing';
  END IF;

  SELECT pg_get_functiondef(v_join_oid) INTO v_join_def;
  IF position('p_invite_code = v_group.invite_code OR p_invite_code = v_group.club_code' IN v_join_def) = 0
     OR position('WHEN v_group.is_private THEN ''approved''' IN v_join_def) = 0 THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: join_home_group drifted from the audited vulnerable definition; re-audit before applying';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_hg_enforce_rsvp_membership_state'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: RSVP membership trigger already exists outside this migration';
  END IF;

  SELECT count(*) INTO v_overlap_count
    FROM public.commander_home_groups
   WHERE invite_code IS NOT NULL
     AND club_code IS NOT NULL
     AND upper(btrim(invite_code)) = upper(btrim(club_code));

  SELECT count(*) INTO v_review_count
    FROM public.commander_home_members m
    JOIN public.commander_home_groups g ON g.id = m.group_id
   WHERE g.is_private
     AND COALESCE(g.requires_approval, true)
     AND m.status = 'approved'
     AND m.role = 'member'
     AND m.user_id <> g.owner_id;

  RAISE NOTICE 'HOME_GAMES_AUDIT: % overlapping invite/share credentials will be rotated', v_overlap_count;
  RAISE WARNING 'HOME_GAMES_AUDIT: % historical private approved member rows require provenance review', v_review_count;
END;
$preflight$;

-- Rotate the only demonstrably exposed secret condition: an invite credential
-- equal to a public share code. A UNIQUE collision aborts the transaction.
UPDATE public.commander_home_groups
   SET invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
       updated_at = now()
 WHERE invite_code IS NOT NULL
   AND club_code IS NOT NULL
   AND upper(btrim(invite_code)) = upper(btrim(club_code));

-- --------------------------------------------------------------------------
-- JOIN GATE
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_home_group(
  p_group_id uuid,
  p_caller_user_id uuid,
  p_invite_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_group public.commander_home_groups%ROWTYPE;
  v_existing public.commander_home_members%ROWTYPE;
  v_new_status text;
  v_new_id uuid;
  v_failed_attempts integer;
  v_submitted_code text;
  v_code_kind text;
  v_allow_declined_re_request boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_caller_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_group
    FROM public.commander_home_groups
   WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  IF NOT coalesce(v_group.is_active, false) THEN RAISE EXCEPTION 'GROUP_INACTIVE'; END IF;
  IF v_group.owner_id = p_caller_user_id THEN RAISE EXCEPTION 'ALREADY_OWNER'; END IF;

  v_submitted_code := upper(btrim(p_invite_code));

  IF coalesce(v_group.is_private, true) THEN
    IF nullif(v_submitted_code, '') IS NULL THEN
      RAISE EXCEPTION 'INVITE_CODE_REQUIRED';
    END IF;

    SELECT count(*) INTO v_failed_attempts
      FROM public.commander_home_join_attempts
     WHERE user_id = p_caller_user_id
       AND succeeded = false
       AND attempted_at > now() - interval '1 hour';

    IF v_failed_attempts >= 10 THEN
      INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
      VALUES (p_caller_user_id, p_group_id, false);
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RATE_LIMITED',
        'hint', 'Too many failed invite-code attempts. Try again in 1 hour.'
      );
    END IF;

    v_code_kind := CASE
      WHEN v_group.invite_code IS NOT NULL
       AND upper(btrim(v_group.invite_code)) = v_submitted_code THEN 'invite'
      WHEN v_group.club_code IS NOT NULL
       AND upper(btrim(v_group.club_code)) = v_submitted_code THEN 'share'
      ELSE NULL
    END;

    IF v_code_kind IS NULL THEN
      INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
      VALUES (p_caller_user_id, p_group_id, false);
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_INVITE_CODE');
    END IF;
  END IF;

  SELECT * INTO v_existing
    FROM public.commander_home_members
   WHERE group_id = p_group_id
     AND user_id = p_caller_user_id
   FOR UPDATE;

  IF FOUND THEN
    CASE v_existing.status
      WHEN 'approved' THEN
        INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
        VALUES (p_caller_user_id, p_group_id, true);
        RETURN jsonb_build_object(
          'success', true,
          'already_member', true,
          'status', 'approved',
          'role', v_existing.role,
          'member_id', v_existing.id
        );
      WHEN 'pending' THEN
        INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
        VALUES (p_caller_user_id, p_group_id, true);
        RETURN jsonb_build_object(
          'success', true,
          'already_pending', true,
          'status', 'pending',
          'role', v_existing.role,
          'member_id', v_existing.id
        );
      WHEN 'banned' THEN
        INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
        VALUES (p_caller_user_id, p_group_id, false);
        RETURN jsonb_build_object(
          'success', false,
          'error', 'BANNED',
          'hint', 'user is banned from this group'
        );
      WHEN 'declined' THEN
        -- Exact JSON boolean only. The string "true" is not an opt-in.
        v_allow_declined_re_request := coalesce(
          v_group.settings -> 'allow_declined_re_request' = 'true'::jsonb,
          false
        );
        IF NOT v_allow_declined_re_request THEN
          INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
          VALUES (p_caller_user_id, p_group_id, false);
          RETURN jsonb_build_object(
            'success', false,
            'error', 'DECLINED',
            'hint', 'the host has not enabled a new membership request'
          );
        END IF;

        UPDATE public.commander_home_members
           SET status = 'pending',
               joined_at = NULL
         WHERE id = v_existing.id;
        INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
        VALUES (p_caller_user_id, p_group_id, true);
        RETURN jsonb_build_object(
          'success', true,
          're_requested', true,
          'status', 'pending',
          'role', v_existing.role,
          'member_id', v_existing.id,
          'requires_approval', true
        );
      ELSE
        RAISE EXCEPTION 'MEMBERSHIP_STATE_INVALID';
    END CASE;
  END IF;

  -- Public share identifiers never approve a private membership. Only a
  -- secret invite can qualify, and the group's approval setting still wins.
  v_new_status := CASE
    WHEN coalesce(v_group.requires_approval, true) THEN 'pending'
    WHEN coalesce(v_group.is_private, true) AND v_code_kind = 'share' THEN 'pending'
    ELSE 'approved'
  END;

  INSERT INTO public.commander_home_members
    (group_id, user_id, role, status, joined_at, created_at)
  VALUES
    (p_group_id, p_caller_user_id, 'member', v_new_status,
     CASE WHEN v_new_status = 'approved' THEN now() ELSE NULL END,
     now())
  RETURNING id INTO v_new_id;

  INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
  VALUES (p_caller_user_id, p_group_id, true);

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'role', 'member',
    'member_id', v_new_id,
    'requires_approval', v_new_status = 'pending'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.join_home_group(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_home_group(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.join_home_group(uuid, uuid, text) IS
  'Home Games emergency gate: club_code is public/share-only, invite_code is secret, declined retries require an exact host opt-in.';

-- --------------------------------------------------------------------------
-- RSVP GATE
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hg_enforce_rsvp_membership_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_group_id uuid;
  v_owner_id uuid;
  v_host_id uuid;
  v_membership_status text;
BEGIN
  SELECT g.group_id, h.owner_id, g.host_id
    INTO v_group_id, v_owner_id, v_host_id
    FROM public.commander_home_games g
    JOIN public.commander_home_groups h ON h.id = g.group_id
   WHERE g.id = NEW.game_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RSVP_GAME_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  -- Anyone may clear their own stale RSVP; no ineligible user may retain or
  -- create an active yes/maybe/waitlist RSVP.
  IF NEW.response = 'no' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = v_owner_id OR NEW.user_id = v_host_id THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_membership_status
    FROM public.commander_home_members
   WHERE group_id = v_group_id
     AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RSVP_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_membership_status = 'banned' THEN
    RAISE EXCEPTION 'RSVP_MEMBERSHIP_BANNED' USING ERRCODE = '42501';
  END IF;
  IF v_membership_status = 'declined' THEN
    RAISE EXCEPTION 'RSVP_MEMBERSHIP_DECLINED' USING ERRCODE = '42501';
  END IF;
  IF v_membership_status NOT IN ('approved', 'pending') THEN
    RAISE EXCEPTION 'RSVP_MEMBERSHIP_INVALID' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hg_enforce_rsvp_membership_state() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_hg_enforce_rsvp_membership_state() IS
  'Rejects active Home Games RSVPs without an approved/pending membership and rejects banned/declined members.';

-- Quarantine ineligible active rows before installing the invariant. This is
-- an auditable security correction, not a reversible product-state change.
DO $quarantine$
DECLARE
  v_quarantined_count bigint;
BEGIN
  UPDATE public.commander_home_rsvps r
     SET response = 'no',
         is_confirmed = false,
         seat_number = NULL,
         updated_at = now()
   WHERE r.response IN ('yes', 'maybe', 'waitlist')
     AND EXISTS (
       SELECT 1
         FROM public.commander_home_games game
         JOIN public.commander_home_members member
           ON member.group_id = game.group_id
          AND member.user_id = r.user_id
        WHERE game.id = r.game_id
          AND member.status IN ('banned', 'declined')
     );
  GET DIAGNOSTICS v_quarantined_count = ROW_COUNT;
  RAISE NOTICE 'HOME_GAMES_AUDIT: quarantined % banned/declined active RSVP rows', v_quarantined_count;
END;
$quarantine$;

CREATE TRIGGER trg_hg_enforce_rsvp_membership_state
BEFORE INSERT OR UPDATE ON public.commander_home_rsvps
FOR EACH ROW
EXECUTE FUNCTION public.fn_hg_enforce_rsvp_membership_state();

NOTIFY pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- POST-ASSERT: any failure rolls the entire migration transaction back.
-- --------------------------------------------------------------------------
DO $postassert$
DECLARE
  v_join_oid oid := to_regprocedure('public.join_home_group(uuid,uuid,text)');
  v_join_def text;
  v_trigger_def text;
BEGIN
  IF v_join_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: join_home_group is missing';
  END IF;
  SELECT pg_get_functiondef(v_join_oid) INTO v_join_def;

  IF position('v_code_kind = ''share''' IN v_join_def) = 0
     OR position('allow_declined_re_request' IN v_join_def) = 0
     OR position('p_invite_code = v_group.invite_code OR p_invite_code = v_group.club_code' IN v_join_def) > 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: secure join semantics are not installed';
  END IF;

  IF has_function_privilege('anon', 'public.join_home_group(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: anon can execute join_home_group';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.join_home_group(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: authenticated cannot execute join_home_group';
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'commander_home_rsvps'
     AND t.tgname = 'trg_hg_enforce_rsvp_membership_state'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';

  IF v_trigger_def IS NULL
     OR position('fn_hg_enforce_rsvp_membership_state' IN v_trigger_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: RSVP membership trigger is not enabled';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.commander_home_groups
     WHERE invite_code IS NOT NULL
       AND club_code IS NOT NULL
       AND upper(btrim(invite_code)) = upper(btrim(club_code))
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: an invite credential still overlaps a public share code';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.commander_home_rsvps r
      JOIN public.commander_home_games game ON game.id = r.game_id
      JOIN public.commander_home_members member
        ON member.group_id = game.group_id
       AND member.user_id = r.user_id
     WHERE r.response IN ('yes', 'maybe', 'waitlist')
       AND member.status IN ('banned', 'declined')
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: an ineligible active RSVP remains';
  END IF;
END;
$postassert$;

COMMIT;

-- --------------------------------------------------------------------------
-- ROLLBACK / RECOVERY PLAN (run only as a new reviewed migration)
-- --------------------------------------------------------------------------
-- Before commit: any exception above rolls back every statement atomically.
-- After commit, use a forward recovery migration:
--
--   DROP TRIGGER IF EXISTS trg_hg_enforce_rsvp_membership_state
--     ON public.commander_home_rsvps;
--   DROP FUNCTION IF EXISTS public.fn_hg_enforce_rsvp_membership_state();
--
-- Keep the hardened join_home_group definition in place. Restoring the prior
-- function would knowingly re-enable approval through a public club_code and
-- unrestricted declined retries. Restore function grants only if an access
-- incident requires it, and never grant EXECUTE to anon.
--
-- Rotated invite credentials and quarantined banned/declined RSVPs are not
-- restored. Hosts can issue new invite credentials or re-approve membership
-- through normal audited workflows after the incident is resolved.
