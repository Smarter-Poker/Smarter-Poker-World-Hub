/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * ICM CALCULATOR — Independent Chip Model for Tournament Spots
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Calculates ICM equity and ICM-adjusted decision making:
 *   - Stack-to-equity conversion using Malmuth-Harville model
 *   - ICM pressure factor (how much ICM matters at this stack depth)
 *   - Risk premium calculation (how much less you should gamble)
 *   - Bubble factor computation
 *   - Nash push/fold ranges adjusted for ICM
 *   - cEV vs $EV comparison
 *
 * Engine #22 — Pure local computation, no API calls.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● Malmuth-Harville ICM Model ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Calculate ICM equity for each player given stack sizes and payout structure.
 * Uses Malmuth-Harville probability model.
 *
 * @param {number[]} stacks - Array of stack sizes (chips)
 * @param {number[]} payouts - Array of payouts (e.g., [0.5, 0.3, 0.2])
 * @returns {number[]} ICM equity for each player (in same units as payouts)
 */
export function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const totalChips = stacks.reduce((a, b) => a + b, 0);
    if (totalChips === 0) return stacks.map(() => 0);

    const equities = new Array(n).fill(0);

    // Calculate probability of each player finishing in each position
    function calcPlaceProbs(playerIdx, remainingPlayers, depth) {
        if (depth >= payouts.length || remainingPlayers.length === 0) return;

        const totalRemaining = remainingPlayers.reduce((a, i) => a + stacks[i], 0);
        if (totalRemaining === 0) return;

        for (const p of remainingPlayers) {
            // Probability of player p finishing in this position
            const probFirst = stacks[p] / totalRemaining;

            if (depth < payouts.length) {
                equities[p] += probFirst * payouts[depth];
            }

            // Recursively calculate remaining positions
            if (depth + 1 < payouts.length) {
                const nextRemaining = remainingPlayers.filter(i => i !== p);
                if (nextRemaining.length > 0) {
                    calcPlaceProbs(p, nextRemaining, depth + 1);
                }
            }
        }
    }

    // Simplified for performance: use direct probability model for up to 9 players
    if (n <= 9) {
        const allPlayers = stacks.map((_, i) => i);

        for (let place = 0; place < Math.min(payouts.length, n); place++) {
            calculatePlaceProbabilities(stacks, allPlayers, payouts, equities, place, [], 1.0);
        }
    } else {
        // Fallback: proportional for large fields
        for (let i = 0; i < n; i++) {
            equities[i] = (stacks[i] / totalChips) * payouts.reduce((a, b) => a + b, 0);
        }
    }

    return equities;
}

/**
 * Recursive Malmuth-Harville place probability calculation.
 */
function calculatePlaceProbabilities(stacks, remaining, payouts, equities, targetPlace, eliminated, prob) {
    if (prob < 0.0001) return; // Prune tiny probabilities
    if (eliminated.length === targetPlace) {
        // Calculate probability of each remaining player winning this place
        const totalRemaining = remaining.reduce((a, i) => a + stacks[i], 0);
        if (totalRemaining === 0) return;

        for (const p of remaining) {
            const winProb = stacks[p] / totalRemaining;
            equities[p] += prob * winProb * payouts[targetPlace];
        }
        return;
    }

    if (remaining.length === 0) return;

    // Choose who was eliminated before this place
    const totalRemaining = remaining.reduce((a, i) => a + stacks[i], 0);
    if (totalRemaining === 0) return;

    for (const p of remaining) {
        const elimProb = stacks[p] / totalRemaining;
        const nextRemaining = remaining.filter(i => i !== p);
        calculatePlaceProbabilities(
            stacks, nextRemaining, payouts, equities,
            targetPlace, [...eliminated, p], prob * elimProb
        );
    }
}

// ●● ICM Pressure ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Calculate ICM pressure factor — how much ICM affects decisions.
 * Higher pressure = tighter play required.
 *
 * @param {number} heroStack - Hero's stack in BB
 * @param {number[]} allStacks - All stacks at table
 * @param {number[]} payouts - Payout structure
 * @param {number} playersLeft - Players remaining in tournament
 * @returns {{ pressure: number, riskPremium: number, bubbleFactor: number, description: string }}
 */
