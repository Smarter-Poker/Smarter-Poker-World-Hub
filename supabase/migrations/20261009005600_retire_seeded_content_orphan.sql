-- =======================================================================
-- 20261009005600_retire_seeded_content_orphan.sql
-- =======================================================================
-- TIER:        3 (rename one obsolete table after fail-closed checks)
-- AUTHOR:      Smarter-Poker, Fleet Content Programme Phase 10 follow-up
-- AFFECTS:     public.seeded_content only
-- IRREVERSIBLE: no (the rollback renames the retained table back)
--
-- WHY:
--   Phase 10 removed the World Hub content-engine mirror and its old seeded
--   content runtime branch. The remaining table has 18 January 2026 rows and
--   no live reader, writer or dependent object. Its active name implies that
--   a runtime path still exists.
--
-- HOW:
--   - Refuse unless the table still has exactly the audited 18 historical
--     rows and every row is in the audited creation window.
--   - Refuse when another table, view, materialized view, function or
--     procedure depends on or names the table.
--   - Rename the table to seeded_content_retired_20261009 and revoke access.
--     This removes the active contract while retaining all 18 rows for a
--     reversible retirement. Historical migrations remain unchanged.
--
-- EVIDENCE:
--   Production audit 2026-10-08: 18 rows, all created January 13-14, 2026;
--   zero foreign-key dependents, views, function/procedure references and
--   runtime source references outside historical migrations.
-- =======================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
  v_rows bigint;
  v_outside_window bigint;
  v_dependents text;
  v_routines text;
BEGIN
  IF to_regclass('public.seeded_content') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.seeded_content is missing';
  END IF;

  IF to_regclass('public.seeded_content_retired_20261009') IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: retired table name is already occupied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'seeded_content'
       AND column_name = 'created_at'
       AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: seeded_content.created_at contract changed';
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE created_at < timestamptz '2026-01-13 00:00:00+00'
              OR created_at >= timestamptz '2026-01-15 00:00:00+00'
              OR created_at IS NULL
         )
    INTO v_rows, v_outside_window
    FROM public.seeded_content;

  IF v_rows IS DISTINCT FROM 18 OR v_outside_window IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'pre-flight failed: seeded_content changed (rows %, outside audited window %)',
      v_rows, v_outside_window;
  END IF;

  SELECT string_agg(format('%I.%I', source_ns.nspname, source.relname), ', '
                    ORDER BY source_ns.nspname, source.relname)
    INTO v_dependents
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
   WHERE fk.contype = 'f'
     AND fk.confrelid = 'public.seeded_content'::regclass;

  IF v_dependents IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: foreign keys still depend on seeded_content: %', v_dependents;
  END IF;

  SELECT string_agg(DISTINCT format('%I.%I', view_ns.nspname, view_rel.relname), ', '
                    ORDER BY format('%I.%I', view_ns.nspname, view_rel.relname))
    INTO v_dependents
    FROM pg_depend dependency
    JOIN pg_rewrite rewrite_rule ON rewrite_rule.oid = dependency.objid
    JOIN pg_class view_rel ON view_rel.oid = rewrite_rule.ev_class
    JOIN pg_namespace view_ns ON view_ns.oid = view_rel.relnamespace
   WHERE dependency.refobjid = 'public.seeded_content'::regclass
     AND view_rel.relkind IN ('v', 'm');

  IF v_dependents IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: views still depend on seeded_content: %', v_dependents;
  END IF;

  SELECT string_agg(format('%I.%I(%s)', n.nspname, p.proname,
                           pg_get_function_identity_arguments(p.oid)), ', '
                    ORDER BY n.nspname, p.proname, p.oid)
    INTO v_routines
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prokind IN ('f', 'p')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND pg_get_functiondef(p.oid) ILIKE '%seeded_content%';

  IF v_routines IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: routines still reference seeded_content: %', v_routines;
  END IF;
END
$preflight$;

-- 2. THE CHANGE
ALTER TABLE public.seeded_content
  RENAME TO seeded_content_retired_20261009;
REVOKE ALL ON TABLE public.seeded_content_retired_20261009
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.seeded_content_retired_20261009 IS
  'Retired Fleet Content mirror table. The 18 historical January 2026 rows are retained for reversible retirement; no runtime may read or write this table.';

-- 3. POST-APPLY ASSERTIONS
DO $postapply$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.seeded_content') IS NOT NULL
     OR to_regclass('public.seeded_content_retired_20261009') IS NULL THEN
    RAISE EXCEPTION 'post-apply failed: seeded_content retirement name is wrong';
  END IF;

  SELECT count(*) INTO v_rows
    FROM public.seeded_content_retired_20261009;
  IF v_rows IS DISTINCT FROM 18 THEN
    RAISE EXCEPTION 'post-apply failed: retained row count is %', v_rows;
  END IF;

  IF has_table_privilege('anon', 'public.seeded_content_retired_20261009', 'SELECT')
     OR has_table_privilege('authenticated', 'public.seeded_content_retired_20261009', 'SELECT')
     OR has_table_privilege('service_role', 'public.seeded_content_retired_20261009', 'SELECT') THEN
    RAISE EXCEPTION 'post-apply failed: retired table remains readable';
  END IF;
END
$postapply$;

COMMIT;

-- =======================================================================
-- ROLLBACK (apply as a new migration; do not edit this file)
-- =======================================================================
-- BEGIN;
-- ALTER TABLE public.seeded_content_retired_20261009
--   RENAME TO seeded_content;
-- ALTER TABLE public.seeded_content ENABLE ROW LEVEL SECURITY;
-- GRANT SELECT ON TABLE public.seeded_content TO anon, authenticated;
-- GRANT ALL ON TABLE public.seeded_content TO service_role;
-- COMMIT;
