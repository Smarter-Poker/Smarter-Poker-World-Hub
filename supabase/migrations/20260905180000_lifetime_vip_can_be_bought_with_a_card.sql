-- ═══════════════════════════════════════════════════════════════════════════
--  LIFETIME VIP CAN BE BOUGHT WITH A CARD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dan, 2026-09-05: "just vip, monthly, yearly or lifetime, add lifetime for
-- $499", and Lifetime is buyable "$499 or 49,900 diamonds".
--
-- The diamond half shipped the same day. THE CARD HALF COULD NOT, and the
-- reason is worth writing down because it is a money-losing shape:
--
--   * create-checkout-session builds `mode` as
--     `type === 'subscription' ? 'subscription' : 'payment'`, and its
--     `payment` path is hard-wired to diamonds and merchandise - it requires
--     `resolvedPackages` or `resolvedItems`.
--   * `prepareCheckout` refuses any Stripe price with no `.recurring`, so a
--     one-time price is rejected before it is reached.
--   * `handleCheckoutCompleted` in webhooks/stripe.js has NO VIP BRANCH AT ALL
--     under `mode === 'payment'`. It handles `metadata.type === 'diamonds'`
--     and `'merchandise'` and then falls off the end of the chain.
--
-- So a one-time VIP session would have been PAID, granted NOTHING, and
-- returned 200 - which tells Stripe never to retry. The money would be taken
-- and the membership silently never issued. That is why the storefront offered
-- no card button rather than one that fails.
--
-- This migration is the persistence half of closing that: a pending-purchase
-- row the webhook can settle exactly once.
--
-- WHY A ROW AND NOT A DIRECT PROFILE WRITE
--
-- The webhook can fire more than once for one session, can fire before the
-- browser returns, and can fire for a session whose charge is later refunded.
-- Every other card path here settles through a pending row for exactly that
-- reason (`diamond_purchases`, `merchandise_orders`). This one matches, so a
-- replay is a no-op and a refund has something to point at.
--
-- One transaction, per the production DDL policy (CLAUDE.md section 2).

BEGIN;

CREATE TABLE IF NOT EXISTS public.vip_lifetime_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_usd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT vip_lifetime_purchases_status_check
    CHECK (status = ANY (ARRAY['pending','completed','failed','refunded'])),
  /* One settled purchase per Stripe session. This is what makes a webhook
     replay a no-op rather than a second grant. */
  CONSTRAINT vip_lifetime_purchases_session_key UNIQUE (stripe_checkout_session_id)
);

CREATE INDEX IF NOT EXISTS vip_lifetime_purchases_user_idx
  ON public.vip_lifetime_purchases (user_id, created_at DESC);

COMMENT ON TABLE public.vip_lifetime_purchases IS
  'One row per Lifetime VIP card checkout ($499, Dan 2026-09-05). Written '
  'pending by create-checkout-session and settled exactly once by the Stripe '
  'webhook through settle_vip_lifetime_card_purchase_atomic. The diamond path '
  '(49,900) does not use this table - it settles inside '
  'purchase_vip_with_diamonds_atomic.';

-- ── The settlement ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.settle_vip_lifetime_card_purchase_atomic(
  p_purchase_id uuid,
  p_session_id text,
  p_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_purchase public.vip_lifetime_purchases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_purchase
    FROM public.vip_lifetime_purchases
   WHERE id = p_purchase_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_found');
  END IF;

  /* A replay of the SAME session is success, not a second grant. A different
     session pointing at this row is a conflict and must not be settled: two
     charges for one purchase row is the shape that pays a membership twice. */
  IF v_purchase.status = 'completed' THEN
    IF v_purchase.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'settlement_conflict');
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', true,
                              'purchase_id', v_purchase.id, 'tier', 'lifetime');
  END IF;

  IF v_purchase.status = 'refunded' THEN
    /* Refunded before the completion event arrived. Acknowledge it as terminal
       so Stripe stops retrying, and never grant. */
    RETURN jsonb_build_object('success', true, 'duplicate', true,
                              'terminal_refund', true, 'purchase_id', v_purchase.id);
  END IF;

  IF v_purchase.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'purchase_not_pending');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_purchase.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  /* NULL expiry, not a distant one. expire_lapsed_vip is guarded on
     `vip_expires_at IS NOT NULL` as well as on the tier, and a NULL satisfies
     the first guard on its own. */
  UPDATE public.profiles
     SET is_vip = true,
         vip_tier = 'lifetime',
         vip_expires_at = NULL,
         updated_at = now()
   WHERE id = v_purchase.user_id;

  UPDATE public.vip_lifetime_purchases
     SET status = 'completed',
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
         completed_at = now()
   WHERE id = p_purchase_id;

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

COMMENT ON FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid, text, text) IS
  'Settles one Lifetime VIP card purchase exactly once: sets is_vip, '
  'vip_tier = lifetime and a NULL vip_expires_at, and marks the pending row '
  'completed. A replay of the same session returns duplicate:true; a different '
  'session on the same row is refused as settlement_conflict.';

/* NOBODY IN A BROWSER CALLS THIS. It grants a paid membership from a purchase
   id and is SECURITY DEFINER, so a caller who could reach it could grant
   itself Lifetime VIP for free. Its only caller is the Stripe webhook, with
   the service role, after Stripe has confirmed payment. */
REVOKE ALL ON FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_vip_lifetime_card_purchase_atomic(uuid, text, text)
  TO service_role;

COMMIT;
