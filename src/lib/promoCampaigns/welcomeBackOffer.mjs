/**
 * 3-WEEK INACTIVE PLAYER WELCOME-BACK OFFER ("ACCEPT OFFER" FLOW)
 *
 * Owner direction (Dan, 2026-11-23):
 *   "OK, NOW PUT TOGETHER A SIMILAR CAMPAIGN FOR ANYONE THAT HASN'T SIGNED IN
 *    OR PLAYED IN THE PAST 3 WEEKS. 25 FREE CHIPS, 500 DIAMONDS AND ONE MONTH
 *    VIP BUT THEY NEED TO LIKE CLICK A LINK OR 'ACCEPT THE OFFER'"
 *
 * How it works end-to-end:
 *   1. Email & SMS blasts target `scope: 'inactive_21d'` (real human accounts
 *      with zero sign-in, Club Arena, browser-binding, or GTO training activity
 *      in the past 21 days, excluding anyone who already accepted this offer).
 *   2. Email CTA links carry a user-bound HMAC-SHA256 `wb` token
 *      (`https://smarter.poker/promo/welcome-back?wb=...`), while SMS links use
 *      the 1-segment shortlink `https://smarter.poker/go/welcome-back` which
 *      mints a signed `wb` token and redirects to `/promo/welcome-back?wb=...`.
 *   3. Players sign in (if needed) and explicitly click "Accept Offer And Claim
 *      Rewards", calling `POST /api/promo/accept-welcome-back`.
 *   4. `acceptWelcomeBackOffer` verifies the HMAC token + 21-day inactivity
 *      eligibility, acquires the one-time unique claim row in
 *      `public.promo_code_redemptions` (`WELCOME_BACK_3WK_202611`), ensures
 *      active KINGS CLUB (`25450`) membership via `fn_join_club_atomic`,
 *      disburses 25 Free Chips via `fn_promo_disburse`, credits 500 Free
 *      Diamonds via `add_diamonds_to_balance`, and activates 30 days of VIP on
 *      `public.profiles` (rolling back the claim lock if any step fails before
 *      completion so transient errors never strand an eligible player).
 */
import crypto from 'crypto';

export const WELCOME_BACK_CODE = 'WELCOME_BACK_3WK_202611';
export const WELCOME_BACK_STORAGE_KEY = 'sp_welcome_back_offer_token';
export const WELCOME_BACK_INACTIVE_DAYS = 21;
export const WELCOME_BACK_CHIPS = 25;
export const WELCOME_BACK_DIAMONDS = 500;
export const WELCOME_BACK_VIP_DAYS = 30;
export const WELCOME_BACK_TTL_DAYS = 30;

export const MIDWAY_UNION_UUID = 'fade0000-0000-0000-0000-000000000001';
export const KINGS_CLUB_UUID = 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4';
export const KINGS_CLUB_CODE = '25450';

const SYNTHETIC_USERNAME_RE = /^(?:deleted-|crest_cert_|postdeploy|reels_qa|trivia_canary|codex-)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]{8,320}\.[A-Za-z0-9_-]{16,128}$/;

export const DEFAULT_WELCOME_BACK_DRAFT = {
    subject: 'We Miss You At The Tables: Accept 25 Free Chips, 500 Free Diamonds & 1-Month Free VIP',
    headline: '25 Free Chips + 500 Free Diamonds + 1-Month Free VIP',
    body: 'It has been a few weeks since we last saw you on Smarter.Poker, and your seat in Kings Club (Club Code 25450) is waiting.\n\nClick below to accept your exclusive Welcome-Back Offer and unlock 25 Free Chips, 500 Free Diamonds, and 1 Month of Free VIP Access.',
    ctaLabel: 'Accept Your Offer',
    ctaUrl: 'https://smarter.poker/promo/welcome-back',
    smsBody: 'Smarter.Poker: Accept your Welcome-Back Offer for 25 Free Chips, 500 Diamonds + 1-Month Free VIP: https://smarter.poker/go/welcome-back Reply STOP to opt out.',
    postalAddress: 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453',
    channels: 'both',
    scope: 'inactive_21d',
};

