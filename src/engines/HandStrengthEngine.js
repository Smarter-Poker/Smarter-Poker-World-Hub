/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND STRENGTH ENGINE — Poker Hand Evaluation & Classification
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Evaluates poker hands for:
 *   - 5-card hand ranking (high card through royal flush)
 *   - Made hand classification on a specific board
 *   - Draw classification (flush draws, straight draws, combo draws)
 *   - Relative hand strength (0.0 = worst, 1.0 = nuts)
 *
 * Used by PostflopStrategyEngine to determine correct actions.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { RANK_VALUES } from './DeckEngine';

// ●● Hand Rank Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const HAND_RANKS = {
    HIGH_CARD: 0,
    ONE_PAIR: 1,
    TWO_PAIR: 2,
    THREE_OF_A_KIND: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    FOUR_OF_A_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9,
};

export const HAND_RANK_NAMES = {
    0: 'High Card',
    1: 'One Pair',
    2: 'Two Pair',
    3: 'Three of a Kind',
    4: 'Straight',
    5: 'Flush',
    6: 'Full House',
    7: 'Four of a Kind',
    8: 'Straight Flush',
    9: 'Royal Flush',
};

// ●● Made Hand Categories ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const MADE_HANDS = {
    NOTHING: 'nothing',
    BOTTOM_PAIR: 'bottom_pair',
    MIDDLE_PAIR: 'middle_pair',
    TOP_PAIR_WEAK: 'top_pair_weak_kicker',
    TOP_PAIR_GOOD: 'top_pair_good_kicker',
    TOP_PAIR_TOP: 'top_pair_top_kicker',
    OVERPAIR: 'overpair',
    TWO_PAIR: 'two_pair',
    SET: 'set',
    TRIPS: 'trips',
    STRAIGHT: 'straight',
    FLUSH: 'flush',
    FULL_HOUSE: 'full_house',
    QUADS: 'quads',
    STRAIGHT_FLUSH: 'straight_flush',
};

// ●● Draw Categories ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const DRAWS = {
    NONE: 'none',
    BACKDOOR_FLUSH: 'backdoor_flush_draw',
    BACKDOOR_STRAIGHT: 'backdoor_straight_draw',
    GUTSHOT: 'gutshot',
    OESD: 'open_ended_straight_draw',
    FLUSH_DRAW: 'flush_draw',
    COMBO_DRAW: 'combo_draw', // flush draw + straight draw
    WRAP: 'wrap', // multiple straight outs (PLO-style, rare in holdem)
};

// ●● Core Evaluation ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Evaluate the best 5-card hand from hole cards + board
 * @param {string[]} holeCards - 2 cards (e.g., ["As", "Kh"])
 * @param {string[]} board - 3-5 cards
 * @returns {{ rank: number, rankName: string, bestFive: string[], kickers: number[] }}
 */
export function evaluateHand(holeCards, board) {
    const allCards = [...holeCards, ...board];
    if (allCards.length < 5) {
        return { rank: HAND_RANKS.HIGH_CARD, rankName: 'High Card', bestFive: allCards, kickers: [] };
    }

    // Generate all 5-card combinations
    const combos = getCombinations(allCards, 5);
    let bestHand = null;

    for (const combo of combos) {
        const result = evaluate5Cards(combo);
        if (!bestHand || compareHandResults(result, bestHand) > 0) {
            bestHand = result;
            bestHand.bestFive = combo;
        }
    }

    return bestHand;
}

/**
 * Evaluate exactly 5 cards
 */
