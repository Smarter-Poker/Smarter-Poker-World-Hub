import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Create Stripe Checkout Session
 * POST /api/store/create-checkout-session
 * Creates a Stripe checkout session for diamonds, VIP, or merchandise
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const {
    isPrintfulReady,
    resolvePrintfulMapping,
} = require('../../../src/lib/store/printfulFulfillment');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.warn('[create-checkout-session] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key; writes may be silently blocked by RLS');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Initialize Stripe at module level (not inside handler)
// This ensures proper bundling in Vercel's serverless runtime
const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
        timeout: 15000,
        maxNetworkRetries: 2,
        telemetry: false
    })
    : null;

// ═════════════════════════════════════════════════════════════
// SERVER-SIDE DIAMOND PACKAGE DEFINITIONS (source of truth)
// Client-submitted prices/amounts are NEVER trusted.
// ═════════════════════════════════════════════════════════════
const VALID_DIAMOND_PACKAGES = {
    micro:    { diamonds: 100,   price: 1.00,   bonus: 0,    name: 'Micro' },
    small:    { diamonds: 500,   price: 5.00,   bonus: 0,    name: 'Small' },
    medium:   { diamonds: 1000,  price: 10.00,  bonus: 0,    name: 'Medium' },
    standard: { diamonds: 2500,  price: 25.00,  bonus: 0,    name: 'Standard' },
    large:    { diamonds: 5000,  price: 50.00,  bonus: 0,    name: 'Large' },
    value:    { diamonds: 10000, price: 100.00, bonus: 500,  name: 'Value' },
    premium:  { diamonds: 25000, price: 250.00, bonus: 1250, name: 'Premium' },
    whale:    { diamonds: 50000, price: 500.00, bonus: 2500, name: 'Whale' },
};

// Max units of a single diamond package per checkout.
const MAX_DIAMOND_QUANTITY_PER_PACKAGE = 10;

/**
 * Resolve a client cart item to a server-side diamond package.
 * Accepts either the raw catalog id ('micro') or the cart-scoped id
 * ('diamond-micro') that the store UI generates. Returns null when unknown.
 * The returned object carries SERVER prices/amounts only.
 */
function resolveDiamondPackage(item) {
    const raw = item?.packageId ?? item?.id;
    if (typeof raw !== 'string' || !raw) return null;
    // hasOwnProperty guards against inherited keys ('constructor', '__proto__')
    const has = (k) => Object.prototype.hasOwnProperty.call(VALID_DIAMOND_PACKAGES, k);
    const key = has(raw) ? raw : raw.replace(/^diamond-/, '');
    return has(key) ? { key, ...VALID_DIAMOND_PACKAGES[key] } : null;
}

// ═════════════════════════════════════════════════════════════
// VIP SUBSCRIPTION PLANS (server-side, env-driven price IDs)
// The client sends ONLY a plan key. Price IDs are never accepted from
// the client — otherwise a cheap price could be paired with a premium
// tier claim and the webhook would grant VIP based on the claim.
// ═════════════════════════════════════════════════════════════
// VIP_PRICE_FALLBACK — Daniel's confirmed pricing, in cents, server-side.
// Both paid tiers were unbuyable because STRIPE_VIP_MONTHLY_PRICE_ID and
// STRIPE_VIP_ANNUAL_PRICE_ID have never been set in any environment, so every
// attempt answered 503 SUBSCRIPTIONS_NOT_CONFIGURED. Creating those prices by
// hand in the Stripe dashboard was the only thing standing between the
// product and revenue.
//
// Stripe Checkout accepts an inline `price_data` carrying a `recurring` block
// in subscription mode, so a pre-created price object is not actually
// required. When the env var IS set we still use it and still validate it
// (below) — that remains the source of truth and the way to manage pricing
// from the Stripe dashboard. When it is absent we build the price here rather
// than refuse the sale.
//
// The amounts live on the server and are never read from the request, so the
// tamper-resistance the env-var design was protecting is unchanged: a client
// still sends only a plan key. Keep in step with VIP_MEMBERSHIP in
// src/data/diamondStoreData.js, which is display-only.
const VIP_SUBSCRIPTION_PLANS = {
    monthly: {
        tier: 'monthly',
        envVar: 'STRIPE_VIP_MONTHLY_PRICE_ID',
        unitAmount: 1999,          // $19.99
        interval: 'month',
        label: 'Smarter.Poker VIP — Monthly',
    },
    annual: {
        tier: 'annual',
        envVar: 'STRIPE_VIP_ANNUAL_PRICE_ID',
        unitAmount: 19999,         // $199.99
        interval: 'year',
        label: 'Smarter.Poker VIP — Annual',
    },
};

