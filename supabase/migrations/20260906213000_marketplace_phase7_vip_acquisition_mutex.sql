-- ===========================================================================
-- 20260906213000_marketplace_phase7_vip_acquisition_mutex.sql
-- ===========================================================================
-- TIER:         3
-- AUTHOR:       Codex
-- AFFECTS:      VIP checkout claim state/functions and
--               purchase_vip_with_diamonds_atomic_v3; adds service-only
--               admission, finalization, and schema marker RPCs
-- IRREVERSIBLE: no
--
-- WHY:
--   Card Checkout and Diamond settlement previously inspected one another
--   before either rail held a shared database lock. Two concurrent requests
--   could therefore both pass eligibility and create overlapping VIP value.
--
-- HOW:
--   Both acquisition rails lock the same profile row before inspecting the
--   opposite rail. Completed Diamond requests still replay before current
--   eligibility, and the existing v2 settlement remains unchanged.
-- ===========================================================================
--
-- This migration changes preconditions only. The existing Diamond debit,
-- ledger insert, tier selection, expiry extension, and durable replay writes
-- remain delegated to the same v2 settlement function in the same order.
--
-- Rollback evidence: no table, column, index, or row is added by this file.
-- The checkout-claim state constraint is extended with an `admitting` state,
-- and the previously unconstrained subscription status gains the exact Stripe
-- states persisted by the webhook. The destructive legacy profile projection
-- trigger is removed. The pasteable rollback below converts any surviving
-- barrier to `open`, restores the trigger, claim constraint and functions,
-- drops the new status constraint, and removes the new RPCs.

BEGIN;

DO $precheck$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.vip_subscriptions') IS NULL
     OR to_regclass('public.vip_subscription_checkout_claims') IS NULL
     OR to_regclass('public.vip_diamond_purchase_requests') IS NULL THEN
    RAISE EXCEPTION 'VIP acquisition mutex dependencies are missing';
  END IF;
  IF to_regprocedure(
    'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
  ) IS NULL OR to_regprocedure(
    'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
  ) IS NULL OR to_regprocedure(
    'public.release_vip_subscription_checkout(uuid,text)'
  ) IS NULL OR to_regprocedure(
    'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
  ) IS NULL OR to_regprocedure(
    'public.purchase_vip_with_diamonds_atomic_v2(uuid,integer,integer,text,text,text)'
  ) IS NULL OR to_regprocedure(
    'public.fn_sync_profile_vip_status()'
  ) IS NULL THEN
    RAISE EXCEPTION 'VIP acquisition functions are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.conrelid = 'public.vip_subscription_checkout_claims'::regclass
       AND constraint_record.conname = 'vip_subscription_checkout_claims_state_check'
       AND constraint_record.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'VIP checkout claim state constraint is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger trigger_record
     WHERE trigger_record.tgrelid = 'public.vip_subscriptions'::regclass
       AND trigger_record.tgname = 'trg_sync_profile_vip'
       AND NOT trigger_record.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Expected VIP profile projection trigger is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.conrelid = 'public.vip_subscriptions'::regclass
       AND constraint_record.conname = 'vip_subscriptions_user_id_key'
       AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION 'Expected one-current-subscription constraint is missing';
  END IF;
END
$precheck$;

ALTER TABLE public.vip_subscription_checkout_claims
  DROP CONSTRAINT vip_subscription_checkout_claims_state_check;
ALTER TABLE public.vip_subscription_checkout_claims
  ADD CONSTRAINT vip_subscription_checkout_claims_state_check
  CHECK (state IN ('initializing', 'open', 'admitting'));

COMMENT ON CONSTRAINT vip_subscription_checkout_claims_state_check
ON public.vip_subscription_checkout_claims
IS 'marketplace_phase7_vip_acquisition_mutex:v1';

ALTER TABLE public.vip_subscriptions
  DROP CONSTRAINT IF EXISTS vip_subscriptions_status_check;
ALTER TABLE public.vip_subscriptions
  ADD CONSTRAINT vip_subscriptions_status_check
  CHECK (status IN (
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
    'canceled',
    'incomplete_expired'
  ));

COMMENT ON CONSTRAINT vip_subscriptions_status_check
ON public.vip_subscriptions
IS 'marketplace_phase7_vip_acquisition_mutex:v1';

-- This legacy aggregate trigger overwrites profiles as a side effect of every
-- ledger write. It cannot distinguish a Card projection from a valid Diamond
-- or promotional entitlement, and its retired gold/silver ordering is stale.
-- Phase 7 makes the verified webhook the sole Card projector: it writes the
-- ledger, checks the exact profile write, and only then finalizes admission.
-- Diamond settlement already updates the profile atomically before its audit
-- row, so removing this duplicate projection closes the destructive race.
DROP TRIGGER trg_sync_profile_vip ON public.vip_subscriptions;

