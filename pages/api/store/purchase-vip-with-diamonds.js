import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createHash } from 'node:crypto';
/**
 * Purchase a VIP MEMBERSHIP with diamonds
 * POST /api/store/purchase-vip-with-diamonds
 *
 * Body: { plan: 'monthly' | 'yearly' | 'lifetime', offerConfirmation,
 *         idempotencyKey?: string }
 *       (or the X-Idempotency-Key header)
 *
 * The client confirms the exact integer Diamond cost it reviewed. The server
 * still resolves authoritative pricing from VIP_MEMBERSHIP and refuses a new
 * debit if those values differ. Exact historical retries replay before the
 * current-price comparison.
 *
 * This replaces the browser-side purchaseVipWithDiamonds() in
 * commander-shared/src/lib/gates/premiumFeatureGate.js, which wrote
 * profiles.is_vip / vip_tier / vip_expires_at directly with the anon key.
 * That is a self-grant hole, and the v2 guard trigger (migration
 * 20260726120000) locks those columns to service_role anyway.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const {
  requireEmailVerified,
  requireEmailVerifiedByUserId,
} = require('../../../src/lib/emailVerifiedGate');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import {
  exactJsonValueMatches,
  vipDiamondOfferConfirmation,
} from '../../../src/lib/store/verifiedCheckoutUrl.mjs';
import {
  BLOCKING_RECURRING_VIP_STATUSES,
  STRIPE_VIP_AUTHORITY,
  classifyStripeCheckoutSessionForVip,
  classifyStripeSubscriptionForVip,
} from '../../../src/lib/store/vipPurchaseGuards.mjs';
const { inspectStripeRuntime } = require('../../../src/lib/store/stripeRuntimeMode');

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

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      timeout: 15000,
      maxNetworkRetries: 2,
      telemetry: false,
    })
  : null;

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
const MIN_COST_DIAMONDS = 100; // $1
const MAX_COST_DIAMONDS = 100000; // $1,000

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
// The durable request row and atomic database RPC are the sole authority for
// replay and concurrency. A process-local cache cannot coordinate serverless
// instances and must never decide financial truth.
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function readClientKey(req) {
  const header = req.headers && req.headers['x-idempotency-key'];
  const body = req.body && req.body.idempotencyKey;
  const headerWasSent = header !== undefined;
  const bodyWasSent = body !== undefined;
  if ((headerWasSent && typeof header !== 'string') || (bodyWasSent && typeof body !== 'string')) {
    return { key: null, invalid: true };
  }
  const headerKey = typeof header === 'string' ? header.trim() : '';
  const bodyKey = typeof body === 'string' ? body.trim() : '';
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    return { key: null, invalid: true };
  }
  const key = headerKey || bodyKey || null;
  if (!key) return { key: null, invalid: false };
  if (!KEY_PATTERN.test(key)) return { key: null, invalid: true };
  return { key, invalid: false };
}

/**
 * Reference id = user + client key. Requests without a valid client key are
 * refused before any database work.
 */
function buildReferenceId(userId, clientKey) {
  return 'vip-diamonds:' + userId + ':' + clientKey;
}

