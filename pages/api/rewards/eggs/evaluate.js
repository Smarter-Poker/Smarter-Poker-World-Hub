/**
 * 🥚 EASTER EGG SWEEP — POST /api/rewards/eggs/evaluate
 * ═══════════════════════════════════════════════════════════════════════════
 * The endpoint that makes the 67 easter eggs real. Before this existed the
 * eggs were display-only: src/config/diamondRewards.js listed them, the rewards
 * pages advertised them, and nothing in the app could ever trigger one, because
 * grep showed /api/rewards/claim had no callers at all.
 *
 * THE SHAPE OF THE CONTRACT
 *   Request:  POST, Authorization: Bearer <token>, NO body of consequence.
 *   Response: { success, awarded: [{ key, name, diamonds, rarity, icon }],
 *               totalDiamonds, checked, capped }
 *
 * The client cannot name an egg. It cannot name an amount. It can only say
 * "look at me again" — the server decides what, if anything, was earned, by
 * running the verifier registry against the database. That asymmetry is the
 * whole design: a request that carries no claim cannot be forged into one.
 *
 * IDEMPOTENCY
 *   Each award goes through award_diamonds_v2 with reference_id
 *   'easter_egg_<userId>_<eggKey>', so a re-sweep of an egg the user already
 *   owns comes back `duplicate` and pays nothing. Sweeping is therefore safe
 *   to call often and safe to retry.
 *
 * COST CONTROL
 *   Verifiers run in a bounded batch against a memoised context (one profile
 *   read, one transaction read, one training read — shared across all of them),
 *   the sweep is rate limited like every other write endpoint, and
 *   EASTER_EGG_MONTHLY_CAP (500 ◆) is still enforced inside SQL, so a user who
 *   legitimately unlocks six legendary eggs in one sweep is still capped at
 *   500 ◆ for the month.
 *
 * @see src/lib/rewards/eggVerifiers.js — the proofs
 * @see pages/api/rewards/claim.js      — single-egg path, same verification
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';
import { safeAward } from '../../../../src/lib/rewards/awardGuard';
import { createEggContext, verifyEgg, verifiableEggKeys } from '../../../../src/lib/rewards/eggVerifiers';
import { CATALOG_VERSION, getEasterEgg } from '../../../../src/config/diamondRewards';

/** Verifiers evaluated per sweep. The registry is smaller than this today. */
const MAX_VERIFIERS_PER_SWEEP = 40;

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

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        if (!supabase) {
            console.error('[EggSweep] SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing');
            return res.status(500).json({ success: false, error: 'Reward service unavailable' });
        }

        // Identity from the token, never the body. getServerUserWithFallback is
        // the repo's sanctioned server-side verifier (JWT verify first, network
        // call only as a fallback) — see src/lib/serverAuth.
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, supabase);
        const userId = authUser?.id;
        if (authErr || !userId) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }

        // Skip eggs the user already owns so a sweep costs nothing to repeat.
        const { data: ownedRows } = await supabase
            .from('diamond_reward_claims')
            .select('metadata')
            .eq('user_id', userId)
            .eq('reward_type', 'easter_egg')
            .limit(200);
        const owned = new Set(
            (ownedRows || [])
                .map((r) => r?.metadata?.egg_key || r?.metadata?.target_id)
                .filter(Boolean),
        );

        const ctx = createEggContext(supabase, userId);
        const keys = verifiableEggKeys()
            .filter((k) => !owned.has(k))
            .slice(0, MAX_VERIFIERS_PER_SWEEP);

        const awarded = [];
        let totalDiamonds = 0;
        let capped = false;

        for (const key of keys) {
            // Sequential on purpose: the memoised context means the first
            // verifier pays for the shared reads and the rest are free, and a
            // burst of parallel service-role queries is how you get rate
            // limited by PostgREST.
            const proof = await verifyEgg(key, ctx);
            if (!proof.verified) continue;

            const egg = getEasterEgg(key);
            if (!egg) continue;

            const { ok, data, migrationMissing } = await safeAward(supabase, {
                p_user_id: userId,
                p_action_key: 'easter_egg',
                p_reference_id: `easter_egg_${userId}_${key}`,
                p_target_id: key,
                p_metadata: {
                    egg_key: key,
                    egg_diamonds: egg.diamonds,
                    _source: 'api/rewards/eggs/evaluate',
                    _catalog_version: CATALOG_VERSION,
                    _verified_at: new Date().toISOString(),
                },
            });

            if (!ok) {
                if (migrationMissing) {
                    return res.status(200).json({
                        success: false,
                        awarded: [],
                        totalDiamonds: 0,
                        reason: 'unavailable',
                        message: 'Rewards are temporarily unavailable.',
                    });
                }
                // One egg failing must not abort the sweep.
                continue;
            }

            const result = typeof data === 'string' ? JSON.parse(data) : data || {};
            if (result.success && Number(result.awarded) > 0) {
                totalDiamonds += Number(result.awarded);
                awarded.push({
                    key,
                    name: egg.name,
                    rarity: egg.rarity,
                    icon: egg.icon,
                    hint: egg.hint,
                    diamonds: Number(result.awarded),
                });
            } else if (result.reason === 'monthly_cap' || result.reason === 'daily_cap') {
                capped = true;
                break;
            }
        }

        return res.status(200).json({
            success: true,
            awarded,
            totalDiamonds,
            checked: keys.length,
            capped,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch { /* noop */ }
        console.error('[EggSweep] Unhandled error:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        return undefined;
    }
}
