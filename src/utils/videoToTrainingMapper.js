/**
 * VIDEO → TRAINING MAPPER
 * ═══════════════════════════════════════════════════════════════════════════
 * Converts a video's title, source, and tags into the best matching
 * training game IDs from the 100-game library.
 *
 * Called by the "Train This Spot" flow when a user clicks the button
 * on a video in the Video Library or Social Reels.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { TRAINING_LIBRARY } from '../data/TRAINING_LIBRARY';

// ── Keyword → Game ID weight table ─────────────────────────────────────────
// Each entry: { keywords: string[], gameIds: string[], weight: number }
// weight is additive — a video can match multiple rules.
const KEYWORD_RULES = [
    // Preflop / Range construction
    { keywords: ['preflop', 'open raise', 'rfi', 'range', '3bet', '4bet', 'squeeze'], gameIds: ['cash-001', 'cash-007', 'cash-008', 'adv-004', 'adv-008'], weight: 10 },
    // Continuation bet
    { keywords: ['cbet', 'c-bet', 'continuation', 'flop bet', 'board texture'], gameIds: ['cash-002', 'cash-022'], weight: 10 },
    // River
    { keywords: ['river', 'bluff catch', 'hero call', 'thin value', 'value bet', 'river bet'], gameIds: ['cash-012', 'cash-004', 'cash-005', 'adv-009'], weight: 10 },
    // Turn
    { keywords: ['turn', 'double barrel', 'second barrel', 'barrel'], gameIds: ['cash-002', 'cash-012', 'adv-014'], weight: 8 },
    // Bluffing
    { keywords: ['bluff', 'bluffing', 'semi bluff', 'triple barrel', 'air'], gameIds: ['cash-005', 'mtt-024', 'adv-016'], weight: 10 },
    // Position
    { keywords: ['position', 'in position', 'out of position', 'button', 'btn', 'ip', 'oop'], gameIds: ['cash-006', 'mtt-018'], weight: 8 },
    // Check-raise
    { keywords: ['check raise', 'check-raise', 'trap', 'slow play'], gameIds: ['cash-014', 'mtt-021'], weight: 10 },
    // Overbetting
    { keywords: ['overbet', 'overbetting', 'pot bet', '200%', 'polarized'], gameIds: ['cash-015', 'adv-009'], weight: 10 },
    // Multi-way pots
    { keywords: ['multi-way', 'multiway', '3-way', 'four-way', 'limped'], gameIds: ['cash-016', 'mtt-010'], weight: 9 },
    // ICM / Tournament
    { keywords: ['icm', 'bubble', 'final table', 'pay jump', 'itm', 'tournament', 'mtt'], gameIds: ['mtt-002', 'mtt-003', 'mtt-004', 'mtt-013', 'final-table-sim'], weight: 10 },
    // Push/Fold / Short stack
    { keywords: ['push fold', 'push/fold', 'shove', 'all in', 'short stack', '10bb', '15bb', '20bb'], gameIds: ['mtt-001', 'mtt-008', 'cash-010'], weight: 10 },
    // PKO / Bounties
    { keywords: ['pko', 'bounty', 'knockout', 'progressive'], gameIds: ['mtt-005', 'mtt-020'], weight: 10 },
    // Satellite
    { keywords: ['satellite', 'wsop seat', 'ticket'], gameIds: ['mtt-006'], weight: 10 },
    // Deep stack cash
    { keywords: ['deep stack', '300bb', '200bb', 'deep', 'hcl', 'lodge', 'triton', 'live cash'], gameIds: ['cash-009', 'adv-014'], weight: 8 },
    // Blind vs blind
    { keywords: ['blind vs blind', 'sb vs bb', 'small blind', 'big blind defense'], gameIds: ['cash-018', 'mtt-017'], weight: 9 },
    // 3-bet pots
    { keywords: ['3bet pot', '3-bet pot', '4bet pot', 'raised pot'], gameIds: ['cash-007', 'cash-008'], weight: 10 },
    // Heads up
    { keywords: ['heads up', 'hu', 'one on one', '1v1'], gameIds: ['mtt-015', 'spins-004'], weight: 9 },
    // Spins / SNGs
    { keywords: ['spin', 'sng', 'sit and go', 'sit n go', 'hyper turbo', 'turbo'], gameIds: ['spins-001', 'spins-002', 'spins-004', 'spins-005'], weight: 10 },
    // Equity / Math
    { keywords: ['equity', 'pot odds', 'ev', 'expected value', 'combo', 'combinations'], gameIds: ['adv-005', 'adv-006', 'adv-013', 'hand-lab'], weight: 9 },
    // GTO solver
    { keywords: ['gto', 'solver', 'pio', 'gto wizard', 'node lock', 'tree'], gameIds: ['adv-001', 'adv-003', 'adv-007', 'adv-019'], weight: 10 },
    // Ranges / blockers
    { keywords: ['blocker', 'card removal', 'nut blocker', 'ace blocker'], gameIds: ['adv-002', 'adv-010'], weight: 10 },
    // SPR
    { keywords: ['spr', 'stack to pot', 'pot committed'], gameIds: ['adv-011'], weight: 10 },
    // MDF
    { keywords: ['mdf', 'minimum defense', 'alpha', 'protection'], gameIds: ['adv-012', 'cash-023'], weight: 10 },
    // Bet sizing
    { keywords: ['sizing', 'bet size', 'pot bet', 'quarter pot', 'half pot', 'geometric'], gameIds: ['adv-014', 'cash-002'], weight: 8 },
    // Exploitative plays
    { keywords: ['exploit', 'read', 'population', 'adjust', 'fish', 'reg', 'villain'], gameIds: ['adv-015', 'adv-016', 'cash-005'], weight: 7 },
    // Tilt / mental game
    { keywords: ['tilt', 'mental', 'emotion', 'bad beat', 'cooler', 'suck out'], gameIds: ['psy-001', 'psy-003', 'psy-004'], weight: 9 },
    // Bankroll
    { keywords: ['bankroll', 'shot taking', 'stake', 'limit', 'move up'], gameIds: ['psy-014', 'psy-016'], weight: 8 },
    // Table selection
    { keywords: ['table selection', 'game selection', 'seat selection', 'soft game'], gameIds: ['cash-020'], weight: 9 },
    // Straddle / Live game quirks
    { keywords: ['straddle', 'bomb pot', 'live poker'], gameIds: ['cash-019'], weight: 8 },
    // Rake
    { keywords: ['rake', 'rakeback', 'rakefree', 'no rake'], gameIds: ['cash-017'], weight: 8 },
    // Probing / Donk betting
    { keywords: ['probe', 'donk bet', 'lead', 'donk'], gameIds: ['cash-013', 'cash-011'], weight: 9 },
    // Check-shove
    { keywords: ['check shove', 'check jam', 'check raise jam'], gameIds: ['mtt-021', 'cash-014'], weight: 9 },
    // Stop & go
    { keywords: ['stop and go', 'stop-and-go'], gameIds: ['mtt-019'], weight: 10 },
    // Resteal
    { keywords: ['resteal', 're-steal', '3bet shove', 'blind steal'], gameIds: ['mtt-009'], weight: 10 },
    // Squeeze
    { keywords: ['squeeze', 'squeeze play'], gameIds: ['mtt-010'], weight: 10 },
    // Mixed strategy
    { keywords: ['mixed strategy', 'mixing', 'randomize', 'frequency'], gameIds: ['cash-021', 'adv-005', 'mixed-strategy-lab'], weight: 9 },
    // Board texture
    { keywords: ['board texture', 'dry board', 'wet board', 'connected board', 'monotone'], gameIds: ['cash-022', 'adv-010'], weight: 8 },
    // HCL / Live high stakes
    { keywords: ['hcl', 'hustler', 'lodge', 'triton', 'commerce', 'high stakes', 'live', 'cash game'], gameIds: ['cash-009', 'cash-004', 'cash-006'], weight: 5 },
    // Online poker
    { keywords: ['ggpoker', 'pokerstars', 'online', 'zoom', 'rush'], gameIds: ['cash-001', 'cash-021', 'adv-001'], weight: 4 },
    // Reg
    { keywords: ['reg', 'regular', 'grind', 'volume'], gameIds: ['cash-017', 'cash-021', 'psy-011'], weight: 4 },
];

// Source → preferred game category mapping
const SOURCE_CATEGORY_MAP = {
    'HCL': 'CASH',
    'THE_LODGE': 'CASH',
    'TRITON': 'CASH',
    'WPT': 'MTT',
    'WSOP': 'MTT',
    'EPT': 'MTT',
    'partypoker': 'MTT',
    'ggpoker': 'CASH',
    'pokerstars': 'CASH',
};

/**
 * findBestGames(videoContext) → string[] (ordered by match score, top 3)
 *
 * @param {object} videoContext
 * @param {string} videoContext.title        - Video title
 * @param {string} videoContext.source       - Video source (e.g. 'HCL', 'TRITON')
 * @param {string[]|string} videoContext.tags - Tags array or comma-separated string
 * @returns {string[]} Ordered array of training game IDs (best first, max 3)
 */
