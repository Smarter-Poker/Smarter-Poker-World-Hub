/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOARD TEXTURE ENGINE — Board Classification & Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Classifies poker boards by texture for postflop scenario selection.
 * Used by the PostflopStrategyEngine to determine correct GTO strategy.
 *
 * Classifications:
 *   - Flush texture: monotone, two-tone, rainbow
 *   - Pair texture: paired, trips, unpaired
 *   - Connectivity: connected, semi-connected, disconnected
 *   - Height: high (broadway), medium, low
 *   - Wetness: composite score 0-10
 *   - Draw potential: flush draws, straight draws, combo draws
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { RANK_VALUES, parseCard } from './DeckEngine';

// ── Texture Types ─────────────────────────────────────────────────────────

export const FLUSH_TEXTURE = { MONOTONE: 'monotone', TWO_TONE: 'two-tone', RAINBOW: 'rainbow' };
export const PAIR_TEXTURE = { TRIPS: 'trips', PAIRED: 'paired', UNPAIRED: 'unpaired' };
export const HEIGHT = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
export const CONNECTIVITY = { CONNECTED: 'connected', SEMI_CONNECTED: 'semi-connected', DISCONNECTED: 'disconnected' };

// ── Board Texture Analysis ────────────────────────────────────────────────

/**
 * Analyze flush texture of a board
 * @param {string[]} board - Array of card strings (e.g., ["As", "Kh", "7s"])
 * @returns {{ texture: string, suitCounts: Object, dominantSuit: string, flushPossible: boolean, flushComplete: boolean }}
 */
export function analyzeFlushTexture(board) {
    const suitCounts = { s: 0, h: 0, d: 0, c: 0 };
    for (const card of board) {
        const suit = card[1];
        if (suitCounts[suit] !== undefined) suitCounts[suit]++;
    }

    const maxCount = Math.max(...Object.values(suitCounts || {}));
    const dominantSuit = Object.keys(suitCounts || {}).find(s => suitCounts[s] === maxCount);

    let texture;
    if (board.length <= 3) {
        texture = maxCount === 3 ? FLUSH_TEXTURE.MONOTONE :
                  maxCount === 2 ? FLUSH_TEXTURE.TWO_TONE :
                  FLUSH_TEXTURE.RAINBOW;
    } else {
        // 4-5 card boards: 3 of a suit just makes a flush possible (three-flush),
        // not a monotone board — bucket it as two-tone. Monotone requires 4+ of
        // one suit or the entire board sharing a suit.
        texture = (maxCount >= 4 || maxCount === board.length) ? FLUSH_TEXTURE.MONOTONE :
                  maxCount >= 2 ? FLUSH_TEXTURE.TWO_TONE :
                  FLUSH_TEXTURE.RAINBOW;
    }

    return {
        texture,
        suitCounts,
        dominantSuit,
        flushPossible: maxCount >= 3,
        flushComplete: maxCount >= 5,
        flushDrawPossible: maxCount >= 2,
    };
}

/**
 * Analyze pair texture of a board
 * @param {string[]} board
 * @returns {{ texture: string, pairedRanks: string[], highestPair: string|null }}
 */
export function analyzePairTexture(board) {
    const rankCounts = {};
    for (const card of board) {
        const rank = card[0];
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(rankCounts || {}));
    const pairedRanks = Object.keys(rankCounts || {}).filter(r => rankCounts[r] >= 2);

    let texture;
    if (maxCount >= 3) texture = PAIR_TEXTURE.TRIPS;
    else if (maxCount >= 2) texture = PAIR_TEXTURE.PAIRED;
    else texture = PAIR_TEXTURE.UNPAIRED;

    // Sort paired ranks by value (highest first)
    pairedRanks.sort((a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0));

    return {
        texture,
        pairedRanks,
        highestPair: pairedRanks[0] || null,
        rankCounts,
    };
}

/**
 * Analyze board height (high card content)
 * @param {string[]} board
 * @returns {{ height: string, broadwayCount: number, avgRank: number, highCard: string }}
 */
