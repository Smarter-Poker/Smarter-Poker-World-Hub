/**
 * brain/plo6-brain.js -- PLO6 (6-Card Omaha) variant-specific strategy
 *
 * PLO6 is the MOST extreme Omaha variant. With 6 hole cards:
 *   - 20 MILLION starting combos (vs 270K in PLO4, 2.8M in PLO5)
 *   - AA equity vs random drops to ~52% (barely a coin flip)
 *   - C(6,2) = 15 possible 2-card combos per hand
 *   - Triple-suited hands occur 9.3% of the time
 *   - EVERYONE has a "good" hand -- you need a GREAT hand
 *   - Non-nut flushes are nearly worthless
 *   - Two-pair is pure trash
 *   - Blocker-based bluffing replaces hand-strength-based bluffing
 *   - Equity realization is ~12% higher than PLO4
 *
 * PLO6 plays as "nut-or-nothing" -- if you don't have the nuts or
 * a draw to the nuts, GET OUT.
 *
 * Sources: PLO Genius, Run It Once, CardQuant, PLO Mastermind, KKPoker (Jon Kyte)
 */

const {
    getBestPLO5or6PreflopStrength,
    getBestPLO5or6MadeHand,
    classifyPLOPreflop,
    evaluatePLOMadeHand,
    analyzePLOBoardTexture,
    countFlushOuts,
    countStraightOuts,
    countBackdoorOuts,
    detectPLOWrapDraw,
    calculatePLODirtyOuts,
    deduplicatePLOComboOuts,
    makePLOFallbackDecision,
    getPLOSPRZone,
    getPLOPositionRanges,
    getPLOEquityRealization,
    getPLOCBetStrategy,
    getAdaptivePLOBetSize,
    calcPLOBetSize,
} = require('./plo-core');
const { RANK_ORDER } = require('./core');

// ======================================================================
// PLO6 PREFLOP HAND SCORING
// ======================================================================

/**
 * Parse a card string into rank index and suit.
 * @param {string} card - e.g., 'Ah', 'Ts', '9d'
 * @returns {{ rank: number, suit: string }}
 */
function _parseCard6(card) {
    const rankChar = card.length === 3 ? card.substring(0, 2) : card[0];
    const suit = card[card.length - 1];
    const rank = RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
    return { rank, suit };
}

/**
 * Score a PLO6 hand with 5th+6th card bonus/penalty system.
 *
 * PLO6 scoring is the TIGHTEST of all variants:
 *   1. Find best 4-card subset score (C(6,4)=15 combos)
 *   2. Evaluate how 5th+6th cards ADD to the hand
 *   3. Triple-suit bonus (+20), extended rundown bonus (+15)
 *   4. Severe dangler penalty (-30 per dangler)
 *   5. Single-suited penalty (-15)
 *
 * In PLO6, avg hand is very strong so thresholds are much higher.
 *
 * @param {string[]} holeCards - Array of 6 hole card strings
 * @returns {{ score: number, tier: string, extraCardValue: string, suitedness: string, nutPotential: string }}
 */
