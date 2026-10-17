-- =======================================================================
-- test_merch_reservation() keeps testing when no plain item is on sale
-- =======================================================================
-- TIER:        2                    (test-reporting function only)
-- AFFECTS:     public.test_merch_reservation()
-- IRREVERSIBLE: no
--
-- WHY
--   CHECK 10 (scripts/check-economy-invariants.mjs) requires at least seven
--   reservation tests. The function took its fixture from the live catalog:
--   the first ACTIVE non-variant item with finite stock. Since every merch item
--   with no fulfilment provider went off sale on 2026-10-17 (migrations
--   20261017122737 and 20261017123820), none is active, so it returned the
--   single row "fixtures_available = false" and CHECK 10 failed on every PR.
--
--   Now, when no such item is on sale, it uses an off-sale one and sets
--   is_active = true as the first statement inside each probe. Every probe
--   already ends by raising rollback_probe, so that change, like the stock
--   changes, is rolled back and never committed or visible to any other
--   session. Nothing is put back on sale. Tests 6 and 7 still use an active
--   variant item, as before.
-- =======================================================================

CREATE OR REPLACE FUNCTION public.test_merch_reservation()
 RETURNS TABLE(test_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_item      text;
    v_variant   uuid;
    v_res       jsonb;
    v_before    integer;
    v_after     integer;
    v_ok        boolean;
    v_detail    text;
    v_activate  boolean := false;
BEGIN
    -- A plain (non-variant) item with finite stock, and a variant, to test on.
    SELECT id INTO v_item FROM public.merchandise_items
     WHERE is_active AND NOT COALESCE(has_variants, false) AND stock IS NOT NULL
     ORDER BY id LIMIT 1;
    IF v_item IS NULL THEN
        -- No plain item is on sale (each stays off sale until it has a
        -- fulfilment provider). The reservation logic is still tested, on an
        -- off-sale item that is made active only inside each rolled-back probe.
        SELECT id INTO v_item FROM public.merchandise_items
         WHERE NOT COALESCE(has_variants, false) AND stock IS NOT NULL AND price_usd > 0
         ORDER BY id LIMIT 1;
        v_activate := v_item IS NOT NULL;
    END IF;
    SELECT v.id INTO v_variant FROM public.merchandise_item_variants v
      JOIN public.merchandise_items i ON i.id = v.item_id
     WHERE i.is_active AND v.stock IS NOT NULL ORDER BY v.id LIMIT 1;

    IF v_item IS NULL THEN
        test_name := 'fixtures_available'; ok := false;
        detail := 'no non-variant item with finite stock and a price to test against';
        RETURN NEXT; RETURN;
    END IF;

    -- ── 1. A purchase decrements stock by exactly the quantity ────────────
    BEGIN
        v_ok := false; v_detail := '';
        BEGIN
            IF v_activate THEN
                UPDATE public.merchandise_items SET is_active = true WHERE id = v_item;
            END IF;
            SELECT stock INTO v_before FROM public.merchandise_items WHERE id = v_item;
            v_res := public.reserve_merch_order(
                jsonb_build_array(jsonb_build_object('id', v_item, 'qty', 2)));
            SELECT stock INTO v_after FROM public.merchandise_items WHERE id = v_item;
            v_ok := (v_res->>'success')::boolean AND (v_before - v_after) = 2;
            v_detail := format('stock %s -> %s (expected -2)', v_before, v_after);
            RAISE EXCEPTION 'rollback_probe';
        EXCEPTION WHEN others THEN
            IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
        END;
        test_name := 'purchase_decrements_stock'; ok := v_ok; detail := v_detail;
        RETURN NEXT;
    END;

    -- ── 2. Overselling is refused and reports availability ────────────────
    BEGIN
        v_ok := false; v_detail := '';
        BEGIN
            IF v_activate THEN
                UPDATE public.merchandise_items SET is_active = true WHERE id = v_item;
            END IF;
            UPDATE public.merchandise_items SET stock = 1 WHERE id = v_item;
            v_res := public.reserve_merch_order(
                jsonb_build_array(jsonb_build_object('id', v_item, 'qty', 5)));
            SELECT stock INTO v_after FROM public.merchandise_items WHERE id = v_item;
            v_ok := (v_res->>'success')::boolean IS NOT TRUE
                AND v_res->>'error' = 'insufficient_stock'
                AND v_after = 1;   -- refused AND nothing taken
            v_detail := format('error=%s stock_after=%s', v_res->>'error', v_after);
            RAISE EXCEPTION 'rollback_probe';
        EXCEPTION WHEN others THEN
            IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
        END;
        test_name := 'oversell_refused'; ok := v_ok; detail := v_detail;
        RETURN NEXT;
    END;

    -- ── 3. All-or-nothing: one bad line decrements NOTHING ────────────────
    BEGIN
        v_ok := false; v_detail := '';
        BEGIN
            IF v_activate THEN
                UPDATE public.merchandise_items SET is_active = true WHERE id = v_item;
            END IF;
            UPDATE public.merchandise_items SET stock = 1 WHERE id = v_item;
            SELECT stock INTO v_before FROM public.merchandise_items WHERE id = v_item;
            v_res := public.reserve_merch_order(jsonb_build_array(
                jsonb_build_object('id', v_item, 'qty', 1),
                jsonb_build_object('id', 'definitely-not-a-real-item', 'qty', 1)));
            SELECT stock INTO v_after FROM public.merchandise_items WHERE id = v_item;
            v_ok := (v_res->>'success')::boolean IS NOT TRUE AND v_before = v_after;
            v_detail := format('error=%s stock %s -> %s (must be unchanged)',
                               v_res->>'error', v_before, v_after);
            RAISE EXCEPTION 'rollback_probe';
        EXCEPTION WHEN others THEN
            IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
        END;
        test_name := 'partial_failure_takes_nothing'; ok := v_ok; detail := v_detail;
        RETURN NEXT;
    END;

    -- ── 4. Dry run prices WITHOUT taking stock (the card path) ────────────
    BEGIN
        v_ok := false; v_detail := '';
        BEGIN
            IF v_activate THEN
                UPDATE public.merchandise_items SET is_active = true WHERE id = v_item;
            END IF;
            SELECT stock INTO v_before FROM public.merchandise_items WHERE id = v_item;
            v_res := public.reserve_merch_order(
                jsonb_build_array(jsonb_build_object('id', v_item, 'qty', 1)), true);
            SELECT stock INTO v_after FROM public.merchandise_items WHERE id = v_item;
            v_ok := (v_res->>'success')::boolean
                AND (v_res->>'dry_run')::boolean
                AND v_before = v_after
                AND (v_res->>'total_usd')::numeric > 0;
            v_detail := format('dry_run=%s stock %s -> %s total=%s',
                               v_res->>'dry_run', v_before, v_after, v_res->>'total_usd');
            RAISE EXCEPTION 'rollback_probe';
        EXCEPTION WHEN others THEN
            IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
        END;
        test_name := 'dry_run_takes_no_stock'; ok := v_ok; detail := v_detail;
        RETURN NEXT;
    END;

    -- ── 5. Release hands the stock back (refund / failure compensation) ───
    BEGIN
        v_ok := false; v_detail := '';
        BEGIN
            IF v_activate THEN
                UPDATE public.merchandise_items SET is_active = true WHERE id = v_item;
            END IF;
            SELECT stock INTO v_before FROM public.merchandise_items WHERE id = v_item;
            v_res := public.reserve_merch_order(
                jsonb_build_array(jsonb_build_object('id', v_item, 'qty', 3)));
            PERFORM public.release_merch_order(v_res->'lines');
            SELECT stock INTO v_after FROM public.merchandise_items WHERE id = v_item;
            v_ok := v_before = v_after;
            v_detail := format('stock %s -> %s after reserve+release (must match)', v_before, v_after);
            RAISE EXCEPTION 'rollback_probe';
        EXCEPTION WHEN others THEN
            IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
        END;
        test_name := 'release_restores_stock'; ok := v_ok; detail := v_detail;
        RETURN NEXT;
    END;

    -- ── 6. An item with variants REFUSES a line with no variant_id ────────
    -- Apparel carries item-level stock = NULL, so without this guard exactly
    -- the size-based products would read as infinitely available.
    IF v_variant IS NOT NULL THEN
        BEGIN
            v_ok := false; v_detail := '';
            SELECT item_id INTO v_item FROM public.merchandise_item_variants WHERE id = v_variant;
            v_res := public.reserve_merch_order(
                jsonb_build_array(jsonb_build_object('id', v_item, 'qty', 1)));
            v_ok := (v_res->>'success')::boolean IS NOT TRUE
                AND v_res->>'error' = 'variant_required';
            v_detail := format('error=%s (expected variant_required)', v_res->>'error');
            test_name := 'variant_required_for_apparel'; ok := v_ok; detail := v_detail;
            RETURN NEXT;
        END;

        -- ── 7. A variant purchase decrements the VARIANT's stock ──────────
        BEGIN
            v_ok := false; v_detail := '';
            BEGIN
                SELECT stock INTO v_before FROM public.merchandise_item_variants WHERE id = v_variant;
                v_res := public.reserve_merch_order(jsonb_build_array(
                    jsonb_build_object('id', v_item, 'variant_id', v_variant, 'qty', 1)));
                SELECT stock INTO v_after FROM public.merchandise_item_variants WHERE id = v_variant;
                v_ok := (v_res->>'success')::boolean AND (v_before - v_after) = 1;
                v_detail := format('variant stock %s -> %s (expected -1)', v_before, v_after);
                RAISE EXCEPTION 'rollback_probe';
            EXCEPTION WHEN others THEN
                IF SQLERRM <> 'rollback_probe' THEN v_ok := false; v_detail := SQLERRM; END IF;
            END;
            test_name := 'variant_purchase_decrements_variant'; ok := v_ok; detail := v_detail;
            RETURN NEXT;
        END;
    END IF;

    RETURN;
END;
$function$;

COMMENT ON FUNCTION public.test_merch_reservation() IS
    'Regression tests for reserve/release_merch_order. Each test mutates inside a subtransaction and rolls back, so it is safe to run against production. Called by scripts/check-economy-invariants.mjs in CI.';

REVOKE EXECUTE ON FUNCTION public.test_merch_reservation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.test_merch_reservation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_merch_reservation() TO service_role;
