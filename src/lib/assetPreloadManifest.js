/**
 * ═══════════════════════════════════════════════════════════════════
 * ASSET PRELOAD MANIFEST — ORB-8 (The Artist)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Centralized registry of all poker-critical assets that must be
 * warm in the browser / SW cache before a table mounts.
 *
 * Categories:
 *   tableImages  — vertical & horizontal poker table PNGs
 *   cardFaces    — optimised 52-card deck + back
 *   stickers     — game-type sticker badges
 *   feltTextures — table surface / center textures
 *   uiAssets     — wallet backgrounds, action buttons
 */

// ── Helpers ──────────────────────────────────────────────────────────
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];

function buildCardPaths(dir) {
    const paths = [];
    for (const s of SUITS) {
        for (const r of RANKS) paths.push(`${dir}/${s}_${r}.png`);
    }
    return paths;
}

// ── Manifest ─────────────────────────────────────────────────────────
export const POKER_ASSET_MANIFEST = Object.freeze({

    tableImages: Object.freeze([
        '/images/poker-table-vertical-nobg.png',
        '/images/poker-table-black-gold-nobg.png',
        '/images/poker-table-horizontal-nobg.png',
        '/images/poker-table-vertical.png',
    ]),

    cardFaces: Object.freeze([
        ...buildCardPaths('/cards/optimized'),
        '/cards/back.png',
    ]),

    stickers: Object.freeze([
        '/assets/stickers/live.png',
        '/assets/stickers/bounty.png',
        '/assets/stickers/mystery_bounty.png',
        '/assets/stickers/pko.png',
        '/assets/stickers/freeroll.png',
        '/assets/stickers/deep_stack.png',
        '/assets/stickers/super_deep.png',
        '/assets/stickers/turbo.png',
        '/assets/stickers/hyper_turbo.png',
        '/assets/stickers/bomb_pot.png',
        '/assets/stickers/splash_pot.png',
        '/assets/stickers/run_it_twice.png',
        '/assets/stickers/straddle.png',
        '/assets/stickers/call_time.png',
        '/assets/stickers/call_time_game.png',
        '/assets/stickers/rabbit_hunt.png',
        '/assets/stickers/insurance.png',
        '/assets/stickers/6max.png',
        '/assets/stickers/9max.png',
        '/assets/stickers/2max_hu.png',
        '/assets/stickers/guaranteed.png',
        '/assets/stickers/high_roller.png',
        '/assets/stickers/freezeout.png',
        '/assets/stickers/reentry.png',
        '/assets/stickers/addon.png',
        '/assets/stickers/satellite.png',
        '/assets/stickers/shootout.png',
        '/assets/stickers/private_table.png',
        '/assets/stickers/password.png',
        '/assets/stickers/vip_only.png',
        '/assets/stickers/ticket_only.png',
        '/assets/stickers/registering.png',
        '/assets/stickers/starting_soon.png',
        '/assets/stickers/sold_out.png',
        '/assets/stickers/winner_takes_all.png',
        '/assets/stickers/fixed_limit.png',
        '/assets/stickers/vpip_40.png',
        '/assets/stickers/vpip_50.png',
        '/assets/stickers/vpip_60.png',
    ]),

    feltTextures: Object.freeze([
        '/game/table.png',
        '/game/table_center.png',
        '/game/table_only.png',
        '/game/table_optimized.png',
    ]),

    uiAssets: Object.freeze([
        '/assets/club-arena/wallet_bg.png',
        '/assets/club-arena/wallet_owner_bg_web.png',
        '/assets/club-arena/wallet_union_bg.png',
    ]),
});

/**
 * Get a flat list of all asset URLs from the manifest,
 * optionally filtered by category.
 * @param {'all'|'tableImages'|'cardFaces'|'stickers'|'feltTextures'|'uiAssets'} category
 * @returns {string[]}
 */
export function getAssetUrls(category = 'all') {
    if (category === 'all') {
        return [
            ...POKER_ASSET_MANIFEST.tableImages,
            ...POKER_ASSET_MANIFEST.cardFaces,
            ...POKER_ASSET_MANIFEST.stickers,
            ...POKER_ASSET_MANIFEST.feltTextures,
            ...POKER_ASSET_MANIFEST.uiAssets,
        ];
    }
    return [...(POKER_ASSET_MANIFEST[category] || [])];
}
