/**
 * 👥 REFERRAL REWARD — Diamond Rewards Standard v2 (QUALIFICATION MODEL)
 * ═══════════════════════════════════════════════════════════════════════════
 * v1 paid 500 💎 to the referrer the moment a signup happened, cap-exempt and
 * unverified — i.e. $5 of real money per throwaway email. That is gone.
 *
 * v2 pays NOTHING at signup. A referral becomes QUALIFIED, and only then:
 *   referral_qualified  → 500 💎 to the referrer
 *   referral_referee    → 100 💎 to the referee
 * Amounts come from the catalog inside award_diamonds_v2 — never from here,
 * never from the client.
 *
 * QUALIFICATION (all four must hold, all server-verified):
 *   1. the referee's email is verified
 *   2. the referee's phone is verified
 *   3. the referee's account is >= 7 days old
 *   4. the referee has LOGGED IN on >= 5 DISTINCT days
 *      (distinct Chicago days in diamond_transactions — the service-role-only
 *       ledger; the user cannot write to it)
 * Plus: a referrer can qualify at most 20 referrals per calendar month
 * (America/Chicago), counted from the ledger, not from a user-writable table.
 *
 * reference_ids (user-scoped, collision-free):
 *   referral_qualified_<referrerId>_<refereeId>
 *   referral_referee_<refereeId>_<referrerId>
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { safeAward } from '../../../src/lib/rewards/awardGuard';

// ── Service-role client — award_diamonds_v2 is GRANTed to service_role ONLY ──
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/** YYYY-MM-DD in America/Chicago — the anchor timezone for every diamond day. */
function chicagoDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
}

const REASON_MESSAGE = {
    ok: 'Diamonds awarded',
    duplicate: 'Already claimed',
    daily_cap: 'Daily diamond cap reached — come back tomorrow',
    monthly_cap: 'Monthly diamond cap reached',
    action_limit: 'Daily limit reached for this reward',
    velocity: 'Slow down a moment before earning again',
    budget_exhausted: 'Rewards are paused right now — please try again later',
    unknown_action: 'Unknown reward action',
    not_eligible: 'Not eligible for this reward'
};

/**
 * Delegate the award to public.award_diamonds_v2. The amount is resolved
 * SERVER-SIDE from the catalog — this endpoint never sends one, and the client
 * never sends one either. Dedup (reference_id), per-action daily limits,
 * velocity, the POST-multiplier daily/monthly caps and the platform budget all
 * live inside the SQL function. We only decide *eligibility*.
 */
async function awardDiamondsV2(supabase, { userId, actionKey, referenceId, targetId = null, metadata = {} }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn('[RewardsV2] SUPABASE_SERVICE_ROLE_KEY missing — award_diamonds_v2 is service_role only');
        return { ok: false, transportError: { message: 'Service role key not configured' } };
    }
    // safeAward never throws. If migration 20260726120000 has not been applied,
    // award_diamonds_v2 does not exist — that comes back as migrationMissing so
    // this endpoint can answer 200 "unavailable" instead of 500-ing the site.
    const { ok, data, migrationMissing, error } = await safeAward(supabase, {
        p_user_id: userId,
        p_action_key: actionKey,
        p_reference_id: referenceId,
        p_target_id: targetId === null || targetId === undefined ? null : String(targetId),
        p_metadata: metadata || {}
    });
    if (!ok) {
        if (migrationMissing) {
            return { ok: false, migrationMissing: true, transportError: error };
        }
        console.warn('[RewardsV2] RPC error for', actionKey, '-', (error && error.message) || error);
        return { ok: false, transportError: error };
    }
    const r = data || {};
    return {
        ok: true,
        success: r.success === true,
        awarded: Number(r.awarded || 0),
        requested: Number(r.requested || 0),
        reason: r.reason || 'unknown',
        capped: r.capped === true,
        dailyRemaining: r.daily_remaining === undefined ? null : r.daily_remaining,
        monthlyRemaining: r.monthly_remaining === undefined ? null : r.monthly_remaining,
        balance: r.balance_after === undefined ? null : r.balance_after
    };
}

