/**
 * 🃏 Poker Hand Evaluator (GTO Wizard Classification Style)
 * ═══════════════════════════════════════════════════════════════════════════
 * Evaluates a 2-card Hero hand against a 3-to-5 card Board to classify 
 * the hand strength into professional buckets (e.g., Top Pair, OESD, Flush Draw).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Rank values for math mapping
const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Map values back to notation
const VALUE_TO_RANK = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

/**
 * Normalizes card strings (e.g., "Ah" or "A h", "10d" -> "Td") to standard { rank, suit, value }
 */
function parseCard(cardStr) {
    if (!cardStr) return null;
    let rankStr = cardStr[0].toUpperCase();
    if (cardStr.startsWith('10')) rankStr = 'T'; // Handle "10d"

    // Find suit (last char usually)
    let suitStr = cardStr[cardStr.length - 1].toLowerCase();
    if (!['s', 'h', 'd', 'c'].includes(suitStr)) { // fallback
        suitStr = 's';
    }

    return {
        rank: rankStr,
        suit: suitStr,
        value: RANK_VALUES[rankStr] || 0
    };
}

/**
 * Main evaluation function.
 * @param {Array} heroCards - e.g. ['Ah', 'Kh']
 * @param {Array} boardCards - e.g. ['7h', '8h', '2c', 'Td']
 * @returns {Object} { category, strength, label, isDraw }
 */