CREATE OR REPLACE FUNCTION public.claim_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text,
  p_intent_hash text,
  p_lease_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_intent_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
  END IF;

  -- Both purchase methods take this same row lock before inspecting the
  -- opposite rail. Whichever transaction commits first leaves durable state
  -- that makes the other transaction fail closed.
  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'profile_not_found');
  END IF;

  -- Preserve existing Card claim replay and conflict behavior before testing
  -- whether a new Card acquisition may begin.
  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;
  IF FOUND AND (
    v_claim.state = 'admitting'
    OR v_claim.expires_at > now()
  ) THEN
    IF v_claim.request_id = p_request_id AND v_claim.intent_hash = p_intent_hash THEN
      IF v_claim.state IN ('initializing', 'admitting') THEN
        UPDATE public.vip_subscription_checkout_claims
           SET expires_at = GREATEST(
                 expires_at,
                 now() + make_interval(secs => GREATEST(60, p_lease_seconds))
               ),
               updated_at = now()
         WHERE user_id = p_user_id
           AND request_id = p_request_id
           AND intent_hash = p_intent_hash
        RETURNING * INTO v_claim;
      END IF;
      RETURN jsonb_build_object(
        'claimed', false,
        'state', v_claim.state,
        'session_id', v_claim.session_id,
        'session_url', v_claim.session_url
      );
    END IF;
    RETURN jsonb_build_object('claimed', false, 'state', 'conflict');
  END IF;

  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
     AND state <> 'admitting';

  -- Do not sell overlapping time. This covers current v3 Diamond purchases,
  -- older Diamond grants, promotional prepaid terms, and any legacy active
  -- profile that predates the durable Diamond request table.
  IF v_profile.vip_tier = 'lifetime'
     OR (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > now()) THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'vip_entitlement_active');
  END IF;

  INSERT INTO public.vip_subscription_checkout_claims(
    user_id, request_id, intent_hash, state, expires_at
  ) VALUES (
    p_user_id,
    p_request_id,
    p_intent_hash,
    'initializing',
    now() + make_interval(secs => GREATEST(60, p_lease_seconds))
  );
  RETURN jsonb_build_object('claimed', true, 'state', 'initializing');
END;
$function$;

