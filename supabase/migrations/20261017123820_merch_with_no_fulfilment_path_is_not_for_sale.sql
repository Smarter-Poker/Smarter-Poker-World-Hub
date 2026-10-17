-- Merch that nothing can fulfil is not for sale (2026-10-17).
--
-- Dan's rule: the store never takes money for something it cannot fulfil,
-- and Dan does not hand-fulfil orders. After 20261017122737 took the
-- unmapped Printful rows off sale, ten active rows still had no fulfilment
-- provider at all:
--   provider_pending (made to order, "provider_required"): Circuit Breaker
--     Playing Cards, Final Table Mirror Sunglasses, Neural Steel Card
--     Protector, Range Grid Desk Mat, River Read Polarized Sunglasses;
--   no provider (the original static catalog): 100-Chip Travel Set,
--     500-Chip Pro Set, Gold Card Protector, Stealth Card Protector,
--     Premium Playing Cards.
-- Checkout, the merch catalog and purchase-with-diamonds sell every
-- non-Printful row into the manual fulfilment queue, which only a person can
-- work; merchandise_orders has never recorded a fulfilled order (1 order in
-- total, a Printful tee, processing). So each of these was a paid order with
-- no one to ship it.
--
-- is_active = false is the not-for-sale mechanism every sale path filters
-- on. Names, art, prices and metadata are kept; each row carries
-- sale_paused_reason so it comes back on sale the day a provider exists.
-- Guarded: every target must still be an active, unmapped, non-Printful row;
-- the two Printful products must stay on sale with every variant mapped.
-- Re-running changes nothing.
BEGIN;

DO $$
DECLARE
  v_items text[] := ARRAY[
    'circuit-breaker-playing-cards', 'final-table-mirror-sunglasses',
    'neural-steel-card-protector', 'range-grid-desk-mat',
    'river-read-polarized-sunglasses',
    'chip-set-100', 'chip-set-500', 'card-protector-gold',
    'card-protector-black', 'deck-premium'];
  v_changed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.merchandise_items WHERE id = ANY (v_items) AND is_active) THEN
    RAISE NOTICE 'merch with no fulfilment path already off sale';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.merchandise_items
              WHERE id = ANY (v_items)
                AND (metadata ->> 'fulfillment_provider' = 'printful'
                     OR coalesce(metadata ->> 'sync_variant_id', metadata -> 'printful' ->> 'sync_variant_id') IS NOT NULL)) THEN
    RAISE EXCEPTION 'refusing: a target item has a Printful provider or mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM public.merchandise_item_variants
              WHERE item_id = ANY (v_items)
                AND coalesce(metadata ->> 'sync_variant_id', metadata -> 'printful' ->> 'sync_variant_id') IS NOT NULL) THEN
    RAISE EXCEPTION 'refusing: a target variant carries a Printful sync_variant_id';
  END IF;

  UPDATE public.merchandise_items
     SET is_active = false,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('sale_paused_reason', 'no_fulfilment_provider',
                                 'sale_paused_at', '2026-10-17')
   WHERE id = ANY (v_items) AND is_active;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  IF v_changed <> 10 THEN
    RAISE EXCEPTION 'expected 10 items taken off sale, changed %', v_changed;
  END IF;

  -- Every active row left is a mapped Printful product.
  IF EXISTS (SELECT 1 FROM public.merchandise_items
              WHERE is_active AND metadata ->> 'fulfillment_provider' IS DISTINCT FROM 'printful') THEN
    RAISE EXCEPTION 'an active item still has no fulfilment provider';
  END IF;
  IF (SELECT count(*) FROM public.merchandise_items
       WHERE id IN ('hoodie-neural', 'tshirt-gto') AND is_active) <> 2 THEN
    RAISE EXCEPTION 'a mapped Printful product went off sale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.merchandise_item_variants
              WHERE item_id IN ('hoodie-neural', 'tshirt-gto') AND is_active
                AND coalesce(metadata ->> 'sync_variant_id', metadata -> 'printful' ->> 'sync_variant_id') IS NULL) THEN
    RAISE EXCEPTION 'an active variant of a mapped product is unmapped';
  END IF;
END $$;

COMMIT;
