/**
 * /api/rg/* — Hono catch-all router (Phase 4.5 module #4, 2026-04-28)
 *
 * Consolidates 5 Responsible Gaming handlers under a single Hono app:
 *   GET    /limits                  — read user's RG limits row
 *   POST   /limits                  — set/update RG limits (24h cooling-off on increases)
 *   POST   /self-exclude            — monotonic self-exclusion (24h | 7d | 30d | permanent)
 *   POST   /session/start           — open RG play session (idempotent)
 *   POST   /session/end              — close RG play session (idempotent)
 *   GET    /session/reality-check   — poll for interval-based reality-check modal
 *
 * Replaces 5 source files totalling 606 LOC.
 *
 * Auth: shared `getServerUserWithFallback` (post-4.1d ESM-clean).
 *
 * Per-route rate limits via the existing rateLimit() helper (max + windowMs):
 *   /limits                30/min
 *   /self-exclude          5/hour    — deliberate action, never a loop
 *   /session/start         30/min
 *   /session/end           30/min
 *   /session/reality-check 120/min   — long-polled by client every 60s
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit, applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const app = new Hono().basePath('/api/rg');

// All routes require auth
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return c.json({ error: 'Not authenticated' }, 401);
    c.set('user', user);
    c.set('supabase', supabase);
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }
});

// Per-route rate limit factory
function rl(max, windowMs) {
  return async (c, next) => {
    const req = c.env?.req;
    const result = rateLimit(req, { max, windowMs });
    if (!result.ok) {
      return c.json({ error: 'Too many requests', retryAfter: result.retryAfter }, 429);
    }
    await next();
  };
}

// Standard write rate-limit (used on /limits POST in addition to its own 30/min cap)
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ═══════════════════════════════════════════════════════════════════════════
// /limits — GET / POST
// ═══════════════════════════════════════════════════════════════════════════
app.get('/limits', rl(30, 60_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const { data, error } = await supabase
    .from('responsible_gaming_limits')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[rg/limits:GET]', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
  return c.json({ ok: true, limits: data || null });
});

app.post('/limits', writeLimit, rl(30, 60_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));

  const { data: existing, error: existingErr } = await supabase
    .from('responsible_gaming_limits')
    .select(
      'daily_deposit_limit, weekly_deposit_limit, monthly_deposit_limit, daily_loss_limit, session_time_limit_minutes, reality_check_interval_minutes, limit_increase_available_at'
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingErr) {
    console.warn('[rg/limits:POST:existing]', existingErr);
    return c.json({ error: existingErr.message }, 500);
  }

  // Determine if ANY requested change is an increase. Null / 0 = no limit
  // (effectively the largest possible value). Going from a finite value
  // to "no limit" is an increase; lowering a finite value is a decrease.
  const toBound = (v) => {
    if (v === null || v === undefined || v === 0) return Number.POSITIVE_INFINITY;
    return Number(v);
  };
  const fields = [
    'daily_deposit_limit',
    'weekly_deposit_limit',
    'monthly_deposit_limit',
    'daily_loss_limit',
    'session_time_limit_minutes',
    'reality_check_interval_minutes',
  ];
  let isIncrease = false;
  for (const f of fields) {
    if (!(f in body)) continue;
    const oldV = toBound(existing?.[f]);
    const newV = toBound(body[f]);
    if (newV > oldV) {
      isIncrease = true;
      break;
    }
  }

  const { data, error } = await supabase.rpc('fn_rg_set_limits', {
    p_user_id: user.id,
    p_daily_deposit_limit: body.daily_deposit_limit ?? null,
    p_weekly_deposit_limit: body.weekly_deposit_limit ?? null,
    p_monthly_deposit_limit: body.monthly_deposit_limit ?? null,
    p_daily_loss_limit: body.daily_loss_limit ?? null,
    p_session_time_limit_minutes: body.session_time_limit_minutes ?? null,
    p_reality_check_interval_minutes: body.reality_check_interval_minutes ?? null,
    p_is_increase: isIncrease,
  });

  if (error) {
    console.warn('[rg/limits:POST:rpc]', error);
    const status = /cooling[-_ ]off/i.test(error.message) ? 403 : 500;
    return c.json({ error: error.message, code: 'rg_limit_update_failed' }, status);
  }

  return c.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /self-exclude — monotonic
// ═══════════════════════════════════════════════════════════════════════════
function durationToUntil(duration) {
  const now = Date.now();
  switch (duration) {
    case '24h': return new Date(now + 24 * 3600 * 1000).toISOString();
    case '7d': return new Date(now + 7 * 24 * 3600 * 1000).toISOString();
    case '30d': return new Date(now + 30 * 24 * 3600 * 1000).toISOString();
    case 'permanent': return '9999-12-31T23:59:59Z';
    default: return null;
  }
}

app.post('/self-exclude', rl(5, 3_600_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));

  let until = body.until || null;
  if (!until && body.duration) {
    until = durationToUntil(body.duration);
    if (!until) {
      return c.json(
        { error: "duration must be one of '24h', '7d', '30d', 'permanent'" },
        400
      );
    }
  }
  if (!until) return c.json({ error: 'Either `duration` or `until` is required' }, 400);

  const parsed = new Date(until);
  if (isNaN(parsed.getTime())) return c.json({ error: 'Invalid `until` timestamp' }, 400);
  if (parsed.getTime() <= Date.now() + 60_000) {
    return c.json({ error: 'Self-exclusion must end in the future' }, 400);
  }

  const { data, error } = await supabase.rpc('fn_rg_self_exclude', {
    p_user_id: user.id,
    p_until: parsed.toISOString(),
  });

  if (error) {
    console.warn('[rg/self-exclude:rpc]', error);
    const status = /monotonic|cannot shorten|already excluded/i.test(error.message) ? 403 : 500;
    return c.json({ error: error.message, code: 'rg_self_exclude_failed' }, status);
  }

  return c.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════
// /session — start / end / reality-check
// ═══════════════════════════════════════════════════════════════════════════
app.post('/session/start', rl(30, 60_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const { data, error } = await supabase.rpc('fn_rg_start_session', { p_user_id: user.id });
  if (error) {
    console.warn('[rg/session/start:rpc]', error);
    const status = /self[- _]?excluded/i.test(error.message) ? 403 : 500;
    return c.json({ error: error.message, code: 'rg_session_start_failed' }, status);
  }
  return c.json(data);
});

const ALLOWED_END_REASONS = new Set(['user_ended', 'session_time_limit', 'self_excluded', 'idle_timeout']);

app.post('/session/end', rl(30, 60_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const reason = body.reason || 'user_ended';

  if (!ALLOWED_END_REASONS.has(reason)) {
    return c.json({ error: `Invalid reason: ${reason}` }, 400);
  }

  const { data, error } = await supabase.rpc('fn_rg_end_session', {
    p_user_id: user.id,
    p_reason: reason,
  });

  if (error) {
    console.warn('[rg/session/end:rpc]', error);
    return c.json({ error: error.message, code: 'rg_session_end_failed' }, 500);
  }
  return c.json(data);
});

app.get('/session/reality-check', rl(120, 60_000), async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  // ?ack=true tells the server we just displayed the modal — append timestamp.
  const ack = String(c.req.query('ack') || '').toLowerCase() === 'true';

  const { data, error } = await supabase.rpc('fn_rg_should_show_reality_check', {
    p_user_id: user.id,
    p_ack: ack,
  });

  if (error) {
    console.warn('[rg/session/reality-check:rpc]', error);
    return c.json({ error: error.message, code: 'rg_reality_check_failed' }, 500);
  }

  c.header('Cache-Control', 'private, max-age=15');
  return c.json(data);
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[rg] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[rg] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'unhandled failure' });
    }
  }
}
