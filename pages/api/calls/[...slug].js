/**
 * /api/calls/* — Hono catch-all router (Phase 4.4 pilot)
 *
 * Consolidates 3 previously-separate handlers (cancel/create/pending) under a
 * single Hono app to demonstrate the catch-all consolidation pattern from
 * plan §4.4. Each handler used to repeat ~30 lines of boilerplate (lazy
 * Supabase init, JWT auth, rate-limit, error wrapper, sentry report). Hono
 * middleware moves all of that out of per-route handlers.
 *
 * Routes (mounted at /api/calls):
 *   POST   /create     — create a pending call for an offline user
 *   DELETE /cancel     — cancel/delete a pending call
 *   POST   /cancel     — same as DELETE (clients send POST too)
 *   GET    /pending    — list pending calls for the auth'd user
 *
 * Replaces:
 *   pages/api/calls/cancel.js   (72 LOC)
 *   pages/api/calls/create.js   (81 LOC)
 *   pages/api/calls/pending.js  (78 LOC)
 *   = 231 LOC of boilerplate, now ~150 LOC with shared middleware.
 *
 * If this pilot proves stable, the same pattern applies to ~50-100 more
 * monolith API directories (per plan §4.4 "module by module, incrementally").
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ─── Lazy Supabase client (one-shot init) ─────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/calls');

// Shared middleware: rate limit on writes (POST/PUT/PATCH/DELETE)
app.use('*', async (c, next) => {
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const req = c.env?.req;
    const res = c.env?.res;
    if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
      // applyRateLimit already wrote 429 to res; tell Hono not to send anything
      return c.body(null, 429);
    }
  }
  await next();
});

// Shared middleware: JWT auth — populates c.get('user')
app.use('*', async (c, next) => {
  const auth = c.req.header('authorization');
  const token = auth?.replace('Bearer ', '');
  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }
  const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
  if (authErr || !authData?.user) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
  c.set('user', authData.user);
  await next();
});

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/calls/create — create a pending call
app.post('/create', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { calleeId, callerName, callerAvatar, callType, roomName } = body;
  const callerId = user.id;

  if (!callerId || !calleeId || !callerName || !callType || !roomName) {
    return c.json({ success: false, error: 'Missing required fields' }, 400);
  }

  try {
    const expiresAt = new Date(Date.now() + 60_000).toISOString(); // 60s TTL
    const { data, error } = await getSupabase()
      .from('pending_calls')
      .insert({
        caller_id: callerId,
        callee_id: calleeId,
        caller_name: callerName,
        caller_avatar: callerAvatar ?? null,
        call_type: callType,
        room_name: roomName,
        expires_at: expiresAt,
      })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return c.json({ success: true, callId: data.id, expiresAt });
  } catch (err) {
    console.warn('[calls/create] Error:', err);
    return c.json({ success: false, error: err.message ?? 'Internal error' }, 500);
  }
});

// DELETE/POST /api/calls/cancel — cancel a pending call
async function cancelHandler(c) {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { callId, callerId, calleeId } = body;
  const authenticatedUserId = user.id;

  try {
    let query = getSupabase().from('pending_calls').delete();
    if (callId) {
      query = query.eq('id', callId);
    } else if (callerId && calleeId) {
      // Caller cancels their own outgoing call
      if (callerId !== authenticatedUserId) {
        return c.json({ success: false, error: 'Cannot cancel another user\'s call' }, 403);
      }
      query = query.eq('caller_id', callerId).eq('callee_id', calleeId);
    } else {
      return c.json({ success: false, error: 'Must provide callId OR (callerId + calleeId)' }, 400);
    }

    const { error } = await query;
    if (error) throw error;
    return c.json({ success: true });
  } catch (err) {
    console.warn('[calls/cancel] Error:', err);
    return c.json({ success: false, error: err.message ?? 'Internal error' }, 500);
  }
}
app.delete('/cancel', cancelHandler);
app.post('/cancel', cancelHandler);

// GET /api/calls/pending — list pending calls for auth'd user
app.get('/pending', async (c) => {
  const user = c.get('user');
  const userId = user.id;

  try {
    // Sweep expired calls first (idempotent housekeeping)
    await getSupabase()
      .from('pending_calls')
      .delete()
      .lt('expires_at', new Date().toISOString());

    const { data: calls, error } = await getSupabase()
      .from('pending_calls')
      .select('*')
      .eq('callee_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ success: true, calls: calls ?? [] });
  } catch (err) {
    console.warn('[calls/pending] Error:', err);
    return c.json({ success: false, error: err.message ?? 'Internal error' }, 500);
  }
});

// ─── Vercel adapter — exports a Pages Router default handler ──────────────
// Top-level error wrapper (mirrors what reportApiError did per-handler)
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[calls] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[calls] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