function scorePLO6Hand(holeCards) {
    if (!holeCards || holeCards.length !== 6) {
        return { score: 0, tier: 'trash', extraCardValue: 'missing', suitedness: 'unknown', nutPotential: 'none' };
    }

    // Step 1: Get base score from best 4-card subset (C(6,4)=15 combos)
    const baseResult = getBestPLO5or6PreflopStrength(holeCards);
    let baseScore = typeof baseResult === 'number' ? baseResult : (baseResult?.score || 0);

    // Step 2: Parse all 6 cards
    const parsed = holeCards.map(_parseCard6);
    const ranks = parsed.map(c => c.rank).sort((a, b) => a - b);
    const suits = parsed.map(c => c.suit);

    // Step 3: Evaluate suitedness
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const suitValues = Object.values(suitCounts).sort((a, b) => b - a);
    const numSuitsWithPairs = suitValues.filter(v => v >= 2).length;

    let suitedness = 'rainbow';
    if (numSuitsWithPairs >= 3) suitedness = 'triple-suited';
    else if (numSuitsWithPairs >= 2) suitedness = 'double-suited';
    else if (suitValues[0] >= 2) suitedness = 'single-suited';

    // Step 4: Extra card bonuses/penalties
    let extraBonus = 0;
    let extraCardValue = 'neutral';

    // BONUS: Triple-suited (+20) -- 3 different suits with 2+ cards each
    if (suitedness === 'triple-suited') {
        extraBonus += 20;
        extraCardValue = 'triple-suited';
    } else if (suitedness === 'double-suited') {
        extraBonus += 12;
        if (extraCardValue === 'neutral') extraCardValue = 'double-suited';
    }

    // PENALTY: Single-suited only (-15) -- in PLO6, single-suited is marginal at best
    if (suitedness === 'single-suited') {
        extraBonus -= 15;
        extraCardValue = 'single-suited-penalty';
    }
    if (suitedness === 'rainbow') {
        extraBonus -= 20;
        extraCardValue = 'rainbow-penalty';
    }

    // BONUS: Extended rundown -- check for 5 or 6 consecutive (with small gaps)
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) {
            curRun++;
            if (curRun > maxRun) maxRun = curRun;
        } else {
            curRun = 1;
        }
    }
    if (maxRun >= 6) {
        extraBonus += 18; // 6-card rundown -- monster connectivity
        if (extraCardValue === 'neutral' || extraCardValue === 'double-suited') extraCardValue = '6-card-rundown';
    } else if (maxRun >= 5) {
        extraBonus += 15; // 5-card run within 6 cards
        if (extraCardValue === 'neutral') extraCardValue = '5-card-rundown';
    } else if (maxRun >= 4) {
        extraBonus += 8;
    }

    // BONUS: Double-paired (+12) -- full house potential on 2 different boards
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const pairCount = Object.values(rankCounts).filter(c => c >= 2).length;
    if (pairCount >= 2) {
        extraBonus += 12;
        if (extraCardValue === 'neutral') extraCardValue = 'double-paired';
    }

    // PENALTY: Dangler detection -- cards with rank gap >= 5 from nearest neighbor
    // In PLO6, danglers are punished MUCH more harshly (-30 each)
    let danglerCount = 0;
    for (let i = 0; i < ranks.length; i++) {
        const others = ranks.filter((_, j) => j !== i);
        const minGap = Math.min(...others.map(o => Math.abs(ranks[i] - o)));
        if (minGap >= 5) {
            danglerCount++;
        }
    }
    if (danglerCount >= 2) {
        extraBonus -= 40; // Two or more danglers -- total trash
        extraCardValue = 'multi-dangler';
    } else if (danglerCount === 1) {
        extraBonus -= 30; // One dangler -- severe in PLO6
        if (extraCardValue === 'neutral' || extraCardValue.includes('penalty')) extraCardValue = 'dangler';
    }

    // BONUS: Ace with nut flush potential
    const hasAce = ranks.includes(12);
    if (hasAce) {
        // Check how many suits the ace is part of for flush draws
        const aceIndices = parsed.reduce((acc, c, i) => c.rank === 12 ? [...acc, i] : acc, []);
        for (const ai of aceIndices) {
            const aceSuit = suits[ai];
            const sameSuit = suits.filter(s => s === aceSuit).length;
            if (sameSuit >= 2) {
                extraBonus += 6; // Each suited ace = nut flush potential
                break; // Don't double-count
            }
        }
    }

    const finalScore = Math.max(0, Math.min(100, baseScore + extraBonus));

    // Tier assignment -- PLO6 is the TIGHTEST (25% tighter than PLO4)
    // Average hand is very strong, so "playable" bar is very high
    let tier = 'trash';
    if (finalScore >= 90) tier = 'premium';      // Top 5% -- AAxx double-suited + connectivity
    else if (finalScore >= 78) tier = 'strong';   // Top 15% -- high rundowns, suited aces
    else if (finalScore >= 65) tier = 'playable'; // Top 30% -- double-suited with nut potential
    else if (finalScore >= 50) tier = 'marginal'; // Top 50% -- playable in position only
    // Below 50 = trash in PLO6

    // Nut potential assessment
    let nutPotential = 'none';
    if (hasAce && suitedness === 'triple-suited') nutPotential = 'high';
    else if (hasAce && suitedness === 'double-suited') nutPotential = 'medium';
    else if (suitedness === 'double-suited' || suitedness === 'triple-suited') nutPotential = 'low';

    return { score: finalScore, tier, extraCardValue, suitedness, nutPotential };
}

// ======================================================================
// PLO6 PREFLOP ACTION SELECTION
// ======================================================================

/**
 * Determine PLO6 preflop action based on hand score, position, and action.
 *
 * PLO6 ranges are ~25% TIGHTER than PLO4 at every position.
 * This is the tightest of all PLO variants.
 * 3-bet OOP is extremely tight (hard to realize equity OOP).
 * Open sizing is smaller (2.5x -- ranges are so strong big opens get called anyway).
 *
 * @param {number} score - Hand score (0-100) from scorePLO6Hand
 * @param {string} position - UTG, MP, CO, BTN, SB, BB
 * @param {string} facing - 'unopened', 'raise', '3bet', '4bet'
 * @param {number} numPlayers - Active players
 * @param {number} stackBB - Effective stack in BBs
 * @returns {{ action: string, sizing: string, confidence: number }}
 */
