function computeICM(stacks, prizes) {
    // More prizes than players inflates every equity — truncate to player count
    prizes = (prizes || []).slice(0, stacks.length);
    const n = stacks.length;
    const totalChips = stacks.reduce((sum, s) => sum + s, 0);

    if (totalChips === 0) return stacks.map(() => 0);
    if (n === 1) return [prizes[0] || 0];

    const equities = new Array(n).fill(0);

    // Recursive helper: calculate probability of each player finishing in each position
    function recurse(remainingIndices, prizeIndex, probability) {
        if (prizeIndex >= prizes.length || remainingIndices.length === 0) return;
        if (remainingIndices.length === 1) {
            // Last player gets remaining prize(s)
            const idx = remainingIndices[0];
            let remainingPrize = 0;
            for (let p = prizeIndex; p < prizes.length; p++) {
                remainingPrize += prizes[p];
            }
            equities[idx] += probability * remainingPrize;
            return;
        }

        const remainingChips = remainingIndices.reduce((sum, i) => sum + stacks[i], 0);
        if (remainingChips === 0) return;

        for (const idx of remainingIndices) {
            const playerProb = stacks[idx] / remainingChips;
            if (playerProb <= 0) continue;

            // This player finishes in current position
            equities[idx] += probability * playerProb * prizes[prizeIndex];

            // Recurse for remaining players in next position
            const newRemaining = remainingIndices.filter(i => i !== idx);
            recurse(newRemaining, prizeIndex + 1, probability * playerProb);
        }
    }

    const allIndices = Array.from({ length: n }, (_, i) => i);
    recurse(allIndices, 0, 1.0);

    return equities;
}

// Seat 1 against Seat 2, risking the effective stack. Busting wins the
// last remaining prize, if all players are already in the money.
function bubbleFactor(stacks, prizes, baseline) {
    const risk = Math.min(stacks[0], stacks[1]);
    const move = amount => {
        const next = stacks.slice();
        next[0] += amount;
        next[1] -= amount;
        return computeICM(next, prizes)[0];
    };
    const gain = move(risk) - baseline;
    return gain > 1e-9 ? Math.round(100 * (baseline - move(-risk)) / gain) / 100 : null;
}

export function tournamentEquity({ stacks = [], prizes = [], prizePool = 0 }) {
    if (!Array.isArray(stacks) || stacks.length < 2 || stacks.length > 9) throw new RangeError('Enter 2-9 stacks');
    const parsedStacks = stacks.map(Number);
    if (parsedStacks.some(s => !Number.isSafeInteger(s) || s <= 0)) throw new RangeError('Every remaining player needs a positive stack');
    if (!Array.isArray(prizes) || !prizes.length || prizes.length > stacks.length) throw new RangeError('Enter one prize per paid place');
    const values = prizes.map(Number);
    if (values.some((n, i) => !Number.isFinite(n) || n < 0 || (i && n > values[i-1]))) throw new RangeError('Enter descending nonnegative prizes');
    const pool = Number(prizePool);
    const sum = values.reduce((a,b) => a+b, 0);
    if (!Number.isFinite(pool) || pool < 0 || sum <= 0 || (pool && Math.abs(sum - 100) > 0.001)) throw new RangeError('Payout percentages must total 100% when using a prize pool');
    const totalChips = parsedStacks.reduce((a,b) => a+b, 0);
    const effectivePrizes = values.map(n => pool ? n * pool / 100 : n);
    const totalPrize = pool || sum;
    const icmEquities = computeICM(parsedStacks, effectivePrizes);
    const results = parsedStacks.map((chips, i) => {
        const chipPct = totalChips > 0 ? (chips / totalChips) * 100 : 0;
        const chipEV = totalPrize > 0 ? (chipPct / 100) * totalPrize : 0;
        const icmDollars = icmEquities[i] || 0;
        const icmPct = totalPrize > 0 ? (icmDollars / totalPrize) * 100 : 0;
        const difference = icmDollars - chipEV;

        return {
            player: i + 1,
            chips,
            chipPct: Math.round(chipPct * 10) / 10,
            chipEV: Math.round(chipEV * 100) / 100,
            icmDollars: Math.round(icmDollars * 100) / 100,
            icmPct: Math.round(icmPct * 10) / 10,
            difference: Math.round(difference * 100) / 100,
        };
    });
    return { success: true, results, totalChips, totalPrizePool: totalPrize, bubbleFactor: bubbleFactor(parsedStacks, effectivePrizes, icmEquities[0]) };
}
