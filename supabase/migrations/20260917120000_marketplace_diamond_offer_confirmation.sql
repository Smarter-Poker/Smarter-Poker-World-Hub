-- ═══════════════════════════════════════════════════════════════════════
-- 20260917120000_marketplace_diamond_offer_confirmation.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     public.purchase_merch_with_diamonds_atomic_v2 RPC
-- IRREVERSIBLE: no
--
-- WHY:
--   A Diamond-funded merchandise debit must be bound to the exact account,
--   lines, unit prices, and total the member reviewed. The legacy settlement
--   RPC remains the authoritative atomic debit/order transaction, but it does
--   not accept the reviewed total and unit-price contract.
--
-- HOW:
--   Add a service-role-only wrapper that locks the immutable purchase
--   reference, replays historical exact requests, verifies a locked dry-run
--   quote against the reviewed offer, and then delegates to the established
--   atomic settlement RPC.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure(
    'public.purchase_merch_with_diamonds_atomic(uuid,jsonb,text,text,jsonb,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: purchase_merch_with_diamonds_atomic v1 is missing';
  END IF;

  IF to_regprocedure('public.reserve_merch_order(jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: reserve_merch_order(jsonb,boolean) is missing';
  END IF;

  IF to_regprocedure(
    'public.purchase_merch_with_diamonds_atomic_v2(uuid,jsonb,text,text,text,integer,jsonb,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: purchase_merch_with_diamonds_atomic_v2 already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'merchandise_orders'
       AND column_name IN ('purchase_reference', 'metadata')
     GROUP BY table_schema, table_name
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: merchandise_orders replay columns are missing';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.purchase_merch_with_diamonds_atomic_v2(
  p_user_id uuid,
  p_items jsonb,
  p_purchase_reference text,
  p_request_hash text,
  p_legacy_request_hash text,
  p_expected_total_diamonds integer,
  p_shipping_address jsonb DEFAULT NULL,
  p_fulfillment_mode text DEFAULT 'none',
  p_catalog_provider text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quote jsonb;
  v_expected jsonb;
  v_priced jsonb;
  v_expected_unit integer;
  v_priced_unit integer;
  v_existing_hash text;
  v_replay_hash text;
BEGIN
  IF p_user_id IS NULL
     OR p_purchase_reference IS NULL
     OR length(p_purchase_reference) < 16
     OR length(p_purchase_reference) > 180
     OR p_request_hash IS NULL
     OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR p_legacy_request_hash IS NULL
     OR p_legacy_request_hash !~ '^[a-f0-9]{64}$'
     OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 50
     OR p_expected_total_diamonds IS NULL
     OR p_expected_total_diamonds < 1
     OR p_expected_total_diamonds > 20000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  -- Serialize the entire quote-and-settle operation by the same immutable
  -- reference used by v1. Advisory locks are transaction scoped and reentrant,
  -- so the delegated v1 call below retains the lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('merch_diamond:' || p_purchase_reference, 0)
  );

  -- Historical exact retries must replay before consulting today's catalog.
  -- The v1 function owns the authoritative conflict and receipt checks.
  SELECT metadata ->> 'request_hash'
    INTO v_existing_hash
    FROM public.merchandise_orders
     WHERE purchase_reference = p_purchase_reference
        OR (purchase_reference IS NULL
            AND metadata ->> 'purchase_reference' = p_purchase_reference)
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    v_replay_hash := CASE
      WHEN v_existing_hash = p_legacy_request_hash THEN p_legacy_request_hash
      ELSE p_request_hash
    END;
    RETURN public.purchase_merch_with_diamonds_atomic(
      p_user_id,
      p_items,
      p_purchase_reference,
      v_replay_hash,
      p_shipping_address,
      p_fulfillment_mode,
      p_catalog_provider
    );
  END IF;

  -- The dry-run follows the same catalog/variant/stock code path as settlement.
  -- Its row locks remain held until this wrapper transaction ends, closing the
  -- reprice gap between the comparison and the debit.
  v_quote := public.reserve_merch_order(p_items, true);
  IF COALESCE((v_quote ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_quote;
  END IF;

  IF COALESCE((v_quote ->> 'total_diamonds')::integer, 0)
      <> p_expected_total_diamonds THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_changed');
  END IF;

  IF jsonb_array_length(COALESCE(v_quote -> 'lines', '[]'::jsonb))
      <> jsonb_array_length(p_items) THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_changed');
  END IF;

  FOR v_expected IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_expected) <> 'object'
       OR COALESCE(v_expected ->> 'expected_price_diamonds', '') !~ '^[1-9][0-9]{0,7}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;
    v_expected_unit := (v_expected ->> 'expected_price_diamonds')::integer;

    SELECT line INTO v_priced
      FROM jsonb_array_elements(v_quote -> 'lines') AS line
     WHERE line ->> 'id' = v_expected ->> 'id'
       AND COALESCE(NULLIF(line ->> 'variant_id', 'null'), '')
           = COALESCE(NULLIF(v_expected ->> 'variant_id', 'null'), '')
     LIMIT 1;
    IF NOT FOUND
       OR (v_priced ->> 'qty')::integer <> (v_expected ->> 'qty')::integer THEN
      RETURN jsonb_build_object('success', false, 'error', 'price_changed');
    END IF;

    v_priced_unit := COALESCE(
      NULLIF(v_priced ->> 'price_diamonds', 'null')::integer,
      CEIL((v_priced ->> 'price_usd')::numeric * 100)::integer
    );
    IF v_priced_unit <> v_expected_unit THEN
      RETURN jsonb_build_object('success', false, 'error', 'price_changed');
    END IF;
  END LOOP;

  RETURN public.purchase_merch_with_diamonds_atomic(
    p_user_id,
    p_items,
    p_purchase_reference,
    p_request_hash,
    p_shipping_address,
    p_fulfillment_mode,
    p_catalog_provider
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_merch_with_diamonds_atomic_v2(
  uuid, jsonb, text, text, text, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_merch_with_diamonds_atomic_v2(
  uuid, jsonb, text, text, text, integer, jsonb, text, text
) TO service_role;

COMMENT ON FUNCTION public.purchase_merch_with_diamonds_atomic_v2(
  uuid, jsonb, text, text, text, integer, jsonb, text, text
) IS 'Replays exact historical requests first, then locks and verifies the reviewed Diamond offer before delegating to atomic merchandise settlement.';

DO $postcheck$
DECLARE
  v_function oid;
  v_security_definer boolean;
  v_config text[];
BEGIN
  v_function := to_regprocedure(
    'public.purchase_merch_with_diamonds_atomic_v2(uuid,jsonb,text,text,text,integer,jsonb,text,text)'
  );

  IF v_function IS NULL THEN
    RAISE EXCEPTION 'purchase_merch_with_diamonds_atomic_v2 was not installed';
  END IF;

  SELECT prosecdef, proconfig
    INTO v_security_definer, v_config
    FROM pg_proc
   WHERE oid = v_function;

  IF v_security_definer IS NOT TRUE
     OR NOT ('search_path=public, extensions' = ANY(COALESCE(v_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'purchase_merch_with_diamonds_atomic_v2 security boundary is incomplete';
  END IF;

  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'purchase_merch_with_diamonds_atomic_v2 execute grants are incorrect';
  END IF;
END;
$postcheck$;

COMMIT;
