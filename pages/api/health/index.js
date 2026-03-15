import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}


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
  try {
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
          
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

          if (!supabaseUrl || !supabaseKey) {
              health.checks.db = { status: 'skip', reason: 'Missing env vars' };
          } else {
              
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

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
