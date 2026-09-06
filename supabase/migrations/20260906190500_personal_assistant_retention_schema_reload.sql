-- ═══════════════════════════════════════════════════════════════════════
-- 20260906190500_personal_assistant_retention_schema_reload.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         1
-- AUTHOR:       Codex
-- AFFECTS:      PostgREST schema cache
-- IRREVERSIBLE: no
--
-- WHY:
--   The production function exists in Postgres but the first REST probe
--   proved that PostgREST had not discovered its new signature.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.apply_personal_assistant_retention_batch(integer)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: retention batch function not found';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
