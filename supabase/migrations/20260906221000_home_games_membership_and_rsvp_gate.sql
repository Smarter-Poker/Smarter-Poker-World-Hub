-- ============================================================================
-- HOME GAMES EMERGENCY GATE: MEMBERSHIP + RSVP BOUNDARY
-- Migration: 20260906221000_home_games_membership_and_rsvp_gate.sql
-- Tier 3 / security-sensitive / guarded migration
-- ============================================================================
--
-- Apply this migration only through the repository's guarded database runner.
-- It intentionally does not trust club_code as a secret: club_code is a
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
--   2. Quarantine current/upcoming active RSVPs without an eligible membership
--      (including missing, banned, declined, or unknown membership states).
--   3. Keep that invariant true when membership is later declined, banned,
--      or removed, without rewriting completed-game attendance history.
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
  v_manage_oid oid;
  v_manage_def text;
  v_conversation_oid oid;
  v_conversation_def text;
  v_claim_oid oid;
  v_claim_def text;
  v_capacity_oid oid;
  v_capacity_def text;
  v_existing_index_def text;
  v_existing_trigger_def text;
  v_capacity_trigger_def text;
  v_review_count bigint;
  v_overlap_count bigint;
BEGIN
  IF to_regclass('public.commander_home_groups') IS NULL
     OR to_regclass('public.commander_home_members') IS NULL
     OR to_regclass('public.commander_home_games') IS NULL
     OR to_regclass('public.commander_home_rsvps') IS NULL
     OR to_regclass('public.commander_home_join_attempts') IS NULL
     OR to_regclass('public.commander_home_audit_log') IS NULL
     OR to_regclass('public.commander_home_game_tables') IS NULL
     OR to_regclass('public.commander_home_seat_reservations') IS NULL
     OR to_regclass('public.commander_home_seats') IS NULL
     OR to_regclass('public.social_pages') IS NULL THEN
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

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'commander_home_members'
       AND column_name = 'can_host'
       AND data_type = 'boolean'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'commander_home_members'
       AND column_name = 'is_roster_only'
       AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: required Home Games member identity/hosting columns are missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('social_pages', 'linked_entity_id', 'text'),
        ('social_pages', 'linked_entity_type', 'text'),
        ('social_pages', 'page_type', 'text'),
        ('social_pages', 'is_public', 'bool'),
        ('commander_home_games', 'scheduled_date', 'date'),
        ('commander_home_games', 'start_time', 'time'),
        ('commander_home_games', 'rsvp_closes_at', 'timestamptz'),
        ('commander_home_games', 'rsvps_closed', 'bool'),
        ('commander_home_games', 'allow_guests', 'bool'),
        ('commander_home_games', 'guest_limit', 'int4'),
        ('commander_home_rsvps', 'bringing_guests', 'int4'),
        ('commander_home_rsvps', 'guest_names', '_text'),
        ('commander_home_rsvps', 'message', 'text')
      ) AS expected(table_name, column_name, udt_name)
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = expected.table_name
          AND c.column_name = expected.column_name
          AND c.udt_name = expected.udt_name
     )
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: public seat-request column contract drifted';
  END IF;

  IF to_regprocedure(
    'public.request_public_home_game_seat(uuid,uuid,uuid,integer,text[],text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: request_public_home_game_seat already exists outside this migration';
  END IF;

  v_join_oid := to_regprocedure('public.join_home_group(uuid,uuid,text)');
  IF v_join_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: join_home_group(uuid,uuid,text) is missing';
  END IF;

  SELECT pg_get_functiondef(v_join_oid) INTO v_join_def;
  IF md5(v_join_def) IS DISTINCT FROM '751dcefdaa47d088e6b952919a1e36c2' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: join_home_group drifted from the exact audited live definition (md5=%); re-audit before applying',
      md5(v_join_def);
  END IF;

  v_manage_oid := to_regprocedure('public.manage_home_group_member(uuid,uuid,text,uuid)');
  IF v_manage_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: manage_home_group_member(uuid,uuid,text,uuid) is missing';
  END IF;

  SELECT pg_get_functiondef(v_manage_oid) INTO v_manage_def;
  IF md5(v_manage_def) IS DISTINCT FROM '3d6ce5292248176e19b638a4e9ff2987' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: manage_home_group_member drifted from the exact audited live definition (md5=%); re-audit before applying',
      md5(v_manage_def);
  END IF;

  v_conversation_oid := to_regprocedure('public.fn_add_member_to_group_conversation()');
  IF v_conversation_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: fn_add_member_to_group_conversation() is missing';
  END IF;

  SELECT pg_get_functiondef(v_conversation_oid) INTO v_conversation_def;
  IF md5(v_conversation_def) IS DISTINCT FROM 'd6807093d02d838d7c0031742f2ca42a' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: fn_add_member_to_group_conversation drifted from the exact audited live definition (md5=%); re-audit before applying',
      md5(v_conversation_def);
  END IF;

  v_claim_oid := to_regprocedure('public.rpc_hg_host_claim_for_member(uuid,integer,uuid)');
  IF v_claim_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: rpc_hg_host_claim_for_member(uuid,integer,uuid) is missing';
  END IF;

  SELECT pg_get_functiondef(v_claim_oid) INTO v_claim_def;
  IF md5(v_claim_def) IS DISTINCT FROM 'ae78c2d52c92c6165e5d29d4cc9f6cfb' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: rpc_hg_host_claim_for_member drifted from the exact audited live definition (md5=%); re-audit before applying',
      md5(v_claim_def);
  END IF;

  v_capacity_oid := to_regprocedure('public.fn_hg_enforce_rsvp_capacity()');
  IF v_capacity_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: fn_hg_enforce_rsvp_capacity() is missing';
  END IF;

  SELECT pg_get_functiondef(v_capacity_oid) INTO v_capacity_def;
  IF md5(v_capacity_def) IS DISTINCT FROM 'a3ca80ed46f386c8a0f65fbaad97d4b4' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: fn_hg_enforce_rsvp_capacity drifted from the exact audited live definition (md5=%)',
      md5(v_capacity_def);
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_capacity_trigger_def
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.commander_home_rsvps'::regclass
     AND t.tgname = 'trg_hg_enforce_rsvp_capacity'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';

  IF md5(v_capacity_trigger_def) IS DISTINCT FROM '589acb3ee9ba7bfc7b8a91f3274ec812' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: RSVP capacity trigger drifted from the exact audited live definition (md5=%)',
      md5(v_capacity_trigger_def);
  END IF;

  SELECT pg_get_indexdef(c.oid)
    INTO v_existing_index_def
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
   WHERE n.nspname = 'public'
     AND c.relname = 'commander_home_members_group_user_unique_active'
     AND i.indisvalid
     AND i.indisready
     AND i.indisunique;

  IF md5(v_existing_index_def) IS DISTINCT FROM '459998872d80b1c5b424928943350c42' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: active member identity index drifted from the exact audited live definition (md5=%)',
      md5(v_existing_index_def);
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_existing_trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'commander_home_members'
     AND t.tgname = 'trg_add_member_to_group_conversation'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';

  IF md5(v_existing_trigger_def) IS DISTINCT FROM '3182b3c3913935e4b42c2b9be140e9be' THEN
    RAISE EXCEPTION
      'PRECHECK_FAILED: member conversation trigger drifted from the exact audited live definition (md5=%)',
      md5(v_existing_trigger_def);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname IN (
       'trg_hg_enforce_rsvp_membership_state',
       'trg_hg_clear_ineligible_member_rsvps'
     )
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Home Games membership/RSVP trigger already exists outside this migration';
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
  IF auth.uid() IS NULL
     OR p_caller_user_id IS NULL
     OR auth.uid() <> p_caller_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  -- Serialize the same user's membership transition. The group-row lock below
  -- also pins the invite/privacy/owner configuration for the decision; joins
  -- to one group therefore serialize briefly while unrelated groups proceed.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_group_id::text),
    pg_catalog.hashtext(p_caller_user_id::text)
  );

  SELECT * INTO v_group
    FROM public.commander_home_groups
   WHERE id = p_group_id
   FOR UPDATE;
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
  ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_new_id;

  -- A concurrent legacy/direct insert can still win without participating in
  -- the advisory lock. Treat that as an idempotent replay and return the
  -- canonical stored state rather than leaking SQLSTATE 23505.
  IF v_new_id IS NULL THEN
    SELECT * INTO v_existing
      FROM public.commander_home_members
     WHERE group_id = p_group_id
       AND user_id = p_caller_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MEMBERSHIP_CONFLICT';
    END IF;

    INSERT INTO public.commander_home_join_attempts(user_id, group_id, succeeded)
    VALUES (
      p_caller_user_id,
      p_group_id,
      v_existing.status IN ('approved', 'pending')
    );

    IF v_existing.status = 'approved' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_member', true,
        'concurrent_replay', true,
        'status', 'approved',
        'role', v_existing.role,
        'member_id', v_existing.id,
        'requires_approval', false
      );
    END IF;

    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_pending', true,
        'concurrent_replay', true,
        'status', 'pending',
        'role', v_existing.role,
        'member_id', v_existing.id,
        'requires_approval', true
      );
    END IF;

    IF v_existing.status = 'banned' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'BANNED',
        'hint', 'user is banned from this group'
      );
    END IF;

    IF v_existing.status = 'declined' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'DECLINED',
        'hint', 'the membership changed while this join was being processed'
      );
    END IF;

    RAISE EXCEPTION 'MEMBERSHIP_STATE_INVALID';
  END IF;

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
  'Home Games emergency gate: club_code is public/share-only, invite_code is secret, declined retries require an exact host opt-in, and concurrent joins return one canonical membership.';

