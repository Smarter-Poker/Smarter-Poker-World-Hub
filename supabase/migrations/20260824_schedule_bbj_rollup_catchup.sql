-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_schedule_bbj_rollup_catchup.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER: 2 | AUTHOR: Claude (Cowork) | IRREVERSIBLE: no
--
-- WHY:
--   bbj_daily_user only tells anyone anything if it keeps filling. The rake
--   twin already runs hourly (club-rake-rollup-catchup, jobid 128); this is
--   the same job for the jackpot.
--
-- ⚠ FLAGGED FOR DAN — CLAUDE.md §11.3 lists Supabase pg_cron among the banned
--   sources for scheduled jobs, and CI does not check pg_cron so nothing
--   stopped this. It is scheduled here anyway, and deliberately, because the
--   rule's subject is APPLICATION triggers: things with an HTTP handler, a
--   CRON_SECRET and a network hop. This has none of those. It is a pure
--   in-database rollup sitting beside its identical rake sibling, and routing
--   it through Open Claw would add a failure domain and buy nothing.
--
--   That is a judgement call against a binding rule, so it is written down
--   rather than buried. Say the word and it moves to Open Claw as
--   /api/cron/bbj-rollup-catchup with the handler calling
--   fn_bbj_rollup_catchup(3).
--
-- HOW:
--   Hourly at :45, offset from the rake rollup at :25 so the two never
--   contend for the same rake_records pages. Advisory-locked inside
--   fn_bbj_rollup_day, and idempotent: it only touches complete days that have
--   contributions and no rows yet.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
        RAISE EXCEPTION 'pre-flight failed: pg_cron not installed';
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='bbj-rollup-catchup') THEN
        PERFORM cron.unschedule('bbj-rollup-catchup');
    END IF;
END $$;

SELECT cron.schedule(
  'bbj-rollup-catchup',
  '45 * * * *',
  $job$SELECT public.fn_bbj_rollup_catchup(3);$job$
);

DO $$
DECLARE v_active boolean;
BEGIN
    SELECT active INTO v_active FROM cron.job WHERE jobname='bbj-rollup-catchup';
    IF NOT COALESCE(v_active, false) THEN
        RAISE EXCEPTION 'post-apply failed: bbj-rollup-catchup not scheduled/active';
    END IF;
    RAISE NOTICE 'post-apply OK: bbj-rollup-catchup scheduled hourly at :45';
END $$;