function evaluate5Cards(cards) {
    const values = cards.map(c => RANK_VALUES[c[0]]).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);

    const isFlush = suits.every(s => s === suits[0]);

    // Check for straight (including A-low: A,2,3,4,5)
    const uniqueVals = [...new Set(values)].sort((a, b) => b - a);
    let isStraight = false;
    let straightHigh = 0;

    if (uniqueVals.length >= 5) {
        // Regular straight check
        for (let i = 0; i <= uniqueVals.length - 5; i++) {
            if (uniqueVals[i] - uniqueVals[i + 4] === 4) {
                isStraight = true;
                straightHigh = uniqueVals[i];
                break;
            }
        }
        // Wheel (A-2-3-4-5)
        if (!isStraight && uniqueVals.includes(14) && uniqueVals.includes(2) &&
            uniqueVals.includes(3) && uniqueVals.includes(4) && uniqueVals.includes(5)) {
            isStraight = true;
            straightHigh = 5; // 5-high straight
        }
    }

    // Count ranks
    const rankCounts = {};
    for (const v of values) rankCounts[v] = (rankCounts[v] || 0) + 1;
    const counts = Object.values(rankCounts || {}).sort((a, b) => b - a);
    const ranksDesc = Object.entries(rankCounts || {})
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .map(e => Number(e[0]));

    // Determine hand rank
    if (isStraight && isFlush) {
        if (straightHigh === 14) return { rank: HAND_RANKS.ROYAL_FLUSH, rankName: 'Royal Flush', kickers: [14] };
        return { rank: HAND_RANKS.STRAIGHT_FLUSH, rankName: 'Straight Flush', kickers: [straightHigh] };
    }
    if (counts[0] === 4) return { rank: HAND_RANKS.FOUR_OF_A_KIND, rankName: 'Four of a Kind', kickers: ranksDesc };
    if (counts[0] === 3 && counts[1] === 2) return { rank: HAND_RANKS.FULL_HOUSE, rankName: 'Full House', kickers: ranksDesc };
    if (isFlush) return { rank: HAND_RANKS.FLUSH, rankName: 'Flush', kickers: values };
    if (isStraight) return { rank: HAND_RANKS.STRAIGHT, rankName: 'Straight', kickers: [straightHigh] };
    if (counts[0] === 3) return { rank: HAND_RANKS.THREE_OF_A_KIND, rankName: 'Three of a Kind', kickers: ranksDesc };
    if (counts[0] === 2 && counts[1] === 2) return { rank: HAND_RANKS.TWO_PAIR, rankName: 'Two Pair', kickers: ranksDesc };
    if (counts[0] === 2) return { rank: HAND_RANKS.ONE_PAIR, rankName: 'One Pair', kickers: ranksDesc };
    return { rank: HAND_RANKS.HIGH_CARD, rankName: 'High Card', kickers: values };
}

/** Compare two hand evaluation results. Returns >0 if a wins, <0 if b wins, 0 if tie */
function compareHandResults(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
        if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
    }
    return 0;
}

// ●● Made Hand Classification ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Does hero's own holding take part in the made hand, or is the board playing
 * by itself?
 *
 * evaluateHand() returns the best five of seven, and the board alone can be
 * that five: a board flush, a board straight, board quads, a board full house,
 * board trips and board two pair all belong to everyone at the table, not to
 * hero. Attributing them to hero makes the trainer teach and grade a hand hero
 * does not hold (Kh 9h 4h 2h 7h with 2c 3d was reported as a flush).
 *
 * Same reasoning the board-paired pair rule below already applies: AQ on KK7
 * is not top pair.
 *
 * @param {{rank:number, kickers:number[]}} eval5 - result of evaluateHand()
 * @param {string[]} holeCards
 * @param {string[]} board
 * @returns {boolean} true when at least one hole card is part of the hand
 */