function successBody(plan, cost, purchaseResult, accountId, requestId, idempotent = false) {
  return {
    success: true,
    accountId,
    requestId,
    idempotent: idempotent || !!purchaseResult.duplicate,
    duplicate: idempotent || !!purchaseResult.duplicate,
    isVip: true,
    plan: plan.key,
    tier: purchaseResult.tier || plan.key,
    cost,
    daysAdded: plan.days,
    expiresAt: purchaseResult.expires_at,
    newBalance: purchaseResult.new_balance,
  };
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

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

      if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 1024) {
        return res.status(413).json({ success: false, error: 'Request body too large' });
      }
      const allowedFields = new Set(['plan', 'offerConfirmation', 'idempotencyKey']);
      const unknownFields = Object.keys(req.body || {}).filter(
        (field) => !allowedFields.has(field)
      );
      if (unknownFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Unknown fields: ${unknownFields.join(', ')}`,
        });
      }

      // ── Resolve the plan + cost SERVER-SIDE from the plan key ────────
      const planKey =
        req.body && typeof req.body.plan === 'string' ? req.body.plan.trim().toLowerCase() : '';
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
          supported: SUPPORTED_PLANS,
        });
      }
      // Likewise for the old name of the yearly term, so a stale client
      // that still says 'annual' gets the membership it asked for.
      if (planKey === 'annual') {
        return res.status(400).json({
          success: false,
          error: 'The annual plan is now called yearly.',
          supported: SUPPORTED_PLANS,
          renamedTo: 'yearly',
        });
      }

      const plan = resolvePlan(planKey);
      if (!plan) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported VIP plan',
          supported: SUPPORTED_PLANS,
        });
      }
      const COST = plan.cost;

      // ── Idempotency key ──────────────────────────────────────────────
      const { key: clientKey, invalid: keyInvalid } = readClientKey(req);
      if (keyInvalid || !clientKey) {
        return res.status(400).json({
          success: false,
          error: 'A valid X-Idempotency-Key is required (8-128 chars, letters/digits/._:- only)',
        });
      }
      referenceId = buildReferenceId(user.id, clientKey);
      const boundPurchaseResponse = (body) => ({
        ...body,
        accountId: user.id,
        requestId: clientKey,
      });
      const offerConfirmation = vipDiamondOfferConfirmation(user.id, req.body?.offerConfirmation);
      if (
        !offerConfirmation ||
        !exactJsonValueMatches(req.body?.offerConfirmation, offerConfirmation) ||
        offerConfirmation.plan !== plan.key
      ) {
        return res.status(400).json(
          boundPurchaseResponse({
            success: false,
            error: 'The Reviewed VIP Price Could Not Be Verified. Review This Plan Again.',
            code: 'OFFER_CONFIRMATION_REQUIRED',
          })
        );
      }
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({
            plan: plan.key,
            cost: offerConfirmation.cost,
            days: plan.days,
          })
        )
        .digest('hex');

      // A settled request is immutable and must replay before any current
      // Card eligibility check. Otherwise a member who bought with
      // Diamonds and later opened a Card subscription could receive a
      // conflict when safely retrying the original completed request.
      const { data: durableRequest, error: durableReadError } = await getSupabase()
        .from('vip_diamond_purchase_requests')
        .select('user_id, request_hash, response')
        .eq('reference_id', referenceId)
        .maybeSingle();
      if (durableReadError) {
        return res.status(503).json(
          boundPurchaseResponse({
            success: false,
            error: 'VIP Purchase State Could Not Be Verified. Please Try Again.',
            code: 'VIP_PURCHASE_STATE_UNAVAILABLE',
          })
        );
      }
      if (durableRequest) {
        if (durableRequest.user_id !== user.id || durableRequest.request_hash !== requestHash) {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'This Idempotency Key Is Already Bound To Another VIP Plan.',
              code: 'IDEMPOTENCY_CONFLICT',
            })
          );
        }
        if (!durableRequest.response?.success) {
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase State Could Not Be Verified. Please Try Again.',
              code: 'VIP_PURCHASE_STATE_UNAVAILABLE',
            })
          );
        }
        const replayBody = successBody(
          plan,
          offerConfirmation.cost,
          durableRequest.response,
          user.id,
          clientKey,
          true
        );
        return res.status(200).json(replayBody);
      }

      if (offerConfirmation.cost !== COST) {
        return res.status(409).json(
          boundPurchaseResponse({
            success: false,
            error: 'The VIP Price Changed. Review The Current Plan Before Purchasing.',
            code: 'OFFER_PRICE_CHANGED',
            reviewed: offerConfirmation.cost,
            current: COST,
          })
        );
      }

      // Stripe is the authority when a Checkout session or subscription
      // has not reached the local webhook ledger yet. Any uncertainty must
      // fail closed before Diamonds are debited. The reciprocal database
      // claim guard still closes a Card checkout that begins after these
      // reads and before the atomic Diamond RPC.
      const { data: eligibilityProfile, error: profileReadError } = await getSupabase()
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileReadError || !eligibilityProfile) {
        return res.status(503).json(
          boundPurchaseResponse({
            success: false,
            error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
            code: 'VIP_ELIGIBILITY_UNAVAILABLE',
          })
        );
      }
      if (eligibilityProfile.stripe_customer_id) {
        const stripeRuntime = inspectStripeRuntime(process.env, {
          requirePublishable: false,
        });
        if (!stripe || !stripeRuntime.ready) {
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
            })
          );
        }
        let stripeSubscriptions;
        let openSessions;
        try {
          [stripeSubscriptions, openSessions] = await Promise.all([
            stripe.subscriptions.list({
              customer: eligibilityProfile.stripe_customer_id,
              status: 'all',
              limit: 100,
            }),
            stripe.checkout.sessions.list({
              customer: eligibilityProfile.stripe_customer_id,
              status: 'open',
              limit: 100,
            }),
          ]);
        } catch (stripeEligibilityError) {
          console.warn(
            '[Purchase VIP Diamonds] Stripe eligibility check failed:',
            stripeEligibilityError?.message || stripeEligibilityError
          );
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
            })
          );
        }
        if (stripeSubscriptions?.has_more || openSessions?.has_more) {
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
            })
          );
        }
        const knownVipPriceIds = [
          process.env.STRIPE_VIP_MONTHLY_PRICE_ID,
          process.env.STRIPE_VIP_YEARLY_PRICE_ID,
        ];
        const blockingStripeSubscriptions = (stripeSubscriptions?.data || []).filter(
          (subscription) => BLOCKING_RECURRING_VIP_STATUSES.includes(subscription?.status)
        );
        const subscriptionAuthorities = blockingStripeSubscriptions.map((subscription) =>
          classifyStripeSubscriptionForVip(subscription, { knownVipPriceIds })
        );
        const activeCardSubscription = subscriptionAuthorities.includes(STRIPE_VIP_AUTHORITY.VIP);
        if (activeCardSubscription) {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'Cancel Your Active Recurring VIP Plan Before Purchasing VIP With Diamonds.',
              code: 'ACTIVE_SUBSCRIPTION_EXISTS',
            })
          );
        }
        if (subscriptionAuthorities.includes(STRIPE_VIP_AUTHORITY.UNKNOWN)) {
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
            })
          );
        }
        const checkoutAuthorities = (openSessions?.data || []).map((session) =>
          classifyStripeCheckoutSessionForVip(session)
        );
        const openCardCheckout = checkoutAuthorities.includes(STRIPE_VIP_AUTHORITY.VIP);
        if (openCardCheckout) {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'A Card VIP Checkout Is Already Open For This Account.',
              code: 'CARD_CHECKOUT_EXISTS',
            })
          );
        }
        if (checkoutAuthorities.includes(STRIPE_VIP_AUTHORITY.UNKNOWN)) {
          return res.status(503).json(
            boundPurchaseResponse({
              success: false,
              error: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.',
              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
            })
          );
        }
      }

      // Durable replay is resolved inside this RPC before current Card
      // eligibility. New purchases then acquire the same profile row lock
      // as Card checkout claims before the unchanged debit, ledger, tier,
      // and expiry settlement. This ordering means an already completed
      // request remains replayable without opening a cross-method race.
      const { data: purchaseResult, error: purchaseError } = await getSupabase().rpc(
        'purchase_vip_with_diamonds_atomic_v3',
        {
          p_user_id: user.id,
          p_cost: COST,
          p_days: plan.days,
          p_plan: plan.key,
          p_description: `${plan.name} (${COST} diamonds)`,
          p_reference_id: referenceId,
          p_request_hash: requestHash,
        }
      );

      if (purchaseError) {
        console.warn('[Purchase VIP Diamonds] Atomic purchase failed:', purchaseError);
        return res.status(500).json(
          boundPurchaseResponse({
            success: false,
            error: 'Failed to process payment',
          })
        );
      }
      if (!purchaseResult?.success) {
        if (purchaseResult?.error === 'reference_conflict') {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'This idempotency key is already bound to another VIP plan.',
              code: 'IDEMPOTENCY_CONFLICT',
            })
          );
        }
        if (purchaseResult?.error === 'card_checkout_exists') {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'A Card VIP Checkout Is Already Open For This Account.',
              code: 'CARD_CHECKOUT_EXISTS',
            })
          );
        }
        if (purchaseResult?.error === 'active_card_subscription') {
          return res.status(409).json(
            boundPurchaseResponse({
              success: false,
              error: 'Cancel Your Active Recurring VIP Plan Before Purchasing VIP With Diamonds.',
              code: 'ACTIVE_SUBSCRIPTION_EXISTS',
            })
          );
        }
        const isLifetime = purchaseResult?.error === 'already_lifetime';
        const body = boundPurchaseResponse({
          success: false,
          error: isLifetime
            ? 'Lifetime VIP already includes this membership'
            : purchaseResult?.error === 'insufficient_diamonds'
              ? 'Insufficient diamonds'
              : purchaseResult?.error || 'Failed to process payment',
          required: COST,
          current: purchaseResult?.new_balance,
          code: isLifetime
            ? 'ALREADY_LIFETIME'
            : purchaseResult?.error === 'insufficient_diamonds'
              ? 'INSUFFICIENT_DIAMONDS'
              : undefined,
        });
        return res
          .status(isLifetime ? 409 : purchaseResult?.error === 'insufficient_diamonds' ? 400 : 500)
          .json(body);
      }

      const body = successBody(plan, COST, purchaseResult, user.id, clientKey);
      return res.status(200).json(body);
    } catch (err) {
      console.warn('[Purchase VIP Diamonds] Fatal Error:', err);
      if (!res.headersSent)
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
