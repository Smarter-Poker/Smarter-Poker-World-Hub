-- ═══════════════════════════════════════════════════════════════════════
-- TIER 3 (replaces two RLS policies, adds one helper function)
-- APPLIED TO PRODUCTION 2026-08-26.
--
-- WHY: rake_history was unreadable in practice.
--
--   Measured on production as an ordinary club member, with
--   request.jwt.claims set to a real profiles row, inside a rolled-back
--   transaction:
--
--     SELECT 1 FROM rake_history LIMIT 500   ->  17,735 ms
--
--   Seventeen seconds for the first 500 rows of their OWN club's rake. Any
--   client request times out long before that, and an earlier probe of
--   count(*) hit the statement timeout outright. rakeback_distributions
--   carries the identical predicate.
--
-- THE CAUSE was the predicate, not the data:
--
--     (fn_is_platform_admin() OR fn_is_club_member_uid(club_id))
--
--   fn_is_club_member_uid takes the ROW's club_id, so Postgres cannot hoist
--   it: it re-runs the function -- and therefore a fresh EXISTS against
--   club_members -- for every row it scans. This table has 1.37M rows and a
--   member can see only 16,841 of them, so almost every row was a wasted
--   function call. fn_is_platform_admin(), though argument-less, was also
--   called bare and evaluated per row.
--
-- THE FIX is the documented Supabase pattern and is purely mechanical:
--   1. `(SELECT fn_is_platform_admin())` -- a scalar subquery becomes an
--      InitPlan, evaluated ONCE per statement.
--   2. `club_id IN (SELECT fn_my_club_ids())` -- also an InitPlan: the
--      caller's club list is built once, then each row is a hash lookup.
--
-- RESULT, same probe:
--     first 500 rows   17,735 ms  ->    160 ms   (111x)
--     full count(*)    timed out  ->  1,374 ms
--   and visibility is unchanged: the member sees 16,841 rows, a god sees all
--   1,372,780.
--
-- The migration proved equivalence before committing: it compared the OLD and
-- NEW predicates for every distinct club_id in the table, for a member, a
-- non-member and an admin, and would have aborted on any disagreement.
--
-- NOT DONE, deliberately: three other policies match this shape
-- (cron_execution_log 245k, tables 93k, social_posts 24k). All three were
-- measured at 9-120 ms and left alone. Churning a policy without evidence it
-- is slow is how a working system acquires risk.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='rake_history' AND policyname='rake_history_club_member_select';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRE-FLIGHT: rake_history policy not found as expected.'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='rakeback_distributions' AND policyname='rakeback_distributions_club_member_select';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRE-FLIGHT: rakeback_distributions policy not found as expected.'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_is_club_member_uid';
  IF v_n <> 1 THEN RAISE EXCEPTION 'PRE-FLIGHT: fn_is_club_member_uid missing.'; END IF;
END $$;

-- Set-returning twin of fn_is_club_member_uid. Same predicate, same
-- SECURITY DEFINER reasoning: club_members has RLS and a policy expression
-- runs as the invoker, so the caller cannot read it directly.
CREATE OR REPLACE FUNCTION public.fn_my_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT club_id FROM public.club_members
  WHERE user_id = auth.uid()
    AND COALESCE(status, 'active') = 'active';
$function$;

REVOKE ALL ON FUNCTION public.fn_my_club_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_club_ids() TO authenticated;

DROP POLICY IF EXISTS rake_history_club_member_select ON public.rake_history;
CREATE POLICY rake_history_club_member_select ON public.rake_history
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_platform_admin()) OR club_id IN (SELECT public.fn_my_club_ids()));

DROP POLICY IF EXISTS rakeback_distributions_club_member_select ON public.rakeback_distributions;
CREATE POLICY rakeback_distributions_club_member_select ON public.rakeback_distributions
  FOR SELECT TO authenticated
  USING ((SELECT public.fn_is_platform_admin()) OR club_id IN (SELECT public.fn_my_club_ids()));

-- Semantic equivalence: old and new predicates must agree for every distinct
-- club_id, for a member, a non-member and an admin.
DO $$
DECLARE r_user record; r_club record; v_old boolean; v_new boolean; v_checked int := 0;
BEGIN
  FOR r_user IN
    SELECT 'member' AS kind, (SELECT user_id FROM public.club_members WHERE COALESCE(status,'active')='active' LIMIT 1) AS uid
    UNION ALL SELECT 'admin', (SELECT id FROM public.profiles WHERE role='god' LIMIT 1)
    UNION ALL SELECT 'non_member', (SELECT p.id FROM public.profiles p WHERE p.role='user'
                 AND NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.user_id=p.id) LIMIT 1)
  LOOP
    CONTINUE WHEN r_user.uid IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r_user.uid, 'role','authenticated')::text, true);
    FOR r_club IN SELECT DISTINCT club_id FROM public.rake_history WHERE club_id IS NOT NULL LOOP
      v_old := public.fn_is_platform_admin() OR public.fn_is_club_member_uid(r_club.club_id);
      v_new := (SELECT public.fn_is_platform_admin()) OR r_club.club_id IN (SELECT public.fn_my_club_ids());
      v_checked := v_checked + 1;
      IF v_old IS DISTINCT FROM v_new THEN
        RAISE EXCEPTION 'POST-APPLY: predicates DISAGREE for % on club % -- old=% new=%.',
          r_user.kind, r_club.club_id, v_old, v_new;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF v_checked = 0 THEN RAISE EXCEPTION 'POST-APPLY: compared nothing. Refusing to trust it.'; END IF;
  RAISE NOTICE 'POST-APPLY OK: predicates agreed on all % (user, club) pairs.', v_checked;
END $$;

DO $$
DECLARE q_rake text; q_rb text;
BEGIN
  SELECT qual INTO q_rake FROM pg_policies WHERE schemaname='public' AND tablename='rake_history';
  SELECT qual INTO q_rb FROM pg_policies WHERE schemaname='public' AND tablename='rakeback_distributions';
  IF q_rake NOT LIKE '%fn_my_club_ids%' OR q_rb NOT LIKE '%fn_my_club_ids%' THEN
    RAISE EXCEPTION 'POST-APPLY: a policy is not using the set-returning helper.';
  END IF;
  IF q_rake LIKE '%fn_is_club_member_uid%' OR q_rb LIKE '%fn_is_club_member_uid%' THEN
    RAISE EXCEPTION 'POST-APPLY: the per-row membership call survived.';
  END IF;
END $$;

COMMIT;

-- ROLLBACK -- restores the per-row predicate and the 17-second read.
--   BEGIN;
--   DROP POLICY IF EXISTS rake_history_club_member_select ON public.rake_history;
--   CREATE POLICY rake_history_club_member_select ON public.rake_history
--     FOR SELECT TO authenticated
--     USING (fn_is_platform_admin() OR fn_is_club_member_uid(club_id));
--   DROP POLICY IF EXISTS rakeback_distributions_club_member_select ON public.rakeback_distributions;
--   CREATE POLICY rakeback_distributions_club_member_select ON public.rakeback_distributions
--     FOR SELECT TO authenticated
--     USING (fn_is_platform_admin() OR fn_is_club_member_uid(club_id));
--   COMMIT;