function heroParticipatesInMadeHand(eval5, holeCards, board) {
    const heroValues = holeCards.map(c => RANK_VALUES[c[0]]);
    const boardValues = board.map(c => RANK_VALUES[c[0]]);

    switch (eval5.rank) {
        case HAND_RANKS.ROYAL_FLUSH:
        case HAND_RANKS.STRAIGHT_FLUSH:
        case HAND_RANKS.FLUSH: {
            // Find the suit that actually makes the flush (5+ cards).
            const suitCounts = {};
            for (const c of [...holeCards, ...board]) suitCounts[c[1]] = (suitCounts[c[1]] || 0) + 1;
            const flushSuit = Object.keys(suitCounts || {}).find(su => suitCounts[su] >= 5);
            if (!flushSuit) return true;
            const heroOfSuit = holeCards.filter(c => c[1] === flushSuit).map(c => RANK_VALUES[c[0]]);
            if (heroOfSuit.length === 0) return false; // hero holds none of that suit
            const boardOfSuit = board.filter(c => c[1] === flushSuit)
                .map(c => RANK_VALUES[c[0]]).sort((a, b) => b - a);
            // The board is already a five-card flush: hero only has a flush of
            // their own when a hole card beats the board's fifth-best card of
            // that suit. Otherwise hero is playing the board.
            if (boardOfSuit.length >= 5) return Math.max(...heroOfSuit) > boardOfSuit[4];
            return true;
        }
        case HAND_RANKS.STRAIGHT: {
            const high = eval5.kickers[0];
            const ranks = high === 5 ? [14, 2, 3, 4, 5] : [high, high - 1, high - 2, high - 3, high - 4];
            // If the board holds every rank of the straight, the board plays.
            return !ranks.every(r => boardValues.includes(r));
        }
        case HAND_RANKS.FOUR_OF_A_KIND:
        case HAND_RANKS.THREE_OF_A_KIND:
            return heroValues.includes(eval5.kickers[0]);
        case HAND_RANKS.FULL_HOUSE:
        case HAND_RANKS.TWO_PAIR:
            return heroValues.includes(eval5.kickers[0]) || heroValues.includes(eval5.kickers[1]);
        default:
            // ONE_PAIR and HIGH_CARD are handled inline in classifyMadeHand.
            return true;
    }
}

/**
 * Classify the made hand relative to the board
 * @param {string[]} holeCards - Hero's 2 cards
 * @param {string[]} board - Community cards (3-5)
 * @returns {{ category: string, description: string, strength: number }}
 */
