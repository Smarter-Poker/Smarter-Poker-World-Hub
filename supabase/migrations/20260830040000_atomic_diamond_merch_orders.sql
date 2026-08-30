-- Atomic Diamond-funded merchandise checkout.
--
-- The legacy endpoint reserved stock, debited the wallet, and inserted the
-- order in three independent transactions. Compensating releases/refunds
-- handled ordinary errors, but a serverless process termination between
-- those calls could still strand stock or charge a customer without an order.
-- This function makes catalog validation, stock reservation, wallet debit,
-- ledger insertion, and order persistence one PostgreSQL transaction.

BEGIN;

ALTER TABLE public.merchandise_orders
  ADD COLUMN IF NOT EXISTS purchase_reference text,
  ADD COLUMN IF NOT EXISTS refunded_diamonds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_restored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfillment_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.merchandise_orders
  DROP CONSTRAINT IF EXISTS merchandise_orders_refunded_diamonds_nonnegative;
ALTER TABLE public.merchandise_orders
  ADD CONSTRAINT merchandise_orders_refunded_diamonds_nonnegative
  CHECK (refunded_diamonds >= 0 AND refunded_diamonds <= diamonds_spent) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS merchandise_orders_purchase_reference_uidx
  ON public.merchandise_orders (purchase_reference)
  WHERE purchase_reference IS NOT NULL;

COMMENT ON COLUMN public.merchandise_orders.purchase_reference IS
  'Server-generated Diamond-checkout reference. Unique for durable replay-safe settlement.';

CREATE TABLE IF NOT EXISTS public.merchandise_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.merchandise_orders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchandise_order_events_order_created_idx
  ON public.merchandise_order_events(order_id, created_at DESC);
