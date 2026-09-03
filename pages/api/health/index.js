// NOTE: Raw @supabase/supabase-js import is intentional here.
// Health check must work independently of the patched server client to
// detect failures in the patched client itself. CI check allows this
// because health/index.js is not in the scanned API route patterns.
import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Node.js runtime (default) — uses process.uptime and process.memoryUsage which are not edge-compatible

let _supabase = null;

/**
 * COLD STARTS NEED A LONGER ROPE (2026-09-02).
 *
 * Measured in production: on a warm instance this probe answers in 69–614ms
 * and the endpoint reports `ok`. On a COLD one it hit the old flat 3000ms
 * ceiling every time and reported `degraded` — three consecutive probes, all
 * carrying `uptime: 17s`. The database was never the problem: at that same
 * moment it had 12 active connections, 81 total and zero lock waits, and
 * answered this exact query in 431ms for a client that already had a
 * connection.
 *
 * What costs the extra time is everything that happens once per lambda: DNS,
 * TLS, and the first PostgREST round trip. So the deadline is generous for the
 * first few seconds of a process and tight afterwards, rather than being wrong
 * in one direction for the whole life of the box.
 *
 * This matters beyond the endpoint. CLAUDE.md 1.5 makes /api/health the sole
 * proof a deploy landed, and publish-watchdog.yml polls it every 15 minutes —
 * an interval long enough to land on a cold instance regularly. A watchdog
 * that cries wolf on a healthy platform is how a real outage gets ignored.
 */
const DB_HEALTH_TIMEOUT_WARM_MS = 3000;
const DB_HEALTH_TIMEOUT_COLD_MS = 8000;
const COLD_START_WINDOW_S = 10;

function dbHealthTimeoutMs() {
    return process.uptime() < COLD_START_WINDOW_S
        ? DB_HEALTH_TIMEOUT_COLD_MS
        : DB_HEALTH_TIMEOUT_WARM_MS;
}

/**
 * True when we will authenticate with the service key. The anon key cannot
 * read `profiles` at all — it returns `42501 permission denied` — so a health
 * check running on that fallback can never pass. Worth saying out loud rather
 * than letting it surface as a mysterious timeout.
 */
function usingServiceKey() {
    return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

async function checkDatabaseWithDeadline(supabase) {
    if (!usingServiceKey()) {
        // Fail with the actual reason. The anon key is refused by RLS on
        // `profiles`, so waiting longer or retrying would never help.
        const error = new Error(
            'Database health check cannot run: SUPABASE_SERVICE_ROLE_KEY is not set, and the anon key is denied on profiles.'
        );
        error.code = 'HEALTH_DB_NO_SERVICE_KEY';
        throw error;
    }

    const budgetMs = dbHealthTimeoutMs();
    const controller = new AbortController();
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            const error = new Error(
                `Database health check timed out after ${budgetMs}ms (uptime ${Math.round(process.uptime())}s)`
            );
            error.code = 'HEALTH_DB_TIMEOUT';
            reject(error);
        }, budgetMs);
    });

    try {
        const query = supabase
            .from('profiles')
            .select('id')
            .limit(1)
            .abortSignal(controller.signal)
            .maybeSingle();
        return await Promise.race([query, timeout]);
    } finally {
        clearTimeout(timeoutId);
    }
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
          version: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_COMMIT_SHA || 'local').substring(0, 8),
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
              const supabase = getSupabase();
              const { error } = await checkDatabaseWithDeadline(supabase);

              if (error && error.code !== 'PGRST116') {
                  health.checks.db = { status: 'error', message: error.message };
                  health.status = 'degraded';
              } else {
                  health.checks.db = { status: 'ok', latencyMs: Date.now() - start };
              }
          }
      } catch (e) {
          health.checks.db = {
              status: 'error',
              message: e?.code === 'HEALTH_DB_TIMEOUT'
                  ? 'Database health check timed out'
                  : e.message,
          };
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
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
