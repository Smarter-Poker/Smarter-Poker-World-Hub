/**
 * /api/kyc/* — Hono catch-all router (Phase 4.4 module #4, 2026-04-28)
 *
 * Consolidates 3 previously-separate handlers (start/status/webhook) under
 * a single Hono app. Same pattern as /api/venues/[...slug].js + /api/trivia/[...slug].js.
 *
 * Routes (mounted at /api/kyc):
 *   POST /start    — start a KYC inquiry for the authenticated user
 *   GET  /status   — return current KYC + age-gate state
 *   POST /webhook  — receive provider callback (signature-verified, NOT user-auth)
 *
 * Replaces:
 *   pages/api/kyc/start.js    (91 LOC)
 *   pages/api/kyc/status.js   (88 LOC)
 *   pages/api/kyc/webhook.js  (141 LOC)
 *   = 320 LOC of boilerplate, now ~210 LOC with shared middleware.
 *
 * Auth pattern note:
 *   start + status use `getServerUserWithFallback(req, supabase)` (Phase 4.1d
 *   ESM-clean pattern) — replaces the older direct GoTrue call that was
 *   used in the per-handler files. webhook does NOT use user auth — it
 *   dispatches on the `provider` query param to a provider-specific
 *   signature verifier (HMAC, bearer secret, etc.) so the webhook
 *   middleware skips user auth.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// ─── Service-role client for webhook (bypasses RLS for status updates) ─────
let _adminSupabase = null;
function getAdminSupabase() {
  if (!_adminSupabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient: createSupClient } = require('@supabase/supabase-js');
    _adminSupabase = createSupClient(url, key);
  }
  return _adminSupabase;
}

const DEFAULT_PROVIDER = process.env.KYC_PROVIDER || 'stub';

// ─── Webhook signature verifiers ───────────────────────────────────────────
function verifyStub(authHeader, body) {
  const secret = process.env.KYC_WEBHOOK_SECRET;
  if (!secret) return { ok: false, error: 'KYC_WEBHOOK_SECRET not configured' };
  if (authHeader !== `Bearer ${secret}`) return { ok: false, error: 'Unauthorized' };
  return { ok: true, payload: body };
}
function verifyNotYetImplemented(providerName) {
  return () => ({ ok: false, error: `${providerName} webhook signature verification not yet implemented` });
}
const VERIFIERS = {
  stub: verifyStub,
  persona: verifyNotYetImplemented('persona'),
  veriff: verifyNotYetImplemented('veriff'),
  jumio: verifyNotYetImplemented('jumio'),
  onfido: verifyNotYetImplemented('onfido'),
};

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/kyc');

// Shared rate-limit middleware (all routes — webhook gets it too to deter abuse)
app.use('*', async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
});

// User-auth middleware applied ONLY to start + status (webhook bypasses this)
const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = createClient();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    c.set('user', localUser);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[kyc] auth error:', err);
    return c.json({ error: 'Invalid or expired session' }, 401);
  }
};

// ─── Routes ───────────────────────────────────────────────────────────────

// POST /api/kyc/start
app.post('/start', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const body = await c.req.json().catch(() => ({}));
    const provider = body.provider || DEFAULT_PROVIDER;
    const jurisdiction_country = body.jurisdiction_country || null;

    const { data, error } = await supabase.rpc('fn_kyc_start_inquiry', {
      p_user_id: user.id,
      p_provider: provider,
      p_jurisdiction_country: jurisdiction_country,
    });

    if (error) {
      console.warn('[kyc/start] RPC error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
    return c.json(data);
  } catch (err) {
    console.warn('[kyc/start] unhandled:', err);
    return c.json({ error: err?.message || 'unhandled failure' }, 500);
  }
});

// GET /api/kyc/status
app.get('/status', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('kyc_status, kyc_provider, kyc_completed_at, kyc_rejection_reason, age_verified, age_verified_at, jurisdiction_country')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[kyc/status] select error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }

    return c.json({
      ...data,
      can_play_money: !!data?.age_verified,
      can_real_money: data?.kyc_status === 'APPROVED',
    });
  } catch (err) {
    console.warn('[kyc/status] unhandled:', err);
    return c.json({ error: err?.message || 'unhandled failure' }, 500);
  }
});

// POST /api/kyc/webhook  (NO user auth — provider signature check instead)
app.post('/webhook', async (c) => {
  try {
    const provider = (c.req.query('provider') || 'stub').toString().toLowerCase();
    const verifier = VERIFIERS[provider];
    if (!verifier) {
      return c.json({ error: `Unknown provider: ${provider}` }, 400);
    }

    const authHeader = c.req.header('authorization') || '';
    const body = await c.req.json().catch(() => ({}));

    const verified = verifier(authHeader, body);
    if (!verified.ok) {
      return c.json({ error: verified.error || 'Unauthorized' }, 401);
    }

    const payload = verified.payload;
    const inquiry_id = payload?.inquiry_id;
    const outcome = payload?.outcome;

    if (!inquiry_id || !outcome) {
      return c.json({ error: 'inquiry_id and outcome are required in the body' }, 400);
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc('fn_kyc_resolve_inquiry', {
      p_inquiry_id: inquiry_id,
      p_outcome: outcome,
      p_rejection_reason: payload?.rejection_reason || null,
      p_raw_payload: payload,
    });

    if (error) {
      console.warn('[kyc/webhook] RPC error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
    if (!data?.ok) {
      return c.json(data, 404);
    }
    return c.json(data);
  } catch (err) {
    console.warn('[kyc/webhook] unhandled:', err);
    return c.json({ error: err?.message || 'unhandled failure' }, 500);
  }
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
      console.warn('[kyc] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[kyc] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
