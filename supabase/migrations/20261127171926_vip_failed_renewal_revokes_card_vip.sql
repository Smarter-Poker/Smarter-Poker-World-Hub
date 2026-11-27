-- ═══════════════════════════════════════════════════════════════════════
-- 20261127171926_vip_failed_renewal_revokes_card_vip.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        3 (RPC body change on a money-adjacent entitlement path)
-- AUTHOR:      Claude (session 013U37bb1u9RJp2HYifHGgrn)
-- AFFECTS:     public.apply_vip_subscription_projection (body only; same
--              signature, owner, SECURITY DEFINER, comment and grants)
-- IRREVERSIBLE: no (rollback section below restores the previous body)
--
-- WHY:
--   A Card VIP subscription whose monthly charge failed kept VIP for the
--   whole unpaid month, and kept it even after Stripe gave up and canceled.
--   Stripe moves a renewing subscription to its next period while it is still
--   'active', THEN charges the card. That customer.subscription.updated event
--   runs the 'active' branch, which projects the new period end onto
--   profiles.vip_expires_at. When the charge fails the subscription becomes
--   past_due (later unpaid or canceled), and the non-active branch preserved
--   any running term with vip_expires_at > now(), which by then was the
--   unpaid month this same subscription had just written.
--
--   Measured on production 2026-11-27 in a rolled-back probe on a real
--   profile: past_due and canceled both left is_vip=true with 30 days left
--   under the installed body; the body below revokes in both and still keeps
--   Lifetime and a longer term from another source.
--
-- HOW:
--   The non-active branch preserves a running term only when its end is NOT
--   this subscription's own period end (the one being projected, or the one
--   recorded on its row before this call). A failed charge therefore revokes
--   immediately; a later successful retry turns the subscription 'active'
--   again and the active branch re-grants the paid period.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $precheck$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'))
     IS DISTINCT FROM '18be1d30e81a5f55327b86173c8b2a19' THEN
    RAISE EXCEPTION 'pre-flight failed: apply_vip_subscription_projection is not the body this migration edits';
  END IF;
END
$precheck$;

