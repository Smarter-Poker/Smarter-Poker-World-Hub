import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createHash } from 'node:crypto';
/**
 * Create Stripe Checkout Session
 * POST /api/store/create-checkout-session
 * Creates a Stripe checkout session for diamonds, VIP, or merchandise
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import Stripe from 'stripe';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';
import { vipStripePriceMismatch } from '../../../src/lib/store/vipStripePrice.mjs';
import {
    BLOCKING_RECURRING_VIP_STATUSES,
    STRIPE_VIP_AUTHORITY,
    classifyStripeCheckoutSessionForVip,
    classifyStripeSubscriptionForVip,
    hasBlockingRecurringCardSubscription,
} from '../../../src/lib/store/vipPurchaseGuards.mjs';
import {
    MAX_DIAMOND_QUANTITY_PER_PACKAGE,
    canCreditDiamondWallet,
    getDiamondCheckoutTotals,
    getClubCardCheckoutQuoteFromCatalog,
    loadActiveDiamondPackageCatalog,
    resolveDiamondPackage,
} from '../../../src/lib/store/diamondPackageCatalog.mjs';
const { requireEmailVerified, requireEmailVerifiedByUserId } = require('../../../src/lib/emailVerifiedGate');
const {
    isPrintfulReady,
    resolvePrintfulMapping,
} = require('../../../src/lib/store/printfulFulfillment');
const {
    inspectStripeRuntime,
    isProductionRuntime,
} = require('../../../src/lib/store/stripeRuntimeMode');

const MAX_CHECKOUT_BODY_BYTES = 64 * 1024;
const VIP_SUBSCRIPTION_CHECKOUT_TTL_SECONDS = 60 * 60;
const VIP_SUBSCRIPTION_CLAIM_GRACE_SECONDS = 5 * 60;
const VIP_SUBSCRIPTION_INITIAL_LEASE_SECONDS =
    VIP_SUBSCRIPTION_CHECKOUT_TTL_SECONDS + VIP_SUBSCRIPTION_CLAIM_GRACE_SECONDS;
const CHECKOUT_BODY_FIELDS = new Set([
    'type',
    'items',
    'successUrl',
    'cancelUrl',
    'redemptionIntent',
]);

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Store checkout database is not configured');
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

// DR8 / D16 (Diamond Accounting Standard, Lane D): the price oracle belongs in
// the database, not in this route. The shared package module owns validation,
// caching, and the emergency fallback used by ordinary Diamond purchases.
// Club Shop Card redemption always requires a current database catalog.

async function loadDiamondPackages({ requireCurrent = false } = {}) {
    let result;
    try {
        result = await loadActiveDiamondPackageCatalog(getSupabase(), {
            allowFallback: !requireCurrent,
            cacheMs: requireCurrent ? 0 : undefined,
        });
    } catch (error) {
        console.warn('[Checkout] current diamond_packages catalog unavailable:', error?.message || error);
        throw new CheckoutInputError(
            'DIAMOND_PACKAGE_CATALOG_UNAVAILABLE',
            'Current Card Pricing Could Not Be Verified. Please Try Again.',
            503
        );
    }
    if (result.source === 'fallback') {
        console.warn(
            '[Checkout] diamond_packages unavailable, using the built-in catalog:',
            result.error?.message || result.error
        );
    }
    return result;
}

// ═════════════════════════════════════════════════════════════
// VIP SUBSCRIPTION PLANS (server-side, env-driven price IDs)
// The client sends ONLY a plan key. Price IDs are never accepted from
// the client — otherwise a cheap price could be paired with a premium
// tier claim and the webhook would grant VIP based on the claim.
// ═════════════════════════════════════════════════════════════
// VIP_PRICE_FALLBACK — Daniel's confirmed pricing, in cents, server-side.
// Both paid tiers were unbuyable because STRIPE_VIP_MONTHLY_PRICE_ID and
// STRIPE_VIP_YEARLY_PRICE_ID have never been set in any environment, so every
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
        label: 'Smarter.Poker VIP - Monthly',
    },
    yearly: {
        tier: 'yearly',
        envVar: 'STRIPE_VIP_YEARLY_PRICE_ID',
        unitAmount: 19999,         // $199.99
        interval: 'year',
        label: 'Smarter.Poker VIP - Yearly',
    },
    /* LIFETIME IS NOT IN THIS TABLE ON PURPOSE.
       Dan set it at $499 on 2026-09-05 and it is buyable today - with diamonds,
       through /api/store/purchase-vip-with-diamonds, which the storefront
       offers. It is absent HERE because a lifetime purchase is one payment, not
       a subscription: `mode` at the session build below is `type === 
       'subscription' ? 'subscription' : 'payment'`, prepareCheckout refuses a
       price with no `.recurring`, and handleCheckoutCompleted in
       webhooks/stripe.js has no VIP branch under `mode === 'payment'` at all -
       a one-time VIP session would be paid and grant NOTHING, silently, and
       return 200 so Stripe never retries.
       Adding the card path means a third checkout branch, a webhook branch and
       an idempotent settlement, and it is being done as its own change. Until
       then the storefront must not offer a card button for lifetime. */
};

/**
 * Resolve a client plan key ('monthly' | 'yearly', with an optional 'vip-'
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

function isConcurrentStripeReplay(error) {
    return error?.type === 'StripeIdempotencyError'
        || error?.code === 'idempotency_key_in_use';
}

function isAmbiguousStripeCreateFailure(error) {
    return isConcurrentStripeReplay(error)
        || ['StripeConnectionError', 'StripeAPIError'].includes(error?.type);
}

function vipSubscriptionClaimExpiry(expiresAtSeconds) {
    const stripeExpiry = Number(expiresAtSeconds);
    if (!Number.isSafeInteger(stripeExpiry) || stripeExpiry <= 0) return null;
    return new Date(
        (stripeExpiry + VIP_SUBSCRIPTION_CLAIM_GRACE_SECONDS) * 1000
    ).toISOString();
}

function validateCheckoutRequestId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return /^[a-z0-9][a-z0-9_-]{11,127}$/i.test(trimmed) ? trimmed : null;
}

function computeCheckoutIntentHash(type, preparedCheckout, redemptionIntent = null) {
    let intent;
    if (type === 'diamonds') {
        intent = preparedCheckout.resolvedPackages
            .map(({ key, quantity, diamonds, bonus, price }) => ({
                key, quantity, diamonds, bonus, price,
            }))
            .sort((a, b) => a.key.localeCompare(b.key));
    } else if (type === 'subscription') {
        intent = {
            plan: preparedCheckout.plan.key,
            unitAmount: preparedCheckout.plan.unitAmount,
            interval: preparedCheckout.plan.interval,
        };
    } else if (type === 'vip_lifetime') {
        // No interval: a lifetime term is a price, not a rate.
        intent = { plan: 'lifetime', unitAmount: preparedCheckout.unitAmount };
    } else {
        intent = preparedCheckout.resolvedItems
            .map(({ id, variantId, quantity, price, providerVariant }) => ({
                id,
                variantId: variantId || null,
                quantity,
                price,
                providerVariant: providerVariant || null,
            }))
            .sort((a, b) => `${a.id}:${a.variantId || ''}`.localeCompare(`${b.id}:${b.variantId || ''}`));
    }
    const redemptionIdentity = redemptionIntent?.kind === 'club_shop'
        ? {
            kind: redemptionIntent.kind,
            club_id: redemptionIntent.club_id,
            item_id: redemptionIntent.item_id,
            expected_price: redemptionIntent.expected_price,
            expected_card_charge_cents: redemptionIntent.expected_card_charge_cents,
            package_quote: redemptionIntent.package_quote,
        }
        : redemptionIntent;
    return createHash('sha256')
        .update(JSON.stringify({ type, intent, redemptionIntent: redemptionIdentity }))
        .digest('hex');
}

/**
 * Give request-bound purchase rows a stable primary key without requiring a
 * production schema change. This closes the gap between the database insert
 * and Stripe's response: if the first response is lost, every retry builds the
 * same pending row and therefore sends the same metadata to Stripe under the
 * same idempotency key.
 *
 * The version/variant bits make the first 128 bits of the SHA-256 digest a
 * standards-shaped, name-derived UUID accepted by the existing uuid column.
 */