export function classifyMadeHand(holeCards, board) {
    const eval5 = evaluateHand(holeCards, board);

    // Hero has to be part of the hand. A board flush / board straight / board
    // boat / board trips / board two pair is a board-play, not hero's holding,
    // and must never be scored at that made hand's strength.
    if (!heroParticipatesInMadeHand(eval5, holeCards, board)) {
        return { category: MADE_HANDS.NOTHING, description: 'High Card', strength: 0.10 };
    }

    const boardValues = board.map(c => RANK_VALUES[c[0]]).sort((a, b) => b - a);
    const heroValues = holeCards.map(c => RANK_VALUES[c[0]]).sort((a, b) => b - a);
    const topBoardCard = boardValues[0];

    // Map high-level ranks
    if (eval5.rank >= HAND_RANKS.STRAIGHT_FLUSH) return { category: MADE_HANDS.STRAIGHT_FLUSH, description: eval5.rankName, strength: 0.99 };
    if (eval5.rank === HAND_RANKS.FOUR_OF_A_KIND) return { category: MADE_HANDS.QUADS, description: 'Four of a Kind', strength: 0.97 };
    if (eval5.rank === HAND_RANKS.FULL_HOUSE) return { category: MADE_HANDS.FULL_HOUSE, description: 'Full House', strength: 0.93 };
    if (eval5.rank === HAND_RANKS.FLUSH) return { category: MADE_HANDS.FLUSH, description: 'Flush', strength: 0.85 };
    if (eval5.rank === HAND_RANKS.STRAIGHT) return { category: MADE_HANDS.STRAIGHT, description: 'Straight', strength: 0.80 };

    if (eval5.rank === HAND_RANKS.THREE_OF_A_KIND) {
        // Set (pocket pair matches board) vs Trips (one hole card matches paired board)
        const heroPair = heroValues[0] === heroValues[1];
        if (heroPair && board.some(c => RANK_VALUES[c[0]] === heroValues[0])) {
            return { category: MADE_HANDS.SET, description: 'Set', strength: 0.75 };
        }
        return { category: MADE_HANDS.TRIPS, description: 'Trips', strength: 0.70 };
    }

    if (eval5.rank === HAND_RANKS.TWO_PAIR) return { category: MADE_HANDS.TWO_PAIR, description: 'Two Pair', strength: 0.60 };

    if (eval5.rank === HAND_RANKS.ONE_PAIR) {
        // Classify pair type
        const pairValue = eval5.kickers[0]; // the paired rank
        const kicker = heroValues.find(v => v !== pairValue) || heroValues[0];

        // Board-paired "pair" — hero holds neither the pair card nor a pocket pair,
        // so the pair belongs entirely to the board. That's high card, not top pair.
        const heroHasPairCard = heroValues.includes(pairValue);
        const heroPocketPair = heroValues[0] === heroValues[1];
        if (!heroHasPairCard && !heroPocketPair) {
            return { category: MADE_HANDS.NOTHING, description: 'High Card', strength: 0.10 };
        }

        // Overpair (pocket pair > all board cards)
        if (heroValues[0] === heroValues[1] && heroValues[0] > topBoardCard) {
            return { category: MADE_HANDS.OVERPAIR, description: 'Overpair', strength: 0.55 };
        }

        // Top pair
        if (pairValue === topBoardCard) {
            // With top pair of aces the best kicker is a king; otherwise an ace
            const topKickerThreshold = pairValue === 14 ? 13 : 14;
            if (kicker >= topKickerThreshold) return { category: MADE_HANDS.TOP_PAIR_TOP, description: 'Top Pair Top Kicker', strength: 0.50 };
            if (kicker >= 12) return { category: MADE_HANDS.TOP_PAIR_GOOD, description: 'Top Pair Good Kicker', strength: 0.45 };
            return { category: MADE_HANDS.TOP_PAIR_WEAK, description: 'Top Pair Weak Kicker', strength: 0.40 };
        }

        // Middle pair
        if (boardValues.length >= 2 && pairValue < topBoardCard && pairValue >= boardValues[1]) {
            return { category: MADE_HANDS.MIDDLE_PAIR, description: 'Middle Pair', strength: 0.30 };
        }

        // Bottom pair
        return { category: MADE_HANDS.BOTTOM_PAIR, description: 'Bottom Pair', strength: 0.20 };
    }

    return { category: MADE_HANDS.NOTHING, description: 'High Card', strength: 0.10 };
}

// ●● Draw Classification ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Classify draws available to hero
 * @param {string[]} holeCards
 * @param {string[]} board (flop or turn — draws matter pre-river)
 * @returns {{ draws: string[], outs: number, isCombo: boolean, description: string }}
 */