CREATE OR REPLACE FUNCTION public.apply_vip_subscription_projection(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_request_id text,
  p_intent_hash text,
  p_tier text,
  p_status text,
  p_price_usd numeric,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
  v_subscription public.vip_subscriptions%ROWTYPE;
  v_other_subscription public.vip_subscriptions%ROWTYPE;
  v_projection_id uuid;
  v_has_exact_admission boolean := false;
  v_preserve_non_card_entitlement boolean := false;
BEGIN
  IF p_user_id IS NULL
     OR p_stripe_subscription_id IS NULL
     OR btrim(p_stripe_subscription_id) = ''
     OR length(p_stripe_subscription_id) > 255
     OR p_stripe_customer_id IS NULL
     OR btrim(p_stripe_customer_id) = ''
     OR length(p_stripe_customer_id) > 255
     OR p_request_id IS NULL
     OR btrim(p_request_id) = ''
     OR length(p_request_id) > 200
     OR p_intent_hash IS NULL
     OR p_intent_hash !~ '^[a-f0-9]{64}$'
     OR p_tier NOT IN ('monthly', 'yearly')
     OR p_status NOT IN (
       'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused',
       'canceled', 'incomplete_expired'
     )
     OR p_price_usd IS NULL
     OR p_price_usd < 0
     OR p_current_period_start IS NULL
     OR p_current_period_end IS NULL
     OR p_current_period_end < p_current_period_start
     OR p_cancel_at_period_end IS NULL
     OR (p_status = 'canceled' AND p_canceled_at IS NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'invalid'
    );
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'profile_not_found'
    );
  END IF;
  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;
  v_has_exact_admission := FOUND
    AND v_claim.request_id = p_request_id
    AND v_claim.intent_hash = p_intent_hash
    AND v_claim.state = 'admitting';
  IF FOUND
     AND v_claim.state = 'admitting'
     AND NOT v_has_exact_admission THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'claim_conflict'
    );
  END IF;
  IF v_profile.stripe_customer_id IS NOT NULL
     AND v_profile.stripe_customer_id <> p_stripe_customer_id
     AND NOT v_has_exact_admission THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'customer_conflict'
    );
  END IF;

  SELECT * INTO v_subscription
    FROM public.vip_subscriptions
   WHERE stripe_subscription_id = p_stripe_subscription_id
   FOR UPDATE;
  IF FOUND AND v_subscription.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'subscription_conflict'
    );
  END IF;
  IF FOUND
     AND v_subscription.stripe_customer_id IS NOT NULL
     AND v_subscription.stripe_customer_id <> p_stripe_customer_id
     AND NOT v_has_exact_admission THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'subscription_customer_conflict'
    );
  END IF;
  IF FOUND
     AND v_subscription.status IN ('canceled', 'incomplete_expired')
     AND p_status IN (
       'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'
     )
     AND (
       v_profile.vip_tier = 'lifetime'
       OR (
         v_profile.vip_expires_at IS NOT NULL
         AND v_profile.vip_expires_at > now()
         AND (
           v_subscription.current_period_end IS NULL
           OR v_profile.vip_tier IS DISTINCT FROM v_subscription.tier
           OR v_profile.vip_expires_at > v_subscription.current_period_end
         )
       )
     ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'reactivation_entitlement_conflict'
    );
  END IF;

  SELECT * INTO v_other_subscription
    FROM public.vip_subscriptions subscription
   WHERE subscription.user_id = p_user_id
     AND subscription.stripe_subscription_id IS DISTINCT FROM p_stripe_subscription_id
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'user_row_conflict'
    );
  END IF;

  IF v_subscription.id IS NULL AND NOT v_has_exact_admission THEN
    RETURN jsonb_build_object(
      'success', false,
      'projected', false,
      'state', 'admission_missing'
    );
  END IF;

  INSERT INTO public.vip_subscriptions(
    user_id,
    stripe_subscription_id,
    stripe_customer_id,
    tier,
    status,
    price_usd,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    p_tier,
    p_status,
    p_price_usd,
    p_current_period_start,
    p_current_period_end,
    COALESCE(p_cancel_at_period_end, false),
    p_canceled_at,
    now()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE
     SET stripe_customer_id = EXCLUDED.stripe_customer_id,
         tier = EXCLUDED.tier,
         status = EXCLUDED.status,
         price_usd = EXCLUDED.price_usd,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         canceled_at = EXCLUDED.canceled_at,
         updated_at = now()
   WHERE public.vip_subscriptions.user_id = EXCLUDED.user_id
  RETURNING id INTO v_projection_id;
  IF v_projection_id IS NULL THEN
    RAISE EXCEPTION 'VIP subscription projection did not write the exact user row';
  END IF;

  IF p_status IN ('active', 'trialing') THEN
    IF v_profile.vip_tier = 'lifetime'
       OR (
         v_profile.vip_expires_at IS NOT NULL
         AND v_profile.vip_expires_at > p_current_period_end
       ) THEN
      UPDATE public.profiles
         SET stripe_customer_id = p_stripe_customer_id,
             is_vip = true,
             updated_at = now()
       WHERE id = p_user_id;
    ELSE
      UPDATE public.profiles
         SET stripe_customer_id = p_stripe_customer_id,
             is_vip = true,
             vip_tier = p_tier,
             vip_expires_at = p_current_period_end,
             updated_at = now()
       WHERE id = p_user_id;
    END IF;
  ELSE
    -- A Card subscription that stops paying takes back the time IT granted.
    -- Stripe moves a renewing subscription to its next period (still
    -- 'active') BEFORE it charges the card, so the active branch above has
    -- already projected the unpaid month onto the profile when the charge
    -- fails. That month, whose end is this subscription's own period end,
    -- is not preserved. Only Lifetime, or a running term this subscription
    -- did not write (a longer complimentary or Diamond term), survives.
    v_preserve_non_card_entitlement := v_profile.vip_tier = 'lifetime'
      OR (
        v_profile.vip_expires_at IS NOT NULL
        AND v_profile.vip_expires_at > now()
        AND v_profile.vip_expires_at IS DISTINCT FROM p_current_period_end
        AND v_profile.vip_expires_at IS DISTINCT FROM v_subscription.current_period_end
      );
    IF v_preserve_non_card_entitlement THEN
      UPDATE public.profiles
         SET stripe_customer_id = p_stripe_customer_id,
             is_vip = true,
             updated_at = now()
       WHERE id = p_user_id;
    ELSE
      UPDATE public.profiles
         SET stripe_customer_id = p_stripe_customer_id,
             is_vip = false,
             vip_tier = NULL,
             vip_expires_at = NULL,
             updated_at = now()
       WHERE id = p_user_id;
    END IF;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VIP profile projection matched zero rows while locked';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'projected', true,
    'state', 'projected',
    'stripe_subscription_id', p_stripe_subscription_id,
    'status', p_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamptz,timestamptz,boolean,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamptz,timestamptz,boolean,timestamptz)
  TO service_role;

DO $postcheck$
DECLARE
  v_fn regprocedure := to_regprocedure('public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)');
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_fn)
     IS DISTINCT FROM '5f05480a017b18a6bee59e3c0a20f2fc' THEN
    RAISE EXCEPTION 'post-apply failed: apply_vip_subscription_projection body mismatch';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION 'post-apply failed: apply_vip_subscription_projection lost SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply failed: apply_vip_subscription_projection is not service-only';
  END IF;
  IF public.marketplace_phase7_vip_acquisition_mutex_version()
     IS DISTINCT FROM 'marketplace_phase7_vip_acquisition_mutex:v1' THEN
    RAISE EXCEPTION 'post-apply failed: Phase 7 VIP acquisition marker went stale';
  END IF;
END
$postcheck$;

COMMIT;

-- ROLLBACK (copy-paste): restore the previous body from
-- supabase/migrations/20260906213000_marketplace_phase7_vip_acquisition_mutex.sql
-- (CREATE FUNCTION public.apply_vip_subscription_projection ...), as
-- CREATE OR REPLACE, inside BEGIN/COMMIT. Its md5(prosrc) is
-- 18be1d30e81a5f55327b86173c8b2a19.
