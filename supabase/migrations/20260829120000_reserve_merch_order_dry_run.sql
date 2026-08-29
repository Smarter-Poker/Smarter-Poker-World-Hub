-- Adds the non-mutating reservation mode already used by both card checkout
-- and made-to-order Diamond checkout. The original one-argument function
-- remains the single source of truth for validation, pricing, and locking.

DO $migration$
BEGIN
    -- Production may already have the newer native implementation whose
    -- second argument defaults to false. Do not replace it: CREATE OR REPLACE
    -- would try to remove that default and PostgreSQL correctly rejects the
    -- signature change. Older databases still receive this compatibility
    -- overload while retaining their original one-argument function.
    IF to_regprocedure('public.reserve_merch_order(jsonb,boolean)') IS NULL THEN
        EXECUTE $function$
            CREATE FUNCTION public.reserve_merch_order(
                p_items jsonb,
                p_dry_run boolean
            )
            RETURNS jsonb
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            DECLARE
                v_result jsonb;
                v_release jsonb;
            BEGIN
                v_result := public.reserve_merch_order(p_items);

                -- A validation request must leave inventory exactly as it
                -- found it. The reserve and release happen in one transaction
                -- while locks remain held.
                IF p_dry_run AND COALESCE((v_result ->> 'success')::boolean, false) THEN
                    v_release := public.release_merch_order(v_result -> 'lines');
                    IF NOT COALESCE((v_release ->> 'success')::boolean, false) THEN
                        RAISE EXCEPTION 'reserve_merch_order dry-run rollback failed';
                    END IF;
                END IF;

                RETURN v_result;
            END;
            $body$
        $function$;
    END IF;
END;
$migration$;

REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.reserve_merch_order(jsonb, boolean) IS
    'Validates and prices merchandise using the locked reservation path. When p_dry_run is true, inventory is restored before the transaction returns.';
