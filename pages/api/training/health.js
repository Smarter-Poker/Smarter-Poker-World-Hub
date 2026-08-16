/**
 * GET /api/training/health
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Health check endpoint — pings Supabase and returns system status.
 * No auth required. Rate-limited.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { isLegacyJwtKey, isModernKey } from '../../../src/lib/supabaseKeys';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
    try {
      withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        if (req.method !== 'GET') {
            return res.status(405).json({ status: 'error', error: 'Method not allowed' });
        }

        // Prevent caching — health checks must be live
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

        const start = Date.now();
        const checks = {};

        // 1. Supabase connectivity check (lightweight query)
        try {
            const { error } = await getSupabase()
                .from('training_progress')
                .select('id')
                .limit(1);

            checks.supabase = error ? 'degraded' : 'ok';
            // `code` is empty for auth/key rejections, so this reported the
            // literal string "unknown" while error.message held the actual
            // cause -- during the 2026-08-16 outage it said `supabaseError:
            // "unknown"` when the server was being told "Legacy API keys are
            // disabled". Carry the message too; it is the difference between a
            // five-second diagnosis and an hour of guessing. Bounded so a
            // health endpoint can never become an information leak.
            if (error) {
                checks.supabaseError = error.code || 'unknown';
                if (error.message) checks.supabaseMessage = String(error.message).slice(0, 160);
            }
        } catch (err) {
            checks.supabase = 'down';
            if (err && err.message) checks.supabaseMessage = String(err.message).slice(0, 160);
        }

        // 2. Environment check
        //
        // `!!key` only ever proved a variable was SET, which is exactly what
        // was true and useless during the outage: serviceKey read `true` while
        // every request using it was rejected. Report the key FORMAT as well --
        // a legacy JWT is known-disabled on this project, so "set" and
        // "usable" are different questions. Formats only; no key material.
        const _svc = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        const _anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        const keyFormat = (k) => (!k ? 'missing' : isLegacyJwtKey(k) ? 'legacy-jwt' : isModernKey(k) ? 'modern' : 'other');
        checks.env = {
            supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            serviceKey: !!_svc,
            serviceKeyFormat: keyFormat(_svc),
            anonKeyFormat: keyFormat(_anon),
        };

        const latencyMs = Date.now() - start;
        const overallStatus = checks.supabase === 'ok' ? 'ok' : 'degraded';

        return res.status(overallStatus === 'ok' ? 200 : 503).json({
            status: overallStatus,
            latencyMs,
            checks,
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Health] Error:', err);
        if (!res.headersSent) return res.status(500).json({
            status: 'error',
            latencyMs: 0,
            timestamp: new Date().toISOString(),
        });
    }
}