export function analyzeHeight(board) {
    const values = board.map(c => RANK_VALUES[c[0]] || 0);
    const broadwayCount = values.filter(v => v >= 10).length; // T, J, Q, K, A
    const avgRank = values.reduce((a, b) => a + b, 0) / values.length;
    const highCard = board.reduce((best, card) =>
        (RANK_VALUES[card[0]] || 0) > (RANK_VALUES[best[0]] || 0) ? card : best, board[0]);

    let height;
    if (broadwayCount >= 2 || avgRank >= 10) height = HEIGHT.HIGH;
    else if (avgRank >= 7) height = HEIGHT.MEDIUM;
    else height = HEIGHT.LOW;

    return { height, broadwayCount, avgRank: Math.round(avgRank * 10) / 10, highCard: highCard[0] };
}

/**
 * Analyze connectivity (straight draw potential)
 * @param {string[]} board
 * @returns {{ connectivity: string, gaps: number[], straightPossible: boolean, straightDraws: number }}
 */
export function analyzeConnectivity(board) {
    const values = [...new Set(board.map(c => RANK_VALUES[c[0]] || 0))].sort((a, b) => a - b);

    // Add ace-low (A=1) if ace present
    if (values.includes(14)) values.unshift(1);

    // Count gaps between consecutive unique values
    const gaps = [];
    for (let i = 1; i < values.length; i++) {
        gaps.push(values[i] - values[i - 1]);
    }

    // Check for straight draws (any 3+ cards within 5-card window)
    let straightDraws = 0;
    let straightPossible = false;
    for (let startVal = 1; startVal <= 10; startVal++) {
        const inWindow = values.filter(v => v >= startVal && v <= startVal + 4).length;
        if (inWindow >= 3) straightDraws++;
        if (inWindow >= 5) straightPossible = true;
    }

    const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
    const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

    let connectivity;
    if (avgGap <= 2 && maxGap <= 3) connectivity = CONNECTIVITY.CONNECTED;
    else if (avgGap <= 4) connectivity = CONNECTIVITY.SEMI_CONNECTED;
    else connectivity = CONNECTIVITY.DISCONNECTED;

    return { connectivity, gaps, straightPossible, straightDraws };
}

/**
 * Calculate overall board wetness score (0-10)
 * Higher = more draws possible, more dynamic board
 * @param {string[]} board
 * @returns {{ wetness: number, factors: Object }}
 */
export function calculateWetness(board) {
    const flush = analyzeFlushTexture(board);
    const pair = analyzePairTexture(board);
    const conn = analyzeConnectivity(board);
    const height = analyzeHeight(board);

    let score = 0;
    const factors = {};

    // Flush draw potential (0-3 points)
    if (flush.texture === FLUSH_TEXTURE.MONOTONE) { score += 3; factors.flush = 3; }
    else if (flush.texture === FLUSH_TEXTURE.TWO_TONE) { score += 1.5; factors.flush = 1.5; }
    else { factors.flush = 0; }

    // Straight draw potential (0-3 points)
    if (conn.straightDraws >= 3) { score += 3; factors.straight = 3; }
    else if (conn.straightDraws >= 2) { score += 2; factors.straight = 2; }
    else if (conn.straightDraws >= 1) { score += 1; factors.straight = 1; }
    else { factors.straight = 0; }

    // Connectivity (0-2 points)
    if (conn.connectivity === CONNECTIVITY.CONNECTED) { score += 2; factors.connectivity = 2; }
    else if (conn.connectivity === CONNECTIVITY.SEMI_CONNECTED) { score += 1; factors.connectivity = 1; }
    else { factors.connectivity = 0; }

    // Pairing reduces wetness (-1 point for paired/trips)
    if (pair.texture !== PAIR_TEXTURE.UNPAIRED) { score -= 1; factors.pairing = -1; }
    else { factors.pairing = 0; }

    // High cards increase dynamic play (+1 for high boards)
    if (height.height === HEIGHT.HIGH) { score += 1; factors.height = 1; }
    else { factors.height = 0; }

    return {
        wetness: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
        factors,
        isDry: score <= 2,
        isWet: score >= 6,
        isMedium: score > 2 && score < 6,
    };
}

