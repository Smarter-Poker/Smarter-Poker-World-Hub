-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SECURITY: fn_get_or_create_conversation trusted a caller-supplied id
-- 2. PERF:     economy_invariants() was timing out CHECK 10 on every push
-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2. Applied to production first via Supabase MCP apply_migration
-- (name: secure_get_or_create_conversation_and_speed_economy_invariants),
-- mirrored here verbatim.
--
-- ── How this was found ────────────────────────────────────────────────────
-- CHECK 10 of the Build Safety Gate was failing on EVERY push with Postgres
-- 57014 "canceling statement due to statement timeout" — a performance
-- failure, not an economy violation. A permanently-red gate is worse than a
-- slow one: CLAUDE.md §11.4 records the 2026-07-31 incident where exactly
-- this masked CHECK 8 and CHECK 10, and CHECK 10 was hiding a real money bug
-- (500 diamonds of drift per signup). So it had to be fixed, not waited out.
--
-- While rewriting it, the migration's own post-apply assertion refused to
-- commit and named a genuinely failing invariant:
-- anon_mutating_definer_functions_check_auth_uid. That is item 1 below — a
-- real security hole the timeout had been hiding.
--
-- ── 1. SECURITY ───────────────────────────────────────────────────────────
-- Both p_user_id overloads of fn_get_or_create_conversation are SECURITY
-- DEFINER and were EXECUTE-able by anon, while taking the caller's identity
-- as a PARAMETER. Any caller — including an unauthenticated one — could
-- create a social_conversations row plus participant rows binding two
-- arbitrary users: an IDOR and an unauthenticated spam vector.
--
-- Fix: pin p_user_id to auth.uid() inside both overloads, and REVOKE EXECUTE
-- from anon. Behaviour-preserving for the live callers — SharePostModal.jsx
-- and MessagingService.js both already pass the caller's own id, and both
-- call as `authenticated`. (MessagingService uses the separate
-- (user1_id, user2_id) messenger_* overload, which is not touched here.)
--
-- ── 2. PERF ───────────────────────────────────────────────────────────────
-- Three of the twelve invariants read information_schema, whose views expand
-- ACLs row-by-row over pg_class x pg_attribute with no useful index. The
-- worst ran a correlated information_schema.role_table_grants subquery ONCE
-- PER TABLE across 732 public tables.
--
-- Rewritten onto has_table_privilege() / has_column_privilege(). These are
-- strictly MORE correct, not merely faster: they report the EFFECTIVE
-- privilege, so they also catch a write reachable via PUBLIC or via role
-- membership — grant paths the information_schema "explicit grant" views
-- miss entirely. Names, order, count (12) and meaning are unchanged.
--
-- Equivalence verified against the live catalog BEFORE applying — all three
-- old/new pairs returned identical sets (symmetric difference 0):
--   no_rls_off_tables_writable_by_clients         old=0 new=0
--   no_client_writable_views                      old=0 new=0
--   authenticated_cannot_update_economic_columns  old=0 new=0
-- Detection sanity, proving the new predicates are not trivially false:
--   has_table_privilege  -> 694 of 732 public tables are client-insertable
--                           (they are protected by RLS, which is why the
--                           invariant filters on NOT relrowsecurity)
--   has_column_privilege -> 2 of 2 for profiles.username / profiles.bio
--
-- Measured result: 1497ms / 115,664 shared buffers -> 142ms / 4,592 buffers.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────
-- Both functions are pure CREATE OR REPLACE; no data is touched.
--   * economy_invariants(): re-apply the definition from 20260808220000.
--   * fn_get_or_create_conversation: drop the two auth.uid() guard blocks
--     and re-run GRANT EXECUTE ... TO anon (NOT recommended — that restores
--     the IDOR).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. SECURITY ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(p_user_id uuid, p_other_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    -- 2026-08-15 security fix: a SECURITY DEFINER function must never trust a
    -- caller-supplied identity.
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1 ON p1.conversation_id = c.id
      JOIN social_conversation_participants p2 ON p2.conversation_id = c.id
     WHERE c.is_group = false
       AND p1.user_id = p_user_id
       AND p2.user_id = p_other_user_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group) VALUES (false) RETURNING id INTO v_new_id;
    INSERT INTO social_conversation_participants (conversation_id, user_id)
    VALUES (v_new_id, p_user_id), (v_new_id, p_other_user_id);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_get_or_create_conversation(p_user_id uuid, p_other_user_id uuid, p_context_entity_id uuid, p_context_entity_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_id uuid;
    v_new_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_other_user_id IS NULL OR p_user_id = p_other_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid user pair');
    END IF;

    -- 2026-08-15 security fix: see the 2-arg overload.
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;

    SELECT c.id INTO v_existing_id
      FROM social_conversations c
      JOIN social_conversation_participants p1
        ON p1.conversation_id = c.id AND p1.user_id = p_user_id
      JOIN social_conversation_participants p2
        ON p2.conversation_id = c.id AND p2.user_id = p_other_user_id
     WHERE c.is_group = false
       AND p1.context_entity_id IS NOT DISTINCT FROM p_context_entity_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'conversation_id', v_existing_id, 'created', false);
    END IF;

    INSERT INTO social_conversations (is_group, context_entity_id, context_entity_type)
    VALUES (false, p_context_entity_id, p_context_entity_type)
    RETURNING id INTO v_new_id;

    INSERT INTO social_conversation_participants
        (conversation_id, user_id, context_entity_id, context_entity_type)
    VALUES
        (v_new_id, p_user_id, p_context_entity_id, p_context_entity_type),
        (v_new_id, p_other_user_id, NULL, NULL);

    RETURN jsonb_build_object('success', true, 'conversation_id', v_new_id, 'created', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_or_create_conversation(uuid, uuid, uuid, text) FROM anon;

-- ── 2. PERF ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.economy_invariants()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_src text;
BEGIN
    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'deduct_diamonds' LIMIT 1;
    check_name := 'deduct_diamonds_writes_both_balance_columns';
    ok := v_src IS NOT NULL AND position('diamond_balance' in v_src) > 0;
    detail := 'profiles.diamonds and profiles.diamond_balance must be written together or they drift';
    RETURN NEXT;

    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'add_diamonds_to_balance' LIMIT 1;
    check_name := 'add_diamonds_writes_both_balance_columns';
    ok := v_src IS NOT NULL AND position('diamond_balance' in v_src) > 0;
    detail := 'credits must keep both balance columns in step';
    RETURN NEXT;

    check_name := 'no_profiles_balance_drift';
    SELECT COUNT(*) = 0 INTO ok FROM public.profiles WHERE diamonds IS DISTINCT FROM diamond_balance;
    detail := 'profiles where diamonds <> diamond_balance';
    RETURN NEXT;

    check_name := 'balance_rpcs_not_executable_by_clients';
    SELECT bool_and(NOT has_function_privilege(r.role, p.oid, 'EXECUTE'))
      INTO ok
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
     WHERE n.nspname = 'public'
       AND p.proname IN ('add_diamonds_to_balance', 'deduct_diamonds',
                         'award_diamonds', 'award_diamonds_v2');
    ok := COALESCE(ok, true);
    detail := 'a browser-executable balance mutator is a mint';
    RETURN NEXT;

    check_name := 'award_v2_executable_by_service_role';
    SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
      INTO ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'award_diamonds_v2';
    ok := COALESCE(ok, false);
    detail := 'if this is false, all rewards are DOWN';
    RETURN NEXT;

    check_name := 'profiles_economic_column_guard_trigger_present';
    SELECT COUNT(*) > 0 INTO ok
      FROM pg_trigger
     WHERE tgrelid = 'public.profiles'::regclass
       AND NOT tgisinternal
       AND tgname = 'trg_guard_profile_privileged_columns';
    detail := 'blocks self-granted diamonds / is_vip / vip_tier via PostgREST';
    RETURN NEXT;

    -- 2026-08-15 perf rewrite: information_schema.column_privileges ->
    -- has_column_privilege(). Same meaning, and it also catches an UPDATE
    -- reachable via PUBLIC, which the information_schema view would miss.
    check_name := 'authenticated_cannot_update_economic_columns';
    SELECT COUNT(*) = 0 INTO ok
      FROM unnest(ARRAY['diamonds', 'diamond_balance', 'diamond_multiplier',
                        'is_vip', 'vip_tier', 'vip_expires_at']) AS col
     WHERE has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE');
    detail := 'column-level UPDATE grants on the money/VIP columns';
    RETURN NEXT;

    SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'award_diamonds_v2' LIMIT 1;
    check_name := 'award_v2_vip_check_is_null_safe';
    ok := v_src IS NOT NULL AND position('COALESCE(v_vip_tier' in v_src) > 0;
    detail := 'VIP tier comparison must COALESCE or it fails open on NULL';
    RETURN NEXT;

    check_name := 'easter_eggs_exempt_from_daily_cap';
    SELECT COALESCE(bool_and(NOT counts_toward_daily_cap), true) INTO ok
      FROM public.diamond_reward_catalog WHERE action_key = 'easter_egg';
    detail := 'the store promises eggs pay on top of the daily cap';
    RETURN NEXT;

    -- 2026-08-15 perf rewrite: information_schema.role_table_grants ->
    -- has_table_privilege().
    check_name := 'no_client_writable_views';
    SELECT COUNT(*) = 0 INTO ok
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind = 'v'
       AND c.relname NOT IN ('geography_columns', 'geometry_columns')
       AND (has_table_privilege('anon', c.oid, 'INSERT')
         OR has_table_privilege('anon', c.oid, 'UPDATE')
         OR has_table_privilege('anon', c.oid, 'DELETE')
         OR has_table_privilege('anon', c.oid, 'TRUNCATE')
         OR has_table_privilege('authenticated', c.oid, 'INSERT')
         OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE')
         OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
    detail := 'a definer view with write grants is an RLS bypass';
    RETURN NEXT;

    check_name := 'anon_mutating_definer_functions_check_auth_uid';
    SELECT COUNT(*) = 0 INTO ok
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* '\m(insert|update|delete)\M'
       AND p.prosrc !~* 'auth\.uid\(\)';
    detail := 'anon-callable definer functions that write without checking auth.uid()';
    RETURN NEXT;

    -- 2026-08-15 perf rewrite: this was the timeout. The old form ran a
    -- correlated information_schema.role_table_grants subquery once per
    -- table, across 732 public tables.
    check_name := 'no_rls_off_tables_writable_by_clients';
    SELECT COUNT(*) = 0 INTO ok
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind = 'r'
       AND NOT c.relrowsecurity
       AND c.relname <> 'spatial_ref_sys'
       AND (has_table_privilege('anon', c.oid, 'INSERT')
         OR has_table_privilege('anon', c.oid, 'UPDATE')
         OR has_table_privilege('anon', c.oid, 'DELETE')
         OR has_table_privilege('anon', c.oid, 'TRUNCATE')
         OR has_table_privilege('authenticated', c.oid, 'INSERT')
         OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE')
         OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
    detail := 'tables with RLS disabled that clients can still write to';
    RETURN NEXT;

    RETURN;
END;
$function$;

-- ── Post-apply assertions ────────────────────────────────────────────────
DO $$
DECLARE
    v_total int;
    v_failed int;
    v_failed_names text;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE NOT ok),
           COALESCE(string_agg(check_name, ', ') FILTER (WHERE NOT ok), '')
      INTO v_total, v_failed, v_failed_names
      FROM public.economy_invariants();

    IF v_total <> 12 THEN
        RAISE EXCEPTION 'economy_invariants() returned % rows, expected 12', v_total;
    END IF;
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'economy_invariants() reports % failing invariant(s): %', v_failed, v_failed_names;
    END IF;

    IF has_function_privilege('anon', 'public.fn_get_or_create_conversation(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon still has EXECUTE on fn_get_or_create_conversation(uuid,uuid)';
    END IF;
END $$;