/**
 * Resolve a client plan key ('monthly' | 'annual', with an optional 'vip-'
 * prefix as produced by VIP_MEMBERSHIP ids) to its server-side Stripe price.
 * Returns null for unknown plans; returns priceId:null when the env var for a
 * known plan is not configured (deployment problem, not a client error).
 */
function resolveVipPlan(rawPlan) {
    if (typeof rawPlan !== 'string' || !rawPlan) return null;
    const key = rawPlan.replace(/^vip-/, '').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(VIP_SUBSCRIPTION_PLANS, key)) return null;
    const plan = VIP_SUBSCRIPTION_PLANS[key];
    return {
        key,
        tier: plan.tier,
        envVar: plan.envVar,
        priceId: process.env[plan.envVar] || null,
        unitAmount: plan.unitAmount,
        interval: plan.interval,
        label: plan.label,
    };
}

/**
 * Accept an optional return URL only when its parsed origin exactly matches
 * the configured Smarter.Poker origin. A string-prefix check is insufficient:
 * `https://smarter.poker.attacker.example` starts with `https://smarter.poker`.
 */
function resolveCheckoutRedirect(rawUrl, baseUrl, fallbackPath) {
    const allowedOrigin = new URL(baseUrl).origin;
    const fallbackUrl = `${allowedOrigin}${fallbackPath}`;
    if (typeof rawUrl !== 'string' || !rawUrl) return fallbackUrl;

    try {
        const candidate = new URL(rawUrl, allowedOrigin);
        if (candidate.origin !== allowedOrigin) return fallbackUrl;
        return candidate
            .toString()
            .replace(/%7BCHECKOUT_SESSION_ID%7D/gi, '{CHECKOUT_SESSION_ID}');
    } catch (_) {
        return fallbackUrl;
    }
}

class CheckoutInputError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'CheckoutInputError';
        this.code = code;
        this.status = status;
    }
}

function validateCheckoutRequestId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return /^[a-z0-9][a-z0-9_-]{11,127}$/i.test(trimmed) ? trimmed : null;
}

/**
 * Resolve and validate every purchasable line before creating a Stripe
 * customer or writing a pending order. Besides removing side effects from bad
 * requests, the returned server-owned values are reused below so validation
 * and charging cannot drift within one request.
 */
