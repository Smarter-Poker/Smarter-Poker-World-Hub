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
 *  ─── WHO GETS PAID (and why the profiles flag is NOT enough) ──────────────
 *  `profiles.is_vip` / `profiles.vip_tier` CANNOT be trusted as proof of
 *  payment:
 *    • the 30-day signup trial writes vip_tier = 'monthly' with no payment at
 *      all (supabase/migrations/20260330120000_vip_paywall_30day_trial.sql),
 *    • /api/sms/verify-otp grants a free VIP window for verifying a phone,
 *    • before the v2 migration, users could self-set is_vip / vip_tier
 *      directly through PostgREST.
 *  award_diamonds_v2's own vip_stipend guard only checks those profile
 *  columns, so it accepts trial VIPs. It is a floor, not the control.
 *
 *  THE CONTROL LIVES HERE: we pay only users who have a row in
 *  vip_subscriptions that
 *    • has a non-null stripe_subscription_id (a real Stripe object — this is
 *      what excludes every trial and every hand-granted / self-granted VIP),
 *    • has status 'active' or 'trialing' (Stripe's own view of the sub), and
 *    • has current_period_end in the future (or null for 'active', which
 *      Stripe backfills — see PERIOD_GRACE below).
 *  Without the stripe_subscription_id requirement this endpoint becomes the
 *  best farm on the platform: sign up → free trial VIP → collect $5/month
 *  forever, on as many accounts as you can make.
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
const PAGE_SIZE          = 500;   // rows pulled from vip_subscriptions per query
const AWARD_CHUNK        = 10;    // concurrent award_diamonds_v2 calls
const MAX_AWARDS_PER_RUN = 5000;  // hard ceiling — 5,000 x 500 💎 = $25,000 max
const MAX_PAGES          = 40;    // 40 x 500 = 20,000 subscription rows scanned

/* Statuses Stripe considers a live, billable subscription. 'past_due' and
   'unpaid' are deliberately excluded — we do not pay a stipend to someone
   whose card is failing. */
const PAYING_STATUSES = ['active', 'trialing'];

/* Grace on current_period_end. Stripe advances the period at renewal; a
   webhook that lands minutes late should not cost a paying member their
   stipend. It is not a licence to pay lapsed subs — 2 days, no more. */
const PERIOD_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

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
        console.error('[cron/vip-stipend] SUPABASE_SERVICE_ROLE_KEY is not configured — stipend NOT running.');
        return res.status(500).json({ success: false, error: 'Service role key not configured' });
    }

    const dryRun   = req.query?.dry === '1';
    const monthKey = chicagoMonthKey();

    const parsedLimit = parseInt(req.query?.limit, 10);
    const maxAwards   = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_AWARDS_PER_RUN)
        : MAX_AWARDS_PER_RUN;

    const periodFloorISO = new Date(Date.now() - PERIOD_GRACE_MS).toISOString();

    const stats = {
        scanned:        0,   // vip_subscriptions rows examined
        eligible:       0,   // distinct users that passed the paid-subscription test
        awarded:        0,   // stipends actually paid this run
        diamonds:       0,   // total diamonds paid this run
        alreadyPaid:    0,   // duplicate / action_limit — already had it this month
        notEligible:    0,   // rejected by award_diamonds_v2's own VIP check
        capped:         0,   // budget_exhausted / monthly_cap
        failed:         0,   // RPC errors
        truncated:      false,
    };

    /* Reasons worth a human's attention, keyed by reason string. */
    const rejectionSamples = {};

    try {
        // ═══════════════════════════════════════════════════════════════════
        // STEP 1 — resolve the PAYING subscriber set from vip_subscriptions.
        // This is the eligibility gate. profiles is never consulted here.
        // ═══════════════════════════════════════════════════════════════════
        const eligibleUserIds = new Set();

        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE;
            const to   = from + PAGE_SIZE - 1;

            const { data: rows, error: fetchError } = await supabase
                .from('vip_subscriptions')
                .select('user_id, stripe_subscription_id, status, tier, current_period_end')
                .in('status', PAYING_STATUSES)
                .not('stripe_subscription_id', 'is', null)
                .order('created_at', { ascending: true })
                .range(from, to);

            if (fetchError) {
                console.error('[cron/vip-stipend] vip_subscriptions fetch failed:', fetchError.message);
                return res.status(500).json({ success: false, error: fetchError.message, stats });
            }

            if (!rows || rows.length === 0) break;

            stats.scanned += rows.length;

            for (const row of rows) {
                if (!row.user_id) continue;

                // Unexpired period. A null current_period_end is tolerated only
                // because some legacy rows predate the webhook writing it; the
                // non-null stripe_subscription_id + Stripe status still prove
                // this is a real paid subscription.
                if (row.current_period_end && row.current_period_end < periodFloorISO) continue;

                eligibleUserIds.add(row.user_id);
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
                        console.warn('[cron/vip-stipend] award failed for', r.userId, '—', r.error.message);
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
                    // The user pays Stripe but profiles.is_vip / vip_tier /
                    // vip_expires_at do not reflect it — award_diamonds_v2
                    // refuses. See FOLLOW-UP F2: the Stripe webhook must write
                    // vip_tier + vip_expires_at from the Stripe period.
                    stats.notEligible += 1;
                } else {
                    stats.capped += 1;
                }
            }
        }

        if (stats.notEligible > 0) {
            console.warn(
                `[cron/vip-stipend] ${stats.notEligible} PAYING subscriber(s) were refused by award_diamonds_v2 ` +
                'as not_eligible — their profiles row is missing is_vip / vip_tier / vip_expires_at. ' +
                'Fix pages/api/store/webhooks/stripe.js (follow-up F2) and backfill from vip_subscriptions.'
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
