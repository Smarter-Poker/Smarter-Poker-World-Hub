/**
 * Health Check API - System status for all services
 *
 * GET /api/admin/health
 *   Returns status of all configured services + live probes for:
 *     - db (Supabase SELECT 1)
 *     - realtime (Supabase Realtime WebSocket reachability, best-effort HEAD)
 *     - engineReachable (GET engine.smarter.poker/health with 2s timeout)
 *
 * Per master plan §8.1.4. The public counterpart at /api/health keeps
 * the same contract but without these live probes (public endpoint must
 * stay cheap enough to scrape every 15s without loading Supabase).
 */
import { createClient } from '@supabase/supabase-js';
import { isTwilioConfigured } from '../../../src/lib/commander/twilio';
import { getOneSignalStatus } from '../../../src/lib/commander/pushNotifications';
import { getEmailStatus } from '../../../src/lib/emailTemplates';
import { getSentryStatus } from '../../../src/lib/sentry';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ─── Phase 5.1.4 live-probe helpers ────────────────────────────────────────
// Keep probes short-timeout and swallow-on-error: a failing probe should
// degrade the response to `status: degraded` with a per-probe reason, not
// 500 the whole endpoint.

async function probeDb() {
    const start = Date.now();
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return { status: 'skip', reason: 'no creds' };
        const sb = createClient(url, key, { auth: { persistSession: false } });
        const { error } = await sb.from('profiles').select('id').limit(1).maybeSingle();
        if (error && error.code !== 'PGRST116') {
            return { status: 'error', message: error.message, latencyMs: Date.now() - start };
        }
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (e) {
        return { status: 'error', message: e?.message || 'db probe failed', latencyMs: Date.now() - start };
    }
}

async function probeRealtime() {
    // We can't open a WS from a serverless handler cheaply, but the
    // Realtime HTTP endpoint returns a 200 on GET /realtime/v1/ when the
    // service is up. AbortController caps the probe at 1.5s so a stuck
    // realtime service can't stall the health endpoint.
    const start = Date.now();
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!url) return { status: 'skip', reason: 'no url' };
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const r = await fetch(`${url}/realtime/v1/`, { method: 'GET', signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok || r.status === 404) { // 404 = endpoint exists, wrong path — still reachable
            return { status: 'ok', latencyMs: Date.now() - start, httpStatus: r.status };
        }
        return { status: 'degraded', httpStatus: r.status, latencyMs: Date.now() - start };
    } catch (e) {
        return { status: 'error', message: e?.name === 'AbortError' ? 'timeout' : e?.message, latencyMs: Date.now() - start };
    }
}

async function probeEngine() {
    const start = Date.now();
    try {
        const engineUrl = process.env.ENGINE_HEALTH_URL || 'https://engine.smarter.poker/health';
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const r = await fetch(engineUrl, { method: 'GET', signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return { status: 'degraded', httpStatus: r.status, latencyMs: Date.now() - start };
        const body = await r.json().catch(() => null);
        return {
            status: 'ok',
            latencyMs: Date.now() - start,
            httpStatus: r.status,
            engineVersion: body?.version || null,
            activeTables: body?.activeTables ?? null,
        };
    } catch (e) {
        return {
            status: 'error',
            reason: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'unreachable'),
            latencyMs: Date.now() - start,
        };
    }
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Live probes in parallel so the endpoint returns in ~the longest
      // single probe time rather than the sum. 2s engine timeout is the
      // critical path.
      const [db, realtime, engineReachable] = await Promise.all([
          probeDb(),
          probeRealtime(),
          probeEngine(),
      ]);

      const services = {
          supabase: {
              status: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
              url: process.env.NEXT_PUBLIC_SUPABASE_URL ? '[SET]' : '[NOT SET]',
              anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '[SET]' : '[NOT SET]',
              serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '[SET]' : '[NOT SET]',
          },
          sentry: getSentryStatus(),
          push: getOneSignalStatus(),
          twilio: {
              configured: isTwilioConfigured(),
              hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
              hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
              hasPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
          },
          email: getEmailStatus(),
          stripe: {
              configured: !!process.env.STRIPE_SECRET_KEY,
              hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
              hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
          },
          googleMaps: {
              configured: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
              hasApiKey: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
          },
      };

      const configuredCount = Object.values(services || {}).filter(s => s.configured || s.status === 'configured').length;
      const totalServices = Object.keys(services || {}).length;

      // ── Phase 5.1.4: overall status aggregates probe results ────────────
      // Any `error` on db or engine drops us to 'degraded' and 503. A
      // realtime error is reported but doesn't degrade — realtime is a
      // nice-to-have for broadcast channels but not a hard dep for auth,
      // the hub, or the engine's authoritative socket path.
      const hardFail = db.status === 'error' || engineReachable.status === 'error';
      const overallStatus = hardFail
          ? 'degraded'
          : (configuredCount === totalServices ? 'healthy' : 'partial');

      return res.status(hardFail ? 503 : 200).json({
          success: !hardFail,
          health: {
              status: overallStatus,
              environment: process.env.NODE_ENV || 'unknown',
              timestamp: new Date().toISOString(),
              version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || process.env.BUILD_ID || 'development',
              uptime: Math.floor(process.uptime()),
              probes: {
                  db,
                  realtime,
                  engineReachable,
              },
              services,
              summary: {
                  configured: configuredCount,
                  total: totalServices,
                  percentage: Math.round((configuredCount / totalServices) * 100),
              },
          },
      });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}