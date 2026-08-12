-- =======================================================================
-- 20260808240000_reserve_merch_order.sql
-- =======================================================================
-- TIER:        2                      (additive: two new functions)
-- AUTHOR:      claude (cowork session, 2026-08-08)
-- AFFECTS:     new public.reserve_merch_order(), public.release_merch_order()
-- IRREVERSIBLE: no
--
-- WHY — two defects with one root cause
-- ───────────────────────────────────────────────────────────────────────
-- Nothing server-side ever looked at stock or at variants during checkout.
--
--   1. STOCK WAS NEVER CHECKED OR DECREMENTED. merchandise_items.stock is read
--      only by merch-catalog.js for display. No checkout endpoint reads it and
--      nothing in the repository has ever written it. Physical goods — a
--      25-unit run of 500-chip sets — could be oversold without limit, and
--      overselling a physical good is a refund and an apology, not a bug you
--      can patch after the fact.
--
--   2. VARIANT PRICE AND STOCK WERE NEVER CHARGED OR VALIDATED.
--      merchandise_item_variants carries its own price_usd, price_diamonds and
--      stock, and was referenced by exactly one file in the repo: the catalog
--      endpoint. Checkout queried merchandise_items alone, so an XXL or a
--      premium colourway was charged the base item price and its stock was
--      never touched.
--
-- These compound in the worst way. The three apparel items (hoodie-neural,
-- tshirt-gto, hat-diamond) have has_variants = true and item-level
-- stock = NULL — "unlimited" — because their real stock lives per variant. So
-- an item-only stock check would treat exactly the size-based products, the
-- ones most likely to sell out in one size, as infinitely available.
--
-- WHAT THIS DOES
--   reserve_merch_order() resolves an entire order in one atomic call:
--   validates every line against the catalog, resolves the authoritative price
--   (variant price where the item has variants, item price otherwise), checks
--   stock and decrements it — all under FOR UPDATE.
--
--   Returning the priced lines from the same call that reserved them is the
--   point: the caller cannot charge one number while reserving against
--   another, because it never computes a price itself.
--
--   TWO PASSES on purpose. Validate and lock every line first, decrement
--   second. A single pass leaves line 1 decremented when line 3 fails.
--
--   NULL stock means unlimited — that is already how the catalog endpoint
--   reads it. An item with has_variants REQUIRES a variant_id; refusing is
--   correct, because guessing a variant either mischarges the customer or
--   ships them the wrong size.
--
--   release_merch_order() is the compensation, for when the charge or the
--   order write fails after stock was taken.
--
-- VERIFIED against the live catalog, inside a rolled-back transaction:
--   * qty equal to stock succeeds and drains it to 0
--   * buying from empty stock is refused with available = 0
--   * a two-line order where the second line is short decrements NOTHING
--   * variant oversell is refused with the variant's own availability
--   * apparel without a variant_id is refused rather than mispriced
--
-- SECURITY: SECURITY DEFINER, service_role only. The callers are the checkout
-- endpoints, which authenticate first. FOR UPDATE serialises concurrent
-- buyers of the last unit.
-- =======================================================================

