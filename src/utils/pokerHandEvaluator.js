/**
 * 🃏 Poker Hand Evaluator — GTO Wizard-Style Hand Classification Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Classifies any hole card combo against a board into:
 *   - Made Hands: Quads, Full House, Flush, Straight, Set, Trips, Two Pair,
 *                 Overpair, Top Pair, Second Pair, Middle Pair, Bottom Pair
 *   - Draws: Nut Flush Draw, Flush Draw, OESD, Gutshot, Backdoor Flush,
 *            Backdoor Straight, Overcards
 *   - Air: No made hand or draw
 *
 * Usage:
 *   evaluateHand(['Ah', 'Kh'], ['7h', '8h', '2c'])
 *   → { classification: 'NUT_FLUSH_DRAW', subType: 'Nut Flush Draw + 2 Overcards', rank: 12 }
 *
 *   classifyAllHands(['7h', '8h', '2c'])
 *   → Map<'AKs' → 'NUT_FLUSH_DRAW', 'AA' → 'OVERPAIR', ...>
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RANK_ORDER = '23456789TJQKA';
const RANK_VALUES = {};
RANK_ORDER.split('').forEach((r, i) => { RANK_VALUES[r] = i; });

const RANKS_13 = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];

// Classification hierarchy (higher rank = stronger hand)
const CLASSIFICATIONS = {
    QUADS: { rank: 20, label: 'Quads', category: 'made', color: '#16a34a' },
    FULL_HOUSE: { rank: 19, label: 'Full House', category: 'made', color: '#15803d' },
    FLUSH: { rank: 18, label: 'Flush', category: 'made', color: '#059669' },
    STRAIGHT: { rank: 17, label: 'Straight', category: 'made', color: '#0d9488' },
    SET: { rank: 16, label: 'Set', category: 'made', color: '#0891b2' },
    TRIPS: { rank: 15, label: 'Trips', category: 'made', color: '#0e7490' },
    TWO_PAIR: { rank: 14, label: 'Two Pair', category: 'made', color: '#2563eb' },
    OVERPAIR: { rank: 13, label: 'Overpair', category: 'made', color: '#4f46e5' },
    TOP_PAIR: { rank: 12, label: 'Top Pair', category: 'made', color: '#7c3aed' },
    SECOND_PAIR: { rank: 11, label: 'Second Pair', category: 'made', color: '#9333ea' },
    MIDDLE_PAIR: { rank: 10, label: 'Middle Pair', category: 'made', color: '#a855f7' },
    BOTTOM_PAIR: { rank: 9, label: 'Bottom Pair', category: 'made', color: '#c084fc' },
    NUT_FLUSH_DRAW: { rank: 8, label: 'Nut Flush Draw', category: 'draw', color: '#f59e0b' },
    FLUSH_DRAW: { rank: 7, label: 'Flush Draw', category: 'draw', color: '#d97706' },
    OESD: { rank: 6, label: 'OESD', category: 'draw', color: '#ea580c' },
    GUTSHOT: { rank: 5, label: 'Gutshot', category: 'draw', color: '#dc2626' },
    BACKDOOR_FLUSH: { rank: 4, label: 'Backdoor Flush', category: 'draw', color: '#b91c1c' },
    BACKDOOR_STRAIGHT: { rank: 3, label: 'Backdoor Straight', category: 'draw', color: '#991b1b' },
    OVERCARDS: { rank: 2, label: 'Overcards', category: 'draw', color: '#78716c' },
    AIR: { rank: 1, label: 'Air', category: 'air', color: '#57534e' },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Parse a card string like 'Ah' → { rank: 'A', suit: 'h', value: 12 } */
function parseCard(card) {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    return { rank, suit, value: RANK_VALUES[rank] ?? -1 };
}

/** Get sorted rank values from an array of parsed cards (descending) */
function getSortedValues(cards) {
    return cards.map(c => c.value).sort((a, b) => b - a);
}

/** Count occurrences of each rank value */
function countRanks(cards) {
    const counts = {};
    cards.forEach(c => {
        counts[c.value] = (counts[c.value] || 0) + 1;
    });
    return counts;
}

