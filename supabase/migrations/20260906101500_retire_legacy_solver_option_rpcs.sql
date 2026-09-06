-- =============================================================================
-- 20260906101500_retire_legacy_solver_option_rpcs.sql
-- =============================================================================
-- TIER:        3
-- AUTHOR:      codex
-- AFFECTS:     public functions
-- IRREVERSIBLE: yes
--
-- WHY:
--   Two legacy Training helpers were dropped on 2026-05-13 but are present in
--   production again with execute permission for PUBLIC, anon, authenticated,
--   and service_role. The Pio helper reads legacy strategy_matrix data and
--   converts the legacy `f` value into a fold frequency. The solver warehouse
--   audit proved that field can contain EV or regret magnitudes instead of a
--   probability, so this function can manufacture incorrect poker instruction.
--   Neither helper has a current source caller or a recorded pg_stat_statements
--   caller. Training now reads validated data through its server-side engine.
--
-- HOW:
--   1. Fail if production contains an unexpected overload or implementation.
--   2. Fail if another database object depends on either exact signature.
--   3. Revoke every exposed grant and drop both exact legacy signatures.
--   4. Assert that no overload with either retired name remains.
-- =============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $$
DECLARE
    v_name text;
    v_expected regprocedure;
    v_overloads integer;
    v_target oid;
    v_definition text;
    v_dependents integer;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'fn_pio_options_from_solver',
        'fn_chart_options_from_memory'
    ]
    LOOP
        SELECT count(*)
        INTO v_overloads
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = v_name;

        IF v_overloads > 1 THEN
            RAISE EXCEPTION 'pre-flight failed: public.% has % overloads; expected at most one',
                v_name, v_overloads;
        END IF;

        IF v_overloads = 0 THEN
            CONTINUE;
        END IF;

        v_expected := CASE v_name
            WHEN 'fn_pio_options_from_solver' THEN
                to_regprocedure('public.fn_pio_options_from_solver(text,integer,text,text,text,text)')
            WHEN 'fn_chart_options_from_memory' THEN
                to_regprocedure('public.fn_chart_options_from_memory(text,integer,text,text)')
        END;

        IF v_expected IS NULL THEN
            RAISE EXCEPTION 'pre-flight failed: public.% has an unexpected signature', v_name;
        END IF;

        v_target := v_expected::oid;
        SELECT pg_get_functiondef(v_target) INTO v_definition;

        IF v_name = 'fn_pio_options_from_solver'
           AND (
               v_definition NOT ILIKE '%solved_spots_gold%'
               OR v_definition NOT ILIKE '%strategy_matrix%'
               OR v_definition NOT ILIKE '%f_f%'
               OR v_definition NOT ILIKE '%''Fold''%'
           ) THEN
            RAISE EXCEPTION 'pre-flight failed: public.% is not the audited legacy implementation',
                v_name;
        END IF;

        IF v_name = 'fn_chart_options_from_memory'
           AND (
               v_definition NOT ILIKE '%memory_charts_gold%'
               OR v_definition NOT ILIKE '%hand_matrix%'
               OR v_definition NOT ILIKE '%''Push All-In''%'
           ) THEN
            RAISE EXCEPTION 'pre-flight failed: public.% is not the audited legacy implementation',
                v_name;
        END IF;

        SELECT count(*)
        INTO v_dependents
        FROM pg_depend d
        WHERE d.refclassid = 'pg_proc'::regclass
          AND d.refobjid = v_target
          AND d.deptype NOT IN ('i', 'e');

        IF v_dependents > 0 THEN
            RAISE EXCEPTION 'pre-flight failed: public.% has % database dependents',
                v_name, v_dependents;
        END IF;
    END LOOP;
END $$;

-- 2. REMOVE PUBLICLY CALLABLE LEGACY EXTRACTION PATHS
DO $$
BEGIN
    IF to_regprocedure(
        'public.fn_pio_options_from_solver(text,integer,text,text,text,text)'
    ) IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.fn_pio_options_from_solver(
            text, integer, text, text, text, text
        ) FROM PUBLIC, anon, authenticated, service_role;
    END IF;

    IF to_regprocedure(
        'public.fn_chart_options_from_memory(text,integer,text,text)'
    ) IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.fn_chart_options_from_memory(
            text, integer, text, text
        ) FROM PUBLIC, anon, authenticated, service_role;
    END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_pio_options_from_solver(
    text, integer, text, text, text, text
);
DROP FUNCTION IF EXISTS public.fn_chart_options_from_memory(
    text, integer, text, text
);

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE
    v_remaining integer;
BEGIN
    SELECT count(*)
    INTO v_remaining
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'fn_pio_options_from_solver',
          'fn_chart_options_from_memory'
      );

    IF v_remaining <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: % retired solver RPC overloads remain',
            v_remaining;
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (Tier 3 only)
--
-- The audited implementations cannot be safely restored because one interprets
-- an untrusted legacy field as a probability. This emergency rollback restores
-- only the signatures as service-role-only, fail-closed stubs. Replace the
-- stubs through a separately reviewed forward migration if compatibility is
-- ever required.
-- =============================================================================
-- BEGIN;
-- CREATE FUNCTION public.fn_pio_options_from_solver(
--     text, integer, text, text, text, text
-- ) RETURNS jsonb
-- LANGUAGE plpgsql
-- STABLE
-- SET search_path = ''
-- AS $rollback$
-- BEGIN
--     RAISE EXCEPTION USING
--         ERRCODE = '0A000',
--         MESSAGE = 'legacy solver option extraction is retired';
-- END;
-- $rollback$;
-- REVOKE ALL ON FUNCTION public.fn_pio_options_from_solver(
--     text, integer, text, text, text, text
-- ) FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.fn_pio_options_from_solver(
--     text, integer, text, text, text, text
-- ) TO service_role;
--
-- CREATE FUNCTION public.fn_chart_options_from_memory(
--     text, integer, text, text
-- ) RETURNS jsonb
-- LANGUAGE plpgsql
-- STABLE
-- SET search_path = ''
-- AS $rollback$
-- BEGIN
--     RAISE EXCEPTION USING
--         ERRCODE = '0A000',
--         MESSAGE = 'legacy chart option extraction is retired';
-- END;
-- $rollback$;
-- REVOKE ALL ON FUNCTION public.fn_chart_options_from_memory(
--     text, integer, text, text
-- ) FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.fn_chart_options_from_memory(
--     text, integer, text, text
-- ) TO service_role;
-- COMMIT;
