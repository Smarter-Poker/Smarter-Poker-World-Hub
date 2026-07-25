/**
 * /api/admin/auth-health-data — Data backend for the auth/signup dashboards
 * ═══════════════════════════════════════════════════════════════════════════
 * [2026-07-25] Why this exists: /admin/auth-health and /admin/signup-health
 * used to gate + fetch inside getServerSideProps by reading an
 * `Authorization: Bearer` HEADER — but browsers never attach Bearer headers
 * to document navigations, so every real admin was bounced into an infinite
 * login→redirect loop and the dashboards were unreachable except via curl.
 * The pages are now client-rendered shells that call THIS endpoint with the
 * token from localStorage.
 *
 * Auth (either):
 *   - x-admin-secret header matching ADMIN_ROUTE_SECRET (curl / scripts)
 *   - Bearer token whose user has profiles.is_admin = true
 *
 * GET ?view=auth   → { health: auth_health_view row, heartbeats[40] }
 * GET ?view=signup → { health: signup_health_view row, heartbeats[20], errors[50] }
 *
 * Note: middleware.ts already requires a Bearer header on /api/admin/* GETs
 * (unless x-admin-secret) — this handler does the full verification.
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!url || !anonKey || !srKey) {
            return res.status(500).json({ error: 'Server misconfigured (missing Supabase env)' });
        }

        // ── Gate ───────────────────────────────────────────────────────────
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
            const adm = createClient(url, srKey, { auth: { persistSession: false } });
            const { data: profile } = await adm
                .from('profiles')
                .select('is_admin')
                .eq('id', userData.user.id)
                .maybeSingle();
            if (profile?.is_admin !== true) {
                return res.status(403).json({ error: 'Forbidden — admin only' });
            }
        }

        // ── Data ───────────────────────────────────────────────────────────
        const adm = createClient(url, srKey, { auth: { persistSession: false } });
        const view = req.query.view === 'signup' ? 'signup' : 'auth';

        if (view === 'signup') {
            const [healthRes, heartbeatsRes, errorsRes] = await Promise.all([
                adm.from('signup_health_view').select('*').maybeSingle(),
                adm.from('probe_heartbeats').select('id, probe_name, status, duration_ms, occurred_at').order('occurred_at', { ascending: false }).limit(20),
                adm.from('signup_errors').select('id, email, trigger_name, error_code, error_msg, occurred_at, forwarded_to_sentry').order('occurred_at', { ascending: false }).limit(50),
            ]);
            return res.status(200).json({
                health: healthRes.data || null,
                heartbeats: heartbeatsRes.data || [],
                errors: errorsRes.data || [],
                error: healthRes.error?.message || null,
                generatedAt: new Date().toISOString(),
            });
        }

        const [healthRes, heartbeatsRes] = await Promise.all([
            adm.from('auth_health_view').select('*').maybeSingle(),
            adm.from('probe_heartbeats').select('id, probe_name, status, duration_ms, occurred_at').order('occurred_at', { ascending: false }).limit(40),
        ]);
        return res.status(200).json({
            health: healthRes.data || null,
            heartbeats: heartbeatsRes.data || [],
            error: healthRes.error?.message || null,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[auth-health-data] error:', err);
        if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
    }
}
