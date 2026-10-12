-- TIER: 2; AUTHOR: Codex; AFFECTS: public.reels_delivery_metrics
-- WHY: startup-only rows cannot distinguish measured swipe delay or stalls;
-- unknown timing must remain NULL. Add privacy-safe aggregates, no identity.
-- Baseline 2026-10-12: owner postgres, RLS true, no policies, ~245 rows;
-- existing installed foundation 20261004180000/sequence grants20261004182500.
-- No existing rows, permissions, routines, jobs or financial data are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF to_regclass('public.reels_delivery_metrics') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.reels_delivery_metrics'::regclass AND relrowsecurity
  ) THEN RAISE EXCEPTION 'Reels metrics baseline missing or RLS disabled'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='reels_delivery_metrics' AND column_name='event_kind') THEN
    RAISE EXCEPTION 'Reels event migration already present; never replay installed migration';
  END IF;
END $$;
ALTER TABLE public.reels_delivery_metrics
 ADD COLUMN event_kind text CHECK (event_kind IN ('startup','swipe','summary')),
 ADD COLUMN swipe_ms integer CHECK (swipe_ms BETWEEN 0 AND 120000),
 ADD COLUMN stall_ms integer CHECK (stall_ms BETWEEN 0 AND 3600000),
 ADD COLUMN stall_count integer CHECK (stall_count BETWEEN 0 AND 10000),
 ADD COLUMN transfer_observable boolean,
 ADD COLUMN data_budget_exceeded boolean;
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='reels_delivery_metrics' AND column_name IN
      ('event_kind','swipe_ms','stall_ms','stall_count','transfer_observable','data_budget_exceeded')
      AND is_nullable='YES') <> 6 THEN RAISE EXCEPTION 'Reels metric nullable postimage mismatch'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.reels_delivery_metrics'::regclass)
    OR has_table_privilege('anon','public.reels_delivery_metrics','INSERT')
    OR has_table_privilege('authenticated','public.reels_delivery_metrics','INSERT')
    OR NOT has_table_privilege('service_role','public.reels_delivery_metrics','INSERT') THEN
    RAISE EXCEPTION 'Reels metric permissions postimage mismatch'; END IF;
END $$;
COMMIT;
-- Reversal, if necessary, must be a new qualified migration; never rewrite history.
