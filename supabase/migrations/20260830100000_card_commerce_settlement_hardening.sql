-- Atomic card settlement and durable card-funded redemption.
BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_lease_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.stripe_webhook_events(event_id, event_type, processing_status, locked_at)
  VALUES (p_event_id, p_event_type, 'processing', now())
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_event;
  IF FOUND THEN RETURN jsonb_build_object('claimed', true, 'state', 'processing'); END IF;

  SELECT * INTO v_event FROM public.stripe_webhook_events WHERE event_id = p_event_id FOR UPDATE;
  IF v_event.processing_status = 'done' THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'done');
  END IF;
  IF v_event.locked_at IS NULL
     OR v_event.locked_at < now() - make_interval(secs => GREATEST(30, p_lease_seconds)) THEN
    UPDATE public.stripe_webhook_events
       SET processing_status = 'processing', locked_at = now()
     WHERE event_id = p_event_id;
    RETURN jsonb_build_object('claimed', true, 'state', 'reclaimed');
  END IF;
  RETURN jsonb_build_object('claimed', false, 'state', 'processing');
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_stripe_webhook_event(p_event_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.stripe_webhook_events
     SET processing_status = 'done', completed_at = now(), locked_at = NULL
   WHERE event_id = p_event_id
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_merchandise_orders_checkout_session
  ON public.merchandise_orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vip_diamond_purchase_requests (
  reference_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vip_diamond_purchase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vip_diamond_purchase_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.vip_diamond_purchase_requests TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  p_user_id uuid,
  p_cost integer,
  p_days integer,
  p_plan text,
  p_reference_id text,
  p_request_hash text,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_request public.vip_diamond_purchase_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_reference_id IS NULL OR btrim(p_reference_id) = ''
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_reference_id, 0));
  SELECT * INTO v_request
    FROM public.vip_diamond_purchase_requests
   WHERE reference_id = p_reference_id;
  IF FOUND THEN
    IF v_request.user_id <> p_user_id OR v_request.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
    END IF;
    RETURN v_request.response || jsonb_build_object('duplicate', true);
  END IF;

  v_result := public.purchase_vip_with_diamonds_atomic_v2(
    p_user_id, p_cost, p_days, p_plan, p_reference_id, p_description
  );
  IF COALESCE((v_result ->> 'success')::boolean, false) IS TRUE THEN
    INSERT INTO public.vip_diamond_purchase_requests(reference_id, user_id, request_hash, response)
    VALUES (p_reference_id, p_user_id, p_request_hash, v_result);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_paid_merch_order_atomic(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_shipping_address jsonb,
  p_metadata jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order public.merchandise_orders%ROWTYPE;
  v_stock_lines jsonb;
  v_reservation jsonb := jsonb_build_object('success', true);
  v_stock_taken boolean := true;
  v_mode text;
  v_status text;
  v_metadata jsonb;
BEGIN
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
  END IF;

  SELECT * INTO v_order
    FROM public.merchandise_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;
  IF v_order.payment_method = 'diamonds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'wrong_payment_method');
  END IF;

  IF v_order.status <> 'pending' THEN
    IF v_order.stripe_checkout_session_id = p_session_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'order_id', v_order.id,
        'status', v_order.status,
        'stock_taken', COALESCE((v_order.metadata ->> 'stock_reserved')::boolean, false),
        'metadata', v_order.metadata
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', COALESCE(line ->> 'id', line ->> 'catalogId'),
    'variant_id', COALESCE(line ->> 'variantId', line ->> 'variant_id'),
    'qty', LEAST(GREATEST(COALESCE((line ->> 'quantity')::integer, 1), 1), 10)
  )), '[]'::jsonb)
    INTO v_stock_lines
    FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) line
   WHERE COALESCE((line ->> 'madeToOrder')::boolean, false) IS NOT TRUE;

  IF jsonb_array_length(v_stock_lines) > 0 THEN
    v_reservation := public.reserve_merch_order(v_stock_lines);
    v_stock_taken := COALESCE((v_reservation ->> 'success')::boolean, false);
  END IF;

  v_mode := CASE WHEN COALESCE(p_metadata ->> 'fulfillment_mode', '') = 'automatic'
    THEN 'automatic' ELSE 'manual' END;
  v_status := CASE WHEN v_stock_taken AND v_mode = 'automatic' THEN 'processing' ELSE 'paid' END;
  v_metadata := COALESCE(v_order.metadata, '{}'::jsonb)
    || COALESCE(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'stock_reserved', v_stock_taken,
      'settled_at', now()
    );
  IF NOT v_stock_taken THEN
    v_metadata := v_metadata || jsonb_build_object(
      'needs_review', true,
      'reason', 'stock_unavailable_at_payment',
      'fulfillment_status', 'blocked',
      'stock_error', v_reservation ->> 'error',
      'flagged_at', now()
    );
  END IF;

  UPDATE public.merchandise_orders
     SET status = v_status,
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = p_payment_intent_id,
         shipping_address = COALESCE(p_shipping_address, shipping_address),
         metadata = v_metadata,
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'order_id', v_order.id,
    'status', v_order.status,
    'stock_taken', v_stock_taken,
    'metadata', v_order.metadata
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_diamond_card_purchase_atomic(
  p_purchase_id uuid,
  p_session_id text,
  p_payment_intent_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_purchase public.diamond_purchases%ROWTYPE;
  v_credit jsonb;
  v_redemption jsonb;
  v_intent jsonb;
  v_total integer;
  v_new_balance integer;
  v_kind text;
BEGIN
  SELECT * INTO v_purchase
    FROM public.diamond_purchases
   WHERE id = p_purchase_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
  END IF;

  IF v_purchase.status = 'completed' THEN
    IF v_purchase.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'purchase_id', v_purchase.id,
      'redemption_status', v_purchase.metadata ->> 'redemption_status'
    );
  END IF;
  IF v_purchase.status = 'refunded'
     AND COALESCE((v_purchase.metadata ->> 'refund_before_settlement')::boolean, false) THEN
    IF v_purchase.stripe_checkout_session_id IS NOT NULL
       AND v_purchase.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
    END IF;
    IF v_purchase.stripe_payment_intent_id IS NOT NULL
       AND v_purchase.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
    END IF;
    UPDATE public.diamond_purchases
       SET stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, p_session_id),
           stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent_id),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('terminal_settlement_acknowledged_at', now()),
           updated_at = now()
     WHERE id = v_purchase.id;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'terminal_refund', true,
      'purchase_id', v_purchase.id,
      'redemption_status', 'not_requested'
    );
  END IF;
  IF v_purchase.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_pending');
  END IF;

  v_total := COALESCE(v_purchase.diamonds_amount, 0) + COALESCE(v_purchase.bonus_diamonds, 0);
  v_credit := public.add_diamonds_to_balance(
    v_purchase.user_id,
    v_total,
    'purchase',
    'Purchased ' || COALESCE(v_purchase.package_name, 'Diamond package') || ' (' || v_total || ' diamonds)',
    v_purchase.id::text
  );
  IF COALESCE((v_credit ->> 'success')::boolean, false) IS NOT TRUE
     AND COALESCE((v_credit ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'diamond_credit_failed:%', COALESCE(v_credit ->> 'error', 'unknown');
  END IF;

  v_intent := COALESCE(v_purchase.metadata -> 'redemption_intent', '{}'::jsonb);
  v_kind := v_intent ->> 'kind';
  IF v_kind = 'club_shop' THEN
    v_redemption := public.fn_purchase_club_shop_item_diamonds(
      (v_intent ->> 'club_id')::uuid,
      v_purchase.user_id,
      (v_intent ->> 'item_id')::uuid,
      'card-redemption:' || v_purchase.id::text
    );
  ELSIF v_kind = 'vip_daily' THEN
    v_redemption := public.purchase_vip_with_diamonds_atomic_v2(
      v_purchase.user_id,
      150,
      1,
      'daily',
      'card-redemption:' || v_purchase.id::text,
      'VIP Daily Pass (Card Funded)'
    );
  ELSE
    v_redemption := jsonb_build_object('success', true, 'skipped', true);
  END IF;

  SELECT COALESCE(diamonds, 0) INTO v_new_balance
    FROM public.profiles WHERE id = v_purchase.user_id;

  UPDATE public.diamond_purchases
     SET status = 'completed',
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = p_payment_intent_id,
         completed_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'redemption_status', CASE
             WHEN v_kind IS NULL THEN 'not_requested'
             WHEN COALESCE((v_redemption ->> 'success')::boolean, false) THEN 'completed'
             ELSE 'needs_review'
           END,
           'redemption_error', CASE
             WHEN COALESCE((v_redemption ->> 'success')::boolean, false) THEN NULL
             ELSE v_redemption ->> 'error'
           END,
           'redemption_result', v_redemption,
           'settled_at', now()
         )
   WHERE id = v_purchase.id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'purchase_id', v_purchase.id,
    'new_balance', v_new_balance,
    'redemption_status', CASE
      WHEN v_kind IS NULL THEN 'not_requested'
      WHEN COALESCE((v_redemption ->> 'success')::boolean, false) THEN 'completed'
      ELSE 'needs_review'
    END,
    'redemption', v_redemption
  );