function offerSecret(explicitSecret) {
    if (typeof explicitSecret === 'string' && explicitSecret.trim()) {
        return explicitSecret.trim();
    }
    return (
        process.env.PROMO_SIGNUP_SECRET ||
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    ).trim();
}

function b64urlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64urlDecode(input) {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

export function deterministicUuid(seed) {
    const hex = crypto.createHash('md5').update(String(seed || '')).digest('hex');
    const v4Nibble = `4${hex.slice(13, 16)}`;
    const variantNibble = `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v4Nibble}-${variantNibble}-${hex.slice(20, 32)}`;
}

export function cleanWelcomeBackTokenShape(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    return TOKEN_SHAPE_RE.test(value) ? value : null;
}

export function signWelcomeBackOfferToken({
    campaign = WELCOME_BACK_CODE,
    userId = '',
    ttlDays = WELCOME_BACK_TTL_DAYS,
    nowMs = Date.now(),
    secret,
} = {}) {
    const signingKey = offerSecret(secret);
    if (!signingKey) return '';
    const safeCampaign = /^[a-z0-9_-]{3,48}$/i.test(String(campaign || ''))
        ? String(campaign)
        : WELCOME_BACK_CODE;
    const cleanUid = UUID_RE.test(String(userId || '').trim()) ? String(userId).trim().toLowerCase() : undefined;
    const expSec = Math.floor(nowMs / 1000) + Math.max(1, Number(ttlDays) || WELCOME_BACK_TTL_DAYS) * 86400;
    const payloadObj = { v: 1, k: 'wb21d', c: safeCampaign, exp: expSec };
    if (cleanUid) payloadObj.uid = cleanUid;
    const payload = b64urlEncode(JSON.stringify(payloadObj));
    const sig = b64urlEncode(crypto.createHmac('sha256', signingKey).update(payload).digest());
    return `${payload}.${sig}`;
}

export function verifyWelcomeBackOfferToken(token, { nowMs = Date.now(), secret } = {}) {
    const raw = typeof token === 'string' ? token.trim() : '';
    if (!raw || raw.length > 640) return { valid: false, reason: 'missing' };

    const signingKey = offerSecret(secret);
    if (!signingKey) return { valid: false, reason: 'unconfigured' };

    const dot = raw.indexOf('.');
    if (dot <= 0 || dot !== raw.lastIndexOf('.')) {
        return { valid: false, reason: 'malformed' };
    }
    const payloadPart = raw.slice(0, dot);
    const sigPart = raw.slice(dot + 1);
    if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) {
        return { valid: false, reason: 'malformed' };
    }

    const expectedSig = b64urlEncode(crypto.createHmac('sha256', signingKey).update(payloadPart).digest());
    const a = Buffer.from(sigPart, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'bad_signature' };
    }

    let parsed;
    try {
        parsed = JSON.parse(b64urlDecode(payloadPart));
    } catch {
        return { valid: false, reason: 'malformed' };
    }

    if (!parsed || parsed.v !== 1 || parsed.k !== 'wb21d' || typeof parsed.c !== 'string' || typeof parsed.exp !== 'number') {
        return { valid: false, reason: 'malformed' };
    }
    if (parsed.exp <= Math.floor(nowMs / 1000)) {
        return { valid: false, reason: 'expired' };
    }
    return {
        valid: true,
        campaign: parsed.c,
        userId: typeof parsed.uid === 'string' && UUID_RE.test(parsed.uid) ? parsed.uid.toLowerCase() : null,
        exp: parsed.exp,
    };
}

export function isWelcomeBackCtaUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || '').trim());
        return parsed.pathname === '/promo/welcome-back' || parsed.pathname === '/go/welcome-back';
    } catch {
        return false;
    }
}

