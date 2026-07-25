/**
 * /api/health/signup — Signup-Flow Health Check
 * ═══════════════════════════════════════════════════════════════════════════
 * Read-only endpoint backed by public.signup_health_view. Returns:
 *   - new_users in the last 15m / 1h / 24h
 *   - trigger errors in the last 1h / 24h
 *   - timestamp of the last successful signup
 *   - timestamp of the last trigger error
 *
 * STATUS DECISION
 * ═══════════════
 *   degraded → no new signups in the last 24h OR any trigger error in 1h
 *   warn     → no new signups in the last 1h
 *   ok       → at least 1 new signup in the last 1h, no trigger errors in 1h
 *
 * Background: between 2026-04-24 and 2026-05-03, ZERO real users signed up
 * because /auth/* paths were geo-blocked at the edge. The auth audit log
 * was empty so every dashboard returned green. This endpoint exists so a
 * cron-triggered probe — and any future status page — can detect that exact
 * class of silent failure within minutes instead of weeks.
 *
 * No CRON_SECRET required: this is a read-only public health probe (no PII
 * surfaced). Same posture as /api/health.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) {
            // Bail clearly — this endpoint is useless without service-role
            // (the view is service-role gated by design).
            return null;
        }
        _supabase = createClient(url, key, { auth: { persistSession: false } });
    }
    return _supabase;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const sb = getSupabase();
        if (!sb) {
            return res.status(500).json({
                status: 'unconfigured',
                error: 'SUPABASE_SERVICE_ROLE_KEY missing — health probe cannot read signup_health_view.',
            });
        }

        const start = Date.now();
        const { data, error } = await sb
            .from('signup_health_view')
            .select('*')
            .maybeSingle();

        if (error) {
            return res.status(500).json({
                status: 'degraded',
                error: 'health view query failed',
                detail: error.message,
                latency_ms: Date.now() - start,
            });
        }

        // ── Decide status from the row ─────────────────────────────────────
        const new24h = Number(data?.new_users_24h ?? 0);
        const new1h = Number(data?.new_users_1h ?? 0);
        const new15m = Number(data?.new_users_15m ?? 0);
        const errors1h = Number(data?.errors_1h ?? 0);
        const errors24h = Number(data?.errors_24h ?? 0);

        let status = 'ok';
        const reasons = [];
        if (new24h === 0) {
            status = 'degraded';
            reasons.push('no signups in 24h');
        } else if (new1h === 0) {
            status = 'warn';
            reasons.push('no signups in 1h');
        }
        if (errors1h > 0) {
            status = 'degraded';
            reasons.push(`${errors1h} trigger errors in 1h`);
        }

        // [2026-07-25] Status-code honesty: external uptime monitors key on
        // HTTP codes, not response bodies. Returning 200 while degraded is
        // how "zero signups for 9 days" stayed invisible. warn stays 200 so
        // low-traffic hours don't page anyone.
        return res.status(status === 'degraded' ? 503 : 200).json({
            status,
            reasons,
            counts: {
                new_users_15m: new15m,
                new_users_1h: new1h,
                new_users_24h: new24h,
                trigger_errors_1h: errors1h,
                trigger_errors_24h: errors24h,
            },
            timestamps: {
                last_signup_at: data?.last_signup_at || null,
                last_error_at: data?.last_error_at || null,
                checked_at: new Date().toISOString(),
            },
            latency_ms: Date.now() - start,
            version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || 'local',
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_) { /* ignore */ }
        return res.status(500).json({ status: 'error', error: err?.message || 'unknown' });
    }
}