END;
$function$;

-- Review flags never authorize manual shipping. An automatic/provider-unknown
-- order must be reconciled and explicitly converted through a future audited
-- provider-cancellation flow before this operator RPC may touch it.
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
  SELECT * INTO v_order FROM public.merchandise_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'order_not_found'); END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_order.fulfillment_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'version_conflict', 'current_version', v_order.fulfillment_version);
  END IF;
  IF v_order.status IN ('refunded', 'canceled', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_terminal');
  END IF;
  IF COALESCE(v_order.metadata ->> 'fulfillment_mode', '') <> 'manual' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_manual_order');
  END IF;
  IF COALESCE(v_order.metadata ->> 'reason', '') = 'shipping_address_incomplete'
     OR v_order.shipping_address IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'shipping_address_required');
  END IF;
  v_from_status := v_order.status;
  IF p_action = 'mark_processing' AND v_order.status = 'paid' THEN
    v_next_status := 'processing'; v_next_fulfillment := 'processing';
  ELSIF p_action = 'mark_shipped' AND v_order.status IN ('paid', 'processing') THEN
    IF p_tracking_number IS NULL OR btrim(p_tracking_number) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'tracking_required');
    END IF;
    v_next_status := 'shipped'; v_next_fulfillment := 'shipped';
  ELSIF p_action = 'mark_delivered' AND v_order.status = 'shipped' THEN
    v_next_status := 'delivered'; v_next_fulfillment := 'delivered';
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
           'fulfillment_status', v_next_fulfillment, 'needs_review', false,
           'last_operator_id', p_actor_id, 'last_transition_at', now()),
         updated_at = now()
   WHERE id = v_order.id RETURNING * INTO v_order;
  INSERT INTO public.merchandise_order_events(order_id, actor_id, action, from_status, to_status, details)
  VALUES (v_order.id, p_actor_id, p_action, v_from_status, v_next_status,
    jsonb_build_object('tracking_number', p_tracking_number, 'tracking_url', p_tracking_url, 'carrier', p_carrier));
  RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'status', v_order.status,
    'fulfillment_version', v_order.fulfillment_version);
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_paid_merch_order_atomic(uuid,text,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_paid_merch_order_atomic(uuid,text,text,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.settle_diamond_card_purchase_atomic(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_diamond_card_purchase_atomic(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.transition_merchandise_fulfillment(uuid,uuid,integer,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_merchandise_fulfillment(uuid,uuid,integer,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text,text,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_stripe_webhook_event(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_stripe_webhook_event(text) TO service_role;

COMMIT;
