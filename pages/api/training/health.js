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
            if (error) checks.supabaseError = error.code || 'unknown';
        } catch (err) {
            checks.supabase = 'down';
        }

        // 2. Environment check
        checks.env = {
            supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
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
