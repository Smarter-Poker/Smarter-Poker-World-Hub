-- =============================================================================
-- 20260906160000_guard_retired_solver_option_rpcs.sql
-- =============================================================================
-- TIER:         3
-- AUTHOR:       codex
-- AFFECTS:      public event-trigger function; database event trigger
-- IRREVERSIBLE: no
--
-- WHY:
--   fn_pio_options_from_solver and fn_chart_options_from_memory were retired
--   twice, yet the live schema had resurrected them without a corresponding
--   migration. Source-order tests catch committed drift, but cannot stop an
--   out-of-band CREATE FUNCTION or ALTER FUNCTION ... RENAME/SET SCHEMA.
--
--   The Pio helper was unsafe: it translated legacy strategy_matrix V1 `f`
--   values (measured EV/regret magnitudes) into Fold frequencies. Both names
--   are permanent tombstones unless a future reviewed migration deliberately
--   removes this guard first.
--
-- HOW:
--   1. Require both retired names and this guard to be absent before install.
--   2. Reject CREATE/ALTER FUNCTION when the resulting public function has a
--      retired name, covering create, replace, rename, and schema moves.
--   3. Revoke every API role from the event-trigger function.
--   4. Assert trigger health and actively prove both names are blocked.
-- =============================================================================

BEGIN;

-- 1. PRE-FLIGHT ASSERTIONS
DO $preflight$
DECLARE
    v_retired_count integer;
    v_guard_count integer;
BEGIN
    SELECT count(*)
    INTO v_retired_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'fn_pio_options_from_solver',
          'fn_chart_options_from_memory'
      );

    IF v_retired_count <> 0 THEN
        RAISE EXCEPTION 'pre-flight failed: % retired solver option RPC overloads exist',
            v_retired_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_event_trigger
        WHERE evtname = 'trg_reject_retired_solver_option_rpc_ddl'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: retired solver RPC DDL trigger already exists';
    END IF;

    SELECT count(*)
    INTO v_guard_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_reject_retired_solver_option_rpc_ddl';

    IF v_guard_count <> 0 THEN
        RAISE EXCEPTION 'pre-flight failed: retired solver RPC guard function already exists';
    END IF;
END;
$preflight$;

-- 2. INSTALL THE LIVE SCHEMA INVARIANT
CREATE FUNCTION public.fn_reject_retired_solver_option_rpc_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
    v_command record;
    v_schema text;
    v_name text;
BEGIN
    FOR v_command IN SELECT * FROM pg_event_trigger_ddl_commands()
    LOOP
        IF lower(coalesce(v_command.object_type, '')) <> 'function' THEN
            CONTINUE;
        END IF;

        v_schema := NULL;
        v_name := NULL;
        SELECT n.nspname, p.proname
        INTO v_schema, v_name
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.oid = v_command.objid;

        IF v_schema = 'public'
           AND v_name IN (
               'fn_pio_options_from_solver',
               'fn_chart_options_from_memory'
           ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '55000',
                MESSAGE = format(
                    'retired solver option RPC recreation blocked: public.%I',
                    v_name
                ),
                HINT = 'A reviewed forward migration must remove the tombstone guard before intentionally reusing this name.';
        END IF;
    END LOOP;
END;
$guard$;

REVOKE ALL ON FUNCTION public.fn_reject_retired_solver_option_rpc_ddl()
FROM PUBLIC, anon, authenticated, service_role;

CREATE EVENT TRIGGER trg_reject_retired_solver_option_rpc_ddl
    ON ddl_command_end
    WHEN TAG IN ('CREATE FUNCTION', 'ALTER FUNCTION')
    EXECUTE FUNCTION public.fn_reject_retired_solver_option_rpc_ddl();

COMMENT ON FUNCTION public.fn_reject_retired_solver_option_rpc_ddl() IS
    'Event-trigger body that permanently tombstones the two retired legacy solver option RPC names.';

COMMENT ON EVENT TRIGGER trg_reject_retired_solver_option_rpc_ddl IS
    'Blocks CREATE/ALTER from recreating either retired legacy solver option RPC in public.';

-- 3. POST-APPLY ASSERTIONS AND ACTIVE TRIGGER PROBE
DO $postapply$
DECLARE
    v_enabled char;
    v_tags text[];
    v_exposed integer;
    v_name text;
    v_blocked boolean;
    v_error text;
    v_remaining integer;
BEGIN
    SELECT evtenabled, evttags
    INTO v_enabled, v_tags
    FROM pg_event_trigger
    WHERE evtname = 'trg_reject_retired_solver_option_rpc_ddl';

    IF v_enabled IS NULL OR v_enabled NOT IN ('O', 'A') THEN
        RAISE EXCEPTION 'post-apply failed: retired solver RPC DDL trigger is missing or disabled (%)',
            coalesce(v_enabled::text, 'missing');
    END IF;

    IF NOT ('CREATE FUNCTION' = ANY(coalesce(v_tags, ARRAY[]::text[])))
       OR NOT ('ALTER FUNCTION' = ANY(coalesce(v_tags, ARRAY[]::text[]))) THEN
        RAISE EXCEPTION 'post-apply failed: retired solver RPC DDL trigger tags are incomplete (%)',
            array_to_string(v_tags, ',');
    END IF;

    SELECT count(*)
    INTO v_exposed
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_reject_retired_solver_option_rpc_ddl'
      AND acl.privilege_type = 'EXECUTE'
      AND (
          acl.grantee = 0
          OR acl.grantee IN (
              SELECT oid
              FROM pg_roles
              WHERE rolname IN ('anon', 'authenticated', 'service_role')
          )
      );

    IF v_exposed <> 0 THEN
        RAISE EXCEPTION 'post-apply failed: guard function has % API-role EXECUTE grants',
            v_exposed;
    END IF;

    FOREACH v_name IN ARRAY ARRAY[
        'fn_pio_options_from_solver',
        'fn_chart_options_from_memory'
    ]
    LOOP
        v_blocked := false;
        v_error := NULL;
        BEGIN
            EXECUTE format(
                'CREATE FUNCTION public.%I() RETURNS integer LANGUAGE sql SET search_path = pg_catalog AS %L',
                v_name,
                'SELECT 1'
            );
        EXCEPTION
            WHEN SQLSTATE '55000' THEN
                GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
                IF v_error LIKE 'retired solver option RPC recreation blocked:%' THEN
                    v_blocked := true;
                ELSE
                    RAISE;
                END IF;
        END;

        IF NOT v_blocked THEN
            RAISE EXCEPTION 'post-apply failed: public.% was not blocked by the DDL trigger',
                v_name;
        END IF;
    END LOOP;

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
        RAISE EXCEPTION 'post-apply failed: active probes left % retired RPC overloads behind',
            v_remaining;
    END IF;
END;
$postapply$;

COMMIT;

-- =============================================================================
-- ROLLBACK (Tier 3)
--
-- This removes only the tombstone. It intentionally does not restore either
-- unsafe legacy RPC. If a future reviewed design reuses a retired name, remove
-- the guard in one forward migration and create the replacement in another.
-- =============================================================================
-- BEGIN;
-- DROP EVENT TRIGGER IF EXISTS trg_reject_retired_solver_option_rpc_ddl;
-- DROP FUNCTION IF EXISTS public.fn_reject_retired_solver_option_rpc_ddl();
-- COMMIT;

