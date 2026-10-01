-- Lifetime VIP Card settlement, refund, and dispute safety.
-- TIER: 3 (paid entitlement mutation)
-- AFFECTS: profiles, vip_lifetime_purchases, Stripe webhook RPC contract.
-- IRREVERSIBLE: no. The rollback block removes only the additive lifecycle
-- columns/functions after the application has been rolled back.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.vip_lifetime_purchases') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: vip_lifetime_purchases is missing';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: profiles is missing';
  END IF;
  IF to_regprocedure(
    'public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: Lifetime Card settlement RPC is missing';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.vip_lifetime_purchases
     WHERE price_usd IS DISTINCT FROM 499.00
  ) THEN
    RAISE EXCEPTION 'pre-flight failed: a Lifetime Card row has a non-$499 price';
  END IF;
END
$preflight$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vip_lifetime_card_purchase_id uuid
    REFERENCES public.vip_lifetime_purchases(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.vip_lifetime_card_purchase_id IS
  'Provenance for the Lifetime VIP Card purchase that currently owns the profile entitlement. Cleared automatically when another VIP writer changes the entitlement.';

ALTER TABLE public.vip_lifetime_purchases
  ADD COLUMN IF NOT EXISTS previous_is_vip boolean,
  ADD COLUMN IF NOT EXISTS previous_vip_tier text,
  ADD COLUMN IF NOT EXISTS previous_vip_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_id text,
  ADD COLUMN IF NOT EXISTS dispute_status text,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS entitlement_acquired_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.vip_lifetime_purchases
  DROP CONSTRAINT IF EXISTS vip_lifetime_purchases_refunded_amount_check,
  ADD CONSTRAINT vip_lifetime_purchases_refunded_amount_check
    CHECK (refunded_amount_cents BETWEEN 0 AND 49900),
  DROP CONSTRAINT IF EXISTS vip_lifetime_purchases_dispute_status_check,
  ADD CONSTRAINT vip_lifetime_purchases_dispute_status_check
    CHECK (dispute_status IS NULL OR dispute_status IN (
      'open', 'funds_withdrawn', 'won', 'lost'
    )),
  DROP CONSTRAINT IF EXISTS vip_lifetime_purchases_reversal_reason_check,
  ADD CONSTRAINT vip_lifetime_purchases_reversal_reason_check
    CHECK (reversal_reason IS NULL OR reversal_reason IN ('refund', 'dispute'));

CREATE UNIQUE INDEX IF NOT EXISTS vip_lifetime_purchases_payment_intent_uidx
  ON public.vip_lifetime_purchases(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- A later VIP writer which does not explicitly claim this Card purchase must
-- clear the provenance. This prevents an old refund from revoking a newer
-- subscription, Diamond purchase, or operator grant.
CREATE OR REPLACE FUNCTION public.clear_stale_lifetime_card_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF (
       NEW.is_vip IS DISTINCT FROM OLD.is_vip
       OR NEW.vip_tier IS DISTINCT FROM OLD.vip_tier
       OR NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at
     )
     AND NEW.vip_lifetime_card_purchase_id IS NOT DISTINCT FROM OLD.vip_lifetime_card_purchase_id
  THEN
    NEW.vip_lifetime_card_purchase_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clear_stale_lifetime_card_provenance ON public.profiles;
CREATE TRIGGER trg_clear_stale_lifetime_card_provenance
  BEFORE UPDATE OF is_vip, vip_tier, vip_expires_at, vip_lifetime_card_purchase_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_stale_lifetime_card_provenance();

CREATE OR REPLACE FUNCTION public.settle_vip_lifetime_card_purchase_atomic(
  p_purchase_id uuid,
  p_session_id text,
  p_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_purchase public.vip_lifetime_purchases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_purchase_id IS NULL OR COALESCE(btrim(p_session_id), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  SELECT * INTO v_purchase
    FROM public.vip_lifetime_purchases
   WHERE id = p_purchase_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
  END IF;
  IF v_purchase.price_usd IS DISTINCT FROM 499.00 THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_mismatch');
  END IF;

  IF v_purchase.status = 'completed' THEN
    IF v_purchase.stripe_checkout_session_id IS DISTINCT FROM p_session_id
       OR (
         v_purchase.stripe_payment_intent_id IS NOT NULL
         AND p_payment_intent_id IS NOT NULL
         AND v_purchase.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'purchase_id', v_purchase.id,
      'tier', 'lifetime'
    );
  END IF;
  IF v_purchase.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'terminal_refund', true,
      'purchase_id', v_purchase.id
    );
  END IF;
  IF v_purchase.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_pending');
  END IF;
  IF v_purchase.stripe_checkout_session_id IS NOT NULL
     AND v_purchase.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = v_purchase.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  UPDATE public.vip_lifetime_purchases
     SET previous_is_vip = COALESCE(previous_is_vip, v_profile.is_vip),
         previous_vip_tier = CASE
           WHEN previous_is_vip IS NULL THEN v_profile.vip_tier
           ELSE previous_vip_tier
         END,
         previous_vip_expires_at = CASE
           WHEN previous_is_vip IS NULL THEN v_profile.vip_expires_at
           ELSE previous_vip_expires_at
         END,
         status = 'completed',
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
         completed_at = COALESCE(completed_at, v_now),
         entitlement_acquired_at = COALESCE(entitlement_acquired_at, v_now),
         updated_at = v_now
   WHERE id = p_purchase_id;

  UPDATE public.profiles
     SET is_vip = true,
         vip_tier = 'lifetime',
         vip_expires_at = NULL,
         vip_lifetime_card_purchase_id = p_purchase_id,
         updated_at = v_now
   WHERE id = v_purchase.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'purchase_id', v_purchase.id,
    'user_id', v_purchase.user_id,
    'tier', 'lifetime',
    'previous_tier', v_profile.vip_tier
  );
END;
$function$;

-- Cumulative Stripe state is authoritative. Partial refunds are recorded but
-- do not revoke Lifetime. A full refund or a lost/withdrawn full dispute
-- restores the exact entitlement snapshot only when this purchase still owns
-- the profile provenance. A won dispute can re-grant the paid entitlement.
CREATE OR REPLACE FUNCTION public.reconcile_vip_lifetime_card_reversal_atomic(
  p_purchase_id uuid,
  p_charge_amount_cents integer,
  p_refunded_amount_cents integer DEFAULT 0,
  p_event text DEFAULT 'refund',
  p_dispute_id text DEFAULT NULL,
  p_dispute_amount_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_purchase public.vip_lifetime_purchases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_event text := lower(btrim(COALESCE(p_event, '')));
  v_effective_refund integer;
  v_dispute_amount integer := COALESCE(p_dispute_amount_cents, 0);
  v_full_reversal boolean := false;
  v_should_restore boolean := false;
  v_should_regrant boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_purchase_id IS NULL
     OR p_charge_amount_cents <> 49900
     OR p_refunded_amount_cents IS NULL
     OR p_refunded_amount_cents < 0
     OR p_refunded_amount_cents > p_charge_amount_cents
     OR v_event NOT IN (
       'refund', 'dispute_created', 'dispute_funds_withdrawn',
       'dispute_closed_won', 'dispute_closed_lost'
     )
     OR (v_event <> 'refund' AND COALESCE(btrim(p_dispute_id), '') = '')
     OR (p_dispute_amount_cents IS NOT NULL AND (
       p_dispute_amount_cents < 0 OR p_dispute_amount_cents > p_charge_amount_cents
     ))
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_arguments');
  END IF;

  SELECT * INTO v_purchase
    FROM public.vip_lifetime_purchases
   WHERE id = p_purchase_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
  END IF;
  IF v_purchase.price_usd IS DISTINCT FROM 499.00 THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_mismatch');
  END IF;
  IF v_purchase.status NOT IN ('completed', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_settled');
  END IF;
  IF v_purchase.dispute_id IS NOT NULL
     AND p_dispute_id IS NOT NULL
     AND v_purchase.dispute_id IS DISTINCT FROM p_dispute_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispute_conflict');
  END IF;

  SELECT * INTO v_profile
    FROM public.profiles
   WHERE id = v_purchase.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  v_effective_refund := GREATEST(
    COALESCE(v_purchase.refunded_amount_cents, 0),
    p_refunded_amount_cents
  );
  v_full_reversal := v_effective_refund >= p_charge_amount_cents
    OR (
      v_event IN ('dispute_funds_withdrawn', 'dispute_closed_lost')
      AND v_dispute_amount >= p_charge_amount_cents
    );
  v_should_restore := v_full_reversal
    AND v_profile.vip_lifetime_card_purchase_id = p_purchase_id;

  IF v_event = 'dispute_closed_won' THEN
    -- A won dispute may reverse only a dispute-driven revocation. It must
    -- never overwrite an independent full refund, newer VIP grant, or other
    -- entitlement writer.
    v_should_regrant := v_purchase.reversal_reason = 'dispute'
      AND v_effective_refund < p_charge_amount_cents
      AND v_profile.vip_lifetime_card_purchase_id IS NULL
      AND v_profile.is_vip IS NOT DISTINCT FROM COALESCE(v_purchase.previous_is_vip, false)
      AND v_profile.vip_tier IS NOT DISTINCT FROM v_purchase.previous_vip_tier
      AND v_profile.vip_expires_at IS NOT DISTINCT FROM v_purchase.previous_vip_expires_at;

    UPDATE public.vip_lifetime_purchases
       SET status = CASE WHEN v_should_regrant THEN 'completed' ELSE status END,
           dispute_id = p_dispute_id,
           dispute_status = 'won',
           reversal_reason = CASE
             WHEN v_should_regrant THEN NULL
             ELSE reversal_reason
           END,
           reversed_at = CASE
             WHEN v_should_regrant THEN NULL
             ELSE reversed_at
           END,
           updated_at = v_now
     WHERE id = p_purchase_id;

    IF v_should_regrant
       AND (
         v_profile.vip_tier IS DISTINCT FROM 'lifetime'
         OR COALESCE(v_profile.is_vip, false) IS NOT TRUE
       ) THEN
      UPDATE public.profiles
         SET is_vip = true,
             vip_tier = 'lifetime',
             vip_expires_at = NULL,
             vip_lifetime_card_purchase_id = p_purchase_id,
             updated_at = v_now
       WHERE id = v_purchase.user_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'purchase_id', p_purchase_id,
      'event', v_event,
      'restored', v_should_regrant,
      'duplicate', v_purchase.dispute_status = 'won',
      'refund_preserved', v_effective_refund >= p_charge_amount_cents
    );
  END IF;

  IF v_should_restore THEN
    UPDATE public.profiles
       SET is_vip = COALESCE(v_purchase.previous_is_vip, false),
           vip_tier = v_purchase.previous_vip_tier,
           vip_expires_at = v_purchase.previous_vip_expires_at,
           vip_lifetime_card_purchase_id = NULL,
           updated_at = v_now
     WHERE id = v_purchase.user_id;
  END IF;

  UPDATE public.vip_lifetime_purchases
     SET refunded_amount_cents = v_effective_refund,
         status = CASE WHEN v_full_reversal THEN 'refunded' ELSE status END,
         dispute_id = COALESCE(p_dispute_id, dispute_id),
         dispute_status = CASE v_event
           WHEN 'dispute_created' THEN 'open'
           WHEN 'dispute_funds_withdrawn' THEN 'funds_withdrawn'
           WHEN 'dispute_closed_lost' THEN 'lost'
           ELSE dispute_status
         END,
         reversal_reason = CASE
           WHEN v_full_reversal AND v_event = 'refund' THEN 'refund'
           WHEN v_full_reversal THEN 'dispute'
           ELSE reversal_reason
         END,
         reversed_at = CASE WHEN v_full_reversal THEN COALESCE(reversed_at, v_now) ELSE reversed_at END,
         updated_at = v_now
   WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'event', v_event,
    'refunded_amount_cents', v_effective_refund,
    'full_reversal', v_full_reversal,
    'profile_restored', v_should_restore
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_stale_lifetime_card_provenance()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_vip_lifetime_card_reversal_atomic(
  uuid,integer,integer,text,text,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_vip_lifetime_card_reversal_atomic(
  uuid,integer,integer,text,text,integer
) TO service_role;

DO $postcheck$
DECLARE
  v_settlement text;
  v_reversal text;
BEGIN
  SELECT p.prosrc INTO v_settlement
    FROM pg_proc p
   WHERE p.oid = to_regprocedure(
     'public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)'
   );
  SELECT p.prosrc INTO v_reversal
    FROM pg_proc p
   WHERE p.oid = to_regprocedure(
     'public.reconcile_vip_lifetime_card_reversal_atomic(uuid,integer,integer,text,text,integer)'
   );

  IF v_settlement IS NULL
     OR position('vip_lifetime_card_purchase_id = p_purchase_id' IN v_settlement) = 0
     OR position('price_mismatch' IN v_settlement) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime Card settlement is incomplete';
  END IF;
  IF v_reversal IS NULL
     OR position('v_profile.vip_lifetime_card_purchase_id = p_purchase_id' IN v_reversal) = 0
     OR position('dispute_closed_won' IN v_reversal) = 0 THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime Card reversal is incomplete';
  END IF;
  IF has_function_privilege(
       'authenticated',
       'public.reconcile_vip_lifetime_card_reversal_atomic(uuid,integer,integer,text,text,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.reconcile_vip_lifetime_card_reversal_atomic(uuid,integer,integer,text,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'post-apply failed: Lifetime Card reversal is client-executable';
  END IF;
END
$postcheck$;

COMMIT;

-- ROLLBACK (apply in a new migration after rolling back application callers):
/*
BEGIN;
DROP FUNCTION IF EXISTS public.reconcile_vip_lifetime_card_reversal_atomic(
  uuid,integer,integer,text,text,integer
);
DROP TRIGGER IF EXISTS trg_clear_stale_lifetime_card_provenance ON public.profiles;
DROP FUNCTION IF EXISTS public.clear_stale_lifetime_card_provenance();
DROP INDEX IF EXISTS public.vip_lifetime_purchases_payment_intent_uidx;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS vip_lifetime_card_purchase_id;
ALTER TABLE public.vip_lifetime_purchases
  DROP COLUMN IF EXISTS previous_is_vip,
  DROP COLUMN IF EXISTS previous_vip_tier,
  DROP COLUMN IF EXISTS previous_vip_expires_at,
  DROP COLUMN IF EXISTS refunded_amount_cents,
  DROP COLUMN IF EXISTS dispute_id,
  DROP COLUMN IF EXISTS dispute_status,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS entitlement_acquired_at,
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS updated_at;
COMMIT;
*/
