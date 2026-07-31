import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Create Stripe Checkout Session
 * POST /api/store/create-checkout-session
 * Creates a Stripe checkout session for diamonds, VIP, or merchandise
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE DIAMOND PACKAGE DEFINITIONS (source of truth)
// Client-submitted prices/amounts are NEVER trusted.
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// VIP SUBSCRIPTION PLANS (server-side, env-driven price IDs)
// The client sends ONLY a plan key. Price IDs are never accepted from
// the client — otherwise a cheap price could be paired with a premium
// tier claim and the webhook would grant VIP based on the claim.
// ═══════════════════════════════════════════════════════════════
const VIP_SUBSCRIPTION_PLANS = {
    monthly: { tier: 'monthly', envVar: 'STRIPE_VIP_MONTHLY_PRICE_ID' },
    annual:  { tier: 'annual',  envVar: 'STRIPE_VIP_ANNUAL_PRICE_ID' },
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
    };
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

          const token = authHeader.replace('Bearer ', '');
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

          // Stripe is initialized at module level above

          // Get or create Stripe customer
          let customerId;
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('stripe_customer_id, email, username')
              .eq('id', user.id)
              .maybeSingle();

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

                  // Save customer ID to profile
                  const { error: err_profiles_epk3c } = await getSupabase()
                    .from('profiles')
                    .update({ stripe_customer_id: customerId })
                      .eq('id', user.id);
                  if (err_profiles_epk3c) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_epk3c.message);
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

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';

          // SECURITY: Only allow post-checkout redirects to our own origin
          const safeSuccessUrl = (typeof successUrl === 'string' && successUrl.startsWith(baseUrl))
              ? successUrl
              : `${baseUrl}/hub/diamond-store?success=true&session_id={CHECKOUT_SESSION_ID}`;
          const safeCancelUrl = (typeof cancelUrl === 'string' && cancelUrl.startsWith(baseUrl))
              ? cancelUrl
              : `${baseUrl}/hub/diamond-store?canceled=true`;

          let sessionConfig = {
              customer: customerId,
              mode: type === 'subscription' ? 'subscription' : 'payment',
              success_url: safeSuccessUrl,
              cancel_url: safeCancelUrl,
              metadata: {
                  user_id: user.id,
                  type: type
              }
          };

          // Build line items based on type
          if (type === 'diamonds') {
              // Diamond purchase - one-time payment (multi-package, multi-quantity)
              // SECURITY: Every price/diamond amount below is resolved from
              // VALID_DIAMOND_PACKAGES. Client-supplied price/diamonds/bonus are ignored.
              const resolvedPackages = [];

              for (const clientItem of items) {
                  const serverPackage = resolveDiamondPackage(clientItem);

                  if (!serverPackage) {
                      return res.status(400).json({
                          success: false,
                          error: {
                              code: 'INVALID_PACKAGE',
                              message: `Unknown diamond package: ${clientItem?.packageId ?? clientItem?.id ?? 'unknown'}`
                          }
                      });
                  }

                  const quantity = parseInt(clientItem?.quantity, 10) || 1;
                  if (quantity < 1 || quantity > MAX_DIAMOND_QUANTITY_PER_PACKAGE) {
                      return res.status(400).json({
                          success: false,
                          error: {
                              code: 'INVALID_QUANTITY',
                              message: `Quantity must be 1-${MAX_DIAMOND_QUANTITY_PER_PACKAGE} per package`
                          }
                      });
                  }

                  // Merge duplicate package entries into a single Stripe line item
                  const existing = resolvedPackages.find(p => p.key === serverPackage.key);
                  if (existing) {
                      const merged = existing.quantity + quantity;
                      if (merged > MAX_DIAMOND_QUANTITY_PER_PACKAGE) {
                          return res.status(400).json({
                              success: false,
                              error: {
                                  code: 'INVALID_QUANTITY',
                                  message: `Quantity must be 1-${MAX_DIAMOND_QUANTITY_PER_PACKAGE} per package`
                              }
                          });
                      }
                      existing.quantity = merged;
                  } else {
                      resolvedPackages.push({ ...serverPackage, quantity });
                  }
              }

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
                      status: 'pending'
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
              const item = items[0];
              const plan = resolveVipPlan(item?.plan ?? item?.planId ?? item?.id);

              if (!plan) {
                  return res.status(400).json({
                      success: false,
                      error: {
                          code: 'INVALID_PLAN',
                          message: `Unknown subscription plan: ${item?.plan ?? item?.planId ?? item?.id ?? 'unknown'}`
                      }
                  });
              }

              if (!plan.priceId) {
                  console.warn(`[Checkout] Missing ${plan.envVar} — VIP ${plan.key} subscriptions cannot be sold`);
                  return res.status(503).json({
                      success: false,
                      error: {
                          code: 'SUBSCRIPTIONS_NOT_CONFIGURED',
                          message: 'VIP subscriptions are not available right now. Please contact support.'
                      }
                  });
              }

              // Validate the configured price against Stripe and derive the tier
              // SERVER-SIDE. A failure here is a deployment misconfiguration, not
              // a bad client request.
              let stripePrice;
              try {
                  stripePrice = await stripe.prices.retrieve(plan.priceId);
              } catch (priceErr) {
                  console.warn(`[Checkout] ${plan.envVar} points at an unknown Stripe price:`, plan.priceId, priceErr?.message);
                  return res.status(503).json({
                      success: false,
                      error: {
                          code: 'SUBSCRIPTIONS_NOT_CONFIGURED',
                          message: 'VIP subscriptions are not available right now. Please contact support.'
                      }
                  });
              }
              if (!stripePrice?.active || !stripePrice.recurring) {
                  console.warn(`[Checkout] ${plan.envVar} is not an active recurring price:`, plan.priceId);
                  return res.status(503).json({
                      success: false,
                      error: {
                          code: 'SUBSCRIPTIONS_NOT_CONFIGURED',
                          message: 'VIP subscriptions are not available right now. Please contact support.'
                      }
                  });
              }
              const vipTier = stripePrice.metadata?.vip_tier
                  || (stripePrice.recurring.interval === 'year' ? 'annual' : plan.tier);

              sessionConfig.line_items = [{
                  price: plan.priceId,
                  quantity: 1
              }];

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
              // Merchandise order - one-time payment
              // SECURITY: Validate merchandise prices against server-side catalog.
              // Until a full merchandise_items table exists, enforce sanity checks.
              const MAX_SINGLE_ITEM_USD = 500;
              const MAX_ORDER_TOTAL_USD = 2000;
              const MIN_ITEM_PRICE_USD = 0.50;

              for (const item of items) {
                  if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
                      return res.status(400).json({
                          success: false,
                          error: { code: 'INVALID_ITEM', message: 'Invalid item name' }
                      });
                  }
                  const itemPrice = parseFloat(item.price);
                  if (!Number.isFinite(itemPrice) || itemPrice < MIN_ITEM_PRICE_USD || itemPrice > MAX_SINGLE_ITEM_USD) {
                      return res.status(400).json({
                          success: false,
                          error: { code: 'INVALID_PRICE', message: `Item price must be between $${MIN_ITEM_PRICE_USD} and $${MAX_SINGLE_ITEM_USD}` }
                      });
                  }
                  const qty = parseInt(item.quantity) || 1;
                  if (qty < 1 || qty > 10) {
                      return res.status(400).json({
                          success: false,
                          error: { code: 'INVALID_QUANTITY', message: 'Quantity must be 1-10' }
                      });
                  }
              }

              // SECURITY: Look up server-side prices from merchandise_items table.
              // Items with an 'id' field are validated against the catalog price.
              // Items without an ID (custom/unlisted) fall back to sanity-checked client price.
              const itemIds = items.map(i => i.id).filter(Boolean);
              let catalogPrices = {};
              if (itemIds.length > 0) {
                  const { data: catalogItems } = await getSupabase()
                      .from('merchandise_items')
                      .select('id, name, price_usd, image_url, is_active')
                      .in('id', itemIds)
                      .eq('is_active', true);
                  if (catalogItems) {
                      catalogItems.forEach(ci => { catalogPrices[ci.id] = ci; });
                  }
                  // Reject if any catalogued item ID wasn't found (deleted/inactive)
                  for (const item of items) {
                      if (item.id && !catalogPrices[item.id]) {
                          return res.status(400).json({
                              success: false,
                              error: { code: 'ITEM_NOT_FOUND', message: `Item "${item.name}" is no longer available` }
                          });
                      }
                  }
              }

              // Build line items using server price where available, client price otherwise
              const resolvedItems = items.map(item => {
                  const catalog = item.id ? catalogPrices[item.id] : null;
                  return {
                      name: catalog ? catalog.name : String(item.name).slice(0, 200),
                      price: catalog ? parseFloat(catalog.price_usd) : parseFloat(item.price),
                      image: catalog?.image_url || item.image || null,
                      description: item.description ? String(item.description).slice(0, 500) : undefined,
                      quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 10),
                  };
              });

              const totalUsd = resolvedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
              if (totalUsd > MAX_ORDER_TOTAL_USD) {
                  return res.status(400).json({
                      success: false,
                      error: { code: 'ORDER_TOO_LARGE', message: `Maximum order total is $${MAX_ORDER_TOTAL_USD}` }
                  });
              }

              sessionConfig.line_items = resolvedItems.map(item => ({
                  price_data: {
                      currency: 'usd',
                      product_data: {
                          name: item.name,
                          description: item.description,
                          images: item.image ? [String(item.image).slice(0, 500)] : []
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
                      status: 'pending'
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
          const session = await stripe.checkout.sessions.create(sessionConfig);

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