function getPLO6PreflopAction(score, position, facing, numPlayers, stackBB) {
    // Position-based thresholds (25% tighter than PLO4 -- tightest of all variants)
    const openThresholds = {
        UTG: 80, UTG1: 78, EP: 76, MP: 70, LJ: 66, HJ: 62, CO: 55, BTN: 45, SB: 60, BB: 0
    };
    const callRaiseThresholds = {
        UTG: 85, UTG1: 83, EP: 80, MP: 75, LJ: 72, HJ: 68, CO: 62, BTN: 52, SB: 68, BB: 50
    };
    const threeBetThresholds = {
        UTG: 92, UTG1: 90, EP: 88, MP: 85, LJ: 83, HJ: 82, CO: 78, BTN: 72, SB: 82, BB: 78
    };

    const pos = position || 'MP';
    const openT = openThresholds[pos] || 68;
    const callT = callRaiseThresholds[pos] || 72;
    const threeT = threeBetThresholds[pos] || 85;

    // Short stack adjustment (< 20BB = push/fold territory)
    if (stackBB && stackBB < 20) {
        if (score >= 80) return { action: 'raise', sizing: 'allin', confidence: 0.85 };
        if (score >= 65 && (pos === 'BTN' || pos === 'SB' || pos === 'CO')) {
            return { action: 'raise', sizing: 'allin', confidence: 0.65 };
        }
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    if (facing === 'unopened') {
        if (score >= threeT) return { action: 'raise', sizing: 'pot', confidence: 0.9 };
        if (score >= openT) return { action: 'raise', sizing: '2.5x', confidence: 0.7 };
        return { action: 'fold', sizing: null, confidence: 0.85 };
    }

    if (facing === 'raise') {
        if (score >= threeT) return { action: '3bet', sizing: 'pot', confidence: 0.85 };
        if (score >= callT) {
            // In PLO6, only call raises IP -- OOP fold more
            const isOOP = pos === 'SB' || pos === 'BB' || pos === 'UTG';
            if (isOOP && score < callT + 5) return { action: 'fold', sizing: null, confidence: 0.6 };
            return { action: 'call', sizing: null, confidence: 0.55 };
        }
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    if (facing === '3bet') {
        // vs 3-bet in PLO6: EXTREMELY tight. Only nut hands continue.
        if (score >= 93) return { action: '4bet', sizing: 'pot', confidence: 0.8 };
        if (score >= 85 && (pos === 'BTN' || pos === 'CO')) return { action: 'call', sizing: null, confidence: 0.45 };
        if (score >= 88) return { action: 'call', sizing: null, confidence: 0.4 };
        return { action: 'fold', sizing: null, confidence: 0.8 };
    }

    // Facing 4-bet: only absolute monsters
    if (score >= 95) return { action: 'call', sizing: null, confidence: 0.55 };
    return { action: 'fold', sizing: null, confidence: 0.9 };
}

// ======================================================================
// PLO6 POSTFLOP: NUT-OR-NOTHING STRATEGY
// ======================================================================

/**
 * PLO6 flush hierarchy evaluator.
 *
 * In PLO6, the flush hierarchy COLLAPSES:
 *   - Ace-high flush = STRONG (commit)
 *   - King-high flush = MARGINAL (call one street max)
 *   - Queen-high flush = FOLD facing aggression
 *   - Anything below = pure trash, never commit
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ flushRank: string, flushStrength: number, commitLevel: string }}
 */
function evaluatePLO6FlushHierarchy(holeCards, boardCards) {
    if (!holeCards || !boardCards) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'fold' };
    }

    // Find board suits with 3+ cards (potential flush board)
    const boardSuits = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        boardSuits[s] = (boardSuits[s] || 0) + 1;
    });

    const flushSuit = Object.entries(boardSuits).find(([, count]) => count >= 3);
    if (!flushSuit) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    const [suit] = flushSuit;

    // Find our cards in the flush suit
    const ourFlushCards = holeCards
        .filter(c => c[c.length - 1] === suit)
        .map(c => {
            const rankChar = c.length === 3 ? c.substring(0, 2) : c[0];
            return RANK_ORDER.indexOf(rankChar === '10' ? 'T' : rankChar);
        })
        .sort((a, b) => b - a); // Highest first

    if (ourFlushCards.length < 2) {
        return { flushRank: 'none', flushStrength: 0, commitLevel: 'none' };
    }

    // Only need 2 cards from our hand for a flush in Omaha
    const highestCard = ourFlushCards[0];

    if (highestCard === 12) {
        // Ace-high flush -- COMMIT
        return { flushRank: 'nut', flushStrength: 95, commitLevel: 'commit' };
    }
    if (highestCard === 11) {
        // King-high flush -- MARGINAL (call 1 street max)
        return { flushRank: 'king-high', flushStrength: 55, commitLevel: 'one-street' };
    }
    if (highestCard === 10) {
        // Queen-high flush -- FOLD facing aggression
        return { flushRank: 'queen-high', flushStrength: 30, commitLevel: 'fold-to-aggression' };
    }
    // Anything below queen -- pure trash
    return { flushRank: 'low', flushStrength: 15, commitLevel: 'fold' };
}

/**
 * PLO6 nut distance evaluator.
 *
 * Measures how far a made hand is from the absolute nuts on the current board.
 * In PLO6, non-nut hands are nearly worthless because opponents with 6 cards
 * almost always have the nuts or a draw to the nuts.
 *
 * nutDistance 0 = the nuts
 * nutDistance 1 = 2nd nuts (may commit on dry boards)
 * nutDistance 2 = 3rd nuts (check/call at best)
 * nutDistance 3+ = trash, never commit
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ isNutHand: boolean, nutDistance: number, commitWorthy: boolean, category: string }}
 */