async function prepareCheckout(type, items) {
    if (type === 'diamonds') {
        const resolvedPackages = [];
        for (const clientItem of items) {
            const serverPackage = resolveDiamondPackage(clientItem);
            if (!serverPackage) {
                throw new CheckoutInputError(
                    'INVALID_PACKAGE',
                    `Unknown diamond package: ${clientItem?.packageId ?? clientItem?.id ?? 'unknown'}`
                );
            }
            const quantity = Number(clientItem?.quantity ?? 1);
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_DIAMOND_QUANTITY_PER_PACKAGE) {
                throw new CheckoutInputError(
                    'INVALID_QUANTITY',
                    `Quantity must be 1-${MAX_DIAMOND_QUANTITY_PER_PACKAGE} per package`
                );
            }
            const existing = resolvedPackages.find((pkg) => pkg.key === serverPackage.key);
            if (existing) {
                const merged = existing.quantity + quantity;
                if (merged > MAX_DIAMOND_QUANTITY_PER_PACKAGE) {
                    throw new CheckoutInputError(
                        'INVALID_QUANTITY',
                        `Quantity must be 1-${MAX_DIAMOND_QUANTITY_PER_PACKAGE} per package`
                    );
                }
                existing.quantity = merged;
            } else {
                resolvedPackages.push({ ...serverPackage, quantity });
            }
        }
        return { resolvedPackages };
    }

    if (type === 'subscription') {
        const item = items[0];
        const plan = resolveVipPlan(item?.plan ?? item?.planId ?? item?.id);
        if (!plan) {
            throw new CheckoutInputError(
                'INVALID_PLAN',
                `Unknown subscription plan: ${item?.plan ?? item?.planId ?? item?.id ?? 'unknown'}`
            );
        }

        let stripePrice = null;
        if (plan.priceId) {
            try {
                stripePrice = await stripe.prices.retrieve(plan.priceId);
            } catch (error) {
                console.warn(`[Checkout] ${plan.envVar} points at an unknown Stripe price:`, plan.priceId, error?.message);
                throw new CheckoutInputError(
                    'SUBSCRIPTIONS_NOT_CONFIGURED',
                    'VIP subscriptions are not available right now. Please contact support.',
                    503
                );
            }
            if (!stripePrice?.active || !stripePrice.recurring) {
                throw new CheckoutInputError(
                    'SUBSCRIPTIONS_NOT_CONFIGURED',
                    'VIP subscriptions are not available right now. Please contact support.',
                    503
                );
            }
        }
        return { plan, stripePrice };
    }

    const MAX_ORDER_TOTAL_USD = 2000;
    for (const item of items) {
        if (!item?.id || typeof item.id !== 'string' || item.id.length > 160) {
            throw new CheckoutInputError('ITEM_NOT_FOUND', 'That item is no longer available');
        }
        if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
            throw new CheckoutInputError('INVALID_ITEM', 'Invalid item name');
        }
        const quantity = Number(item.quantity ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            throw new CheckoutInputError('INVALID_QUANTITY', 'Quantity must be 1-10');
        }
    }

    const itemIds = [...new Set(items.map((item) => item.id))];
    const { data: catalogItems, error: catalogError } = await getSupabase()
        .from('merchandise_items')
        .select('id, name, price_usd, image_url, is_active, has_variants, metadata')
        .in('id', itemIds)
        .eq('is_active', true);
    if (catalogError) {
        console.error('[Checkout] catalog validation failed:', catalogError.message);
        throw new CheckoutInputError('CATALOG_UNAVAILABLE', 'Could not verify the merchandise catalog', 503);
    }

    const catalogPrices = Object.fromEntries((catalogItems || []).map((item) => [item.id, item]));
    const unavailable = items.find((item) => !catalogPrices[item.id]);
    if (unavailable) {
        throw new CheckoutInputError(
            'ITEM_NOT_FOUND',
            `Item "${String(unavailable.name || 'unknown').slice(0, 80)}" is no longer available`
        );
    }

    const stockCheckLines = items.map((item) => ({
        id: item.id,
        variant_id: item.variantId || item.variant_id || null,
        qty: Number(item.quantity ?? 1),
    }));
    const { data: stockRaw, error: stockError } = await getSupabase()
        .rpc('reserve_merch_order', { p_items: stockCheckLines, p_dry_run: true });
    if (stockError) {
        console.error('[Checkout] stock validation failed:', stockError.message);
        throw new CheckoutInputError('STOCK_CHECK_FAILED', 'Could not verify availability', 503);
    }

    const stockCheck = typeof stockRaw === 'string' ? JSON.parse(stockRaw) : stockRaw || {};
    if (!stockCheck.success) {
        const reasons = {
            insufficient_stock: stockCheck.available > 0
                ? `Only ${stockCheck.available} left of that item`
                : 'That item just sold out',
            variant_required: 'Please choose a size or colour',
            variant_unavailable: 'That option is no longer available',
            variant_not_applicable: 'That item has no size or colour options',
            item_unavailable: 'That item is no longer available',
            unpriced_item: 'That item is not currently purchasable',
        };
        throw new CheckoutInputError(
            stockCheck.error === 'insufficient_stock' ? 'OUT_OF_STOCK' : 'ITEM_NOT_FOUND',
            reasons[stockCheck.error] || 'That item is no longer available'
        );
    }

    // Every physical line must have an immutable provider mapping before a
    // customer can enter Stripe Checkout. This is the zero-inventory safety
    // gate: no Printful token, no deliberate auto-confirm switch, or no exact
    // selected variant mapping means no payment can be accepted.
    if (!isPrintfulReady()) {
        throw new CheckoutInputError(
            'FULFILLMENT_NOT_CONFIGURED',
            'Made-To-Order Fulfillment Is Being Configured. No Payment Was Taken.',
            503,
        );
    }

    const selectedVariantIds = [...new Set(stockCheckLines.map(line => line.variant_id).filter(Boolean))];
    const selectedVariantsById = {};
    if (selectedVariantIds.length > 0) {
        const { data: selectedVariants, error: variantError } = await getSupabase()
            .from('merchandise_item_variants')
            .select('id, item_id, metadata')
            .in('id', selectedVariantIds)
            .eq('is_active', true);
        if (variantError) {
            console.error('[Checkout] fulfillment variant lookup failed:', variantError.message);
            throw new CheckoutInputError(
                'FULFILLMENT_NOT_CONFIGURED',
                'That Option Cannot Be Sent To Fulfillment Yet. No Payment Was Taken.',
                503,
            );
        }
        for (const variant of selectedVariants || []) selectedVariantsById[variant.id] = variant;
    }

    const pricedLines = Array.isArray(stockCheck.lines) ? stockCheck.lines : [];
    const resolvedItems = items.map((item) => {
        const catalog = catalogPrices[item.id];
        const variantId = item.variantId || item.variant_id || null;
        const selectedVariant = variantId ? selectedVariantsById[variantId] : null;
        const pricedLine = pricedLines.find(line => (
            line?.id === item.id
            && String(line?.variant_id || '') === String(variantId || '')
        ));
        const itemMetadata = catalog.metadata && typeof catalog.metadata === 'object' ? catalog.metadata : {};
        const provider = itemMetadata.fulfillment_provider;
        const providerVariant = provider === 'printful'
            ? (catalog.has_variants
                ? resolvePrintfulMapping(null, selectedVariant?.metadata)
                : resolvePrintfulMapping(itemMetadata, null))
            : null;

        if (provider !== 'printful'
            || (variantId && selectedVariant?.item_id !== item.id)
            || !providerVariant) {
            throw new CheckoutInputError(
                'FULFILLMENT_NOT_CONFIGURED',
                'That Item Or Option Cannot Be Sent To Fulfillment Yet. No Payment Was Taken.',
                503,
            );
        }
        return {
            id: item.id,
            variantId: item.variantId || item.variant_id || null,
            name: catalog.name,
            // The reservation RPC is the authoritative price oracle and
            // includes per-variant overrides. Falling back to the parent price
            // keeps compatibility with an older RPC response shape.
            price: parseFloat(pricedLine?.price_usd ?? catalog.price_usd),
            image: catalog.image_url || item.image || null,
            description: item.description ? String(item.description).slice(0, 500) : undefined,
            quantity: Number(item.quantity ?? 1),
            fulfillmentProvider: 'printful',
            providerVariant,
            madeToOrder: true,
        };
    });
    const totalUsd = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (totalUsd > MAX_ORDER_TOTAL_USD) {
        throw new CheckoutInputError('ORDER_TOO_LARGE', `Maximum order total is $${MAX_ORDER_TOTAL_USD}`);
    }

    return { catalogPrices, resolvedItems, stockCheckLines, totalUsd };
}