-- Once webhook admission starts, stale checkout cleanup must not shorten or
-- delete its durable barrier. Only the finalizer below may clear `admitting`,
-- and only after it proves the exact subscription ledger row exists.
CREATE OR REPLACE FUNCTION public.complete_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text,
  p_session_id text,
  p_session_url text,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.vip_subscription_checkout_claims
     SET state = 'open',
         session_id = p_session_id,
         session_url = p_session_url,
         expires_at = GREATEST(
           expires_at,
           COALESCE(p_expires_at, now() + interval '30 minutes'),
           now() + interval '1 minute'
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND request_id = p_request_id
     AND state <> 'admitting';
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
     AND request_id = p_request_id
     AND state <> 'admitting'
$function$;

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
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_reference_id IS NULL OR btrim(p_reference_id) = ''
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_reference_id, 0));

  -- Durable replay intentionally precedes every current-state eligibility
  -- check. A completed request remains a success even if the member later
  -- opens a Card checkout or changes subscription state.
  SELECT * INTO v_request
    FROM public.vip_diamond_purchase_requests
   WHERE reference_id = p_reference_id;
  IF FOUND THEN
    IF v_request.user_id <> p_user_id OR v_request.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_conflict');
    END IF;
    RETURN v_request.response || jsonb_build_object('duplicate', true);
  END IF;

  -- This is the same lock used by claim_vip_subscription_checkout. It closes
  -- the read-then-write window between the two payment methods without
  -- widening or changing the settlement transaction below.
  PERFORM 1
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;
  IF FOUND AND (
    v_claim.state = 'admitting'
    OR v_claim.expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_checkout_exists');
  END IF;
  IF FOUND THEN
    DELETE FROM public.vip_subscription_checkout_claims
     WHERE user_id = p_user_id
       AND state <> 'admitting';
  END IF;

  -- Make the database the final authority immediately before debit. The API
  -- intentionally enters this RPC before current-state eligibility so an
  -- already completed durable request can replay first.
  IF EXISTS (
    SELECT 1
      FROM public.vip_subscriptions subscription
     WHERE subscription.user_id = p_user_id
       AND subscription.status IN (
         'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'
       )
       AND subscription.stripe_subscription_id IS NOT NULL
       AND left(subscription.stripe_subscription_id, 8) <> 'diamond_'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'active_card_subscription');
  END IF;

  v_result := public.purchase_vip_with_diamonds_atomic_v2(
    p_user_id, p_cost, p_days, p_plan, p_reference_id, p_description
  );
  IF COALESCE((v_result ->> 'success')::boolean, false) IS TRUE THEN
    INSERT INTO public.vip_diamond_purchase_requests(
      reference_id, user_id, request_hash, response
    ) VALUES (
      p_reference_id, p_user_id, p_request_hash, v_result
    );
  END IF;
  RETURN v_result;
END;
$function$;

-- Atomically decide whether an incoming Stripe VIP subscription may enter the
-- local ledger. The barrier remains after this transaction commits, closing
-- the gap before the webhook upserts vip_subscriptions; the webhook releases
-- the exact request only after that upsert succeeds.
CREATE FUNCTION public.admit_vip_subscription_checkout(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_request_id text,
  p_intent_hash text,
  p_session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
  v_subscription public.vip_subscriptions%ROWTYPE;
  v_prior_subscription public.vip_subscriptions%ROWTYPE;
  v_claim_found boolean := false;
  v_barrier_expires_at timestamptz := now() + interval '7 days';
BEGIN
  IF p_user_id IS NULL
     OR p_stripe_subscription_id IS NULL
     OR btrim(p_stripe_subscription_id) = ''
     OR length(p_stripe_subscription_id) > 255
     OR p_request_id IS NULL
     OR btrim(p_request_id) = ''
     OR length(p_request_id) > 200
     OR p_intent_hash IS NULL
     OR p_intent_hash !~ '^[a-f0-9]{64}$'
     OR (p_session_id IS NOT NULL AND (
       btrim(p_session_id) = '' OR length(p_session_id) > 255
     )) THEN
    RETURN jsonb_build_object(
      'success', false,
      'admitted', false,
      'state', 'invalid'
    );
  END IF;

  -- All Card and Diamond admissions serialize on this same row first.
  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'admitted', false,
      'state', 'profile_not_found'
    );
  END IF;

  -- Preserve the shared lock order: profile, Card claim, subscription ledger.
  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;
  v_claim_found := FOUND;

  SELECT * INTO v_subscription
    FROM public.vip_subscriptions
   WHERE stripe_subscription_id = p_stripe_subscription_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_subscription.user_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'admitted', false,
        'state', 'subscription_conflict'
      );
    END IF;
    IF v_claim_found
       AND v_claim.state = 'admitting'
       AND (
         v_claim.request_id <> p_request_id
         OR v_claim.intent_hash <> p_intent_hash
       ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'admitted', false,
        'state', 'claim_conflict'
      );
    END IF;
    IF v_claim_found
       AND v_claim.request_id = p_request_id
       AND v_claim.intent_hash = p_intent_hash THEN
      IF v_claim.session_id IS NOT NULL
         AND p_session_id IS DISTINCT FROM v_claim.session_id THEN
        RETURN jsonb_build_object(
          'success', false,
          'admitted', false,
          'state', 'session_conflict'
        );
      END IF;
      IF v_claim.state <> 'admitting' THEN
        UPDATE public.vip_subscription_checkout_claims
           SET state = 'admitting',
               session_id = COALESCE(session_id, p_session_id),
               expires_at = GREATEST(expires_at, v_barrier_expires_at),
               updated_at = now()
         WHERE user_id = p_user_id
           AND request_id = p_request_id
           AND intent_hash = p_intent_hash;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'VIP subscription replay barrier disappeared while locked';
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'admitted', false,
      'state', 'replay',
      'finalize_required', (
        v_claim_found
        AND v_claim.request_id = p_request_id
        AND v_claim.intent_hash = p_intent_hash
      ),
      'stripe_subscription_id', p_stripe_subscription_id
    );
  END IF;

  -- Production intentionally keeps one current subscription row per user.
  -- Lock that row now. A live Card obligation or unexpired Diamond grant is an
  -- overlap; an expired/terminal row is recycled only after every entitlement
  -- and claim check below succeeds, inside this same admission transaction.
  SELECT * INTO v_prior_subscription
    FROM public.vip_subscriptions subscription
   WHERE subscription.user_id = p_user_id
     AND subscription.stripe_subscription_id IS DISTINCT FROM p_stripe_subscription_id
   FOR UPDATE;
  IF FOUND AND (
    (
      v_prior_subscription.stripe_subscription_id IS NOT NULL
      AND left(v_prior_subscription.stripe_subscription_id, 8) <> 'diamond_'
      AND v_prior_subscription.status IN (
        'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'
      )
    ) OR (
      v_prior_subscription.stripe_subscription_id IS NOT NULL
      AND left(v_prior_subscription.stripe_subscription_id, 8) = 'diamond_'
      AND v_prior_subscription.status IN ('active', 'trialing')
      AND (
        v_prior_subscription.tier = 'lifetime'
        OR v_prior_subscription.current_period_end > now()
      )
    )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'admitted', false,
      'state', 'vip_entitlement_active'
    );
  END IF;

  IF v_profile.vip_tier = 'lifetime'
     OR (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'admitted', false,
      'state', 'vip_entitlement_active'
    );
  END IF;

  IF v_claim_found THEN
    IF v_claim.request_id = p_request_id
       AND v_claim.intent_hash = p_intent_hash THEN
      IF v_claim.session_id IS NOT NULL
         AND p_session_id IS DISTINCT FROM v_claim.session_id THEN
        RETURN jsonb_build_object(
          'success', false,
          'admitted', false,
          'state', 'session_conflict'
        );
      END IF;

      UPDATE public.vip_subscription_checkout_claims
         SET state = 'admitting',
             session_id = COALESCE(session_id, p_session_id),
             expires_at = GREATEST(expires_at, v_barrier_expires_at),
             updated_at = now()
       WHERE user_id = p_user_id
         AND request_id = p_request_id
         AND intent_hash = p_intent_hash;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'VIP subscription admission barrier disappeared while locked';
      END IF;
      IF v_prior_subscription.id IS NOT NULL THEN
        UPDATE public.vip_subscriptions
           SET stripe_subscription_id = p_stripe_subscription_id,
               updated_at = now()
         WHERE id = v_prior_subscription.id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Terminal VIP subscription row disappeared while locked';
        END IF;
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'admitted', true,
        'state', 'admitted',
        'finalize_required', true,
        'claim_adopted', true,
        'barrier_expires_at', v_barrier_expires_at,
        'stripe_subscription_id', p_stripe_subscription_id
      );
    END IF;

    IF v_claim.state = 'admitting'
       OR v_claim.expires_at > now() THEN
      RETURN jsonb_build_object(
        'success', false,
        'admitted', false,
        'state', 'claim_conflict'
      );
    END IF;

    DELETE FROM public.vip_subscription_checkout_claims
     WHERE user_id = p_user_id
       AND state <> 'admitting';
  END IF;

  -- A classified legacy subscription can supply a deterministic synthetic
  -- request/hash. It is safe to establish that barrier only after proving no
  -- active entitlement and no unexpired conflicting claim above.
  INSERT INTO public.vip_subscription_checkout_claims(
    user_id,
    request_id,
    intent_hash,
    state,
    session_id,
    expires_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_request_id,
    p_intent_hash,
    'admitting',
    p_session_id,
    v_barrier_expires_at,
    now()
  );

  IF v_prior_subscription.id IS NOT NULL THEN
    UPDATE public.vip_subscriptions
       SET stripe_subscription_id = p_stripe_subscription_id,
           updated_at = now()
     WHERE id = v_prior_subscription.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Terminal VIP subscription row disappeared while locked';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'admitted', true,
    'state', 'admitted',
    'finalize_required', true,
    'claim_adopted', false,
    'barrier_expires_at', v_barrier_expires_at,
    'stripe_subscription_id', p_stripe_subscription_id
  );
