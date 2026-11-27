-- ===========================================================================
-- 20261127074620_vip_complimentary_term_does_not_block_card_subscription.sql
-- ===========================================================================
-- TIER:         3
-- AUTHOR:       Claude (session_013U37bb1u9RJp2HYifHGgrn)
-- AFFECTS:      functions claim_vip_subscription_checkout and
--               admit_vip_subscription_checkout (one condition each); adds the
--               read-only helper vip_running_term_is_complimentary(uuid).
--               No table, column, index, constraint, trigger or row changes.
-- IRREVERSIBLE: no (pasteable rollback at the bottom)
--
-- WHY:
--   Both functions refused a Card VIP subscription whenever
--   profiles.vip_expires_at was in the future, returning
--   'vip_entitlement_active'. That test cannot tell a PAID term from a FREE
--   one. Phone verification (pages/api/sms/verify-otp.js), the profile welcome
--   package, promo codes and the welcome-back offer all write the same column,
--   so a member on a free trial - the person the "1 USD first month" offer is
--   for - got 409 VIP_ENTITLEMENT_ACTIVE at checkout. Measured 2026-11-27:
--   38 human non-lifetime profiles hold a running term; none of them has a
--   paid VIP record on any rail; vip_subscriptions is empty.
--
-- THE RULE (fails closed):
--   Lifetime always refuses. A running term refuses unless
--   vip_running_term_is_complimentary() proves it is free:
--     * tier is empty or 'monthly' and the term ends within 62 days; and
--     * the profile carries no gift, lifetime-card or lifetime-since
--       provenance; and
--     * the account has NO paid VIP record at all: no vip_subscriptions row
--       (Card, in-app, Diamond-synthetic; any status), no Diamond VIP request,
--       no 'vip_membership' ledger debit, no redeemed gift, no settled
--       Lifetime purchase.
--   Anything else - including every case the helper cannot classify - is
--   treated exactly as before this migration: refused. An account that has
--   ever paid for VIP on any rail therefore behaves byte-for-byte as it did.
--
-- WHAT HAPPENS TO THE FREE DAYS:
--   Nothing is added on top and nothing is taken away. The unchanged
--   apply_vip_subscription_projection keeps the later of the free end date and
--   the paid period end; the first renewal moves the paid end past it. The
--   member is VIP continuously, and after the subscription ends is VIP only to
--   the later of the paid period end and the free end date already owed.
--
-- HOW:
--   The two function bodies are the installed bodies (asserted by md5 below)
--   with the single two-line entitlement test replaced. Lock order, replay,
--   conflict handling, grants, SECURITY DEFINER and search_path are unchanged.
--   The Phase 7 readiness marker comment survives CREATE OR REPLACE and is
--   re-asserted. No money, wallet, ledger or settled row is read for write.
-- ===========================================================================

BEGIN;

-- 1. PRE-FLIGHT: the installed bodies must be exactly the ones this file edits.
DO $precheck$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.vip_subscriptions') IS NULL
     OR to_regclass('public.vip_diamond_purchase_requests') IS NULL
     OR to_regclass('public.diamond_transactions') IS NULL
     OR to_regclass('public.vip_gifts') IS NULL
     OR to_regclass('public.vip_lifetime_purchases') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: a VIP provenance table is missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'profiles'
         AND column_name IN ('vip_tier', 'vip_expires_at', 'vip_gift_id',
                             'vip_lifetime_card_purchase_id',
                             'lifetime_vip_since')) <> 5 THEN
    RAISE EXCEPTION 'pre-flight failed: profiles VIP provenance columns are missing';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = to_regprocedure(
         'public.claim_vip_subscription_checkout(uuid,text,text,integer)'))
     IS DISTINCT FROM 'f8ba69a50d38f8b485b6a6f8d4efabfb' THEN
    RAISE EXCEPTION 'pre-flight failed: claim_vip_subscription_checkout is not the body this migration edits';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = to_regprocedure(
         'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'))
     IS DISTINCT FROM 'd00f77e6ad97abfdcfbc1736e0d7ddf2' THEN
    RAISE EXCEPTION 'pre-flight failed: admit_vip_subscription_checkout is not the body this migration edits';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('claim_vip_subscription_checkout',
                           'admit_vip_subscription_checkout')) <> 2 THEN
    RAISE EXCEPTION 'pre-flight failed: unexpected overloads of the VIP checkout functions';
  END IF;