function evaluatePLO6NutDistance(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 6 || !boardCards || boardCards.length < 3) {
        return { isNutHand: false, nutDistance: 99, commitWorthy: false, category: 'unknown' };
    }

    const bestHand = getBestPLO5or6MadeHand(holeCards, boardCards);
    const strength = bestHand?.strength || 0;
    const category = bestHand?.category || 'high_card';

    let isNutHand = false;
    let nutDistance = 99;
    let commitWorthy = false;

    // ---- STRAIGHT FLUSH / QUADS ----
    if (category === 'straight_flush') {
        isNutHand = true;
        nutDistance = 0;
        commitWorthy = true;
    } else if (category === 'quads') {
        isNutHand = strength >= 92;
        nutDistance = isNutHand ? 0 : 1;
        commitWorthy = true;
    }
    // ---- FULL HOUSE ----
    else if (category === 'full_house') {
        if (strength >= 88) {
            // Top full house -- nut
            isNutHand = true;
            nutDistance = 0;
            commitWorthy = true;
        } else if (strength >= 75) {
            nutDistance = 1;
            commitWorthy = true;
        } else {
            // Low full house -- vulnerable in PLO6 (opponents have many FH combos)
            nutDistance = 2;
            commitWorthy = false; // Underfull = check-call at best
        }
    }
    // ---- FLUSH ----
    else if (category === 'flush') {
        const flushInfo = evaluatePLO6FlushHierarchy(holeCards, boardCards);
        if (flushInfo.flushRank === 'nut') {
            nutDistance = 0;
            isNutHand = true;
            commitWorthy = true;
        } else if (flushInfo.flushRank === 'king-high') {
            nutDistance = 1;
            commitWorthy = false; // King-high flush = ONE street of calling max
        } else {
            nutDistance = 2;
            commitWorthy = false; // Queen-high and below = fold to aggression
        }
    }
    // ---- STRAIGHT ----
    else if (category === 'straight') {
        if (strength >= 85) {
            // Nut straight
            nutDistance = 1; // Even nut straight = only near-nut in PLO6 (flushes everywhere)
            commitWorthy = boardCards && !_boardHasFlushDraw(boardCards);
        } else {
            // Non-nut straight = very dangerous in PLO6
            nutDistance = 2;
            commitWorthy = false;
        }
    }
    // ---- SET / TRIPS ----
    else if (category === 'set' || category === 'trips') {
        if (strength >= 78) {
            // Top set
            nutDistance = 2;
            // Top set ONLY commits with a redraw
            commitWorthy = false; // Will be overridden by draw check in main decision
        } else {
            nutDistance = 3;
            commitWorthy = false;
        }
    }
    // ---- TWO PAIR ----
    else if (category === 'two_pair') {
        // TWO PAIR IS WORTHLESS IN PLO6 -- never commit significant chips
        nutDistance = 4;
        commitWorthy = false;
    }
    // ---- EVERYTHING ELSE ----
    else {
        nutDistance = 5;
        commitWorthy = false;
    }

    return { isNutHand, nutDistance, commitWorthy, category };
}

/**
 * Helper: check if the board has a flush draw (3 of same suit).
 */
function _boardHasFlushDraw(boardCards) {
    const suitCounts = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        suitCounts[s] = (suitCounts[s] || 0) + 1;
    });
    return Object.values(suitCounts).some(v => v >= 3);
}

/**
 * Helper: check if the board is paired.
 */
function _boardIsPaired(boardCards) {
    const rankCounts = {};
    boardCards.forEach(c => {
        const r = c.length === 3 ? c.substring(0, 2) : c[0];
        rankCounts[r] = (rankCounts[r] || 0) + 1;
    });
    return Object.values(rankCounts).some(v => v >= 2);
}

// ======================================================================
// PLO6 BLOCKER-BASED BLUFFING
// ======================================================================

/**
 * Evaluate blocker value for bluffing in PLO6.
 *
 * Core principle: PLO6 bluffs must be BLOCKER-BASED, not hand-strength-based.
 * With 6 cards, hand strength tells you almost nothing. What matters is
 * whether you BLOCK your opponent from having the nuts.
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ blockerScore: number, blocksNutFlush: boolean, blocksNutStraight: boolean, blocksFullHouse: boolean, shouldBluff: boolean }}
 */
function getPLO6BlockerValue(holeCards, boardCards) {
    if (!holeCards || !boardCards || boardCards.length < 3) {
        return { blockerScore: 0, blocksNutFlush: false, blocksNutStraight: false, blocksFullHouse: false, shouldBluff: false };
    }

    let blockerScore = 0;
    let blocksNutFlush = false;
    let blocksNutStraight = false;
    let blocksFullHouse = false;

    const parsed = holeCards.map(_parseCard6);

    // ---- NUT FLUSH BLOCKER ----
    // If the board has 3 of a suit and we hold the Ace of that suit
    const boardSuits = {};
    boardCards.forEach(c => {
        const s = c[c.length - 1];
        boardSuits[s] = (boardSuits[s] || 0) + 1;
    });

    for (const [suit, count] of Object.entries(boardSuits)) {
        if (count >= 3) {
            // Flush possible -- check if we block the nut flush
            const hasAceOfSuit = parsed.some(c => c.rank === 12 && c.suit === suit);
            const hasKingOfSuit = parsed.some(c => c.rank === 11 && c.suit === suit);
            if (hasAceOfSuit) {
                blocksNutFlush = true;
                blockerScore += 35; // VERY strong bluff spot
            } else if (hasKingOfSuit) {
                blockerScore += 15; // Blocks 2nd nut flush
            }
        }
    }

    // ---- NUT STRAIGHT BLOCKER ----
    // Check if we block the top straight card combinations
    const boardRanks = boardCards.map(c => {
        const r = c.length === 3 ? c.substring(0, 2) : c[0];
        return RANK_ORDER.indexOf(r === '10' ? 'T' : r);
    }).sort((a, b) => b - a);

    // The highest possible straight uses cards above the board
    const maxBoardRank = boardRanks[0];
    if (maxBoardRank !== undefined) {
        // Check if we hold cards that would complete the nut straight
        const nutStraightCards = [maxBoardRank + 1, maxBoardRank + 2].filter(r => r <= 12);
        const blockedNutCards = nutStraightCards.filter(r => parsed.some(c => c.rank === r));
        if (blockedNutCards.length >= 1) {
            blocksNutStraight = true;
            blockerScore += 20;
        }
    }

    // ---- FULL HOUSE BLOCKER ----
    // On paired boards, check if we block the top pair card
    if (_boardIsPaired(boardCards)) {
        const boardRankCounts = {};
        boardCards.forEach(c => {
            const r = c.length === 3 ? c.substring(0, 2) : c[0];
            const rank = RANK_ORDER.indexOf(r === '10' ? 'T' : r);
            boardRankCounts[rank] = (boardRankCounts[rank] || 0) + 1;
        });

        for (const [rank, count] of Object.entries(boardRankCounts)) {
            if (count >= 2) {
                // Board is paired on this rank -- do we block the top trips/quads?
                const topUnpairedRank = boardRanks.find(r => boardRankCounts[r] === 1);
                if (topUnpairedRank !== undefined && parsed.some(c => c.rank === topUnpairedRank)) {
                    blocksFullHouse = true;
                    blockerScore += 15;
                }
            }
        }
    }

    // Should we bluff? PLO6 bluffing criteria:
    // - Must have blocker score >= 30 (meaningful blockers)
    // - In multiway pots, almost never bluff (someone always has it)
    const shouldBluff = blockerScore >= 30;

    return { blockerScore, blocksNutFlush, blocksNutStraight, blocksFullHouse, shouldBluff };
}

