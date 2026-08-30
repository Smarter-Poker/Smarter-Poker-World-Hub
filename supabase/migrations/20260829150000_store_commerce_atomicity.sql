-- Commerce settlement hardening: cumulative refunds and atomic VIP purchases.
BEGIN;

ALTER TABLE public.diamond_purchases
    ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refunded_diamonds integer NOT NULL DEFAULT 0;

ALTER TABLE public.merchandise_orders
    ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.diamond_purchases
    DROP CONSTRAINT IF EXISTS diamond_purchases_refund_progress_nonnegative;
ALTER TABLE public.diamond_purchases
    ADD CONSTRAINT diamond_purchases_refund_progress_nonnegative
    CHECK (refunded_amount_cents >= 0 AND refunded_diamonds >= 0) NOT VALID;

ALTER TABLE public.merchandise_orders
    DROP CONSTRAINT IF EXISTS merchandise_orders_refund_progress_nonnegative;
ALTER TABLE public.merchandise_orders
    ADD CONSTRAINT merchandise_orders_refund_progress_nonnegative
    CHECK (refunded_amount_cents >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.purchase_vip_with_diamonds_atomic(
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
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
    v_wallet jsonb;
    v_now timestamptz := now();
    v_base timestamptz;
    v_expires timestamptz;
    v_tier text;
    v_existing_rank integer;
    v_requested_rank integer;
BEGIN
    IF p_cost IS NULL OR p_cost <= 0 OR p_days IS NULL OR p_days <= 0
       OR p_reference_id IS NULL OR p_reference_id = ''
       OR p_plan NOT IN ('daily', 'monthly', 'annual') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;

    -- Serialize every debit + extension for this profile. The nested wallet
    -- function takes the same row lock and writes the ledger in this transaction.
    PERFORM 1
      FROM public.profiles
     WHERE id = p_user_id
     FOR UPDATE;

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    v_wallet := public.add_diamonds_to_balance(
        p_user_id,
        -p_cost,
        CASE WHEN p_plan = 'daily' THEN 'vip_daily' ELSE 'vip_membership' END,
        p_description,
        p_reference_id
    );

    IF COALESCE((v_wallet ->> 'success')::boolean, false) IS NOT TRUE THEN
        IF COALESCE((v_wallet ->> 'duplicate')::boolean, false) THEN
            SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
            RETURN jsonb_build_object(
                'success', true,
                'duplicate', true,
                'new_balance', COALESCE(v_profile.diamonds, 0),
                'is_vip', COALESCE(v_profile.is_vip, false),
                'tier', v_profile.vip_tier,
                'expires_at', v_profile.vip_expires_at
            );
        END IF;
        RETURN v_wallet;
    END IF;

    v_base := CASE
        WHEN v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > v_now
            THEN v_profile.vip_expires_at
        ELSE v_now
    END;
    v_expires := v_base + make_interval(days => p_days);

    v_existing_rank := CASE v_profile.vip_tier
        WHEN 'annual' THEN 3 WHEN 'monthly' THEN 2 WHEN 'daily' THEN 1 ELSE 0 END;
    v_requested_rank := CASE p_plan
        WHEN 'annual' THEN 3 WHEN 'monthly' THEN 2 WHEN 'daily' THEN 1 ELSE 0 END;
    v_tier := CASE
        WHEN v_profile.vip_expires_at > v_now AND v_existing_rank > v_requested_rank
            THEN v_profile.vip_tier
        ELSE p_plan
    END;

    UPDATE public.profiles
       SET is_vip = true,
           vip_tier = v_tier,
           vip_expires_at = v_expires,
           updated_at = v_now
     WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'new_balance', v_wallet -> 'new_balance',
        'is_vip', true,
        'tier', v_tier,
        'expires_at', v_expires
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_diamond_purchase_refund(
    p_purchase_id uuid,
    p_charge_amount_cents integer,
    p_refunded_amount_cents integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_purchase public.diamond_purchases%ROWTYPE;
    v_total_diamonds integer;
    v_target_diamonds integer;
    v_delta integer;
    v_wallet jsonb;
    v_cumulative integer;
    v_full boolean;
BEGIN
    IF p_charge_amount_cents IS NULL OR p_charge_amount_cents <= 0
       OR p_refunded_amount_cents IS NULL OR p_refunded_amount_cents < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_refund_amount');
    END IF;

    SELECT * INTO v_purchase
      FROM public.diamond_purchases
     WHERE id = p_purchase_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
    END IF;
    IF v_purchase.status NOT IN ('completed', 'refunded') THEN
        RETURN jsonb_build_object('success', false, 'error', 'purchase_not_settled');
    END IF;

    v_cumulative := LEAST(p_charge_amount_cents, p_refunded_amount_cents);
    IF v_cumulative <= COALESCE(v_purchase.refunded_amount_cents, 0) THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true,
            'refunded_amount_cents', v_purchase.refunded_amount_cents,
            'refunded_diamonds', v_purchase.refunded_diamonds,
            'fully_refunded', v_purchase.status = 'refunded');
    END IF;

    v_total_diamonds := v_purchase.diamonds_amount + COALESCE(v_purchase.bonus_diamonds, 0);
    v_target_diamonds := LEAST(
        v_total_diamonds,
        round(v_total_diamonds::numeric * v_cumulative / p_charge_amount_cents)::integer
    );
    v_delta := GREATEST(0, v_target_diamonds - COALESCE(v_purchase.refunded_diamonds, 0));

    IF v_delta > 0 THEN
        v_wallet := public.add_diamonds_to_balance(
            v_purchase.user_id,
            -v_delta,
            'refund',
            format('Cumulative refund - %s (%s diamonds)', v_purchase.package_name, v_delta),
            format('diamond-refund:%s:%s', v_purchase.id, v_cumulative)
        );
        IF COALESCE((v_wallet ->> 'success')::boolean, false) IS NOT TRUE THEN
            RETURN v_wallet;
        END IF;
    END IF;

    v_full := v_cumulative >= p_charge_amount_cents;
    UPDATE public.diamond_purchases
       SET refunded_amount_cents = v_cumulative,
           refunded_diamonds = v_target_diamonds,
           status = CASE WHEN v_full THEN 'refunded' ELSE 'completed' END,
           refunded_at = CASE WHEN v_full THEN COALESCE(refunded_at, now()) ELSE NULL END
     WHERE id = v_purchase.id;

    RETURN jsonb_build_object('success', true, 'duplicate', false,
        'refunded_amount_cents', v_cumulative,
        'refunded_diamonds', v_target_diamonds,
        'diamonds_deducted', v_delta,
        'fully_refunded', v_full);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic(uuid, integer, integer, text, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_diamond_purchase_refund(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic(uuid, integer, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_diamond_purchase_refund(uuid, integer, integer) TO service_role;

COMMIT;