-- Roster-only rows intentionally have no auth/profile identity. The existing
-- approval trigger otherwise tries to insert NEW.user_id (NULL) into the
-- NOT NULL messenger_participants.user_id column, aborting approve/unban before
-- the membership audit can be written. Preserve registered-member behavior and
-- make the trigger a no-op only for roster-only identities.
CREATE OR REPLACE FUNCTION public.fn_add_member_to_group_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_conv_id uuid; v_current_ids uuid[];
BEGIN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'approved' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.status = 'approved' OR NEW.status <> 'approved') THEN RETURN NEW; END IF;
    SELECT messenger_conversation_id INTO v_conv_id FROM commander_home_groups WHERE id = NEW.group_id;
    IF v_conv_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO messenger_participants (conversation_id, user_id, role, joined_at)
    VALUES (v_conv_id, NEW.user_id, CASE WHEN NEW.role IN ('owner','admin') THEN 'admin' ELSE 'member' END, NOW())
    ON CONFLICT DO NOTHING;
    SELECT participant_ids INTO v_current_ids FROM conversations WHERE id = v_conv_id;
    IF NOT (NEW.user_id = ANY(v_current_ids)) THEN
        UPDATE conversations SET participant_ids = array_append(participant_ids, NEW.user_id), updated_at = NOW() WHERE id = v_conv_id;
    END IF;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_add_member_to_group_conversation() IS
  'Adds approved registered members to the Home Games conversation; roster-only rows have no messenger identity and are skipped.';

