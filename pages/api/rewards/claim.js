/**
 * 💎 CENTRAL DIAMOND CLAIM ENDPOINT — Diamond Rewards Standard v2
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/rewards/claim
 *
 *   Headers: Authorization: Bearer <supabase access token>   (REQUIRED)
 *   Body:    { actionKey: string, targetId?: string, metadata?: object }
 *   Returns: { success, awarded, reason, dailyRemaining, monthlyRemaining, balance }
 *
 * THE ONE RULE
 *   The client NEVER sends an amount. It sends WHAT happened (actionKey) and
 *   WHICH thing it happened to (targetId). The server resolves the amount
 *   from src/config/diamondRewards.js and nowhere else. Any `amount`,
 *   `diamonds`, or `diamondsAwarded` field in the body is rejected outright —
 *   its presence means either a stale caller or someone probing for a mint.
 *
 * WHY THIS FILE EXISTS
 *   v1 had ~15 separate reward endpoints, each re-implementing auth, account
 *   age, the daily cap and idempotency slightly differently, each calling
 *   add_diamonds_to_balance (which was GRANTed to `authenticated` and never
 *   checked auth.uid()). The JS cap ran BEFORE the SQL multiplier, so the
 *   real ceiling was 500 × 2.00 = 1,000 💎/day = $10/day/user. And the
 *   anti-farming ledger itself was INSERT/DELETE-able by the user it audits.
 *
 *   v2: one door, one lock. This handler does identity + eligibility, then
 *   hands everything else to public.award_diamonds_v2() which owns the
 *   amount, the multiplier, the caps (evaluated POST-multiplier), the
 *   idempotency check and the balance write, in one transaction, granted to
 *   service_role ONLY.
 *
 * IDEMPOTENCY
 *   reference_id = '<actionKey>_<userId>_<targetId or YYYY-MM-DD>'
 *   User-scoped, always. v1 used keys like `social_post_reward_<postId>`
 *   which collide across users: the second user to react to a post silently
 *   got nothing, and a shared key is a cross-user replay surface.
 *
 * @see src/config/diamondRewards.js — the catalog (amounts, caps, gates)
 * @see public.award_diamonds_v2()   — the only thing that moves a balance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';
import {
    CATALOG_VERSION,
    REWARD_TIMEZONE,
    AGE_GATED_CATEGORIES,
    getReward,
    getEasterEgg,
} from '../../../src/config/diamondRewards';

// ── Config ────────────────────────────────────────────────────────────────
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TARGET_ID_LEN = 128;
const MAX_METADATA_BYTES = 2048;

/**
 * Body fields that must NEVER be honoured. If any of these show up we fail
 * the request loudly rather than silently ignoring them — a caller sending
 * an amount is a caller that believes it can set the amount.
 */
const FORBIDDEN_BODY_FIELDS = [
    'amount',
    'diamonds',
    'diamondsAwarded',
    'diamonds_awarded',
    'multiplier',
    'userId',
    'user_id',
];

/** Metadata keys stripped before the payload reaches SQL. */
const RESERVED_METADATA_KEYS = new Set([
    'amount',
    'diamonds',
    'awarded',
    'multiplier',
    'user_id',
    'userId',
    'action_key',
    'actionKey',
    'reference_id',
    'balance',
    // The egg payout is resolved server-side from EASTER_EGGS below. Without
    // this the client could POST metadata.egg_diamonds and name its own price.
    'egg_diamonds',
]);

/** reason → user-facing copy. Keep in sync with the SQL reason enum. */
const REASON_MESSAGES = {
    ok: 'Diamonds awarded.',
    duplicate: 'You have already been rewarded for this.',
    daily_cap: 'You have hit your daily diamond cap. Come back tomorrow.',
    monthly_cap: 'You have hit your monthly diamond cap. It resets on the 1st.',
    action_limit: 'You have earned this one as many times as you can today.',
    velocity: 'Slow down a moment, then try again.',
    budget_exhausted: 'Diamond rewards are paused for the rest of the month.',
    unknown_action: 'That reward does not exist.',
    not_eligible: 'You are not eligible for this reward yet.',
};

// ── Service-role Supabase client ──────────────────────────────────────────
// award_diamonds_v2 is granted to service_role ONLY. There is deliberately
// no anon-key fallback: running this endpoint without the service role would
// fail every call, and silently degrading to the anon key is how v1 ended up
// with user-executable award functions in the first place.
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return null;
        _supabase = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    return _supabase;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** YYYY-MM-DD in America/Chicago — the timezone every cap and streak uses. */
