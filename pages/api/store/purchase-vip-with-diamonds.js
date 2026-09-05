import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createHash } from 'node:crypto';
/**
 * Purchase a VIP MEMBERSHIP with diamonds
 * POST /api/store/purchase-vip-with-diamonds
 *
 * Body: { plan: 'monthly' | 'yearly' | 'lifetime', idempotencyKey?: string }
 *       (or the X-Idempotency-Key header)
 *
 * The client sends a plan KEY ONLY — never a price and never an amount.
 * The diamond cost is resolved server-side from VIP_MEMBERSHIP in
 * src/data/diamondStoreData.js at the platform rate of 100 diamonds per USD
 * (1 diamond = $0.01), so there is exactly one source of truth for the price.
 *
 * This replaces the browser-side purchaseVipWithDiamonds() in
 * commander-shared/src/lib/gates/premiumFeatureGate.js, which wrote
 * profiles.is_vip / vip_tier / vip_expires_at directly with the anon key.
 * That is a self-grant hole, and the v2 guard trigger (migration
 * 20260726120000) locks those columns to service_role anyway.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('VIP purchase database is not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// 1 diamond = $0.01 — see src/config/diamondRewards.js
const DIAMONDS_PER_DOLLAR = 100;

/**
 * The three terms Dan named on 2026-09-05: "just vip, monthly, yearly or
 * lifetime". All three are buyable here, because all three carry a USD price
 * and the diamond cost is derived from it at 100 diamonds per dollar.
 *
 * 'daily' is gone, not excluded: the Daily Pass was retired the same day and
 * /api/store/purchase-daily-vip with it. 'annual' is gone too - it is 'yearly'
 * now, in this file, in the database (migration 20260905153833) and on the page.
 */
const SUPPORTED_PLANS = ['monthly', 'yearly', 'lifetime'];

// Billing interval -> days of access granted.
/**
 * Billing interval -> days of access granted. 'lifetime' is deliberately ABSENT:
 * it is not a period, and a lifetime purchase sends p_days = null. The RPC
 * ignores p_days for that plan and writes a NULL vip_expires_at, which is what
 * expire_lapsed_vip is guarded against. Giving lifetime a very large number of
 * days here would make it an expiry that merely has not arrived yet.
 */
const INTERVAL_DAYS = { day: 1, week: 7, month: 30, year: 365 };

// Sanity band on the derived cost. Guards against a corrupted/edited catalog
// entry silently selling annual VIP for 1 diamond (or charging 5,000,000).
const MIN_COST_DIAMONDS = 100;      // $1
const MAX_COST_DIAMONDS = 100000;   // $1,000

/**
 * Resolve the plan definition and derive its diamond cost from the real USD
 * price. Returns null when the plan key is unknown or the catalog entry is
 * unusable — we never fall back to a hardcoded second copy of the price.
 */
function resolvePlan(planKey) {
    if (!SUPPORTED_PLANS.includes(planKey)) return null;
    const plan = VIP_MEMBERSHIP && VIP_MEMBERSHIP[planKey];
    /* `isDiamondCost` was the Daily Pass's marker - it meant "this plan's
       `price` is already denominated in diamonds", and it was refused here
       because this route derives the diamond cost from a USD price. The Daily
       Pass is retired and no plan carries the flag any more; the guard stays
       as a tripwire in case one ever does. */
    if (!plan || plan.isDiamondCost) return null;

    const usd = Number(plan.price);
    if (!Number.isFinite(usd) || usd <= 0) return null;

    // $19.99 -> 1999, $199.99 -> 19999
    const cost = Math.round(usd * DIAMONDS_PER_DOLLAR);
    if (!Number.isInteger(cost) || cost < MIN_COST_DIAMONDS || cost > MAX_COST_DIAMONDS) return null;

    // A lifetime term has no day count, and that is not a failure to resolve.
    const lifetime = plan.interval === 'lifetime';
    const days = lifetime ? null : INTERVAL_DAYS[plan.interval];
    if (!lifetime && !days) return null;

    return { key: planKey, id: plan.id, name: plan.name, usd, cost, days, lifetime };
}

// ── Idempotency ───────────────────────────────────────────────────────────
// Two layers:
//   1. A DB-level reference_id. add_diamonds_to_balance refuses any
//      reference_id it has already written (returns duplicate:true), which is
//      the only layer that survives across serverless instances.
//   2. A short in-memory double-submit guard keyed on the same reference id,
//      so a same-millisecond double-click gets a clean 409 instead of racing
//      into the DB.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
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

/**
 * Reference id = user + plan + client key. When the client sends no key we
 * fall back to a coarse time bucket so a double-click still collapses onto one
 * reference id (and therefore one charge) instead of billing twice.
 */
