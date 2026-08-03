import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Purchase a VIP MEMBERSHIP with diamonds
 * POST /api/store/purchase-vip-with-diamonds
 *
 * Body: { plan: 'monthly' | 'annual', idempotencyKey?: string }
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
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[purchase-vip-with-diamonds] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// 1 diamond = $0.01 — see src/config/diamondRewards.js
const DIAMONDS_PER_DOLLAR = 100;

// Plans that can be bought with diamonds here. 'daily' is deliberately
// excluded — it has its own endpoint (purchase-daily-vip) and is already
// priced in diamonds rather than USD.
const SUPPORTED_PLANS = ['monthly', 'annual'];

// Billing interval -> days of access granted.
const INTERVAL_DAYS = { day: 1, week: 7, month: 30, year: 365 };

// Tier ranking — a shorter purchase must never clobber a longer active tier.
const TIER_RANK = { daily: 1, monthly: 2, annual: 3 };

// Sanity band on the derived cost. Guards against a corrupted/edited catalog
// entry silently selling annual VIP for 1 diamond (or charging 5,000,000).
const MIN_COST_DIAMONDS = 100;      // $1
const MAX_COST_DIAMONDS = 100000;   // $1,000

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve the plan definition and derive its diamond cost from the real USD
 * price. Returns null when the plan key is unknown or the catalog entry is
 * unusable — we never fall back to a hardcoded second copy of the price.
 */
