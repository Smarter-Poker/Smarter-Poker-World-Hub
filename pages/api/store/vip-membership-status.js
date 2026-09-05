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
import { reportApiError } from '../../../src/lib/sentryWrap';

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
        .select('is_vip, vip_tier, vip_expires_at')
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

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      success: true,
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
