-- ═══════════════════════════════════════════════════════════════════════════
-- TRAIN-DATA-ROLLUPS-1 AUDIT FOLLOW-UP — three bug fixes
-- ═══════════════════════════════════════════════════════════════════════════
-- Bugs found in 4-pass audit of the rollup infrastructure:
--   BUG 1 (Medium): training_leaderboard_top materialized view does NOT
--     auto-refresh — leaderboard goes stale as new sessions arrive. Fix:
--     pg_cron job calling training_leaderboard_refresh() every 5 minutes.
--   BUG 2 (Medium): tup_after_session_insert handles INSERT only — DELETEs
--     on jarvis_training_sessions leave the rollup stale (sessions deleted
--     by admin / GDPR purge / account deletion still count in totals).
--     Fix: AFTER DELETE trigger that decrements counters.
--   BUG 3 (Low): training_hand_replay has SELECT/INSERT/DELETE policies but
--     no UPDATE policy — users can't update their own replay entries (e.g.
--     to backfill ev_loss_bb after post-session analysis). Fix: add
--     thr_self_update policy with USING + WITH CHECK on user_id=auth.uid().
--
-- All fixes are additive / non-destructive. Backward-compatible with the
-- existing tup_apply_session, training_hand_replay_recent, and
-- training_leaderboard_refresh functions.
--
-- Applied via Supabase migration tool 2026-05-12 — verified in place.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── BUG 3: thr_self_update policy ─────────────────────────────────────────
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='training_hand_replay'
      AND policyname='thr_self_update'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY thr_self_update ON public.training_hand_replay
        FOR UPDATE TO public
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $sql$;
  END IF;
END
$do$;

-- ─── BUG 2: tup_revert_session — DELETE trigger function ───────────────────
CREATE OR REPLACE FUNCTION public.tup_revert_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := OLD.user_id;
  v_qa   integer := COALESCE(OLD.questions_answered, 0);
  v_qc   integer := COALESCE(OLD.questions_correct, 0);
BEGIN
  IF v_user IS NULL THEN RETURN OLD; END IF;
  -- Decrement counters; clamp at zero so a partial state never becomes
  -- invalid even if the rollup row was previously zeroed.
  UPDATE public.training_user_progress AS p SET
    total_sessions  = GREATEST(0, p.total_sessions  - 1),
    total_questions = GREATEST(0, p.total_questions - v_qa),
    total_correct   = GREATEST(0, p.total_correct   - v_qc),
    updated_at      = now()
  WHERE p.user_id = v_user;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tup_after_session_delete ON public.jarvis_training_sessions;
CREATE TRIGGER tup_after_session_delete
  AFTER DELETE ON public.jarvis_training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tup_revert_session();

-- ─── BUG 1: pg_cron schedule for MV refresh ────────────────────────────────
DO $do$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'training_leaderboard_refresh_every_5m';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END
$do$;

SELECT cron.schedule(
  'training_leaderboard_refresh_every_5m',
  '*/5 * * * *',
  $cron$SELECT public.training_leaderboard_refresh();$cron$
);

-- ─── Verification (rolls back migration if any check fails) ────────────────
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='thr_self_update' AND tablename='training_hand_replay') THEN
    RAISE EXCEPTION 'audit-fix verify: thr_self_update policy missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tup_after_session_delete') THEN
    RAISE EXCEPTION 'audit-fix verify: tup_after_session_delete trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='tup_revert_session') THEN
    RAISE EXCEPTION 'audit-fix verify: tup_revert_session function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='training_leaderboard_refresh_every_5m') THEN
    RAISE EXCEPTION 'audit-fix verify: cron job missing';
  END IF;
END
$verify$;
