/**
 * Poker Odds Engine — Monte Carlo Equity Calculator
 * ═══════════════════════════════════════════════════
 * Client-side poker equity calculator supporting:
 *   NLHE, PLO4, PLO5, PLO6, 7-Card Stud, Razz
 *
 * Uses Monte Carlo simulation (configurable iterations)
 * with bitmask hand ranking for performance.
 */

// ─── Card Constants ─────────────────────────────────────────────
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

const RANK_VALUES = {};
RANKS.forEach((r, i) => RANK_VALUES[r] = i + 2); // 2=2 ... A=14

/**
 * Create a card object: { rank, suit, id }
 * id is a unique 0-51 integer for fast comparison
 */
export function makeCard(rank, suit) {
    const ri = RANKS.indexOf(rank);
    const si = SUITS.indexOf(suit);
    if (ri === -1 || si === -1) return null;
    return { rank, suit, id: ri * 4 + si, value: ri + 2 };
}

export function cardFromId(id) {
    const ri = Math.floor(id / 4);
    const si = id % 4;
    return { rank: RANKS[ri], suit: SUITS[si], id, value: ri + 2 };
}

export function fullDeck() {
    const deck = [];
    for (let i = 0; i < 52; i++) deck.push(cardFromId(i));
    return deck;
}

// ─── Hand Rankings ──────────────────────────────────────────────
// Returns a numeric score; higher is better.
// Score format: category * 10^10 + tiebreaker
const HAND_CATEGORIES = {
    HIGH_CARD: 0,
    ONE_PAIR: 1,
    TWO_PAIR: 2,
    THREE_KIND: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    FOUR_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9,
};

/**
 * Evaluate a 5-card hand. Returns { score, category, name }
 */
function evaluate5(cards) {
    const vals = cards.map(c => c.value).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;
    // Normal straight
    if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) {
        isStraight = true;
        straightHigh = vals[0];
    }
    // Ace-low straight (A-2-3-4-5)
    if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
        isStraight = true;
        straightHigh = 5; // 5-high straight
    }

    // Count ranks
    const counts = {};
    vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const groups = Object.entries(counts).map(([v, c]) => ({ value: +v, count: c }));
    groups.sort((a, b) => b.count - a.count || b.value - a.value);

    const makeTie = (...parts) => {
        let score = 0;
        parts.forEach((p, i) => { score += p * Math.pow(15, parts.length - 1 - i); });
        return score;
    };

    if (isFlush && isStraight) {
        const cat = straightHigh === 14 ? HAND_CATEGORIES.ROYAL_FLUSH : HAND_CATEGORIES.STRAIGHT_FLUSH;
        return { score: cat * 1e10 + straightHigh, category: cat, name: cat === 9 ? 'Royal Flush' : 'Straight Flush' };
    }
    if (groups[0].count === 4) {
        return { score: HAND_CATEGORIES.FOUR_KIND * 1e10 + makeTie(groups[0].value, groups[1].value), category: HAND_CATEGORIES.FOUR_KIND, name: 'Four of a Kind' };
    }
    if (groups[0].count === 3 && groups[1].count === 2) {
        return { score: HAND_CATEGORIES.FULL_HOUSE * 1e10 + makeTie(groups[0].value, groups[1].value), category: HAND_CATEGORIES.FULL_HOUSE, name: 'Full House' };
    }
    if (isFlush) {
        return { score: HAND_CATEGORIES.FLUSH * 1e10 + makeTie(...vals), category: HAND_CATEGORIES.FLUSH, name: 'Flush' };
    }
    if (isStraight) {
        return { score: HAND_CATEGORIES.STRAIGHT * 1e10 + straightHigh, category: HAND_CATEGORIES.STRAIGHT, name: 'Straight' };
    }
    if (groups[0].count === 3) {
        const kickers = groups.slice(1).map(g => g.value).sort((a, b) => b - a);
        return { score: HAND_CATEGORIES.THREE_KIND * 1e10 + makeTie(groups[0].value, ...kickers), category: HAND_CATEGORIES.THREE_KIND, name: 'Three of a Kind' };
    }
    if (groups[0].count === 2 && groups[1].count === 2) {
        const pairs = [groups[0].value, groups[1].value].sort((a, b) => b - a);
        const kicker = groups[2].value;
        return { score: HAND_CATEGORIES.TWO_PAIR * 1e10 + makeTie(pairs[0], pairs[1], kicker), category: HAND_CATEGORIES.TWO_PAIR, name: 'Two Pair' };
    }
    if (groups[0].count === 2) {
        const kickers = groups.slice(1).map(g => g.value).sort((a, b) => b - a);
        return { score: HAND_CATEGORIES.ONE_PAIR * 1e10 + makeTie(groups[0].value, ...kickers), category: HAND_CATEGORIES.ONE_PAIR, name: 'One Pair' };
    }
    return { score: HAND_CATEGORIES.HIGH_CARD * 1e10 + makeTie(...vals), category: HAND_CATEGORIES.HIGH_CARD, name: 'High Card' };
}

