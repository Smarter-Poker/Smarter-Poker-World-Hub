-- TIER: 3. Whole-dollar marketplace offers authorized November 1, 2026.
-- Existing receipts, subscriptions, gifts and refunds retain their paid amounts.
-- AFFECTS: catalog pricing and compatible VIP settlement/gift contracts.
-- IRREVERSIBLE: no; retain historical records and disable new offers on rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regclass('public.vip_gifts') IS NULL OR to_regclass('public.diamond_packages') IS NULL THEN
  RAISE EXCEPTION 'Required marketplace authority missing';
 END IF;
END $$;

-- Round authoritative catalog writes, including future variant price overrides.
CREATE OR REPLACE FUNCTION public.marketplace_whole_dollar_catalog_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
 IF NEW.price_usd IS NOT NULL THEN NEW.price_usd := ceil(NEW.price_usd); END IF;
 IF TG_TABLE_NAME <> 'diamond_packages' THEN
  IF NEW.price_diamonds IS NOT NULL THEN
   NEW.price_diamonds := (ceil(NEW.price_diamonds::numeric / 100) * 100)::integer;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketplace_whole_dollar_price BEFORE INSERT OR UPDATE OF price_usd
 ON public.diamond_packages FOR EACH ROW EXECUTE FUNCTION public.marketplace_whole_dollar_catalog_price();
CREATE TRIGGER marketplace_whole_dollar_price BEFORE INSERT OR UPDATE OF price_usd, price_diamonds
 ON public.merchandise_items FOR EACH ROW EXECUTE FUNCTION public.marketplace_whole_dollar_catalog_price();
CREATE TRIGGER marketplace_whole_dollar_price BEFORE INSERT OR UPDATE OF price_usd, price_diamonds
 ON public.merchandise_item_variants FOR EACH ROW EXECUTE FUNCTION public.marketplace_whole_dollar_catalog_price();
UPDATE public.diamond_packages SET price_usd=ceil(price_usd) WHERE price_usd<>ceil(price_usd);
UPDATE public.merchandise_items SET price_usd=ceil(price_usd), price_diamonds=(ceil(price_diamonds::numeric/100)*100)::integer
 WHERE price_usd<>ceil(price_usd) OR price_diamonds % 100 <> 0;
UPDATE public.merchandise_item_variants SET price_usd=ceil(price_usd), price_diamonds=(ceil(price_diamonds::numeric/100)*100)::integer
 WHERE price_usd<>ceil(price_usd) OR price_diamonds % 100 <> 0;

-- Both schedules remain legal for pre-cutover paid records, without rewriting history.
ALTER TABLE public.vip_gifts DROP CONSTRAINT vip_gifts_check1;
ALTER TABLE public.vip_gifts ADD CONSTRAINT vip_gifts_check1 CHECK (
 (plan='monthly' AND amount IN (1999,2000)) OR
 (plan='yearly' AND amount IN (19999,20000)) OR
 (plan='lifetime' AND amount IN (49900,50000)));
ALTER TABLE public.vip_lifetime_purchases DROP CONSTRAINT vip_lifetime_purchases_refunded_amount_check;
ALTER TABLE public.vip_lifetime_purchases ADD CONSTRAINT vip_lifetime_purchases_refunded_amount_check
 CHECK (refunded_amount_cents >= 0 AND refunded_amount_cents <= round(price_usd*100));