/**
 * Full PLO6 bluff decision.
 *
 * When to bluff in PLO6:
 *   - Hold the nut flush blocker (A of suit) on flush boards
 *   - Hold top straight card blockers on straight boards
 *   - On paired boards when you block full houses
 *
 * When NOT to bluff:
 *   - Multiway pots (someone almost always has it)
 *   - Without relevant blockers
 *   - On boards with multiple draw completions
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {number} numPlayers - Active players in hand
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call (0 if betting)
 * @returns {{ shouldBluff: boolean, bluffSize: number, bluffReason: string }}
 */
function shouldPLO6Bluff(holeCards, boardCards, numPlayers, street, potSize, toCall) {
    // NEVER bluff multiway in PLO6 (3+ players)
    if (numPlayers > 2) {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'multiway-never-bluff' };
    }

    // Rarely bluff on flop in PLO6 (too many draws out there)
    if (street === 'flop') {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'flop-too-early' };
    }

    const blockerInfo = getPLO6BlockerValue(holeCards, boardCards);

    if (!blockerInfo.shouldBluff) {
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'insufficient-blockers' };
    }

    // On the river, blocker bluffs with nut flush blocker are strong
    let bluffReason = 'blocker-bluff';
    if (blockerInfo.blocksNutFlush) bluffReason = 'nut-flush-blocker';
    else if (blockerInfo.blocksNutStraight) bluffReason = 'nut-straight-blocker';
    else if (blockerInfo.blocksFullHouse) bluffReason = 'full-house-blocker';

    // PLO6 bluff sizing -- polarized on river (80-100% pot)
    let bluffSizeFraction = street === 'river' ? 0.80 : 0.60;

    // Reduce bluff frequency on boards with multiple draw completions
    const boardTexture = analyzePLOBoardTexture(boardCards);
    if (boardTexture?.wetness >= 70) {
        // Very wet board -- too many nuts possible
        return { shouldBluff: false, bluffSize: 0, bluffReason: 'board-too-wet' };
    }

    return {
        shouldBluff: true,
        bluffSize: Math.round(potSize * bluffSizeFraction),
        bluffReason,
    };
}

// ======================================================================
// PLO6 POSTFLOP HAND STRENGTH ADJUSTMENTS
// ======================================================================

/**
 * Adjust postflop hand strength for PLO6-specific factors.
 *
 * PLO6 adjustments are MORE EXTREME than PLO5:
 *   - Two-pair is WORTHLESS (never commit)
 *   - Non-nut flushes collapse: Q-high flush = fold to aggression
 *   - Sets without redraws are NOT enough to stack off
 *   - Bottom/middle straights = fold to aggression
 *   - Combo draws are monster (everyone has draws, but nut draws dominate)
 *
 * @param {Object} madeHand - Result from evaluatePLOMadeHand or getBestPLO5or6MadeHand
 * @param {Object} drawInfo - { flushOuts, straightOuts, wrapOuts, totalOuts }
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @returns {{ adjustedStrength: number, commitWorthy: boolean, nutStatus: string }}
 */
