import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Purchase Daily VIP Pass
 * POST /api/store/purchase-daily-vip
 * Deducts 150 diamonds and grants 24 hours of VIP access
 *
 * Body (optional): { idempotencyKey?: string }  — or the X-Idempotency-Key header.
 * The key is OPTIONAL so existing clients keep working; when it is absent we
 * fall back to a coarse time bucket, which still collapses a double-click onto
 * a single charge.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[purchase-daily-vip] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Price comes from the store catalog (VIP_MEMBERSHIP.daily is already denominated
// in diamonds via isDiamondCost) so there is no second copy of the number to
// drift. Falls back to the documented 150 if the catalog entry is unusable.
const DEFAULT_DAILY_COST = 150;
function resolveDailyCost() {
    const daily = VIP_MEMBERSHIP && VIP_MEMBERSHIP.daily;
    const price = daily && daily.isDiamondCost ? Number(daily.price) : NaN;
    if (Number.isInteger(price) && price > 0 && price <= 100000) return price;
    return DEFAULT_DAILY_COST;
}

// ── Idempotency ───────────────────────────────────────────────────────────
// Previously this endpoint passed p_reference_id: null, which disabled the
// duplicate guard inside add_diamonds_to_balance — a double-click charged
// twice and granted 48h. Now every purchase carries a reference id derived
// from user + key, backed by a short in-memory double-submit guard.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const AUTO_KEY_WINDOW_MS = 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

const _submissions = new Map(); // referenceId -> { state, status, body, expiresAt }
let _reaperStarted = false;
function ensureReaper() {
    if (_reaperStarted || typeof setInterval === 'undefined') return;
    _reaperStarted = true;
    const t = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of _submissions) if (now >= v.expiresAt) _submissions.delete(k);
    }, 60 * 1000);
    if (t && t.unref) t.unref();
}

function readClientKey(req) {
    const header = req.headers && req.headers['x-idempotency-key'];
    const body = req.body && req.body.idempotencyKey;
    const raw = (typeof header === 'string' && header) || (typeof body === 'string' && body) || null;
    if (!raw) return { key: null, invalid: false };
    const trimmed = raw.trim();
    if (!KEY_PATTERN.test(trimmed)) return { key: null, invalid: true };
    return { key: trimmed, invalid: false };
}

function buildReferenceId(userId, clientKey) {
    const suffix = clientKey || ('auto-' + Math.floor(Date.now() / AUTO_KEY_WINDOW_MS));
    return 'vip-daily:' + userId + ':' + suffix;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!applyRateLimit(req, res, LIMITS.write)) return;

      ensureReaper();
      let referenceId = null;

      try {
          // Authenticate via token — the user id always comes from the token.
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Authorization required' });
          }

          const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
          if (authErr || !user || !user.id) {
              return res.status(401).json({ success: false, error: 'Invalid session' });
          }

          // [Phase 6.1.12] Email must be verified before chip/diamond purchases.
          // The fast local-JWT path in serverAuth returns { id, email, role, aud }
          // with NO email_confirmed_at, so the synchronous gate alone would 403
          // every caller. Fall back to the auth.users lookup in that case.
          let emailGate = requireEmailVerified(user);
          if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
              emailGate = await requireEmailVerifiedByUserId(getSupabase(), user.id);
          }
          if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

          // Configuration
          const COST = resolveDailyCost();
          // ── Idempotency key ──────────────────────────────────────────────
          const { key: clientKey, invalid: keyInvalid } = readClientKey(req);
          if (keyInvalid) {
              return res.status(400).json({
                  success: false,
                  error: 'Invalid idempotency key (8-128 chars, letters/digits/._:- only)'
              });
          }
          referenceId = buildReferenceId(user.id, clientKey);

          const prior = _submissions.get(referenceId);
          if (prior && Date.now() < prior.expiresAt) {
              if (prior.state === 'processing') {
                  referenceId = null; // not ours to release
                  return res.status(409).json({
                      success: false,
                      error: 'A VIP purchase is already in progress.',
                      duplicate: true
                  });
              }
              const replay = { ...prior.body, idempotent: true };
              referenceId = null;
              return res.status(prior.status).json(replay);
          }
          _submissions.set(referenceId, { state: 'processing', status: 0, body: null, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });

          const remember = (status, body) => {
              if (!referenceId) return;
              _submissions.set(referenceId, { state: 'done', status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
              referenceId = null;
          };

          // The wallet debit and entitlement extension are a single transaction.
          const { data: purchaseResult, error: purchaseError } = await getSupabase().rpc('purchase_vip_with_diamonds_atomic', {
              p_user_id: user.id,
              p_cost: COST,
              p_days: 1,
              p_plan: 'daily',
              p_description: `1-Day VIP Access (${COST} diamonds)`,
              p_reference_id: referenceId
          });

          if (purchaseError) {
              console.warn('[Purchase Daily VIP] Atomic purchase failed:', purchaseError);
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(500).json({ success: false, error: 'Failed to process payment' });
          }
          if (!purchaseResult?.success) {
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(purchaseResult?.error === 'insufficient_diamonds' ? 400 : 500).json({
                  success: false,
                  error: purchaseResult?.error === 'insufficient_diamonds'
                      ? 'Insufficient diamonds'
                      : (purchaseResult?.error || 'Failed to process payment'),
                  required: COST,
                  current: purchaseResult?.new_balance
              });
          }

          const body = {
              success: true,
              idempotent: !!purchaseResult.duplicate,
              duplicate: !!purchaseResult.duplicate,
              isVip: true,
              tier: purchaseResult.tier || 'daily',
              expiresAt: purchaseResult.expires_at,
              newBalance: purchaseResult.new_balance
          };
          remember(200, body);
          return res.status(200).json(body);

      } catch (err) {
          console.warn('[Purchase Daily VIP] Fatal Error:', err);
          if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
      } finally {
          // Never leave a key stuck in 'processing' — that would lock the user
          // out of retrying for the whole TTL.
          if (referenceId) _submissions.delete(referenceId);
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
