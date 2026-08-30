-- Close checkout-claim races and make card refund/stock reconciliation atomic.
BEGIN;

ALTER TABLE public.diamond_purchases
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ux_diamond_checkout_request
  ON public.diamond_purchases(user_id, (metadata ->> 'checkout_request_id'))
  WHERE NULLIF(metadata ->> 'checkout_request_id', '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_merch_checkout_request
  ON public.merchandise_orders(user_id, (metadata ->> 'checkout_request_id'))
  WHERE NULLIF(metadata ->> 'checkout_request_id', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_card_merch_refund_atomic(
  p_order_id uuid,
  p_charge_amount_cents integer,
  p_refunded_amount_cents integer,
  p_metadata_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order public.merchandise_orders%ROWTYPE;
  v_target integer;
  v_full boolean;
  v_lines jsonb;
  v_release jsonb;
  v_restore boolean;
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

  IF v_full AND COALESCE((v_order.metadata ->> 'stock_reserved')::boolean, false)
     AND NOT v_restore THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', COALESCE(line ->> 'id', line ->> 'catalogId'),
      'variant_id', COALESCE(line ->> 'variantId', line ->> 'variant_id'),
      'qty', LEAST(GREATEST(COALESCE((line ->> 'quantity')::integer, 1), 1), 10)
    )), '[]'::jsonb) INTO v_lines
      FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) line
     WHERE COALESCE((line ->> 'madeToOrder')::boolean, false) IS NOT TRUE;
    IF jsonb_array_length(v_lines) > 0 THEN
      v_release := public.release_merch_order(v_lines);
      IF COALESCE((v_release ->> 'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'stock_release_failed:%', COALESCE(v_release ->> 'error', 'unknown');
      END IF;
    END IF;
    v_restore := true;
  END IF;

  UPDATE public.merchandise_orders
     SET refunded_amount_cents = v_target,
         status = CASE WHEN v_full THEN 'refunded' ELSE status END,
         stock_restored = v_restore,
         metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata_patch, '{}'::jsonb)
           || jsonb_build_object('refund_status', CASE WHEN v_full THEN 'full' ELSE 'partial' END,
                                 'refunded_amount_cents', v_target,
                                 'stock_restored', v_restore),
         updated_at = now()
   WHERE id = v_order.id;
  RETURN jsonb_build_object('success', true, 'order_id', v_order.id,
    'fully_refunded', v_full, 'stock_restored', v_restore,
    'refunded_amount_cents', v_target);
END;
$function$;

-- Refunds are chargebacks, so the wallet may become negative when purchased
-- Diamonds were already spent. That negative balance is the enforceable debt:
-- every Diamond purchase path already refuses spends above the live balance,
-- while future earnings automatically repay it.
CREATE OR REPLACE FUNCTION public.reconcile_diamond_purchase_refund(
  p_purchase_id uuid,
  p_charge_amount_cents integer,
  p_refunded_amount_cents integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_purchase public.diamond_purchases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_total integer;
  v_target integer;
  v_delta integer;
  v_full boolean;
  v_intent jsonb;
  v_redemption jsonb;
  v_unwind jsonb;
  v_unwind_state text := 'not_requested';
  v_balance integer;
BEGIN
  IF p_charge_amount_cents IS NULL OR p_charge_amount_cents <= 0
     OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_refund_amount');
  END IF;
  SELECT * INTO v_purchase FROM public.diamond_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_purchase.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  v_total := COALESCE(v_purchase.diamonds_amount, 0) + COALESCE(v_purchase.bonus_diamonds, 0);
  v_target := LEAST(v_total,
    round(v_total::numeric * LEAST(p_charge_amount_cents, p_refunded_amount_cents)
      / p_charge_amount_cents)::integer);
  v_delta := GREATEST(0, v_target - COALESCE(v_purchase.refunded_diamonds, 0));
  v_full := p_refunded_amount_cents >= p_charge_amount_cents;
  v_intent := COALESCE(v_purchase.metadata -> 'redemption_intent', '{}'::jsonb);
  v_redemption := COALESCE(v_purchase.metadata -> 'redemption_result', '{}'::jsonb);

  IF v_full AND COALESCE(v_purchase.metadata ->> 'redemption_status', '') = 'completed'
     AND COALESCE(v_purchase.metadata ->> 'redemption_refund_status', '') NOT IN ('revoked', 'debt_recorded') THEN
    IF v_intent ->> 'kind' = 'club_shop' AND v_redemption ? 'purchase_id' THEN
      v_unwind := public.fn_refund_shop_purchase(
        (v_intent ->> 'club_id')::uuid,
        (v_redemption ->> 'purchase_id')::uuid,
        v_purchase.user_id,
        'Card-funded Club Shop purchase reversed by Stripe refund'
      );
      v_unwind_state := CASE
        WHEN COALESCE((v_unwind ->> 'success')::boolean, false) THEN 'revoked'
        ELSE 'debt_recorded'
      END;
    ELSIF v_intent ->> 'kind' = 'vip_daily' THEN
      IF v_profile.vip_tier = 'daily'
         AND v_profile.vip_expires_at IS NOT NULL
         AND v_redemption ? 'expires_at'
         AND abs(extract(epoch FROM (v_profile.vip_expires_at - (v_redemption ->> 'expires_at')::timestamptz))) < 2 THEN
        UPDATE public.profiles
           SET vip_expires_at = GREATEST(now(), vip_expires_at - interval '1 day'),
               is_vip = (vip_expires_at - interval '1 day') > now(),
               updated_at = now()
         WHERE id = v_purchase.user_id;
        v_unwind_state := 'revoked';
      ELSE
        v_unwind_state := 'debt_recorded';
      END IF;
    END IF;
  END IF;

  IF v_delta > 0 THEN
    UPDATE public.profiles
       SET diamonds = COALESCE(diamonds, 0) - v_delta,
           updated_at = now()
     WHERE id = v_purchase.user_id
     RETURNING diamonds INTO v_balance;
    INSERT INTO public.diamond_transactions(
      user_id, type, amount, balance_after, description, reference_id,
      transaction_type, source, metadata
    ) VALUES (
      v_purchase.user_id, 'refund', -v_delta, v_balance,
      'Stripe refund reconciliation',
      'diamond-refund:' || v_purchase.id::text || ':' || v_target::text,
      'refund', 'stripe',
      jsonb_build_object('purchase_id', v_purchase.id, 'chargeback_debt', v_balance < 0)
    );
  ELSE
    v_balance := COALESCE(v_profile.diamonds, 0);
  END IF;

  UPDATE public.diamond_purchases
     SET refunded_amount_cents = LEAST(p_charge_amount_cents, p_refunded_amount_cents),
         refunded_diamonds = v_target,
         refunded_at = CASE WHEN v_full THEN COALESCE(refunded_at, now()) ELSE refunded_at END,
         status = CASE WHEN v_full THEN 'refunded' ELSE status END,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'redemption_refund_status', v_unwind_state,
           'refund_balance_after', v_balance,
           'chargeback_debt', v_balance < 0,
           'refunded_diamonds', v_target
         ),
         updated_at = now()
   WHERE id = v_purchase.id;
  RETURN jsonb_build_object('success', true, 'fully_refunded', v_full,
    'refunded_diamonds', v_target, 'new_balance', v_balance,
    'redemption_refund_status', v_unwind_state, 'chargeback_debt', v_balance < 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_card_merch_refund_atomic(uuid,integer,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_card_merch_refund_atomic(uuid,integer,integer,jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_diamond_purchase_refund(uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_diamond_purchase_refund(uuid,integer,integer)
  TO service_role;

COMMIT;