CREATE OR REPLACE FUNCTION public.reserve_merch_order(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_line        jsonb;
    v_id          text;
    v_variant_id  uuid;
    v_qty         integer;
    v_item        public.merchandise_items%ROWTYPE;
    v_variant     public.merchandise_item_variants%ROWTYPE;
    v_price_usd   numeric;
    v_price_dias  integer;
    v_lines       jsonb := '[]'::jsonb;
    v_total_usd   numeric := 0;
    v_total_dias  integer := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_items');
    END IF;
    IF jsonb_array_length(p_items) > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'too_many_lines');
    END IF;

    -- ── PASS 1: lock, validate, price ─────────────────────────────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_id  := v_line ->> 'id';
        v_qty := COALESCE((v_line ->> 'qty')::int, 0);

        BEGIN
            v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('success', false, 'error', 'bad_variant_id', 'item', v_id);
        END;

        IF v_id IS NULL OR v_qty < 1 OR v_qty > 10 THEN
            RETURN jsonb_build_object('success', false, 'error', 'bad_line', 'item', v_id);
        END IF;

        SELECT * INTO v_item FROM public.merchandise_items
         WHERE id = v_id AND is_active FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'item_unavailable', 'item', v_id);
        END IF;

        IF COALESCE(v_item.has_variants, false) THEN
            IF v_variant_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'variant_required', 'item', v_id);
            END IF;

            SELECT * INTO v_variant FROM public.merchandise_item_variants
             WHERE id = v_variant_id AND item_id = v_id AND COALESCE(is_active, true)
             FOR UPDATE;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'error', 'variant_unavailable', 'item', v_id);
            END IF;

            IF v_variant.stock IS NOT NULL AND v_variant.stock < v_qty THEN
                RETURN jsonb_build_object('success', false, 'error', 'insufficient_stock',
                                          'item', v_id, 'available', v_variant.stock);
            END IF;

            -- Variant price wins; fall back to the item when the variant does
            -- not override it.
            v_price_usd  := COALESCE(v_variant.price_usd, v_item.price_usd);
            v_price_dias := COALESCE(NULLIF(v_variant.price_diamonds, 0),
                                     NULLIF(v_item.price_diamonds, 0));
        ELSE
            IF v_variant_id IS NOT NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'variant_not_applicable', 'item', v_id);
            END IF;
            IF v_item.stock IS NOT NULL AND v_item.stock < v_qty THEN
                RETURN jsonb_build_object('success', false, 'error', 'insufficient_stock',
                                          'item', v_id, 'available', v_item.stock);
            END IF;
            v_price_usd  := v_item.price_usd;
            v_price_dias := NULLIF(v_item.price_diamonds, 0);
        END IF;

        IF v_price_usd IS NULL OR v_price_usd <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'unpriced_item', 'item', v_id);
        END IF;

        v_lines := v_lines || jsonb_build_object(
            'id', v_id,
            'variant_id', v_variant_id,
            'name', v_item.name,
            'qty', v_qty,
            'price_usd', v_price_usd,
            'price_diamonds', v_price_dias
        );
        v_total_usd  := v_total_usd + (v_price_usd * v_qty);
        v_total_dias := v_total_dias
                      + (COALESCE(v_price_dias, CEIL(v_price_usd * 100)::int) * v_qty);
    END LOOP;

    -- ── PASS 2: decrement, now that every line is known good ──────────────
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
        v_id         := v_line ->> 'id';
        v_qty        := (v_line ->> 'qty')::int;
        v_variant_id := NULLIF(v_line ->> 'variant_id', 'null')::uuid;

        IF v_variant_id IS NOT NULL THEN
            UPDATE public.merchandise_item_variants
               SET stock = stock - v_qty, updated_at = now()
             WHERE id = v_variant_id AND stock IS NOT NULL;
        ELSE
            UPDATE public.merchandise_items
               SET stock = stock - v_qty, updated_at = now()
             WHERE id = v_id AND stock IS NOT NULL;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'lines', v_lines,
        'total_usd', v_total_usd,
        'total_diamonds', v_total_dias
    );
END;
$$;

-- Compensation: hand back stock when the charge or the order write fails.
CREATE OR REPLACE FUNCTION public.release_merch_order(p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_line jsonb;
    v_variant_id uuid;
BEGIN
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_lines');
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_variant_id := NULLIF(v_line ->> 'variant_id', 'null')::uuid;
        IF v_variant_id IS NOT NULL THEN
            UPDATE public.merchandise_item_variants
               SET stock = stock + (v_line ->> 'qty')::int, updated_at = now()
             WHERE id = v_variant_id AND stock IS NOT NULL;
        ELSE
            UPDATE public.merchandise_items
               SET stock = stock + (v_line ->> 'qty')::int, updated_at = now()
             WHERE id = v_line ->> 'id' AND stock IS NOT NULL;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_merch_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_merch_order(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_merch_order(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_merch_order(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_merch_order(jsonb) TO service_role;

-- --- POST-APPLY --------------------------------------------------------
DO $postcheck$
BEGIN
    IF has_function_privilege('authenticated', 'public.reserve_merch_order(jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.reserve_merch_order(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: clients can execute reserve_merch_order';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.reserve_merch_order(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: service_role cannot execute reserve_merch_order';
    END IF;
END
$postcheck$;