// ── Complete Board Analysis ───────────────────────────────────────────────

/**
 * Full board texture analysis — the main export
 * @param {string[]} board - Board cards (3-5 cards)
 * @returns {Object} Complete texture analysis
 */
export function analyzeBoard(board) {
    if (!board || board.length < 3) {
        return { error: 'Board must have at least 3 cards (flop)' };
    }

    const flush = analyzeFlushTexture(board);
    const pair = analyzePairTexture(board);
    const height = analyzeHeight(board);
    const conn = analyzeConnectivity(board);
    const wetness = calculateWetness(board);

    // Generate human-readable description
    const parts = [];
    if (flush.texture === FLUSH_TEXTURE.MONOTONE) parts.push('Monotone');
    else if (flush.texture === FLUSH_TEXTURE.TWO_TONE) parts.push('Two-tone');
    else parts.push('Rainbow');

    if (pair.texture === PAIR_TEXTURE.TRIPS) parts.push('Trips');
    else if (pair.texture === PAIR_TEXTURE.PAIRED) parts.push('Paired');

    parts.push(height.height.charAt(0).toUpperCase() + height.height.slice(1));

    if (conn.connectivity === CONNECTIVITY.CONNECTED) parts.push('Connected');
    else if (conn.connectivity === CONNECTIVITY.DISCONNECTED) parts.push('Disconnected');

    if (wetness.isDry) parts.push('(Dry)');
    else if (wetness.isWet) parts.push('(Wet)');

    return {
        board,
        street: board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river',
        flush,
        pair,
        height,
        connectivity: conn,
        wetness,
        description: parts.join(' '),
        tags: generateTags(flush, pair, height, conn, wetness),
    };
}

/**
 * Generate searchable tags for board filtering
 */
function generateTags(flush, pair, height, conn, wetness) {
    const tags = [];
    tags.push(flush.texture);
    tags.push(pair.texture);
    tags.push(height.height);
    tags.push(conn.connectivity);
    if (wetness.isDry) tags.push('dry');
    if (wetness.isWet) tags.push('wet');
    if (flush.flushPossible) tags.push('flush-possible');
    if (flush.flushDrawPossible) tags.push('flush-draw');
    if (conn.straightPossible) tags.push('straight-possible');
    if (conn.straightDraws > 0) tags.push('straight-draw');
    if (height.broadwayCount >= 2) tags.push('broadway');
    if (height.avgRank <= 6) tags.push('low-board');
    return tags;
}

/**
 * Check if a board matches a texture filter
 * @param {string[]} board
 * @param {Object} filter - e.g., { flush: 'monotone', height: 'high', wet: true }
 * @returns {boolean}
 */
export function matchesBoardFilter(board, filter) {
    const analysis = analyzeBoard(board);
    if (analysis.error) return false;

    if (filter.flush && analysis.flush.texture !== filter.flush) return false;
    if (filter.pair && analysis.pair.texture !== filter.pair) return false;
    if (filter.height && analysis.height.height !== filter.height) return false;
    if (filter.connectivity && analysis.connectivity.connectivity !== filter.connectivity) return false;
    if (filter.wet === true && !analysis.wetness.isWet) return false;
    if (filter.dry === true && !analysis.wetness.isDry) return false;
    if (filter.tag && !analysis.tags.includes(filter.tag)) return false;

    return true;
}

export default {
    analyzeBoard,
    analyzeFlushTexture,
    analyzePairTexture,
    analyzeHeight,
    analyzeConnectivity,
    calculateWetness,
    matchesBoardFilter,
    FLUSH_TEXTURE,
    PAIR_TEXTURE,
    HEIGHT,
    CONNECTIVITY,
};
