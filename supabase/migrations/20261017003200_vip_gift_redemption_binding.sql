-- TIER: 3. Explicit VIP redemption variable binding on the production schema.
-- WHY: profiles also has a legacy tier column. PostgreSQL refuses the unqualified
-- tier variable in UPDATE; native fixtures now include that exact collision.
-- Qualification: fail on original function, install this exact replacement,
-- redeem once, replay, and exercise reversal/concurrency/ACL on PostgreSQL 17.
-- Installed predecessor is immutable; no gift history or wallet data is rewritten.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.redeem_vip_gift_atomic(uuid,uuid)') IS NULL THEN
   RAISE EXCEPTION 'VIP gift redemption predecessor is required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.redeem_vip_gift_atomic(p_user uuid,p_gift uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE g public.vip_gifts%ROWTYPE; p public.profiles%ROWTYPE; v_expiry timestamptz; v_tier text;
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
 v_tier:=CASE WHEN g.plan='monthly' AND p.vip_tier='yearly' AND p.vip_expires_at>now() THEN 'yearly' ELSE g.plan END;
 v_expiry:=CASE WHEN g.plan='lifetime' THEN NULL ELSE greatest(now(),COALESCE(p.vip_expires_at,now()))+
   make_interval(days=>CASE WHEN g.plan='monthly' THEN 30 ELSE 365 END) END;
 UPDATE public.vip_gifts SET status='redeemed',redeemed_at=now(),
   previous_entitlement=jsonb_build_object('is_vip',p.is_vip,'tier',p.vip_tier,'expires_at',p.vip_expires_at),
   granted_entitlement=jsonb_build_object('tier',v_tier,'expires_at',v_expiry) WHERE id=g.id;
 UPDATE public.profiles SET is_vip=true,vip_tier=v_tier,vip_expires_at=v_expiry,vip_gift_id=g.id,updated_at=now() WHERE id=p_user;
 RETURN jsonb_build_object('success',true,'tier',v_tier,'expiresAt',v_expiry);
END $$;

DO $$ BEGIN
 IF position('vip_tier=v_tier' IN pg_get_functiondef('public.redeem_vip_gift_atomic(uuid,uuid)'::regprocedure))=0 OR
    has_function_privilege('authenticated','public.redeem_vip_gift_atomic(uuid,uuid)','execute') THEN
   RAISE EXCEPTION 'VIP gift redemption binding or service-only ACL assertion failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK: disable redemption after rolling back the gift UI/API. Preserve history.
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.redeem_vip_gift_atomic(uuid,uuid) FROM service_role;
-- COMMIT;
