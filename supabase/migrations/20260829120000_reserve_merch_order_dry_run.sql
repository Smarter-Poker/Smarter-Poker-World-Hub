-- Adds the non-mutating reservation mode already used by both card checkout
-- and made-to-order Diamond checkout. The original one-argument function
-- remains the single source of truth for validation, pricing, and locking.

CREATE OR REPLACE FUNCTION public.reserve_merch_order(
    p_items jsonb,
    p_dry_run boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
    v_release jsonb;
BEGIN
    v_result := public.reserve_merch_order(p_items);

    -- A validation request must leave inventory exactly as it found it. The
    -- reserve and release happen inside this transaction while row locks are
    -- still held, so another checkout cannot observe the temporary decrement.
    IF p_dry_run AND COALESCE((v_result ->> 'success')::boolean, false) THEN
        v_release := public.release_merch_order(v_result -> 'lines');
        IF NOT COALESCE((v_release ->> 'success')::boolean, false) THEN
            RAISE EXCEPTION 'reserve_merch_order dry-run rollback failed';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order(jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.reserve_merch_order(jsonb, boolean) IS
    'Validates and prices merchandise using the locked reservation path. When p_dry_run is true, inventory is restored before the transaction returns.';
