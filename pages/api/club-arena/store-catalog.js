/**
 * GET /api/club-arena/store-catalog
 * ═══════════════════════════════════════════════════════════════════════════
 * Public catalog boundary for every purchasable package shown in the Club
 * Arena marketplace: Diamond packages and VIP plans. (Chip packages retired.)
 *
 * WHY THIS EXISTS (audit 2026-08-19):
 * The marketplace hard-coded all three tables in
 * src/pages/marketplace/marketplaceShared.ts. That was never an authorization
 * hole (the client only ever sends ids -- the charging routes read their own
 * server-side tables), but it WAS a truth-in-advertising hole: change the
 * Large diamond pack to $55 in create-checkout-session.js and the marketplace
 * would keep rendering "$50.00" while charging $55.
 *
 * The values below come from the same authority as the routes that charge:
 *   chips    -> RETIRED 2026-08-19, chips are never sold for diamonds
 *   diamonds -> public.diamond_packages through diamondPackageCatalog.mjs
 *   vip      -> src/data/diamondStoreData.js (VIP_MEMBERSHIP). The three
 *               terms are monthly, yearly and lifetime (Dan 2026-09-05); the
 *               Daily Pass and its endpoint were retired the same day.
 *
 * VIP prices are asserted against diamondStoreData at request time (verify()),
 * so drift surfaces as an explicit `warnings` array instead of a silent lie to
 * the buyer.
 *
 * Public data, no secrets: cacheable at the edge.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { createClient } from '../../../src/lib/supabaseServerClient';
import {
    DIAMOND_STOREFRONT_FALLBACK_PACKAGES,
    loadDiamondStorefrontPackages,
} from '../../../src/lib/store/diamondStorefrontCatalog.mjs';

// RETIRED 2026-08-19 — chips can NEVER be bought with diamonds (product rule,
// Dan). Diamonds are the global purchasable currency; chips are a per-club
// gambling balance, and the two never convert. The catalog must not advertise a
// conversion that no longer exists — /api/club-arena/purchase-chips returns 410.
//
// Kept as an empty export rather than a deleted field so an older cached bundle
// asking for it degrades to [] instead of undefined.
const CHIP_PACKAGES = [];

let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Store catalog database is not configured');
        supabase = createClient(url, key);
    }
    return supabase;
}

// 1 diamond = $0.01 (DIAMONDS_PER_DOLLAR = 100 in purchase-vip-with-diamonds.js)
const DIAMONDS_PER_DOLLAR = 100;

const VIP_PLANS = [
    {
        id: 'vip-monthly',
        planKey: 'monthly',
        checkoutPlan: 'vip-monthly',
        cardCheckoutReady: true,
        name: 'Monthly VIP',
        period: 'Per Month',
        priceUsd: 19.99,
        priceDiamonds: Math.round(19.99 * DIAMONDS_PER_DOLLAR),
        features: [
            'All VIP Features, All Month',
            'Daily + Monthly Diamond Bonuses',
            'Time Bank, Offline Protection, Throwables',
            'VIP Badge Across Smarter.Poker',
        ],
        featured: true,
    },
    {
        id: 'vip-yearly',
        planKey: 'yearly',
        checkoutPlan: 'vip-yearly',
        cardCheckoutReady: true,
        name: 'Yearly VIP',
        period: 'Per Year',
        priceUsd: 199.99,
        priceDiamonds: Math.round(199.99 * DIAMONDS_PER_DOLLAR),
        features: ['Everything In Monthly', 'Two Months Free Vs Monthly', 'Best Long-Run Value'],
    },
    {
        id: 'vip-lifetime',
        planKey: 'lifetime',
        /* Keep the public catalog aligned with the storefront and server gate.
           The dormant one-time settlement path remains available for recovery,
           but new Card checkouts stay paused until the complete refund,
           dispute, and cross-method provenance lifecycle is published. */
        checkoutPlan: 'vip-lifetime',
        oneTime: true,
        cardCheckoutReady: false,
        name: 'Lifetime VIP',
        period: 'One Payment',
        priceUsd: 499,
        priceDiamonds: Math.round(499 * DIAMONDS_PER_DOLLAR),
        features: ['Every VIP Feature, Permanently', 'Never Renews, Never Expires', 'One Payment'],
    },
];