END;
$function$;

-- Apply the Stripe ledger row and its profile entitlement in one transaction.
-- The webhook has already classified Stripe authority and established (or
-- replayed) admission. Locking the profile first preserves the same order as
-- Card admission and Diamond settlement, so neither rail can observe a
-- terminal ledger with a stale profile or an active profile without its row.
CREATE FUNCTION public.apply_vip_subscription_projection(
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
    v_preserve_non_card_entitlement := v_profile.vip_tier = 'lifetime'
      OR (
        v_profile.vip_expires_at IS NOT NULL
        AND v_profile.vip_expires_at > now()
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

-- Clear only the exact admitted barrier, and only after the corresponding
-- durable subscription row is present. A retry after a completed finalize is
-- a successful replay rather than an error.
CREATE FUNCTION public.finalize_vip_subscription_admission(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_request_id text,
  p_intent_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
  v_subscription public.vip_subscriptions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR p_stripe_subscription_id IS NULL
     OR btrim(p_stripe_subscription_id) = ''
     OR length(p_stripe_subscription_id) > 255
     OR p_request_id IS NULL
     OR btrim(p_request_id) = ''
     OR length(p_request_id) > 200
     OR p_intent_hash IS NULL
     OR p_intent_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'invalid'
    );
  END IF;

  PERFORM 1
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'profile_not_found'
    );
  END IF;

  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;

  SELECT * INTO v_subscription
    FROM public.vip_subscriptions
   WHERE stripe_subscription_id = p_stripe_subscription_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'subscription_missing'
    );
  END IF;
  IF v_subscription.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'subscription_conflict'
    );
  END IF;

  IF v_claim.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'finalized', false,
      'state', 'replay',
      'stripe_subscription_id', p_stripe_subscription_id
    );
  END IF;
  IF v_claim.request_id <> p_request_id
     OR v_claim.intent_hash <> p_intent_hash THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'claim_conflict'
    );
  END IF;
  IF v_claim.state <> 'admitting' THEN
    RETURN jsonb_build_object(
      'success', false,
      'finalized', false,
      'state', 'claim_state_conflict'
    );
  END IF;

  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
     AND request_id = p_request_id
     AND intent_hash = p_intent_hash
     AND state = 'admitting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VIP subscription admission barrier disappeared while locked';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'finalized', true,
    'state', 'finalized',
    'stripe_subscription_id', p_stripe_subscription_id
  );
