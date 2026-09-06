-- Phase 6 Marketplace recertification: close the Lifetime purchase exposure,
-- prevent concurrent active card checkouts, and make operator Diamond refunds
-- honor the version the operator reviewed.

BEGIN;

ALTER TABLE public.vip_lifetime_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.vip_lifetime_purchases
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vip_lifetime_purchases
  TO service_role;

-- There were zero Lifetime card purchase rows when this index was preflighted
-- against production on 2026-09-06. The predicate allows an expired/failed or
-- refunded attempt to be replaced while ensuring two tabs cannot each create
-- a live $499 session for one account.
CREATE UNIQUE INDEX IF NOT EXISTS vip_lifetime_purchases_one_active_per_user_uidx
  ON public.vip_lifetime_purchases(user_id)
  WHERE status IN ('pending', 'completed');

CREATE OR REPLACE FUNCTION public.refund_diamond_merch_order_atomic_v2(
  p_order_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_reference_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order public.merchandise_orders%ROWTYPE;
  v_from_status text;
  v_refund integer;
  v_wallet jsonb;
  v_stock_lines jsonb;
BEGIN
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_version');
  END IF;
  IF p_reference_id IS NULL OR length(p_reference_id) < 16 OR length(p_reference_id) > 180 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reference');
  END IF;

  SELECT * INTO v_order
    FROM public.merchandise_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;
  IF v_order.payment_method <> 'diamonds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_diamond_order');
  END IF;

  v_refund := GREATEST(0, v_order.diamonds_spent - v_order.refunded_diamonds);
  IF v_refund = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_order.id,
      'refunded_diamonds', v_order.refunded_diamonds,
      'fulfillment_version', v_order.fulfillment_version
    );
  END IF;

  -- The lock makes this comparison authoritative. A packing/shipping action
  -- that landed after the operator opened the drawer invalidates the refund.
  IF v_order.fulfillment_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'version_conflict',
      'fulfillment_version', v_order.fulfillment_version
    );
  END IF;
  IF v_order.status IN ('shipped', 'delivered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_fulfilled');
  END IF;
  IF COALESCE(v_order.metadata ->> 'fulfillment_mode', '') = 'automatic'
     OR NULLIF(v_order.metadata ->> 'printful_order_id', '') IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'provider_cancellation_required'
    );
  END IF;
  v_from_status := v_order.status;

  v_wallet := public.add_diamonds_to_balance(
    v_order.user_id,
    v_refund,
    'refund',
    'Refund - Diamond merchandise order ' || v_order.id::text,
    p_reference_id
  );
  IF COALESCE((v_wallet ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Diamond merchandise refund wallet credit failed: %',
      COALESCE(v_wallet ->> 'error', 'unknown_error');
  END IF;

  IF NOT v_order.stock_restored THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', item ->> 'id',
      'variant_id', item ->> 'variantId',
      'qty', (item ->> 'quantity')::integer
    )) INTO v_stock_lines
      FROM jsonb_array_elements(v_order.items) AS item
     WHERE COALESCE((item ->> 'madeToOrder')::boolean, false) IS NOT TRUE;
    IF v_stock_lines IS NOT NULL THEN
      PERFORM public.release_merch_order(v_stock_lines);
    END IF;
  END IF;

  UPDATE public.merchandise_orders
     SET status = 'refunded',
         refunded_diamonds = diamonds_spent,
         refunded_at = now(),
         stock_restored = true,
         fulfillment_version = fulfillment_version + 1,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'fulfillment_status', 'refunded',
           'needs_review', false,
           'refunded_by', p_actor_id,
           'refunded_at', now()
         ),
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  INSERT INTO public.merchandise_order_events(
    order_id, actor_id, action, from_status, to_status, details
  ) VALUES (
    v_order.id, p_actor_id, 'refund', v_from_status, 'refunded',
    jsonb_build_object('diamonds', v_refund, 'reference_id', p_reference_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'order_id', v_order.id,
    'refunded_diamonds', v_refund,
    'new_balance', v_wallet -> 'new_balance',
    'fulfillment_version', v_order.fulfillment_version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_diamond_merch_order_atomic_v2(
  uuid, uuid, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_diamond_merch_order_atomic_v2(
  uuid, uuid, integer, text
) TO service_role;

DO $postcheck$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class
   WHERE oid = 'public.vip_lifetime_purchases'::regclass;
  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'vip_lifetime_purchases RLS is disabled';
  END IF;
  IF has_table_privilege('anon', 'public.vip_lifetime_purchases', 'SELECT')
     OR has_table_privilege('anon', 'public.vip_lifetime_purchases', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vip_lifetime_purchases', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vip_lifetime_purchases', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vip_lifetime_purchases', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.vip_lifetime_purchases', 'DELETE') THEN
    RAISE EXCEPTION 'vip_lifetime_purchases still has client table privileges';
  END IF;
  IF to_regclass('public.vip_lifetime_purchases_one_active_per_user_uidx') IS NULL THEN
    RAISE EXCEPTION 'Lifetime active-purchase uniqueness guard is missing';
  END IF;
  IF to_regprocedure(
    'public.refund_diamond_merch_order_atomic_v2(uuid,uuid,integer,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'versioned Diamond merchandise refund RPC is missing';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.refund_diamond_merch_order_atomic_v2(uuid,uuid,integer,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.refund_diamond_merch_order_atomic_v2(uuid,uuid,integer,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'versioned Diamond merchandise refund RPC is client-executable';
  END IF;
END
$postcheck$;

COMMIT;