// Categories a club shop item can use -- mirrors VALID_CATEGORIES in
// manage-shop.js, with what each category grants on redeem.
const SHOP_CATEGORIES = [
    { name: 'Time Banks', grantType: 'time_bank', grantUnit: 'uses', secondsPerUse: 20 },
    { name: 'Table Skins', grantType: 'table_skin', grantUnit: null },
    { name: 'Throwables', grantType: 'throwable', grantUnit: 'throws' },
    { name: 'Emotes', grantType: 'emote_pack', grantUnit: null },
    { name: 'Avatars', grantType: 'avatar', grantUnit: null },
    { name: 'Exclusive', grantType: 'none', grantUnit: null },
];

/**
 * Compare this file's copies against the module that actually prices VIP.
 * Never throws -- a drift is reported, not fatal, so the storefront still loads.
 */
function verify() {
    const warnings = [];
    try {
        const store = require('../../../src/data/diamondStoreData');
        const vip = store && store.VIP_MEMBERSHIP;
        if (vip) {
            /* PRESENCE IS PART OF THE CHECK (2026-09-05). The old version
               compared prices with `if (actual !== undefined && ...)`, so a
               plan that DISAPPEARED from diamondStoreData - exactly what
               happened to the Daily Pass, and what a rename does to 'annual' -
               made the drift check go silent instead of firing. A missing plan
               is the loudest drift there is. */
            const checks = [
                ['vip-monthly', vip.monthly, 19.99],
                ['vip-yearly', vip.yearly, 199.99],
                ['vip-lifetime', vip.lifetime, 499],
            ];
            for (const [id, entry, expected] of checks) {
                if (!entry) {
                    warnings.push(id + ': catalog sells it, diamondStoreData has no such plan');
                    continue;
                }
                if (Number(entry.price) !== Number(expected)) {
                    warnings.push(id + ': catalog says ' + expected + ', diamondStoreData says ' + entry.price);
                }
            }
            for (const retired of ['daily', 'annual']) {
                if (vip[retired]) {
                    warnings.push('vip-' + retired + ': retired on 2026-09-05 but still in diamondStoreData');
                }
            }
        }
    } catch (_e) {
        // diamondStoreData is optional here; absence is not a drift.
    }
    return warnings;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'GET only' });
        }
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const strict = req.query?.strict === 'true' || req.query?.strict === '1';
        let diamondCatalog;
        try {
            diamondCatalog = await loadDiamondStorefrontPackages(getSupabase(), {
                allowFallback: !strict,
                cacheMs: strict ? 0 : undefined,
            });
        } catch (catalogError) {
            console.warn('[store-catalog] current Diamond package catalog unavailable:', catalogError);
            if (strict) {
                return res.status(503).json({
                    success: false,
                    error: 'Current Diamond Pricing Could Not Be Verified. Please Try Again.',
                });
            }
            diamondCatalog = {
                packages: DIAMOND_STOREFRONT_FALLBACK_PACKAGES,
                source: 'fallback',
            };
        }

        const warnings = verify();
        if (warnings.length > 0) {
            console.warn('[store-catalog] price drift detected:', warnings.join(' | '));
        }

        // Repricing, activation, and credit changes must reach the package rail
        // before a member can authorize Stripe. This public response contains
        // no credentials, but it is intentionally never served stale.
        res.setHeader('Cache-Control', 'public, no-store, max-age=0');
        return res.status(200).json({
            success: true,
            chipPackages: CHIP_PACKAGES,
            diamondPackages: diamondCatalog.packages.map((pkg) => ({
                ...pkg,
                priceUsd: pkg.price,
            })),
            diamondCatalogSource: diamondCatalog.source,
            vipPlans: VIP_PLANS,
            shopCategories: SHOP_CATEGORIES,
            diamondsPerDollar: DIAMONDS_PER_DOLLAR,
            warnings,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* sentry optional */ }
        console.warn('[store-catalog]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