export function evaluateHand(heroCards, boardCards) {
    if (!heroCards || heroCards.length < 2) return { category: 'Air', strength: 0, label: 'No Hand' };

    const hero = heroCards.map(parseCard).filter(Boolean);
    const board = (boardCards || []).map(parseCard).filter(Boolean);
    const allCards = [...hero, ...board];

    if (allCards.length < 5) {
        // Preflop
        if (hero[0].value === hero[1].value) return { category: 'Pocket Pair', strength: 2, label: 'Pocket Pair' };
        return { category: 'High Card', strength: 1, label: 'High Card' };
    }

    // Sort descending by value
    allCards.sort((a, b) => b.value - a.value);
    const boardSorted = [...board].sort((a, b) => b.value - a.value);

    // --- Frequency Analysis ---
    const rankCounts = {};
    const suitCounts = {};

    // Track board counts separately to distnguish board-pairs
    const boardRankCounts = {};

    allCards.forEach(c => {
        rankCounts[c.value] = (rankCounts[c.value] || 0) + 1;
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    boardSorted.forEach(c => {
        boardRankCounts[c.value] = (boardRankCounts[c.value] || 0) + 1;
    });

    // Determine Hero's hole card ranks
    const h1 = hero[0].value;
    const h2 = hero[1].value;

    // Highest board card
    const highestBoard = boardSorted[0]?.value || 0;
    const secondHighestBoard = boardSorted[1]?.value || 0;
    const lowestBoard = boardSorted[boardSorted.length - 1]?.value || 0;

    // --- Check Made Hands ---
    let isQuads = false, quadsVal = 0;
    let isTrip = false, tripVal = 0;
    let isPair = false, pairVals = [];

    for (const val in rankCounts) {
        if (rankCounts[val] === 4) { isQuads = true; quadsVal = parseInt(val); }
        if (rankCounts[val] === 3) { isTrip = true; tripVal = parseInt(val); }
        if (rankCounts[val] === 2) { isPair = true; pairVals.push(parseInt(val)); }
    }
    pairVals.sort((a, b) => b - a);

    // Flushes
    let isFlush = false;
    let maxSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    if (maxSuit) isFlush = true;

    // Straights
    let uniqueVals = [...new Set(allCards.map(c => c.value))].sort((a, b) => b - a);
    // Add ace as 1 for wheel
    if (uniqueVals.includes(14)) uniqueVals.push(1);

    let isStraight = false;
    let straightHigh = 0;
    let consec = 1;
    for (let i = 0; i < uniqueVals.length - 1; i++) {
        if (uniqueVals[i] - 1 === uniqueVals[i + 1]) {
            consec++;
            if (consec >= 5) {
                isStraight = true;
                straightHigh = uniqueVals[i + 2 - 5 + 1]; // First card of the 5
                break;
            }
        } else {
            consec = 1;
        }
    }

    // Straight Flush
    let isStraightFlush = false;
    if (isFlush && isStraight) {
        // Need 5 consecutive of SAME suit
        const flushCards = allCards.filter(c => c.suit === maxSuit).map(c => c.value);
        if (flushCards.includes(14)) flushCards.push(1);
        flushCards.sort((a, b) => b - a);
        let sfConsec = 1;
        for (let i = 0; i < flushCards.length - 1; i++) {
            if (flushCards[i] - 1 === flushCards[i + 1]) {
                sfConsec++;
                if (sfConsec >= 5) { isStraightFlush = true; break; }
            } else {
                sfConsec = 1;
            }
        }
    }

    // --- Classification Logic ---
    let category = 'Air';
    let strengthLevel = 0;

    if (isStraightFlush) { category = 'Straight Flush'; strengthLevel = 100; }
    else if (isQuads) { category = 'Quads'; strengthLevel = 90; }
    else if (isTrip && isPair) { category = 'Full House'; strengthLevel = 80; }
    else if (isFlush) { category = 'Flush'; strengthLevel = 70; }
    else if (isStraight) { category = 'Straight'; strengthLevel = 60; }
    else if (isTrip) {
        // Are the trips entirely on board?
        if (boardRankCounts[tripVal] === 3) {
            category = 'Board Trips'; strengthLevel = 45;
        } else {
            // Set (Pair in hand) vs Trips (One in hand)
            if (h1 === h2 && h1 === tripVal) {
                category = 'Set'; strengthLevel = 55;
            } else {
                category = 'Trips'; strengthLevel = 50;
            }
        }
    }
    else if (pairVals.length >= 2) {
        // Two Pair
        const topPair = pairVals[0];
        const secPair = pairVals[1];
        if (boardRankCounts[topPair] === 2 && boardRankCounts[secPair] === 2) {
            category = 'Board Two Pair'; strengthLevel = 25;
        } else if (h1 === topPair && h2 === secPair || h1 === secPair && h2 === topPair) {
            category = 'Two Pair'; strengthLevel = 40;
        } else {
            category = 'Two Pair'; strengthLevel = 35;
        }
    }
    else if (isPair) {
        const pairVal = pairVals[0];
        if (boardRankCounts[pairVal] === 2) {
            category = 'Air'; strengthLevel = 10; // Board pair, hero holds high cards
        } else if (h1 === h2) {
            // Pocket pair
            if (pairVal > highestBoard) { category = 'Overpair'; strengthLevel = 32; }
            else if (pairVal > secondHighestBoard) { category = 'Mid Pocket Pair'; strengthLevel = 22; }
            else { category = 'Low Pocket Pair'; strengthLevel = 15; }
        } else {
            // Paired with board
            if (pairVal === highestBoard) { category = 'Top Pair'; strengthLevel = 30; }
            else if (pairVal === secondHighestBoard) { category = 'Middle Pair'; strengthLevel = 20; }
            else { category = 'Bottom Pair'; strengthLevel = 18; }
        }
    } else {
        // Air (High Card)
        if (h1 > highestBoard && h2 > highestBoard) { category = 'Two Overcards'; strengthLevel = 12; }
        else if (h1 > highestBoard) { category = 'One Overcard'; strengthLevel = 8; }
        else { category = 'Air'; strengthLevel = 5; }
    }

    // --- Draw Analysis (If not absolute monster) ---
    let draws = [];
    if (strengthLevel < 60) {
        // Flush Draw
        let maxSuitCount = 0;
        let heroSuitCards = 0;
        for (const s in suitCounts) {
            if (suitCounts[s] === 4) {
                // Determine if hero actually contributes
                if (hero[0].suit === s) heroSuitCards++;
                if (hero[1].suit === s) heroSuitCards++;
                if (heroSuitCards > 0) draws.push('Flush Draw');
            }
            if (suitCounts[s] === 3 && boardCards.length === 3) {
                // Backdoor flush draw
                if (hero[0].suit === s) heroSuitCards++;
                if (hero[1].suit === s) heroSuitCards++;
                if (heroSuitCards === 2) draws.push('Bdfd');
            }
        }

        // Straight Draw check (4 in a row)
        let consec4 = 1;
        let isOesd = false;
        for (let i = 0; i < uniqueVals.length - 1; i++) {
            if (uniqueVals[i] - 1 === uniqueVals[i + 1]) {
                consec4++;
                if (consec4 >= 4) {
                    // Check if open-ended (both ends open)
                    // uniqueVals is desc, e.g. [9, 8, 7, 6]. Needs 10 or 5 to complete.
                    isOesd = true;
                    draws.push('OESD');
                    break;
                }
            } else {
                consec4 = 1;
            }
        }

        if (!isOesd) {
            // Gutshot check (4 cards spanning 5 ranks, e.g. 9, 8, 6, 5)
            for (let i = 0; i < uniqueVals.length - 3; i++) {
                if (uniqueVals[i] - uniqueVals[i + 3] === 4) {
                    draws.push('Gutshot');
                    break;
                }
            }
        }
    }

    // Combine category with draw
    let finalCategory = category;
    if (draws.includes('Flush Draw') && draws.includes('OESD')) {
        finalCategory = category !== 'Air' && strengthLevel < 60 ? `${category} + Combo Draw` : 'Combo Draw';
    } else if (draws.includes('Flush Draw')) {
        finalCategory = category !== 'Air' && strengthLevel < 60 ? `${category} + FD` : 'Flush Draw';
    } else if (draws.includes('OESD')) {
        finalCategory = category !== 'Air' && strengthLevel < 60 ? `${category} + OESD` : 'OESD';
    } else if (draws.includes('Gutshot')) {
        finalCategory = category !== 'Air' && strengthLevel < 60 ? `${category} + Gutshot` : 'Gutshot';
    }

    return {
        category: finalCategory,
        strength: strengthLevel,
        isMade: strengthLevel >= 18,
        draws
    };
}

/**
 * Expands a 13x13 hand notation (e.g. "AKs", "77", "JTo") into specific 2-card combos,
 * excluding any cards that are on the board, and evaluates each.
 * @param {string} notation - e.g. "AKs", "QQ", "T9o"
 * @param {Array} boardCards - e.g. ["7s", "8s", "2h"]
 * @returns {Array} Array of evaluation objects for each valid combo
 */
export function classifyHandGroup(notation, boardCards) {
    const board = (boardCards || []).map(parseCard).filter(Boolean);
    const boardStrs = board.map(c => `${c.rank}${c.suit}`);

    // Parse notation
    if (!notation || notation.length < 2) return [];

    let rank1 = notation[0].toUpperCase();
    let rank2 = notation[1].toUpperCase();
    let type = notation.length === 3 ? notation[2].toLowerCase() : (rank1 === rank2 ? 'pair' : 'o'); // fallback to offsuit

    // Normalization edge cases
    if (rank1 === '1') rank1 = 'T'; // in case '10' is used loosely
    if (rank2 === '0') rank2 = 'T';

    const suits = ['s', 'h', 'd', 'c'];
    const validCombos = [];

    if (type === 'pair' || rank1 === rank2) {
        // 6 combos: ss, hh, dd, cc, sh, sd, sc, hd, hc, dc -> Wait, pairs have different suits
        for (let i = 0; i < suits.length; i++) {
            for (let j = i + 1; j < suits.length; j++) {
                const c1 = `${rank1}${suits[i]}`;
                const c2 = `${rank2}${suits[j]}`;
                if (!boardStrs.includes(c1) && !boardStrs.includes(c2)) {
                    validCombos.push([c1, c2]);
                }
            }
        }
    } else if (type === 's') {
        // Suited: 4 combos
        for (const suit of suits) {
            const c1 = `${rank1}${suit}`;
            const c2 = `${rank2}${suit}`;
            if (!boardStrs.includes(c1) && !boardStrs.includes(c2)) {
                validCombos.push([c1, c2]);
            }
        }
    } else {
        // Offsuit: 12 combos
        for (const s1 of suits) {
            for (const s2 of suits) {
                if (s1 !== s2) {
                    const c1 = `${rank1}${s1}`;
                    const c2 = `${rank2}${s2}`;
                    if (!boardStrs.includes(c1) && !boardStrs.includes(c2)) {
                        validCombos.push([c1, c2]);
                    }
                }
            }
        }
    }

    // Evaluate all combos
    const evaluations = validCombos.map(combo => {
        const evalResult = evaluateHand(combo, boardCards);
        return {
            combo, // e.g. ["Ah", "Kh"]
            ...evalResult
        };
    });

    return evaluations;
}

/**
 * Summarizes the evaluation of a hand group into a dominant classification.
 * Useful for the RangeGrid coloring.
 */
export function summarizeHandGroup(notation, boardCards) {
    const evals = classifyHandGroup(notation, boardCards);
    if (evals.length === 0) return { category: 'Impossible', strength: 0 };

    const categoryCounts = {};
    let maxCount = 0;
    let dominantCategory = 'Air';
    let avgStrength = 0;

    evals.forEach(e => {
        // Normalize "Air" into "High Card" so it counts better? No, keep it as is.
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
        avgStrength += e.strength;
        if (categoryCounts[e.category] > maxCount) {
            maxCount = categoryCounts[e.category];
            dominantCategory = e.category;
        }
    });

    avgStrength /= evals.length;

    return {
        category: dominantCategory,
        strength: Math.round(avgStrength),
        comboCount: evals.length,
        distribution: categoryCounts
    };
}
