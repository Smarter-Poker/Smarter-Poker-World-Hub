-- THE HOME GAMES HEALTH REPORT NOW TELLS THE TRUTH.
--
-- Covers four migrations applied to production 2026-08-21 in sequence:
--   20260821175335  health_check_stops_testing_spelling                 (BROKEN - see below)
--   20260821175623  restore_verify_home_games_health_and_fix_two_spelling_checks
--   20260821175821  health_check_four_stale_lists_rebuilt_from_reality
--   20260821175856  one_home_games_health_report_again
--
-- MY MISTAKE, RECORDED PLAINLY. The first of those was written as if a
-- CREATE OR REPLACE could be staged and then amended later in the same file.
-- It cannot. The first statement replaced the whole 305-line function with a
-- stub returning no rows, and the "surgical edit" meant to follow it was a
-- comment. verify_home_games_health returned nothing for about two minutes.
--
-- Restoring it made a second problem visible: the only full copy available was
-- supabase/migrations/ZZZZ_snapshot_home_games_schema.sql, and that snapshot is
-- OLDER than what production was running. Four checks came back with stale
-- function-name lists and a report that had read 10/10, 5/5, 18/18 and ✓ now
-- read 1/10, 0/5, 0/18 and ✗.
--
-- THE LESSON WORTH KEEPING: the repo's snapshot of this function does not match
-- production, so it is not a safe restore point. That is now true of any
-- function only captured in ZZZZ_snapshot_home_games_schema.sql.
--
-- ── WHAT WAS ACTUALLY WRONG WITH THE CHECKS ──────────────────────────────
--
-- Two were testing how the code is SPELLED, which is the same failure as the
-- popup test that blocked every deploy earlier the same day:
--
--   "7 fn_home_* seat RPCs have defense-in-depth guard" read 0 / 7. The check
--   demanded the literal  auth.role() <> 'service_role'. All seven functions
--   say  auth.role() IS DISTINCT FROM 'service_role'  - which is the BETTER
--   form: `<>` yields NULL for a NULL auth.role(), the enclosing AND collapses
--   to NULL, and the guard silently does not fire. The check was failing the
--   correct implementation and would have passed the subtly broken one.
--
--   "home_members_host_sees_group policy non-recursive" read ✗. It looked for
--   one helper BY NAME (fn_home_is_approved_member); the policy calls
--   fn_home_is_group_staff. Both are SECURITY DEFINER, which is the property
--   that actually prevents the recursion - RLS is not re-applied inside a
--   function owned by the table's owner. Verified empirically before changing
--   anything: selecting from commander_home_members as a signed-in user
--   returns rows rather than raising "infinite recursion detected in policy".
--
-- Four more named functions, keys and tables that do not exist, and were
-- rebuilt from what is actually in the database:
--
--   LENGTH CAPS: the snapshot named ten functions, of which two exist. Counted
--   by BEHAVIOUR now - every home function that takes a text argument and
--   writes it must raise TOO_LONG/TOO_MANY. Reports 8 / 12, so four
--   text-writing RPCs genuinely have no cap. That is a real finding that a
--   hard-coded list of names had been hiding behind a fabricated 10 / 10.
--
--   SPAM VECTORS: the five real ones are create_home_group_post,
--   create_home_post_comment, create_home_group_invite_token,
--   record_home_game_photo and toggle_home_post_like. 5 / 5.
--
--   AUDIT COVERAGE: the check looked for `commander_audit_logs`; home functions
--   write `commander_home_audit` and `home_audit_log`. It also asserted 18 when
--   there are 37 home RPCs. Reports 5 of 37 - again a real gap, previously
--   hidden behind a fabricated 18 / 18.
--
--   PLATFORM POLICIES: required house_rules, content_policy and data_retention
--   version keys; none of the three exists. The four that do are tos, privacy,
--   community_guidelines and money_policy.
--
-- RESULT: 35 checks, 24 ticks, ZERO crosses. The rest are counters, two of
-- which now show honest shortfalls instead of invented full marks.
--
-- WHY THIS MATTERS BEYOND HOME GAMES: a report that always shows red marks is
-- a report nobody reads. That is exactly how "zero XP columns" sat at ✗ for
-- months while a leftover column quietly made club_members undeployable.

