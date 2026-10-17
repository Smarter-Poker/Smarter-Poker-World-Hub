-- Printful merch the store cannot fulfil is not for sale (2026-10-17).
--
-- Dan's rule: the store never takes money for something it cannot fulfil.
-- After the Printful webhook was registered (World Hub #2475/#2476), Printful
-- holds exactly two products: Diamond Altitude Hoodie and Royal Circuit Tee
-- (Black, S-2XL). Every other Printful catalog row has no Printful product,
-- so a paid order for it could never be submitted. /api/store/readiness
-- therefore reported fulfillmentMode "misconfigured".
--
-- provider_pending is NOT the right state for these: checkout, the merch
-- catalog and purchase-with-diamonds all sell provider_pending rows as
-- manual made-to-order goods. is_active = false is the existing not-for-sale
-- mechanism every sale path filters on (create-checkout-session,
-- merch-catalog, purchase-with-diamonds, the readiness probe). The rows,
-- their names, art and prices stay exactly as they are; each carries
-- sale_paused_reason so it can be switched back on once its Printful
-- product exists and its sync_variant_id is mapped.
--
-- Guarded: every target must still be an active, unmapped Printful row, and
-- the two mapped products must be untouched. Re-running changes nothing.
BEGIN;

DO $$
DECLARE
  v_items text[] := ARRAY[
    'all-in-after-dark-tee', 'cold-four-bet-hoodie', 'dead-money-detector-tee',
    'final-table-voltage-hoodie', 'ice-orbit-snapback', 'midnight-circuit-beanie',
    'hat-diamond', 'no-free-cards-tee', 'range-architect-tee',
    'river-signal-trucker-hat', 'stack-pressure-zip-hoodie',
    'tournament-wire-tumbler', 'vault-cut-poker-towel'];
  v_white uuid[] := ARRAY[
    '36b9bb18-f716-4ab5-909e-6bfc62bb8c92', '69743d24-992e-4ffe-aa4f-580a2143a086',
    '84004d1c-f1b5-410e-a3b9-7794626c948f', 'c1626031-f8de-4575-96ec-31da46a91d56']::uuid[];
  v_mapped integer;
  v_changed integer;
BEGIN
  -- Nothing to do on a re-run.
  IF NOT EXISTS (SELECT 1 FROM public.merchandise_items WHERE id = ANY (v_items) AND is_active)
     AND NOT EXISTS (SELECT 1 FROM public.merchandise_item_variants WHERE id = ANY (v_white) AND is_active) THEN
    RAISE NOTICE 'unfulfillable Printful merch already off sale';
    RETURN;
  END IF;

  -- No target may carry a Printful mapping: a mapped row is fulfillable.
  SELECT count(*) INTO v_mapped
    FROM public.merchandise_item_variants v
   WHERE (v.item_id = ANY (v_items) OR v.id = ANY (v_white))
     AND coalesce(v.metadata ->> 'sync_variant_id', v.metadata -> 'printful' ->> 'sync_variant_id') IS NOT NULL;
  IF v_mapped > 0 THEN
    RAISE EXCEPTION 'refusing: % target variant(s) carry a Printful sync_variant_id', v_mapped;
  END IF;
  IF EXISTS (SELECT 1 FROM public.merchandise_items
              WHERE id = ANY (v_items)
                AND (metadata ->> 'fulfillment_provider' IS DISTINCT FROM 'printful'
                     OR coalesce(metadata ->> 'sync_variant_id', metadata -> 'printful' ->> 'sync_variant_id') IS NOT NULL)) THEN
    RAISE EXCEPTION 'refusing: a target item is not an unmapped Printful row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.merchandise_item_variants
              WHERE id = ANY (v_white) AND item_id <> 'tshirt-gto') THEN
    RAISE EXCEPTION 'refusing: a target variant is not a Royal Circuit Tee variant';
  END IF;

  UPDATE public.merchandise_items
     SET is_active = false,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('sale_paused_reason', 'no_printful_product',
                                 'sale_paused_at', '2026-10-17')
   WHERE id = ANY (v_items) AND is_active;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 13 THEN
    RAISE EXCEPTION 'expected 13 items taken off sale, changed %', v_changed;
  END IF;

  UPDATE public.merchandise_item_variants
     SET is_active = false,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('sale_paused_reason', 'no_printful_product',
                                 'sale_paused_at', '2026-10-17')
   WHERE id = ANY (v_white) AND is_active;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 4 THEN
    RAISE EXCEPTION 'expected 4 Royal Circuit Tee White variants taken off sale, changed %', v_changed;
  END IF;

  -- The two fulfillable products stay on sale with every variant mapped.
  IF (SELECT count(*) FROM public.merchandise_items
       WHERE id IN ('hoodie-neural', 'tshirt-gto') AND is_active) <> 2 THEN
    RAISE EXCEPTION 'a mapped product went off sale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.merchandise_item_variants
              WHERE item_id IN ('hoodie-neural', 'tshirt-gto') AND is_active
                AND coalesce(metadata ->> 'sync_variant_id', metadata -> 'printful' ->> 'sync_variant_id') IS NULL) THEN
    RAISE EXCEPTION 'an active variant of a mapped product is still unmapped';
  END IF;
END $$;

COMMIT;