export function findBestGames(videoContext = {}) {
    const { title = '', source = '', tags = [] } = videoContext;

    // Normalize search text
    const searchText = [
        title,
        source,
        Array.isArray(tags) ? tags.join(' ') : tags,
    ].join(' ').toLowerCase();

    // Score all games
    const scores = new Map(); // gameId → score

    for (const rule of KEYWORD_RULES) {
        const matched = rule.keywords.some(kw => searchText.includes(kw.toLowerCase()));
        if (matched) {
            for (const gameId of rule.gameIds) {
                scores.set(gameId, (scores.get(gameId) || 0) + rule.weight);
            }
        }
    }

    // Boost games in the preferred category for this source
    const preferredCat = SOURCE_CATEGORY_MAP[source] || SOURCE_CATEGORY_MAP[source?.toUpperCase()];
    if (preferredCat) {
        for (const game of TRAINING_LIBRARY) {
            if (game.category === preferredCat && scores.has(game.id)) {
                scores.set(game.id, (scores.get(game.id) || 0) + 3);
            }
        }
    }

    // Sort by score descending
    const sorted = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

    // Return top 3 unique results, filtered to valid game IDs
    const validIds = new Set(TRAINING_LIBRARY.map(g => g.id));
    const results = sorted.filter(id => validIds.has(id)).slice(0, 3);

    // Fallback: if no matches, return safe defaults by source category
    if (results.length === 0) {
        if (preferredCat === 'MTT') return ['mtt-001', 'mtt-002', 'mtt-003'];
        if (preferredCat === 'CASH') return ['cash-001', 'cash-002', 'cash-003'];
        return ['cash-001', 'adv-001', 'mtt-001']; // universal fallback
    }

    return results;
}

/**
 * getVideoContext(queryParams) → object
 * Safely extracts and validates video context from URL query params.
 */
export function getVideoContext(query = {}) {
    return {
        vid: query.vid || null,
        title: (query.title || '').slice(0, 150),
        source: (query.source || '').slice(0, 50),
        tags: query.tags ? String(query.tags).split(',').map(t => t.trim()).filter(Boolean) : [],
        ref: query.ref || null,
    };
}