async function findExistingCheckout(type, userId, checkoutRequestId) {
    if (!checkoutRequestId || !['diamonds', 'merchandise'].includes(type)) return null;
    const table = type === 'diamonds' ? 'diamond_purchases' : 'merchandise_orders';
    const { data, error } = await getSupabase()
        .from(table)
        .select('id, status, stripe_checkout_session_id')
        .eq('user_id', userId)
        .contains('metadata', { checkout_request_id: checkoutRequestId })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('[Checkout] Could not inspect checkout request id:', error.message);
        return null;
    }
    if (!data) return null;
    if (!data.stripe_checkout_session_id) return { initializing: true };

    try {
        const session = await stripe.checkout.sessions.retrieve(data.stripe_checkout_session_id);
        return session?.url
            ? { sessionId: session.id, url: session.url, status: session.status }
            : { initializing: true };
    } catch (error) {
        console.warn('[Checkout] Existing session lookup failed:', error?.message || error);
        return { initializing: true };
    }
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({
              success: false,
              error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
          });
      }

      // Check if Stripe is configured
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

      if (!stripe || !stripePublishableKey) {
          console.warn('[Checkout] Missing Stripe keys:', {
              hasStripe: !!stripe,
              hasPublishable: !!stripePublishableKey
          });
          return res.status(503).json({
              success: false,
              error: {
                  code: 'PAYMENTS_NOT_CONFIGURED',
                  message: 'Payment processing is not yet configured. Please contact support.',
                  details: 'Stripe keys are missing from environment variables'
              }
          });
      }

      // Validate key format — warn loudly if a test key is used in production
      const keyPrefix = stripeSecretKey.substring(0, 7);
      if (process.env.NODE_ENV === 'production' && keyPrefix === 'sk_test') {
          console.warn('[Checkout] WARNING: Stripe TEST secret key is being used in production');
      }

      try {
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({
                  success: false,
                  error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
              });
          }

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({
                  success: false,
                  error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
              });
          }

          const { type, items, successUrl, cancelUrl } = req.body || {};

          if (!type || !items || !Array.isArray(items) || items.length === 0) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'MISSING_FIELDS', message: 'type and items array required' }
              });
          }

          const checkoutTypes = new Set(['diamonds', 'subscription', 'merchandise']);
          if (!checkoutTypes.has(type)) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'INVALID_TYPE', message: 'Unsupported checkout type' }
              });
          }

          // Reject oversized or malformed carts before any profile write,
          // Stripe customer creation, catalog query, or pending-order insert.
          if (items.length > 50) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'TOO_MANY_ITEMS', message: 'Too many items in one order' }
              });
          }
          if (type === 'subscription' && items.length !== 1) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'INVALID_ITEMS', message: 'A subscription checkout requires one plan' }
              });
          }

          const rawCheckoutRequestId = req.headers['x-checkout-request-id'] || req.headers['x-idempotency-key'];
          const checkoutRequestId = validateCheckoutRequestId(rawCheckoutRequestId);
          if (rawCheckoutRequestId && !checkoutRequestId) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'INVALID_REQUEST_ID', message: 'Invalid checkout request identifier' }
              });
          }
          let preparedCheckout;
          try {
              preparedCheckout = await prepareCheckout(type, items);
          } catch (inputError) {
              if (inputError instanceof CheckoutInputError) {
                  return res.status(inputError.status).json({
                      success: false,
                      error: { code: inputError.code, message: inputError.message }
                  });
              }
              throw inputError;
          }

          const existingCheckout = await findExistingCheckout(type, user.id, checkoutRequestId);
          if (existingCheckout?.url) {
              return res.status(200).json({
                  success: true,
                  duplicate: true,
                  data: {
                      session_id: existingCheckout.sessionId,
                      url: existingCheckout.url
                  }
              });
          }
          if (existingCheckout?.initializing) {
              return res.status(409).json({
                  success: false,
                  error: {
                      code: 'CHECKOUT_INITIALIZING',
                      message: 'This checkout is already being prepared. Please wait a moment.'
                  }
              });
          }

          // Stripe is initialized at module level above

          // Get or create Stripe customer
          let customerId;
          const { data: profile, error: profileReadError } = await getSupabase()
              .from('profiles')
              .select('stripe_customer_id, email, username')
              .eq('id', user.id)
              .maybeSingle();
          if (profileReadError) throw profileReadError;

          if (type === 'subscription') {
              const { data: activeRows, error: activeReadError } = await getSupabase()
                  .from('vip_subscriptions')
                  .select('stripe_subscription_id, status')
                  .eq('user_id', user.id)
                  .in('status', ['active', 'trialing', 'past_due', 'unpaid']);
              if (activeReadError) throw activeReadError;
              const hasCardSubscription = (activeRows || []).some((row) => (
                  row.stripe_subscription_id
                  && !String(row.stripe_subscription_id).startsWith('diamond_')
              ));
              if (hasCardSubscription) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'ACTIVE_SUBSCRIPTION_EXISTS',
                          message: 'You already have an active VIP subscription.'
                      }
                  });
              }

              // Stripe is the final authority if a prior webhook has not yet
              // reached our local ledger.
              if (profile?.stripe_customer_id) {
                  const subscriptions = await stripe.subscriptions.list({
                      customer: profile.stripe_customer_id,
                      status: 'all',
                      limit: 100,
                  });
                  if (subscriptions.data.some((entry) => (
                      ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']
                          .includes(entry.status)
                  ))) {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'ACTIVE_SUBSCRIPTION_EXISTS',
                              message: 'You already have an active VIP subscription.'
                          }
                      });
                  }
              }
          }

          if (profile?.stripe_customer_id) {
              customerId = profile.stripe_customer_id;
          } else {
              try {
                  const customer = await stripe.customers.create({
                      email: profile?.email || user.email,
                      metadata: {
                          smarter_poker_id: user.id,
                          username: profile?.username
                      }
                  });
                  customerId = customer.id;

                  // Save customer ID to profile.
                  //
                  // THIS WRITE IS LORE-BEARING and it used to fail in silence.
                  // Every later subscription webhook -- renewal, cancellation,
                  // payment failure -- finds the user by
                  // profiles.stripe_customer_id. If it is not persisted here the
                  // link never exists, those handlers match zero rows, and they
                  // answered 200 so Stripe never retried. The observable result
                  // was 0 of 1022 profiles carrying a stripe_customer_id.
                  //
                  // .select() makes a zero-row match visible, and a miss is now
                  // fatal to the checkout rather than something the customer
                  // discovers a month later when their renewal does not apply.
                  const { data: linkedRows, error: err_profiles_epk3c } = await getSupabase()
                    .from('profiles')
                    .update({ stripe_customer_id: customerId })
                      .eq('id', user.id)
                      .select('id');
                  if (err_profiles_epk3c) {
                      console.error('[Checkout] FAILED to persist stripe_customer_id for user', user.id, '- every future subscription webhook for this customer will match zero rows:', err_profiles_epk3c.message);
                      throw new Error('Could not link your account to the payment provider. No charge was made. Please try again.');
                  }
                  if (!linkedRows || linkedRows.length === 0) {
                      console.error('[Checkout] stripe_customer_id write MATCHED ZERO ROWS for user', user.id, '- profile missing or not visible to this client.');
                      throw new Error('Could not link your account to the payment provider. No charge was made. Please try again.');
                  }
              } catch (customerError) {
                  console.warn('[Checkout] Failed to create Stripe customer:', {
                      type: customerError.type,
                      code: customerError.code,
                      statusCode: customerError.statusCode,
                      message: customerError.message
                  });
                  throw customerError;
              }
          }

          if (type === 'subscription') {
              const openSessions = await stripe.checkout.sessions.list({
                  customer: customerId,
                  status: 'open',
                  limit: 100,
              });
              if (openSessions.data.some((entry) => entry.mode === 'subscription')) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'SUBSCRIPTION_CHECKOUT_EXISTS',
                          message: 'A VIP subscription checkout is already open for this account.'
                      }
                  });
              }
          }

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';
          const returnRoute = type === 'subscription'
              ? '/hub/vip-membership'
              : type === 'merchandise'
                  ? '/hub/merch-store'
                  : '/hub/diamond-store';

          // SECURITY: Only allow post-checkout redirects to our exact origin.
          // Defaults return each product to its own storefront.
          const safeSuccessUrl = resolveCheckoutRedirect(
              successUrl,
              baseUrl,
              `${returnRoute}?success=true&session_id={CHECKOUT_SESSION_ID}`
          );
          const safeCancelUrl = resolveCheckoutRedirect(
              cancelUrl,
              baseUrl,
              `${returnRoute}?canceled=true`
          );

          let sessionConfig = {
              customer: customerId,
              mode: type === 'subscription' ? 'subscription' : 'payment',
              ...(type !== 'subscription' ? { payment_method_types: ['card'] } : {}),
              success_url: safeSuccessUrl,
              cancel_url: safeCancelUrl,
              metadata: {
                  user_id: user.id,
                  type: type,
                  ...(checkoutRequestId ? { checkout_request_id: checkoutRequestId } : {})
              }
          };

          // Build line items based on type
          if (type === 'diamonds') {
              // Diamond purchase - one-time payment (multi-package, multi-quantity)
              // SECURITY: Every price/diamond amount below is resolved from
              // VALID_DIAMOND_PACKAGES. Client-supplied price/diamonds/bonus are ignored.
              const resolvedPackages = preparedCheckout.resolvedPackages;

              // Use SERVER-SIDE values only — never trust client amounts
              sessionConfig.line_items = resolvedPackages.map(pkg => ({
                  price_data: {
                      currency: 'usd',
                      product_data: {
                          name: pkg.name,
                          description: `${pkg.diamonds} Diamonds${pkg.bonus ? ` + ${pkg.bonus} Bonus` : ''}`,
                          images: ['https://smarter.poker/images/diamond-icon.png']
                      },
                      unit_amount: Math.round(pkg.price * 100) // Convert to cents
                  },
                  quantity: pkg.quantity
              }));

              // Aggregate totals for the single pending purchase row. The Stripe
              // webhook credits diamonds_amount + bonus_diamonds from this row, so
              // the totals here must cover EVERY line item and its quantity.
              const totalDiamonds = resolvedPackages.reduce((sum, pkg) => sum + (pkg.diamonds * pkg.quantity), 0);
              const totalBonus = resolvedPackages.reduce((sum, pkg) => sum + (pkg.bonus * pkg.quantity), 0);
              const totalUsd = Math.round(
                  resolvedPackages.reduce((sum, pkg) => sum + (pkg.price * pkg.quantity), 0) * 100
              ) / 100;
              const packageName = resolvedPackages
                  .map(pkg => (pkg.quantity > 1 ? `${pkg.name} x${pkg.quantity}` : pkg.name))
                  .join(', ')
                  .slice(0, 200);

              // Create pending purchase record with SERVER-SIDE values
              const { data: purchase, error: purchaseInsertErr } = await getSupabase()
                  .from('diamond_purchases')
                  .insert({
                      user_id: user.id,
                      package_name: packageName,
                      diamonds_amount: totalDiamonds,
                      bonus_diamonds: totalBonus,
                      price_usd: totalUsd,
                      status: 'pending',
                      ...(checkoutRequestId
                          ? { metadata: { checkout_request_id: checkoutRequestId } }
                          : {})
                  })
                  .select()
                  .maybeSingle();

              // CRITICAL: never create a payable session without a correlatable DB record —
              // the webhook requires metadata.purchase_id to credit the diamonds.
              if (purchaseInsertErr || !purchase) {
                  console.warn('[Checkout] Failed to create pending diamond purchase:', purchaseInsertErr?.message);
                  return res.status(500).json({
                      success: false,
                      error: { code: 'PURCHASE_RECORD_FAILED', message: 'Could not initialize purchase. Please try again.' }
                  });
              }
              sessionConfig.metadata.purchase_id = purchase.id;

          } else if (type === 'subscription') {
              // VIP subscription
              // SECURITY: The client sends only a plan key ('monthly' | 'annual').
              // The Stripe price ID is resolved SERVER-SIDE from env config, so a
              // client can never pair a cheap price with a premium tier claim.
              const { plan, stripePrice: preparedStripePrice } = preparedCheckout;

              // ── Resolve the price: configured Stripe price, or inline. ──
              let vipTier = plan.tier;

              if (plan.priceId) {
                  // Validate the configured price against Stripe and derive the
                  // tier SERVER-SIDE. A failure here is a deployment
                  // misconfiguration, not a bad client request — and it is NOT
                  // papered over with the fallback, because someone deliberately
                  // pointed at a price and we should say it is wrong rather than
                  // quietly charge a different amount.
                  const stripePrice = preparedStripePrice;
                  vipTier = stripePrice.metadata?.vip_tier
                      || (stripePrice.recurring.interval === 'year' ? 'annual' : plan.tier);

                  sessionConfig.line_items = [{ price: plan.priceId, quantity: 1 }];
              } else {
                  // No price object configured — build the recurring price inline
                  // from the server-side constants above. The amount never comes
                  // from the request body, so this is exactly as tamper-proof as
                  // a price ID.
                  console.warn(
                      `[Checkout] ${plan.envVar} is not set — selling VIP ${plan.key} from the built-in ` +
                      `$${(plan.unitAmount / 100).toFixed(2)}/${plan.interval} price. Set the env var to manage it in Stripe.`
                  );
                  sessionConfig.line_items = [{
                      price_data: {
                          currency: 'usd',
                          unit_amount: plan.unitAmount,
                          recurring: { interval: plan.interval },
                          product_data: {
                              name: plan.label,
                              metadata: { vip_tier: plan.tier },
                          },
                      },
                      quantity: 1,
                  }];
              }

              sessionConfig.metadata.vip_tier = vipTier;
              // Propagate metadata onto the subscription object itself so renewal
              // webhooks (customer.subscription.updated) can see the tier — session
              // metadata is NOT copied to the subscription automatically.
              sessionConfig.subscription_data = {
                  metadata: {
                      user_id: user.id,
                      vip_tier: vipTier
                  }
              };

          } else if (type === 'merchandise') {
              // Catalog identity, stock, quantity, and price were already
              // validated before any Stripe customer or pending-order side
              // effect. Reuse that immutable server-owned result here.
              const { resolvedItems, totalUsd } = preparedCheckout;

              sessionConfig.line_items = resolvedItems.map(item => ({
                  price_data: {
                      currency: 'usd',
                      product_data: {
                          name: item.name,
                          description: item.description,
                          images: item.image
                              ? [new URL(String(item.image).slice(0, 500), baseUrl).toString()]
                              : []
                      },
                      unit_amount: Math.round(item.price * 100)
                  },
                  quantity: item.quantity
              }));

              // Create pending order record (totalUsd already calculated and validated above)
              const { data: order, error: orderInsertErr } = await getSupabase()
                  .from('merchandise_orders')
                  .insert({
                      user_id: user.id,
                      items: resolvedItems,
                      total_usd: totalUsd,
                      status: 'pending',
                      ...(checkoutRequestId
                          ? { metadata: {
                              checkout_request_id: checkoutRequestId,
                              fulfillment_provider: 'printful',
                              fulfillment_status: 'awaiting_payment',
                          } }
                          : { metadata: {
                              fulfillment_provider: 'printful',
                              fulfillment_status: 'awaiting_payment',
                          } })
                  })
                  .select()
                  .maybeSingle();

              // CRITICAL: never create a payable session without a correlatable DB record —
              // the webhook requires metadata.order_id to confirm the order.
              if (orderInsertErr || !order) {
                  console.warn('[Checkout] Failed to create pending merchandise order:', orderInsertErr?.message);
                  return res.status(500).json({
                      success: false,
                      error: { code: 'ORDER_RECORD_FAILED', message: 'Could not initialize order. Please try again.' }
                  });
              }
              sessionConfig.metadata.order_id = order.id;
              sessionConfig.shipping_address_collection = {
                  allowed_countries: ['US', 'CA']
              };
          } else {
              return res.status(400).json({
                  success: false,
                  error: { code: 'INVALID_TYPE', message: 'type must be diamonds, subscription, or merchandise' }
              });
          }

          // Create checkout session
          let session;
          try {
              // Preserve the validated client request identity locally, then
              // namespace it before it reaches Stripe's account-wide keyspace.
              const stripeRequestOptions = checkoutRequestId
                  ? { idempotencyKey: checkoutRequestId }
                  : {};
              stripeRequestOptions.idempotencyKey = type === 'subscription'
                  ? `commerce:vip-subscription:${user.id}:${Math.floor(Date.now() / 3600000)}`
                  : (checkoutRequestId ? `commerce:${type}:${checkoutRequestId}` : undefined);
              session = await stripe.checkout.sessions.create(
                  sessionConfig,
                  stripeRequestOptions.idempotencyKey ? stripeRequestOptions : undefined
              );
          } catch (sessionError) {
              if (type === 'diamonds' && sessionConfig.metadata.purchase_id) {
                  const { data: cleanedRows, error: cleanupError } = await getSupabase()
                      .from('diamond_purchases')
                      .update({ status: 'failed' })
                      .eq('id', sessionConfig.metadata.purchase_id)
                      .eq('status', 'pending')
                      .select('id');
                  if (cleanupError) console.error('[Checkout] Pending diamond cleanup failed:', cleanupError.message);
                  else if (!cleanedRows?.length) console.info('[Checkout] Pending diamond purchase was already terminal');
              }
              if (type === 'merchandise' && sessionConfig.metadata.order_id) {
                  const { data: cleanedRows, error: cleanupError } = await getSupabase()
                      .from('merchandise_orders')
                      .update({ status: 'canceled' })
                      .eq('id', sessionConfig.metadata.order_id)
                      .eq('status', 'pending')
                      .select('id');
                  if (cleanupError) console.error('[Checkout] Pending merchandise cleanup failed:', cleanupError.message);
                  else if (!cleanedRows?.length) console.info('[Checkout] Pending merchandise order was already terminal');
              }
              throw sessionError;
          }

          // Persist the session immediately instead of waiting for payment.
          // This makes abandoned/expired sessions observable and lets the
          // authenticated return-status endpoint reconcile the pending record.
          if (type === 'diamonds' && sessionConfig.metadata.purchase_id) {
              const { data: linkedRows, error: linkError } = await getSupabase()
                  .from('diamond_purchases')
                  .update({ stripe_checkout_session_id: session.id })
                  .eq('id', sessionConfig.metadata.purchase_id)
                  .select('id');
              if (linkError || !linkedRows?.length) {
                  console.error('[Checkout] Could not link diamond purchase to session:', linkError?.message || 'zero rows');
                  await stripe.checkout.sessions.expire(session.id).catch((expireError) => {
                      console.error('[Checkout] Could not expire unlinked diamond session:', expireError?.message || expireError);
                  });
                  throw new Error('Could not finalize checkout. No payment was taken. Please try again.');
              }
          }
          if (type === 'merchandise' && sessionConfig.metadata.order_id) {
              const { data: linkedRows, error: linkError } = await getSupabase()
                  .from('merchandise_orders')
                  .update({ stripe_checkout_session_id: session.id })
                  .eq('id', sessionConfig.metadata.order_id)
                  .select('id');
              if (linkError || !linkedRows?.length) {
                  console.error('[Checkout] Could not link merchandise order to session:', linkError?.message || 'zero rows');
                  await stripe.checkout.sessions.expire(session.id).catch((expireError) => {
                      console.error('[Checkout] Could not expire unlinked merchandise session:', expireError?.message || expireError);
                  });
                  throw new Error('Could not finalize checkout. No payment was taken. Please try again.');
              }
          }

          return res.status(200).json({
              success: true,
              data: {
                  session_id: session.id,
                  url: session.url
              }
          });

      } catch (error) {
          console.warn('[Checkout] FATAL ERROR:', {
              type: error.type,
              code: error.code,
              statusCode: error.statusCode,
              message: error.message,
              rawType: error.rawType,
              detail: error.detail
          });

          // Provide user-friendly error messages based on Stripe error type.
          // Never echo raw internal error messages to the client.
          let userMessage = 'Failed to create checkout session';
          let errorCode = 'CHECKOUT_ERROR';

          if (error.type === 'StripeConnectionError') {
              userMessage = 'Unable to connect to payment processor. Please try again in a moment.';
              errorCode = 'STRIPE_CONNECTION_ERROR';
          } else if (error.type === 'StripeAuthenticationError') {
              userMessage = 'Payment system configuration error. Please contact support.';
              errorCode = 'STRIPE_AUTH_ERROR';
          } else if (error.type === 'StripeInvalidRequestError') {
              userMessage = 'Invalid checkout configuration. Please contact support.';
              errorCode = 'STRIPE_INVALID_REQUEST';
          }

          return res.status(500).json({
              success: false,
              error: {
                  code: errorCode,
                  message: userMessage
              }
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
