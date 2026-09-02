/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRON: /api/cron/vip-stipend
 *  Schedule: daily  (e.g. "15 9 * * *")  — see "WHY DAILY" below.
 *
 *  Pays the 500 💎 monthly VIP stipend.
 *
 *  src/data/diamondStoreData.js has advertised "500 Bonus Diamonds Credited
 *  Every Month" in VIP_BENEFITS since the store shipped. Nothing ever paid it.
 *  This route is that promise, implemented.
 *
 *  ─── THE MONEY ────────────────────────────────────────────────────────────
 *  1 💎 = $0.01. 500 💎 = $5.00 per subscriber per month against a $19.99/mo
 *  ($16.67/mo annualised) subscription. That is ~25-30% of the subscription
 *  price going straight back out. Paying it to ONE ineligible account is a
 *  pure $5/month loss; paying it to a farm is unbounded.
 *
 *  ─── WHO GETS PAID (changed 2026-09-01 by Dan's decision) ────────────────
 *  EVERY ACCOUNT WITH AN ACTIVE VIP ENTITLEMENT. 500 diamonds, on the 1st of
 *  every month. Dan, verbatim: "JUST PAY THEM ALL ON THE 1ST OF EVERY MONTH,
 *  THEIR 500 DIAMONDS".
 *
 *  Eligibility is `profiles.is_vip = true` AND (vip_tier = 'lifetime' OR
 *  vip_expires_at in the future). That is the same predicate
 *  award_diamonds_v2's own vip_stipend guard enforces, so the RPC is now a
 *  second lock on the identical rule rather than a looser floor beneath a
 *  stricter one.
 *
 *  HORSES ARE PAID. They hold lifetime VIP from the club-arena migration
 *  20260311_horses_lifetime_vip and are ~1,000 of the ~1,033 eligible
 *  accounts. Club Arena CLAUDE.md section 10.5 is binding and explicit: a
 *  horse EARNS and IS PAID everything a human is, and writing `is_horse` into
 *  a payout in order to leave horses out is a bug, not an optimisation. There
 *  is deliberately NO is_horse branch anywhere in this file. Do not add one.
 *
 *  WHAT THIS REPLACED, so nobody restores it by accident. Until 2026-09-01
 *  this route paid only accounts holding a vip_subscriptions row with a real
 *  Stripe subscription id, on the reasoning that `profiles.is_vip` cannot
 *  prove payment: the 30-day signup trial writes vip_tier without paying
 *  (20260330120000_vip_paywall_30day_trial.sql), /api/sms/verify-otp grants a
 *  free VIP window for verifying a phone, and pre-v2 users could self-set
 *  is_vip through PostgREST. All of that is still true. It is no longer the
 *  policy: the stipend is now an entitlement benefit, not a rebate on cash
 *  collected. vip_subscriptions has never held a row, so the old rule paid
 *  nobody, which is what prompted the change.
 *
 *  THE COST IS REAL AND INTENDED. ~1,033 x 500 = ~516,500 diamonds a month of
 *  newly minted supply. At the store's 1 diamond = $0.01 that is a ~$5,165
 *  nominal monthly issuance, ~$5,000 of it to horses. Diamonds are spendable
 *  on merchandise and features, so for the ~33 human accounts this is real
 *  value; for the horse fleet it is supply that inflates every diamond total
 *  and reconciliation. Dan was shown these numbers before deciding. If the
 *  bill needs to change, change the CATALOG amount or the eligibility rule
 *  here and say so in the commit. Never by quietly filtering horses out.
 *
 *  ─── IDEMPOTENCY ─────────────────────────────────────────────────────────
 *  Two independent locks, both required:
 *    1. p_reference_id = `vip_stipend_<userId>_<YYYY-MM>` — user-scoped
 *       (diamond_transactions.reference_id is UNIQUE GLOBALLY, so an unscoped
 *       id would let the first payee block every other subscriber) and
 *       month-scoped. A second call in the same month returns 'duplicate'.
 *    2. award_diamonds_v2's own "one vip_stipend per calendar month" check.
 *  The YYYY-MM key is computed in America/Chicago to match the calendar month
 *  window award_diamonds_v2 uses.
 *
 *  ─── WHY DAILY, NOT MONTHLY ──────────────────────────────────────────────
 *  A once-a-month run means anyone who subscribes on the 2nd waits 30 days,
 *  and one failed run silently skips a whole month for everyone. Running
 *  daily is safe precisely because it is idempotent: every already-paid
 *  subscriber comes back 'duplicate' and costs nothing. Monthly ("0 10 1 * *")
 *  also works if you prefer a single billing event.
 *
 *  Auth: the repo's standard cron guard (validateCronAuth) —
 *        `x-cron-secret: <CRON_SECRET>`, `Authorization: Bearer <CRON_SECRET>`
 *        or `?secret=<CRON_SECRET>`.
 *
 *  Query params:
 *    ?dry=1    resolve the eligible set and report it, award nothing.
 *    ?limit=N  cap awards this run (default MAX_AWARDS_PER_RUN).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return null;
        _supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return _supabase;
}

