-- ============================================================================
-- TRAIN-SQL-RLS-1 — close UPDATE/DELETE RLS gap on training_sessions
-- ============================================================================
-- Applied to project kuklfnapbkmacvwxktbh on 2026-05-11.
--
-- State before this migration: training_sessions has RLS enabled with only
--   * INSERT policy "Users can insert own sessions"  (WITH CHECK user_id = auth.uid())
--   * SELECT policy "Users can read their own sessions" (USING user_id = auth.uid())
-- which means UPDATE/DELETE issued from the frontend silently no-op under RLS.
--
-- This migration adds the missing owner-scoped UPDATE and DELETE policies so that
--   (a) the frontend can finalize an in-flight session (write back gtow_score,
--       hands_played, position_stats, etc.) on the same row it inserted,
--   (b) "quit early" can DELETE the pending row instead of orphaning it, and
--   (c) the SECURITY DEFINER rollup trigger tup_after_session_delete continues
--       to fire on legitimate user deletes (it already runs as elevated, but the
--       firing DELETE itself needed an RLS path).
--
-- Both policies are user-scoped via auth.uid(); they cannot widen access.
-- A user with no auth.uid() (anon) is excluded since auth.uid() returns NULL
-- and NULL = user_id is never true.
-- ============================================================================

CREATE POLICY "Users can update own sessions"
  ON public.training_sessions
  FOR UPDATE
  USING ( (SELECT auth.uid()) = user_id )
  WITH CHECK ( (SELECT auth.uid()) = user_id );

CREATE POLICY "Users can delete own sessions"
  ON public.training_sessions
  FOR DELETE
  USING ( (SELECT auth.uid()) = user_id );

COMMENT ON POLICY "Users can update own sessions" ON public.training_sessions IS
  'TRAIN-SQL-RLS-1 — owner-scoped UPDATE so the frontend can finalize stats on its own pending session row.';
COMMENT ON POLICY "Users can delete own sessions" ON public.training_sessions IS
  'TRAIN-SQL-RLS-1 — owner-scoped DELETE so quit-early flows can remove their own pending session row; the rollup trigger tup_after_session_delete then reverts tup totals via SECURITY DEFINER.';