function deriveCheckoutRecordId(type, userId, checkoutRequestId) {
    const bytes = createHash('sha256')
        .update(`smarter.poker:checkout-record:v1:${type}:${userId}:${checkoutRequestId}`)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normalizeRedemptionIntent(type, raw) {
    if (raw == null) return null;
    if (type !== 'diamonds' || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new CheckoutInputError('INVALID_REDEMPTION_INTENT', 'Invalid card-funded redemption target');
    }
    /* 'vip_daily' was the card-funded Daily Pass: buy diamonds, auto-redeem
       150 of them for 24 hours. The Daily Pass was retired on 2026-09-05 (Dan:
       the terms are monthly, yearly and lifetime) and this intent with it.
       Measured before removing: 0 diamond_purchases have ever carried it, so
       nothing is in flight. An old bundle that still sends it now gets no
       redemption intent at all, which means it simply receives the diamonds it
       paid for - the safe direction. */
    if (raw.kind === 'club_shop'
        && UUID_RE.test(String(raw.clubId || ''))
        && UUID_RE.test(String(raw.itemId || ''))) {
        const expectedPrice = raw.expectedPrice;
        const expectedCardChargeCents = raw.expectedCardChargeCents;
        if (typeof expectedPrice !== 'number'
            || !Number.isSafeInteger(expectedPrice)
            || expectedPrice < 0) {
            throw new CheckoutInputError(
                'CLUB_ITEM_PRICE_CONFIRMATION_REQUIRED',
                'Refresh The Club Shop Before Starting Card Checkout.',
                409
            );
        }
        if (typeof expectedCardChargeCents !== 'number'
            || !Number.isSafeInteger(expectedCardChargeCents)
            || expectedCardChargeCents <= 0) {
            throw new CheckoutInputError(
                'CLUB_CARD_QUOTE_CONFIRMATION_REQUIRED',
                'Refresh The Club Shop Before Starting Card Checkout.',
                409
            );
        }
        return {
            kind: 'club_shop',
            club_id: String(raw.clubId),
            item_id: String(raw.itemId),
            expected_price: expectedPrice,
            expected_card_charge_cents: expectedCardChargeCents,
        };
    }
    throw new CheckoutInputError('INVALID_REDEMPTION_INTENT', 'Invalid card-funded redemption target');
}

const CLUB_SHOP_AVAILABILITY_ERRORS = Object.freeze({
    not_found: ['CLUB_ITEM_NOT_FOUND', 'That Club Shop Item Is No Longer Available.', 404],
    inactive: ['CLUB_ITEM_UNAVAILABLE', 'That Club Shop Item Is No Longer Available.', 409],
    not_yet_available: ['CLUB_ITEM_NOT_YET_AVAILABLE', 'That Club Shop Item Is Not On Sale Yet.', 409],
    no_longer_available: ['CLUB_ITEM_OFFER_ENDED', 'That Club Shop Offer Has Ended.', 409],
    sold_out: ['CLUB_ITEM_SOLD_OUT', 'That Club Shop Item Is Sold Out.', 409],
    already_owned: ['CLUB_ITEM_ALREADY_OWNED', 'You Already Own An Unused Copy Of That Item.', 409],
    limit_reached: ['CLUB_ITEM_LIMIT_REACHED', 'You Have Reached The Purchase Limit For That Item.', 409],
});

function parseRpcJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
}

/**
 * Revalidate a Card-funded Club Shop redemption before any old Stripe URL can
 * be reused. The package, item price, membership, wallet state, and item
 * availability all come from current server-owned database state.
 */
async function preflightClubShopCardRedemption(userId, intent, preparedCheckout, profile) {
    if (!intent || intent.kind !== 'club_shop') return intent;

    const { data: membership, error: membershipError } = await getSupabase()
        .from('club_members')
        .select('club_id')
        .eq('club_id', intent.club_id)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
    if (membershipError) {
        throw new CheckoutInputError(
            'CLUB_MEMBERSHIP_UNAVAILABLE',
            'Club Membership Could Not Be Verified. Please Try Again.',
            503
        );
    }
    if (!membership) {
        throw new CheckoutInputError(
            'CLUB_MEMBERSHIP_REQUIRED',
            'Join This Club Before Purchasing From Its Shop.',
            403
        );
    }

    const [availabilityResult, itemResult] = await Promise.all([
        getSupabase().rpc('fn_shop_item_availability', {
            p_club_id: intent.club_id,
            p_user_id: userId,
            p_item_id: intent.item_id,
        }),
        getSupabase()
            .from('club_shop_items')
            .select('name')
            .eq('club_id', intent.club_id)
            .eq('id', intent.item_id)
            .limit(1)
            .maybeSingle(),
    ]);
    const { data: availabilityRaw, error: availabilityError } = availabilityResult;
    if (availabilityError) {
        throw new CheckoutInputError(
            'CLUB_ITEM_CHECK_UNAVAILABLE',
            'Club Shop Availability Could Not Be Verified. Please Try Again.',
            503
        );
    }

    const availability = parseRpcJson(availabilityRaw);
    if (!availability?.ok) {
        const [code, message, status] = CLUB_SHOP_AVAILABILITY_ERRORS[availability?.reason]
            || ['CLUB_ITEM_UNAVAILABLE', 'That Club Shop Item Is Not Available.', 409];
        throw new CheckoutInputError(code, message, status);
    }

    const expectedPrice = Number(availability.price);
    if (!Number.isSafeInteger(expectedPrice) || expectedPrice < 0) {
        throw new CheckoutInputError(
            'CLUB_ITEM_PRICE_UNAVAILABLE',
            'That Club Shop Item Price Could Not Be Verified. Please Try Again.',
            503
        );
    }
    if (expectedPrice === 0) {
        throw new CheckoutInputError(
            'CARD_NOT_REQUIRED',
            'This Item Is Free. Claim It Without A Card Charge.',
            409
        );
    }
    if (intent.expected_price !== expectedPrice) {
        throw new CheckoutInputError(
            'CLUB_ITEM_PRICE_CHANGED',
            'The Club Shop Item Price Changed. Review The New Price Before Continuing.',
            409
        );
    }
    if (itemResult.error || !itemResult.data?.name) {
        throw new CheckoutInputError(
            'CLUB_ITEM_CHECK_UNAVAILABLE',
            'Club Shop Item Details Could Not Be Verified. Please Try Again.',
            itemResult.error ? 503 : 404
        );
    }

    const walletBalance = Number(profile?.diamonds);
    if (!profile
        || profile.diamonds === null
        || profile.diamonds === ''
        || !Number.isSafeInteger(walletBalance)) {
        throw new CheckoutInputError(
            'DIAMOND_WALLET_UNAVAILABLE',
            'Your Diamond Wallet Could Not Be Verified. Please Try Again.',
            503
        );
    }
    if (walletBalance < 0) {
        throw new CheckoutInputError(
            'DIAMOND_WALLET_DEBT',
            'Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above.',
            409
        );
    }
    if (preparedCheckout.packageCatalogSource !== 'database') {
        throw new CheckoutInputError(
            'DIAMOND_PACKAGE_CATALOG_UNAVAILABLE',
            'Current Card Pricing Could Not Be Verified. Please Try Again.',
            503
        );
    }

    const quote = getClubCardCheckoutQuoteFromCatalog(
        expectedPrice,
        walletBalance,
        preparedCheckout.packageCatalog
    );
    if (!quote) {
        throw new CheckoutInputError(
            'CARD_CHECKOUT_UNAVAILABLE',
            'Card Checkout Is Unavailable For This Item Price.',
            409
        );
    }
    if (intent.expected_card_charge_cents !== quote.cardChargeCents) {
        throw new CheckoutInputError(
            'CARD_QUOTE_CHANGED',
            'The Card Quote Changed. Review The New Charge Before Continuing.',
            409
        );
    }

    const selected = preparedCheckout.resolvedPackages;
    const exactQuote = selected.length === 1
        && selected[0].key === quote.packageId
        && selected[0].quantity === quote.quantity
        && (selected[0].diamonds + selected[0].bonus) * selected[0].quantity
            === quote.diamondsPurchased;
    if (!exactQuote) {
        throw new CheckoutInputError(
            'CARD_QUOTE_CHANGED',
            'The Card Quote Changed. Refresh The Club Shop Before Continuing.',
            409
        );
    }

    return {
        ...intent,
        item_name: String(itemResult.data.name).slice(0, 200),
        expected_price: expectedPrice,
        expected_card_charge_cents: quote.cardChargeCents,
        package_quote: {
            package_id: quote.packageId,
            quantity: quote.quantity,
            unit_price_usd: quote.price,
            card_charge_cents: quote.cardChargeCents,
            card_charge_usd: quote.cardCharge,
            diamonds_credited: quote.diamondsPurchased,
        },
    };
}

/**
 * Resolve and validate every purchasable line before creating a Stripe
 * customer or writing a pending order. Besides removing side effects from bad
 * requests, the returned server-owned values are reused below so validation
 * and charging cannot drift within one request.
 */