/* ── Tunables ─────────────────────────────────────────────────────────────── */
const PAGE_SIZE          = 500;   // profiles rows pulled per query
const AWARD_CHUNK        = 10;    // concurrent award_diamonds_v2 calls
const MAX_AWARDS_PER_RUN = 5000;  // hard ceiling — 5,000 x 500 💎 = $25,000 max
const MAX_PAGES          = 40;    // 40 x 500 = 20,000 subscription rows scanned

/* Retired 2026-09-01 with the vip_subscriptions gate: PAYING_STATUSES and
   PERIOD_GRACE_MS described a Stripe billing window this route no longer
   consults. Eligibility is the VIP entitlement on profiles — see the header. */

/**
 * Calendar month key (YYYY-MM) in America/Chicago — the same timezone
 * award_diamonds_v2 anchors its month window to.
 */
function chicagoMonthKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date);

    const year  = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    return `${year}-${month}`;
}

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    if (!validateCronAuth(req)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        // award_diamonds_v2 is GRANTed to service_role ONLY. No anon fallback:
        // it would 42501 on every row and report a successful no-op run.
        console.error('[cron/vip-stipend] SUPABASE_SERVICE_ROLE_KEY is not configured - stipend NOT running.');
        return res.status(500).json({ success: false, error: 'Service role key not configured' });
    }

    const dryRun   = req.query?.dry === '1';
    const monthKey = chicagoMonthKey();

    const parsedLimit = parseInt(req.query?.limit, 10);
    const maxAwards   = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_AWARDS_PER_RUN)
        : MAX_AWARDS_PER_RUN;

    const stats = {
        scanned:        0,   // profiles rows examined
        eligible:       0,   // distinct users holding a live VIP entitlement
        awarded:        0,   // stipends actually paid this run
        diamonds:       0,   // total diamonds paid this run
        alreadyPaid:    0,   // duplicate / action_limit — already had it this month
        notEligible:    0,   // rejected by award_diamonds_v2's own VIP check (should be ~0 now: same rule)
        capped:         0,   // budget_exhausted / monthly_cap
        failed:         0,   // RPC errors
        truncated:      false,
    };

    /* Reasons worth a human's attention, keyed by reason string. */
    const rejectionSamples = {};

    try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1 — resolve the entitled set from profiles.
        // Every account with live VIP, horses included (section 10.5).
        // ═══════════════════════════════════════════════════════════════════
        const eligibleUserIds = new Set();
        const nowISO = new Date().toISOString();

        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE;
            const to   = from + PAGE_SIZE - 1;

            const { data: rows, error: fetchError } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_vip', true)
                /* Lifetime never expires; everything else must be unexpired.
                   No is_horse filter, deliberately — see the header. */
                .or(`vip_tier.eq.lifetime,vip_expires_at.gt."${nowISO}"`)
                .order('created_at', { ascending: true })
                .range(from, to);

            if (fetchError) {
                console.error('[cron/vip-stipend] profiles fetch failed:', fetchError.message);
                return res.status(500).json({ success: false, error: fetchError.message, stats });
            }

            if (!rows || rows.length === 0) break;

            stats.scanned += rows.length;
            for (const row of rows) {
                if (row.id) eligibleUserIds.add(row.id);
            }

            if (rows.length < PAGE_SIZE) break;
            if (page === MAX_PAGES - 1) stats.truncated = true;
        }

        const userIds = Array.from(eligibleUserIds).slice(0, maxAwards);
        stats.eligible = eligibleUserIds.size;

        if (eligibleUserIds.size > userIds.length) stats.truncated = true;

        if (dryRun) {
            return res.status(200).json({
                success: true,
                dryRun: true,
                month: monthKey,
                stats,
                sampleUserIds: userIds.slice(0, 20),
                timestamp: new Date().toISOString(),
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2 — award, in small concurrent chunks.
        // Every amount is resolved server-side from diamond_reward_catalog;
        // this route never sends a number.
        // ═══════════════════════════════════════════════════════════════════
        for (let i = 0; i < userIds.length; i += AWARD_CHUNK) {
            const chunk = userIds.slice(i, i + AWARD_CHUNK);

            const results = await Promise.all(chunk.map(async (userId) => {
                try {
                    const { data, error } = await supabase.rpc('award_diamonds_v2', {
                        p_user_id:      userId,
                        p_action_key:   'vip_stipend',
                        p_reference_id: `vip_stipend_${userId}_${monthKey}`,
                        p_target_id:    null,
                        p_metadata:     { source: 'cron_vip_stipend', month: monthKey },
                    });
                    if (error) return { userId, error };
                    return { userId, data };
                } catch (err) {
                    return { userId, error: { message: err?.message || String(err) } };
                }
            }));

            for (const r of results) {
                if (r.error) {
                    stats.failed += 1;
                    if (stats.failed <= 5) {
                        console.warn('[cron/vip-stipend] award failed for', r.userId, '-', r.error.message);
                    }
                    continue;
                }

                const result = r.data || {};

                if (result.success) {
                    stats.awarded  += 1;
                    stats.diamonds += result.awarded || 0;
                    continue;
                }

                const reason = result.reason || 'unknown';
                if (!rejectionSamples[reason]) rejectionSamples[reason] = 0;
                rejectionSamples[reason] += 1;

                if (reason === 'duplicate' || reason === 'action_limit') {
                    stats.alreadyPaid += 1;
                } else if (reason === 'not_eligible') {
                    // Since 2026-09-01 this route and award_diamonds_v2 select
                    // on the SAME predicate (is_vip AND lifetime-or-unexpired),
                    // so this should be ~0. A nonzero count means the two
                    // disagree — most likely the entitlement expired between
                    // STEP 1 and the award, which is benign and self-corrects
                    // next run. A persistent count means the RPC's guard was
                    // changed without changing STEP 1 here; reconcile the two
                    // rather than loosening either.
                    stats.notEligible += 1;
                } else {
                    stats.capped += 1;
                }
            }
        }

        if (stats.notEligible > 0) {
            console.warn(
                `[cron/vip-stipend] ${stats.notEligible} entitled account(s) were refused by award_diamonds_v2 ` +
                'as not_eligible. This route and the RPC are supposed to share one predicate ' +
                '(is_vip AND (vip_tier = lifetime OR vip_expires_at in future)); a persistent count ' +
                'means they have drifted apart. Reconcile them, do not loosen either.'
            );
        }

        return res.status(200).json({
            success: true,
            month: monthKey,
            stats,
            rejections: rejectionSamples,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[cron/vip-stipend] error:', err?.message || err);
        return res.status(500).json({ success: false, error: err?.message || 'Internal server error', stats });
    }
}

// cron telemetry (2026-08-14): cron_health_log had readers, a dashboard and a
// UNIQUE key — and no writer anywhere, ever. This wrapper is the supply side;
// it is fail-open and skips unauthorized (401/403) hits.
export default withCronHealth('vip-stipend', handler);
