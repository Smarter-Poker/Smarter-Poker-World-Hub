-- Repository parity for the production migration applied as version
-- 20260905153833 (`vip_is_monthly_yearly_or_lifetime`). The live definition
-- was exported with pg_get_functiondef on 2026-09-06 before this file was
-- written. Keeping it here makes a clean schema replay match production.

BEGIN;

ALTER TABLE public.vip_subscriptions
  DROP CONSTRAINT IF EXISTS vip_subscriptions_tier_check;
ALTER TABLE public.vip_subscriptions
  ADD CONSTRAINT vip_subscriptions_tier_check
  CHECK (tier = ANY (ARRAY['monthly'::text, 'yearly'::text, 'lifetime'::text]));

CREATE OR REPLACE FUNCTION public.purchase_vip_with_diamonds_atomic(
    p_user_id uuid,
    p_cost integer,
    p_days integer,
    p_plan text,
    p_reference_id text,
    p_description text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_profile public.profiles%ROWTYPE;
    v_wallet jsonb;
    v_now timestamptz := now();
    v_base timestamptz;
    v_expires timestamptz;
    v_tier text;
    v_existing_rank integer;
    v_requested_rank integer;
    v_lifetime boolean := (p_plan = 'lifetime');
BEGIN
    IF p_cost IS NULL OR p_cost <= 0
       OR p_reference_id IS NULL OR p_reference_id = ''
       OR p_plan NOT IN ('monthly', 'yearly', 'lifetime')
       OR (NOT v_lifetime AND (p_days IS NULL OR p_days <= 0)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
    END IF;

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
        'vip_membership',
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

    IF v_lifetime THEN
        v_tier := 'lifetime';
        v_expires := NULL;
    ELSE
        v_base := CASE
            WHEN v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > v_now
                THEN v_profile.vip_expires_at
            ELSE v_now
        END;
        v_expires := v_base + make_interval(days => p_days);

        v_existing_rank := CASE v_profile.vip_tier
            WHEN 'lifetime' THEN 3 WHEN 'yearly' THEN 2 WHEN 'monthly' THEN 1 ELSE 0 END;
        v_requested_rank := CASE p_plan
            WHEN 'lifetime' THEN 3 WHEN 'yearly' THEN 2 WHEN 'monthly' THEN 1 ELSE 0 END;
        v_tier := CASE
            WHEN v_profile.vip_expires_at > v_now AND v_existing_rank > v_requested_rank
                THEN v_profile.vip_tier
            ELSE p_plan
        END;
    END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic(
  uuid, integer, integer, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic(
  uuid, integer, integer, text, text, text
) TO service_role;

DO $postcheck$
BEGIN
  IF pg_get_constraintdef(
    (SELECT oid FROM pg_constraint
      WHERE conrelid = 'public.vip_subscriptions'::regclass
        AND conname = 'vip_subscriptions_tier_check')
  ) NOT ILIKE '%monthly%yearly%lifetime%' THEN
    RAISE EXCEPTION 'VIP subscription tier constraint did not converge';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.purchase_vip_with_diamonds_atomic(uuid,integer,integer,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.purchase_vip_with_diamonds_atomic(uuid,integer,integer,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'VIP Diamond settlement is client-executable';
  END IF;
END
$postcheck$;

COMMIT;
