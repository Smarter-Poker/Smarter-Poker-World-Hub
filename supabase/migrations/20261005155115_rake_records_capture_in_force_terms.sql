-- ============================================================================
-- 20261005155115_rake_records_capture_in_force_terms.sql
-- ============================================================================
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     public.rake_records, two nullable audit columns
-- IRREVERSIBLE: no
--
-- WHY:
--   Historical rake findings are recomputed from current table configuration
--   because a rake record does not preserve the seat count and cap in force.
--   This adds the honest storage seam. Existing rows remain NULL by design.
--
-- HOW:
--   Add two nullable columns with no non-NULL default and perform no backfill.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.rake_records') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.rake_records does not exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rake_records'
      AND column_name IN ('seat_count_in_force', 'max_rake_cap_in_force')
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: one or more Phase 7 rake audit columns already exist';
  END IF;
END $$;

ALTER TABLE public.rake_records
  ADD COLUMN seat_count_in_force integer,
  ADD COLUMN max_rake_cap_in_force numeric(18,4);

COMMENT ON COLUMN public.rake_records.seat_count_in_force IS
  'Seat count used when rake was assessed. NULL means it was not recorded; Phase 7 does not backfill guesses.';
COMMENT ON COLUMN public.rake_records.max_rake_cap_in_force IS
  'Maximum rake cap in force when rake was assessed. NULL means it was not recorded; Phase 7 does not backfill guesses.';

DO $$
DECLARE
  v_count integer;
  v_nonnull bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'rake_records'
    AND column_name IN ('seat_count_in_force', 'max_rake_cap_in_force')
    AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'post-apply assertion failed: both rake audit columns must be nullable with no default';
  END IF;

  SELECT count(*) INTO v_nonnull FROM public.rake_records
  WHERE seat_count_in_force IS NOT NULL OR max_rake_cap_in_force IS NOT NULL;
  IF v_nonnull <> 0 THEN
    RAISE EXCEPTION 'post-apply assertion failed: existing rake rows were unexpectedly backfilled';
  END IF;
END $$;

COMMIT;