function chicagoDate(now = new Date()) {
    // en-CA formats as YYYY-MM-DD, which is exactly what we want.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: REWARD_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/**
 * targetIds land in a reference_id and in SQL. Keep them boring: printable
 * ASCII identifiers only, bounded length.
 */
function sanitizeTargetId(raw) {
    if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
    if (typeof raw !== 'string') return { ok: false, error: 'targetId must be a string' };
    const value = raw.trim();
    if (!value) return { ok: true, value: null };
    if (value.length > MAX_TARGET_ID_LEN) return { ok: false, error: 'targetId too long' };
    if (!/^[A-Za-z0-9_:.-]+$/.test(value)) {
        return { ok: false, error: 'targetId contains unsupported characters' };
    }
    return { ok: true, value };
}

/** Shallow-clean client metadata: plain object, no reserved keys, size-bounded. */
function sanitizeMetadata(raw) {
    if (raw === undefined || raw === null) return { ok: true, value: {} };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'metadata must be an object' };
    }
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        if (RESERVED_METADATA_KEYS.has(k)) continue;
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
            out[k] = typeof v === 'string' ? v.slice(0, 256) : v;
        }
    }
    if (JSON.stringify(out).length > MAX_METADATA_BYTES) {
        return { ok: false, error: 'metadata too large' };
    }
    return { ok: true, value: out };
}