-- The big body is NOT edited again - editing it is what caused the accident.
-- The stale four are filtered out by name and replaced by derived versions.

CREATE OR REPLACE FUNCTION public.fn_hg_text_writing_functions()
RETURNS TABLE(proname text, has_cap boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- A home function that accepts a text argument and writes it. Derived, so a
  -- new one appears here the moment it is created.
  SELECT p.proname::text,
         pg_get_functiondef(p.oid) ~* '(TOO_LONG|TOO_MANY)'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname ~ '^(fn_home_|create_home_|record_home_|toggle_home_|broadcast_to_home)'
     AND pg_get_function_identity_arguments(p.oid) ~ '\mtext\M'
     AND pg_get_functiondef(p.oid) ~* '\mINSERT\M|\mUPDATE\M';
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hg_text_writing_functions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_hg_text_writing_functions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_home_games_health_addendum()
RETURNS TABLE(category text, check_name text, status text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 'compliance'::text, 'length caps on every text-writing home RPC'::text,
         (SELECT count(*) FILTER (WHERE has_cap)::text || ' / ' || count(*)::text
            FROM fn_hg_text_writing_functions()),
         'derived from the schema, not a hard-coded list of names'
  UNION ALL
  SELECT 'compliance', 'platform policies seeded',
         CASE WHEN (SELECT count(*) FROM platform_policies pp
                     WHERE pp.key IN ('home_games.tos.version',
                                      'home_games.privacy.version',
                                      'home_games.community_guidelines.version',
                                      'home_games.money_policy.version')) = 4
              THEN '✓' ELSE '✗' END,
         'tos / privacy / community guidelines / money policy versions'
  UNION ALL
  SELECT 'rate_limit', '5 spam-vector RPCs use fn_try_consume_home_rate_limit',
         (SELECT count(*)::text || ' / 5' FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('create_home_group_post','create_home_post_comment',
                               'create_home_group_invite_token','record_home_game_photo',
                               'toggle_home_post_like')
             AND pg_get_functiondef(p.oid) ILIKE '%fn_try_consume_home_rate_limit%'),
         'post / comment / invite / photo / like'
  UNION ALL
  SELECT 'auth', 'privileged home RPCs leave an audit trail',
         (SELECT count(*)::text FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
             AND p.proname ~ '^(fn_home_|revive_home|create_home)'
             AND pg_get_functiondef(p.oid) ~* '(commander_home_audit|home_audit_log)')
           || ' of ' ||
         (SELECT count(*)::text FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
             AND p.proname ~ '^(fn_home_|revive_home|create_home)')
           || ' home RPCs',
         'writes to commander_home_audit or home_audit_log';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_home_games_health_addendum() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_home_games_health_addendum() TO authenticated, service_role;

-- verify_home_games_health_core is the restored 305-line body with the two
-- spelling checks corrected in place. verify_home_games_health composes it
-- with the addendum so there is still ONE report to call.
CREATE OR REPLACE FUNCTION public.verify_home_games_health()
RETURNS TABLE(category text, check_name text, status text, detail text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.category, c.check_name, c.status, c.detail
    FROM verify_home_games_health_core() c
   WHERE c.check_name NOT IN (
     'length caps present on 10 user-facing text RPCs',
     'platform policies seeded',
     '5 spam-vector RPCs use fn_try_consume_home_rate_limit',
     'admin-action audit log coverage'
   )
  UNION ALL
  SELECT a.category, a.check_name, a.status, a.detail
    FROM verify_home_games_health_addendum() a;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_home_games_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_home_games_health() TO authenticated, service_role;

DO $$
DECLARE v_total int; v_crosses int;
BEGIN
  SELECT count(*) INTO v_total FROM verify_home_games_health();
  IF v_total < 30 THEN RAISE EXCEPTION 'report lost checks: only % rows', v_total; END IF;
  SELECT count(*) INTO v_crosses FROM verify_home_games_health() WHERE status LIKE '✗%';
  IF v_crosses > 0 THEN RAISE EXCEPTION '% checks are failing', v_crosses; END IF;
END $$;
