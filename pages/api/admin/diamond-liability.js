/**
 * GET /api/admin/diamond-liability — Diamond economy liability view
 * ═══════════════════════════════════════════════════════════════════════════
 * Nothing else on the platform answers the only question that matters about
 * the reward economy: WHAT DOES IT COST? 1 diamond = $0.01 of real money
 * (see src/config/diamondRewards.js), so every outstanding balance is a
 * dollar-denominated liability sitting on the books.
 *
 * Auth — identical posture to /api/admin/auth-health-data:
 *   - x-admin-secret header matching ADMIN_ROUTE_SECRET (curl / scripts), OR
 *   - Bearer token whose user has profiles.is_admin = true
 * The data client is ALWAYS service-role. This endpoint must never be
 * reachable by a normal user: it exposes per-user earning totals.
 *
 * Response (200):
 *   {
 *     generatedAt, period,
 *     outstanding:   { diamonds, usd, users, truncated },
 *     flow:          { issued24h, issued30d, redeemed24h, redeemed30d,
 *                      netFlow24h, netFlow30d, ...Usd variants },
 *     recirculation: { recirculated, leaked, transfers, clawbacks,
 *                      unclassified, byType[] },
 *     budget:        { period, budgetDiamonds, spentDiamonds, percentUsed } | null,
 *     topEarners:    [{ userId, username, diamonds, usd, monthlyCap, overCap }],
 *     notes:         [ ... ]
 *   }
 *
 * NOTE ON THE UNAPPLIED MIGRATION
 *   supabase/migrations/20260726120000_diamond_rewards_v2_security_and_caps.sql
 *   creates public.diamond_platform_budget. Until that migration is applied the
 *   table does not exist. This endpoint treats that as EXPECTED: it returns
 *   budget: null plus an explanatory note and still serves every other number.
 *   It must never 500 just because the budget table is missing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    MONTHLY_CAP,
    PLATFORM_MONTHLY_BUDGET,
    REWARD_TIMEZONE,
} from '../../../src/config/diamondRewards';

// 1 diamond = $0.01. Never re-type this ratio anywhere else in this file.
const USD_PER_DIAMOND = 0.01;
const toUsd = (diamonds) => Math.round((Number(diamonds) || 0) * USD_PER_DIAMOND * 100) / 100;

// Paging guards. These reads are unbounded by nature (whole ledger / whole user
// table), so they are paged and hard-capped. Hitting a cap sets a `truncated`
// flag rather than silently under-reporting.
const PAGE_SIZE = 1000;
const MAX_PROFILE_ROWS = 250000;
const MAX_LEDGER_ROWS = 250000;

// ───────────────────────────────────────────────────────────────────────────
// REDEMPTION CLASSIFICATION
// ───────────────────────────────────────────────────────────────────────────
// Derived from the transaction_type / p_type strings actually written to
// public.diamond_transactions today:
//
//   pages/api/trivia/tournament-enter.js   → 'tournament_entry'
//   pages/api/training/tournaments.js      → 'arcade_entry'
//   pages/api/store/purchase-with-diamonds → 'purchase' (negative = merch)
//   pages/api/store/purchase-daily-vip.js  → 'vip_daily'
//   pages/api/store/diamond-transfer.js    → 'diamond_gift_sent' / '_received'
//   pages/api/live/gift.js                 → 'live_gift_sent' / '_received'
//   pages/api/store/webhooks/stripe.js     → 'refund' (negative = clawback)
//
// RECIRCULATED = spend that comes back to the platform as gameplay (entry fees
//   funding prize pools that are themselves paid in diamonds). Liability moves,
//   it does not leave.
// LEAKED = value that genuinely exits the diamond economy — merchandise we ship
//   and VIP time we hand over. This is the number that costs real money.
// TRANSFER = peer-to-peer. Net-zero platform-wide (the matching *_received row
//   is a positive amount), so it is neither issuance nor redemption.
// CLAWBACK = negative corrections/refunds that REDUCE liability. Not a
//   redemption; counting it as one would overstate what users actually spent.
//
// Anything not listed here lands in `unclassified` and is reported by name.
// Do not guess a bucket for a new type — add it here deliberately.
const RECIRCULATING_TYPES = new Set([
    'tournament_entry',
    'arcade_entry',
]);

const LEAKING_TYPES = new Set([
    'purchase',   // negative 'purchase' = merchandise bought with diamonds
    'vip_daily',  // diamond-funded VIP day pass
]);

const TRANSFER_TYPES = new Set([
    'diamond_gift_sent',
    'live_gift_sent',
]);

const CLAWBACK_TYPES = new Set([
    'refund',
    'referral_bonus_reversal',
    'diamond_gift_refund',
    'live_gift_refund',
    'tournament_entry_refund',
    'arcade_entry_refund',
]);

function classifyOutflow(type) {
    const t = type || 'unknown';
    if (RECIRCULATING_TYPES.has(t)) return 'recirculated';
    if (LEAKING_TYPES.has(t)) return 'leaked';
    if (TRANSFER_TYPES.has(t)) return 'transfers';
    if (CLAWBACK_TYPES.has(t)) return 'clawbacks';
    return 'unclassified';
}

/** 'YYYY-MM' in the reward timezone — matches diamond_platform_budget.period. */
function currentPeriod() {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: REWARD_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
        }).formatToParts(new Date());
        const y = parts.find((p) => p.type === 'year')?.value;
        const m = parts.find((p) => p.type === 'month')?.value;
        if (y && m) return `${y}-${m}`;
    } catch (_e) { /* fall through */ }
    return new Date().toISOString().slice(0, 7);
}