/** Uniform response envelope so every caller can read the same fields. */
function respond(res, status, { success, awarded, reason, daily, monthly, balance, extra }) {
    const body = {
        success: Boolean(success),
        awarded: Number.isFinite(awarded) ? awarded : 0,
        reason: reason || 'not_eligible',
        message: REASON_MESSAGES[reason] || 'Reward unavailable.',
        dailyRemaining: Number.isFinite(daily) ? daily : null,
        monthlyRemaining: Number.isFinite(monthly) ? monthly : null,
        balance: Number.isFinite(balance) ? balance : null,
        // Legacy aliases — src/lib/claimReward.js reads claimed/diamondsAwarded.
        claimed: Boolean(success) && (awarded || 0) > 0,
        diamondsAwarded: Number.isFinite(awarded) ? awarded : 0,
        ...(extra || {}),
    };
    return res.status(status).json(body);
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        // Shared limiter, same one every write endpoint in this repo uses.
        // Dual-bucket (token + IP); it 429s and returns false on its own.
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        if (!supabase) {
            console.error('[Claim] SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing');
            return res.status(500).json({ success: false, error: 'Reward service unavailable' });
        }

        // ── 1. Identity comes from the token. Never from the body. ────────
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!token) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }

        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const authUser = authData?.user;
        if (authErr || !authUser?.id) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }
        const userId = authUser.id;

        // ── 2. Body validation ────────────────────────────────────────────
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        const smuggled = FORBIDDEN_BODY_FIELDS.filter((f) =>
            Object.prototype.hasOwnProperty.call(body, f),
        );
        if (smuggled.length) {
            console.warn(`[Claim] Rejected body with client-set fields (${smuggled.join(', ')}) from ${userId}`);
            return res.status(400).json({
                success: false,
                error: `Fields not accepted: ${smuggled.join(', ')}. The server sets the amount and the identity.`,
            });
        }

        const { actionKey } = body;
        if (!actionKey || typeof actionKey !== 'string') {
            return res.status(400).json({ success: false, error: 'actionKey required' });
        }

        const target = sanitizeTargetId(body.targetId);
        if (!target.ok) return res.status(400).json({ success: false, error: target.error });

        const meta = sanitizeMetadata(body.metadata);
        if (!meta.ok) return res.status(400).json({ success: false, error: meta.error });

        // ── 3. Resolve the action from the catalog — the ONLY amount source ─
        const reward = getReward(actionKey);
        if (!reward) {
            return respond(res, 200, { success: false, awarded: 0, reason: 'unknown_action' });
        }

        // Server-only actions (VIP stipend, referral payouts, Stripe-driven
        // first_purchase, verification bonuses) are awarded by trusted server
        // flows calling award_diamonds_v2 directly. A browser must never be
        // able to hand itself a 500 💎 stipend.
        if (reward.serverOnly) {
            console.warn(`[Claim] Blocked serverOnly action "${actionKey}" from ${userId}`);
            return respond(res, 200, {
                success: false,
                awarded: 0,
                reason: 'not_eligible',
                extra: { detail: 'This reward is granted automatically by the system.' },
            });
        }

        // Actions keyed to a specific object need that object's id, or the
        // once-per-target guard degrades into once-per-day.
        if (reward.oncePerTarget && !target.value) {
            return res.status(400).json({
                success: false,
                error: `targetId required for ${actionKey}`,
            });
        }

        // Easter eggs: the amount lives on the egg, and staff-awarded eggs
        // (verifiable:false) are not claimable from the browser at all.
        let resolvedEgg = null;
        if (actionKey === 'easter_egg') {
            const egg = getEasterEgg(target.value);
            resolvedEgg = egg;
            if (!egg) {
                return respond(res, 200, { success: false, awarded: 0, reason: 'unknown_action' });
            }
            if (egg.verifiable === false) {
                return respond(res, 200, {
                    success: false,
                    awarded: 0,
                    reason: 'not_eligible',
                    extra: { detail: 'This achievement is awarded by the team.' },
                });
            }
        }

        // ── 4. Eligibility: account age + email verification ──────────────
        // Social actions are where the sockpuppet farms live, so they need a
        // warmed-up, verified account before a single diamond moves.
        if (AGE_GATED_CATEGORIES.includes(reward.category)) {
            const { data: profile, error: profileErr } = await supabase
                .from('profiles')
                .select('created_at, email_verified')
                .eq('id', userId)
                .maybeSingle();

            if (profileErr) {
                console.warn('[Claim] Profile lookup failed:', profileErr.message);
                return res.status(500).json({ success: false, error: 'Eligibility check failed' });
            }

            const createdAt = profile?.created_at || authUser.created_at;
            const ageMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
            if (!createdAt || ageMs < MIN_ACCOUNT_AGE_MS) {
                return respond(res, 200, {
                    success: false,
                    awarded: 0,
                    reason: 'not_eligible',
                    extra: { detail: 'Your account must be at least 24 hours old to earn this.' },
                });
            }

            const emailVerified =
                Boolean(authUser.email_confirmed_at) || profile?.email_verified === true;
            if (!emailVerified) {
                return respond(res, 200, {
                    success: false,
                    awarded: 0,
                    reason: 'not_eligible',
                    extra: { detail: 'Verify your email address to earn social rewards.' },
                });
            }
        }

        // ── 5. User-scoped idempotency key ────────────────────────────────
        // '<actionKey>_<userId>_<targetId or YYYY-MM-DD>'
        const referenceId = `${actionKey}_${userId}_${target.value || chicagoDate()}`;

        // ── 6. Hand off. SQL owns amount, multiplier, caps and the write. ──
        // safeAward never throws, and tells us apart the one failure mode we can
        // do something sane about: migration 20260726120000 not applied, i.e.
        // award_diamonds_v2 does not exist in this database.
        const { ok: rpcOk, data: rpcData, migrationMissing, error: rpcError } =
            await safeAward(supabase, {
                p_user_id: userId,
                p_action_key: actionKey,
                p_reference_id: referenceId,
                p_target_id: target.value,
                p_metadata: {
                    ...meta.value,
                    // award_diamonds_v2 reads the egg payout from
                    // p_metadata->>'egg_diamonds' because the catalog row for
                    // easter_egg carries diamonds:0. Without this every egg
                    // awarded exactly 0. Resolved from EASTER_EGGS server-side;
                    // 'egg_diamonds' is a RESERVED metadata key so the spread
                    // above can never override it.
                    ...(resolvedEgg ? { egg_diamonds: resolvedEgg.diamonds } : {}),
                    _source: 'api/rewards/claim',
                    _catalog_version: CATALOG_VERSION,
                    _claimed_at: new Date().toISOString(),
                },
            });

        if (!rpcOk) {
            // Rewards are down platform-wide, not "this claim was rejected".
            // Nothing was written (this handler only reads before the RPC), so
            // the same reference_id stays claimable once the migration lands.
            // 200 keeps every client off its error branch.
            if (migrationMissing) {
                return respond(res, 200, {
                    success: false,
                    awarded: 0,
                    reason: 'unavailable',
                    extra: {
                        actionKey,
                        label: reward.label,
                        message: 'Rewards are temporarily unavailable.',
                    },
                });
            }
            console.error('[Claim] award_diamonds_v2 failed:', (rpcError && rpcError.message) || rpcError);
            try { reportApiError(rpcError, req); } catch { /* noop */ }
            return res.status(500).json({
                success: false,
                error: 'Failed to award diamonds — please try again',
            });
        }

        // Supabase returns jsonb as a plain object; be defensive anyway.
        const result = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData || {};

        // Report the RPC verdict faithfully. This endpoint does not second
        // -guess the ledger — if SQL says capped, the user is capped.
        return respond(res, 200, {
            success: Boolean(result.success),
            awarded: Number(result.awarded) || 0,
            reason: result.reason || 'not_eligible',
            daily: Number.isFinite(Number(result.daily_remaining)) ? Number(result.daily_remaining) : undefined,
            monthly: Number.isFinite(Number(result.monthly_remaining)) ? Number(result.monthly_remaining) : undefined,
            balance: Number.isFinite(Number(result.balance_after)) ? Number(result.balance_after) : undefined,
            extra: {
                requested: Number(result.requested) || 0,
                capped: Boolean(result.capped),
                actionKey,
                label: reward.label,
            },
        });
    } catch (err) {
        try { reportApiError(err, req); } catch { /* noop */ }
        console.error('[Claim] Unhandled error:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        return undefined;
    }
}
