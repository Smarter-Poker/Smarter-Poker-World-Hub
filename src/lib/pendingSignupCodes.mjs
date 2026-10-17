/**
 * PROMO AND REFERRAL CODES ENTERED AT SIGN-UP (2026-10-17).
 *
 * signup.js parks a validated promo or referral code in localStorage until the
 * account is verified. Only /auth/callback ever redeemed it, and a player
 * reaches /auth/callback only by tapping the LINK in the confirmation email.
 * A player who types the six-digit CODE never goes there: their code was kept
 * forever in a browser that would never read it again. Both 2026-10-17
 * referred signups (TomTomTamale, Dinodollars) verified with the code.
 *
 * Both verification doors now call this one function. Each code is removed
 * once its endpoint has given a final answer (redeemed, or refused for a
 * reason a retry cannot change); a network failure or a 5xx keeps it for the
 * next door that runs. Both endpoints are idempotent server-side, so a second
 * door replaying the same code cannot pay twice. `keepalive` lets the request
 * finish even though the code path navigates to Club Arena straight after.
 */
export const PENDING_PROMO_KEY = 'smarter-poker-pending-promo';
export const PENDING_REFERRAL_KEY = 'smarter-poker-pending-referral';

/** A 2xx, or a 4xx a retry cannot change (already used, invalid, ineligible). */
const isFinal = (status) => (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429);

async function post(fetchImpl, url, accessToken, body) {
    const res = await fetchImpl(url, {
        method: 'POST',
        keepalive: true,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });
    return res.status;
}

/**
 * Redeem whatever sign-up left pending. Never throws. Resolves when both
 * requests have answered or `timeoutMs` has passed, whichever is first, so a
 * slow endpoint cannot hold the player on the verify screen.
 */
export async function redeemPendingSignupCodes({
    accessToken,
    userId,
    storage = typeof window !== 'undefined' ? window.localStorage : null,
    fetchImpl = typeof fetch === 'function' ? fetch : null,
    timeoutMs = 2500,
} = {}) {
    if (!accessToken || !userId || !storage || !fetchImpl) return { promo: 'skipped', referral: 'skipped' };
    const outcome = { promo: 'none', referral: 'none' };
    const jobs = [];

    let promo = null;
    try { promo = storage.getItem(PENDING_PROMO_KEY); } catch { /* storage refused */ }
    if (promo) {
        outcome.promo = 'pending';
        jobs.push(
            post(fetchImpl, '/api/promo/redeem-promo-code', accessToken, { code: promo, userId })
                .then((status) => {
                    outcome.promo = String(status);
                    if (isFinal(status)) storage.removeItem(PENDING_PROMO_KEY);
                })
                .catch(() => { outcome.promo = 'network'; })
        );
    }

    let referralRaw = null;
    try { referralRaw = storage.getItem(PENDING_REFERRAL_KEY); } catch { /* storage refused */ }
    if (referralRaw) {
        let referrerId = null;
        try { referrerId = JSON.parse(referralRaw)?.referrerId || null; } catch { /* unreadable */ }
        if (!referrerId) {
            storage.removeItem(PENDING_REFERRAL_KEY);
            outcome.referral = 'unreadable';
        } else {
            outcome.referral = 'pending';
            jobs.push(
                post(fetchImpl, '/api/rewards/referral', accessToken, { referrerId, refereeId: userId })
                    .then((status) => {
                        outcome.referral = String(status);
                        if (isFinal(status)) storage.removeItem(PENDING_REFERRAL_KEY);
                    })
                    .catch(() => { outcome.referral = 'network'; })
            );
        }
    }

    if (jobs.length) {
        let timer;
        await Promise.race([
            Promise.all(jobs),
            new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
        ]);
        clearTimeout(timer);
    }
    return outcome;
}

/**
 * The referrer's player number carried inside a ?redirect= path, as a Club
 * Arena invite link sends it (/hub/club-arena/invite/<club>?ref=1). Digits
 * only; anything else is not a referral.
 */
export function refFromRedirect(redirect) {
    const raw = Array.isArray(redirect) ? redirect[0] : redirect;
    if (typeof raw !== 'string' || !raw) return null;
    try {
        const ref = new URL(raw, 'https://smarter.poker').searchParams.get('ref');
        return ref && /^[0-9]{1,9}$/.test(ref) && Number(ref) > 0 ? String(Number(ref)) : null;
    } catch {
        return null;
    }
}

/** Seconds a player waits between "Resend Code" taps (Supabase rate-limits resends). */
export const RESEND_COOLDOWN_SECONDS = 60;
