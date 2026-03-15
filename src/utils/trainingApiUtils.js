/**
 * Training API Shared Utilities
 * ═══════════════════════════════════════════════════════════════════════════
 * Common functions used across multiple training API routes.
 * Extracted to eliminate code duplication (DRY principle).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Standard 13×13 hand matrix ──────────────────────────────────────────
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Generate all 169 unique hand notations (AA, AKs, AKo, etc.)
 * Used by browse-solutions, grade-range, preflop-ranges
 */
export function getAllHands() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(`${RANKS[r]}${RANKS[c]}`);
            else if (r < c) hands.push(`${RANKS[r]}${RANKS[c]}s`);
            else hands.push(`${RANKS[c]}${RANKS[r]}o`);
        }
    }
    return hands;
}

/**
 * Parse board cards from a scenario hash string.
 * Example: 'hu_cash_BTN_100bb_7h8h2c' → ['7h', '8h', '2c']
 * Used by aggregate-report, browse-solutions, runout-report, tree-navigate
 */
export function parseBoardFromHash(hash) {
    if (!hash) return [];
    const parts = hash.split('_');
    const lastPart = parts[parts.length - 1];
    if (!lastPart || lastPart.length < 4) return [];
    const cards = [];
    for (let i = 0; i < lastPart.length - 1; i += 2) {
        const rank = lastPart[i];
        const suit = lastPart[i + 1];
        if (/[2-9TJQKAtjqka]/.test(rank) && /[shdc]/.test(suit)) {
            cards.push(`${rank.toUpperCase()}${suit}`);
        }
    }
    return cards;
}

/**
 * Extract hero position from a scenario hash string.
 * Example: 'hu_cash_BTN_100bb_7h8h2c' → 'BTN'
 * Used by aggregate-report, browse-solutions
 */
export function extractPositionFromHash(hash) {
    if (!hash) return 'UNK';
    const parts = hash.split('_');
    const positions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    for (const part of parts) {
        if (positions.includes(part.toUpperCase())) return part.toUpperCase();
    }
    return 'UNK';
}

/**
 * Get the number of combos for a hand notation.
 * Pairs = 6, Suited = 4, Offsuit = 12
 * Used by grade-range, preflop-ranges
 */
export function getCombos(hand) {
    if (hand.length === 2) return 6;       // Pair
    if (hand.endsWith('s')) return 4;       // Suited
    return 12;                              // Offsuit
}

/**
 * Rank values for card comparison (2=2, A=14)
 * Used by aggregate-report flop texture classification
 */
export const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ── Input validation constants ──────────────────────────────────────────

/** Valid poker positions for 6-max and heads-up */
export const VALID_POSITIONS = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Valid scenario types for range queries */
export const VALID_SCENARIOS = ['rfi', 'vs3bet', 'bb_defense', 'push_fold'];

/** Valid game type prefixes */
export const VALID_GAME_TYPES = ['hu_cash', 'cash_6max', 'cash_9max', 'mtt', 'sng'];

/** Valid street names */
export const VALID_STREETS = ['preflop', 'flop', 'turn', 'river'];

/**
 * Sanitize a string query parameter — strips non-alphanumeric chars (except _ + -)
 * Prevents injection via query params used in Supabase .ilike() or .eq() calls.
 */
export function sanitizeParam(value, maxLength = 200) {
    if (!value || typeof value !== 'string') return '';
    return value.replace(/[^a-zA-Z0-9_+\-.]/g, '').slice(0, maxLength);
}

// ── Pagination constants ────────────────────────────────────────────────
export const PAGINATION = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
    DEFAULT_PAGE: 1,
};

/**
 * Clamp pagination parameters to safe bounds.
 * Prevents excessively large queries and invalid page numbers.
 *
 * @param {string|number} limit - Requested limit
 * @param {string|number} page - Requested page (1-indexed)
 * @returns {{ limit: number, page: number, offset: number }}
 */
export function clampPagination(limit, page) {
    const l = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT));
    const p = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
    return { limit: l, page: p, offset: (p - 1) * l };
}

// ── Response timing ─────────────────────────────────────────────────────
/**
 * Attach a high-resolution timer to the response.
 * Call at the very top of a handler — it hooks into `res.end()` to set
 * the `X-Response-Time` header automatically (no changes to response body).
 *
 * @param {object} res - Node.js HTTP response
 */
export function withTiming(res) {
    const start = Date.now();
    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
        }
        return originalEnd(...args);
    };
}