END
$precheck$;

-- 2. THE CHANGES

-- TRUE only when the member's RUNNING term is provably free. FALSE for no
-- profile, no running term, or any doubt. Read-only; callers hold the profile
-- row lock, which every VIP acquisition rail takes first.
CREATE OR REPLACE FUNCTION public.vip_running_term_is_complimentary(
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $function$
  SELECT COALESCE((
    SELECT
      -- Shape of a free grant: the trial writers leave the tier empty or
      -- 'monthly', and two stacked 30-day grants cannot reach past 62 days.
      (profile.vip_tier IS NULL OR profile.vip_tier = 'monthly')
      AND profile.vip_expires_at IS NOT NULL
      AND profile.vip_expires_at > now()
      AND profile.vip_expires_at <= now() + interval '62 days'
      -- No paid provenance on the profile itself.
      AND profile.vip_gift_id IS NULL
      AND profile.vip_lifetime_card_purchase_id IS NULL
      AND profile.lifetime_vip_since IS NULL
      -- No Card, in-app or Diamond-synthetic subscription row, of any status.
      AND NOT EXISTS (
        SELECT 1
          FROM public.vip_subscriptions subscription
         WHERE subscription.user_id = profile.id
      )
      -- No Diamond VIP purchase, by durable request or by ledger debit.
      AND NOT EXISTS (
        SELECT 1
          FROM public.vip_diamond_purchase_requests request
         WHERE request.user_id = profile.id
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.diamond_transactions ledger
         WHERE ledger.user_id = profile.id
           AND ledger.transaction_type = 'vip_membership'
      )
      AND NOT EXISTS (
        SELECT 1
          FROM public.diamond_transactions ledger
         WHERE ledger.user_id = profile.id
           AND ledger.type = 'vip_membership'
      )
      -- No VIP gift this member ever redeemed.
      AND NOT EXISTS (
        SELECT 1
          FROM public.vip_gifts gift
         WHERE gift.recipient_id = profile.id
           AND (
             gift.redeemed_at IS NOT NULL
             OR gift.granted_entitlement IS NOT NULL
             OR gift.status = 'redeemed'
           )
      )
      -- No Lifetime purchase that ever settled.
      AND NOT EXISTS (
        SELECT 1
          FROM public.vip_lifetime_purchases lifetime_purchase
         WHERE lifetime_purchase.user_id = profile.id
           AND (
             lifetime_purchase.status IN ('completed', 'refunded')
             OR lifetime_purchase.completed_at IS NOT NULL
             OR lifetime_purchase.entitlement_acquired_at IS NOT NULL
           )
      )
      FROM public.profiles profile
     WHERE profile.id = p_user_id
  ), false)
$function$;

COMMENT ON FUNCTION public.vip_running_term_is_complimentary(uuid)
IS 'vip_complimentary_term:v1';

REVOKE ALL ON FUNCTION public.vip_running_term_is_complimentary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vip_running_term_is_complimentary(uuid)
  TO service_role;

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
  -- A running term still refuses Card Checkout unless it is positively a
  -- complimentary one (signup, phone-verification or promotional grant on an
  -- account with no paid VIP record on any rail). Unknown provenance keeps
  -- refusing: vip_running_term_is_complimentary() answers TRUE only on proof.
  IF v_profile.vip_tier = 'lifetime'
     OR (
       v_profile.vip_expires_at IS NOT NULL
       AND v_profile.vip_expires_at > now()
       AND public.vip_running_term_is_complimentary(p_user_id) IS NOT TRUE
     ) THEN
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

CREATE OR REPLACE FUNCTION public.admit_vip_subscription_checkout(
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

  -- A running term still refuses Card Checkout unless it is positively a
  -- complimentary one (signup, phone-verification or promotional grant on an
  -- account with no paid VIP record on any rail). Unknown provenance keeps
  -- refusing: vip_running_term_is_complimentary() answers TRUE only on proof.
  IF v_profile.vip_tier = 'lifetime'
     OR (
       v_profile.vip_expires_at IS NOT NULL
       AND v_profile.vip_expires_at > now()
       AND public.vip_running_term_is_complimentary(p_user_id) IS NOT TRUE
     ) THEN
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

REVOKE ALL ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vip_subscription_checkout(
  uuid, text, text, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_vip_subscription_checkout(
  uuid, text, text, text, text
) TO service_role;

-- 3. POST-APPLY ASSERTIONS
DO $postcheck$
DECLARE
  v_fn regprocedure;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = to_regprocedure(
         'public.claim_vip_subscription_checkout(uuid,text,text,integer)'))
     IS DISTINCT FROM '2b10e3c963cab520ebf7a957cdc9e088' THEN
    RAISE EXCEPTION 'post-apply failed: claim_vip_subscription_checkout body mismatch';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = to_regprocedure(
         'public.admit_vip_subscription_checkout(uuid,text,text,text,text)'))
     IS DISTINCT FROM '953bf8ed7934672171028f1554fbea98' THEN
    RAISE EXCEPTION 'post-apply failed: admit_vip_subscription_checkout body mismatch';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = to_regprocedure(
         'public.vip_running_term_is_complimentary(uuid)'))
     IS DISTINCT FROM '41c893a3660e42e69c2ae7e6a03f7821' THEN
    RAISE EXCEPTION 'post-apply failed: vip_running_term_is_complimentary body mismatch';
  END IF;
  -- The Phase 7 readiness marker must still answer: both comments survived
  -- and both bodies still carry the protocol operations it looks for.
  IF public.marketplace_phase7_vip_acquisition_mutex_version()
     IS DISTINCT FROM 'marketplace_phase7_vip_acquisition_mutex:v1' THEN
    RAISE EXCEPTION 'post-apply failed: Phase 7 VIP acquisition marker went stale';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    to_regprocedure('public.claim_vip_subscription_checkout(uuid,text,text,integer)'),
    to_regprocedure('public.admit_vip_subscription_checkout(uuid,text,text,text,text)'),
    to_regprocedure('public.vip_running_term_is_complimentary(uuid)')
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'post-apply failed: % is not service-only', v_fn;
    END IF;
  END LOOP;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(
            'public.claim_vip_subscription_checkout(uuid,text,text,integer)'))
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(
            'public.admit_vip_subscription_checkout(uuid,text,text,text,text)')) THEN
    RAISE EXCEPTION 'post-apply failed: a checkout function lost SECURITY DEFINER';
  END IF;
  -- A missing profile is never complimentary.
  IF public.vip_running_term_is_complimentary(
       '00000000-0000-0000-0000-000000000000'::uuid) IS NOT FALSE THEN
    RAISE EXCEPTION 'post-apply failed: the helper did not fail closed for a missing profile';
  END IF;
