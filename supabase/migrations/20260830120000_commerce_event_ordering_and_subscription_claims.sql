-- Final event-ordering, wallet-conservation, and subscription checkout claims.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vip_subscription_checkout_claims (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  intent_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('initializing', 'open')),
  session_id text,
  session_url text,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vip_subscription_checkout_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vip_subscription_checkout_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vip_subscription_checkout_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_vip_subscription_checkout(
  p_user_id uuid, p_request_id text, p_intent_hash text, p_lease_seconds integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_claim public.vip_subscription_checkout_claims%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_intent_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
  END IF;
  SELECT * INTO v_claim FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id FOR UPDATE;
  IF FOUND AND v_claim.expires_at > now() THEN
    IF v_claim.request_id = p_request_id AND v_claim.intent_hash = p_intent_hash THEN
      RETURN jsonb_build_object('claimed', false, 'state', v_claim.state,
        'session_id', v_claim.session_id, 'session_url', v_claim.session_url);
    END IF;
    RETURN jsonb_build_object('claimed', false, 'state', 'conflict');
  END IF;
  DELETE FROM public.vip_subscription_checkout_claims WHERE user_id = p_user_id;
  INSERT INTO public.vip_subscription_checkout_claims(
    user_id, request_id, intent_hash, state, expires_at
  ) VALUES (
    p_user_id, p_request_id, p_intent_hash, 'initializing',
    now() + make_interval(secs => GREATEST(60, p_lease_seconds))
  );
  RETURN jsonb_build_object('claimed', true, 'state', 'initializing');
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_vip_subscription_checkout(
  p_user_id uuid, p_request_id text, p_session_id text, p_session_url text,
  p_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  UPDATE public.vip_subscription_checkout_claims
     SET state = 'open', session_id = p_session_id, session_url = p_session_url,
         expires_at = GREATEST(COALESCE(p_expires_at, now() + interval '30 minutes'), now() + interval '1 minute'),
         updated_at = now()
   WHERE user_id = p_user_id AND request_id = p_request_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_vip_subscription_checkout(
  p_user_id uuid, p_request_id text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $function$
  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id AND request_id = p_request_id
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_card_merch_refund_atomic(
  p_order_id uuid, p_charge_amount_cents integer, p_refunded_amount_cents integer,
  p_metadata_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $function$
DECLARE
  v_order public.merchandise_orders%ROWTYPE;
  v_target integer; v_full boolean; v_lines jsonb; v_release jsonb;
  v_restore boolean; v_metadata jsonb;
BEGIN
  IF p_charge_amount_cents IS NULL OR p_charge_amount_cents <= 0
     OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_refund_amount');
  END IF;
  SELECT * INTO v_order FROM public.merchandise_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'order_not_found'); END IF;
  v_target := GREATEST(COALESCE(v_order.refunded_amount_cents, 0),
    LEAST(p_charge_amount_cents, p_refunded_amount_cents));
  v_full := v_target >= p_charge_amount_cents;
  v_restore := COALESCE(v_order.stock_restored, false);
  IF v_full
     AND v_order.status IN ('pending', 'processing', 'paid', 'completed', 'canceled', 'cancelled', 'failed', 'refunded')
     AND COALESCE((v_order.metadata ->> 'stock_restore_pending_return')::boolean, false) IS NOT TRUE
     AND v_order.shipped_at IS NULL AND v_order.delivered_at IS NULL
     AND COALESCE(v_order.metadata ->> 'fulfillment_status', '') NOT IN ('shipped', 'delivered')
     AND COALESCE((v_order.metadata ->> 'stock_reserved')::boolean, false) AND NOT v_restore THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', COALESCE(line ->> 'id', line ->> 'catalogId'),
      'variant_id', COALESCE(line ->> 'variantId', line ->> 'variant_id'),
      'qty', LEAST(GREATEST(COALESCE((line ->> 'quantity')::integer, 1), 1), 10)
    )), '[]'::jsonb) INTO v_lines FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) line
     WHERE COALESCE((line ->> 'madeToOrder')::boolean, false) IS NOT TRUE;
    IF jsonb_array_length(v_lines) > 0 THEN
      v_release := public.release_merch_order(v_lines);
      IF COALESCE((v_release ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'stock_release_failed:%', COALESCE(v_release ->> 'error', 'unknown');
      END IF;
    END IF;
    v_restore := true;
  END IF;
  v_metadata := COALESCE(v_order.metadata, '{}'::jsonb) || COALESCE(p_metadata_patch, '{}'::jsonb)
    || jsonb_build_object('refund_status', CASE WHEN v_full THEN 'full' ELSE 'partial' END,
      'refunded_amount_cents', v_target, 'stock_restored', v_restore);
  IF v_full AND v_order.status IN ('shipped', 'delivered') AND NOT v_restore THEN
    v_metadata := v_metadata || jsonb_build_object('needs_review', true,
      'reason', 'return_required_before_stock_restore', 'stock_restore_pending_return', true);
  END IF;
  UPDATE public.merchandise_orders SET refunded_amount_cents = v_target,
    status = CASE WHEN v_full THEN 'refunded' ELSE status END, stock_restored = v_restore,
    metadata = v_metadata, updated_at = now() WHERE id = v_order.id;
  RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'fully_refunded', v_full,
    'stock_restored', v_restore, 'refunded_amount_cents', v_target);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_diamond_purchase_refund(
  p_purchase_id uuid, p_charge_amount_cents integer, p_refunded_amount_cents integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $function$
DECLARE
  v_purchase public.diamond_purchases%ROWTYPE; v_profile public.profiles%ROWTYPE;
  v_total integer; v_cumulative integer; v_target integer; v_delta integer; v_full boolean;
  v_intent jsonb; v_redemption jsonb; v_unwind jsonb; v_wallet jsonb;
  v_unwind_state text := 'not_requested'; v_balance integer; v_daily_cost integer := 150;
BEGIN
  IF p_charge_amount_cents IS NULL OR p_charge_amount_cents <= 0
     OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_refund_amount');
  END IF;
  SELECT * INTO v_purchase FROM public.diamond_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found'); END IF;
  v_cumulative := GREATEST(COALESCE(v_purchase.refunded_amount_cents, 0),
    LEAST(p_charge_amount_cents, p_refunded_amount_cents));
  v_full := v_cumulative >= p_charge_amount_cents;
  IF v_purchase.status = 'refunded'
     AND COALESCE((v_purchase.metadata ->> 'refund_before_settlement')::boolean, false) THEN
    UPDATE public.diamond_purchases
       SET refunded_amount_cents = v_cumulative, updated_at = now()
     WHERE id = v_purchase.id;
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'fully_refunded', true,
      'terminal_refund', true, 'refunded_diamonds', 0,
      'new_balance', (SELECT COALESCE(diamonds, diamond_balance, 0)
                        FROM public.profiles WHERE id = v_purchase.user_id));
  END IF;
  IF v_purchase.status = 'pending' THEN
    IF NOT v_full THEN RETURN jsonb_build_object('success', false, 'error', 'settlement_pending'); END IF;
    UPDATE public.diamond_purchases SET status = 'refunded', refunded_amount_cents = v_cumulative,
      refunded_diamonds = 0, refunded_at = COALESCE(refunded_at, now()),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('refund_before_settlement', true),
      updated_at = now() WHERE id = v_purchase.id;
    RETURN jsonb_build_object('success', true, 'fully_refunded', true, 'refunded_diamonds', 0,
      'new_balance', (SELECT COALESCE(diamonds, 0) FROM public.profiles WHERE id = v_purchase.user_id));
  END IF;
  IF v_purchase.status NOT IN ('completed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_settled');
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_purchase.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  v_total := COALESCE(v_purchase.diamonds_amount, 0) + COALESCE(v_purchase.bonus_diamonds, 0);
  v_target := GREATEST(COALESCE(v_purchase.refunded_diamonds, 0),
    LEAST(v_total, round(v_total::numeric * v_cumulative / p_charge_amount_cents)::integer));
  v_delta := GREATEST(0, v_target - COALESCE(v_purchase.refunded_diamonds, 0));
  v_intent := COALESCE(v_purchase.metadata -> 'redemption_intent', '{}'::jsonb);
  v_redemption := COALESCE(v_purchase.metadata -> 'redemption_result', '{}'::jsonb);
  IF v_full AND COALESCE(v_purchase.metadata ->> 'redemption_status', '') = 'completed'
     AND COALESCE(v_purchase.metadata ->> 'redemption_refund_status', '') NOT IN ('revoked', 'debt_recorded') THEN
    IF v_intent ->> 'kind' = 'club_shop' AND v_redemption ? 'purchase_id' THEN
      v_unwind := public.fn_refund_shop_purchase((v_intent ->> 'club_id')::uuid,
        (v_redemption ->> 'purchase_id')::uuid, v_purchase.user_id,
        'Card-funded Club Shop purchase reversed by Stripe refund');
      v_unwind_state := CASE WHEN COALESCE((v_unwind ->> 'success')::boolean, false)
        THEN 'revoked' ELSE 'debt_recorded' END;
    ELSIF v_intent ->> 'kind' = 'vip_daily' THEN
      IF v_profile.vip_tier = 'daily' AND v_profile.vip_expires_at IS NOT NULL
         AND v_redemption ? 'expires_at'
         AND abs(extract(epoch FROM (v_profile.vip_expires_at - (v_redemption ->> 'expires_at')::timestamptz))) < 2 THEN
        UPDATE public.profiles SET vip_expires_at = GREATEST(now(), vip_expires_at - interval '1 day'),
          is_vip = (vip_expires_at - interval '1 day') > now(), updated_at = now()
         WHERE id = v_purchase.user_id;
        v_wallet := public.add_diamonds_to_balance(v_purchase.user_id, v_daily_cost, 'refund',
          'Reversed card-funded VIP Daily Pass', 'card-redemption-refund:' || v_purchase.id::text);
        IF COALESCE((v_wallet ->> 'success')::boolean, false) IS NOT TRUE
           AND COALESCE((v_wallet ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
          RAISE EXCEPTION 'daily_redemption_refund_failed:%', COALESCE(v_wallet ->> 'error', 'unknown');
        END IF;
        v_unwind_state := 'revoked';
      ELSE v_unwind_state := 'debt_recorded'; END IF;
    END IF;
  END IF;
  IF v_delta > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, diamond_balance, 0) - v_delta,
      diamond_balance = COALESCE(diamonds, diamond_balance, 0) - v_delta, updated_at = now()
     WHERE id = v_purchase.user_id RETURNING diamonds INTO v_balance;
    INSERT INTO public.diamond_transactions(user_id,type,amount,balance_after,description,
      reference_id,transaction_type,source,metadata) VALUES (v_purchase.user_id,'refund',-v_delta,
      v_balance,'Stripe refund reconciliation','diamond-refund:' || v_purchase.id::text || ':' || v_target,
      'refund','stripe',jsonb_build_object('purchase_id',v_purchase.id,'chargeback_debt',v_balance < 0));
  ELSE SELECT COALESCE(diamonds, 0) INTO v_balance FROM public.profiles WHERE id = v_purchase.user_id; END IF;
  UPDATE public.diamond_purchases SET refunded_amount_cents = v_cumulative,
    refunded_diamonds = v_target, refunded_at = CASE WHEN v_full THEN COALESCE(refunded_at,now()) ELSE refunded_at END,
    status = CASE WHEN v_full THEN 'refunded' ELSE status END,
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('redemption_refund_status',v_unwind_state,
      'refund_balance_after',v_balance,'chargeback_debt',v_balance < 0,'refunded_diamonds',v_target), updated_at=now()
   WHERE id=v_purchase.id;
  RETURN jsonb_build_object('success',true,'fully_refunded',v_full,'refunded_diamonds',v_target,
    'new_balance',v_balance,'redemption_refund_status',v_unwind_state,'chargeback_debt',v_balance < 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_vip_subscription_checkout(uuid,text,text,integer),
  public.complete_vip_subscription_checkout(uuid,text,text,text,timestamptz),
  public.release_vip_subscription_checkout(uuid,text),
  public.reconcile_card_merch_refund_atomic(uuid,integer,integer,jsonb),
  public.reconcile_diamond_purchase_refund(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip_subscription_checkout(uuid,text,text,integer),
  public.complete_vip_subscription_checkout(uuid,text,text,text,timestamptz),
  public.release_vip_subscription_checkout(uuid,text),
  public.reconcile_card_merch_refund_atomic(uuid,integer,integer,jsonb),
  public.reconcile_diamond_purchase_refund(uuid,integer,integer) TO service_role;

COMMIT;