function adjustPLO6PostflopStrength(madeHand, drawInfo, street, holeCards, boardCards) {
    let strength = madeHand?.strength || 0;
    const category = madeHand?.category || 'high_card';
    const totalOuts = drawInfo?.totalOuts || 0;

    // ---- TWO-PAIR: WORTHLESS in PLO6 ----
    if (category === 'two_pair') {
        strength = Math.round(strength * 0.45); // 55% devaluation (much harsher than PLO5's 30%)
    }

    // ---- FLUSH HIERARCHY ----
    if (category === 'flush') {
        const flushInfo = evaluatePLO6FlushHierarchy(holeCards, boardCards);
        if (flushInfo.flushRank === 'nut') {
            strength = Math.max(strength, 90); // Ensure nut flush stays strong
        } else if (flushInfo.flushRank === 'king-high') {
            strength = Math.round(strength * 0.60); // 40% devaluation -- marginal
        } else if (flushInfo.flushRank === 'queen-high') {
            strength = Math.round(strength * 0.35); // 65% devaluation -- fold-worthy
        } else {
            strength = Math.round(strength * 0.20); // Below queen = pure trash
        }
    }

    // ---- NON-NUT STRAIGHT DEVALUATION ----
    if (category === 'straight') {
        // In PLO6, only nut straights have value on non-flush boards
        if (strength < 85) {
            strength = Math.round(strength * 0.55); // Non-nut straight = dangerous
        }
        // Even nut straights are devalued on flush boards
        if (boardCards && _boardHasFlushDraw(boardCards)) {
            strength = Math.round(strength * 0.70);
        }
    }

    // ---- SET WITHOUT REDRAW ----
    if ((category === 'set' || category === 'trips') && totalOuts < 6) {
        // Set ALONE is NOT enough to stack off in PLO6
        strength = Math.round(strength * 0.75); // 25% devaluation (harsher than PLO5's 15%)
    }

    // ---- SET WITH REDRAW: OK ----
    if ((category === 'set' || category === 'trips') && totalOuts >= 9) {
        // Top set + flush draw = commit
        const hasAce = holeCards && holeCards.some(c => c[0] === 'A');
        if (hasAce && totalOuts >= 12) {
            strength = Math.min(95, strength + 15); // Top set + nut flush draw = monster
        }
    }

    // ---- COMBO DRAW BOOST ----
    if (street !== 'river') {
        const flushOuts = drawInfo?.flushOuts || 0;
        const straightOuts = drawInfo?.straightOuts || 0;
        const isCombo = flushOuts >= 7 && straightOuts >= 6;
        if (isCombo) {
            // In PLO6, combo draws are even stronger (more cards = more combos)
            const drawBoost = Math.min(30, Math.round(totalOuts * 1.3));
            strength = Math.min(96, strength + drawBoost);
        } else if (totalOuts >= 15) {
            const drawBoost = Math.min(20, Math.round(totalOuts * 0.9));
            strength = Math.min(92, strength + drawBoost);
        }
    }

    // Nut status
    let nutStatus = 'non-nut';
    if (strength >= 90) nutStatus = 'nut';
    else if (strength >= 72) nutStatus = 'near-nut';
    else if (strength >= 50) nutStatus = 'marginal';

    // Commit threshold -- HIGHER than PLO5 (nut-or-nothing)
    const commitThreshold = street === 'river' ? 72 : 65;
    const commitWorthy = strength >= commitThreshold || (street !== 'river' && totalOuts >= 16);

    return { adjustedStrength: strength, commitWorthy, nutStatus };
}

// ======================================================================
// PLO6 DRAW EVALUATION
// ======================================================================

/**
 * PLO6-specific draw evaluation.
 *
 * With 6 hole cards, draws are EXTREMELY common and often very strong.
 * A hand without a draw on the flop is unusually weak in PLO6.
 * Monster draws (20+ outs) are the NORM, not the exception.
 *
 * Only NUT draws matter. Non-nut draws are dangerous traps.
 *
 * @param {string[]} holeCards - 6 hole cards
 * @param {string[]} boardCards - Community cards
 * @param {string} street - 'flop', 'turn'
 * @param {number} potSize - Current pot
 * @param {number} toCall - Amount to call
 * @returns {{ totalOuts: number, equity: number, potOddsNeeded: number, isProfitableCall: boolean, drawTier: string, nutDrawCount: number }}
 */
function getPLO6DrawEquity(holeCards, boardCards, street, potSize, toCall) {
    if (!holeCards || !boardCards || street === 'river') {
        return { totalOuts: 0, equity: 0, potOddsNeeded: 0, isProfitableCall: false, drawTier: 'none', nutDrawCount: 0 };
    }

    const flushOuts = countFlushOuts(holeCards, boardCards);
    const straightOuts = countStraightOuts(holeCards, boardCards);
    const wrapInfo = detectPLOWrapDraw(holeCards, boardCards);
    const backdoorOuts = street === 'flop' ? countBackdoorOuts(holeCards, boardCards) : 0;

    // PLO6 adjustment: +20% more draw combos hit (even more than PLO5's +15%)
    const plo6DrawMultiplier = 1.20;
    let rawOuts = flushOuts + straightOuts + (wrapInfo.isWrap ? Math.max(0, wrapInfo.outs - straightOuts) : 0);
    rawOuts = Math.min(30, Math.round(rawOuts * plo6DrawMultiplier));

    const totalOuts = rawOuts + Math.round(backdoorOuts * 0.5);

    // Convert outs to equity
    const cardsToComeFactor = street === 'flop' ? 4 : 2;
    const equity = Math.min(85, totalOuts * cardsToComeFactor) / 100;

    // Pot odds
    const potOddsNeeded = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const isProfitableCall = equity >= potOddsNeeded;

    // Draw tier -- PLO6 has higher thresholds (monster draws are common)
    let drawTier = 'none';
    if (totalOuts >= 22) drawTier = 'monster';     // Common in PLO6
    else if (totalOuts >= 16) drawTier = 'strong';
    else if (totalOuts >= 10) drawTier = 'decent';
    else if (totalOuts >= 5) drawTier = 'weak';

    // Count NUT draws (only nut draws matter in PLO6)
    let nutDrawCount = 0;
    const hasAce = holeCards.some(c => c[0] === 'A');
    if (flushOuts >= 9 && hasAce) nutDrawCount++; // Nut flush draw
    if (wrapInfo.isWrap && wrapInfo.outs >= 15) nutDrawCount++; // Big wrap
    if (straightOuts >= 10) nutDrawCount++; // Strong straight draw

    return { totalOuts, equity, potOddsNeeded, isProfitableCall, drawTier, nutDrawCount };
}