/**
 * Surface the RPC's verdict honestly. `reason` and `awarded` always reflect
 * what the ledger actually did. `success` stays true for duplicate/action_limit
 * so existing clients keep their "already claimed" branch.
 */
function sendAwardResult(res, award, label, extra = {}) {
    if (!award.ok) {
        // Migration not applied → the reward system is down, not the request.
        // 200 keeps the client's happy path intact and nothing was written, so
        // the user can claim this exact reward again once the migration lands.
        if (award.migrationMissing) {
            return res.status(200).json({
                ...extra,
                success: false,
                claimed: false,
                awarded: 0,
                diamondsAwarded: 0,
                reason: 'unavailable',
                message: 'Rewards are temporarily unavailable.'
            });
        }
        return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
    }
    const base = {
        ...extra,
        awarded: award.awarded,
        diamondsAwarded: award.awarded,
        requested: award.requested,
        reason: award.reason,
        capped: award.capped,
        dailyRemaining: award.dailyRemaining,
        monthlyRemaining: award.monthlyRemaining,
        balance: award.balance
    };
    if (award.success) {
        return res.status(200).json({
            ...base,
            success: true,
            claimed: true,
            message: `+${award.awarded} 💎 ${label}${award.capped ? ' (capped by your daily limit)' : ''}`
        });
    }
    const softClaim = award.reason === 'duplicate' || award.reason === 'action_limit';
    return res.status(200).json({
        ...base,
        success: softClaim,
        claimed: false,
        alreadyClaimed: softClaim,
        dailyCapReached: award.reason === 'daily_cap',
        monthlyCapReached: award.reason === 'monthly_cap',
        cooldown: award.reason === 'velocity',
        message: REASON_MESSAGE[award.reason] || 'Reward not granted'
    });
}

const REFERRER_ACTION = 'referral_qualified';
const REFEREE_ACTION = 'referral_referee';
const MIN_REFEREE_AGE_DAYS = 7;
const MIN_LOGIN_DAYS = 5;
const MAX_QUALIFIED_PER_MONTH = 20;

/**
 * The `referrals` table has drifted across migrations: some deployments name
 * the second party `referee_id`, older ones `referred_id`. Try both.
 */