END
$postcheck$;

COMMIT;

-- ===========================================================================
-- ROLLBACK (Tier 3: paste into a NEW migration to restore the prior bodies)
-- ===========================================================================
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.claim_vip_subscription_checkout(
--   p_user_id uuid,
--   p_request_id text,
--   p_intent_hash text,
--   p_lease_seconds integer DEFAULT 300
-- ) RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, extensions
-- AS $function$
-- DECLARE
--   v_claim public.vip_subscription_checkout_claims%ROWTYPE;
--   v_profile public.profiles%ROWTYPE;
-- BEGIN
--   IF p_request_id IS NULL OR p_intent_hash !~ '^[a-f0-9]{64}$' THEN
--     RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
--   END IF;
--
--   -- Both purchase methods take this same row lock before inspecting the
--   -- opposite rail. Whichever transaction commits first leaves durable state
--   -- that makes the other transaction fail closed.
--   SELECT * INTO v_profile
--     FROM public.profiles
--    WHERE id = p_user_id
--    FOR UPDATE;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object('claimed', false, 'state', 'profile_not_found');
--   END IF;
--
--   -- Preserve existing Card claim replay and conflict behavior before testing
--   -- whether a new Card acquisition may begin.
--   SELECT * INTO v_claim
--     FROM public.vip_subscription_checkout_claims
--    WHERE user_id = p_user_id
--    FOR UPDATE;
--   IF FOUND AND (
--     v_claim.state = 'admitting'
--     OR v_claim.expires_at > now()
--   ) THEN
--     IF v_claim.request_id = p_request_id AND v_claim.intent_hash = p_intent_hash THEN
--       IF v_claim.state IN ('initializing', 'admitting') THEN
--         UPDATE public.vip_subscription_checkout_claims
--            SET expires_at = GREATEST(
--                  expires_at,
--                  now() + make_interval(secs => GREATEST(60, p_lease_seconds))
--                ),
--                updated_at = now()
--          WHERE user_id = p_user_id
--            AND request_id = p_request_id
--            AND intent_hash = p_intent_hash
--         RETURNING * INTO v_claim;
--       END IF;
--       RETURN jsonb_build_object(
--         'claimed', false,
--         'state', v_claim.state,
--         'session_id', v_claim.session_id,
--         'session_url', v_claim.session_url
--       );
--     END IF;
--     RETURN jsonb_build_object('claimed', false, 'state', 'conflict');
--   END IF;
--
--   DELETE FROM public.vip_subscription_checkout_claims
--    WHERE user_id = p_user_id
--      AND state <> 'admitting';
--
--   -- Do not sell overlapping time. This covers current v3 Diamond purchases,
--   -- older Diamond grants, promotional prepaid terms, and any legacy active
--   -- profile that predates the durable Diamond request table.
--   IF v_profile.vip_tier = 'lifetime'
--      OR (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > now()) THEN
--     RETURN jsonb_build_object('claimed', false, 'state', 'vip_entitlement_active');
--   END IF;
--
--   INSERT INTO public.vip_subscription_checkout_claims(
--     user_id, request_id, intent_hash, state, expires_at
--   ) VALUES (
--     p_user_id,
--     p_request_id,
--     p_intent_hash,
--     'initializing',
--     now() + make_interval(secs => GREATEST(60, p_lease_seconds))
--   );
--   RETURN jsonb_build_object('claimed', true, 'state', 'initializing');
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.admit_vip_subscription_checkout(
--   p_user_id uuid,
--   p_stripe_subscription_id text,
--   p_request_id text,
--   p_intent_hash text,
--   p_session_id text DEFAULT NULL
-- ) RETURNS jsonb
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, extensions
-- AS $function$
-- DECLARE
--   v_profile public.profiles%ROWTYPE;
--   v_claim public.vip_subscription_checkout_claims%ROWTYPE;
--   v_subscription public.vip_subscriptions%ROWTYPE;
--   v_prior_subscription public.vip_subscriptions%ROWTYPE;
--   v_claim_found boolean := false;
--   v_barrier_expires_at timestamptz := now() + interval '7 days';
-- BEGIN
--   IF p_user_id IS NULL
--      OR p_stripe_subscription_id IS NULL
--      OR btrim(p_stripe_subscription_id) = ''
--      OR length(p_stripe_subscription_id) > 255
--      OR p_request_id IS NULL
--      OR btrim(p_request_id) = ''
--      OR length(p_request_id) > 200
--      OR p_intent_hash IS NULL
--      OR p_intent_hash !~ '^[a-f0-9]{64}$'
--      OR (p_session_id IS NOT NULL AND (
--        btrim(p_session_id) = '' OR length(p_session_id) > 255
--      )) THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'admitted', false,
--       'state', 'invalid'
--     );
--   END IF;
--
--   -- All Card and Diamond admissions serialize on this same row first.
--   SELECT * INTO v_profile
--     FROM public.profiles
--    WHERE id = p_user_id
--    FOR UPDATE;
--   IF NOT FOUND THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'admitted', false,
--       'state', 'profile_not_found'
--     );
--   END IF;
--
--   -- Preserve the shared lock order: profile, Card claim, subscription ledger.
--   SELECT * INTO v_claim
--     FROM public.vip_subscription_checkout_claims
--    WHERE user_id = p_user_id
--    FOR UPDATE;
--   v_claim_found := FOUND;
--
--   SELECT * INTO v_subscription
--     FROM public.vip_subscriptions
--    WHERE stripe_subscription_id = p_stripe_subscription_id
--    FOR UPDATE;
--   IF FOUND THEN
--     IF v_subscription.user_id IS DISTINCT FROM p_user_id THEN
--       RETURN jsonb_build_object(
--         'success', false,
--         'admitted', false,
--         'state', 'subscription_conflict'
--       );
--     END IF;
--     IF v_claim_found
--        AND v_claim.state = 'admitting'
--        AND (
--          v_claim.request_id <> p_request_id
--          OR v_claim.intent_hash <> p_intent_hash
--        ) THEN
--       RETURN jsonb_build_object(
--         'success', false,
--         'admitted', false,
--         'state', 'claim_conflict'
--       );
--     END IF;
--     IF v_claim_found
--        AND v_claim.request_id = p_request_id
--        AND v_claim.intent_hash = p_intent_hash THEN
--       IF v_claim.session_id IS NOT NULL
--          AND p_session_id IS DISTINCT FROM v_claim.session_id THEN
--         RETURN jsonb_build_object(
--           'success', false,
--           'admitted', false,
--           'state', 'session_conflict'
--         );
--       END IF;
--       IF v_claim.state <> 'admitting' THEN
--         UPDATE public.vip_subscription_checkout_claims
--            SET state = 'admitting',
--                session_id = COALESCE(session_id, p_session_id),
--                expires_at = GREATEST(expires_at, v_barrier_expires_at),
--                updated_at = now()
--          WHERE user_id = p_user_id
--            AND request_id = p_request_id
--            AND intent_hash = p_intent_hash;
--         IF NOT FOUND THEN
--           RAISE EXCEPTION 'VIP subscription replay barrier disappeared while locked';
--         END IF;
--       END IF;
--     END IF;
--     RETURN jsonb_build_object(
--       'success', true,
--       'admitted', false,
--       'state', 'replay',
--       'finalize_required', (
--         v_claim_found
--         AND v_claim.request_id = p_request_id
--         AND v_claim.intent_hash = p_intent_hash
--       ),
--       'stripe_subscription_id', p_stripe_subscription_id
--     );
--   END IF;
--
--   -- Production intentionally keeps one current subscription row per user.
--   -- Lock that row now. A live Card obligation or unexpired Diamond grant is an
--   -- overlap; an expired/terminal row is recycled only after every entitlement
--   -- and claim check below succeeds, inside this same admission transaction.
--   SELECT * INTO v_prior_subscription
--     FROM public.vip_subscriptions subscription
--    WHERE subscription.user_id = p_user_id
--      AND subscription.stripe_subscription_id IS DISTINCT FROM p_stripe_subscription_id
--    FOR UPDATE;
--   IF FOUND AND (
--     (
--       v_prior_subscription.stripe_subscription_id IS NOT NULL
--       AND left(v_prior_subscription.stripe_subscription_id, 8) <> 'diamond_'
--       AND v_prior_subscription.status IN (
--         'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'
--       )
--     ) OR (
--       v_prior_subscription.stripe_subscription_id IS NOT NULL
--       AND left(v_prior_subscription.stripe_subscription_id, 8) = 'diamond_'
--       AND v_prior_subscription.status IN ('active', 'trialing')
--       AND (
--         v_prior_subscription.tier = 'lifetime'
--         OR v_prior_subscription.current_period_end > now()
--       )
--     )
--   ) THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'admitted', false,
--       'state', 'vip_entitlement_active'
--     );
--   END IF;
--
--   IF v_profile.vip_tier = 'lifetime'
--      OR (v_profile.vip_expires_at IS NOT NULL AND v_profile.vip_expires_at > now()) THEN
--     RETURN jsonb_build_object(
--       'success', false,
--       'admitted', false,
--       'state', 'vip_entitlement_active'
--     );
--   END IF;
--
--   IF v_claim_found THEN
--     IF v_claim.request_id = p_request_id
--        AND v_claim.intent_hash = p_intent_hash THEN
--       IF v_claim.session_id IS NOT NULL
--          AND p_session_id IS DISTINCT FROM v_claim.session_id THEN
--         RETURN jsonb_build_object(
--           'success', false,
--           'admitted', false,
--           'state', 'session_conflict'
--         );
--       END IF;
--
--       UPDATE public.vip_subscription_checkout_claims
--          SET state = 'admitting',
--              session_id = COALESCE(session_id, p_session_id),
--              expires_at = GREATEST(expires_at, v_barrier_expires_at),
--              updated_at = now()
--        WHERE user_id = p_user_id
--          AND request_id = p_request_id
--          AND intent_hash = p_intent_hash;
--       IF NOT FOUND THEN
--         RAISE EXCEPTION 'VIP subscription admission barrier disappeared while locked';
--       END IF;
--       IF v_prior_subscription.id IS NOT NULL THEN
--         UPDATE public.vip_subscriptions
--            SET stripe_subscription_id = p_stripe_subscription_id,
--                updated_at = now()
--          WHERE id = v_prior_subscription.id;
--         IF NOT FOUND THEN
--           RAISE EXCEPTION 'Terminal VIP subscription row disappeared while locked';
--         END IF;
--       END IF;
--       RETURN jsonb_build_object(
--         'success', true,
--         'admitted', true,
--         'state', 'admitted',
--         'finalize_required', true,
--         'claim_adopted', true,
--         'barrier_expires_at', v_barrier_expires_at,
--         'stripe_subscription_id', p_stripe_subscription_id
--       );
--     END IF;
--
--     IF v_claim.state = 'admitting'
--        OR v_claim.expires_at > now() THEN
--       RETURN jsonb_build_object(
--         'success', false,
--         'admitted', false,
--         'state', 'claim_conflict'
--       );
--     END IF;
--
--     DELETE FROM public.vip_subscription_checkout_claims
--      WHERE user_id = p_user_id
--        AND state <> 'admitting';
--   END IF;
--
--   -- A classified legacy subscription can supply a deterministic synthetic
--   -- request/hash. It is safe to establish that barrier only after proving no
--   -- active entitlement and no unexpired conflicting claim above.
--   INSERT INTO public.vip_subscription_checkout_claims(
--     user_id,
--     request_id,
--     intent_hash,
--     state,
--     session_id,
--     expires_at,
--     updated_at
--   ) VALUES (
--     p_user_id,
--     p_request_id,
--     p_intent_hash,
--     'admitting',
--     p_session_id,
--     v_barrier_expires_at,
--     now()
--   );
--
--   IF v_prior_subscription.id IS NOT NULL THEN
--     UPDATE public.vip_subscriptions
--        SET stripe_subscription_id = p_stripe_subscription_id,
--            updated_at = now()
--      WHERE id = v_prior_subscription.id;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Terminal VIP subscription row disappeared while locked';
--     END IF;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'success', true,
--     'admitted', true,
--     'state', 'admitted',
--     'finalize_required', true,
--     'claim_adopted', false,
--     'barrier_expires_at', v_barrier_expires_at,
--     'stripe_subscription_id', p_stripe_subscription_id
--   );
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.vip_running_term_is_complimentary(uuid);
--
-- COMMIT;