// ======================================================================
// PLO6 BET SIZING
// ======================================================================

/**
 * Get PLO6-specific bet sizing.
 *
 * PLO6 sizing is SMALLER than PLO4/PLO5 because everyone connects:
 *   - C-bet: 40-50% pot (SMALLEST of all PLO variants)
 *   - Turn: Polarized -- 55-70% pot
 *   - River: Polarized -- 80-100% for value, small for thin value
 *   - Overbet: Almost NEVER (opponents have too many nut combos)
 *   - Check-raise: MORE frequent (hit strong more often on both sides)
 *
 * @param {string} street - 'flop', 'turn', 'river'
 * @param {string} action - 'cbet', 'value', 'bluff', 'protection', 'check-raise'
 * @param {number} potSize - Current pot
 * @param {number} strength - Hand strength (0-100)
 * @param {Object} opts - { numPlayers, isIP, stackBB, nutStatus }
 * @returns {number} Bet size in chips
 */
function getPLO6BetSize(street, action, potSize, strength, opts = {}) {
    const { numPlayers = 2, isIP = true, nutStatus = 'non-nut' } = opts;

    let sizeFraction = 0.45; // Default 45% pot (smallest of all PLO variants)

    if (street === 'flop') {
        if (action === 'cbet') {
            // PLO6 c-bets are the SMALLEST -- everyone has something
            sizeFraction = numPlayers > 2 ? 0.33 : 0.45;
        } else if (action === 'value') {
            sizeFraction = nutStatus === 'nut' ? 0.60 : 0.45;
        } else if (action === 'bluff') {
            sizeFraction = 0.40; // Tiny bluffs -- opponents call wide
        } else if (action === 'check-raise') {
            sizeFraction = 0.85; // Check-raises are pot-level
        }
    } else if (street === 'turn') {
        // Polarized: either betting for value or bluffing
        if (action === 'value') {
            sizeFraction = nutStatus === 'nut' ? 0.70 : 0.55;
        } else if (action === 'bluff') {
            sizeFraction = 0.60;
        } else {
            sizeFraction = 0.55;
        }
    } else if (street === 'river') {
        // POLARIZED sizing on river
        if (action === 'value') {
            if (nutStatus === 'nut') {
                sizeFraction = 0.90; // Big value with nuts
            } else {
                sizeFraction = 0.55; // Thin value -- small
            }
        } else if (action === 'bluff') {
            sizeFraction = 0.80; // Blocker bluffs should be large
        }
    }

    // Multiway discount (more extreme in PLO6)
    if (numPlayers > 2) sizeFraction *= 0.75;

    // OOP plays smaller
    if (!isIP) sizeFraction *= 0.90;

    return Math.round(potSize * sizeFraction);
}

// ======================================================================
// PLO6 EQUITY REALIZATION
// ======================================================================

/**
 * Calculate PLO6-specific equity realization.
 * With 6 hole cards, players realize the MOST equity of any PLO variant.
 * Almost every draw hits, making position and nut advantage paramount.
 *
 * @param {number} baseEquity - Raw equity estimate (0-100)
 * @param {string} position - Player position
 * @param {number} numPlayers - Active players
 * @returns {number} Adjusted equity realization factor (0-1)
 */
function getPLO6EquityRealization(baseEquity, position, numPlayers) {
    const baseER = getPLOEquityRealization(baseEquity, position, numPlayers);
    // PLO6 bonus: +12% equity realization (most of any variant)
    return Math.min(1.0, baseER + 0.12);
}

// ======================================================================
// PLO6 MAIN DECISION ENGINE
// ======================================================================

/**
 * Main PLO6 decision entry point.
 *
 * This implements the FULL PLO6 strategy, NOT just a thin wrapper:
 *   - Preflop: PLO6-specific scoring with 25% tighter ranges
 *   - Postflop: Nut-or-nothing evaluation, flush hierarchy, blocker bluffing
 *   - Sizing: Smallest of all PLO variants (everyone connects)
 *   - Bluffing: Blocker-based only (hand strength means nothing)
 *
 * @param {string} profileId - Horse profile UUID
 * @param {Object} gameState - Standard game state with holeCards, board, etc.
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Decision { type, amount }
 */
