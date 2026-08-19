/**
 * GET /api/club-arena/store-catalog
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for every purchasable package shown in the Club Arena
 * marketplace: chip packages, diamond packages and VIP plans.
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
 *   chips    -> pages/api/club-arena/purchase-chips.js  (CHIP_PACKAGES)
 *   diamonds -> pages/api/store/create-checkout-session.js (VALID_DIAMOND_PACKAGES)
 *   vip      -> src/data/diamondStoreData.js (VIP_MEMBERSHIP) + the daily-pass
 *               cost enforced by pages/api/store/purchase-daily-vip.js
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

// Mirrors CHIP_PACKAGES in pages/api/club-arena/purchase-chips.js.
// valuePct is the honest premium over the base rate (small = 100 chips/diamond).
const CHIP_PACKAGES = [
    { id: 'small', chips: 1000, diamonds: 10 },
    { id: 'medium', chips: 5000, diamonds: 45 },
    { id: 'large', chips: 10000, diamonds: 80, popular: true },
    { id: 'mega', chips: 50000, diamonds: 350 },
    { id: 'ultra', chips: 100000, diamonds: 600 },
].map((p) => {
    const base = 1000 / 10;
    const rate = p.chips / p.diamonds;
    return Object.assign({}, p, { valuePct: Math.round(((rate - base) / base) * 100) });
});

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
const DAILY_VIP_DIAMONDS = 150; // DEFAULT_DAILY_COST in purchase-daily-vip.js

const VIP_PLANS = [
    {
        id: 'vip-daily',
        planKey: null,
        checkoutPlan: null,
        name: 'Daily Pass',
        period: '24 hours',
        priceUsd: null,
        priceDiamonds: DAILY_VIP_DIAMONDS,
        features: [
            'All VIP table features for 24h',
            'Rabbit hunt + stack in BB',
            'Great for trying VIP',
        ],
    },
    {
        id: 'vip-monthly',
        planKey: 'monthly',
        checkoutPlan: 'vip-monthly',
        name: 'Monthly VIP',
        period: 'per month',
        priceUsd: 19.99,
        priceDiamonds: Math.round(19.99 * DIAMONDS_PER_DOLLAR),
        features: [
            'All VIP features, all month',
            'Daily + monthly diamond bonuses',
            'Time bank, offline protection, throwables',
            'VIP badge across Smarter.Poker',
        ],
        featured: true,
    },
    {
        id: 'vip-annual',
        planKey: 'annual',
        checkoutPlan: 'vip-annual',
        name: 'Annual VIP',
        period: 'per year',
        priceUsd: 199.99,
        priceDiamonds: Math.round(199.99 * DIAMONDS_PER_DOLLAR),
        features: ['Everything in Monthly', 'Two months free vs monthly', 'Best long-run value'],
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
            const checks = [
                ['vip-daily', vip.daily && vip.daily.price, DAILY_VIP_DIAMONDS],
                ['vip-monthly', vip.monthly && vip.monthly.price, 19.99],
                ['vip-annual', vip.annual && vip.annual.price, 199.99],
            ];
            for (const [id, actual, expected] of checks) {
                if (actual !== undefined && actual !== null && Number(actual) !== Number(expected)) {
                    warnings.push(id + ': catalog says ' + expected + ', diamondStoreData says ' + actual);
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