function resolvePlan(planKey) {
    if (!SUPPORTED_PLANS.includes(planKey)) return null;
    const plan = VIP_MEMBERSHIP && VIP_MEMBERSHIP[planKey];
    if (!plan || plan.isDiamondCost) return null;

    const usd = Number(plan.price);
    if (!Number.isFinite(usd) || usd <= 0) return null;

    // $19.99 -> 1999, $199.99 -> 19999
    const cost = Math.round(usd * DIAMONDS_PER_DOLLAR);
    if (!Number.isInteger(cost) || cost < MIN_COST_DIAMONDS || cost > MAX_COST_DIAMONDS) return null;

    const days = INTERVAL_DAYS[plan.interval];
    if (!days) return null;

    return { key: planKey, id: plan.id, name: plan.name, usd, cost, days };
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

/**
 * Reference id = user + plan + client key. When the client sends no key we
 * fall back to a coarse time bucket so a double-click still collapses onto one
 * reference id (and therefore one charge) instead of billing twice.
 */
function buildReferenceId(userId, planKey, clientKey) {
    const suffix = clientKey || ('auto-' + Math.floor(Date.now() / AUTO_KEY_WINDOW_MS));
    return 'vip-diamonds:' + planKey + ':' + userId + ':' + suffix;
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
          if (planKey === 'daily') {
              return res.status(400).json({
                  success: false,
                  error: 'Use /api/store/purchase-daily-vip for the 1-Day VIP pass'
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
          if (keyInvalid) {
              return res.status(400).json({
                  success: false,
                  error: 'Invalid idempotency key (8-128 chars, letters/digits/._:- only)'
              });
          }
          referenceId = buildReferenceId(user.id, plan.key, clientKey);

          // In-memory double-submit guard.
          const prior = _submissions.get(referenceId);
          if (prior && Date.now() < prior.expiresAt) {
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
          _submissions.set(referenceId, { state: 'processing', status: 0, body: null, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });

          const remember = (status, body) => {
              if (!referenceId) return;
              _submissions.set(referenceId, { state: 'done', status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
              referenceId = null;
          };

          // ── Read profile ─────────────────────────────────────────────────
          const { data: profile, error: profileError } = await getSupabase()
              .from('profiles')
              .select('diamonds, is_vip, vip_tier, vip_expires_at')
              .eq('id', user.id)
              .maybeSingle();

          if (profileError || !profile) {
              return res.status(500).json({ success: false, error: 'Failed to access profile' });
          }

          const currentBalance = profile.diamonds ?? 0;
          if (currentBalance < COST) {
              const body = {
                  success: false,
                  error: 'Insufficient diamonds',
                  required: COST,
                  current: currentBalance
              };
              // Not cached — the user can top up and retry with the same key.
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(400).json(body);
          }

          // ── Deduct atomically ────────────────────────────────────────────
          // add_diamonds_to_balance takes the FOR UPDATE row lock, refuses to
          // go negative, and — unlike deduct_diamonds — enforces a reference_id
          // uniqueness check, which is what makes this endpoint idempotent.
          const { data: deductResult, error: deductError } = await getSupabase().rpc('add_diamonds_to_balance', {
              p_user_id: user.id,
              p_amount: -COST,
              p_type: 'vip_membership',
              p_description: `${plan.name} (${COST} diamonds)`,
              p_reference_id: referenceId
          });

          if (deductError) {
              console.warn('[Purchase VIP Diamonds] Deduction failed:', deductError);
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(500).json({ success: false, error: 'Failed to process payment' });
          }

          // The RPC reports business failures via its data payload, not a
          // thrown error — the pre-read balance check above is not atomic.
          if (deductResult && deductResult.success === false) {
              if (deductResult.duplicate) {
                  // This exact purchase already went through. Replay the
                  // current VIP state instead of charging (or granting) twice.
                  const body = {
                      success: true,
                      idempotent: true,
                      duplicate: true,
                      isVip: !!profile.is_vip,
                      tier: profile.vip_tier || null,
                      plan: plan.key,
                      cost: COST,
                      expiresAt: profile.vip_expires_at || null,
                      newBalance: currentBalance
                  };
                  remember(200, body);
                  return res.status(200).json(body);
              }
              const body = {
                  success: false,
                  error: deductResult.error || 'Insufficient diamonds',
                  required: COST,
                  current: currentBalance
              };
              _submissions.delete(referenceId);
              referenceId = null;
              return res.status(400).json(body);
          }

          // ── Stack the expiry: extend from the CURRENT expiry when it is in
          //    the future, otherwise from now. ──────────────────────────────
          const nowMs = Date.now();
          const parsedExpiry = profile.vip_expires_at ? new Date(profile.vip_expires_at) : null;
          const hasActiveVip = !!(parsedExpiry && !Number.isNaN(parsedExpiry.getTime()) && parsedExpiry.getTime() > nowMs);
          const baseMs = hasActiveVip ? parsedExpiry.getTime() : nowMs;
          const newExpiresAt = new Date(baseMs + plan.days * MS_PER_DAY);

          // Never downgrade: an active annual tier is not clobbered by a
          // monthly (or daily) purchase — the expiry still extends.
          const activeTier = hasActiveVip ? profile.vip_tier : null;
          const activeRank = TIER_RANK[activeTier] || 0;
          const newRank = TIER_RANK[plan.key] || 0;
          const finalTier = activeRank > newRank ? activeTier : plan.key;

          const { error: updateError } = await getSupabase()
              .from('profiles')
              .update({
                  is_vip: true,
                  vip_tier: finalTier,
                  vip_expires_at: newExpiresAt.toISOString()
              })
              .eq('id', user.id);

          if (updateError) {
              console.warn('[Purchase VIP Diamonds] Profile update failed:', updateError);
              // Compensate: refund the deducted diamonds. The refund needs its
              // OWN reference id — reusing the purchase id would trip the
              // duplicate guard and silently drop the refund.
              const { data: refundResult, error: refundError } = await getSupabase().rpc('add_diamonds_to_balance', {
                  p_user_id: user.id,
                  p_amount: COST,
                  p_type: 'refund',
                  p_description: `Refund — ${plan.name} activation failed`,
                  p_reference_id: referenceId + ':refund'
              });
              const refundFailed = refundError || (refundResult && refundResult.success === false);
              // Release the key either way so the user can retry.
              _submissions.delete(referenceId);
              referenceId = null;
              if (refundFailed) {
                  console.warn('[Purchase VIP Diamonds] Refund after failed activation ALSO failed:', refundError || refundResult);
                  return res.status(500).json({ success: false, error: 'Payment succeeded, but VIP activation failed. Contact support.' });
              }
              return res.status(500).json({ success: false, error: 'VIP activation failed — your diamonds have been refunded. Please try again.' });
          }

          const newBalance = typeof deductResult?.new_balance === 'number'
              ? deductResult.new_balance
              : (typeof deductResult?.balance === 'number' ? deductResult.balance : currentBalance - COST);

          const body = {
              success: true,
              isVip: true,
              plan: plan.key,
              tier: finalTier,
              cost: COST,
              daysAdded: plan.days,
              expiresAt: newExpiresAt.toISOString(),
              newBalance
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