export function buildWelcomeBackOfferUrl(
    baseUrl = DEFAULT_WELCOME_BACK_DRAFT.ctaUrl,
    { userId = '', campaign = WELCOME_BACK_CODE, ttlDays = WELCOME_BACK_TTL_DAYS, nowMs = Date.now(), secret, siteUrl = 'https://smarter.poker' } = {}
) {
    const cleanSite = String(siteUrl || 'https://smarter.poker').replace(/\/+$/, '');
    let parsed;
    try {
        parsed = new URL(baseUrl || `${cleanSite}/promo/welcome-back`, cleanSite);
    } catch {
        parsed = new URL(`${cleanSite}/promo/welcome-back`);
    }
    if (parsed.pathname === '/go/welcome-back') {
        parsed.pathname = '/promo/welcome-back';
    }
    const token = signWelcomeBackOfferToken({ campaign, userId, ttlDays, nowMs, secret });
    if (token) {
        parsed.searchParams.set('wb', token);
    }
    return parsed.toString();
}

function maxTimestampMs(...values) {
    let best = 0;
    for (const val of values) {
        if (!val) continue;
        const ms = typeof val === 'number' ? val : Date.parse(String(val));
        if (Number.isFinite(ms) && ms > best) best = ms;
    }
    return best;
}

async function ensureWelcomeBackPromoCode(sb) {
    const { data: existing, error: readErr } = await sb
        .from('promo_codes')
        .select('id, code, is_active, times_used')
        .eq('code', WELCOME_BACK_CODE)
        .maybeSingle();
    if (readErr) throw readErr;
    if (existing?.id) return existing;

    const { data: inserted, error: insertErr } = await sb
        .from('promo_codes')
        .insert({
            code: WELCOME_BACK_CODE,
            description: '3-Week Inactive Player Welcome-Back Offer (25 Free Chips + 500 Free Diamonds + 30-Day Free VIP)',
            reward_type: 'vip_days',
            reward_value: WELCOME_BACK_VIP_DAYS,
            is_active: true,
            max_uses: null,
            times_used: 0,
        })
        .select('id, code, is_active, times_used')
        .maybeSingle();
    if (insertErr) {
        if (insertErr.code === '23505') {
            const { data: raced } = await sb
                .from('promo_codes')
                .select('id, code, is_active, times_used')
                .eq('code', WELCOME_BACK_CODE)
                .maybeSingle();
            if (raced?.id) return raced;
        }
        throw insertErr;
    }
    return inserted;
}

