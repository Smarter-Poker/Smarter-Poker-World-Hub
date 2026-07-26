/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRON: /api/cron/vip-lapse
 *  Schedule: hourly  (e.g. "0 * * * *")
 *
 *  THE VIP EXPIRY REAPER.
 *
 *  Until Diamond Rewards Standard v2, NOTHING in this codebase ever expired a
 *  VIP subscription. `profiles.is_vip` was a sticky boolean: every 30-day
 *  signup trial, every 90-day phone-verification giveaway and every canceled
 *  Stripe subscription left the flag set to true forever. Those accounts kept
 *  the VIP diamond ceilings (150/day and 4,500/month instead of 110/3,300),
 *  the ad-free platform, unlimited training, and — once /api/cron/vip-stipend
 *  exists — a 500 💎 ($5) monthly stipend. In perpetuity, for $0.
 *
 *  This route is the scheduler-facing wrapper around
 *  public.expire_lapsed_vip() (migration 20260726120000, section H), which
 *  atomically clears is_vip / vip_tier for every row whose vip_expires_at has
 *  passed. Lifetime tiers are never lapsed.
 *
 *  The function is SECURITY DEFINER and GRANTed to service_role ONLY, so this
 *  route MUST hold SUPABASE_SERVICE_ROLE_KEY. There is deliberately no anon
 *  fallback — a silent fallback would 42501 forever and VIP would silently
 *  never expire again, which is precisely the bug we are fixing.
 *
 *  Auth: the repo's standard cron guard (validateCronAuth) —
 *        `x-cron-secret: <CRON_SECRET>`, `Authorization: Bearer <CRON_SECRET>`
 *        or `?secret=<CRON_SECRET>`.
 *
 *  Idempotent: re-running lapses nothing new (the WHERE clause no longer
 *  matches rows it already cleared), so it is safe to run as often as you like.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';

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

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    if (!validateCronAuth(req)) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const supabase = getSupabase();
    if (!supabase) {
        // Loud, not silent. expire_lapsed_vip is service_role-only; without the
        // key this job cannot work and must not pretend it did.
        console.error('[cron/vip-lapse] SUPABASE_SERVICE_ROLE_KEY is not configured — VIP expiry is NOT running.');
        return res.status(500).json({
            success: false,
            error: 'Service role key not configured',
        });
    }

    try {
        const { data, error } = await supabase.rpc('expire_lapsed_vip');

        if (error) {
            console.error('[cron/vip-lapse] expire_lapsed_vip failed:', error.message);
            return res.status(500).json({ success: false, error: error.message });
        }

        // expire_lapsed_vip() RETURNS integer — the number of rows lapsed.
        const lapsed = Number.isFinite(Number(data)) ? Number(data) : 0;

        if (lapsed > 0) {
            console.warn(`[cron/vip-lapse] Lapsed ${lapsed} expired VIP profile(s).`);
        }

        return res.status(200).json({
            success: true,
            lapsed,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[cron/vip-lapse] error:', err?.message || err);
        return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
}
