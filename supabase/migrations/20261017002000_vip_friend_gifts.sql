-- TIER: 3. Paid, friend-only VIP gift cards. Additive, service-only RPCs.
-- WHY: VIP terms can only be purchased for oneself. Gifts must bind the
-- recipient before payment, debit once, deliver only after payment and redeem
-- once without enrolling friends in recurring billing. Refunds preserve later
-- independent entitlements via provenance, matching existing Lifetime policy.
-- ROLLBACK: Roll back gift UI/API first; retain paid records. To disable writes:
-- Revoke the exact service grants in the executable rollback below.
-- Never drop paid gift history or undo committed wallet transactions.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.friendships') IS NULL OR
    to_regprocedure('public.add_diamonds_to_balance(uuid,integer,text,text,text,uuid)') IS NULL THEN
   RAISE EXCEPTION 'VIP gifts require friendships and the canonical Diamond wallet';
 END IF;
END $$;

CREATE TABLE public.vip_gifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id uuid NOT NULL REFERENCES public.profiles(id),
 recipient_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id text NOT NULL CHECK (request_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
 plan text NOT NULL CHECK (plan IN ('monthly','yearly','lifetime')),
 method text NOT NULL CHECK (method IN ('card','diamonds')),
 amount integer NOT NULL CHECK (amount > 0),
 status text NOT NULL CHECK (status IN ('pending','available','redeemed','refunded','disputed','return_pending','expired')),
 session_id text UNIQUE, session_url text, payment_intent_id text UNIQUE,
 refunded_amount integer NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
 dispute_id text, dispute_status text,
 previous_entitlement jsonb, granted_entitlement jsonb,
 redeemed_at timestamptz, delivered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sender_id,request_id), CHECK (sender_id <> recipient_id),
 CHECK (amount = CASE plan WHEN 'monthly' THEN 1999 WHEN 'yearly' THEN 19999 ELSE 49900 END),
 CHECK (refunded_amount <= amount)
);
CREATE INDEX vip_gifts_recipient_created_idx ON public.vip_gifts(recipient_id,created_at DESC);
CREATE INDEX vip_gifts_sender_created_idx ON public.vip_gifts(sender_id,created_at DESC);
ALTER TABLE public.vip_gifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vip_gifts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.vip_gifts TO service_role;
ALTER TABLE public.profiles ADD COLUMN vip_gift_id uuid REFERENCES public.vip_gifts(id);
CREATE INDEX profiles_vip_gift_idx ON public.profiles(vip_gift_id) WHERE vip_gift_id IS NOT NULL;

-- Register wallet-writing RPCs before CREATE FUNCTION under the shared guard.
INSERT INTO public.ca_money_rpc_registry(proname,status,notes) VALUES
 ('send_vip_gift_atomic','approved','Friend-only one-time gift; canonical wallet debit, durable replay'),
 ('return_vip_gift_atomic','approved','Unredeemed gift return; canonical wallet refund once')
 ON CONFLICT(proname) DO NOTHING;

CREATE FUNCTION public.clear_stale_vip_gift_provenance() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$ BEGIN
 IF ((TG_OP='INSERT' AND NEW.vip_gift_id IS NOT NULL) OR
     (TG_OP='UPDATE' AND NEW.vip_gift_id IS DISTINCT FROM OLD.vip_gift_id)) AND
    current_user NOT IN ('postgres','service_role','supabase_admin') THEN
   RAISE EXCEPTION 'VIP gift provenance is service-managed' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF (NEW.is_vip,NEW.vip_tier,NEW.vip_expires_at) IS DISTINCT FROM
    (OLD.is_vip,OLD.vip_tier,OLD.vip_expires_at)
    AND NEW.vip_gift_id IS NOT DISTINCT FROM OLD.vip_gift_id THEN
   NEW.vip_gift_id := NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clear_stale_vip_gift_provenance
 BEFORE INSERT OR UPDATE OF is_vip,vip_tier,vip_expires_at,vip_gift_id ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.clear_stale_vip_gift_provenance();

