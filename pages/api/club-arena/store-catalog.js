/**
 * GET /api/club-arena/store-catalog
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for every purchasable package shown in the Club Arena
 * marketplace: diamond packages and VIP plans. (Chip packages retired.)
 *
 * WHY THIS EXISTS (audit 2026-08-19):
 * The marketplace hard-coded all three tables in
 * src/pages/marketplace/marketplaceShared.ts. That was never an authorization
 * hole (the client only ever sends ids -- the charging routes read their own
 * server-side tables), but it WAS a truth-in-advertising hole: change the
 * Large diamond pack to $55 in create-checkout-session.js and the marketplace
 * would keep rendering "$50.00" while charging $55.
 *
 * The values below mirror the routes that actually charge:
 *   chips    -> RETIRED 2026-08-19, chips are never sold for diamonds
 *   diamonds -> pages/api/store/create-checkout-session.js (VALID_DIAMOND_PACKAGES)
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

// RETIRED 2026-08-19 — chips can NEVER be bought with diamonds (product rule,
// Dan). Diamonds are the global purchasable currency; chips are a per-club
// gambling balance, and the two never convert. The catalog must not advertise a
// conversion that no longer exists — /api/club-arena/purchase-chips returns 410.
//
// Kept as an empty export rather than a deleted field so an older cached bundle
// asking for it degrades to [] instead of undefined.
const CHIP_PACKAGES = [];

// Mirrors VALID_DIAMOND_PACKAGES in pages/api/store/create-checkout-session.js
const DIAMOND_PACKAGES = [
    { id: 'micro', diamonds: 100, priceUsd: 1.0, bonus: 0, name: 'Micro' },
    { id: 'small', diamonds: 500, priceUsd: 5.0, bonus: 0, name: 'Small' },
    { id: 'medium', diamonds: 1000, priceUsd: 10.0, bonus: 0, name: 'Medium' },
    { id: 'standard', diamonds: 2500, priceUsd: 25.0, bonus: 0, name: 'Standard' },
    { id: 'large', diamonds: 5000, priceUsd: 50.0, bonus: 0, name: 'Large', popular: true },
    { id: 'value', diamonds: 10000, priceUsd: 100.0, bonus: 500, name: 'Value' },
    { id: 'premium', diamonds: 25000, priceUsd: 250.0, bonus: 1250, name: 'Premium' },
    { id: 'whale', diamonds: 50000, priceUsd: 500.0, bonus: 2500, name: 'Whale' },
];

// 1 diamond = $0.01 (DIAMONDS_PER_DOLLAR = 100 in purchase-vip-with-diamonds.js)
const DIAMONDS_PER_DOLLAR = 100;

const VIP_PLANS = [
    {
        id: 'vip-monthly',
        planKey: 'monthly',
        checkoutPlan: 'vip-monthly',
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
        name: 'Yearly VIP',
        period: 'Per Year',
        priceUsd: 199.99,
        priceDiamonds: Math.round(199.99 * DIAMONDS_PER_DOLLAR),
        features: ['Everything In Monthly', 'Two Months Free Vs Monthly', 'Best Long-Run Value'],
    },
    {
        id: 'vip-lifetime',
        planKey: 'lifetime',
        /* No checkoutPlan: card checkout for a one-time term is not built (see
           the note in create-checkout-session.js). Diamonds buy it today. */
        checkoutPlan: null,
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

        const warnings = verify();
        if (warnings.length > 0) {
            console.warn('[store-catalog] price drift detected:', warnings.join(' | '));
        }

        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
        return res.status(200).json({
            success: true,
            chipPackages: CHIP_PACKAGES,
            diamondPackages: DIAMOND_PACKAGES,
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