async function prepareCheckout(type, items, { requireCurrentDiamondCatalog = false } = {}) {
    if (type === 'diamonds') {
        const packageCatalog = await loadDiamondPackages({ requireCurrent: requireCurrentDiamondCatalog });
        const catalog = packageCatalog.catalog;
        const resolvedPackages = [];
        for (const clientItem of items) {
            const serverPackage = resolveDiamondPackage(clientItem, catalog);
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
        const checkoutTotals = getDiamondCheckoutTotals(resolvedPackages);
        if (!checkoutTotals) {
            throw new CheckoutInputError(
                'INVALID_PACKAGE_CONFIGURATION',
                'The Diamond Package Configuration Could Not Be Verified.',
                503
            );
        }
        return {
            resolvedPackages,
            checkoutTotals,
            packageCatalog: catalog,
            packageCatalogSource: packageCatalog.source,
        };
    }

    if (type === 'vip_lifetime') {
        /* Lifetime is $499 and the amount lives HERE, on the server, exactly
           like VIP_SUBSCRIPTION_PLANS. The client sends only a plan key, never
           a price, so a tampered request cannot buy a permanent membership for
           a dollar. Kept in step with VIP_MEMBERSHIP.lifetime in
           src/data/diamondStoreData.js, which is display-only. */
        const item = items[0];
        const key = String(item?.plan ?? item?.planId ?? item?.id ?? '').replace(/^vip-/, '').toLowerCase();
        if (key !== 'lifetime') {
            throw new CheckoutInputError('INVALID_PLAN', `Unknown lifetime plan: ${key || 'unknown'}`);
        }

        /* STRIPE_VIP_LIFETIME_PRICE_ID is the same deal the two subscription
           terms get: when it is set, the Stripe price object is the source of
           truth and the amount is managed from the dashboard; when it is not,
           the server-side constant below still sells the term rather than
           refusing the sale. Lifetime had no env var at all until now, so it
           was the one term Dan could not reprice without a deploy. */
        const priceId = process.env.STRIPE_VIP_LIFETIME_PRICE_ID || null;
        if (priceId) {
            let stripePrice = null;
            try {
                stripePrice = await stripe.prices.retrieve(priceId);
            } catch (error) {
                console.warn('[Checkout] STRIPE_VIP_LIFETIME_PRICE_ID points at an unknown Stripe price:',
                    priceId, error?.message);
                throw new CheckoutInputError(
                    'LIFETIME_NOT_CONFIGURED',
                    'Lifetime VIP is not available right now. Please contact support.',
                    503
                );
            }
            /* A lifetime term is a price, not a rate. A recurring price here
               would charge the player again every interval for something sold
               as permanent, so refuse it rather than sell it. */
            const lifetimeUnitAmount = Number(stripePrice?.unit_amount);
            if (!stripePrice?.active
                || stripePrice.recurring
                || stripePrice.currency !== 'usd'
                || !Number.isSafeInteger(lifetimeUnitAmount)
                || lifetimeUnitAmount !== 49900) {
                console.warn('[Checkout] STRIPE_VIP_LIFETIME_PRICE_ID is not the fixed $499 USD one-time price:', priceId);
                throw new CheckoutInputError(
                    'LIFETIME_NOT_CONFIGURED',
                    'Lifetime VIP is not available right now. Please contact support.',
                    503
                );
            }
            return {
                unitAmount: lifetimeUnitAmount,
                label: 'Smarter.Poker VIP - Lifetime',
                priceId,
            };
        }

        return { unitAmount: 49900, label: 'Smarter.Poker VIP - Lifetime', priceId: null };
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
            const priceMismatch = vipStripePriceMismatch(stripePrice, plan);
            if (priceMismatch) {
                console.warn(`[Checkout] ${plan.envVar} failed VIP price verification:`, priceMismatch);
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
    const lineIdentities = stockCheckLines.map(
        (line) => `${line.id}\u0000${line.variant_id || ''}`
    );
    if (new Set(lineIdentities).size !== lineIdentities.length) {
        throw new CheckoutInputError(
            'DUPLICATE_LINES',
            'Combine duplicate merchandise options into one cart line'
        );
    }
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
            // A provider mapping outage must not turn the entire store off.
            // The paid order enters the audited manual fulfillment queue.
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

        if (variantId && selectedVariant?.item_id !== item.id) {
            throw new CheckoutInputError(
                'ITEM_NOT_FOUND',
                'That merchandise option is no longer available',
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
            fulfillmentProvider: provider || 'manual',
            providerVariant,
            madeToOrder: itemMetadata.made_to_order === true || provider === 'printful'
                || provider === 'provider_pending',
        };
    });
    const totalUsd = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (totalUsd > MAX_ORDER_TOTAL_USD) {
        throw new CheckoutInputError('ORDER_TOO_LARGE', `Maximum order total is $${MAX_ORDER_TOTAL_USD}`);
    }

    const providerNames = [...new Set(resolvedItems.map(
        (item) => item.fulfillmentProvider || 'manual'
    ))];
    const automaticFulfillment = isPrintfulReady()
        && providerNames.length === 1
        && providerNames[0] === 'printful'
        && resolvedItems.every((item) => !!item.providerVariant);
    return {
        catalogPrices,
        resolvedItems,
        stockCheckLines,
        totalUsd,
        fulfillmentMode: automaticFulfillment ? 'automatic' : 'manual',
        catalogProvider: providerNames.length === 1 ? providerNames[0] : 'mixed',
    };
}

function isMissingStripeCheckout(error) {
    return error?.code === 'resource_missing'
        || (error?.type === 'StripeInvalidRequestError' && Number(error?.statusCode) === 404);
}

async function closeExpiredCheckoutRecord(type, userId, recordId, sessionId) {
    const table = type === 'diamonds'
        ? 'diamond_purchases'
        : type === 'merchandise'
            ? 'merchandise_orders'
            : 'vip_lifetime_purchases';
    const terminalStatus = type === 'merchandise' ? 'canceled' : 'failed';
    const patch = type === 'merchandise'
        ? { status: terminalStatus, updated_at: new Date().toISOString() }
        : { status: terminalStatus };

    // First close a row already linked to this exact Stripe session. If the
    // webhook beat the link write, a still-null link may be claimed by this
    // same session. A different linked session is never overwritten.
    let { data, error } = await getSupabase()
        .from(table)
        .update({ ...patch, stripe_checkout_session_id: sessionId })
        .eq('id', recordId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('stripe_checkout_session_id', sessionId)
        .select('id');
    if (!error && !data?.length) {
        ({ data, error } = await getSupabase()
            .from(table)
            .update({ ...patch, stripe_checkout_session_id: sessionId })
            .eq('id', recordId)
            .eq('user_id', userId)
            .eq('status', 'pending')
            .is('stripe_checkout_session_id', null)
            .select('id'));
    }
    if (error) {
        console.warn(`[Checkout] Could not close expired ${type} checkout:`, error.message);
    }
}

async function inspectLinkedCheckout(type, userId, row) {
    if (!row?.stripe_checkout_session_id) return null;
    try {
        const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
        if (session?.status === 'expired') {
            await closeExpiredCheckoutRecord(type, userId, row.id, session.id);
            return { expired: true, sessionId: session.id };
        }
        return session?.url
            ? { sessionId: session.id, url: session.url, status: session.status }
            : { initializing: true };
    } catch (error) {
        if (isMissingStripeCheckout(error)) {
            await closeExpiredCheckoutRecord(type, userId, row.id, row.stripe_checkout_session_id);
            return { expired: true, sessionId: row.stripe_checkout_session_id };
        }
        console.warn('[Checkout] Existing session lookup failed:', error?.message || error);
        return { initializing: true };
    }
}

function classifyDurableSubscriptionClaimSession(session, claim, {
    customerId,
    userId,
    requestId,
    intentHash,
}) {
    const sessionCustomerId = typeof session?.customer === 'string'
        ? session.customer
        : session?.customer?.id;
    const metadata = session?.metadata || {};
    const exactClaimSession = Boolean(
        claim?.session_id
        && session?.id === claim.session_id
        && sessionCustomerId === customerId
        && session?.mode === 'subscription'
        && metadata.type === 'subscription'
        && metadata.user_id === userId
        && metadata.checkout_request_id === requestId
        && metadata.checkout_intent_hash === intentHash
    );
    if (!exactClaimSession) return 'unknown';
    if (session.status === 'expired') return 'expired';
    if (session.status === 'complete') return 'complete';
    if (session.status === 'open' && typeof session.url === 'string' && session.url) {
        return 'open';
    }
    return 'unknown';
}

async function inspectDurableSubscriptionClaim(claim, identity) {
    if (!claim?.session_id) return { state: 'unknown', session: null };
    try {
        const session = await stripe.checkout.sessions.retrieve(claim.session_id);
        return {
            state: classifyDurableSubscriptionClaimSession(session, claim, identity),
            session,
        };
    } catch (error) {
        // A missing session, transport failure, or provider error is not proof
        // that the payable URL is dead. Preserve the mutex until Stripe can
        // authoritatively classify this exact session.
        console.warn(
            '[Checkout] Durable subscription session lookup failed:',
            error?.message || error
        );
        return { state: 'unknown', session: null };
    }
}

async function expireStripeCheckoutSessionConfirmed(sessionId) {
    let expirationError = null;
    try {
        const expired = await stripe.checkout.sessions.expire(sessionId);
        if (expired?.status === 'expired') return expired;
        expirationError = new Error('Subscription session expiration was not confirmed');
    } catch (error) {
        expirationError = error;
    }

    // A connection can fail after Stripe commits the expiry. Retrieve once so
    // that an ambiguous response does not leave an already-dead URL fenced.
    try {
        const recovered = await stripe.checkout.sessions.retrieve(sessionId);
        if (recovered?.status === 'expired') return recovered;
        throw new Error(
            `Subscription session remains ${recovered?.status || 'unclassified'} after expiration`
        );
    } catch (recoveryError) {
        const error = new Error('Subscription Checkout Expiration Could Not Be Verified.');
        error.cause = recoveryError || expirationError;
        throw error;
    }
}

function classifyStoredCheckout(row, intentHash, linkedInspection = null) {
    const storedHash = row?.metadata?.checkout_intent_hash;
    if (!storedHash || storedHash !== intentHash) return { conflict: true };
    const terminalOrRefunded = ['refunded', 'canceled', 'cancelled'].includes(row.status)
        || row.metadata?.refund_before_settlement === true
        || row.metadata?.stock_restore_pending_return === true
        || ['partial', 'full'].includes(row.metadata?.refund_status);
    // A linked expired/missing Stripe session is resettable even when its
    // webhook already changed the local merchandise row to `canceled`.
    if (linkedInspection?.expired) return linkedInspection;
    if (terminalOrRefunded) return { conflict: true };
    if (linkedInspection) return linkedInspection;
    if (!row.stripe_checkout_session_id) {
        if (!['pending', 'failed'].includes(row.status)) return { conflict: true };
        return {
            resume: true,
            recordId: row.id,
            status: row.status,
            metadata: row.metadata || {},
        };
    }
    return { initializing: true };
}

function vipOwnershipError(type, profile) {
    if (!['subscription', 'vip_lifetime'].includes(type) || profile?.vip_tier !== 'lifetime') {
        return null;
    }
    return {
        code: 'LIFETIME_VIP_ALREADY_OWNED',
        message: type === 'subscription'
            ? 'Lifetime VIP already includes every subscription benefit.'
            : 'You already have Lifetime VIP.',
    };
}

async function findExistingCheckout(type, userId, checkoutRequestId, intentHash) {
    if (!checkoutRequestId || !['diamonds', 'merchandise', 'vip_lifetime'].includes(type)) return null;
    const table = type === 'diamonds'
        ? 'diamond_purchases'
        : type === 'merchandise'
            ? 'merchandise_orders'
            : 'vip_lifetime_purchases';
    const { data, error } = await getSupabase()
        .from(table)
        .select('id, status, stripe_checkout_session_id, metadata')
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
    // Rows created before intent binding cannot prove what the buyer originally
    // authorized. Never attach a new financial payload to a legacy request id;
    // the client must generate a fresh checkout request instead.
    if (!data.metadata?.checkout_intent_hash
        || data.metadata.checkout_intent_hash !== intentHash) return { conflict: true };
    // Inspect a linked Stripe session before classifying a canceled row. The
    // expiration webhook intentionally turns pending merchandise into
    // `canceled`; returning IDEMPOTENCY_CONFLICT first strands the browser's
    // durable request key forever instead of allowing CHECKOUT_EXPIRED reset.
    if (data.stripe_checkout_session_id) {
        const linked = await inspectLinkedCheckout(type, userId, data);
        return classifyStoredCheckout(data, intentHash, linked);
    }
    return classifyStoredCheckout(data, intentHash);
}

async function findActiveLifetimeCheckout(userId) {
    const { data, error } = await getSupabase()
        .from('vip_lifetime_purchases')
        .select('id, status, stripe_checkout_session_id, metadata')
        .eq('user_id', userId)
        .in('status', ['pending', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.status === 'completed') return { owned: true };
    if (!data.stripe_checkout_session_id) return { initializing: true };
    return inspectLinkedCheckout('vip_lifetime', userId, data);
}

export default async function handler(req, res) {
  try {
    setPrivateCommerceResponse(res);
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return res.status(405).json({
              success: false,
              error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
          });
      }

      let subscriptionClaim = null;
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

          let emailGate = requireEmailVerified(user);
          if (!emailGate.ok && typeof user.email_confirmed_at === 'undefined') {
              emailGate = await requireEmailVerifiedByUserId(getSupabase(), user.id);
          }
          if (!emailGate.ok) return res.status(emailGate.status).json(emailGate.body);

          const bodyBytes = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
          if (bodyBytes > MAX_CHECKOUT_BODY_BYTES) {
              return res.status(413).json({
                  success: false,
                  error: { code: 'BODY_TOO_LARGE', message: 'Checkout request body is too large' }
              });
          }
          const unknownFields = Object.keys(req.body || {})
              .filter((field) => !CHECKOUT_BODY_FIELDS.has(field));
          if (unknownFields.length > 0) {
              return res.status(400).json({
                  success: false,
                  error: {
                      code: 'UNKNOWN_FIELDS',
                      message: `Unknown checkout fields: ${unknownFields.join(', ')}`
                  }
              });
          }

          const { type, items, successUrl, cancelUrl, redemptionIntent: rawRedemptionIntent } = req.body || {};

          if (!type || !items || !Array.isArray(items) || items.length === 0) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'MISSING_FIELDS', message: 'type and items array required' }
              });
          }

          /* 'vip_lifetime' is a ONE-TIME VIP purchase ($499, Dan 2026-09-05).
             It is its own type rather than a fourth plan under 'subscription'
             because `mode` below is derived from this string, and a lifetime
             term must not open a Stripe subscription that would renew. */
          const checkoutTypes = new Set(['diamonds', 'subscription', 'merchandise', 'vip_lifetime']);
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
          if (type === 'vip_lifetime' && items.length !== 1) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'INVALID_ITEMS', message: 'A lifetime checkout requires one plan' }
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
          if (type === 'vip_lifetime' && !checkoutRequestId) {
              return res.status(400).json({
                  success: false,
                  error: {
                      code: 'REQUEST_ID_REQUIRED',
                      message: 'A checkout request identifier is required for a lifetime purchase'
                  }
              });
          }
          if (type === 'subscription' && !checkoutRequestId) {
              return res.status(400).json({
                  success: false,
                  error: { code: 'REQUEST_ID_REQUIRED', message: 'A checkout request identifier is required' }
              });
          }
          if (type === 'diamonds' && !checkoutRequestId) {
              return res.status(400).json({
                  success: false,
                  error: {
                      code: 'REQUEST_ID_REQUIRED',
                      message: 'A Checkout Request Identifier Is Required For Diamond Purchases.'
                  }
              });
          }
          if (type === 'merchandise' && !checkoutRequestId) {
              return res.status(400).json({
                  success: false,
                  error: {
                      code: 'REQUEST_ID_REQUIRED',
                      message: 'A Checkout Request Identifier Is Required For Card Purchases.'
                  }
              });
          }
          if (type === 'vip_lifetime') {
              // The UI capability flag mirrors this fail-closed server gate.
              // Lifetime remains available through the atomic Diamond path;
              // card checkout is withheld until refund/dispute provenance and
              // cross-method acquisition state can be introduced together.
              return res.status(503).json({
                  success: false,
                  error: {
                      code: 'LIFETIME_CARD_CHECKOUT_PAUSED',
                      message: 'Lifetime VIP is currently available with Diamonds.'
                  }
              });
          }

          let redemptionIntent;
          try {
              redemptionIntent = normalizeRedemptionIntent(type, rawRedemptionIntent);
              if (redemptionIntent?.kind === 'club_shop' && !checkoutRequestId) {
                  throw new CheckoutInputError(
                      'REQUEST_ID_REQUIRED',
                      'A Checkout Request Identifier Is Required For Club Shop Card Purchases.',
                      400
                  );
              }
          } catch (inputError) {
              if (inputError instanceof CheckoutInputError) {
                  return res.status(inputError.status).json({
                      success: false,
                      error: { code: inputError.code, message: inputError.message }
                  });
              }
              throw inputError;
          }

          /* Authenticate and validate the request shape before revealing payment
             configuration state or touching a catalog/database dependency. An
             anonymous request must always receive the same authentication
             boundary, even during a Stripe configuration incident. */
          const stripeRuntime = inspectStripeRuntime(process.env, {
              requirePublishable: true,
              // Starting a production charge without a configured settlement
              // webhook can take money while leaving fulfillment stranded.
              requireWebhook: isProductionRuntime(process.env),
          });
          if (!stripe || !stripeRuntime.ready) {
              console.warn('[Checkout] Stripe runtime is not safe for payment mutation:', {
                  hasStripe: !!stripe,
                  secretConfigured: stripeRuntime.secretConfigured,
                  publishableConfigured: stripeRuntime.publishableConfigured,
                  webhookConfigured: stripeRuntime.webhookConfigured,
                  keyMode: stripeRuntime.keyMode || 'invalid',
                  productionModeAllowed: stripeRuntime.productionModeAllowed,
              });
              return res.status(503).json({
                  success: false,
                  error: {
                      code: 'PAYMENTS_NOT_CONFIGURED',
                      message: 'Payment Processing Is Temporarily Unavailable. Please Contact Support.'
                  }
              });
          }

          let preparedCheckout;
          try {
              preparedCheckout = await prepareCheckout(type, items, {
                  // Every Diamond payment uses one fresh database snapshot.
                  // This keeps the storefront confirmation, Stripe cents, and
                  // pending Diamond credit on the same operator-owned offer.
                  requireCurrentDiamondCatalog: type === 'diamonds',
              });
          } catch (inputError) {
              if (inputError instanceof CheckoutInputError) {
                  return res.status(inputError.status).json({
                      success: false,
                      error: { code: inputError.code, message: inputError.message }
                  });
              }
              throw inputError;
          }
          // Entitlement and renewal guards MUST run before an old Checkout URL
          // is returned. A user can acquire Lifetime VIP with Diamonds after a
          // card session was opened; handing that still-payable URL back would
          // invite a second $499 charge for an entitlement they already own.
          const { data: profile, error: profileReadError } = await getSupabase()
              .from('profiles')
              .select('stripe_customer_id, email, username, is_vip, vip_tier, diamonds')
              .eq('id', user.id)
              .maybeSingle();
          if (profileReadError) throw profileReadError;

          if (type === 'diamonds') {
              const walletBalance = Number(profile?.diamonds);
              if (!profile
                  || profile.diamonds === null
                  || profile.diamonds === ''
                  || !Number.isSafeInteger(walletBalance)) {
                  return res.status(503).json({
                      success: false,
                      error: {
                          code: 'DIAMOND_WALLET_UNAVAILABLE',
                          message: 'Your Diamond Wallet Could Not Be Verified. Please Try Again.'
                      }
                  });
              }
              if (!canCreditDiamondWallet(walletBalance, preparedCheckout.checkoutTotals?.credit)) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'DIAMOND_WALLET_CAPACITY_EXCEEDED',
                          message: 'This Purchase Would Exceed Your Diamond Wallet Capacity.'
                      }
                  });
              }
          }

          try {
              redemptionIntent = await preflightClubShopCardRedemption(
                  user.id,
                  redemptionIntent,
                  preparedCheckout,
                  profile
              );
          } catch (inputError) {
              if (inputError instanceof CheckoutInputError) {
                  return res.status(inputError.status).json({
                      success: false,
                      error: { code: inputError.code, message: inputError.message }
                  });
              }
              throw inputError;
          }

          // The enriched Club Shop intent carries the current effective item
          // price and exact package quote. Price/package drift therefore
          // conflicts with an earlier request id instead of reusing its URL.
          const checkoutIntentHash = computeCheckoutIntentHash(type, preparedCheckout, redemptionIntent);

          const ownershipError = vipOwnershipError(type, profile);
          if (ownershipError) {
              return res.status(409).json({
                  success: false,
                  error: ownershipError
              });
          }

          if (type === 'subscription' || type === 'vip_lifetime') {
              const { data: activeRows, error: activeReadError } = await getSupabase()
                  .from('vip_subscriptions')
                  .select('stripe_subscription_id, status')
                  .eq('user_id', user.id)
                  .in('status', BLOCKING_RECURRING_VIP_STATUSES);
              if (activeReadError) throw activeReadError;
              const hasCardSubscription = hasBlockingRecurringCardSubscription(activeRows);
              if (hasCardSubscription) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'ACTIVE_SUBSCRIPTION_EXISTS',
                          message: type === 'vip_lifetime'
                              ? 'Cancel your active recurring VIP plan before purchasing Lifetime VIP.'
                              : 'You already have an active VIP subscription.'
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
                  if (subscriptions?.has_more) {
                      return res.status(503).json({
                          success: false,
                          retryable: true,
                          error: {
                              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
                              message: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.'
                          }
                      });
                  }
                  const knownVipPriceIds = Object.values(VIP_SUBSCRIPTION_PLANS)
                      .map((plan) => process.env[plan.envVar]);
                  const subscriptionAuthorities = subscriptions.data
                      .filter((entry) => BLOCKING_RECURRING_VIP_STATUSES.includes(entry.status))
                      .map((entry) => classifyStripeSubscriptionForVip(entry, { knownVipPriceIds }));
                  if (subscriptionAuthorities.includes(STRIPE_VIP_AUTHORITY.VIP)) {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'ACTIVE_SUBSCRIPTION_EXISTS',
                              message: type === 'vip_lifetime'
                                  ? 'Cancel your active recurring VIP plan before purchasing Lifetime VIP.'
                                  : 'You already have an active VIP subscription.'
                          }
                      });
                  }
                  if (subscriptionAuthorities.includes(STRIPE_VIP_AUTHORITY.UNKNOWN)) {
                      return res.status(503).json({
                          success: false,
                          retryable: true,
                          error: {
                              code: 'VIP_ELIGIBILITY_UNAVAILABLE',
                              message: 'VIP Purchase Eligibility Could Not Be Verified. Please Try Again.'
                          }
                      });
                  }
              }
          }

          const existingCheckout = await findExistingCheckout(
              type,
              user.id,
              checkoutRequestId,
              checkoutIntentHash
          );
          if (existingCheckout?.conflict) {
              return res.status(409).json({
                  success: false,
                  error: {
                      code: 'IDEMPOTENCY_CONFLICT',
                      message: 'This checkout request identifier was already used for different items.'
                  }
              });
          }
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
          if (existingCheckout?.expired) {
              return res.status(409).json({
                  success: false,
                  error: {
                      code: 'CHECKOUT_EXPIRED',
                      message: 'That checkout expired. Start a new checkout to continue.'
                  }
              });
          }
          if (existingCheckout?.initializing) {
              return res.status(503).json({
                  success: false,
                  retryable: true,
                  error: {
                      code: 'CHECKOUT_RECOVERY_PENDING',
                      message: 'Your existing checkout is still being recovered. Retry this same request shortly.'
                  }
              });
          }
          if (type === 'vip_lifetime' && !existingCheckout?.resume) {
              const activeLifetimeCheckout = await findActiveLifetimeCheckout(user.id);
              if (activeLifetimeCheckout?.owned) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'LIFETIME_VIP_ALREADY_OWNED',
                          message: 'You already have Lifetime VIP.'
                      }
                  });
              }
              if (activeLifetimeCheckout?.url) {
                  return res.status(200).json({
                      success: true,
                      duplicate: true,
                      data: {
                          session_id: activeLifetimeCheckout.sessionId,
                          url: activeLifetimeCheckout.url
                      }
                  });
              }
              if (activeLifetimeCheckout?.initializing) {
                  return res.status(503).json({
                      success: false,
                      retryable: true,
                      error: {
                          code: 'CHECKOUT_RECOVERY_PENDING',
                          message: 'Your existing Lifetime VIP checkout is still being recovered. Retry shortly.'
                      }
                  });
              }
              // `expired` means the helper closed the old pending row with a
              // session-matched CAS. This fresh request can now claim a row.
          }
          // Stripe is initialized at module level above

          // Get or create Stripe customer
          let customerId;

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
                  }, { idempotencyKey: `commerce:customer:${user.id}` });
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
              if (openSessions?.has_more) {
                  const recoveryError = new Error(
                      'Subscription Checkout Eligibility Exceeded Its Verified Bound.'
                  );
                  recoveryError.checkoutRetryable = true;
                  throw recoveryError;
              }
              const sessionAuthorities = (openSessions?.data || []).map((entry) => ({
                  entry,
                  authority: classifyStripeCheckoutSessionForVip(entry),
              }));
              if (sessionAuthorities.some(({ authority }) => authority === STRIPE_VIP_AUTHORITY.UNKNOWN)) {
                  const recoveryError = new Error(
                      'Subscription Checkout Eligibility Could Not Be Classified.'
                  );
                  recoveryError.checkoutRetryable = true;
                  throw recoveryError;
              }
              const openSubscriptionSessions = sessionAuthorities
                  .filter(({ authority }) => authority === STRIPE_VIP_AUTHORITY.VIP)
                  .map(({ entry }) => entry);
              const matchingSession = openSubscriptionSessions.find((entry) => (
                  entry.metadata?.type === 'subscription'
                  && entry.metadata?.user_id === user.id
                  && entry.metadata?.checkout_request_id === checkoutRequestId
                  && entry.metadata?.checkout_intent_hash === checkoutIntentHash
              ));
              if (openSubscriptionSessions.length > 1
                  || (openSubscriptionSessions.length === 1 && !matchingSession?.url)) {
                  return res.status(409).json({
                      success: false,
                      error: {
                          code: 'SUBSCRIPTION_CHECKOUT_EXISTS',
                          message: 'A VIP subscription checkout is already open for this account.'
                      }
                  });
              }

              const { data: claim, error: claimError } = await getSupabase().rpc(
                  'claim_vip_subscription_checkout',
                  {
                      p_user_id: user.id,
                      p_request_id: checkoutRequestId,
                      p_intent_hash: checkoutIntentHash,
                      // The fence must outlive the payable Stripe URL. A short
                      // initializer lease can expire after an ambiguous create
                      // while Checkout remains payable, reopening the Diamond
                      // race that this claim exists to close.
                      p_lease_seconds: VIP_SUBSCRIPTION_INITIAL_LEASE_SECONDS,
                  }
              );
              if (claimError) throw claimError;
              if (!claim?.claimed) {
                  if (claim?.state === 'open') {
                      subscriptionClaim = { userId: user.id, requestId: checkoutRequestId };
                      const inspection = await inspectDurableSubscriptionClaim(claim, {
                          customerId,
                          userId: user.id,
                          requestId: checkoutRequestId,
                          intentHash: checkoutIntentHash,
                      });
                      const conflictsWithListedSession = Boolean(
                          matchingSession && matchingSession.id !== inspection.session?.id
                      );
                      if (inspection.state === 'open' && !conflictsWithListedSession) {
                          return res.status(200).json({
                              success: true,
                              duplicate: true,
                              data: {
                                  session_id: inspection.session.id,
                                  url: inspection.session.url,
                              }
                          });
                      }
                      if (inspection.state === 'expired') {
                          let releasedRows = null;
                          let releaseError = null;
                          try {
                              const releaseResult = await getSupabase()
                                  .from('vip_subscription_checkout_claims')
                                  .delete()
                                  .eq('user_id', subscriptionClaim.userId)
                                  .eq('request_id', checkoutRequestId)
                                  .eq('intent_hash', checkoutIntentHash)
                                  .eq('state', 'open')
                                  .eq('session_id', inspection.session.id)
                                  .select('session_id');
                              releasedRows = releaseResult?.data || null;
                              releaseError = releaseResult?.error || null;
                          } catch (error) {
                              releaseError = error;
                          }
                          if (releaseError || releasedRows?.length !== 1) {
                              const recoveryError = releaseError instanceof Error
                                  ? releaseError
                                  : new Error('Expired Subscription Checkout Claim Could Not Be Released.');
                              recoveryError.checkoutRetryable = true;
                              recoveryError.preserveSubscriptionClaim = true;
                              throw recoveryError;
                          }
                          subscriptionClaim = null;
                          return res.status(409).json({
                              success: false,
                              error: {
                                  code: 'CHECKOUT_EXPIRED',
                                  message: 'That Checkout Expired. Start A New Checkout To Continue.'
                              }
                          });
                      }
                      const recoveryError = new Error(
                          inspection.state === 'complete'
                              ? 'Completed Subscription Checkout Is Awaiting Entitlement Reconciliation.'
                              : 'Subscription Checkout State Could Not Be Verified.'
                      );
                      recoveryError.checkoutRetryable = true;
                      recoveryError.preserveSubscriptionClaim = true;
                      throw recoveryError;
                  }
                  if (claim?.state === 'vip_entitlement_active') {
                      // This can only be a pre-release recovery edge: the new
                      // mutex prevents creating an overlapping session. Close
                      // an unpaid recovered URL so it cannot later be used.
                      if (matchingSession?.id) {
                          try {
                              await expireStripeCheckoutSessionConfirmed(matchingSession.id);
                          } catch (expirationError) {
                              console.warn(
                                  '[Checkout] Overlapping subscription session expiry remains uncertain:',
                                  expirationError?.message || expirationError
                              );
                              expirationError.checkoutRetryable = true;
                              expirationError.preserveSubscriptionClaim = true;
                              throw expirationError;
                          }
                      }
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'VIP_ENTITLEMENT_ACTIVE',
                              message: 'Your Current VIP Term Is Already Active. Card Checkout Becomes Available After It Ends.'
                          }
                      });
                  }
                  // An initializing response for the same request and intent is
                  // ours. Continue with the same Stripe idempotency key so a
                  // lost create response can be recovered immediately. A
                  // different request is returned by the RPC as `conflict`.
                  if (claim?.state !== 'initializing') {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: claim?.state === 'conflict'
                                  ? 'SUBSCRIPTION_CHECKOUT_EXISTS'
                                  : 'CHECKOUT_RECOVERY_PENDING',
                              message: claim?.state === 'conflict'
                                  ? 'A VIP subscription checkout is already open for this account.'
                                  : 'Your subscription checkout is still being initialized. Retry shortly.'
                          }
                      });
                  }
              }
              subscriptionClaim = { userId: user.id, requestId: checkoutRequestId };

              // A prior Stripe create may have succeeded after this serverless
              // invocation lost its response. Never hand that URL back until
              // the database mutex is re-established and finalized.
              if (matchingSession?.url) {
                  const { data: recovered, error: recoveryError } = await getSupabase().rpc(
                      'complete_vip_subscription_checkout',
                      {
                          p_user_id: subscriptionClaim.userId,
                          p_request_id: subscriptionClaim.requestId,
                          p_session_id: matchingSession.id,
                          p_session_url: matchingSession.url,
                          p_expires_at: vipSubscriptionClaimExpiry(matchingSession.expires_at),
                      }
                  );
                  if (recoveryError || recovered !== true) {
                      const error = recoveryError
                          || new Error('Subscription checkout claim could not be recovered');
                      error.checkoutRetryable = true;
                      error.preserveSubscriptionClaim = true;
                      throw error;
                  }
                  subscriptionClaim = null;
                  return res.status(200).json({
                      success: true,
                      duplicate: true,
                      data: { session_id: matchingSession.id, url: matchingSession.url }
                  });
              }
          }

          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://smarter.poker';
          const returnRoute = (type === 'subscription' || type === 'vip_lifetime')
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
              /* Only a subscription opens a recurring session. 'vip_lifetime'
                 is one payment and must land in `payment` mode, or Stripe
                 would renew a membership that by definition never renews. */
              mode: type === 'subscription' ? 'subscription' : 'payment',
              ...(type !== 'subscription' ? { payment_method_types: ['card'] } : {}),
              ...(type === 'subscription' ? {
                  // Keep payable lifetime bounded and make the database fence
                  // last slightly longer than the exact Stripe session.
                  expires_at: Math.floor(Date.now() / 1000)
                      + VIP_SUBSCRIPTION_CHECKOUT_TTL_SECONDS,
              } : {}),
              success_url: safeSuccessUrl,
              cancel_url: safeCancelUrl,
              metadata: {
                  user_id: user.id,
                  type: type,
                  checkout_intent_hash: checkoutIntentHash,
                  ...(checkoutRequestId ? { checkout_request_id: checkoutRequestId } : {})
              }
          };

          // Build line items based on type
          if (type === 'diamonds') {
              // Diamond purchase - one-time payment (multi-package, multi-quantity)
              // SECURITY: Every price/diamond amount below is resolved from
              // the server catalog. Client prices/diamonds/bonus are ignored.
              const resolvedPackages = preparedCheckout.resolvedPackages;
              const cartSnapshot = resolvedPackages.map((pkg) => ({
                  kind: 'diamonds',
                  id: pkg.key,
                  quantity: pkg.quantity,
              }));

              // Use SERVER-SIDE values only — never trust client amounts
              sessionConfig.line_items = resolvedPackages.map(pkg => ({
                  price_data: {
                      currency: 'usd',
                      product_data: {
                          name: pkg.name,
                          description: `${pkg.diamonds} Diamonds${pkg.bonus ? ` + ${pkg.bonus} Bonus` : ''}`,
                          images: ['https://smarter.poker/images/diamond-icon.png']
                      },
                      unit_amount: pkg.priceCents
                  },
                  quantity: pkg.quantity
              }));

              // Aggregate totals for the single pending purchase row. The Stripe
              // webhook credits diamonds_amount + bonus_diamonds from this row, so
              // the totals here must cover EVERY line item and its quantity.
              const totalDiamonds = preparedCheckout.checkoutTotals.diamonds;
              const totalBonus = preparedCheckout.checkoutTotals.bonus;
              const totalUsd = preparedCheckout.checkoutTotals.cardChargeUsd;
              const packageName = resolvedPackages
                  .map(pkg => (pkg.quantity > 1 ? `${pkg.name} x${pkg.quantity}` : pkg.name))
                  .join(', ')
                  .slice(0, 200);

              // Create pending purchase record with SERVER-SIDE values
              const purchaseMutation = existingCheckout?.resume
                  ? getSupabase().from('diamond_purchases').update({
                      status: 'pending',
                      metadata: {
                          ...existingCheckout.metadata,
                          ...(checkoutRequestId ? { checkout_request_id: checkoutRequestId } : {}),
                          checkout_intent_hash: checkoutIntentHash,
                          cart_snapshot: cartSnapshot,
                          ...(redemptionIntent ? { redemption_intent: redemptionIntent } : {}),
                      },
                  })
                      .eq('id', existingCheckout.recordId)
                      .in('status', ['pending', 'failed'])
                      .is('stripe_checkout_session_id', null)
                  : getSupabase().from('diamond_purchases').insert({
                      user_id: user.id,
                      package_name: packageName,
                      diamonds_amount: totalDiamonds,
                      bonus_diamonds: totalBonus,
                      price_usd: totalUsd,
                      status: 'pending',
                      metadata: {
                          ...(checkoutRequestId ? {
                              checkout_request_id: checkoutRequestId,
                          } : {}),
                          checkout_intent_hash: checkoutIntentHash,
                          cart_snapshot: cartSnapshot,
                          ...(redemptionIntent ? { redemption_intent: redemptionIntent } : {}),
                      }
                  });
              let { data: purchase, error: purchaseInsertErr } = await purchaseMutation
                  .select()
                  .maybeSingle();
              if (purchaseInsertErr?.code === '23505' && checkoutRequestId) {
                  const recovered = await findExistingCheckout(type, user.id, checkoutRequestId, checkoutIntentHash);
                  if (recovered?.conflict) {
                      return res.status(409).json({ success: false, error: {
                          code: 'IDEMPOTENCY_CONFLICT',
                          message: 'This checkout request identifier was already used for different items.'
                      } });
                  }
                  if (recovered?.url) {
                      return res.status(200).json({ success: true, duplicate: true, data: {
                          session_id: recovered.sessionId, url: recovered.url
                      } });
                  }
                  if (recovered?.initializing || !recovered?.resume) {
                      return res.status(503).json({ success: false, retryable: true, error: {
                          code: 'CHECKOUT_RECOVERY_PENDING',
                          message: 'Your checkout is being initialized. Retry this same request shortly.'
                      } });
                  }
                  purchase = { id: recovered.recordId };
                  purchaseInsertErr = null;
              }

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
              // SECURITY: The client sends only a plan key ('monthly' | 'yearly').
              // The Stripe price ID is resolved SERVER-SIDE from env config, so a
              // client can never pair a cheap price with a premium tier claim.
              const { plan } = preparedCheckout;

              // ── Resolve the price: configured Stripe price, or inline. ──
              const vipTier = plan.tier;

              if (plan.priceId) {
                  // Validate the configured price against Stripe and derive the
                  // tier SERVER-SIDE. A failure here is a deployment
                  // misconfiguration, not a bad client request — and it is NOT
                  // papered over with the fallback, because someone deliberately
                  // pointed at a price and we should say it is wrong rather than
                  // quietly charge a different amount.
                  sessionConfig.line_items = [{ price: plan.priceId, quantity: 1 }];
              } else {
                  // No price object configured — build the recurring price inline
                  // from the server-side constants above. The amount never comes
                  // from the request body, so this is exactly as tamper-proof as
                  // a price ID.
                  console.warn(
                      `[Checkout] ${plan.envVar} is not set - selling VIP ${plan.key} from the built-in ` +
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
                      type: 'subscription',
                      vip_tier: vipTier,
                      checkout_request_id: checkoutRequestId,
                      checkout_intent_hash: checkoutIntentHash,
                  }
              };

          } else if (type === 'vip_lifetime') {
              const { unitAmount, label, priceId: lifetimePriceId } = preparedCheckout;

              const lifetimeRecordId = deriveCheckoutRecordId(
                  type,
                  user.id,
                  checkoutRequestId
              );

              /* A pending row FIRST, for the same reason the diamond path has
                 one: the webhook settles by purchase_id, can fire more than
                 once, and can fire for a charge that is later refunded. Never
                 create a payable session without a record it can be settled
                 against - otherwise the money is taken and nothing points at
                 the membership that was owed. */
              const lifetimeMutation = existingCheckout?.resume
                  ? getSupabase().from('vip_lifetime_purchases').update({
                      price_usd: unitAmount / 100,
                      status: 'pending',
                      metadata: {
                          ...existingCheckout.metadata,
                          checkout_request_id: checkoutRequestId,
                          checkout_intent_hash: checkoutIntentHash,
                      },
                  })
                      .eq('id', existingCheckout.recordId)
                      .eq('user_id', user.id)
                      .in('status', ['pending', 'failed'])
                      .is('stripe_checkout_session_id', null)
                  : getSupabase().from('vip_lifetime_purchases').insert({
                      id: lifetimeRecordId,
                      user_id: user.id,
                      price_usd: unitAmount / 100,
                      status: 'pending',
                      metadata: {
                          checkout_request_id: checkoutRequestId,
                          checkout_intent_hash: checkoutIntentHash,
                      },
                  });
              let { data: lifetimeRow, error: lifetimeInsertErr } = await lifetimeMutation
                  .select('id')
                  .maybeSingle();

              if (lifetimeInsertErr?.code === '23505') {
                  /* Two first attempts can both finish their read before either
                     inserts. The deterministic primary key lets exactly one
                     become the initializer. The other request must not create
                     or clean up financial state owned by the winner. */
                  let recovered = await findExistingCheckout(
                      type,
                      user.id,
                      checkoutRequestId,
                      checkoutIntentHash
                  );
                  if (!recovered) recovered = await findActiveLifetimeCheckout(user.id);
                  if (recovered?.conflict) {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'IDEMPOTENCY_CONFLICT',
                              message: 'This checkout request identifier was already used for different items.'
                          }
                      });
                  }
                  if (recovered?.url) {
                      return res.status(200).json({
                          success: true,
                          duplicate: true,
                          data: { session_id: recovered.sessionId, url: recovered.url }
                      });
                  }
                  if (recovered?.owned) {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'LIFETIME_VIP_ALREADY_OWNED',
                              message: 'You already have Lifetime VIP.'
                          }
                      });
                  }
                  if (recovered?.expired) {
                      return res.status(409).json({
                          success: false,
                          error: {
                              code: 'CHECKOUT_EXPIRED',
                              message: 'That checkout expired. Start a new checkout to continue.'
                          }
                      });
                  }
                  return res.status(503).json({
                      success: false,
                      retryable: true,
                      error: {
                          code: 'CHECKOUT_RECOVERY_PENDING',
                          message: 'Your Lifetime VIP checkout is being initialized. Retry this same request shortly.'
                      }
                  });
              }

              if (lifetimeInsertErr || !lifetimeRow) {
                  console.warn('[Checkout] Failed to create pending lifetime purchase:',
                      lifetimeInsertErr?.message);
                  return res.status(500).json({
                      success: false,
                      error: {
                          code: 'PURCHASE_RECORD_FAILED',
                          message: 'Could not initialize purchase. Please try again.'
                      }
                  });
              }

              /* When STRIPE_VIP_LIFETIME_PRICE_ID is configured, charge the
                 Stripe price object itself so the dashboard is the place the
                 amount is changed. `unitAmount` above already came from that
                 same price, so the pending row and the charge cannot disagree.
                 Without it, the inline price still sells the term. Either way
                 there is NO `recurring` block - that is what makes this one
                 payment rather than a subscription. */
              sessionConfig.line_items = [
                  lifetimePriceId
                      ? { price: lifetimePriceId, quantity: 1 }
                      : {
                            price_data: {
                                currency: 'usd',
                                product_data: {
                                    name: label,
                                    description: 'Every VIP feature, permanently. Never renews, never expires.',
                                },
                                unit_amount: unitAmount,
                            },
                            quantity: 1,
                        },
              ];
              sessionConfig.metadata.purchase_id = lifetimeRow.id;
              sessionConfig.metadata.vip_tier = 'lifetime';

          } else if (type === 'merchandise') {
              // Catalog identity, stock, quantity, and price were already
              // validated before any Stripe customer or pending-order side
              // effect. Reuse that immutable server-owned result here.
              const {
                  resolvedItems,
                  totalUsd,
                  fulfillmentMode,
                  catalogProvider,
              } = preparedCheckout;
              const cartSnapshot = resolvedItems.map((item) => ({
                  kind: 'merchandise',
                  id: item.id,
                  variantId: item.variantId || null,
                  quantity: item.quantity,
              }));

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
              const merchandiseMutation = existingCheckout?.resume
                  ? getSupabase().from('merchandise_orders').update({
                      status: 'pending',
                      metadata: {
                          ...existingCheckout.metadata,
                          ...(checkoutRequestId ? { checkout_request_id: checkoutRequestId } : {}),
                          checkout_intent_hash: checkoutIntentHash,
                          cart_snapshot: cartSnapshot,
                          fulfillment_provider: fulfillmentMode === 'automatic' ? catalogProvider : 'manual',
                          catalog_provider: catalogProvider,
                          fulfillment_mode: fulfillmentMode,
                          fulfillment_status: 'awaiting_payment',
                      },
                  })
                      .eq('id', existingCheckout.recordId)
                      .in('status', ['pending', 'failed'])
                      .is('stripe_checkout_session_id', null)
                  : getSupabase().from('merchandise_orders').insert({
                      user_id: user.id,
                      items: resolvedItems,
                      total_usd: totalUsd,
                      status: 'pending',
                      ...(checkoutRequestId
                          ? { metadata: {
                              checkout_request_id: checkoutRequestId,
                              checkout_intent_hash: checkoutIntentHash,
                              cart_snapshot: cartSnapshot,
                              fulfillment_provider: fulfillmentMode === 'automatic' ? catalogProvider : 'manual',
                              catalog_provider: catalogProvider,
                              fulfillment_mode: fulfillmentMode,
                              fulfillment_status: 'awaiting_payment',
                          } }
                          : { metadata: {
                              fulfillment_provider: fulfillmentMode === 'automatic' ? catalogProvider : 'manual',
                              checkout_intent_hash: checkoutIntentHash,
                              cart_snapshot: cartSnapshot,
                              catalog_provider: catalogProvider,
                              fulfillment_mode: fulfillmentMode,
                              fulfillment_status: 'awaiting_payment',
                          } })
                  });
              let { data: order, error: orderInsertErr } = await merchandiseMutation
                  .select()
                  .maybeSingle();
              if (orderInsertErr?.code === '23505' && checkoutRequestId) {
                  const recovered = await findExistingCheckout(type, user.id, checkoutRequestId, checkoutIntentHash);
                  if (recovered?.conflict) {
                      return res.status(409).json({ success: false, error: {
                          code: 'IDEMPOTENCY_CONFLICT',
                          message: 'This checkout request identifier was already used for different items.'
                      } });
                  }
                  if (recovered?.url) {
                      return res.status(200).json({ success: true, duplicate: true, data: {
                          session_id: recovered.sessionId, url: recovered.url
                      } });
                  }
                  if (recovered?.initializing || !recovered?.resume) {
                      return res.status(503).json({ success: false, retryable: true, error: {
                          code: 'CHECKOUT_RECOVERY_PENDING',
                          message: 'Your checkout is being initialized. Retry this same request shortly.'
                      } });
                  }
                  order = { id: recovered.recordId };
                  orderInsertErr = null;
              }

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
                  ? `commerce:vip-subscription:${user.id}:${checkoutRequestId}`
                  : (checkoutRequestId ? `commerce:${type}:${user.id}:${checkoutRequestId}` : undefined);
              session = await stripe.checkout.sessions.create(
                  sessionConfig,
                  stripeRequestOptions.idempotencyKey ? stripeRequestOptions : undefined
              );
          } catch (sessionError) {
              if (type === 'subscription'
                  && subscriptionClaim
                  && isAmbiguousStripeCreateFailure(sessionError)) {
                  // Stripe may already own an open payable session. Keep the
                  // database claim so a Diamond purchase cannot pass the mutex
                  // while this same idempotent request is being recovered.
                  sessionError.checkoutRetryable = true;
                  sessionError.preserveSubscriptionClaim = true;
              }
              if (type === 'vip_lifetime' && sessionConfig.metadata.purchase_id) {
                  if (isAmbiguousStripeCreateFailure(sessionError)) {
                      /* Stripe may have accepted the request even though this
                         invocation never received its response. Keep the
                         deterministic pending row intact: the next request
                         reuses both its purchase ID and Stripe idempotency key,
                         then links the recovered session. A concurrent replay
                         must never mark the winner's row failed. */
                      sessionError.checkoutRetryable = true;
                  } else {
                      const { data: cleanedRows, error: cleanupError } = await getSupabase()
                          .from('vip_lifetime_purchases')
                          .update({ status: 'failed' })
                          .eq('id', sessionConfig.metadata.purchase_id)
                          .eq('user_id', user.id)
                          .eq('status', 'pending')
                          .is('stripe_checkout_session_id', null)
                          .select('id');
                      if (cleanupError) {
                          console.error('[Checkout] Pending Lifetime VIP cleanup failed:', cleanupError.message);
                      } else if (!cleanedRows?.length) {
                          console.info('[Checkout] Pending Lifetime VIP purchase was already linked or terminal');
                      }
                  }
              }
              if (type === 'diamonds' && sessionConfig.metadata.purchase_id) {
                  if (isAmbiguousStripeCreateFailure(sessionError)) {
                      /* The same durable request ID and Stripe idempotency key
                         recover the possibly-created session. Keep the pending
                         purchase settleable if its webhook arrives first. */
                      sessionError.checkoutRetryable = true;
                  } else {
                      const { data: cleanedRows, error: cleanupError } = await getSupabase()
                          .from('diamond_purchases')
                          .update({ status: 'failed' })
                          .eq('id', sessionConfig.metadata.purchase_id)
                          .eq('user_id', user.id)
                          .eq('status', 'pending')
                          .is('stripe_checkout_session_id', null)
                          .select('id');
                      if (cleanupError) {
                          console.error('[Checkout] Pending Diamond cleanup failed:', cleanupError.message);
                      } else if (!cleanedRows?.length) {
                          console.info('[Checkout] Pending Diamond purchase was already linked or terminal');
                      }
                  }
              }
              if (type === 'merchandise' && sessionConfig.metadata.order_id) {
                  if (isAmbiguousStripeCreateFailure(sessionError)) {
                      sessionError.checkoutRetryable = true;
                  } else {
                      const { data: cleanedRows, error: cleanupError } = await getSupabase()
                          .from('merchandise_orders')
                          .update({ status: 'canceled' })
                          .eq('id', sessionConfig.metadata.order_id)
                          .eq('user_id', user.id)
                          .eq('status', 'pending')
                          .is('stripe_checkout_session_id', null)
                          .select('id');
                      if (cleanupError) {
                          console.error('[Checkout] Pending Merchandise cleanup failed:', cleanupError.message);
                      } else if (!cleanedRows?.length) {
                          console.info('[Checkout] Pending Merchandise order was already linked or terminal');
                      }
                  }
              }
              throw sessionError;
          }

          if (type === 'subscription' && subscriptionClaim) {
              const { data: completed, error: completionError } = await getSupabase().rpc(
                  'complete_vip_subscription_checkout',
                  {
                      p_user_id: subscriptionClaim.userId,
                      p_request_id: subscriptionClaim.requestId,
                      p_session_id: session.id,
                      p_session_url: session.url,
                      p_expires_at: vipSubscriptionClaimExpiry(session.expires_at),
                  }
              );
              if (completionError || completed !== true) {
                  try {
                      await expireStripeCheckoutSessionConfirmed(session.id);
                  } catch (expirationError) {
                      console.warn(
                          '[Checkout] Subscription session expiration could not be verified:',
                          expirationError?.message || expirationError
                      );
                      const recoveryError = completionError
                          || new Error('Subscription checkout claim could not be finalized');
                      recoveryError.checkoutRetryable = true;
                      recoveryError.preserveSubscriptionClaim = true;
                      throw recoveryError;
                  }
                  throw completionError || new Error('Subscription checkout claim could not be finalized');
              }
              subscriptionClaim = null;
          }

          // Persist the session immediately instead of waiting for payment.
          // This makes abandoned/expired sessions observable and lets the
          // authenticated return-status endpoint reconcile the pending record.
          if (type === 'vip_lifetime' && sessionConfig.metadata.purchase_id) {
              const { data: linkedRows, error: linkError } = await getSupabase()
                  .from('vip_lifetime_purchases')
                  .update({ stripe_checkout_session_id: session.id })
                  .eq('id', sessionConfig.metadata.purchase_id)
                  .eq('user_id', user.id)
                  .eq('status', 'pending')
                  .is('stripe_checkout_session_id', null)
                  .select('id');
              let lifetimeSessionLinked = !linkError && Boolean(linkedRows?.length);
              if (!lifetimeSessionLinked) {
                  /* A same-key concurrent replay may have linked the identical
                     Stripe session between this update and its result. Treat
                     that as success, but never accept a different session. */
                  const { data: recoveredLink, error: recoveryReadError } = await getSupabase()
                      .from('vip_lifetime_purchases')
                      .select('id')
                      .eq('id', sessionConfig.metadata.purchase_id)
                      .eq('user_id', user.id)
                      .eq('stripe_checkout_session_id', session.id)
                      .maybeSingle();
                  lifetimeSessionLinked = !recoveryReadError && Boolean(recoveredLink);
              }
              if (!lifetimeSessionLinked) {
                  console.error(
                      '[Checkout] Could not link Lifetime VIP purchase to session:',
                      linkError?.message || 'zero rows'
                  );
                  /* Do not expire an ambiguously linked lifetime session. Its
                     metadata still identifies the deterministic purchase row,
                     so a Stripe webhook can settle it and a same-key retry can
                     safely finish the link. */
                  const recoveryError = new Error(
                      'Lifetime VIP Checkout Is Being Recovered. Retry This Same Purchase Shortly.'
                  );
                  recoveryError.checkoutRetryable = true;
                  throw recoveryError;
              }
          }
          if (type === 'diamonds' && sessionConfig.metadata.purchase_id) {
              const { data: linkedRows, error: linkError } = await getSupabase()
                  .from('diamond_purchases')
                  .update({ stripe_checkout_session_id: session.id })
                  .eq('id', sessionConfig.metadata.purchase_id)
                  .eq('user_id', user.id)
                  .eq('status', 'pending')
                  .is('stripe_checkout_session_id', null)
                  .select('id');
              let diamondSessionLinked = !linkError && Boolean(linkedRows?.length);
              if (!diamondSessionLinked) {
                  const { data: recoveredLink, error: recoveryReadError } = await getSupabase()
                      .from('diamond_purchases')
                      .select('id')
                      .eq('id', sessionConfig.metadata.purchase_id)
                      .eq('user_id', user.id)
                      .eq('stripe_checkout_session_id', session.id)
                      .maybeSingle();
                  diamondSessionLinked = !recoveryReadError && Boolean(recoveredLink);
              }
              if (!diamondSessionLinked) {
                  console.error(
                      '[Checkout] Could not link Diamond purchase to session:',
                      linkError?.message || 'zero rows'
                  );
                  const recoveryError = new Error(
                      'Diamond Checkout Is Being Recovered. Retry This Same Purchase Shortly.'
                  );
                  recoveryError.checkoutRetryable = true;
                  throw recoveryError;
              }
          }
          if (type === 'merchandise' && sessionConfig.metadata.order_id) {
              const { data: linkedRows, error: linkError } = await getSupabase()
                  .from('merchandise_orders')
                  .update({ stripe_checkout_session_id: session.id })
                  .eq('id', sessionConfig.metadata.order_id)
                  .eq('user_id', user.id)
                  .eq('status', 'pending')
                  .is('stripe_checkout_session_id', null)
                  .select('id');
              let merchandiseSessionLinked = !linkError && Boolean(linkedRows?.length);
              if (!merchandiseSessionLinked) {
                  const { data: recoveredLink, error: recoveryReadError } = await getSupabase()
                      .from('merchandise_orders')
                      .select('id')
                      .eq('id', sessionConfig.metadata.order_id)
                      .eq('user_id', user.id)
                      .eq('stripe_checkout_session_id', session.id)
                      .maybeSingle();
                  merchandiseSessionLinked = !recoveryReadError && Boolean(recoveredLink);
              }
              if (!merchandiseSessionLinked) {
                  console.error(
                      '[Checkout] Could not link Merchandise order to session:',
                      linkError?.message || 'zero rows'
                  );
                  const recoveryError = new Error(
                      'Merchandise Checkout Is Being Recovered. Retry This Same Purchase Shortly.'
                  );
                  recoveryError.checkoutRetryable = true;
                  throw recoveryError;
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
          if (subscriptionClaim && !error.preserveSubscriptionClaim) {
              try {
                  const { error: releaseError } = await getSupabase().rpc(
                      'release_vip_subscription_checkout',
                      {
                          p_user_id: subscriptionClaim.userId,
                          p_request_id: subscriptionClaim.requestId,
                      }
                  );
                  if (releaseError) {
                      console.warn(
                          '[Checkout] Subscription claim release was refused:',
                          releaseError.message
                      );
                  }
              } catch (releaseError) {
                  console.warn(
                      '[Checkout] Subscription claim release failed:',
                      releaseError?.message || releaseError
                  );
              }
          }
          subscriptionClaim = null;
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

          return res.status(error.checkoutRetryable ? 503 : 500).json({
              success: false,
              ...(error.checkoutRetryable ? { retryable: true } : {}),
              error: {
                  code: error.checkoutRetryable ? 'CHECKOUT_RECOVERY_PENDING' : errorCode,
                  message: error.checkoutRetryable
                      ? 'Your Checkout Is Being Recovered. Retry This Same Purchase Shortly.'
                      : userMessage
              }
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
