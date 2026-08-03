/**
 * 📊 REWARDS PROGRESS — Diamond Rewards Standard v2 (READ-ONLY)
 * ═══════════════════════════════════════════════════════════════════════════
 * GET /api/rewards/progress
 *
 * Feeds the "today's progress" UI panel: how much of the daily/monthly diamond
 * allowance the caller has already burned, their true login streak, their
 * multiplier and their VIP status.
 *
 * RULES THIS FILE OBEYS
 *   • userId comes from the VERIFIED Bearer token, never from the query or body.
 *   • Service-role client — diamond_transactions is service-role-only.
 *   • Every window (day AND month) is anchored to America/Chicago, exactly like
 *     award_diamonds_v2 does with `AT TIME ZONE 'America/Chicago'`.
 *   • Caps and the cap-exempt action list are READ FROM src/config/diamondRewards.
 *     Nothing here is hardcoded.
 *   • NEVER 500s on a data problem. This panel must not be able to break the
 *     page, so a failed query degrades to zeros + `partial: true`.
 *
 * NOTE ON `earned*`: award_diamonds_v2 charges the ceiling only for actions whose
 * catalog row has counts_toward_daily_cap = true (it INNER JOINs the catalog).
 * We mirror that by summing ONLY the catalog actions with
 * countsTowardDailyCap === true — which also excludes referral_*, vip_stipend,
 * easter_egg and the lifetime one-time profile actions, and excludes ledger rows
 * that are not rewards at all (diamond purchases, transfers, admin grants).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    REWARDS,
    DAILY_CAP,
    MONTHLY_CAP,
    CATALOG_VERSION,
    REWARD_TIMEZONE,
} from '../../../src/config/diamondRewards';

// ── Service-role client — diamond_transactions is GRANTed to service_role only ──
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const TZ = REWARD_TIMEZONE || 'America/Chicago';
const LOGIN_ACTION = 'daily_login';

// ── Cap accounting sets, derived from the catalog (never hardcoded) ──────────
const catalogRows = Object.values(REWARDS || {}).filter((r) => r && r.key);
/** Actions that DO consume the daily/monthly ceiling. */
const CAP_COUNTED_ACTIONS = catalogRows
    .filter((r) => r.countsTowardDailyCap === true)
    .map((r) => r.key);
/** Actions explicitly exempted from the ceiling (referral_*, vip_stipend, lifetime…). */
const CAP_EXEMPT_ACTIONS = catalogRows
    .filter((r) => r.countsTowardDailyCap === false)
    .map((r) => r.key);

/* ─────────────────────────── Chicago time helpers ─────────────────────────── */

/** YYYY-MM-DD in America/Chicago — the anchor timezone for every diamond day. */
function chicagoDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
}

/** Milliseconds to add to a UTC instant to get the Chicago wall clock. */
function wallOffsetMs(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const p = {};
    for (const part of parts) if (part.type !== 'literal') p[part.type] = part.value;
    const asUtc = Date.UTC(
        Number(p.year), Number(p.month) - 1, Number(p.day),
        Number(p.hour) % 24, Number(p.minute), Number(p.second)
    );
    return asUtc - date.getTime();
}

/**
 * The exact UTC instant at which the given Chicago calendar day begins.
 * Two passes so DST transition days resolve to the real local midnight.
 */
function chicagoDayStart(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const naive = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0);
    let ts = naive - wallOffsetMs(new Date(naive));
    ts = naive - wallOffsetMs(new Date(ts));
    return new Date(ts);
}

/** First day of the calendar month AFTER the one containing ymd. */
function firstOfNextMonth(ymd) {
    const [y, m] = String(ymd).split('-').map(Number);
    const ny = m >= 12 ? y + 1 : y;
    const nm = m >= 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** Shift a YYYY-MM-DD calendar date by whole days (pure calendar math, DST-safe). */
function shiftDay(ymd, delta) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + delta * 86400000);
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/* ──────────────────────────────── VIP + caps ──────────────────────────────── */

/**
 * is_vip alone is NOT enough — expiry is enforced, exactly as award_diamonds_v2
 * does it. A lifetime tier stays VIP with a NULL expiry; anything else needs a
 * future vip_expires_at.
 */
function resolveIsVip(profile, now = new Date()) {
    if (!profile || profile.is_vip !== true) return false;
    if (profile.vip_tier === 'lifetime') return true;
    if (!profile.vip_expires_at) return false;
    const exp = new Date(profile.vip_expires_at);
    return Number.isFinite(exp.getTime()) && exp.getTime() > now.getTime();
}

/* ──────────────────────────────── Ledger reads ────────────────────────────── */

const PAGE_SIZE = 1000;
const MAX_PAGES = 6;   // 6k rows covers any month at the 4,500 💎 VIP ceiling

/**
 * Every cap-counting, positive-amount ledger row inside the current Chicago
 * month. The day window is a subset of the month window, so one read serves both.
 * Returns null on failure (caller degrades).
 */
async function loadCapCountingRows(supabase, userId, monthStart, monthEnd) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        let q = supabase
            .from('diamond_transactions')
            .select('amount, transaction_type, created_at')
            .eq('user_id', userId)
            .gt('amount', 0)
            .gte('created_at', monthStart.toISOString())
            .lt('created_at', monthEnd.toISOString())
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        // Prefer the inclusion set (mirrors the SQL INNER JOIN on the catalog).
        // Fall back to an exclusion filter only if the catalog somehow has no
        // cap-counting entries, so a config regression can't zero the panel out.
        if (CAP_COUNTED_ACTIONS.length > 0) {
            q = q.in('transaction_type', CAP_COUNTED_ACTIONS);
        } else if (CAP_EXEMPT_ACTIONS.length > 0) {
            q = q.not('transaction_type', 'in', `(${CAP_EXEMPT_ACTIONS.join(',')})`);
        }

        const { data, error } = await q;
        if (error) {
            console.warn('[RewardsProgress] Ledger read failed:', error.message || error);
            return null;
        }
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return rows;
}

