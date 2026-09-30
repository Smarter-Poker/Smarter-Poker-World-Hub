-- ═══════════════════════════════════════════════════════════════════════
-- 20260930030001_phase7_puzzle_policies_answer_once_and_reveal_once.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (six row-level-security policies on the three Phase 7 puzzle tables)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 7
-- AFFECTS:     policies on public.social_puzzles, public.social_puzzle_solutions,
--              public.social_puzzle_answers; nothing else
-- IRREVERSIBLE: no (the ROLLBACK block drops exactly the six policies)
--
-- WHY THIS IS A SEPARATE FILE:
--   20260930030000 creates the tables with their foreign keys to profiles, social_posts
--   and social_comments, which takes a share-row-exclusive lock on those live tables
--   until commit. In this database CREATE POLICY acquires an access-exclusive lock on
--   auth.users (probed on 2026-09-30: CREATE TABLE and ENABLE ROW LEVEL SECURITY do
--   not; CREATE POLICY does, whatever the policy says), and every profiles writer holds
--   a share lock on auth.users for its foreign-key check. Holding the profiles lock
--   while asking for auth.users closed a lock cycle twice (04:43Z and 05:07Z), and the
--   migration was the deadlock victim both times. This file asks only for the
--   auth.users lock, holds nothing the engine writes, and bounds the wait to two
--   seconds so a busy moment is a clean, retryable failure, never a stall.
--
-- BETWEEN THE TWO FILES: RLS is enabled with no policy, so anon and authenticated can
--   neither read nor write the three tables (fail closed); the service role is
--   unaffected (BYPASSRLS). No puzzle exists until the owner enables a mode.
-- ═══════════════════════════════════════════════════════════════════════

SET lock_timeout = '2s';

BEGIN;

-- 1. PRE-FLIGHT: the tables exist with RLS on and no policy yet.
DO $preflight$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     AND c.relname IN ('social_puzzles', 'social_puzzle_solutions', 'social_puzzle_answers');
  IF n <> 3 THEN RAISE EXCEPTION 'pre-flight: expected the 3 puzzle tables with RLS enabled (20260930030000), found %', n; END IF;
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid IN ('public.social_puzzles'::regclass, 'public.social_puzzle_solutions'::regclass, 'public.social_puzzle_answers'::regclass);
  IF n <> 0 THEN RAISE EXCEPTION 'pre-flight: expected no policy on the puzzle tables yet, found %', n; END IF;
END $preflight$;

-- 2. POLICIES (pattern: social_likes)
CREATE POLICY "Public read access" ON public.social_puzzles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access" ON public.social_puzzles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON public.social_puzzle_solutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can insert their own answers" ON public.social_puzzle_answers
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Answers are readable by their author and after the reveal" ON public.social_puzzle_answers
  FOR SELECT TO anon, authenticated USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.social_puzzles p
                WHERE p.id = social_puzzle_answers.puzzle_id AND p.revealed_at IS NOT NULL));
CREATE POLICY "Service role full access" ON public.social_puzzle_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. POST-APPLY
DO $postapply$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.social_puzzles'::regclass;
  IF n <> 2 THEN RAISE EXCEPTION 'post-apply: expected 2 policies on social_puzzles, found %', n; END IF;
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.social_puzzle_answers'::regclass;
  IF n <> 3 THEN RAISE EXCEPTION 'post-apply: expected 3 policies on social_puzzle_answers, found %', n; END IF;
  -- The solution table stays unreadable outside the service role: its only policy is the service role's.
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.social_puzzle_solutions'::regclass
     AND (polroles = '{0}'::oid[]
          OR polroles && ARRAY(SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF n <> 0 THEN RAISE EXCEPTION 'post-apply: social_puzzle_solutions has % policies for anon or authenticated', n; END IF;
END $postapply$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (manual, if ever needed: drops exactly the six policies)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "Public read access" ON public.social_puzzles;
-- DROP POLICY IF EXISTS "Service role full access" ON public.social_puzzles;
-- DROP POLICY IF EXISTS "Service role full access" ON public.social_puzzle_solutions;
-- DROP POLICY IF EXISTS "Users can insert their own answers" ON public.social_puzzle_answers;
-- DROP POLICY IF EXISTS "Answers are readable by their author and after the reveal" ON public.social_puzzle_answers;
-- DROP POLICY IF EXISTS "Service role full access" ON public.social_puzzle_answers;
-- COMMIT;