async function loadReferral(supabase, refereeId) {
    for (const column of ['referee_id', 'referred_id']) {
        const { data, error } = await supabase
            .from('referrals')
            .select('*')
            .eq(column, refereeId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (!error && data) return { referral: data, refereeColumn: column };
        if (error && error.code !== '42703' && error.message && !/column/i.test(error.message)) {
            console.warn('[Referral] referrals lookup error:', error.message);
        }
    }
    return { referral: null, refereeColumn: null };
}

/**
 * Distinct Chicago days on which the referee actually LOGGED IN.
 *
 * We count daily_login ledger rows rather than any-activity rows: daily_login
 * is awarded at most once per Chicago day and only on a real authenticated
 * session, so its distinct-day count IS the number of separate days the user
 * logged in. diamond_transactions is service-role-only (locked down in
 * migration 20260726120000), so this signal cannot be forged by the referee.
 */
async function countLoginDays(supabase, userId) {
    const { data, error } = await supabase
        .from('diamond_transactions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('transaction_type', 'daily_login')
        .order('created_at', { ascending: false })
        .limit(500);
    if (error) {
        console.warn('[Referral] Login-day lookup failed:', error.message || error);
        return null;   // unknown ⇒ fail closed
    }
    const days = new Set();
    for (const row of data || []) {
        if (row.created_at) days.add(chicagoDate(new Date(row.created_at)));
    }
    return days.size;
}

/** Qualified referrals already paid to this referrer in the current Chicago month. */
async function countQualifiedThisMonth(supabase, referrerId) {
    const since = new Date(Date.now() - 45 * 86400000).toISOString();
    const { data, error } = await supabase
        .from('diamond_transactions')
        .select('created_at, reference_id')
        .eq('user_id', referrerId)
        .like('reference_id', `${REFERRER_ACTION}_${referrerId}_%`)
        .gte('created_at', since)
        .limit(200);
    if (error) {
        console.warn('[Referral] Monthly count failed:', error.message || error);
        return null;   // unknown ⇒ fail closed
    }
    const month = chicagoDate().substring(0, 7);   // YYYY-MM
    const refs = new Set();
    for (const row of data || []) {
        if (row.created_at && chicagoDate(new Date(row.created_at)).startsWith(month)) {
            refs.add(row.reference_id);
        }
    }
    return refs.size;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = getSupabase();

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUser = authData?.user;
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const body = req.body || {};
    // `referredUserId` is the v1 field name — accepted so existing callers keep working.
    const refereeId = body.refereeId || body.referredUserId || authUser.id;

    try {
        // ── The referral pair comes from the referrals table, never the body ──
        const { referral } = await loadReferral(supabase, refereeId);
        if (!referral) {
            return res.status(200).json({
                success: false, qualified: false, reason: 'not_eligible',
                awarded: 0, diamondsAwarded: 0,
                message: 'No referral on record for this account'
            });
        }

        const referrerId = referral.referrer_id;
        if (!referrerId) {
            return res.status(200).json({ success: false, qualified: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Referral has no referrer' });
        }
        if (referrerId === refereeId) {
            return res.status(400).json({ success: false, error: 'Cannot refer yourself' });
        }
        // Only the two parties to the referral may poke it.
        if (authUser.id !== referrerId && authUser.id !== refereeId) {
            return res.status(403).json({ success: false, error: 'Cannot claim referral rewards for unrelated accounts' });
        }

        // ── Qualification checks on the referee (all server-side) ──
        const { data: referee } = await supabase
            .from('profiles')
            .select('id, created_at, email_verified, phone_verified')
            .eq('id', refereeId)
            .maybeSingle();

        if (!referee) {
            return res.status(200).json({ success: false, qualified: false, reason: 'not_eligible', awarded: 0, diamondsAwarded: 0, message: 'Referred account not found' });
        }

        const ageDays = Math.floor((Date.now() - new Date(referee.created_at).getTime()) / 86400000);
        const loginDays = await countLoginDays(supabase, refereeId);

        const requirements = {
            emailVerified: referee.email_verified === true,
            phoneVerified: referee.phone_verified === true,
            accountAgeDays: ageDays,
            accountOldEnough: ageDays >= MIN_REFEREE_AGE_DAYS,
            loginDays: loginDays === null ? 0 : loginDays,
            activeEnough: loginDays !== null && loginDays >= MIN_LOGIN_DAYS
        };

        if (!requirements.emailVerified || !requirements.phoneVerified
            || !requirements.accountOldEnough || !requirements.activeEnough) {
            return res.status(200).json({
                success: false, qualified: false, reason: 'not_eligible',
                awarded: 0, diamondsAwarded: 0, requirements,
                message: 'Referral is not qualified yet — the referred player must verify email and phone, keep the account 7+ days, and log in on 5 separate days.'
            });
        }

        // ── Referrer monthly ceiling (10 qualified referrals per calendar month) ──
        const qualifiedThisMonth = await countQualifiedThisMonth(supabase, referrerId);
        if (qualifiedThisMonth === null) {
            return res.status(500).json({ success: false, error: 'Could not verify referral limits — please retry' });
        }
        if (qualifiedThisMonth >= MAX_QUALIFIED_PER_MONTH) {
            return res.status(200).json({
                success: false, qualified: true, reason: 'monthly_cap',
                awarded: 0, diamondsAwarded: 0,
                qualifiedThisMonth, maxQualifiedPerMonth: MAX_QUALIFIED_PER_MONTH,
                message: `Referral limit reached (${MAX_QUALIFIED_PER_MONTH} qualified referrals per month)`
            });
        }

        // ── Pay the referrer, then the referee. Dedup is the RPC's job. ──
        const referrerAward = await awardDiamondsV2(supabase, {
            userId: referrerId,
            actionKey: REFERRER_ACTION,
            referenceId: `${REFERRER_ACTION}_${referrerId}_${refereeId}`,
            targetId: refereeId,
            metadata: { referee_id: refereeId, qualified_on: chicagoDate(), requirements }
        });

        if (!referrerAward.ok) {
            // Migration 20260726120000 not applied → award_diamonds_v2 is absent.
            // Nothing has been written (this endpoint only reads before awarding),
            // so the referral stays qualified and re-claimable. Answer 200, not 500.
            if (referrerAward.migrationMissing) {
                return res.status(200).json({
                    success: false,
                    qualified: true,
                    claimed: false,
                    alreadyClaimed: false,
                    reason: 'unavailable',
                    awarded: 0,
                    diamondsAwarded: 0,
                    balance: null,
                    qualifiedThisMonth,
                    maxQualifiedPerMonth: MAX_QUALIFIED_PER_MONTH,
                    referrer: { userId: referrerId, awarded: 0, reason: 'unavailable' },
                    referee: { userId: refereeId, awarded: 0, reason: 'unavailable' },
                    message: 'Rewards are temporarily unavailable.'
                });
            }
            return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
        }

        let refereeAward = null;
        if (referrerAward.success || referrerAward.reason === 'duplicate') {
            refereeAward = await awardDiamondsV2(supabase, {
                userId: refereeId,
                actionKey: REFEREE_ACTION,
                referenceId: `${REFEREE_ACTION}_${refereeId}_${referrerId}`,
                targetId: referrerId,
                metadata: { referrer_id: referrerId, qualified_on: chicagoDate() }
            });
            if (!refereeAward.ok) {
                // The referrer is already paid; report honestly instead of retrying blind.
                console.warn('[Referral] Referee award failed after referrer was paid', { referrerId, refereeId });
                refereeAward = { ok: true, success: false, awarded: 0, requested: 0, reason: refereeAward.migrationMissing ? 'unavailable' : 'not_eligible', capped: false, dailyRemaining: null, monthlyRemaining: null, balance: null };
            }
        }

        const callerIsReferrer = authUser.id === referrerId;
        const callerAward = callerIsReferrer ? referrerAward : refereeAward;

        return res.status(200).json({
            success: !!(referrerAward.success || (refereeAward && refereeAward.success)),
            qualified: true,
            claimed: !!(referrerAward.success || (refereeAward && refereeAward.success)),
            alreadyClaimed: referrerAward.reason === 'duplicate',
            reason: callerAward ? callerAward.reason : referrerAward.reason,
            awarded: callerAward ? callerAward.awarded : 0,
            diamondsAwarded: callerAward ? callerAward.awarded : 0,
            balance: callerAward ? callerAward.balance : null,
            qualifiedThisMonth: qualifiedThisMonth + (referrerAward.success ? 1 : 0),
            maxQualifiedPerMonth: MAX_QUALIFIED_PER_MONTH,
            referrer: {
                userId: referrerId,
                awarded: referrerAward.awarded,
                reason: referrerAward.reason
            },
            referee: {
                userId: refereeId,
                awarded: refereeAward ? refereeAward.awarded : 0,
                reason: refereeAward ? refereeAward.reason : 'not_eligible'
            },
            message: referrerAward.success
                ? 'Referral qualified — diamonds awarded!'
                : (REASON_MESSAGE[referrerAward.reason] || 'Referral reward not granted')
        });

    } catch (error) {
        console.warn('[ReferralReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to process referral reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