CREATE FUNCTION public.send_vip_gift_atomic(
 p_sender uuid,p_recipient uuid,p_request text,p_plan text,p_method text,p_amount integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE; w jsonb;
BEGIN
 IF p_sender IS NULL OR p_recipient IS NULL OR p_sender=p_recipient OR
    p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{8,128}$' OR
    p_plan IS NULL OR p_plan NOT IN ('monthly','yearly','lifetime') OR
    p_method IS NULL OR p_method NOT IN ('card','diamonds') OR
    p_amount IS DISTINCT FROM (CASE p_plan WHEN 'monthly' THEN 1999 WHEN 'yearly' THEN 19999 ELSE 49900 END) THEN
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
END $$;

CREATE FUNCTION public.settle_vip_gift_atomic(p_gift uuid,p_session text,p_intent text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.vip_gifts WHERE id=p_gift FOR UPDATE;
 IF NOT FOUND OR g.method<>'card' OR g.amount IS DISTINCT FROM p_amount OR
    COALESCE(p_session,'')='' OR COALESCE(p_intent,'')='' OR
    (g.session_id IS NOT NULL AND g.session_id<>p_session) OR
    (g.payment_intent_id IS NOT NULL AND g.payment_intent_id<>p_intent) THEN
   RETURN jsonb_build_object('success',false,'error','settlement_conflict');
 END IF;
 -- Bind even reversed-before-payment records, without resurrecting them.
 UPDATE public.vip_gifts SET session_id=p_session,payment_intent_id=p_intent WHERE id=g.id;
 IF g.status<>'pending' THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 UPDATE public.vip_gifts SET status='available',delivered_at=now() WHERE id=g.id;
 INSERT INTO public.notifications(user_id,actor_id,type,title,message,link,action_url,data)
 VALUES(g.recipient_id,g.sender_id,'vip_gift','You Received A VIP Gift',
   'A Friend Sent You '||initcap(g.plan)||' VIP. Open Your Gift Card To Redeem It.',
   '/hub/vip-membership#gifts','/hub/vip-membership#gifts',jsonb_build_object('gift_id',g.id));
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.redeem_vip_gift_atomic(p_user uuid,p_gift uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE; p public.profiles%ROWTYPE; e timestamptz; tier text;
BEGIN
 SELECT * INTO g FROM public.vip_gifts WHERE id=p_gift FOR UPDATE;
 IF NOT FOUND OR g.recipient_id IS DISTINCT FROM p_user THEN
   RETURN jsonb_build_object('success',false,'error','gift_not_found'); END IF;
 IF g.status='redeemed' THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 IF g.status<>'available' THEN RETURN jsonb_build_object('success',false,'error','gift_not_available'); END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','profile_not_found'); END IF;
 IF p.vip_tier='lifetime' THEN RETURN jsonb_build_object('success',false,'error','already_lifetime'); END IF;
 IF EXISTS(SELECT 1 FROM public.vip_subscription_checkout_claims WHERE user_id=p_user AND
   (state='admitting' OR expires_at>now())) OR
 EXISTS(SELECT 1 FROM public.vip_subscriptions WHERE user_id=p_user AND
   status IN('active','trialing','past_due','unpaid','incomplete','paused') AND
   stripe_subscription_id IS NOT NULL AND left(stripe_subscription_id,8)<>'diamond_') THEN
   RETURN jsonb_build_object('success',false,'error','manage_card_subscription_first');
 END IF;
 tier:=CASE WHEN g.plan='monthly' AND p.vip_tier='yearly' AND p.vip_expires_at>now() THEN 'yearly' ELSE g.plan END;
 e:=CASE WHEN g.plan='lifetime' THEN NULL ELSE greatest(now(),COALESCE(p.vip_expires_at,now()))+
   make_interval(days=>CASE WHEN g.plan='monthly' THEN 30 ELSE 365 END) END;
 UPDATE public.vip_gifts SET status='redeemed',redeemed_at=now(),
   previous_entitlement=jsonb_build_object('is_vip',p.is_vip,'tier',p.vip_tier,'expires_at',p.vip_expires_at),
   granted_entitlement=jsonb_build_object('tier',tier,'expires_at',e) WHERE id=g.id;
 UPDATE public.profiles SET is_vip=true,vip_tier=tier,vip_expires_at=e,vip_gift_id=g.id,updated_at=now() WHERE id=p_user;
 RETURN jsonb_build_object('success',true,'tier',tier,'expiresAt',e);
END $$;

CREATE FUNCTION public.return_vip_gift_atomic(p_user uuid,p_gift uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE; w jsonb;
BEGIN
 SELECT * INTO g FROM public.vip_gifts WHERE id=p_gift FOR UPDATE;
 IF NOT FOUND OR p_user IS NULL OR p_user NOT IN(g.sender_id,g.recipient_id) THEN
   RETURN jsonb_build_object('success',false,'error','gift_not_found'); END IF;
 IF g.method<>'diamonds' THEN RETURN jsonb_build_object('success',false,'error','wrong_method'); END IF;
 IF g.status='refunded' THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 IF g.status<>'available' THEN RETURN jsonb_build_object('success',false,'error','gift_not_returnable'); END IF;
 w:=public.add_diamonds_to_balance(g.sender_id,g.amount,'refund','Returned VIP Gift',
   'vip-gift-return:'||g.id::text,g.recipient_id);
 IF NOT COALESCE((w->>'success')::boolean,false) THEN
   RETURN jsonb_build_object('success',false,'error',COALESCE(w->>'error','wallet_refused')); END IF;
 UPDATE public.vip_gifts SET status='refunded',refunded_amount=amount WHERE id=g.id;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE FUNCTION public.prepare_vip_gift_card_return(p_user uuid,p_gift uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.vip_gifts WHERE id=p_gift FOR UPDATE;
 IF NOT FOUND OR p_user IS NULL OR p_user NOT IN(g.sender_id,g.recipient_id) OR g.method<>'card' THEN
   RETURN jsonb_build_object('success',false,'error','gift_not_found'); END IF;
 IF g.status='refunded' THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 IF g.status NOT IN('available','return_pending') OR g.payment_intent_id IS NULL THEN
   RETURN jsonb_build_object('success',false,'error','gift_not_returnable'); END IF;
 UPDATE public.vip_gifts SET status='return_pending' WHERE id=g.id;
 RETURN jsonb_build_object('success',true,'paymentIntent',g.payment_intent_id);
END $$;

CREATE FUNCTION public.reverse_vip_gift_atomic(p_gift uuid,p_refunded integer,p_dispute text DEFAULT NULL,p_dispute_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE; blocked boolean;
BEGIN
 SELECT * INTO g FROM public.vip_gifts WHERE id=p_gift FOR UPDATE;
 IF NOT FOUND OR g.method<>'card' OR p_refunded IS NULL OR p_refunded<0 OR p_refunded>g.amount OR
    (p_dispute IS NOT NULL AND p_dispute NOT IN('open','won','lost')) THEN
   RETURN jsonb_build_object('success',false,'error','invalid_reversal'); END IF;
 -- Refunds are monotonic. A late created event cannot reopen a closed dispute.
 UPDATE public.vip_gifts SET refunded_amount=greatest(refunded_amount,p_refunded),
   dispute_id=COALESCE(p_dispute_id,dispute_id),
   dispute_status=CASE WHEN dispute_status IN('won','lost') AND p_dispute='open' THEN dispute_status
                       ELSE COALESCE(p_dispute,dispute_status) END WHERE id=g.id RETURNING * INTO g;
 blocked:=g.refunded_amount>=g.amount OR g.dispute_status IN('open','lost');
 IF blocked THEN
   -- Same profile lock as redemption and self checkout. Never revoke a later independent grant.
   PERFORM 1 FROM public.profiles WHERE id=g.recipient_id FOR UPDATE;
   UPDATE public.profiles SET is_vip=COALESCE((g.previous_entitlement->>'is_vip')::boolean,false),
     vip_tier=g.previous_entitlement->>'tier',
     vip_expires_at=(g.previous_entitlement->>'expires_at')::timestamptz,
     vip_gift_id=NULL,updated_at=now()
   WHERE id=g.recipient_id AND vip_gift_id=g.id;
   UPDATE public.vip_gifts SET status=CASE WHEN refunded_amount>=amount THEN 'refunded' ELSE 'disputed' END WHERE id=g.id;
 ELSIF g.status='disputed' THEN
   -- A won dispute makes the card redeemable again. A previous redeemed term
   -- is restored only if no subsequent writer changed its exact snapshot.
   IF g.redeemed_at IS NULL THEN
     UPDATE public.vip_gifts SET status='available' WHERE id=g.id;
   ELSE
     PERFORM 1 FROM public.profiles WHERE id=g.recipient_id FOR UPDATE;
     UPDATE public.profiles SET is_vip=true,vip_tier=g.granted_entitlement->>'tier',
       vip_expires_at=(g.granted_entitlement->>'expires_at')::timestamptz,vip_gift_id=g.id,updated_at=now()
     WHERE id=g.recipient_id AND vip_gift_id IS NULL AND
       (is_vip,vip_tier,vip_expires_at) IS NOT DISTINCT FROM
       ((g.previous_entitlement->>'is_vip')::boolean,g.previous_entitlement->>'tier',
        (g.previous_entitlement->>'expires_at')::timestamptz);
     UPDATE public.vip_gifts SET status='redeemed' WHERE id=g.id;
   END IF;
 END IF;
 RETURN jsonb_build_object('success',true);
END $$;

REVOKE ALL ON FUNCTION public.send_vip_gift_atomic(uuid,uuid,text,text,text,integer),
 public.settle_vip_gift_atomic(uuid,text,text,integer),public.redeem_vip_gift_atomic(uuid,uuid),
 public.return_vip_gift_atomic(uuid,uuid),public.prepare_vip_gift_card_return(uuid,uuid),public.reverse_vip_gift_atomic(uuid,integer,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_vip_gift_atomic(uuid,uuid,text,text,text,integer),
 public.settle_vip_gift_atomic(uuid,text,text,integer),public.redeem_vip_gift_atomic(uuid,uuid),
 public.return_vip_gift_atomic(uuid,uuid),public.prepare_vip_gift_card_return(uuid,uuid),public.reverse_vip_gift_atomic(uuid,integer,text,text) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.send_vip_gift_atomic(uuid,uuid,text,text,text,integer)','execute') OR
    NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.vip_gifts'::regclass) THEN
   RAISE EXCEPTION 'VIP gift service-only security assertion failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK (new migration, application must stop calling these first):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.send_vip_gift_atomic(uuid,uuid,text,text,text,integer),
-- public.settle_vip_gift_atomic(uuid,text,text,integer),public.redeem_vip_gift_atomic(uuid,uuid),
-- public.return_vip_gift_atomic(uuid,uuid),public.prepare_vip_gift_card_return(uuid,uuid),public.reverse_vip_gift_atomic(uuid,integer,text,text) FROM service_role;
-- COMMIT;
-- Retain tables, provenance and financial history for reconciliation.