ALTER TABLE public.merchandise_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchandise_order_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.merchandise_order_events TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_merch_with_diamonds_atomic(
  p_user_id uuid,
  p_items jsonb,
  p_purchase_reference text,
  p_request_hash text,
  p_shipping_address jsonb DEFAULT NULL,
  p_fulfillment_mode text DEFAULT 'none',
  p_catalog_provider text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_existing public.merchandise_orders%ROWTYPE;
  v_order public.merchandise_orders%ROWTYPE;
  v_reserve jsonb;
  v_wallet jsonb;
  v_lines jsonb;
  v_order_items jsonb;
  v_total_usd numeric;
  v_total_diamonds integer;
  v_status text;
  v_metadata jsonb;
  v_business_error jsonb;
  v_made_to_order_lines jsonb;
  v_line_count integer;
  v_distinct_count integer;
BEGIN
  IF p_user_id IS NULL
     OR p_purchase_reference IS NULL
     OR length(p_purchase_reference) < 16
     OR length(p_purchase_reference) > 180
     OR p_request_hash IS NULL
     OR p_request_hash !~ '^[a-f0-9]{64}$'
     OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 50
     OR p_fulfillment_mode NOT IN ('none', 'manual', 'automatic')
     OR p_catalog_provider IS NULL
     OR length(p_catalog_provider) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  IF p_shipping_address IS NOT NULL AND jsonb_typeof(p_shipping_address) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_shipping_address');
  END IF;

  -- The reference lock serializes retries even when they land on different
  -- serverless instances. It is held through the order commit.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('merch_diamond:' || p_purchase_reference, 0)
  );

  SELECT * INTO v_existing
    FROM public.merchandise_orders
   WHERE purchase_reference = p_purchase_reference
      OR (purchase_reference IS NULL AND metadata ->> 'purchase_reference' = p_purchase_reference)
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id
       OR v_existing.payment_method <> 'diamonds'
       OR (
         v_existing.metadata ? 'request_hash'
         AND v_existing.metadata ->> 'request_hash' <> p_request_hash
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
    END IF;
    IF v_existing.purchase_reference IS NULL THEN
      UPDATE public.merchandise_orders
         SET purchase_reference = p_purchase_reference
       WHERE id = v_existing.id AND purchase_reference IS NULL;
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_existing.id,
      'items', v_existing.items,
      'total_usd', v_existing.total_usd,
      'diamonds_spent', v_existing.diamonds_spent,
      'new_balance', COALESCE((SELECT diamonds FROM public.profiles WHERE id = p_user_id), 0),
      'status', v_existing.status,
      'fulfillment_status', v_existing.metadata ->> 'fulfillment_status',
      'fulfillment_mode', v_existing.metadata ->> 'fulfillment_mode'
    );
  END IF;

  -- Duplicate item/variant lines make stock validation ambiguous (two lines
  -- can each pass against the same pre-decrement stock). Reject them instead
  -- of allowing a constraint failure or an accidental over-reservation.
  SELECT count(*), count(DISTINCT concat_ws(
      ':',
      COALESCE(line ->> 'id', ''),
      COALESCE(line ->> 'variant_id', '')
    ))
    INTO v_line_count, v_distinct_count
    FROM jsonb_array_elements(p_items) AS line;
  IF v_line_count <> v_distinct_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_lines');
  END IF;

  -- This nested block is a subtransaction. Raising a business exception after
  -- stock reservation rolls back stock, wallet, ledger, and order together;
  -- the exception handler then returns an actionable JSON response.
  BEGIN
    v_reserve := public.reserve_merch_order(p_items, false);
    IF COALESCE((v_reserve ->> 'success')::boolean, false) IS NOT TRUE THEN
      RETURN v_reserve;
    END IF;

    v_lines := v_reserve -> 'lines';
    v_total_usd := COALESCE((v_reserve ->> 'total_usd')::numeric, 0);
    v_total_diamonds := COALESCE((v_reserve ->> 'total_diamonds')::integer, 0);

    IF v_total_usd <= 0 OR v_total_usd > 2000
       OR v_total_diamonds <= 0 OR v_total_diamonds > 20000000 THEN
      v_business_error := jsonb_build_object('success', false, 'error', 'invalid_order_total');
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_order_total';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_lines) AS line
       WHERE (line ->> 'price_usd')::numeric < 0.50
          OR (line ->> 'price_usd')::numeric > 500
          OR COALESCE(NULLIF(line ->> 'price_diamonds', 'null')::integer,
                      CEIL((line ->> 'price_usd')::numeric * 100)::integer) < 1
          OR COALESCE(NULLIF(line ->> 'price_diamonds', 'null')::integer,
                      CEIL((line ->> 'price_usd')::numeric * 100)::integer) > 100000
    ) THEN
      v_business_error := jsonb_build_object('success', false, 'error', 'invalid_item_price');
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_item_price';
    END IF;

    -- Made-to-order rows use catalog stock only as an availability flag. They
    -- are not warehouse units, so restore those reservations inside this same
    -- transaction while retaining real stock decrements for local goods.
    SELECT jsonb_agg(line)
      INTO v_made_to_order_lines
      FROM jsonb_array_elements(v_lines) AS line
      JOIN public.merchandise_items item ON item.id = line ->> 'id'
     WHERE COALESCE((item.metadata ->> 'made_to_order')::boolean, false)
        OR item.metadata ->> 'fulfillment_provider' IN ('printful', 'provider_pending');
    IF v_made_to_order_lines IS NOT NULL THEN
      PERFORM public.release_merch_order(v_made_to_order_lines);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', line ->> 'id',
      'variantId', NULLIF(line ->> 'variant_id', 'null'),
      'name', line ->> 'name',
      'priceUsd', (line ->> 'price_usd')::numeric,
      'diamondPrice', CASE
        WHEN NULLIF(line ->> 'price_diamonds', 'null') IS NULL THEN NULL
        ELSE (line ->> 'price_diamonds')::integer
      END,
      'quantity', (line ->> 'qty')::integer,
      'fulfillmentProvider', COALESCE(item.metadata ->> 'fulfillment_provider', 'manual'),
      'madeToOrder', COALESCE((item.metadata ->> 'made_to_order')::boolean, false)
        OR item.metadata ->> 'fulfillment_provider' IN ('printful', 'provider_pending')
    )), '[]'::jsonb)
      INTO v_order_items
      FROM jsonb_array_elements(v_lines) AS line
      JOIN public.merchandise_items item ON item.id = line ->> 'id';

    v_wallet := public.add_diamonds_to_balance(
      p_user_id,
      -v_total_diamonds,
      'purchase',
      'Merchandise order paid with Diamonds',
      p_purchase_reference
    );
    IF COALESCE((v_wallet ->> 'success')::boolean, false) IS NOT TRUE THEN
      v_business_error := COALESCE(v_wallet, jsonb_build_object(
        'success', false, 'error', 'diamond_debit_failed'
      )) || jsonb_build_object('required_diamonds', v_total_diamonds);
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'diamond_debit_failed';
    END IF;

    v_status := CASE p_fulfillment_mode
      WHEN 'automatic' THEN 'processing'
      WHEN 'manual' THEN 'paid'
      ELSE 'completed'
    END;
    v_metadata := jsonb_build_object(
      'purchase_reference', p_purchase_reference,
      'request_hash', p_request_hash,
      'catalog_provider', p_catalog_provider
    );
    IF p_fulfillment_mode = 'automatic' THEN
      v_metadata := v_metadata || jsonb_build_object(
        'fulfillment_provider', p_catalog_provider,
        'fulfillment_mode', 'automatic',
        'fulfillment_status', 'submitting',
        'needs_review', false
      );
    ELSIF p_fulfillment_mode = 'manual' THEN
      v_metadata := v_metadata || jsonb_build_object(
        'fulfillment_provider', 'manual',
        'catalog_provider', p_catalog_provider,
        'fulfillment_mode', 'manual',
        'fulfillment_status', 'awaiting_manual_fulfillment',
        'needs_review', true,
        'reason', 'automatic_fulfillment_deferred'
      );
    END IF;

    INSERT INTO public.merchandise_orders (
      user_id, items, total_usd, diamonds_spent, payment_method, status,
      shipping_address, metadata, purchase_reference
    ) VALUES (
      p_user_id, v_order_items, v_total_usd, v_total_diamonds, 'diamonds', v_status,
      p_shipping_address, v_metadata, p_purchase_reference
    ) RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', false,
      'order_id', v_order.id,
      'items', v_order.items,
      'total_usd', v_order.total_usd,
      'diamonds_spent', v_order.diamonds_spent,
      'new_balance', v_wallet -> 'new_balance',
      'status', v_order.status,
      'fulfillment_status', v_order.metadata ->> 'fulfillment_status',
      'fulfillment_mode', v_order.metadata ->> 'fulfillment_mode'
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RETURN COALESCE(v_business_error, jsonb_build_object(
        'success', false, 'error', SQLERRM
      ));
    WHEN unique_violation THEN
      -- A pre-existing ledger reference without its matching order is not a
      -- safe replay. The subtransaction has already rolled back this attempt.
      SELECT * INTO v_existing
        FROM public.merchandise_orders
       WHERE purchase_reference = p_purchase_reference;
      IF FOUND AND v_existing.user_id = p_user_id
         AND v_existing.payment_method = 'diamonds'
         AND v_existing.metadata ->> 'request_hash' = p_request_hash THEN
        RETURN jsonb_build_object(
          'success', true,
          'duplicate', true,
          'order_id', v_existing.id,
          'items', v_existing.items,
          'total_usd', v_existing.total_usd,
          'diamonds_spent', v_existing.diamonds_spent,
          'new_balance', COALESCE((SELECT diamonds FROM public.profiles WHERE id = p_user_id), 0),
          'status', v_existing.status,
          'fulfillment_status', v_existing.metadata ->> 'fulfillment_status',
          'fulfillment_mode', v_existing.metadata ->> 'fulfillment_mode'
        );
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_merchandise_fulfillment(
  p_order_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_action text,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_carrier text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order public.merchandise_orders%ROWTYPE;
  v_next_status text;
  v_next_fulfillment text;
  v_from_status text;
BEGIN
  SELECT * INTO v_order
    FROM public.merchandise_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_order.fulfillment_version THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'version_conflict',
      'current_version', v_order.fulfillment_version
    );
  END IF;
  IF v_order.status IN ('refunded', 'canceled', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_terminal');
  END IF;
  IF COALESCE(v_order.metadata ->> 'fulfillment_mode', '') <> 'manual'
     AND COALESCE((v_order.metadata ->> 'needs_review')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_manual_order');
  END IF;
  v_from_status := v_order.status;

  IF p_action = 'mark_processing' AND v_order.status = 'paid' THEN
    v_next_status := 'processing';
    v_next_fulfillment := 'processing';
  ELSIF p_action = 'mark_shipped' AND v_order.status IN ('paid', 'processing') THEN
    IF p_tracking_number IS NULL OR btrim(p_tracking_number) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'tracking_required');
    END IF;
    v_next_status := 'shipped';
    v_next_fulfillment := 'shipped';
  ELSIF p_action = 'mark_delivered' AND v_order.status = 'shipped' THEN
    v_next_status := 'delivered';
    v_next_fulfillment := 'delivered';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition');
  END IF;

  UPDATE public.merchandise_orders
     SET status = v_next_status,
         tracking_number = CASE WHEN p_action = 'mark_shipped' THEN left(p_tracking_number, 160) ELSE tracking_number END,
         tracking_url = CASE WHEN p_action = 'mark_shipped' THEN left(p_tracking_url, 500) ELSE tracking_url END,
         carrier = CASE WHEN p_action = 'mark_shipped' THEN left(p_carrier, 100) ELSE carrier END,
         shipped_at = CASE WHEN p_action = 'mark_shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
         delivered_at = CASE WHEN p_action = 'mark_delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
         fulfillment_version = fulfillment_version + 1,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'fulfillment_status', v_next_fulfillment,
           'needs_review', false,
           'last_operator_id', p_actor_id,
           'last_transition_at', now()
         ),
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  INSERT INTO public.merchandise_order_events(
    order_id, actor_id, action, from_status, to_status, details
  ) VALUES (
    v_order.id, p_actor_id, p_action, v_from_status,
    v_next_status,
    jsonb_build_object(
      'tracking_number', p_tracking_number,
      'tracking_url', p_tracking_url,
      'carrier', p_carrier
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'status', v_order.status,
    'fulfillment_version', v_order.fulfillment_version
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_diamond_merch_order_atomic(
  p_order_id uuid,
  p_actor_id uuid,
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

  v_refund := GREATEST(0, v_order.diamonds_spent - v_order.refunded_diamonds);
  IF v_refund = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'order_id', v_order.id,
      'refunded_diamonds', v_order.refunded_diamonds
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.purchase_vip_with_diamonds_atomic_v2(
  p_user_id uuid,
  p_cost integer,
  p_days integer,
  p_plan text,
  p_reference_id text,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;
  IF v_profile.vip_tier = 'lifetime' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_lifetime',
      'new_balance', COALESCE(v_profile.diamonds, 0),
      'is_vip', true,
      'tier', 'lifetime',
      'expires_at', v_profile.vip_expires_at
    );
  END IF;
  RETURN public.purchase_vip_with_diamonds_atomic(
    p_user_id, p_cost, p_days, p_plan, p_reference_id, p_description
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_merch_with_diamonds_atomic(
  uuid, jsonb, text, text, jsonb, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_merch_with_diamonds_atomic(
  uuid, jsonb, text, text, jsonb, text, text
) TO service_role;
REVOKE ALL ON FUNCTION public.transition_merchandise_fulfillment(
  uuid, uuid, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_merchandise_fulfillment(
  uuid, uuid, integer, text, text, text, text
) TO service_role;
REVOKE ALL ON FUNCTION public.refund_diamond_merch_order_atomic(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_diamond_merch_order_atomic(uuid, uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic_v2(
  uuid, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic_v2(
  uuid, integer, integer, text, text, text
) TO service_role;

DO $postcheck$
BEGIN
  IF to_regprocedure(
    'public.purchase_merch_with_diamonds_atomic(uuid,jsonb,text,text,jsonb,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'atomic Diamond merchandise purchase RPC is missing';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.purchase_merch_with_diamonds_atomic(uuid,jsonb,text,text,jsonb,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.purchase_merch_with_diamonds_atomic(uuid,jsonb,text,text,jsonb,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'atomic Diamond merchandise purchase RPC is client-executable';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.transition_merchandise_fulfillment(uuid,uuid,integer,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.refund_diamond_merch_order_atomic(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'merchandise fulfillment operations are client-executable';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.purchase_vip_with_diamonds_atomic_v2(uuid,integer,integer,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'lifetime-safe VIP purchase RPC is client-executable';
  END IF;
END
$postcheck$;

COMMIT;