CREATE OR REPLACE FUNCTION public.reconcile_vip_lifetime_card_reversal_atomic(p_purchase_id uuid, p_charge_amount_cents integer, p_refunded_amount_cents integer DEFAULT 0, p_event text DEFAULT 'refund'::text, p_dispute_id text DEFAULT NULL::text, p_dispute_amount_cents integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
     OR (p_charge_amount_cents IS NULL OR p_charge_amount_cents NOT IN (49900,50000))
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
  IF v_purchase.price_usd NOT IN (499.00, 500.00) OR v_purchase.price_usd IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_mismatch');
  END IF;
  IF p_charge_amount_cents IS DISTINCT FROM round(v_purchase.price_usd * 100)::integer THEN
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

CREATE OR REPLACE FUNCTION public.send_vip_gift_atomic(p_sender uuid, p_recipient uuid, p_request text, p_plan text, p_method text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE g public.vip_gifts%ROWTYPE; w jsonb;
BEGIN
 IF p_sender IS NULL OR p_recipient IS NULL OR p_sender=p_recipient OR
    p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{8,128}$' OR
    p_plan IS NULL OR p_plan NOT IN ('monthly','yearly','lifetime') OR
    p_method IS NULL OR p_method NOT IN ('card','diamonds') OR p_amount IS NULL OR p_amount <= 0 THEN
   RETURN jsonb_build_object('success',false,'error','invalid_offer');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('vip-gift:'||p_sender::text||':'||p_request,0));
 SELECT * INTO g FROM public.vip_gifts WHERE sender_id=p_sender AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
   IF (g.recipient_id,g.plan,g.method,g.amount) IS DISTINCT FROM (p_recipient,p_plan,p_method,p_amount) THEN
     RETURN jsonb_build_object('success',false,'error','request_conflict');
   END IF;
   RETURN jsonb_build_object('success',true,'duplicate',true,'gift',to_jsonb(g));
 END IF;
 IF p_amount IS DISTINCT FROM (CASE p_plan WHEN 'monthly' THEN 2000 WHEN 'yearly' THEN 20000 ELSE 50000 END) THEN
   RETURN jsonb_build_object('success',false,'error','invalid_offer');
 END IF;
 -- A concurrent unfriend must wait until the gift send transaction finishes.
 PERFORM 1 FROM public.friendships WHERE status='accepted' AND
   ((user_id=p_sender AND friend_id=p_recipient) OR (friend_id=p_sender AND user_id=p_recipient))
   FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','friends_required'); END IF;
 -- Consistent ordering also serializes reciprocal gifts and wallet spending.
 PERFORM 1 FROM public.profiles WHERE id IN(p_sender,p_recipient) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_sender) OR
    NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient) THEN
   RETURN jsonb_build_object('success',false,'error','profile_not_found');
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_recipient AND vip_tier='lifetime') THEN
   RETURN jsonb_build_object('success',false,'error','recipient_already_lifetime');
 END IF;
 IF p_method='diamonds' THEN
   w:=public.add_diamonds_to_balance(p_sender,-p_amount,'vip_membership',
      'VIP Gift: '||initcap(p_plan),'vip-gift:'||p_sender::text||':'||p_request,p_recipient);
   IF NOT COALESCE((w->>'success')::boolean,false) THEN
     RETURN jsonb_build_object('success',false,'error',COALESCE(w->>'error','wallet_refused'));
   END IF;
 END IF;
 INSERT INTO public.vip_gifts(sender_id,recipient_id,request_id,plan,method,amount,status,delivered_at)
 VALUES(p_sender,p_recipient,p_request,p_plan,p_method,p_amount,
   CASE WHEN p_method='diamonds' THEN 'available' ELSE 'pending' END,
   CASE WHEN p_method='diamonds' THEN now() END) RETURNING * INTO g;
 IF p_method='diamonds' THEN
   INSERT INTO public.notifications(user_id,actor_id,type,title,message,link,action_url,data)
   VALUES(p_recipient,p_sender,'vip_gift','You Received A VIP Gift',
     'A Friend Sent You '||initcap(p_plan)||' VIP. Open Your Gift Card To Redeem It.',
     '/hub/vip-membership#gifts','/hub/vip-membership#gifts',jsonb_build_object('gift_id',g.id));
 END IF;
 RETURN jsonb_build_object('success',true,'gift',to_jsonb(g),'newBalance',w->'new_balance');
END $function$;

CREATE OR REPLACE FUNCTION public.settle_vip_lifetime_card_purchase_atomic(p_purchase_id uuid, p_session_id text, p_payment_intent_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  IF v_purchase.price_usd NOT IN (499.00, 500.00) OR v_purchase.price_usd IS NULL THEN
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

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.diamond_packages WHERE price_usd<>ceil(price_usd)) OR
    EXISTS(SELECT 1 FROM public.merchandise_items WHERE price_usd<>ceil(price_usd) OR price_diamonds%100<>0) OR
    EXISTS(SELECT 1 FROM public.merchandise_item_variants WHERE price_usd<>ceil(price_usd) OR price_diamonds%100<>0) THEN
   RAISE EXCEPTION 'Fractional marketplace sale prices remain';
 END IF;
END $$;
COMMIT;
-- ROLLBACK: roll back application sale creation first; retain paid records and
-- the broadened compatibility checks so $500 receipts remain refundable.
-- Disable catalog normalization only if reverting the whole-dollar policy:
-- BEGIN;
-- DROP TRIGGER marketplace_whole_dollar_price ON public.diamond_packages;
-- DROP TRIGGER marketplace_whole_dollar_price ON public.merchandise_items;
-- DROP TRIGGER marketplace_whole_dollar_price ON public.merchandise_item_variants;
-- DROP FUNCTION public.marketplace_whole_dollar_catalog_price();
-- COMMIT;