function makePLO6Decision(profileId, gameState, legalActions) {
    // ---- PREFLOP: PLO6-specific scoring ----
    if (gameState.street === 'preflop' && gameState.holeCards?.length === 6) {
        const handScore = scorePLO6Hand(gameState.holeCards);

        // Determine facing action
        let facing = 'unopened';
        if (gameState.toCall > (gameState.bb || 1) * 5) facing = '3bet';
        else if (gameState.toCall > 0) facing = 'raise';

        const preflopAction = getPLO6PreflopAction(
            handScore.score, gameState.position, facing,
            gameState.numPlayers, gameState.stackBB
        );

        // Map to engine action format
        if (preflopAction.action === 'fold') {
            const canCheck = legalActions.some(a => a.type === 'check');
            return { type: canCheck ? 'check' : 'fold', amount: 0 };
        }
        if (preflopAction.action === 'call') {
            const canCall = legalActions.some(a => a.type === 'call');
            return { type: canCall ? 'call' : 'fold', amount: 0 };
        }
        if (['raise', '3bet', '4bet'].includes(preflopAction.action)) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                // PLO6 open sizing is 2.5x (smaller -- ranges are strong, big opens get called anyway)
                let raiseSize;
                if (preflopAction.sizing === 'allin') {
                    raiseSize = raiseAction.maxAmount || gameState.stackBB * (gameState.bb || 1);
                } else if (preflopAction.sizing === 'pot') {
                    raiseSize = Math.round((gameState.potSize || (gameState.bb || 1) * 3) * 1.0);
                } else {
                    raiseSize = Math.round((gameState.bb || 1) * 2.5);
                }
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(raiseSize, raiseAction.maxAmount || raiseSize));
                return { type: raiseAction.type, amount };
            }
            return { type: 'call', amount: 0 };
        }
    }

    // ---- POSTFLOP: Nut-or-nothing + blocker bluffing ----
    if (gameState.street !== 'preflop' && gameState.holeCards?.length === 6 && gameState.board?.length >= 3) {
        const nutInfo = evaluatePLO6NutDistance(gameState.holeCards, gameState.board);
        const drawInfo = getPLO6DrawEquity(
            gameState.holeCards, gameState.board, gameState.street,
            gameState.potSize || 0, gameState.toCall || 0
        );

        // Combine made hand + draw strength
        const madeHand = getBestPLO5or6MadeHand(gameState.holeCards, gameState.board);
        const adjusted = adjustPLO6PostflopStrength(
            madeHand, { flushOuts: drawInfo.totalOuts, straightOuts: 0, totalOuts: drawInfo.totalOuts },
            gameState.street, gameState.holeCards, gameState.board
        );

        const strength = adjusted.adjustedStrength;
        const toCall = gameState.toCall || 0;
        const potSize = gameState.potSize || 1;

        // NUT HAND: Commit aggressively
        if (nutInfo.isNutHand || strength >= 88) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction) {
                const nutStatus = strength >= 90 ? 'nut' : 'near-nut';
                const betSize = getPLO6BetSize(gameState.street, 'value', potSize, strength, {
                    numPlayers: gameState.numPlayers || 2,
                    isIP: gameState.position === 'BTN' || gameState.position === 'CO',
                    nutStatus,
                });
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
            return { type: 'call', amount: 0 };
        }

        // STRONG DRAW: Semi-bluff with nut draws
        if (drawInfo.nutDrawCount >= 1 && drawInfo.totalOuts >= 14 && gameState.street !== 'river') {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && toCall === 0) {
                // Bet with nut draws
                const betSize = getPLO6BetSize(gameState.street, 'bluff', potSize, strength, {
                    numPlayers: gameState.numPlayers || 2,
                });
                const amount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
            // Call with profitable draws
            if (drawInfo.isProfitableCall && toCall > 0) {
                return { type: 'call', amount: 0 };
            }
        }

        // MARGINAL HAND: Check/call or fold
        if (strength >= 50 && strength < 88) {
            if (toCall === 0) {
                // Check when marginal and not facing bet
                const canCheck = legalActions.some(a => a.type === 'check');
                if (canCheck) return { type: 'check', amount: 0 };
            }
            // Facing a bet: only call if getting decent odds with a draw or near-nut hand
            if (toCall > 0) {
                const callableStrength = strength >= 65 || drawInfo.isProfitableCall;
                if (callableStrength && toCall <= potSize * 0.7) {
                    return { type: 'call', amount: 0 };
                }
            }
        }

        // BLOCKER BLUFF on river (heads-up only)
        if (gameState.street === 'river' && toCall === 0 && (gameState.numPlayers || 2) <= 2) {
            const bluffInfo = shouldPLO6Bluff(
                gameState.holeCards, gameState.board, gameState.numPlayers || 2,
                gameState.street, potSize, toCall
            );
            if (bluffInfo.shouldBluff) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const amount = Math.max(raiseAction.minAmount || 1, Math.min(bluffInfo.bluffSize, raiseAction.maxAmount || bluffInfo.bluffSize));
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // TRASH: Check or fold
        const canCheck = legalActions.some(a => a.type === 'check');
        if (canCheck) return { type: 'check', amount: 0 };
        return { type: 'fold', amount: 0 };
    }

    // Fallback: delegate to shared PLO engine
    return makePLOFallbackDecision(profileId, gameState, legalActions);
}

// ======================================================================
// EXPORTS
// ======================================================================

module.exports = {
    // Preflop
    scorePLO6Hand,
    getPLO6PreflopAction,

    // Postflop: nut-or-nothing
    evaluatePLO6FlushHierarchy,
    evaluatePLO6NutDistance,
    adjustPLO6PostflopStrength,

    // Blocker bluffing
    getPLO6BlockerValue,
    shouldPLO6Bluff,

    // Draws
    getPLO6DrawEquity,

    // Sizing
    getPLO6BetSize,

    // Equity realization
    getPLO6EquityRealization,

    // Main decision engine
    makePLO6Decision,
};