export async function inspectWelcomeBackOfferStatus(
    sb,
    { user, token, nowMs = Date.now(), secret, minInactiveDays = WELCOME_BACK_INACTIVE_DAYS } = {}
) {
    if (!user?.id) {
        return { eligible: false, reason: 'unauthenticated', message: 'Sign In Required To Accept This Offer.' };
    }
    const userId = String(user.id).toLowerCase();
    const verified = verifyWelcomeBackOfferToken(token, { nowMs, secret });
    if (!verified.valid) {
        return {
            eligible: false,
            reason: verified.reason || 'invalid_token',
            message:
                verified.reason === 'expired'
                    ? 'This Welcome-Back Offer Link Has Expired.'
                    : 'Use The Official Welcome-Back Link From Your Smarter.Poker Email Or Text Message.',
        };
    }

    if (verified.userId && verified.userId !== userId) {
        return {
            eligible: false,
            reason: 'wrong_account',
            message: 'This Welcome-Back Offer Link Belongs To A Different Smarter.Poker Account.',
        };
    }

    // Check if already claimed
    const { data: promoCode } = await sb
        .from('promo_codes')
        .select('id')
        .eq('code', WELCOME_BACK_CODE)
        .maybeSingle();

    if (promoCode?.id) {
        const { data: existingRedemption } = await sb
            .from('promo_code_redemptions')
            .select('id, redeemed_at, reward_applied')
            .eq('promo_code_id', promoCode.id)
            .eq('user_id', user.id)
            .maybeSingle();
        if (existingRedemption?.id && existingRedemption.reward_applied) {
            return {
                eligible: true,
                alreadyClaimed: true,
                redeemedAt: existingRedemption.redeemed_at,
                reward: existingRedemption.reward_applied,
            };
        }
    }

    const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('id, username, is_horse, is_vip, vip_tier, vip_expires_at, created_at, last_active')
        .eq('id', user.id)
        .maybeSingle();

    if (profErr || !profile) {
        return { eligible: false, reason: 'profile_missing', message: 'Account Profile Could Not Be Found.' };
    }
    if (
        profile.is_horse === true ||
        user.is_anonymous === true ||
        userId.startsWith('00000000-0000-0000-0000-') ||
        SYNTHETIC_USERNAME_RE.test(String(profile.username || ''))
    ) {
        return { eligible: false, reason: 'ineligible_account', message: 'This Account Is Not Eligible For Promotional Offers.' };
    }

    const cutoffMs = nowMs - Math.max(1, Number(minInactiveDays) || WELCOME_BACK_INACTIVE_DAYS) * 86_400_000;
    const createdMs = maxTimestampMs(profile.created_at, user.created_at);
    if (createdMs > cutoffMs) {
        return {
            eligible: false,
            reason: 'account_too_new',
            message: 'This Welcome-Back Offer Is Reserved For Returning Players Who Joined At Least 3 Weeks Ago.',
        };
    }

    // Check gameplay, Club Arena, and GTO training activity in the past 21 days.
    // Note: signing in on /auth/login updates auth.users.last_sign_in_at, so we
    // evaluate Club Arena / browser-binding / training activity here (and honor
    // cryptographic userId-bound email tokens).
    let latestPlayMs = 0;
    try {
        const { data: memberRows } = await sb
            .from('club_members')
            .select('club_id, status, last_active_at, last_active')
            .eq('user_id', user.id)
            .limit(25);
        for (const m of memberRows || []) {
            latestPlayMs = Math.max(latestPlayMs, maxTimestampMs(m?.last_active_at, m?.last_active));
        }
    } catch {
        /* non-fatal in lightweight test mocks */
    }
    try {
        const { data: bindingRows } = await sb
            .from('ca_browser_bindings')
            .select('last_seen')
            .eq('user_id', user.id)
            .limit(10);
        for (const b of bindingRows || []) {
            latestPlayMs = Math.max(latestPlayMs, maxTimestampMs(b?.last_seen));
        }
    } catch {
        /* optional table */
    }
    try {
        const { data: trainingRows } = await sb
            .from('training_progress')
            .select('last_played_at')
            .eq('user_id', user.id)
            .limit(10);
        for (const t of trainingRows || []) {
            latestPlayMs = Math.max(latestPlayMs, maxTimestampMs(t?.last_played_at));
        }
    } catch {
        /* optional table */
    }

    // If the link came via shared SMS shortlink (no per-user uid in token), also check profiles.last_active.
    if (!verified.userId) {
        latestPlayMs = Math.max(latestPlayMs, maxTimestampMs(profile.last_active));
    }

    if (latestPlayMs >= cutoffMs) {
        return {
            eligible: false,
            reason: 'recently_active',
            message: 'This Welcome-Back Offer Is Exclusively For Players Who Have Not Signed In Or Played In The Past 3 Weeks.',
        };
    }

    return {
        eligible: true,
        alreadyClaimed: false,
        profile,
        campaign: verified.campaign,
    };
}

