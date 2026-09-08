/**
 * SERVER-SIDE PREMIUM FEATURE GATE
 *
 * The decision `premiumFeatureGate.checkFeatureAccess` makes, made where an API
 * route can actually make it.
 *
 * WHY THIS EXISTS
 * ---------------
 * `checkFeatureAccess` is a browser gate. It reads localStorage, it queries
 * through the anon-key client, and when that query is refused it recovers by
 * calling `fetch('/api/vip/check-status')` with a relative URL.
 *
 * None of that works inside an API route. There is no localStorage, the anon
 * client has no session so `profiles` RLS refuses the read, and a relative
 * fetch has no origin to resolve against in Node. Every path fails, the gate
 * returns `hasAccess: false`, and the route answers 403.
 *
 * Measured, not theorised: the account that hit this is `is_vip = true` with
 * 494,455 diamonds and was still refused by /api/bankroll/scan-receipt.
 *
 * This module asks the same questions in the same order, using the service
 * role client the routes already hold:
 *
 *   1. VIP, honouring vip_expires_at where the column exists
 *   2. an unexpired `daily_unlock_all` pass
 *   3. an unexpired pass for this specific feature
 *
 * It fails CLOSED. A database error denies access rather than granting it,
 * because these routes sit in front of paid features and an outage must not
 * become a free-for-all.
 */

/** Postgres codes and messages that mean "that column is not there yet". */
function isMissingColumn(error) {
    if (!error) return false;
    if (error.code === '42703') return true;
    return /column .* does not exist/i.test(String(error.message || ''));
}

/**
 * @param {object} supabase service-role client
 * @param {string} userId
 * @param {string} featureKey e.g. 'bankroll_pro'
 * @returns {Promise<{hasAccess:boolean,isVip:boolean,reason:string,expiresAt:string|null}>}
 */
export async function checkServerFeatureAccess(supabase, userId, featureKey) {
    const deny = (reason) => ({ hasAccess: false, isVip: false, reason, expiresAt: null });

    if (!supabase || !userId || !featureKey) return deny('missing-arguments');

    // ---- 1. VIP -----------------------------------------------------------
    let profile = null;
    let { data, error } = await supabase
        .from('profiles')
        .select('is_vip, diamonds, vip_expires_at')
        .eq('id', userId)
        .maybeSingle();

    if (error && isMissingColumn(error)) {
        // The v2 expiry column is not deployed here. Read what exists rather
        // than telling every subscriber their membership lapsed.
        ({ data, error } = await supabase
            .from('profiles')
            .select('is_vip, diamonds')
            .eq('id', userId)
            .maybeSingle());
    }

    if (error) {
        console.warn('[serverFeatureGate] profile read failed:', error.message);
        return deny('profile-unavailable');
    }
    profile = data;
    if (!profile) return deny('no-profile');

    if (profile.is_vip === true) {
        const expiry = profile.vip_expires_at ? new Date(profile.vip_expires_at) : null;
        const lapsed = expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now();
        if (!lapsed) {
            return {
                hasAccess: true,
                isVip: true,
                reason: 'vip',
                expiresAt: profile.vip_expires_at || null,
            };
        }
    }

    // ---- 2 and 3. day passes ---------------------------------------------
    const now = new Date().toISOString();
    for (const key of ['daily_unlock_all', featureKey]) {
        const { data: pass, error: passError } = await supabase
            .from('premium_feature_access')
            .select('expires_at')
            .eq('user_id', userId)
            .eq('feature_key', key)
            .gt('expires_at', now)
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (passError) {
            console.warn('[serverFeatureGate] pass read failed:', passError.message);
            return deny('pass-unavailable');
        }
        if (pass) {
            return {
                hasAccess: true,
                isVip: false,
                reason: key === 'daily_unlock_all' ? 'daily-pass' : 'feature-pass',
                expiresAt: pass.expires_at,
            };
        }
    }

    return deny('not-entitled');
}