/**
 * Best 5-card hand from N cards (for NLHE 7-card, Stud, etc.)
 */
function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const with_ = combinations(rest, k - 1).map(c => [first, ...c]);
    const without = combinations(rest, k);
    return [...with_, ...without];
}

export function bestHand(cards, count = 5) {
    if (cards.length <= count) return evaluate5(cards);
    const combos = combinations(cards, count);
    let best = null;
    for (const combo of combos) {
        const ev = evaluate5(combo);
        if (!best || ev.score > best.score) best = ev;
    }
    return best;
}

/**
 * Omaha-style best hand: must use exactly 2 from hole, 3 from board
 */
function bestOmahaHand(holeCards, board) {
    const holeCombos = combinations(holeCards, 2);
    const boardCombos = combinations(board, 3);
    let best = null;
    for (const hc of holeCombos) {
        for (const bc of boardCombos) {
            const ev = evaluate5([...hc, ...bc]);
            if (!best || ev.score > best.score) best = ev;
        }
    }
    return best;
}

/**
 * Razz: lowest 5-card hand (Ace is low, straights/flushes don't count)
 */
function evaluateRazz5(cards) {
    const vals = cards.map(c => c.value === 14 ? 1 : c.value).sort((a, b) => a - b);
    // Lower is better, so we invert: score = negative of the hand value
    let score = 0;
    vals.forEach((v, i) => { score += v * Math.pow(15, 4 - i); });
    return { score: -score, category: -1, name: `${vals.join('-')} low` };
}

function bestRazzHand(cards) {
    if (cards.length <= 5) return evaluateRazz5(cards);
    const combos = combinations(cards, 5);
    let best = null;
    for (const combo of combos) {
        const ev = evaluateRazz5(combo);
        if (!best || ev.score > best.score) best = ev;
    }
    return best;
}

// ─── Monte Carlo Simulation ─────────────────────────────────────

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Main equity calculator
 *
 * @param {Object} params
 * @param {string} params.game — 'nlhe' | 'plo4' | 'plo5' | 'plo6' | 'stud' | 'razz'
 * @param {Array<Array<Object>>} params.hands — array of player hands (each is array of card objects)
 * @param {Array<Object>} params.board — community cards (0-5 for holdem/omaha, empty for stud)
 * @param {Array<Object>} params.dead — dead/removed cards
 * @param {number} params.iterations — Monte Carlo iterations (default 10000)
 *
 * @returns {Array<{ wins, ties, total, equity }>}
 */
