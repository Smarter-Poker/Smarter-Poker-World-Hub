/**
 * PWA Install Prompt Status API
 * Tracks whether a user/IP has already responded to the PWA install prompt.
 *
 * GET:  Check if current IP already dismissed → { dismissed: true/false }
 * POST: Record that current IP dismissed/installed the prompt
 *
 * Reuses the same Supabase table: pwa_prompt_log
 * Falls back gracefully if table doesn't exist yet.
 *
 * Security: Rate limited, input validated, error details never leaked.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ─── Simple in-memory rate limiter ───
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}

// Periodic cleanup (every 5 min)
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW * 5) rateLimitMap.delete(ip);
    }
}, 300000);

function getClientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    return fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
}

const ALLOWED_ACTIONS = ['installed', 'dismissed', 'later', 'standalone_detected'];
function sanitizeAction(action) {
    if (!action || typeof action !== 'string') return 'dismissed';
    const clean = action.toLowerCase().trim().slice(0, 30);
    return ALLOWED_ACTIONS.includes(clean) ? clean : 'dismissed';
}

export default async function handler(req, res) {
  try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      if (req.method !== 'GET' && req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      const ip = getClientIp(req);
      const throttled = isRateLimited(ip);

      // Writes still get a hard 429 - that is the actual abuse surface.
      if (throttled && req.method !== 'GET') {
          return res.status(429).json({ error: 'Too many requests' });
      }

      // GET must NOT 429. This limiter is keyed on x-forwarded-for at
      // 10 req/min, and every Club Arena page load calls this endpoint - so
      // any shared egress IP (a poker club's venue wifi, an office, a house
      // with several players, or carrier CGNAT) trips it and the browser
      // console fills with "Failed to load resource: 429". Confirmed live:
      // 6 x 429 on /api/pwa/prompt-status across 3 page loads. The
      // 2026-08-12 audit saw these and filed them as "an artifact of a rapid
      // automated sweep" - they are not, they are reachable by real users
      // sharing an IP.
      // Every other failure branch in this GET already fails open with
      // 200 {dismissed:false} (missing table, query error, throw), so the
      // hard 429 was the one inconsistent path. Fail open the same way: the
      // Supabase query is still skipped, so the DB protection the limiter
      // exists for is preserved - we just stop surfacing a client-visible
      // error for a non-critical install-prompt read.
      if (throttled && req.method === 'GET') {
          return res.status(200).json({ dismissed: false, throttled: true });
      }

      // ─── GET: Check if this IP already responded ───
      if (req.method === 'GET') {
          try {
              const { data, error } = await getSupabase()
                  .from('pwa_prompt_log')
                  .select('id')
                  .eq('ip_address', ip)
                  .limit(1);

              if (error) {
                  // Table may not exist — treat as "not dismissed"
                  return res.status(200).json({ dismissed: false });
              }
              return res.status(200).json({ dismissed: data && data.length > 0 });
          } catch {
              return res.status(200).json({ dismissed: false });
          }
      }

      // ─── POST: Record that this IP responded ───
      if (req.method === 'POST') {
          const { action } = req.body || {};
          const cleanAction = sanitizeAction(action);

          try {
              const exists = await ensureTable();
              if (!exists) {
                  return res.status(200).json({ ok: true, note: 'table_pending' });
              }

              // Idempotent: check if already recorded for this IP
              const { data: existing } = await getSupabase()
                  .from('pwa_prompt_log')
                  .select('id')
                  .eq('ip_address', ip)
                  .limit(1);

              if (existing && existing.length > 0) {
                  return res.status(200).json({ ok: true, already_recorded: true });
              }

              const { error } = await getSupabase()
                  .from('pwa_prompt_log')
                  .insert({
                      ip_address: ip,
                      action: cleanAction,
                      responded_at: new Date().toISOString(),
                  });

              if (error) {
                  if (error.code === '23505') {
                      return res.status(200).json({ ok: true, already_recorded: true });
                  }
                  console.warn('[pwa-prompt-status] POST insert error:', error.message);
                  return res.status(200).json({ ok: false });
              }

              return res.status(200).json({ ok: true });
          } catch (err) {
              console.warn('[pwa-prompt-status] POST exception:', err);
              return res.status(200).json({ ok: false });
          }
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ─── Table existence check (cached per cold start) ───
let tableChecked = false;
let tableExists = false;

async function ensureTable() {
    if (tableChecked) return tableExists;
    try {
        const { error } = await getSupabase()
            .from('pwa_prompt_log')
            .select('id')
            .limit(1);

        tableChecked = true;

        if (!error) {
            tableExists = true;
            return true;
        }
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            tableExists = false;
            return false;
        }
        tableExists = true;
        return true;
    } catch {
        tableChecked = true;
        return false;
    }
}
