import { createClient } from '@supabase/supabase-js';

/**
 * /api/health — Production Health Check Endpoint
 * 
 * Returns system health status including:
 * - Database connectivity
 * - Server timestamp
 * - Git commit SHA (from Vercel env)
 * - Process uptime
 * 
 * Referenced by build-safety-gate.yml post-deploy verification.
 */
export default async function handler(req, res) {
    const start = Date.now();

    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || 'local',
        uptime: Math.floor(process.uptime()),
        checks: {},
    };

    // ── Database Connectivity Check ──
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            health.checks.db = { status: 'skip', reason: 'Missing env vars' };
        } else {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') {
                health.checks.db = { status: 'error', message: error.message };
                health.status = 'degraded';
            } else {
                health.checks.db = { status: 'ok', latencyMs: Date.now() - start };
            }
        }
    } catch (e) {
        health.checks.db = { status: 'error', message: e.message };
        health.status = 'degraded';
    }

    // ── Memory Usage ──
    const mem = process.memoryUsage();
    health.checks.memory = {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
    };

    // ── Response ──
    health.responseMs = Date.now() - start;

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
}
