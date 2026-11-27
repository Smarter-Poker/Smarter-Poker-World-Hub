/**
 * Private VIP membership read model.
 * GET /api/store/vip-membership-status
 *
 * The browser receives only the authenticated member's entitlement and the
 * minimum subscription fields needed to render safe controls. Stripe IDs and
 * customer IDs never leave the server.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { vipIntroOfferPublicTerms } from '../../../src/lib/store/vipIntroOffer.mjs';
import { resolveVipIntroOffer } from '../../../src/lib/store/vipIntroEligibility';
import { VIP_COMEBACK_OFFER } from '../../../src/lib/store/vipComebackOffer.mjs';
import { resolveVipComebackOffer } from '../../../src/lib/store/vipComebackEligibility';
import { resolvePhoneWelcomeOffer } from '../../../src/lib/store/phoneWelcomeOffer';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('VIP membership database is not configured');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function entitlementIsActive(profile, now = new Date()) {
  if (profile?.is_vip !== true) return false;
  if (profile?.vip_tier === 'lifetime') return true;
  if (!profile?.vip_expires_at) return false;
  const expiresAt = new Date(profile.vip_expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // Reject anonymous reads before constructing the database client. Besides
    // keeping the private boundary explicit, this guarantees a stable 401
    // even when a local or recovery environment is missing Supabase secrets.
    // An absent session must never be misreported as a server failure.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user?.id) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const [profileResult, subscriptionResult] = await Promise.all([
      getSupabase()
        .from('profiles')
        .select('is_vip, vip_tier, vip_expires_at, phone_verified, created_at')
        .eq('id', user.id)
        .maybeSingle(),
      getSupabase()
        .from('vip_subscriptions')
        .select('tier, status, current_period_end, cancel_at_period_end, stripe_subscription_id, created_at')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      console.warn('[vip-membership-status] profile read failed:', profileResult.error.message);
      return res.status(500).json({ success: false, error: 'Could not read your VIP entitlement' });
    }

    const profile = profileResult.data || null;
    const subscription = subscriptionResult.error ? null : subscriptionResult.data;
    const subscriptionRef = String(subscription?.stripe_subscription_id || '');
    const isCardSubscription = subscriptionRef.startsWith('sub_');
    const isDiamondPass = subscriptionRef.startsWith('diamond_') || (
      entitlementIsActive(profile) && !isCardSubscription && profile?.vip_tier !== 'lifetime'
    );
    const isLifetime = profile?.vip_tier === 'lifetime';
    const tier = isLifetime ? 'lifetime' : subscription?.tier || profile?.vip_tier || null;
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);

    /* The $1 first month, for THIS account, from the same decision Checkout
       charges from (resolveVipIntroOffer: off switch, first Card subscription,
       verified contact). `eligible` is null when it could not be read: a
       display must then show the regular price. `reason` says why the offer
       is not on the table so a display can explain it:
         offer_off | already_subscribed | verify_contact | lifetime
         (unknown:) eligibility_unknown | contact_unknown | switch_unknown
       `checkoutOpensAt` is set while a prepaid or complimentary VIP term is
       running without a Card subscription: Card checkout refuses to sell
       overlapping time (VIP_ENTITLEMENT_ACTIVE) until that moment. */
    const introDecision = isLifetime
      ? { eligible: false, reason: 'lifetime' }
      : await resolveVipIntroOffer(getSupabase(), user);
    /* The comeback price for a lapsed Card member, from the same decision
       Checkout charges from (resolveVipComebackOffer). Never alongside the $1
       month: it is only decided once that offer is ruled out, exactly as
       Checkout decides it. `eligible` null is unknown (show the regular
       price). Additive field; no existing display reads it. */
    const comebackDecision = isLifetime
      ? { eligible: false, reason: 'lifetime' }
      : introDecision.eligible === true
        ? { eligible: false, reason: 'first_month_offer' }
        : introDecision.eligible === null
          ? { eligible: null, reason: 'eligibility_unknown' }
          : await resolveVipComebackOffer(getSupabase(), user);
    const checkoutOpensAt =
      !isLifetime && !isCardSubscription && entitlementIsActive(profile)
        ? profile.vip_expires_at
        : null;

    /* The phone verification welcome offer (free VIP month + welcome
       diamonds), shown BEFORE any VIP or Diamond prompt to an account that
       has not claimed it (Dan, 2026-11-27). Mirrors what verify-otp pays.
       Fails closed: unknown is `eligible: false`, so the existing prompt
       shows and nothing stands in front of a purchase. Additive field. */
    let phoneOffer;
    try {
      phoneOffer = await resolvePhoneWelcomeOffer(getSupabase(), user, profile);
    } catch (_phoneOfferError) {
      phoneOffer = { eligible: false, reason: 'unknown' };
    }

    return res.status(200).json({
      success: true,
      phoneOffer,
      introOffer: {
        ...vipIntroOfferPublicTerms(),
        eligible: introDecision.eligible,
        reason: introDecision.reason,
        checkoutOpensAt,
      },
      comebackOffer: {
        eligible: comebackDecision.eligible,
        firstPeriodCents: VIP_COMEBACK_OFFER.firstPeriodCents,
        regularCents: VIP_COMEBACK_OFFER.regularCents,
        reason: comebackDecision.reason,
      },
      membership: {
        isVip: entitlementIsActive(profile),
        tier,
        expiresAt: profile?.vip_expires_at || subscription?.current_period_end || null,
        source: isLifetime ? 'lifetime' : isCardSubscription ? 'card' : isDiamondPass ? 'diamonds' : 'none',
        subscriptionStatus: subscription?.status || null,
        currentPeriodEnd: subscription?.current_period_end || profile?.vip_expires_at || null,
        cancelAtPeriodEnd,
        recurring: !isLifetime && isCardSubscription,
        canSwitch: !isLifetime && isCardSubscription && !cancelAtPeriodEnd && ['monthly', 'yearly'].includes(tier),
        canCancel: !isLifetime && isCardSubscription && !cancelAtPeriodEnd,
        partial: Boolean(subscriptionResult.error),
      },
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* telemetry must not shadow response */ }
    console.warn('[vip-membership-status] failed:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Could not read your membership record' });
    }
  }
}
