-- Phase 6 deep recertification: retire browser-authored Memory/Preflop rank.
--
-- memory_game_sessions historically accepted score, accuracy, duration, and
-- completion fields from browser clients. A SECURITY DEFINER trigger then
-- promoted those claims into memory_leaderboards, whose UI called the rows
-- verified. RLS scoped the forged row to its owner but did not verify any of
-- its result fields. Ownership is not grading authority.
--
-- The legacy Range Lab is now explicitly free local practice. Keep historical
-- rows readable for honest personal-history/archive surfaces, but freeze both
-- tables until a server-graded attempt receipt can own settlement end-to-end.

DO $phase6$
DECLARE
  policy_row record;
BEGIN
  IF to_regclass('public.memory_game_sessions') IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.memory_game_sessions is missing';
  END IF;
  IF to_regclass('public.memory_leaderboards') IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.memory_leaderboards is missing';
  END IF;

  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('memory_game_sessions', 'memory_leaderboards')
      AND cmd <> 'SELECT'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  END LOOP;
END
$phase6$;

-- The old trigger promoted untrusted browser score fields. Do not leave a
-- dormant laundering path behind after browser writes are revoked.
DROP TRIGGER IF EXISTS trg_memory_promote_session ON public.memory_game_sessions;
DROP FUNCTION IF EXISTS public.fn_memory_promote_session_to_leaderboard();

-- Remove table mutation authority even if a future permissive policy is
-- accidentally added. Both the privilege and RLS layers must agree.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.memory_game_sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.memory_leaderboards FROM PUBLIC, anon, authenticated;

-- Historical reads remain available under explicit, least-privilege rules.
REVOKE SELECT ON TABLE public.memory_game_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.memory_game_sessions TO authenticated;
ALTER TABLE public.memory_game_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_game_sessions_self_read ON public.memory_game_sessions;
CREATE POLICY memory_game_sessions_self_read
  ON public.memory_game_sessions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

GRANT SELECT ON TABLE public.memory_leaderboards TO anon, authenticated;
ALTER TABLE public.memory_leaderboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_leaderboards_read ON public.memory_leaderboards;
CREATE POLICY memory_leaderboards_read
  ON public.memory_leaderboards
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Server infrastructure may read the archive. No application writer is
-- granted here; a future settlement migration must define its own receipt
-- verification and narrowly scoped function.
GRANT SELECT ON TABLE public.memory_game_sessions, public.memory_leaderboards TO service_role;

COMMENT ON TABLE public.memory_game_sessions IS
  'Legacy browser-authored local-practice history. Read-only archive as of Phase 6; not verified training authority.';
COMMENT ON TABLE public.memory_leaderboards IS
  'Frozen legacy local-practice ranking archive. Rows are not server-graded or verified.';

DO $phase6$
DECLARE
  browser_dml_policies bigint;
  trigger_count bigint;
  browser_dml_grants bigint;
BEGIN
  SELECT count(*) INTO browser_dml_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('memory_game_sessions', 'memory_leaderboards')
    AND cmd <> 'SELECT';

  SELECT count(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.memory_game_sessions'::regclass
    AND tgname = 'trg_memory_promote_session'
    AND NOT tgisinternal;

  SELECT count(*) INTO browser_dml_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('memory_game_sessions', 'memory_leaderboards')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  IF browser_dml_policies <> 0 OR trigger_count <> 0 OR browser_dml_grants <> 0 THEN
    RAISE EXCEPTION
      'POST-APPLY FAILED: dml policies %, promotion triggers %, browser dml grants %',
      browser_dml_policies,
      trigger_count,
      browser_dml_grants;
  END IF;
END
$phase6$;