export function calculateICMPressure(heroStack, allStacks, payouts, playersLeft) {
    const totalChips = allStacks.reduce((a, b) => a + b, 0);
    const avgStack = totalChips / allStacks.length;
    const heroRatio = heroStack / avgStack;

    // Bubble proximity (how close to money)
    const paidSpots = payouts.length;
    const bubbleDistance = playersLeft - paidSpots;
    const onBubble = bubbleDistance <= 1 && bubbleDistance >= 0;
    const nearBubble = bubbleDistance <= 3;

    // ICM equity before and after a hypothetical all-in
    const heroIdx = allStacks.indexOf(heroStack);
    const currentEquity = calculateICM(allStacks, payouts);
    const heroCurrentEq = heroIdx >= 0 ? currentEquity[heroIdx] : 0;

    // If hero doubles up
    const doubledStacks = [...allStacks];
    const loserIdx = allStacks.findIndex((s, i) => i !== heroIdx && s > 0);
    if (heroIdx >= 0 && loserIdx >= 0) {
        doubledStacks[heroIdx] = heroStack * 2;
        doubledStacks[loserIdx] = Math.max(0, allStacks[loserIdx] - heroStack);
    }
    const doubledEquity = calculateICM(doubledStacks, payouts);
    const heroDoubledEq = heroIdx >= 0 ? doubledEquity[heroIdx] : 0;

    // If hero busts
    const gain = heroDoubledEq - heroCurrentEq;
    const loss = heroCurrentEq; // We lose our entire equity

    // Bubble factor: ratio of what we lose vs what we gain in an all-in
    const bubbleFactor = loss > 0 && gain > 0 ? loss / gain : 1.0;

    // Risk premium: how much extra equity we need to call
    const riskPremium = Math.max(0, (bubbleFactor - 1) / bubbleFactor);

    // Overall pressure (0 = chip EV, 1 = extreme ICM)
    let pressure = 0;
    if (onBubble) pressure = 0.85;
    else if (nearBubble) pressure = 0.6;
    else if (playersLeft <= paidSpots * 1.5) pressure = 0.4;
    else pressure = 0.15;

    // Adjust for stack size
    if (heroRatio < 0.5) pressure *= 1.3; // Short stacks feel more pressure
    if (heroRatio > 2.0) pressure *= 0.7; // Big stacks feel less

    pressure = Math.min(1.0, Math.max(0, pressure));

    let description;
    if (pressure >= 0.8) description = 'Extreme ICM pressure — play very tight, avoid marginal spots';
    else if (pressure >= 0.6) description = 'High ICM pressure — significant risk premium on all-ins';
    else if (pressure >= 0.35) description = 'Moderate ICM — some adjustments needed from chip EV';
    else if (pressure >= 0.15) description = 'Low ICM — play close to chip EV with minor adjustments';
    else description = 'Minimal ICM — chip EV decisions are fine';

    return { pressure, riskPremium, bubbleFactor, description, onBubble, nearBubble };
}

// ●● Push/Fold Ranges with ICM ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Standard push/fold hand values (approximate Nash equilibrium).
 * Higher = stronger hand. Range from 0 (weakest) to 100 (strongest).
 */
const PUSH_FOLD_VALUES = {
    'AA': 100, 'KK': 99, 'QQ': 98, 'AKs': 97, 'JJ': 96, 'AQs': 95,
    'KQs': 94, 'AJs': 93, 'AKo': 92, 'TT': 91, 'ATs': 90, 'AQo': 89,
    'KJs': 88, 'KTs': 87, '99': 86, 'QJs': 85, 'AJo': 84, 'A9s': 83,
    'QTs': 82, 'KQo': 81, 'A8s': 80, '88': 79, 'K9s': 78, 'JTs': 77,
    'ATo': 76, 'A7s': 75, 'Q9s': 74, 'KJo': 73, 'A5s': 72, 'A6s': 71,
    'A4s': 70, '77': 69, 'K8s': 68, 'J9s': 67, 'A3s': 66, 'KTo': 65,
    'QJo': 64, 'T9s': 63, 'A9o': 62, 'A2s': 61, 'K7s': 60, 'Q8s': 59,
    'K6s': 58, '66': 57, 'J8s': 56, 'A8o': 55, 'T8s': 54, 'QTo': 53,
    'K5s': 52, 'JTo': 51, 'A7o': 50, '98s': 49, 'K4s': 48, 'Q7s': 47,
    'K9o': 46, '55': 45, 'K3s': 44, 'A5o': 43, 'J7s': 42, 'A6o': 41,
    'Q9o': 40, 'K2s': 39, '87s': 38, 'A4o': 37, 'Q6s': 36, 'T7s': 35,
    'J9o': 34, '97s': 33, 'A3o': 32, '44': 31, 'Q5s': 30, 'J6s': 29,
    'T9o': 28, 'A2o': 27, 'K8o': 26, '76s': 25, 'Q4s': 24, '86s': 23,
    'J8o': 22, '33': 21, 'Q3s': 20, 'T6s': 19, 'Q2s': 18, '96s': 17,
    '65s': 16, 'K7o': 15, 'J5s': 14, '22': 13, 'T8o': 12, '75s': 11,
    '54s': 10, 'K6o': 9, 'J4s': 8, '85s': 7, 'Q8o': 6, '64s': 5,
    'T5s': 4, 'J3s': 3, '98o': 2, 'J2s': 1,
};

/**
 * Get ICM-adjusted push range for a given stack size and ICM pressure.
 *
 * @param {number} stackBB - Hero's stack in big blinds
 * @param {number} icmPressure - ICM pressure from calculateICMPressure (0-1)
 * @returns {{ range: Object<string, boolean>, handCount: number, percentage: number }}
 */