END;
$function$;

COMMENT ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.apply_vip_subscription_projection(
  uuid, text, text, text, text, text, text, numeric,
  timestamptz, timestamptz, boolean, timestamptz
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

COMMENT ON FUNCTION public.finalize_vip_subscription_admission(
  uuid, text, text, text
) IS 'marketplace_phase7_vip_acquisition_mutex:v1';

-- Runtime readiness cannot read pg_catalog through PostgREST directly. This
-- service-only, read-only RPC exposes the exact version only while every
-- hardened function and constraint carry this version and still contain the
-- critical protocol operations. Function comments survive CREATE OR REPLACE,
-- so comments alone cannot make readiness truthful after runtime body drift.
CREATE FUNCTION public.marketplace_phase7_vip_acquisition_mutex_version()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE
    WHEN pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.release_vip_subscription_checkout(uuid,text)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.obj_description(
      pg_catalog.to_regprocedure(
        'public.finalize_vip_subscription_admission(uuid,text,text,text)'
      ),
      'pg_proc'
    ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
      )),
      'vip_entitlement_active'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
      )),
      'state <> ''admitting'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
      )),
      'card_checkout_exists'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
      )),
      'active_card_subscription'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
      )),
      'claim_conflict'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
      )),
      'SET state = ''admitting'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
      )),
      'SET stripe_subscription_id = p_stripe_subscription_id'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      )),
      'reactivation_entitlement_conflict'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      )),
      'v_profile.vip_expires_at > v_subscription.current_period_end'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      )),
      'state'', ''claim_conflict'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      )),
      'INSERT INTO public.vip_subscriptions'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
      )),
      'UPDATE public.profiles'
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
      )),
      'state <> ''admitting'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.release_vip_subscription_checkout(uuid,text)'
      )),
      'state <> ''admitting'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.finalize_vip_subscription_admission(uuid,text,text,text)'
      )),
      'state = ''admitting'''
    ) > 0
    AND pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
        'public.finalize_vip_subscription_admission(uuid,text,text,text)'
      )),
      'subscription_missing'
    ) > 0
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_record
       WHERE constraint_record.conrelid = pg_catalog.to_regclass(
               'public.vip_subscription_checkout_claims'
             )
         AND constraint_record.conname = 'vip_subscription_checkout_claims_state_check'
         AND pg_catalog.obj_description(
               constraint_record.oid,
               'pg_constraint'
             ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
         AND pg_catalog.strpos(
               pg_catalog.pg_get_constraintdef(constraint_record.oid),
               'admitting'
             ) > 0
    )
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_record
       WHERE constraint_record.conrelid = pg_catalog.to_regclass(
               'public.vip_subscriptions'
             )
         AND constraint_record.conname = 'vip_subscriptions_status_check'
         AND pg_catalog.obj_description(
               constraint_record.oid,
               'pg_constraint'
             ) = 'marketplace_phase7_vip_acquisition_mutex:v1'
         AND pg_catalog.strpos(
               pg_catalog.pg_get_constraintdef(constraint_record.oid),
               'incomplete'
             ) > 0
         AND pg_catalog.strpos(
               pg_catalog.pg_get_constraintdef(constraint_record.oid),
               'paused'
             ) > 0
         AND pg_catalog.strpos(
               pg_catalog.pg_get_constraintdef(constraint_record.oid),
               'incomplete_expired'
             ) > 0
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger trigger_record
       WHERE trigger_record.tgrelid = pg_catalog.to_regclass(
               'public.vip_subscriptions'
             )
         AND trigger_record.tgname = 'trg_sync_profile_vip'
         AND NOT trigger_record.tgisinternal
    )
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_record
       WHERE constraint_record.conrelid = pg_catalog.to_regclass(
               'public.vip_subscriptions'
             )
         AND constraint_record.conname = 'vip_subscriptions_user_id_key'
         AND constraint_record.contype = 'u'
    )
    THEN 'marketplace_phase7_vip_acquisition_mutex:v1'
    ELSE NULL
  END