/**
 * Page through a table. Returns { rows, truncated, error }.
 * Never throws — a failed page stops the walk and reports what it has.
 */
async function pageAll(buildQuery, maxRows) {
    const rows = [];
    let from = 0;
    let truncated = false;
    for (;;) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await buildQuery().range(from, to);
        if (error) return { rows, truncated, error };
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        if (rows.length >= maxRows) { truncated = true; break; }
        from += PAGE_SIZE;
    }
    return { rows, truncated, error: null };
}

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!url || !anonKey || !srKey) {
            return res.status(500).json({ error: 'Server misconfigured (missing Supabase env)' });
        }

        // ── Gate — same pattern as /api/admin/auth-health-data ─────────────
        const envSecret = process.env.ADMIN_ROUTE_SECRET;
        const hasAdminSecret = !!envSecret && req.headers['x-admin-secret'] === envSecret;

        if (!hasAdminSecret) {
            const auth = req.headers.authorization;
            if (!auth?.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Auth token required' });
            }
            const sb = createClient(url, anonKey, { auth: { persistSession: false } });
            const { data: userData, error: uErr } = await sb.auth.getUser(auth.slice(7));
            if (uErr || !userData?.user) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
            const gate = createClient(url, srKey, { auth: { persistSession: false } });
            const { data: profile } = await gate
                .from('profiles')
                .select('is_admin')
                .eq('id', userData.user.id)
                .maybeSingle();
            if (profile?.is_admin !== true) {
                return res.status(403).json({ error: 'Forbidden — admin only' });
            }
        }

        // ── Data (always service-role) ─────────────────────────────────────
        const adm = createClient(url, srKey, { auth: { persistSession: false } });
        const notes = [];

        const now = Date.now();
        const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
        const cutoff24hMs = now - 24 * 60 * 60 * 1000;

        // 1. OUTSTANDING LIABILITY — every diamond that exists right now.
        const profilesPage = await pageAll(
            () => adm.from('profiles').select('id, diamonds').order('id', { ascending: true }),
            MAX_PROFILE_ROWS
        );
        if (profilesPage.error) {
            return res.status(500).json({ error: `Failed to read profiles: ${profilesPage.error.message}` });
        }
        if (profilesPage.truncated) {
            notes.push(`Outstanding balance scan stopped at ${MAX_PROFILE_ROWS.toLocaleString('en-US')} profiles — the figure is a floor, not a total.`);
        }
        let outstandingDiamonds = 0;
        for (const p of profilesPage.rows) outstandingDiamonds += Number(p.diamonds) || 0;

        // 2. LEDGER — one 30d scan; the 24h window is derived from it.
        const ledgerPage = await pageAll(
            () => adm
                .from('diamond_transactions')
                .select('user_id, amount, transaction_type, created_at')
                .gte('created_at', since30d)
                .order('created_at', { ascending: false }),
            MAX_LEDGER_ROWS
        );
        if (ledgerPage.error) {
            return res.status(500).json({ error: `Failed to read diamond_transactions: ${ledgerPage.error.message}` });
        }
        if (ledgerPage.truncated) {
            notes.push(`Ledger scan stopped at ${MAX_LEDGER_ROWS.toLocaleString('en-US')} rows (newest first) — 30d figures are a floor.`);
        }

        let issued24h = 0, issued30d = 0, redeemed24h = 0, redeemed30d = 0;
        const buckets = { recirculated: 0, leaked: 0, transfers: 0, clawbacks: 0, unclassified: 0 };
        const byType = new Map();       // outflow type → { type, bucket, diamonds }
        const unclassifiedTypes = new Set();
        const earnedByUser = new Map(); // user_id → diamonds earned in 30d

        for (const t of ledgerPage.rows) {
            const amount = Number(t.amount) || 0;
            if (amount === 0) continue;
            const inLast24h = new Date(t.created_at).getTime() >= cutoff24hMs;

            if (amount > 0) {
                issued30d += amount;
                if (inLast24h) issued24h += amount;
                if (t.user_id) earnedByUser.set(t.user_id, (earnedByUser.get(t.user_id) || 0) + amount);
                continue;
            }

            const spent = Math.abs(amount);
            redeemed30d += spent;
            if (inLast24h) redeemed24h += spent;

            const type = t.transaction_type || 'unknown';
            const bucket = classifyOutflow(type);
            buckets[bucket] += spent;
            if (bucket === 'unclassified') unclassifiedTypes.add(type);
            const prev = byType.get(type) || { type, bucket, diamonds: 0 };
            prev.diamonds += spent;
            byType.set(type, prev);
        }

        if (unclassifiedTypes.size > 0) {
            notes.push(`Unclassified outflow transaction_type(s): ${[...unclassifiedTypes].sort().join(', ')}. Add them to RECIRCULATING_TYPES / LEAKING_TYPES / TRANSFER_TYPES / CLAWBACK_TYPES in this file rather than leaving them guessed.`);
        }

        // 3. PLATFORM BUDGET — missing table is expected pre-migration.
        const period = currentPeriod();
        let budget = null;
        {
            const { data: budgetRow, error: budgetErr } = await adm
                .from('diamond_platform_budget')
                .select('period, budget_diamonds, spent_diamonds, updated_at')
                .eq('period', period)
                .maybeSingle();

            if (budgetErr) {
                // 42P01 = undefined_table, PGRST205 = schema cache miss. Both mean
                // 20260726120000_diamond_rewards_v2_security_and_caps.sql is unapplied.
                if (budgetErr.code === '42P01' || budgetErr.code === 'PGRST205' || /does not exist/i.test(budgetErr.message || '')) {
                    notes.push('diamond_platform_budget does not exist — migration 20260726120000_diamond_rewards_v2_security_and_caps.sql has not been applied. The platform-wide circuit breaker is NOT armed.');
                } else {
                    notes.push(`Budget lookup failed: ${budgetErr.message}`);
                }
            } else if (!budgetRow) {
                notes.push(`No diamond_platform_budget row for period ${period} yet — it is created lazily by the first award of the month.`);
            } else {
                const budgetDiamonds = Number(budgetRow.budget_diamonds) || 0;
                const spentDiamonds = Number(budgetRow.spent_diamonds) || 0;
                budget = {
                    period: budgetRow.period,
                    budgetDiamonds,
                    budgetUsd: toUsd(budgetDiamonds),
                    spentDiamonds,
                    spentUsd: toUsd(spentDiamonds),
                    remainingDiamonds: Math.max(budgetDiamonds - spentDiamonds, 0),
                    remainingUsd: toUsd(Math.max(budgetDiamonds - spentDiamonds, 0)),
                    percentUsed: budgetDiamonds > 0
                        ? Math.round((spentDiamonds / budgetDiamonds) * 1000) / 10
                        : null,
                    updatedAt: budgetRow.updated_at || null,
                };
            }
        }

        // 4. TOP EARNERS (30d) — abuse-detection surface.
        const topPairs = [...earnedByUser.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let topEarners = [];
        if (topPairs.length > 0) {
            const ids = topPairs.map(([id]) => id);
            const { data: earnerProfiles, error: earnerErr } = await adm
                .from('profiles')
                .select('id, username, is_vip, diamonds')
                .in('id', ids);
            if (earnerErr) {
                notes.push(`Could not join usernames onto top earners: ${earnerErr.message}`);
            }
            const byId = new Map((earnerProfiles || []).map((p) => [p.id, p]));
            topEarners = topPairs.map(([userId, diamonds]) => {
                const p = byId.get(userId) || null;
                const isVip = p?.is_vip === true;
                const monthlyCap = isVip ? MONTHLY_CAP.vip : MONTHLY_CAP.free;
                return {
                    userId,
                    username: p?.username || null,
                    isVip,
                    diamonds,
                    usd: toUsd(diamonds),
                    balance: p ? (Number(p.diamonds) || 0) : null,
                    balanceUsd: p ? toUsd(p.diamonds) : null,
                    monthlyCap,
                    overCap: diamonds > monthlyCap,
                    overCapBy: diamonds > monthlyCap ? diamonds - monthlyCap : 0,
                };
            });
            if (topEarners.some((e) => e.overCap)) {
                notes.push('One or more top earners exceeded the per-user monthly cap over the trailing 30 days. The cap is a CALENDAR-month ceiling and this window is rolling, so a small overage can be legitimate month-boundary spill — a large one cannot.');
            }
        }

        return res.status(200).json({
            generatedAt: new Date().toISOString(),
            period,
            timezone: REWARD_TIMEZONE,
            usdPerDiamond: USD_PER_DIAMOND,
            outstanding: {
                diamonds: outstandingDiamonds,
                usd: toUsd(outstandingDiamonds),
                users: profilesPage.rows.length,
                truncated: profilesPage.truncated,
            },
            flow: {
                issued24h, issued24hUsd: toUsd(issued24h),
                issued30d, issued30dUsd: toUsd(issued30d),
                redeemed24h, redeemed24hUsd: toUsd(redeemed24h),
                redeemed30d, redeemed30dUsd: toUsd(redeemed30d),
                netFlow24h: issued24h - redeemed24h,
                netFlow24hUsd: toUsd(issued24h - redeemed24h),
                netFlow30d: issued30d - redeemed30d,
                netFlow30dUsd: toUsd(issued30d - redeemed30d),
                ledgerRows: ledgerPage.rows.length,
                truncated: ledgerPage.truncated,
            },
            recirculation: {
                windowDays: 30,
                recirculated: buckets.recirculated,
                recirculatedUsd: toUsd(buckets.recirculated),
                leaked: buckets.leaked,
                leakedUsd: toUsd(buckets.leaked),
                transfers: buckets.transfers,
                transfersUsd: toUsd(buckets.transfers),
                clawbacks: buckets.clawbacks,
                clawbacksUsd: toUsd(buckets.clawbacks),
                unclassified: buckets.unclassified,
                unclassifiedUsd: toUsd(buckets.unclassified),
                unclassifiedTypes: [...unclassifiedTypes].sort(),
                byType: [...byType.values()]
                    .sort((a, b) => b.diamonds - a.diamonds)
                    .map((r) => ({ ...r, usd: toUsd(r.diamonds) })),
            },
            budget,
            platformMonthlyBudgetConfig: {
                diamonds: PLATFORM_MONTHLY_BUDGET,
                usd: toUsd(PLATFORM_MONTHLY_BUDGET),
            },
            monthlyCap: MONTHLY_CAP,
            topEarners,
            notes,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* never mask the original error */ }
        console.warn('[diamond-liability] error:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ error: err?.message || 'Internal server error' });
        }
    }
}