export function calculateEquity({ game = 'nlhe', hands = [], board = [], dead = [], iterations = 10000 }) {
    if (hands.length < 2) return hands.map(() => ({ wins: 0, ties: 0, total: 0, equity: 0 }));

    const usedIds = new Set();
    hands.forEach(h => h.forEach(c => usedIds.add(c.id)));
    board.forEach(c => usedIds.add(c.id));
    dead.forEach(c => usedIds.add(c.id));

    const remaining = fullDeck().filter(c => !usedIds.has(c.id));

    const results = hands.map(() => ({ wins: 0, ties: 0, total: iterations }));

    const boardNeeded = getBoardNeeded(game, board.length);
    const studCardsNeeded = getStudCardsNeeded(game, hands);

    for (let i = 0; i < iterations; i++) {
        shuffle(remaining);

        let idx = 0;
        // Deal remaining board cards
        const simBoard = [...board];
        for (let b = 0; b < boardNeeded; b++) {
            simBoard.push(remaining[idx++]);
        }

        // Deal remaining stud cards
        const simHands = hands.map((h, pi) => {
            if (game === 'stud' || game === 'razz') {
                const extra = studCardsNeeded[pi] || 0;
                const full = [...h];
                for (let e = 0; e < extra; e++) full.push(remaining[idx++]);
                return full;
            }
            return h;
        });

        // Evaluate each player
        const scores = simHands.map((h, pi) => {
            switch (game) {
                case 'nlhe':
                    return bestHand([...h, ...simBoard]).score;
                case 'plo4':
                case 'plo5':
                case 'plo6':
                    return bestOmahaHand(h, simBoard).score;
                case 'stud':
                    return bestHand(h).score;
                case 'razz':
                    return bestRazzHand(h).score;
                default:
                    return bestHand([...h, ...simBoard]).score;
            }
        });

        // Determine winners
        const maxScore = Math.max(...scores);
        const winners = scores.reduce((acc, s, pi) => { if (s === maxScore) acc.push(pi); return acc; }, []);

        if (winners.length === 1) {
            results[winners[0]].wins++;
        } else {
            winners.forEach(w => results[w].ties++);
        }
    }

    // Calculate equity
    results.forEach(r => {
        r.equity = ((r.wins + r.ties / 2) / r.total * 100);
    });

    return results;
}

function getBoardNeeded(game, currentBoardSize) {
    if (game === 'stud' || game === 'razz') return 0;
    return 5 - currentBoardSize;
}

function getStudCardsNeeded(game, hands) {
    if (game !== 'stud' && game !== 'razz') return [];
    return hands.map(h => 7 - h.length);
}

// ─── Game Config ─────────────────────────────────────────────────

export const GAME_CONFIGS = {
    nlhe: { name: 'No-Limit Hold\'em', holeCards: 2, maxPlayers: 10, hasBoard: true, emoji: '🃏' },
    plo4: { name: 'Pot-Limit Omaha', holeCards: 4, maxPlayers: 10, hasBoard: true, emoji: '🎴' },
    plo5: { name: 'PLO-5 Card', holeCards: 5, maxPlayers: 8, hasBoard: true, emoji: '5️⃣' },
    plo6: { name: 'PLO-6 Card', holeCards: 6, maxPlayers: 6, hasBoard: true, emoji: '6️⃣' },
    stud: { name: '7-Card Stud', holeCards: 7, maxPlayers: 8, hasBoard: false, emoji: '♠️' },
    razz: { name: 'Razz', holeCards: 7, maxPlayers: 8, hasBoard: false, emoji: '🔻' },
};

// ─── Preset Matchups ─────────────────────────────────────────────

export const PRESETS = {
    nlhe: [
        { name: 'AA vs KK', hands: [['A', 'hearts', 'A', 'spades'], ['K', 'hearts', 'K', 'spades']] },
        { name: 'AKs vs QQ', hands: [['A', 'hearts', 'K', 'hearts'], ['Q', 'diamonds', 'Q', 'clubs']] },
        { name: 'AKo vs 22', hands: [['A', 'hearts', 'K', 'spades'], ['2', 'diamonds', '2', 'clubs']] },
        { name: 'JJ vs AKs', hands: [['J', 'hearts', 'J', 'spades'], ['A', 'diamonds', 'K', 'diamonds']] },
        { name: 'KK vs AKs', hands: [['K', 'clubs', 'K', 'diamonds'], ['A', 'hearts', 'K', 'hearts']] },
    ],
    plo4: [
        { name: 'AAxx vs KKxx', hands: [['A', 'hearts', 'A', 'spades', 'J', 'hearts', '10', 'spades'], ['K', 'hearts', 'K', 'spades', 'Q', 'hearts', 'J', 'spades']] },
        { name: 'DS Rundown vs AA', hands: [['9', 'hearts', '8', 'hearts', '7', 'spades', '6', 'spades'], ['A', 'diamonds', 'A', 'clubs', '5', 'diamonds', '3', 'clubs']] },
    ],
};

/**
 * Parse a preset hand definition into card objects
 * Format: [rank, suit, rank, suit, ...]
 */
export function parsePresetHands(presetHands) {
    return presetHands.map(handDef => {
        const cards = [];
        for (let i = 0; i < handDef.length; i += 2) {
            const card = makeCard(handDef[i], handDef[i + 1]);
            if (card) cards.push(card);
        }
        return cards;
    });
}