export async function acceptWelcomeBackOffer(
    sb,
    {
        user,
        accessToken = '',
        token,
        userSupabaseFactory = null,
        nowMs = Date.now(),
        secret,
        minInactiveDays = WELCOME_BACK_INACTIVE_DAYS,
    } = {}
) {
    const check = await inspectWelcomeBackOfferStatus(sb, {
        user,
        token,
        nowMs,
        secret,
        minInactiveDays,
    });

    if (!check.eligible) {
        return {
            success: false,
            status: check.reason || 'ineligible',
            error: check.message || 'Not Eligible For This Welcome-Back Offer.',
        };
    }

    if (check.alreadyClaimed) {
        return {
            success: true,
            alreadyClaimed: true,
            ...(check.reward || {}),
            redirectTo: `/hub/club-arena/?join=${KINGS_CLUB_CODE}&welcome=chips`,
        };
    }

    const promoRow = await ensureWelcomeBackPromoCode(sb);
    if (!promoRow?.id) {
        throw new Error('Unable To Initialize Welcome-Back Campaign Code.');
    }

    // Atomic one-time lock via UNIQUE (promo_code_id, user_id)
    const { error: lockErr } = await sb
        .from('promo_code_redemptions')
        .insert({
            promo_code_id: promoRow.id,
            user_id: user.id,
        });

    if (lockErr) {
        if (lockErr.code === '23505') {
            const { data: raced } = await sb
                .from('promo_code_redemptions')
                .select('reward_applied')
                .eq('promo_code_id', promoRow.id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (raced?.reward_applied) {
                return {
                    success: true,
                    alreadyClaimed: true,
                    ...raced.reward_applied,
                    redirectTo: `/hub/club-arena/?join=${KINGS_CLUB_CODE}&welcome=chips`,
                };
            }
            return {
                success: false,
                status: 'in_progress',
                error: 'Your Welcome-Back Offer Claim Is Already Processing. Refresh In A Moment.',
            };
        }
        throw lockErr;
    }

    const rollbackLock = async () => {
        try {
            await sb
                .from('promo_code_redemptions')
                .delete()
                .eq('promo_code_id', promoRow.id)
                .eq('user_id', user.id);
        } catch {
            /* logged by caller */
        }
    };

    try {
        // 1. Ensure active KINGS CLUB (25450) membership when possible
        let hasActiveKingsMembership = false;
        const { data: kingsMember } = await sb
            .from('club_members')
            .select('club_id, status, is_active, membership_lifecycle_status')
            .eq('club_id', KINGS_CLUB_UUID)
            .eq('user_id', user.id)
            .maybeSingle();

        if (
            kingsMember &&
            kingsMember.is_active !== false &&
            ['active', 'approved'].includes(kingsMember.status || 'active') &&
            (kingsMember.membership_lifecycle_status || 'active') === 'active'
        ) {
            hasActiveKingsMembership = true;
        } else if (typeof userSupabaseFactory === 'function' && accessToken) {
            try {
                const userSb = userSupabaseFactory(accessToken);
                const { data: joinData, error: joinErr } = await userSb.rpc('fn_join_club_atomic', {
                    p_identifier: KINGS_CLUB_CODE,
                    p_request_id: deterministicUuid(`wb-join-kings:${user.id}`),
                });
                if (!joinErr && joinData?.success) {
                    hasActiveKingsMembership = true;
                }
            } catch {
                /* falls back to existing Midway Union club in fn_promo_disburse if cap reached */
            }
        }

        // 2. Disburse 25 Free Chips via sanctioned fn_promo_disburse (deterministic op_id = idempotent)
        const chipOpId = deterministicUuid(`welcome-back-3wk-202611:${user.id}`);
        let { data: chipRes, error: chipErr } = await sb.rpc('fn_promo_disburse', {
            p_source_kind: 'union',
            p_source_id: MIDWAY_UNION_UUID,
            p_target_kind: 'player',
            p_target_id: user.id,
            p_amount: WELCOME_BACK_CHIPS,
            p_note: 'Welcome-Back Offer Accepted - 25 free chips from Midway Union in KINGS CLUB',
            p_club_id: hasActiveKingsMembership ? KINGS_CLUB_UUID : null,
            p_op_id: chipOpId,
        });

        if ((chipErr || !chipRes?.success) && hasActiveKingsMembership) {
            const retry = await sb.rpc('fn_promo_disburse', {
                p_source_kind: 'union',
                p_source_id: MIDWAY_UNION_UUID,
                p_target_kind: 'player',
                p_target_id: user.id,
                p_amount: WELCOME_BACK_CHIPS,
                p_note: 'Welcome-Back Offer Accepted - 25 free chips from Midway Union',
                p_club_id: null,
                p_op_id: chipOpId,
            });
            chipRes = retry.data;
            chipErr = retry.error;
        }

        if (chipErr || !chipRes?.success) {
            throw new Error(chipErr?.message || chipRes?.error || 'Unable To Credit 25 Promotional Chips.');
        }

        // 3. Credit exact 500 Free Diamonds via sanctioned add_diamonds_to_balance (reference_id idempotent)
        const diamondRef = `wb_diamonds_3wk_202611:${user.id}`;
        const { data: diamondRes, error: diamondErr } = await sb.rpc('add_diamonds_to_balance', {
            p_user_id: user.id,
            p_amount: WELCOME_BACK_DIAMONDS,
            p_type: 'adjustment',
            p_description: 'Welcome-Back Offer Accepted: 500 Free Diamonds',
            p_reference_id: diamondRef,
        });

        if (diamondErr || (!diamondRes?.success && !diamondRes?.duplicate)) {
            throw new Error(diamondErr?.message || diamondRes?.error || 'Unable To Credit 500 Free Diamonds.');
        }

        // 4. Activate 1-Month (30-Day) Free VIP without overwriting a Lifetime VIP null expiry
        const profile = check.profile;
        const isLifetimeVip = profile?.is_vip === true && profile?.vip_expires_at === null;
        let nextVipExpiresAt = null;

        if (!isLifetimeVip) {
            const existingExpMs = profile?.vip_expires_at ? Date.parse(String(profile.vip_expires_at)) : 0;
            const baseMs = Number.isFinite(existingExpMs) && existingExpMs > nowMs ? existingExpMs : nowMs;
            nextVipExpiresAt = new Date(baseMs + WELCOME_BACK_VIP_DAYS * 86_400_000).toISOString();

            const { data: vipRows, error: vipErr } = await sb
                .from('profiles')
                .update({
                    is_vip: true,
                    vip_tier: profile?.vip_tier || 'monthly',
                    vip_expires_at: nextVipExpiresAt,
                })
                .eq('id', user.id)
                .select('id');

            if (vipErr || !vipRows || vipRows.length === 0) {
                throw new Error(vipErr?.message || 'Unable To Activate 1-Month Free VIP Access.');
            }
        }

        const receipt = {
            campaign: WELCOME_BACK_CODE,
            chipsAwarded: WELCOME_BACK_CHIPS,
            diamondsAwarded: WELCOME_BACK_DIAMONDS,
            vipDaysAwarded: WELCOME_BACK_VIP_DAYS,
            clubId: chipRes?.club_id || KINGS_CLUB_UUID,
            clubCode: KINGS_CLUB_CODE,
            chipTransactionId: chipRes?.transaction_id || null,
            diamondTransactionId: diamondRes?.transaction_id || null,
            vipExpiresAt: nextVipExpiresAt,
            acceptedAt: new Date(nowMs).toISOString(),
        };

        await sb
            .from('promo_code_redemptions')
            .update({ reward_applied: receipt })
            .eq('promo_code_id', promoRow.id)
            .eq('user_id', user.id);

        await sb
            .from('promo_codes')
            .update({ times_used: Number(promoRow.times_used || 0) + 1 })
            .eq('id', promoRow.id);

        return {
            success: true,
            alreadyClaimed: false,
            ...receipt,
            redirectTo: `/hub/club-arena/?join=${KINGS_CLUB_CODE}&welcome=chips`,
        };
    } catch (err) {
        await rollbackLock();
        throw err;
    }
}