export function classifyDraws(holeCards, board) {
    if (board.length >= 5) return { draws: [DRAWS.NONE], outs: 0, isCombo: false, description: 'No draws (river)' };

    const allCards = [...holeCards, ...board];
    const draws = [];
    let totalOuts = 0;

    // Flush draw check — count the suits HERO holds, not the board's. A three-
    // or four-flush on the board alone is not hero's draw: hero has to hold at
    // least one card of the suit for the flush to ever be hero's hand.
    const suitCounts = {};
    for (const card of allCards) {
        const suit = card[1];
        suitCounts[suit] = (suitCounts[suit] || 0) + 1;
    }
    const heroSuits = [...new Set(holeCards.map(c => c[1]))];
    const maxSuit = heroSuits.length > 0 ? Math.max(...heroSuits.map(su => suitCounts[su] || 0)) : 0;
    const hasFlushDraw = maxSuit === 4;
    const hasBackdoorFlush = maxSuit === 3 && board.length === 3;

    if (hasFlushDraw) { draws.push(DRAWS.FLUSH_DRAW); totalOuts += 9; }
    else if (hasBackdoorFlush) { draws.push(DRAWS.BACKDOOR_FLUSH); totalOuts += 1.5; }

    // Straight draw check
    const values = [...new Set(allCards.map(c => RANK_VALUES[c[0]]))].sort((a, b) => a - b);
    if (values.includes(14)) values.unshift(1); // ace-low

    let bestStraightDraw = DRAWS.NONE;
    let straightOuts = 0;

    // Count distinct completing ranks across every 5-card window.
    // 2+ distinct completing ranks = 8 outs (OESD-equivalent, incl. double gutshots),
    // exactly 1 = 4-out gutshot. Normalize ace-low (1) to 14 so it isn't counted twice.
    // Same hero-participation rule as the flush draw: a straight the board is
    // drawing to on its own is not hero's draw.
    const heroValueSet = new Set(holeCards.map(c => RANK_VALUES[c[0]]));
    const heroInWindow = (win) => win.some(v => heroValueSet.has(v === 1 ? 14 : v));

    const completing = new Set();
    for (let target = 1; target <= 10; target++) {
        const window = [target, target + 1, target + 2, target + 3, target + 4];
        const need = window.filter(v => !values.includes(v));
        if (need.length === 1 && heroInWindow(window)) completing.add(need[0] === 1 ? 14 : need[0]);
    }

    if (completing.size >= 2) {
        bestStraightDraw = DRAWS.OESD;
        straightOuts = 8;
    } else if (completing.size === 1) {
        bestStraightDraw = DRAWS.GUTSHOT;
        straightOuts = 4;
    }

    if (bestStraightDraw !== DRAWS.NONE) {
        draws.push(bestStraightDraw);
        totalOuts += straightOuts;
    } else if (board.length === 3) {
        // Check for backdoor straight draw
        for (let target = 1; target <= 10; target++) {
            const window = [target, target + 1, target + 2, target + 3, target + 4];
            const haveCount = window.filter(v => values.includes(v)).length;
            if (haveCount === 3 && heroInWindow(window)) {
                draws.push(DRAWS.BACKDOOR_STRAIGHT);
                totalOuts += 1;
                break;
            }
        }
    }

    // Combo draw check
    const isCombo = hasFlushDraw && bestStraightDraw !== DRAWS.NONE;
    if (isCombo) {
        draws.push(DRAWS.COMBO_DRAW);
        totalOuts = Math.min(totalOuts, 15); // Avoid double-counting overlapping outs
    }

    if (draws.length === 0) draws.push(DRAWS.NONE);

    const descriptions = draws.filter(d => d !== DRAWS.NONE && d !== DRAWS.COMBO_DRAW)
        .map(d => d.replace(/_/g, ' '));

    return {
        draws,
        outs: Math.round(totalOuts),
        isCombo,
        description: descriptions.length > 0 ? descriptions.join(' + ') : 'No draws',
        equity: estimateDrawEquity(totalOuts, board.length),
    };
}

/**
 * Estimate equity from draw outs using rule of 2 and 4
 */
function estimateDrawEquity(outs, boardCards) {
    if (boardCards === 3) return Math.min(0.60, outs * 0.04); // Rule of 4 (flop)
    if (boardCards === 4) return Math.min(0.40, outs * 0.02); // Rule of 2 (turn)
    return 0;
}

// ●● Utility ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/** Get all k-element combinations from array */
function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const result = [];
    const [first, ...rest] = arr;
    // Combos including first
    for (const combo of getCombinations(rest, k - 1)) {
        result.push([first, ...combo]);
    }
    // Combos excluding first
    for (const combo of getCombinations(rest, k)) {
        result.push(combo);
    }
    return result;
}

export default {
    evaluateHand,
    classifyMadeHand,
    classifyDraws,
    HAND_RANKS,
    HAND_RANK_NAMES,
    MADE_HANDS,
    DRAWS,
};