/** Count occurrences of each suit */
function countSuits(cards) {
    const counts = {};
    cards.forEach(c => {
        counts[c.suit] = (counts[c.suit] || 0) + 1;
    });
    return counts;
}

/** Check if there's a straight using 5 cards (considers A-low straight) */
function hasStraight(allValues) {
    const unique = [...new Set(allValues)].sort((a, b) => b - a);
    // Check for A-low straight (A-2-3-4-5) — push AFTER sorting
    const withWheel = [...unique];
    if (withWheel.includes(12)) withWheel.push(-1);

    for (let i = 0; i <= withWheel.length - 5; i++) {
        let consecutive = 1;
        for (let j = 1; j < 5; j++) {
            if (withWheel[i] - j === withWheel[i + j]) {
                consecutive++;
            } else break;
        }
        if (consecutive >= 5) return true;
    }
    return false;
}

/** Check for flush (5+ same suit) */
function hasFlush(allCards) {
    const suitCounts = countSuits(allCards);
    return Object.values(suitCounts).some(c => c >= 5);
}

/** Get the flush suit if flushable */
function getFlushSuit(allCards) {
    const suitCounts = countSuits(allCards);
    for (const [suit, count] of Object.entries(suitCounts)) {
        if (count >= 5) return suit;
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE: EVALUATE A SINGLE HAND
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate a specific hole card combo against a board.
 * @param {string[]} holeCards - e.g., ['Ah', 'Kh']
 * @param {string[]} board - e.g., ['7h', '8h', '2c'] (3-5 cards)
 * @returns {{ classification: string, subType: string, rank: number, category: string }}
 */
export function evaluateHand(holeCards, board) {
    if (!holeCards || holeCards.length < 2 || !board || board.length < 3) {
        return { classification: 'AIR', subType: 'Insufficient cards', rank: 1, category: 'air' };
    }

    const hole = holeCards.map(parseCard).filter(Boolean);
    const boardCards = board.map(parseCard).filter(Boolean);
    const allCards = [...hole, ...boardCards];

    if (hole.length < 2 || boardCards.length < 3) {
        return { classification: 'AIR', subType: 'Parse error', rank: 1, category: 'air' };
    }

    const holeValues = hole.map(c => c.value).sort((a, b) => b - a);
    const boardValues = boardCards.map(c => c.value).sort((a, b) => b - a);
    const allValues = allCards.map(c => c.value);
    const boardRankCounts = countRanks(boardCards);
    const allRankCounts = countRanks(allCards);

    // ─── MADE HAND DETECTION ───────────────────────────────────────────

    // QUADS: 4 of a kind
    for (const [val, count] of Object.entries(allRankCounts)) {
        if (count >= 4) {
            // Check if hero contributes to the quads
            const heroContrib = hole.filter(c => c.value === parseInt(val)).length;
            if (heroContrib > 0) {
                return { classification: 'QUADS', subType: `Quad ${RANK_ORDER[parseInt(val)]}s`, rank: 20, category: 'made' };
            }
        }
    }

    // FULL HOUSE: 3 of a kind + pair (hero must contribute)
    const tripsVals = [];
    const pairVals = [];
    for (const [val, count] of Object.entries(allRankCounts)) {
        if (count >= 3) tripsVals.push(parseInt(val));
        else if (count >= 2) pairVals.push(parseInt(val));
    }
    if (tripsVals.length >= 1 && (pairVals.length >= 1 || tripsVals.length >= 2)) {
        // Verify hero contributes
        const heroContribTrips = tripsVals.some(v => hole.some(c => c.value === v));
        const heroContribPairs = pairVals.some(v => hole.some(c => c.value === v)) || tripsVals.length >= 2;
        if (heroContribTrips || heroContribPairs) {
            return { classification: 'FULL_HOUSE', subType: 'Full House', rank: 19, category: 'made' };
        }
    }

    // FLUSH: 5+ same suit, hero must contribute at least 1 card to the flush
    if (hasFlush(allCards)) {
        const flushSuit = getFlushSuit(allCards);
        const heroFlushCards = hole.filter(c => c.suit === flushSuit);
        if (heroFlushCards.length > 0) {
            return { classification: 'FLUSH', subType: `${RANK_ORDER[heroFlushCards[0].value]}-high Flush`, rank: 18, category: 'made' };
        }
    }

    // STRAIGHT: 5 sequential ranks, hero must contribute
    if (hasStraight(allValues)) {
        // Check hero contributes to the best straight
        const withoutHero = boardCards.map(c => c.value);
        if (!hasStraight(withoutHero)) {
            return { classification: 'STRAIGHT', subType: 'Straight', rank: 17, category: 'made' };
        }
        // Even if board has a straight, hero might have a better one
        // For simplicity, if hero has cards that could form part of a straight
        const unique = [...new Set(allValues)].sort((a, b) => b - a);
        const heroInStraight = hole.some(c => unique.includes(c.value));
        if (heroInStraight) {
            return { classification: 'STRAIGHT', subType: 'Straight', rank: 17, category: 'made' };
        }
    }

    // SET: Pocket pair that matches one board card (3 of a kind, 2 in hand)
    if (holeValues[0] === holeValues[1]) {
        const pocketVal = holeValues[0];
        const boardHits = boardCards.filter(c => c.value === pocketVal).length;
        if (boardHits >= 1) {
            return { classification: 'SET', subType: `Set of ${RANK_ORDER[pocketVal]}s`, rank: 16, category: 'made' };
        }
    }

    // TRIPS: One hole card matches a board pair (3 of a kind, 1 in hand)
    for (const c of hole) {
        const boardHits = boardCards.filter(bc => bc.value === c.value).length;
        if (boardHits >= 2) {
            return { classification: 'TRIPS', subType: `Trip ${RANK_ORDER[c.value]}s`, rank: 15, category: 'made' };
        }
    }

    // TWO PAIR: Hero has two different pairs (each pairing with a board card)
    const heroPairs = [];
    for (const c of hole) {
        if (boardCards.some(bc => bc.value === c.value)) {
            heroPairs.push(c.value);
        }
    }
    const uniqueHeroPairs = [...new Set(heroPairs)];
    if (uniqueHeroPairs.length >= 2) {
        return { classification: 'TWO_PAIR', subType: 'Two Pair', rank: 14, category: 'made' };
    }
    // Pocket pair (not hitting board) + one hero card pairing with board = Two Pair
    if (holeValues[0] === holeValues[1] && uniqueHeroPairs.length === 0) {
        // Check if there's a board pair that gives us two pair
        const boardPairExists = Object.values(boardRankCounts).some(c => c >= 2);
        if (boardPairExists) {
            return { classification: 'TWO_PAIR', subType: 'Two Pair (Pocket + Board)', rank: 14, category: 'made' };
        }
    }

    // ONE PAIR using hero cards
    if (uniqueHeroPairs.length === 1 || holeValues[0] === holeValues[1]) {
        if (holeValues[0] === holeValues[1]) {
            // Pocket pair — classify vs board
            const pocketVal = holeValues[0];
            const topBoardCard = boardValues[0];
            if (pocketVal > topBoardCard) {
                return { classification: 'OVERPAIR', subType: `Overpair ${RANK_ORDER[pocketVal]}${RANK_ORDER[pocketVal]}`, rank: 13, category: 'made' };
            }
            // Underpair — find where it sits relative to board
            if (pocketVal < boardValues[boardValues.length - 1]) {
                return { classification: 'BOTTOM_PAIR', subType: `Underpair ${RANK_ORDER[pocketVal]}${RANK_ORDER[pocketVal]}`, rank: 9, category: 'made' };
            }
            return { classification: 'MIDDLE_PAIR', subType: `Middle Pair ${RANK_ORDER[pocketVal]}${RANK_ORDER[pocketVal]}`, rank: 10, category: 'made' };
        }

        // Hero card paired with board
        const pairedVal = uniqueHeroPairs[0];
        const sortedBoardVals = [...boardValues]; // already sorted desc

        if (pairedVal === sortedBoardVals[0]) {
            return { classification: 'TOP_PAIR', subType: `Top Pair ${RANK_ORDER[pairedVal]}s`, rank: 12, category: 'made' };
        }
        if (sortedBoardVals.length >= 2 && pairedVal === sortedBoardVals[1]) {
            return { classification: 'SECOND_PAIR', subType: `Second Pair ${RANK_ORDER[pairedVal]}s`, rank: 11, category: 'made' };
        }
        if (sortedBoardVals.length >= 3 && pairedVal === sortedBoardVals[2]) {
            return { classification: 'BOTTOM_PAIR', subType: `Bottom Pair ${RANK_ORDER[pairedVal]}s`, rank: 9, category: 'made' };
        }
        return { classification: 'MIDDLE_PAIR', subType: `Middle Pair ${RANK_ORDER[pairedVal]}s`, rank: 10, category: 'made' };
    }

    // ─── DRAW DETECTION ────────────────────────────────────────────────

    // Only check draws on flop/turn (not river where draws are irrelevant)
    const isRiver = boardCards.length >= 5;

    if (!isRiver) {
        // FLUSH DRAW: 4 cards of same suit (board + hero)
        const allSuitCounts = countSuits(allCards);
        const boardSuitCounts = countSuits(boardCards);

        for (const [suit, count] of Object.entries(allSuitCounts)) {
            if (count >= 4) {
                const heroSuitCards = hole.filter(c => c.suit === suit);
                if (heroSuitCards.length > 0) {
                    // Nut flush draw = hero has Ace of that suit
                    const hasAce = heroSuitCards.some(c => c.value === 12);
                    if (hasAce) {
                        return { classification: 'NUT_FLUSH_DRAW', subType: 'Nut Flush Draw', rank: 8, category: 'draw' };
                    }
                    return { classification: 'FLUSH_DRAW', subType: 'Flush Draw', rank: 7, category: 'draw' };
                }
            }
        }

        // STRAIGHT DRAWS: OESD and Gutshot
        const straightDraw = detectStraightDraw(hole, boardCards);
        if (straightDraw === 'OESD') {
            return { classification: 'OESD', subType: 'Open-Ended Straight Draw', rank: 6, category: 'draw' };
        }
        if (straightDraw === 'GUTSHOT') {
            return { classification: 'GUTSHOT', subType: 'Gutshot Straight Draw', rank: 5, category: 'draw' };
        }

        // BACKDOOR FLUSH: 3 cards of same suit (only on flop)
        if (boardCards.length === 3) {
            for (const [suit, count] of Object.entries(allSuitCounts)) {
                if (count === 3) {
                    const heroSuitCards = hole.filter(c => c.suit === suit);
                    if (heroSuitCards.length > 0) {
                        return { classification: 'BACKDOOR_FLUSH', subType: 'Backdoor Flush Draw', rank: 4, category: 'draw' };
                    }
                }
            }
        }

        // BACKDOOR STRAIGHT: rough check for connectivity
        if (boardCards.length === 3) {
            const bdStraight = detectBackdoorStraight(hole, boardCards);
            if (bdStraight) {
                return { classification: 'BACKDOOR_STRAIGHT', subType: 'Backdoor Straight Draw', rank: 3, category: 'draw' };
            }
        }
    }

    // OVERCARDS: Both hole cards above the top board card
    if (holeValues[0] > boardValues[0] && holeValues[1] > boardValues[0]) {
        return { classification: 'OVERCARDS', subType: `${RANK_ORDER[holeValues[0]]}${RANK_ORDER[holeValues[1]]} Overcards`, rank: 2, category: 'draw' };
    }

    // AIR: Nothing
    return { classification: 'AIR', subType: 'No made hand or draw', rank: 1, category: 'air' };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRAIGHT DRAW DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect OESD or Gutshot straight draws.
 * An OESD has 8 outs (two cards complete the straight from either end).
 * A Gutshot has 4 outs (one interior card completes the straight).
 */
function detectStraightDraw(hole, boardCards) {
    const allValues = [...new Set([...hole.map(c => c.value), ...boardCards.map(c => c.value)])];
    // Add Ace as low for wheel draws
    if (allValues.includes(12)) allValues.push(-1);

    const sorted = [...new Set(allValues)].sort((a, b) => a - b);

    // Check all windows of 5 consecutive card slots
    // Count how many of those slots are filled
    const minVal = Math.max(-1, sorted[0]);
    const maxVal = sorted[sorted.length - 1];

    let bestDraw = null;

    for (let start = minVal; start <= maxVal - 3; start++) {
        const window = [start, start + 1, start + 2, start + 3, start + 4];
        const filled = window.filter(v => sorted.includes(v));
        const missing = window.filter(v => !sorted.includes(v));

        if (filled.length === 4 && missing.length === 1) {
            // Hero must contribute at least one card to this draw
            const holeVals = hole.map(c => c.value);
            if (holeVals.includes(12) && window.includes(-1)) {
                // Ace-low usage
            }
            const heroContributes = filled.some(v => {
                if (v === -1) return holeVals.includes(12);
                return holeVals.includes(v);
            });

            if (heroContributes) {
                // OESD: missing card is at the ends of the window
                if (missing[0] === window[0] || missing[0] === window[4]) {
                    bestDraw = 'OESD';
                } else if (!bestDraw) {
                    bestDraw = 'GUTSHOT';
                }
            }
        }
    }

    return bestDraw;
}

/**
 * Detect backdoor straight potential (3 cards within a 5-card span, hero involved).
 */
function detectBackdoorStraight(hole, boardCards) {
    const allValues = [...new Set([...hole.map(c => c.value), ...boardCards.map(c => c.value)])];
    if (allValues.includes(12)) allValues.push(-1);
    const sorted = [...new Set(allValues)].sort((a, b) => a - b);
    const holeVals = hole.map(c => c.value);

    for (let start = Math.max(-1, sorted[0]); start <= (sorted[sorted.length - 1]) - 2; start++) {
        const window = [start, start + 1, start + 2, start + 3, start + 4];
        const filled = window.filter(v => sorted.includes(v));
        if (filled.length >= 3) {
            const heroContributes = filled.some(v => {
                if (v === -1) return holeVals.includes(12);
                return holeVals.includes(v);
            });
            if (heroContributes) return true;
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK CLASSIFICATION (ALL 169 HAND COMBOS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get standard hand notation for a 13x13 grid cell.
 */
function getHandNotation(row, col) {
    if (row === col) return `${RANKS_13[row]}${RANKS_13[col]}`;
    if (row < col) return `${RANKS_13[row]}${RANKS_13[col]}s`;
    return `${RANKS_13[col]}${RANKS_13[row]}o`;
}

/**
 * Convert a hand notation (e.g., 'AKs') into representative hole cards.
 * Picks specific suits that DON'T conflict with the board.
 */
function notationToHoleCards(notation, boardCards) {
    if (!notation || notation.length < 2) return null;

    const r1 = notation[0];
    const r2 = notation[1];
    const type = notation[2] || ''; // 's', 'o', or '' (pair)

    const boardSuits = boardCards.map(c => parseCard(c)).filter(Boolean);
    const usedCards = new Set(boardCards.map(c => c.toUpperCase()));

    // Try to find suits that don't conflict with the board
    if (r1 === r2) {
        // Pair — find two different suits not on the board
        for (let i = 0; i < SUITS.length; i++) {
            for (let j = i + 1; j < SUITS.length; j++) {
                const c1 = `${r1}${SUITS[i]}`;
                const c2 = `${r2}${SUITS[j]}`;
                if (!usedCards.has(c1.toUpperCase()) && !usedCards.has(c2.toUpperCase())) {
                    return [c1, c2];
                }
            }
        }
    } else if (type === 's') {
        // Suited — same suit, not conflicting
        for (const s of SUITS) {
            const c1 = `${r1}${s}`;
            const c2 = `${r2}${s}`;
            if (!usedCards.has(c1.toUpperCase()) && !usedCards.has(c2.toUpperCase())) {
                return [c1, c2];
            }
        }
    } else {
        // Offsuit — different suits, not conflicting
        for (let i = 0; i < SUITS.length; i++) {
            for (let j = 0; j < SUITS.length; j++) {
                if (i === j) continue;
                const c1 = `${r1}${SUITS[i]}`;
                const c2 = `${r2}${SUITS[j]}`;
                if (!usedCards.has(c1.toUpperCase()) && !usedCards.has(c2.toUpperCase())) {
                    return [c1, c2];
                }
            }
        }
    }

    // Fallback
    return [`${r1}s`, `${r2}${type === 's' ? 's' : 'h'}`];
}

/**
 * Classify all 169 hand combos against a given board.
 * @param {string[]} board - e.g., ['7h', '8h', '2c']
 * @returns {Object} Map of handNotation → { classification, subType, rank, category }
 */
export function classifyAllHands(board) {
    const result = {};

    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            const hand = getHandNotation(r, c);
            const holeCards = notationToHoleCards(hand, board);
            if (holeCards) {
                result[hand] = evaluateHand(holeCards, board);
            } else {
                result[hand] = { classification: 'AIR', subType: 'Blocked', rank: 1, category: 'air' };
            }
        }
    }

    return result;
}

/**
 * Get the display color for a given classification.
 * @param {string} classification
 * @returns {string} hex color
 */
export function getClassificationColor(classification) {
    return CLASSIFICATIONS[classification]?.color || '#57534e';
}

/**
 * Get full classification metadata.
 * @param {string} classification
 * @returns {{ rank: number, label: string, category: string, color: string }}
 */
export function getClassificationMeta(classification) {
    return CLASSIFICATIONS[classification] || CLASSIFICATIONS.AIR;
}

/**
 * Get all classification definitions (for building legends/sidebars).
 * @returns {Object} The CLASSIFICATIONS constant
 */
export function getAllClassifications() {
    return CLASSIFICATIONS;
}

/**
 * Group classified hands by their classification for the sidebar.
 * @param {Object} classifiedHands - Map from classifyAllHands
 * @param {Object} gridData - The frequency data from the solver
 * @returns {Array<{ classification, label, color, category, hands: string[], actionSummary }>}
 */
export function groupByClassification(classifiedHands, gridData) {
    const groups = {};

    for (const [hand, info] of Object.entries(classifiedHands)) {
        const cls = info.classification;
        if (!groups[cls]) {
            const meta = CLASSIFICATIONS[cls] || CLASSIFICATIONS.AIR;
            groups[cls] = {
                classification: cls,
                label: meta.label,
                color: meta.color,
                category: meta.category,
                rank: meta.rank,
                hands: [],
                actionTotals: {},
                handCount: 0,
            };
        }
        groups[cls].hands.push(hand);
        groups[cls].handCount++;

        // Aggregate action frequencies for this class
        const freqs = gridData?.[hand];
        if (freqs) {
            for (const [action, freq] of Object.entries(freqs)) {
                groups[cls].actionTotals[action] = (groups[cls].actionTotals[action] || 0) + freq;
            }
        }
    }

    // Normalize action totals to percentages
    const result = Object.values(groups)
        .filter(g => g.handCount > 0)
        .sort((a, b) => b.rank - a.rank)
        .map(g => {
            const totalFreq = Object.values(g.actionTotals).reduce((sum, v) => sum + v, 0);
            const actionSummary = {};
            for (const [action, total] of Object.entries(g.actionTotals)) {
                actionSummary[action] = totalFreq > 0 ? Math.round((total / totalFreq) * 1000) / 10 : 0;
            }
            return {
                classification: g.classification,
                label: g.label,
                color: g.color,
                category: g.category,
                hands: g.hands,
                handCount: g.handCount,
                actionSummary,
            };
        });

    return result;
}