/**
 * TRUE consecutive-day run of daily_login awards, anchored America/Chicago.
 * If today is already claimed the run ends today; otherwise the run ending
 * yesterday is still alive and is what the next claim will extend.
 * Returns null on failure (caller degrades).
 */
async function loadLoginStreak(supabase, userId, now) {
    const since = new Date(now.getTime() - 400 * 86400000).toISOString();
    const { data, error } = await supabase
        .from('diamond_transactions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('transaction_type', LOGIN_ACTION)
        .gt('amount', 0)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) {
        console.warn('[RewardsProgress] Streak read failed:', error.message || error);
        return null;
    }

    const days = new Set();
    for (const row of data || []) {
        if (row && row.created_at) days.add(chicagoDate(new Date(row.created_at)));
    }
    if (days.size === 0) return 0;

    const today = chicagoDate(now);
    let cursor = days.has(today) ? today : shiftDay(today, -1);
    if (!days.has(cursor)) return 0;   // streak broken — nothing yesterday either

    let streak = 0;
    while (days.has(cursor) && streak < 400) {
        streak++;
        cursor = shiftDay(cursor, -1);
    }
    return streak;
}

/* ──────────────────────────────── The handler ─────────────────────────────── */

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const supabase = getSupabase();

    // ── Auth: the user id ALWAYS comes from the verified token ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const authUser = authData?.user;
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = authUser.id;

    const now = new Date();
    const today = chicagoDate(now);
    const firstOfMonth = `${today.substring(0, 7)}-01`;

    const dayStart = chicagoDayStart(today);
    const dayEnd = chicagoDayStart(shiftDay(today, 1));
    const monthStart = chicagoDayStart(firstOfMonth);
    const monthEnd = chicagoDayStart(firstOfNextMonth(today));

    let partial = false;

    // ── Profile: VIP resolution + multiplier ──
    let profile = null;
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, is_vip, vip_tier, vip_expires_at, diamond_multiplier')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            console.warn('[RewardsProgress] Profile read failed:', error.message || error);
            partial = true;
        } else {
            profile = data || null;
        }
    } catch (profileErr) {
        console.warn('[RewardsProgress] Profile read threw:', profileErr?.message || profileErr);
        partial = true;
    }

    const isVip = resolveIsVip(profile, now);
    const dailyCap = Number((isVip ? DAILY_CAP?.vip : DAILY_CAP?.free) || 0);
    const monthlyCap = Number((isVip ? MONTHLY_CAP?.vip : MONTHLY_CAP?.free) || 0);

    let multiplier = Number(profile?.diamond_multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) multiplier = 1.0;

    // ── Ledger: earned today / earned this month ──
    let earnedToday = 0;
    let earnedThisMonth = 0;
    try {
        const rows = await loadCapCountingRows(supabase, userId, monthStart, monthEnd);
        if (rows === null) {
            partial = true;
        } else {
            const dayStartMs = dayStart.getTime();
            const dayEndMs = dayEnd.getTime();
            for (const row of rows) {
                const amount = Number(row?.amount);
                if (!Number.isFinite(amount) || amount <= 0) continue;
                earnedThisMonth += amount;
                const ts = row?.created_at ? new Date(row.created_at).getTime() : NaN;
                if (Number.isFinite(ts) && ts >= dayStartMs && ts < dayEndMs) earnedToday += amount;
            }
        }
    } catch (ledgerErr) {
        console.warn('[RewardsProgress] Ledger aggregation threw:', ledgerErr?.message || ledgerErr);
        partial = true;
        earnedToday = 0;
        earnedThisMonth = 0;
    }

    // ── Login streak ──
    let loginStreak = 0;
    try {
        const streak = await loadLoginStreak(supabase, userId, now);
        if (streak === null) partial = true;
        else loginStreak = streak;
    } catch (streakErr) {
        console.warn('[RewardsProgress] Streak threw:', streakErr?.message || streakErr);
        partial = true;
    }

    earnedToday = Math.max(0, Math.round(earnedToday));
    earnedThisMonth = Math.max(0, Math.round(earnedThisMonth));

    res.setHeader('Cache-Control', 'private, max-age=15');

    return res.status(200).json({
        success: true,
        earnedToday,
        dailyCap,
        dailyRemaining: Math.max(0, dailyCap - earnedToday),
        earnedThisMonth,
        monthlyCap,
        monthlyRemaining: Math.max(0, monthlyCap - earnedThisMonth),
        loginStreak,
        multiplier,
        isVip,
        catalogVersion: CATALOG_VERSION,
        partial,
        timezone: TZ,
        day: today,
        month: today.substring(0, 7)
    });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      console.warn('[API Error]', err);
      // This panel must never break the page — degrade instead of 500.
      if (!res.headersSent) {
          return res.status(200).json({
              success: true,
              partial: true,
              earnedToday: 0,
              dailyCap: Number(DAILY_CAP?.free || 0),
              dailyRemaining: Number(DAILY_CAP?.free || 0),
              earnedThisMonth: 0,
              monthlyCap: Number(MONTHLY_CAP?.free || 0),
              monthlyRemaining: Number(MONTHLY_CAP?.free || 0),
              loginStreak: 0,
              multiplier: 1.0,
              isVip: false,
              catalogVersion: CATALOG_VERSION,
              timezone: TZ
          });
      }
  }
}