-- --------------------------------------------------------------------------
-- AUDITED MEMBERSHIP MANAGEMENT
-- --------------------------------------------------------------------------
-- Compatibility contract: keep the original four argument names/signature.
-- Registered members are addressed by user_id. Roster-only members have no
-- user_id, so callers pass their membership row id in p_member_user_id.
CREATE OR REPLACE FUNCTION public.manage_home_group_member(
  p_group_id uuid,
  p_member_user_id uuid,
  p_action text,
  p_caller_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_group public.commander_home_groups%ROWTYPE;
  v_target public.commander_home_members%ROWTYPE;
  v_caller_role text;
  v_valid_actions text[] := ARRAY[
    'invite',
    'approve',
    'decline',
    'ban',
    'unban',
    'promote_admin',
    'demote_member',
    'grant_host',
    'revoke_host',
    'remove'
  ];
  v_active_games integer;
  v_before jsonb;
  v_after jsonb;
  v_audit_action text;
BEGIN
  IF auth.uid() IS NULL
     OR p_caller_user_id IS NULL
     OR auth.uid() <> p_caller_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_group_id IS NULL OR p_member_user_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_PARAMS';
  END IF;

  IF p_action IS NULL OR NOT (p_action = ANY(v_valid_actions)) THEN
    RAISE EXCEPTION 'INVALID_ACTION'
      USING HINT = 'action must be invite, approve, decline, ban, unban, promote_admin, demote_member, grant_host, revoke_host, or remove';
  END IF;

  -- Take the shared join/invite identity lock before the group-row lock. Both
  -- RPCs use this order, preventing a join-vs-invite lock inversion.
  IF p_action = 'invite' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(p_group_id::text),
      pg_catalog.hashtext(p_member_user_id::text)
    );
  END IF;

  SELECT * INTO v_group
    FROM public.commander_home_groups
   WHERE id = p_group_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF v_group.owner_id = p_caller_user_id THEN
    v_caller_role := 'owner';
  ELSE
    SELECT role INTO v_caller_role
      FROM public.commander_home_members
     WHERE group_id = p_group_id
       AND user_id = p_caller_user_id
       AND status = 'approved'
       AND role = 'admin'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOT_A_HOST';
    END IF;
  END IF;

  -- Admin invitations are membership mutations too. Keep creation and its
  -- audit record in this caller-authenticated transaction instead of allowing
  -- API routes to insert approved memberships through the service role.
  IF p_action = 'invite' THEN
    IF p_member_user_id = p_caller_user_id THEN
      RAISE EXCEPTION 'CANNOT_SELF_MANAGE'
        USING HINT = 'use join_home_group for self-join';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.commander_home_members
       WHERE group_id = p_group_id
         AND user_id = p_member_user_id
    ) THEN
      RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.commander_home_members (
      group_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    ) VALUES (
      p_group_id,
      p_member_user_id,
      'member',
      'approved',
      p_caller_user_id,
      now()
    )
    ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_target;

    IF v_target.id IS NULL THEN
      RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = '23505';
    END IF;

    v_after := jsonb_build_object(
      'status', v_target.status,
      'role', v_target.role,
      'can_host', coalesce(v_target.can_host, false),
      'joined_at', v_target.joined_at
    );

    INSERT INTO public.commander_home_audit_log
      (group_id, actor_id, target_type, target_id, action, metadata)
    VALUES (
      p_group_id,
      p_caller_user_id,
      'member',
      v_target.id,
      'member_invited',
      jsonb_build_object(
        'requested_action', p_action,
        'member_id', v_target.id,
        'member_user_id', v_target.user_id,
        'is_roster_only', false,
        'before', NULL,
        'after', v_after
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', p_action,
      'member_id', v_target.id,
      'member_user_id', v_target.user_id,
      'new_state', v_after
    );
  END IF;

  -- The registered identity wins in the vanishingly unlikely event that a
  -- user's UUID equals a roster-only membership UUID in the same group.
  SELECT m.* INTO v_target
    FROM public.commander_home_members m
   WHERE m.group_id = p_group_id
     AND (
       m.user_id = p_member_user_id
       OR (m.user_id IS NULL AND m.id = p_member_user_id)
     )
   ORDER BY CASE WHEN m.user_id = p_member_user_id THEN 0 ELSE 1 END
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
  END IF;

  IF v_target.user_id = p_caller_user_id THEN
    RAISE EXCEPTION 'CANNOT_SELF_MANAGE'
      USING HINT = 'use leave_home_group for self-exit';
  END IF;

  -- No member-management action can mutate the canonical owner row.
  IF v_target.user_id = v_group.owner_id OR v_target.role = 'owner' THEN
    RAISE EXCEPTION 'CANNOT_MODIFY_OWNER'
      USING HINT = 'use transfer_home_group_ownership to change the owner';
  END IF;

  IF v_caller_role = 'admin' THEN
    IF v_target.role = 'admin' THEN
      RAISE EXCEPTION 'ADMIN_CANNOT_MODIFY_PEER';
    END IF;
    IF p_action IN ('promote_admin', 'demote_member') THEN
      RAISE EXCEPTION 'OWNER_ONLY_ACTION'
        USING HINT = 'promote_admin and demote_member require owner';
    END IF;
  END IF;

  IF p_action IN ('grant_host', 'revoke_host')
     AND (v_target.status <> 'approved' OR v_target.role <> 'member') THEN
    RAISE EXCEPTION 'TARGET_NOT_APPROVED'
      USING HINT = 'hosting permission applies only to ordinary approved members';
  END IF;

  IF p_action = 'remove' AND v_target.user_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_games
      FROM public.commander_home_games
     WHERE group_id = p_group_id
       AND host_id = v_target.user_id
       AND status IN ('scheduled', 'confirmed', 'in_progress');
    IF v_active_games > 0 THEN
      RAISE EXCEPTION 'MEMBER_IS_ACTIVE_GAME_HOST'
        USING HINT = 'member hosts ' || v_active_games
          || ' active game(s); cancel or reassign them before removing';
    END IF;
  END IF;

  v_before := jsonb_build_object(
    'status', v_target.status,
    'role', v_target.role,
    'can_host', coalesce(v_target.can_host, false),
    'joined_at', v_target.joined_at
  );

  CASE p_action
    WHEN 'approve' THEN
      IF v_target.status <> 'pending' THEN
        RAISE EXCEPTION 'TARGET_NOT_PENDING'
          USING HINT = 'current status is ' || v_target.status;
      END IF;
      UPDATE public.commander_home_members
         SET status = 'approved',
             joined_at = coalesce(joined_at, now())
       WHERE id = v_target.id;
      v_audit_action := 'member_approved';

    WHEN 'decline' THEN
      IF v_target.status <> 'pending' THEN
        RAISE EXCEPTION 'TARGET_NOT_PENDING'
          USING HINT = 'current status is ' || v_target.status;
      END IF;
      UPDATE public.commander_home_members
         SET status = 'declined', can_host = false
       WHERE id = v_target.id;
      v_audit_action := 'member_declined';

    WHEN 'ban' THEN
      UPDATE public.commander_home_members
         SET status = 'banned', role = 'member', can_host = false
       WHERE id = v_target.id;
      v_audit_action := 'member_banned';

    WHEN 'unban' THEN
      IF v_target.status <> 'banned' THEN
        RAISE EXCEPTION 'TARGET_NOT_BANNED';
      END IF;
      UPDATE public.commander_home_members
         SET status = 'approved', can_host = false
       WHERE id = v_target.id;
      v_audit_action := 'member_unbanned';

    WHEN 'promote_admin' THEN
      IF v_target.status <> 'approved' THEN
        RAISE EXCEPTION 'TARGET_NOT_APPROVED';
      END IF;
      IF v_target.role = 'admin' THEN
        RAISE EXCEPTION 'ALREADY_ADMIN';
      END IF;
      UPDATE public.commander_home_members
         SET role = 'admin'
       WHERE id = v_target.id;
      v_audit_action := 'member_promoted_admin';

    WHEN 'demote_member' THEN
      IF v_target.role <> 'admin' THEN
        RAISE EXCEPTION 'TARGET_NOT_ADMIN';
      END IF;
      UPDATE public.commander_home_members
         SET role = 'member'
       WHERE id = v_target.id;
      v_audit_action := 'member_demoted';

    WHEN 'grant_host' THEN
      UPDATE public.commander_home_members
         SET can_host = true
       WHERE id = v_target.id;
      v_audit_action := 'member_host_granted';

    WHEN 'revoke_host' THEN
      UPDATE public.commander_home_members
         SET can_host = false
       WHERE id = v_target.id;
      v_audit_action := 'member_host_revoked';

    WHEN 'remove' THEN
      PERFORM set_config('app.hg_member_remove_allowed', '1', true);
      DELETE FROM public.commander_home_members WHERE id = v_target.id;
      PERFORM set_config('app.hg_member_remove_allowed', '', true);
      v_audit_action := 'member_removed';
  END CASE;

  IF p_action = 'remove' THEN
    v_after := jsonb_build_object('removed', true);
  ELSE
    SELECT jsonb_build_object(
      'status', status,
      'role', role,
      'can_host', coalesce(can_host, false),
      'joined_at', joined_at
    )
      INTO v_after
      FROM public.commander_home_members
     WHERE id = v_target.id;
  END IF;

  -- This insert is intentionally in the same transaction as the mutation.
  -- Audit failure therefore fails closed and rolls the member change back.
  INSERT INTO public.commander_home_audit_log
    (group_id, actor_id, target_type, target_id, action, metadata)
  VALUES (
    p_group_id,
    p_caller_user_id,
    'member',
    v_target.id,
    v_audit_action,
    jsonb_build_object(
      'requested_action', p_action,
      'member_id', v_target.id,
      'member_user_id', v_target.user_id,
      'is_roster_only', coalesce(v_target.is_roster_only, false),
      'before', v_before,
      'after', v_after
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'member_id', v_target.id,
    'member_user_id', v_target.user_id,
    'new_state', v_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_home_group_member(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_home_group_member(uuid, uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.manage_home_group_member(uuid, uuid, text, uuid) IS
  'Audited Home Games membership lifecycle. p_member_user_id accepts a registered user id or, only for a roster-only row, its membership id. grant_host/revoke_host are idempotent.';

-- --------------------------------------------------------------------------
-- HOST CLAIM GATE
-- --------------------------------------------------------------------------
-- The legacy RPC checked group identity but not membership state. That was
-- partially masked for registered users by the RSVP trigger, but roster-only
-- claims do not create an RSVP and could therefore reserve a banned member.
-- Lock and validate the canonical member row before either write path.
CREATE OR REPLACE FUNCTION public.rpc_hg_host_claim_for_member(
  p_table_id uuid,
  p_seat_number integer,
  p_member_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_table record;
  v_member record;
  v_reservation_id uuid;
  v_name_for_guest text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT t.id, t.game_id, t.status, t.max_seats, g.group_id, h.owner_id
    INTO v_table
    FROM public.commander_home_game_tables t
    JOIN public.commander_home_games g ON g.id = t.game_id
    JOIN public.commander_home_groups h ON h.id = g.group_id
   WHERE t.id = p_table_id
   FOR UPDATE OF t, h;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;
  IF v_table.status NOT IN ('open_for_rsvp', 'running') THEN
    RAISE EXCEPTION 'TABLE_NOT_CLAIMABLE';
  END IF;
  IF p_seat_number < 1 OR p_seat_number > v_table.max_seats THEN
    RAISE EXCEPTION 'SEAT_OUT_OF_BOUNDS';
  END IF;

  IF NOT public.fn_home_is_group_staff(v_user_id, v_table.group_id)
     AND v_table.owner_id <> v_user_id THEN
    RAISE EXCEPTION 'NOT_GROUP_STAFF';
  END IF;

  SELECT id, group_id, user_id, display_name, is_roster_only, status
    INTO v_member
    FROM public.commander_home_members
   WHERE id = p_member_id
   FOR UPDATE;
  IF v_member.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_member.group_id <> v_table.group_id THEN
    RAISE EXCEPTION 'MEMBER_WRONG_GROUP';
  END IF;
  IF v_member.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'MEMBER_NOT_APPROVED'
      USING ERRCODE = '42501',
            HINT = 'current membership status is ' || coalesce(v_member.status, 'NULL');
  END IF;

  IF coalesce(v_member.is_roster_only, false) THEN
    IF v_member.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'ROSTER_MEMBER_IDENTITY_INVALID';
    END IF;

    v_name_for_guest := v_member.display_name;
    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, member_id, guest_name,
       is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, NULL, p_member_id, v_name_for_guest,
            false, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;
  ELSE
    IF v_member.user_id IS NULL THEN
      RAISE EXCEPTION 'REGISTERED_MEMBER_IDENTITY_REQUIRED';
    END IF;

    INSERT INTO public.commander_home_seat_reservations
      (table_id, seat_number, user_id, member_id,
       is_guest, claimed_by_user_id, status)
    VALUES (p_table_id, p_seat_number, v_member.user_id, p_member_id,
            false, v_user_id, 'reserved')
    RETURNING id INTO v_reservation_id;

    INSERT INTO public.commander_home_rsvps
      (game_id, user_id, response, seat_number, is_confirmed, responded_at)
    VALUES (v_table.game_id, v_member.user_id, 'yes', p_seat_number, true, now())
    ON CONFLICT (game_id, user_id) DO UPDATE
      SET response = 'yes', seat_number = EXCLUDED.seat_number,
          is_confirmed = true, responded_at = now(), updated_at = now();
  END IF;

  RETURN v_reservation_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid) IS
  'Host seat claim for one approved Home Games member. Locks membership state before atomically creating a reservation and, for registered members, an RSVP.';

-- Capacity is measured in seats, not RSVP rows. Serialize every yes-RSVP
-- decision on the parent game row, exclude the current row on update, and
-- re-evaluate when either response or bringing_guests changes.
CREATE OR REPLACE FUNCTION public.fn_hg_enforce_rsvp_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_max_players integer;
  v_seats_taken integer;
  v_requested_seats integer;
BEGIN
  IF NEW.response <> 'yes' THEN RETURN NEW; END IF;

  SELECT max_players
    INTO v_max_players
    FROM public.commander_home_games
   WHERE id = NEW.game_id
   FOR UPDATE;

  IF NOT FOUND OR v_max_players IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(sum(1 + greatest(coalesce(r.bringing_guests, 0), 0)), 0)::integer
      INTO v_seats_taken
      FROM public.commander_home_rsvps r
     WHERE r.game_id = NEW.game_id
       AND r.response = 'yes'
       AND r.id <> OLD.id;
  ELSE
    SELECT coalesce(sum(1 + greatest(coalesce(r.bringing_guests, 0), 0)), 0)::integer
      INTO v_seats_taken
      FROM public.commander_home_rsvps r
     WHERE r.game_id = NEW.game_id
       AND r.response = 'yes';
  END IF;

  v_requested_seats := 1 + greatest(coalesce(NEW.bringing_guests, 0), 0);
  IF v_seats_taken + v_requested_seats > v_max_players THEN
    NEW.response := 'waitlist';
    NEW.is_confirmed := false;
    NEW.seat_number := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hg_enforce_rsvp_capacity()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hg_enforce_rsvp_capacity() TO service_role;

COMMENT ON FUNCTION public.fn_hg_enforce_rsvp_capacity() IS
  'Serializes RSVP capacity by game and counts each yes response plus guests; update checks exclude the RSVP being replaced.';

DROP TRIGGER trg_hg_enforce_rsvp_capacity ON public.commander_home_rsvps;
CREATE TRIGGER trg_hg_enforce_rsvp_capacity
BEFORE INSERT OR UPDATE OF response, bringing_guests ON public.commander_home_rsvps
FOR EACH ROW
EXECUTE FUNCTION public.fn_hg_enforce_rsvp_capacity();

-- One authenticated transaction owns the public-profile eligibility check,
-- membership transition, guest-aware capacity decision, and RSVP upsert.
-- Notifications remain an API concern and run only after this RPC succeeds.
CREATE FUNCTION public.request_public_home_game_seat(
  p_group_id uuid,
  p_game_id uuid,
  p_caller_user_id uuid,
  p_bringing_guests integer DEFAULT 0,
  p_guest_names text[] DEFAULT ARRAY[]::text[],
  p_message text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_group public.commander_home_groups%ROWTYPE;
  v_game public.commander_home_games%ROWTYPE;
  v_member public.commander_home_members%ROWTYPE;
  v_prior_rsvp public.commander_home_rsvps%ROWTYPE;
  v_rsvp public.commander_home_rsvps%ROWTYPE;
  v_public_page_id uuid;
  v_member_is_new boolean := false;
  v_member_reopened boolean := false;
  v_membership_status text;
  v_bringing_guests integer;
  v_guest_names text[];
  v_message text;
  v_requested_seats integer;
  v_prior_seats integer := 0;
  v_preserve_confirmation boolean := false;
  v_has_prior_rsvp boolean := false;
  v_game_start_at timestamptz;
  v_previous_claim_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF auth.uid() IS NULL
     OR p_caller_user_id IS NULL
     OR auth.uid() <> p_caller_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_group_id IS NULL OR p_game_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_PARAMS';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_group_id::text),
    pg_catalog.hashtext(p_caller_user_id::text)
  );

  SELECT * INTO v_group
    FROM public.commander_home_groups
   WHERE id = p_group_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND'; END IF;
  IF NOT coalesce(v_group.is_active, false) THEN
    RAISE EXCEPTION 'GROUP_INACTIVE';
  END IF;

  -- Pin the page's publication/linkage state until commit. Calling the RPC
  -- directly cannot manufacture a public group/event association.
  SELECT page.id INTO v_public_page_id
    FROM public.social_pages page
   WHERE page.page_type = 'home_game'
     AND page.is_public IS TRUE
     AND page.linked_entity_type = 'home_group'
     AND page.linked_entity_id = p_group_id::text
   ORDER BY page.id
   LIMIT 1
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLIC_HOME_GAME_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_game
    FROM public.commander_home_games
   WHERE id = p_game_id
     AND group_id = p_group_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_game.status NOT IN ('scheduled', 'confirmed')
     OR v_game.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'GAME_NOT_OPEN_FOR_RSVP';
  END IF;
  IF coalesce(v_game.rsvps_closed, false) THEN
    RAISE EXCEPTION 'RSVPS_CLOSED';
  END IF;
  IF v_game.rsvp_closes_at IS NOT NULL AND v_game.rsvp_closes_at <= now() THEN
    RAISE EXCEPTION 'RSVP_DEADLINE_PASSED';
  END IF;

  v_game_start_at := (v_game.scheduled_date + v_game.start_time)
    AT TIME ZONE coalesce(nullif(v_game.timezone, ''), v_group.timezone, 'America/New_York');
  IF v_game_start_at <= now() THEN
    RAISE EXCEPTION 'GAME_ALREADY_STARTED';
  END IF;

  v_bringing_guests := least(greatest(coalesce(p_bringing_guests, 0), 0), 10);
  IF NOT coalesce(v_game.allow_guests, false) THEN
    v_bringing_guests := 0;
  ELSIF v_game.guest_limit IS NOT NULL THEN
    v_bringing_guests := least(v_bringing_guests, greatest(v_game.guest_limit, 0));
  END IF;

  SELECT coalesce(
           array_agg(left(btrim(candidate.name), 80) ORDER BY candidate.ordinality),
           ARRAY[]::text[]
         )
    INTO v_guest_names
    FROM unnest(coalesce(p_guest_names, ARRAY[]::text[]))
      WITH ORDINALITY AS candidate(name, ordinality)
   WHERE candidate.ordinality <= v_bringing_guests
     AND nullif(btrim(candidate.name), '') IS NOT NULL;
  v_message := nullif(left(btrim(coalesce(p_message, '')), 500), '');

  IF p_caller_user_id = v_group.owner_id OR p_caller_user_id = v_game.host_id THEN
    v_membership_status := CASE
      WHEN p_caller_user_id = v_group.owner_id THEN 'owner'
      ELSE 'host'
    END;
  ELSE
    SELECT * INTO v_member
      FROM public.commander_home_members
     WHERE group_id = p_group_id
       AND user_id = p_caller_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_member := NULL;
      INSERT INTO public.commander_home_members
        (group_id, user_id, role, status, joined_at, created_at)
      VALUES
        (p_group_id, p_caller_user_id, 'member', 'pending', NULL, now())
      ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
      RETURNING * INTO v_member;

      IF v_member.id IS NULL THEN
        SELECT * INTO v_member
          FROM public.commander_home_members
         WHERE group_id = p_group_id
           AND user_id = p_caller_user_id
         FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_CONFLICT'; END IF;
      ELSE
        v_member_is_new := true;
      END IF;
    END IF;

    IF v_member.status = 'banned' THEN
      RAISE EXCEPTION 'MEMBERSHIP_BANNED' USING ERRCODE = '42501';
    ELSIF v_member.status = 'declined' THEN
      IF NOT coalesce(
        v_group.settings -> 'allow_declined_re_request' = 'true'::jsonb,
        false
      ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_DECLINED' USING ERRCODE = '42501';
      END IF;

      -- The existing direct-write guard correctly forbids self-promotion.
      -- This purpose-scoped SECURITY DEFINER transition has already locked and
      -- authenticated the canonical identity, so suppress only nested auth
      -- detection for this one declined -> pending update.
      PERFORM set_config('request.jwt.claim.sub', '', true);
      PERFORM set_config('request.jwt.claims', '', true);
      UPDATE public.commander_home_members
         SET status = 'pending', joined_at = NULL
       WHERE id = v_member.id
         AND status = 'declined'
      RETURNING * INTO v_member;
      PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
      PERFORM set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
      IF v_member.id IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_CHANGED'; END IF;
      v_member_reopened := true;
    ELSIF v_member.status NOT IN ('approved', 'pending') THEN
      RAISE EXCEPTION 'MEMBERSHIP_STATE_INVALID';
    END IF;

    v_membership_status := v_member.status;
    IF v_member_is_new OR v_member_reopened THEN
      INSERT INTO public.commander_home_audit_log
        (group_id, actor_id, target_type, target_id, action, metadata)
      VALUES (
        p_group_id,
        p_caller_user_id,
        'member',
        v_member.id,
        CASE WHEN v_member_is_new THEN 'member_requested' ELSE 'member_re_requested' END,
        jsonb_build_object(
          'source', 'public_home_game_seat_request',
          'game_id', p_game_id,
          'member_id', v_member.id,
          'member_user_id', v_member.user_id,
          'status', v_member.status
        )
      );
    END IF;
  END IF;

  SELECT * INTO v_prior_rsvp
    FROM public.commander_home_rsvps
   WHERE game_id = p_game_id
     AND user_id = p_caller_user_id
   FOR UPDATE;
  v_has_prior_rsvp := FOUND;

  v_requested_seats := 1 + v_bringing_guests;
  IF v_has_prior_rsvp AND v_prior_rsvp.response = 'yes' THEN
    v_prior_seats := 1 + greatest(coalesce(v_prior_rsvp.bringing_guests, 0), 0);
    v_preserve_confirmation := v_requested_seats <= v_prior_seats;
  END IF;

  -- The legacy RSVP permission trigger rejects caller-supplied updated_at and
  -- some system-maintained transitions. This purpose-scoped RPC has already
  -- authenticated, locked, and validated the caller/game/member, so suppress
  -- nested auth detection only for the atomic upsert and restore it before
  -- returning. The new membership/capacity triggers remain auth-independent.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.commander_home_rsvps AS current_rsvp
    (game_id, user_id, response, bringing_guests, guest_names, message,
     is_confirmed, responded_at, updated_at)
  VALUES
    (p_game_id, p_caller_user_id, 'yes', v_bringing_guests, v_guest_names,
     v_message, false, now(), now())
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET response = 'yes',
        bringing_guests = EXCLUDED.bringing_guests,
        guest_names = EXCLUDED.guest_names,
        message = EXCLUDED.message,
        is_confirmed = CASE
          WHEN v_preserve_confirmation THEN current_rsvp.is_confirmed
          ELSE false
        END,
        seat_number = CASE
          WHEN v_preserve_confirmation THEN current_rsvp.seat_number
          ELSE NULL
        END,
        updated_at = now()
  RETURNING * INTO v_rsvp;
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
  PERFORM set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);

  RETURN jsonb_build_object(
    'success', true,
    'rsvp', jsonb_build_object(
      'id', v_rsvp.id,
      'response', v_rsvp.response,
      'is_confirmed', coalesce(v_rsvp.is_confirmed, false),
      'bringing_guests', coalesce(v_rsvp.bringing_guests, 0),
      'guest_names', coalesce(v_rsvp.guest_names, ARRAY[]::text[]),
      'message', v_rsvp.message,
      'responded_at', v_rsvp.responded_at,
      'updated_at', v_rsvp.updated_at
    ),
    'membership', jsonb_build_object(
      'id', v_member.id,
      'status', v_membership_status,
      'is_new', v_member_is_new,
      're_requested', v_member_reopened
    ),
    'wait_for_host_approval', NOT coalesce(v_rsvp.is_confirmed, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.request_public_home_game_seat(
  uuid, uuid, uuid, integer, text[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_public_home_game_seat(
  uuid, uuid, uuid, integer, text[], text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_public_home_game_seat(
  uuid, uuid, uuid, integer, text[], text
) IS
  'Atomic authenticated seat request for a published Home Games social page: locks group/game/member, audits membership creation or re-request, and returns the trigger-authoritative RSVP.';

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

-- Membership can become ineligible after an RSVP was accepted (manual ban,
-- decline, self-leave, staff removal, or automatic flake ban). Clear only
-- current/upcoming participation. Completed/cancelled responses are historical
-- attendance records and must remain available to review/audit workflows.
CREATE OR REPLACE FUNCTION public.fn_hg_clear_ineligible_member_rsvps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_group_id uuid;
  v_user_id uuid;
  v_member_id uuid;
  v_previous_claim_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;
    v_user_id := OLD.user_id;
    v_member_id := OLD.id;
  ELSE
    IF NEW.status IN ('approved', 'pending') THEN
      RETURN NEW;
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_group_id := NEW.group_id;
    v_user_id := NEW.user_id;
    v_member_id := NEW.id;
  END IF;

  -- Existing RSVP permission/deadline triggers correctly block direct user
  -- edits after closure. This nested system correction must still be able to
  -- release a seat, so temporarily clear both auth.uid() claim sources and
  -- restore them before returning to the caller's transaction.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.commander_home_rsvps r
     SET response = 'no',
         is_confirmed = false,
         seat_number = NULL,
         updated_at = now()
    FROM public.commander_home_games game
    JOIN public.commander_home_groups home_group ON home_group.id = game.group_id
   WHERE game.id = r.game_id
     AND game.group_id = v_group_id
     AND game.status IN ('scheduled', 'confirmed', 'in_progress')
     AND v_user_id IS NOT NULL
     AND r.user_id = v_user_id
     AND r.user_id IS DISTINCT FROM home_group.owner_id
     AND r.user_id IS DISTINCT FROM game.host_id
     AND r.response IN ('yes', 'maybe', 'waitlist');

  -- Roster-only members have no user_id and therefore no RSVP row. Release
  -- their member_id-backed reservations as well as real-user/claimed guest
  -- reservations, and remove any already-materialized live seat first.
  DELETE FROM public.commander_home_seats seat
  USING public.commander_home_seat_reservations reservation,
        public.commander_home_game_tables game_table,
        public.commander_home_games game
   WHERE seat.reservation_id = reservation.id
     AND game_table.id = reservation.table_id
     AND game.id = game_table.game_id
     AND game.group_id = v_group_id
     AND game.status IN ('scheduled', 'confirmed', 'in_progress')
     AND reservation.status IN ('reserved', 'seated')
     AND (
       reservation.member_id = v_member_id
       OR (v_user_id IS NOT NULL AND reservation.user_id = v_user_id)
       OR (v_user_id IS NOT NULL AND reservation.claimed_by_user_id = v_user_id)
     );

  UPDATE public.commander_home_seat_reservations reservation
     SET status = 'released',
         released_at = coalesce(released_at, now()),
         updated_at = now()
    FROM public.commander_home_game_tables game_table,
         public.commander_home_games game
   WHERE game_table.id = reservation.table_id
     AND game.id = game_table.game_id
     AND game.group_id = v_group_id
     AND game.status IN ('scheduled', 'confirmed', 'in_progress')
     AND reservation.status IN ('reserved', 'seated')
     AND (
       reservation.member_id = v_member_id
       OR (v_user_id IS NOT NULL AND reservation.user_id = v_user_id)
       OR (v_user_id IS NOT NULL AND reservation.claimed_by_user_id = v_user_id)
     );

  PERFORM set_config('request.jwt.claim.sub', coalesce(v_previous_claim_sub, ''), true);
  PERFORM set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hg_clear_ineligible_member_rsvps()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_hg_clear_ineligible_member_rsvps() IS
  'Releases current/upcoming RSVPs, reservations, and materialized seats whenever a non-owner/non-host membership becomes ineligible or is removed, including roster-only members.';

-- Install the gate before remediation. The existing AFTER UPDATE waitlist
-- promotion trigger may react when an ineligible yes RSVP becomes no; any
-- nested promotion must pass the membership gate too. Creating the trigger
-- first also takes the table lock before the cleanup snapshot, closing the
-- concurrent-write window around quarantine.
CREATE TRIGGER trg_hg_enforce_rsvp_membership_state
BEFORE INSERT OR UPDATE ON public.commander_home_rsvps
FOR EACH ROW
EXECUTE FUNCTION public.fn_hg_enforce_rsvp_membership_state();

-- Quarantine every existing ineligible active row under the new invariant.
-- Owners and the game's host are the only membership-free exceptions, matching
-- the trigger above. This is an auditable security correction, not a
-- reversible product-state change.
DO $quarantine$
DECLARE
  v_quarantined_count bigint;
BEGIN
  UPDATE public.commander_home_rsvps r
     SET response = 'no',
         is_confirmed = false,
         seat_number = NULL,
         updated_at = now()
    FROM public.commander_home_games game
    JOIN public.commander_home_groups home_group ON home_group.id = game.group_id
   WHERE r.response IN ('yes', 'maybe', 'waitlist')
     AND game.id = r.game_id
     AND game.status IN ('scheduled', 'confirmed', 'in_progress')
     AND r.user_id IS DISTINCT FROM home_group.owner_id
     AND r.user_id IS DISTINCT FROM game.host_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.commander_home_members member
        WHERE member.group_id = game.group_id
          AND member.user_id = r.user_id
          AND member.status IN ('approved', 'pending')
     );
  GET DIAGNOSTICS v_quarantined_count = ROW_COUNT;
  RAISE NOTICE 'HOME_GAMES_AUDIT: quarantined % membership-ineligible active RSVP rows', v_quarantined_count;
END;
$quarantine$;

CREATE TRIGGER trg_hg_clear_ineligible_member_rsvps
BEFORE DELETE OR UPDATE OF status ON public.commander_home_members
FOR EACH ROW
EXECUTE FUNCTION public.fn_hg_clear_ineligible_member_rsvps();

NOTIFY pgrst, 'reload schema';

-- --------------------------------------------------------------------------
-- POST-ASSERT: any failure rolls the entire migration transaction back.
-- --------------------------------------------------------------------------
DO $postassert$
DECLARE
  v_join_oid oid := to_regprocedure('public.join_home_group(uuid,uuid,text)');
  v_join_def text;
  v_manage_oid oid := to_regprocedure('public.manage_home_group_member(uuid,uuid,text,uuid)');
  v_manage_def text;
  v_conversation_oid oid := to_regprocedure('public.fn_add_member_to_group_conversation()');
  v_conversation_def text;
  v_claim_oid oid := to_regprocedure('public.rpc_hg_host_claim_for_member(uuid,integer,uuid)');
  v_claim_def text;
  v_capacity_oid oid := to_regprocedure('public.fn_hg_enforce_rsvp_capacity()');
  v_capacity_def text;
  v_request_oid oid := to_regprocedure(
    'public.request_public_home_game_seat(uuid,uuid,uuid,integer,text[],text)'
  );
  v_request_def text;
  v_capacity_trigger_def text;
  v_rsvp_trigger_def text;
  v_member_trigger_def text;
BEGIN
  IF v_join_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: join_home_group is missing';
  END IF;
  SELECT pg_get_functiondef(v_join_oid) INTO v_join_def;

  IF position('v_code_kind = ''share''' IN v_join_def) = 0
     OR position('allow_declined_re_request' IN v_join_def) = 0
     OR position('pg_advisory_xact_lock' IN v_join_def) = 0
     OR position('ON CONFLICT (group_id, user_id) WHERE user_id IS NOT NULL DO NOTHING' IN v_join_def) = 0
     OR position('p_invite_code = v_group.invite_code OR p_invite_code = v_group.club_code' IN v_join_def) > 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: secure join semantics are not installed';
  END IF;

  IF has_function_privilege('anon', 'public.join_home_group(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: anon can execute join_home_group';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.join_home_group(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: authenticated cannot execute join_home_group';
  END IF;

  IF v_manage_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: manage_home_group_member is missing';
  END IF;
  SELECT pg_get_functiondef(v_manage_oid) INTO v_manage_def;

  IF position('m.user_id IS NULL AND m.id = p_member_user_id' IN v_manage_def) = 0
     OR position('IF p_action = ''invite'' THEN' IN v_manage_def) = 0
     OR position('''member_invited''' IN v_manage_def) = 0
     OR position('grant_host' IN v_manage_def) = 0
     OR position('revoke_host' IN v_manage_def) = 0
     OR position('INSERT INTO public.commander_home_audit_log' IN v_manage_def) = 0
     OR position('''before'', v_before' IN v_manage_def) = 0
     OR position('''after'', v_after' IN v_manage_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: secure audited member management is not installed';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.manage_home_group_member(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: anon can execute manage_home_group_member';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.manage_home_group_member(uuid,uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: authenticated cannot execute manage_home_group_member';
  END IF;

  IF v_conversation_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: fn_add_member_to_group_conversation is missing';
  END IF;
  SELECT pg_get_functiondef(v_conversation_oid) INTO v_conversation_def;
  IF position('IF NEW.user_id IS NULL THEN RETURN NEW; END IF;' IN v_conversation_def) = 0
     OR position('INSERT INTO messenger_participants' IN v_conversation_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: roster-only conversation guard is not installed';
  END IF;

  IF v_claim_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: rpc_hg_host_claim_for_member is missing';
  END IF;
  SELECT pg_get_functiondef(v_claim_oid) INTO v_claim_def;
  IF position('FOR UPDATE OF t, h' IN v_claim_def) = 0
     OR position('is_roster_only, status' IN v_claim_def) = 0
     OR position('FOR UPDATE' IN v_claim_def) = 0
     OR position('v_member.status IS DISTINCT FROM ''approved''' IN v_claim_def) = 0
     OR position('MEMBER_NOT_APPROVED' IN v_claim_def) = 0
     OR position('INSERT INTO public.commander_home_seat_reservations' IN v_claim_def) = 0
     OR position('INSERT INTO public.commander_home_rsvps' IN v_claim_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: approved-member host claim gate is not installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
     WHERE p.oid = v_claim_oid
       AND p.prosecdef
       AND p.proconfig @> ARRAY['search_path=public']::text[]
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: host claim security/search-path contract changed';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.rpc_hg_host_claim_for_member(uuid,integer,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: anon can execute rpc_hg_host_claim_for_member';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.rpc_hg_host_claim_for_member(uuid,integer,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: authenticated cannot execute rpc_hg_host_claim_for_member';
  END IF;

  IF v_capacity_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: fn_hg_enforce_rsvp_capacity is missing';
  END IF;
  SELECT pg_get_functiondef(v_capacity_oid) INTO v_capacity_def;
  IF position('sum(1 + greatest(coalesce(r.bringing_guests, 0), 0))' IN v_capacity_def) = 0
     OR position('r.id <> OLD.id' IN v_capacity_def) = 0
     OR position('NEW.is_confirmed := false' IN v_capacity_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: guest-aware RSVP capacity gate is not installed';
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_capacity_trigger_def
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.commander_home_rsvps'::regclass
     AND t.tgname = 'trg_hg_enforce_rsvp_capacity'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';
  IF v_capacity_trigger_def IS NULL
     OR position('UPDATE OF response, bringing_guests' IN v_capacity_trigger_def) = 0
     OR position('fn_hg_enforce_rsvp_capacity' IN v_capacity_trigger_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: capacity trigger is not guest-update aware';
  END IF;

  IF v_request_oid IS NULL THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: request_public_home_game_seat is missing';
  END IF;
  SELECT pg_get_functiondef(v_request_oid) INTO v_request_def;
  IF position('auth.uid() <> p_caller_user_id' IN v_request_def) = 0
     OR position('page.is_public IS TRUE' IN v_request_def) = 0
     OR position('FOR SHARE' IN v_request_def) = 0
     OR position('pg_advisory_xact_lock' IN v_request_def) = 0
     OR position('FOR UPDATE' IN v_request_def) = 0
     OR position('MEMBERSHIP_BANNED' IN v_request_def) = 0
     OR position('allow_declined_re_request' IN v_request_def) = 0
     OR position('INSERT INTO public.commander_home_audit_log' IN v_request_def) = 0
     OR position('ON CONFLICT (game_id, user_id) DO UPDATE' IN v_request_def) = 0
     OR position('v_preserve_confirmation' IN v_request_def) = 0
     OR position('RETURNING * INTO v_rsvp' IN v_request_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: atomic public seat-request contract is not installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
     WHERE p.oid = v_request_oid
       AND p.prosecdef
       AND p.proconfig @> ARRAY[
         'search_path=public, pg_temp',
         'row_security=off'
       ]::text[]
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: public seat-request security configuration changed';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.request_public_home_game_seat(uuid,uuid,uuid,integer,text[],text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: anon can execute request_public_home_game_seat';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.request_public_home_game_seat(uuid,uuid,uuid,integer,text[],text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: authenticated cannot execute request_public_home_game_seat';
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_rsvp_trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'commander_home_rsvps'
     AND t.tgname = 'trg_hg_enforce_rsvp_membership_state'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';

  IF v_rsvp_trigger_def IS NULL
     OR position('fn_hg_enforce_rsvp_membership_state' IN v_rsvp_trigger_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: RSVP membership trigger is not enabled';
  END IF;

  SELECT pg_get_triggerdef(t.oid)
    INTO v_member_trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'commander_home_members'
     AND t.tgname = 'trg_hg_clear_ineligible_member_rsvps'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O';

  IF v_member_trigger_def IS NULL
     OR position('fn_hg_clear_ineligible_member_rsvps' IN v_member_trigger_def) = 0
     OR position('BEFORE DELETE OR UPDATE OF status' IN v_member_trigger_def) = 0 THEN
    RAISE EXCEPTION 'POSTASSERT_FAILED: membership lifecycle RSVP cleanup trigger is not enabled';
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
      JOIN public.commander_home_groups home_group ON home_group.id = game.group_id
     WHERE r.response IN ('yes', 'maybe', 'waitlist')
       AND game.status IN ('scheduled', 'confirmed', 'in_progress')
       AND r.user_id IS DISTINCT FROM home_group.owner_id
       AND r.user_id IS DISTINCT FROM game.host_id
       AND NOT EXISTS (
         SELECT 1
           FROM public.commander_home_members member
          WHERE member.group_id = game.group_id
            AND member.user_id = r.user_id
            AND member.status IN ('approved', 'pending')
       )
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
--   DROP TRIGGER IF EXISTS trg_hg_clear_ineligible_member_rsvps
--     ON public.commander_home_members;
--   DROP FUNCTION IF EXISTS public.fn_hg_enforce_rsvp_membership_state();
--   DROP FUNCTION IF EXISTS public.fn_hg_clear_ineligible_member_rsvps();
--
-- Keep the hardened join_home_group, manage_home_group_member,
-- rpc_hg_host_claim_for_member, request_public_home_game_seat, and
-- fn_hg_enforce_rsvp_capacity definitions and the roster-only guard in
-- fn_add_member_to_group_conversation in place.
-- Restoring the prior functions would knowingly re-enable approval through a
-- public club_code, concurrent-join failures, roster-only management gaps,
-- unaudited privileged member mutations, banned roster seat claims, or NULL
-- messenger participant writes.
-- Restore function grants only if an access incident requires it, and never
-- grant EXECUTE to anon.
--
-- Rotated invite credentials and quarantined ineligible RSVPs are not
-- restored. Hosts can issue new invite credentials or re-approve membership
-- through normal audited workflows after the incident is resolved.