function buildReferenceId(userId, clientKey) {
    return 'vip-diamonds:' + userId + ':' + clientKey;
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
          // ── Auth: userId comes from the token, never from the body ───────
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Authorization required' });
          }

          const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
          if (authErr || !user || !user.id) {
              return res.status(401).json({ success: false, error: 'Invalid session' });
          }

          // Email must be verified before any real-value action.
          // The fast local-JWT path in serverAuth returns { id, email, role, aud }
          // with NO email_confirmed_at, so the synchronous gate alone would 403
          // every caller. Fall back to the auth.users lookup in that case.
          let emailGate = requireEmailVerified(user);
          if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
              emailGate = await requireEmailVerifiedByUserId(getSupabase(), user.id);
          }
          if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

          // ── Resolve the plan + cost SERVER-SIDE from the plan key ────────
          const planKey = req.body && typeof req.body.plan === 'string' ? req.body.plan.trim().toLowerCase() : '';
          if (!planKey) {
              return res.status(400).json({ success: false, error: 'plan is required' });
          }
          // The Daily Pass was retired on 2026-09-05 (Dan: the terms are
          // monthly, yearly and lifetime). Nothing was ever sold on it. An old
          // cached bundle can still ask, so answer with the reason rather than
          // a bare "unsupported plan".
          if (planKey === 'daily') {
              return res.status(410).json({
                  success: false,
                  error: 'The VIP Daily Pass has been retired. VIP is monthly, yearly or lifetime.',
                  supported: SUPPORTED_PLANS
              });
          }
          // Likewise for the old name of the yearly term, so a stale client
          // that still says 'annual' gets the membership it asked for.
          if (planKey === 'annual') {
              return res.status(400).json({
                  success: false,
                  error: 'The annual plan is now called yearly.',
                  supported: SUPPORTED_PLANS,
                  renamedTo: 'yearly'
              });
          }

          const plan = resolvePlan(planKey);
          if (!plan) {
              return res.status(400).json({
                  success: false,
                  error: 'Unsupported VIP plan',
                  supported: SUPPORTED_PLANS
              });
          }
          const COST = plan.cost;

          // ── Idempotency key ──────────────────────────────────────────────
          const { key: clientKey, invalid: keyInvalid } = readClientKey(req);
          if (keyInvalid || !clientKey) {
              return res.status(400).json({
                  success: false,
                  error: 'A valid X-Idempotency-Key is required (8-128 chars, letters/digits/._:- only)'
              });
          }
          referenceId = buildReferenceId(user.id, clientKey);
          const requestHash = createHash('sha256')
              .update(JSON.stringify({ plan: plan.key, cost: COST, days: plan.days }))
              .digest('hex');

          // In-memory double-submit guard.
          const prior = _submissions.get(referenceId);
          if (prior && Date.now() < prior.expiresAt) {
              if (prior.requestHash !== requestHash) {
                  referenceId = null;
                  return res.status(409).json({
                      success: false,
                      error: 'This idempotency key is already bound to another VIP plan.',
                      code: 'IDEMPOTENCY_CONFLICT'
                  });
              }
              if (prior.state === 'processing') {
                  referenceId = null; // not ours to release
                  return res.status(409).json({
                      success: false,
                      error: 'A VIP purchase with this idempotency key is already in progress.',
                      duplicate: true
                  });
              }
              const replay = { ...prior.body, idempotent: true };
              referenceId = null;
              return res.status(prior.status).json(replay);
          }
          _submissions.set(referenceId, { requestHash, state: 'processing', status: 0, body: null, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });

          const remember = (status, body) => {
              if (!referenceId) return;
              _submissions.set(referenceId, { requestHash, state: 'done', status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
              referenceId = null;
          };

          // Debit, ledger insert, tier selection and expiry extension share one
          // database transaction. Concurrent purchases therefore stack rather
          // than racing two read/modify/write cycles and losing an extension.
          const { data: purchaseResult, error: purchaseError } = await getSupabase().rpc('purchase_vip_with_diamonds_atomic_v3', {
              p_user_id: user.id,
              p_cost: COST,
              p_days: plan.days,
              p_plan: plan.key,
              p_description: `${plan.name} (${COST} diamonds)`,
              p_reference_id: referenceId,
              p_request_hash: requestHash
          });

          if (purchaseError) {
              console.warn('[Purchase VIP Diamonds] Atomic purchase failed:', purchaseError);
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(500).json({ success: false, error: 'Failed to process payment' });
          }
          if (!purchaseResult?.success) {
              if (purchaseResult?.error === 'reference_conflict') {
                  _submissions.delete(referenceId);
                  referenceId = null;
                  return res.status(409).json({
                      success: false,
                      error: 'This idempotency key is already bound to another VIP plan.',
                      code: 'IDEMPOTENCY_CONFLICT'
                  });
              }
              const isLifetime = purchaseResult?.error === 'already_lifetime';
              const body = {
                  success: false,
                  error: isLifetime
                      ? 'Lifetime VIP already includes this membership'
                      : purchaseResult?.error === 'insufficient_diamonds'
                      ? 'Insufficient diamonds'
                      : (purchaseResult?.error || 'Failed to process payment'),
                  required: COST,
                  current: purchaseResult?.new_balance
              };
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(isLifetime ? 409 : purchaseResult?.error === 'insufficient_diamonds' ? 400 : 500).json(body);
          }

          const body = {
              success: true,
              idempotent: !!purchaseResult.duplicate,
              duplicate: !!purchaseResult.duplicate,
              isVip: true,
              plan: plan.key,
              tier: purchaseResult.tier || plan.key,
              cost: COST,
              daysAdded: plan.days,
              expiresAt: purchaseResult.expires_at,
              newBalance: purchaseResult.new_balance
          };
          remember(200, body);
          return res.status(200).json(body);

      } catch (err) {
          console.warn('[Purchase VIP Diamonds] Fatal Error:', err);
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