$function$;

COMMENT ON FUNCTION public.marketplace_phase7_vip_acquisition_mutex_version()
IS 'marketplace_phase7_vip_acquisition_mutex:v1';

REVOKE ALL ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.apply_vip_subscription_projection(
  uuid, text, text, text, text, text, text, numeric,
  timestamptz, timestamptz, boolean, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_vip_subscription_projection(
  uuid, text, text, text, text, text, text, numeric,
  timestamptz, timestamptz, boolean, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_vip_subscription_admission(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_vip_subscription_admission(
  uuid, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.marketplace_phase7_vip_acquisition_mutex_version()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_phase7_vip_acquisition_mutex_version()
TO service_role;

DO $postcheck$
DECLARE
  v_expected_marker CONSTANT text := 'marketplace_phase7_vip_acquisition_mutex:v1';
  v_claim_definition text;
  v_complete_definition text;
  v_release_definition text;
  v_diamond_definition text;
  v_admission_definition text;
  v_projection_definition text;
  v_finalize_definition text;
  v_live_marker text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
  )) INTO v_claim_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
  )) INTO v_complete_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.release_vip_subscription_checkout(uuid,text)'
  )) INTO v_release_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
  )) INTO v_diamond_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
  )) INTO v_admission_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
  )) INTO v_projection_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.finalize_vip_subscription_admission(uuid,text,text,text)'
  )) INTO v_finalize_definition;
  SELECT public.marketplace_phase7_vip_acquisition_mutex_version()
    INTO v_live_marker;

  IF v_live_marker IS DISTINCT FROM v_expected_marker THEN
    RAISE EXCEPTION 'Phase 7 VIP acquisition schema marker is missing or stale';
  END IF;
  IF position('vip_entitlement_active' IN v_claim_definition) = 0
     OR position('FROM public.profiles' IN v_claim_definition) = 0
     OR position('FOR UPDATE' IN v_claim_definition) = 0
     OR position('v_claim.state IN (''initializing'', ''admitting'')' IN v_claim_definition) = 0
     OR position('GREATEST(' IN v_claim_definition) = 0 THEN
    RAISE EXCEPTION 'Card checkout is missing the Diamond acquisition guard';
  END IF;
  IF position('state <> ''admitting''' IN v_complete_definition) = 0
     OR position('GREATEST(' IN v_complete_definition) = 0
     OR position('state <> ''admitting''' IN v_release_definition) = 0 THEN
    RAISE EXCEPTION 'Stale checkout cleanup can remove an admission barrier';
  END IF;
  IF position('card_checkout_exists' IN v_diamond_definition) = 0
     OR position('active_card_subscription' IN v_diamond_definition) = 0
     OR position('purchase_vip_with_diamonds_atomic_v2' IN v_diamond_definition) = 0
     OR position('vip_diamond_purchase_requests' IN v_diamond_definition) = 0 THEN
    RAISE EXCEPTION 'Diamond settlement is missing an acquisition guard or durable mutation';
  END IF;
  IF position('SELECT * INTO v_request' IN v_diamond_definition) = 0
     OR position('PERFORM 1' IN v_diamond_definition) = 0
     OR position('SELECT * INTO v_request' IN v_diamond_definition)
        > position('PERFORM 1' IN v_diamond_definition) THEN
    RAISE EXCEPTION 'Diamond durable replay no longer precedes eligibility checks';
  END IF;
  IF position('FROM public.profiles' IN v_admission_definition) = 0
     OR position('FROM public.vip_subscription_checkout_claims' IN v_admission_definition) = 0
     OR position('FROM public.vip_subscriptions' IN v_admission_definition) = 0
     OR position('stripe_subscription_id IS DISTINCT FROM' IN v_admission_definition) = 0
     OR position('interval ''7 days''' IN v_admission_definition) = 0
     OR position('claim_conflict' IN v_admission_definition) = 0
     OR position('''admitting''' IN v_admission_definition) = 0
     OR position('finalize_required' IN v_admission_definition) = 0
     OR position('state'', ''replay' IN v_admission_definition) = 0
     OR position('v_prior_subscription' IN v_admission_definition) = 0
     OR position('v_claim_found' IN v_admission_definition) = 0
     OR position('v_claim.state = ''admitting''' IN v_admission_definition) = 0
     OR position('SET stripe_subscription_id = p_stripe_subscription_id' IN v_admission_definition) = 0 THEN
    RAISE EXCEPTION 'Card subscription admission is missing an atomic barrier or overlap guard';
  END IF;
  IF position('FROM public.profiles' IN v_admission_definition) = 0
     OR position('FROM public.vip_subscription_checkout_claims' IN v_admission_definition)
        < position('FROM public.profiles' IN v_admission_definition)
     OR position('FROM public.vip_subscriptions' IN v_admission_definition)
        < position('FROM public.vip_subscription_checkout_claims' IN v_admission_definition)
     OR position('state'', ''replay' IN v_admission_definition)
        > position('stripe_subscription_id IS DISTINCT FROM' IN v_admission_definition) THEN
    RAISE EXCEPTION 'Card subscription admission lock or replay order is unsafe';
  END IF;
  IF position('FROM public.profiles' IN v_finalize_definition) = 0
     OR position('FROM public.vip_subscription_checkout_claims' IN v_finalize_definition) = 0
     OR position('FROM public.vip_subscriptions' IN v_finalize_definition) = 0
     OR position('state = ''admitting''' IN v_finalize_definition) = 0
     OR position('subscription_missing' IN v_finalize_definition) = 0
     OR position('state'', ''finalized' IN v_finalize_definition) = 0 THEN
    RAISE EXCEPTION 'Card subscription admission finalizer is not ledger-gated';
  END IF;
  IF position('FROM public.profiles' IN v_projection_definition) = 0
     OR position('FOR UPDATE' IN v_projection_definition) = 0
     OR position('INSERT INTO public.vip_subscriptions' IN v_projection_definition) = 0
     OR position('ON CONFLICT (stripe_subscription_id)' IN v_projection_definition) = 0
     OR position('UPDATE public.profiles' IN v_projection_definition) = 0
     OR position('admission_missing' IN v_projection_definition) = 0
     OR position('state'', ''claim_conflict''' IN v_projection_definition) = 0
     OR position('reactivation_entitlement_conflict' IN v_projection_definition) = 0
     OR position('v_profile.vip_expires_at > v_subscription.current_period_end' IN v_projection_definition) = 0
     OR position('v_preserve_non_card_entitlement' IN v_projection_definition) = 0 THEN
    RAISE EXCEPTION 'VIP subscription ledger/profile projection is not atomic or guarded';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.claim_vip_subscription_checkout(uuid,text,text,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.claim_vip_subscription_checkout(uuid,text,text,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.admit_vip_subscription_checkout(uuid,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.admit_vip_subscription_checkout(uuid,text,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.finalize_vip_subscription_admission(uuid,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.finalize_vip_subscription_admission(uuid,text,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.marketplace_phase7_vip_acquisition_mutex_version()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.marketplace_phase7_vip_acquisition_mutex_version()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'VIP acquisition functions are client executable';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.admit_vip_subscription_checkout(uuid,text,text,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.finalize_vip_subscription_admission(uuid,text,text,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.marketplace_phase7_vip_acquisition_mutex_version()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'A Phase 7 VIP acquisition RPC is not service executable';
  END IF;
END
$postcheck$;

COMMIT;

-- ===========================================================================
-- ROLLBACK (Tier 3: paste into a new migration to restore prior definitions)
-- ===========================================================================
/*
BEGIN;

CREATE TRIGGER trg_sync_profile_vip
  AFTER INSERT OR UPDATE ON public.vip_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_profile_vip_status();

DROP FUNCTION IF EXISTS public.marketplace_phase7_vip_acquisition_mutex_version();
DROP FUNCTION IF EXISTS public.finalize_vip_subscription_admission(
  uuid, text, text, text
);
DROP FUNCTION IF EXISTS public.apply_vip_subscription_projection(
  uuid, text, text, text, text, text, text, numeric,
  timestamptz, timestamptz, boolean, timestamptz
);
DROP FUNCTION IF EXISTS public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
);
ALTER TABLE public.vip_subscriptions
  DROP CONSTRAINT IF EXISTS vip_subscriptions_status_check;

UPDATE public.vip_subscription_checkout_claims
   SET state = 'open',
       updated_at = now()
 WHERE state = 'admitting';
ALTER TABLE public.vip_subscription_checkout_claims
  DROP CONSTRAINT vip_subscription_checkout_claims_state_check;
ALTER TABLE public.vip_subscription_checkout_claims
  ADD CONSTRAINT vip_subscription_checkout_claims_state_check
  CHECK (state IN ('initializing', 'open'));

CREATE OR REPLACE FUNCTION public.claim_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text,
  p_intent_hash text,
  p_lease_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_claim public.vip_subscription_checkout_claims%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_intent_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
  END IF;
  SELECT * INTO v_claim
    FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
   FOR UPDATE;
  IF FOUND AND v_claim.expires_at > now() THEN
    IF v_claim.request_id = p_request_id AND v_claim.intent_hash = p_intent_hash THEN
      RETURN jsonb_build_object(
        'claimed', false,
        'state', v_claim.state,
        'session_id', v_claim.session_id,
        'session_url', v_claim.session_url
      );
    END IF;
    RETURN jsonb_build_object('claimed', false, 'state', 'conflict');
  END IF;
  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id;
  INSERT INTO public.vip_subscription_checkout_claims(
    user_id, request_id, intent_hash, state, expires_at
  ) VALUES (
    p_user_id,
    p_request_id,
    p_intent_hash,
    'initializing',
    now() + make_interval(secs => GREATEST(60, p_lease_seconds))
  );
  RETURN jsonb_build_object('claimed', true, 'state', 'initializing');
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text,
  p_session_id text,
  p_session_url text,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.vip_subscription_checkout_claims
     SET state = 'open',
         session_id = p_session_id,
         session_url = p_session_url,
         expires_at = GREATEST(
           COALESCE(p_expires_at, now() + interval '30 minutes'),
           now() + interval '1 minute'
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND request_id = p_request_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_vip_subscription_checkout(
  p_user_id uuid,
  p_request_id text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  DELETE FROM public.vip_subscription_checkout_claims
   WHERE user_id = p_user_id
     AND request_id = p_request_id
$function$;

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
    INSERT INTO public.vip_diamond_purchase_requests(
      reference_id, user_id, request_hash, response
    ) VALUES (
      p_reference_id, p_user_id, p_request_hash, v_result
    );
  END IF;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) IS NULL;
COMMENT ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) IS NULL;
COMMENT ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) IS NULL;
COMMENT ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) IS NULL;

REVOKE ALL ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) TO service_role;
REVOKE ALL ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_vip_subscription_checkout(
  uuid, text, text, text, timestamptz
) TO service_role;
REVOKE ALL ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_vip_subscription_checkout(
  uuid, text
) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_vip_with_diamonds_atomic_v3(
  uuid, integer, integer, text, text, text, text
) TO service_role;

DO $rollback_postcheck$
DECLARE
  v_complete_definition text;
  v_release_definition text;
  v_constraint_definition text;
BEGIN
  IF to_regprocedure(
    'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'
  ) IS NOT NULL OR to_regprocedure(
    'public.apply_vip_subscription_projection(uuid,text,text,text,text,text,text,numeric,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone)'
  ) IS NOT NULL OR to_regprocedure(
    'public.finalize_vip_subscription_admission(uuid,text,text,text)'
  ) IS NOT NULL OR to_regprocedure(
    'public.marketplace_phase7_vip_acquisition_mutex_version()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 7 VIP admission RPCs survived rollback';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger trigger_record
     WHERE trigger_record.tgrelid = 'public.vip_subscriptions'::regclass
       AND trigger_record.tgname = 'trg_sync_profile_vip'
       AND NOT trigger_record.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Original VIP profile projection trigger was not restored';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
  )) INTO v_complete_definition;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.release_vip_subscription_checkout(uuid,text)'
  )) INTO v_release_definition;
  SELECT pg_get_constraintdef(constraint_record.oid)
    INTO v_constraint_definition
    FROM pg_catalog.pg_constraint constraint_record
   WHERE constraint_record.conrelid = 'public.vip_subscription_checkout_claims'::regclass
     AND constraint_record.conname = 'vip_subscription_checkout_claims_state_check';

  IF v_constraint_definition IS NULL
     OR position('admitting' IN v_constraint_definition) > 0 THEN
    RAISE EXCEPTION 'Original VIP checkout claim constraint was not restored';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.conrelid = 'public.vip_subscriptions'::regclass
       AND constraint_record.conname = 'vip_subscriptions_status_check'
  ) THEN
    RAISE EXCEPTION 'Phase 7 subscription status constraint survived rollback';
  END IF;
  IF position('state <> ''admitting''' IN v_complete_definition) > 0
     OR position('state <> ''admitting''' IN v_release_definition) > 0 THEN
    RAISE EXCEPTION 'Phase 7 checkout cleanup guards survived rollback';
  END IF;
  IF obj_description(to_regprocedure(
    'public.claim_vip_subscription_checkout(uuid,text,text,integer)'
  ), 'pg_proc') IS NOT NULL OR obj_description(to_regprocedure(
    'public.complete_vip_subscription_checkout(uuid,text,text,text,timestamp with time zone)'
  ), 'pg_proc') IS NOT NULL OR obj_description(to_regprocedure(
    'public.release_vip_subscription_checkout(uuid,text)'
  ), 'pg_proc') IS NOT NULL OR obj_description(to_regprocedure(
    'public.purchase_vip_with_diamonds_atomic_v3(uuid,integer,integer,text,text,text,text)'
  ), 'pg_proc') IS NOT NULL THEN
    RAISE EXCEPTION 'Phase 7 schema markers survived rollback';
  END IF;
END
$rollback_postcheck$;

COMMIT;
*/