export function getICMPushRange(stackBB, icmPressure = 0) {
    // Base push threshold based on stack size (Nash equilibrium)
    let threshold;
    if (stackBB <= 5) threshold = 30; // Push very wide with <5BB
    else if (stackBB <= 8) threshold = 45;
    else if (stackBB <= 12) threshold = 55;
    else if (stackBB <= 15) threshold = 65;
    else if (stackBB <= 20) threshold = 75;
    else threshold = 85; // Only premiums with 20BB+

    // ICM tightens the range
    threshold += icmPressure * 15;
    threshold = Math.min(98, threshold);

    const range = {};
    let count = 0;
    Object.entries(PUSH_FOLD_VALUES || {}).forEach(([hand, value]) => {
        if (value >= threshold) {
            range[hand] = true;
            count++;
        }
    });

    return {
        range,
        handCount: count,
        percentage: (count / Object.keys(PUSH_FOLD_VALUES || {}).length * 100),
        threshold,
    };
}

/**
 * Get ICM-adjusted call range vs a shove.
 *
 * @param {number} stackBB - Hero's stack in BB
 * @param {number} villainStackBB - Villain's shove stack in BB
 * @param {number} icmPressure - ICM pressure (0-1)
 * @returns {{ range: Object<string, boolean>, handCount: number, percentage: number }}
 */
export function getICMCallRange(stackBB, villainStackBB, icmPressure = 0) {
    const effectiveStack = Math.min(stackBB, villainStackBB);
    const potOdds = effectiveStack / (effectiveStack + 1.5); // approx

    // Call ranges are tighter than push ranges
    let threshold;
    if (effectiveStack <= 5) threshold = 55;
    else if (effectiveStack <= 10) threshold = 65;
    else if (effectiveStack <= 15) threshold = 75;
    else threshold = 85;

    // ICM tightens calls even more than pushes
    threshold += icmPressure * 20;
    threshold = Math.min(99, threshold);

    const range = {};
    let count = 0;
    Object.entries(PUSH_FOLD_VALUES || {}).forEach(([hand, value]) => {
        if (value >= threshold) {
            range[hand] = true;
            count++;
        }
    });

    return {
        range,
        handCount: count,
        percentage: (count / Object.keys(PUSH_FOLD_VALUES || {}).length * 100),
        threshold,
    };
}

// ●● cEV vs $EV Comparison ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Compare chip EV vs dollar EV for a given decision.
 *
 * @param {Object} params
 * @param {number[]} currentStacks - Current stack distribution
 * @param {number[]} payouts - Payout structure
 * @param {number} heroIdx - Hero's index in stacks array
 * @param {number} potChips - Chips in the pot
 * @param {number} equity - Hero's hand equity (0-1) in the pot
 * @returns {{ cEV: number, dollarEV: number, icmTax: number, shouldCall: boolean }}
 */
export function compareCEVvsDollarEV(currentStacks, payouts, heroIdx, potChips, equity) {
    const currentICM = calculateICM(currentStacks, payouts);
    const heroCurrentICM = currentICM[heroIdx];

    // cEV of calling (simplified: potChips * equity - investment)
    const investment = potChips * (1 - equity); // approx chips hero has at risk
    const cEV = potChips * equity - investment;

    // $EV: calculate ICM after winning vs losing
    const winStacks = [...currentStacks];
    winStacks[heroIdx] += potChips;
    const winICM = calculateICM(winStacks, payouts);
    const heroWinICM = winICM[heroIdx];

    const loseStacks = [...currentStacks];
    loseStacks[heroIdx] = Math.max(0, loseStacks[heroIdx] - potChips);
    const loseICM = calculateICM(loseStacks, payouts);
    const heroLoseICM = loseICM[heroIdx];

    const dollarEV = equity * (heroWinICM - heroCurrentICM) + (1 - equity) * (heroLoseICM - heroCurrentICM);
    const icmTax = cEV > 0 && dollarEV < cEV ? ((cEV - dollarEV) / cEV) * 100 : 0;

    return {
        cEV: cEV,
        dollarEV,
        icmTax,
        shouldCall: dollarEV > 0,
    };
}

// ●● Standard Payout Structures ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const PAYOUT_STRUCTURES = {
    winner_take_all: (buyIn, players) => [buyIn * players],
    top_heavy: (buyIn, players) => {
        const pool = buyIn * players;
        return [pool * 0.5, pool * 0.3, pool * 0.2];
    },
    standard_mtt: (buyIn, players) => {
        const pool = buyIn * players;
        if (players <= 9) return [pool * 0.5, pool * 0.3, pool * 0.2];
        if (players <= 18) return [pool * 0.4, pool * 0.25, pool * 0.15, pool * 0.1, pool * 0.05, pool * 0.05];
        const paid = Math.max(3, Math.floor(players * 0.15));
        const payouts = [];
        let remaining = pool;
        for (let i = 0; i < paid; i++) {
            const share = remaining * 0.3;
            payouts.push(share);
            remaining -= share;
        }
        return payouts;
    },
    satellite: (buyIn, players, seats) => {
        const seatValue = (buyIn * players) / seats;
        return new Array(seats).fill(seatValue);
    },
};
