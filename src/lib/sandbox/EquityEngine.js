/**
 * EquityEngine — Client-Side Poker Equity Calculator
 * ═══════════════════════════════════════════════════════════════
 * Fast combinatorial equity estimation for hero hand vs villain range.
 * Runs entirely in the browser — no API call needed.
 */

// Card rank values
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

// Build a full 52-card deck
function buildDeck() {
    const deck = [];
    RANKS.forEach(r => SUITS.forEach(s => deck.push(`${r}${s}`)));
    return deck;
}

// Parse card string to { rank, suit, value }
function parseCard(card) {
    if (!card || card.length < 2) return null;
    return { rank: card[0], suit: card[1], value: RANK_VALUES[card[0]] || 0 };
}

// Evaluate 5-7 card hand strength (simplified — uses hand category + high cards)
// Returns a numeric score: higher = better hand
function evaluateHand(cards) {
    if (!cards || cards.length < 5) return 0;
    const parsed = cards.map(parseCard).filter(Boolean).sort((a, b) => b.value - a.value);
    if (parsed.length < 5) return 0;

    // Count ranks and suits
    const rankCounts = {};
    const suitCounts = {};
    parsed.forEach(c => {
        rankCounts[c.value] = (rankCounts[c.value] || 0) + 1;
        suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
    const isFlush = Object.values(suitCounts).some(c => c >= 5);

    // Check for straights (including ace-low)
    let isStraight = false;
    let straightHigh = 0;
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
        if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
            isStraight = true;
            straightHigh = uniqueRanks[i];
            break;
        }
    }
    // Ace-low straight (A-2-3-4-5)
    if (!isStraight && uniqueRanks.includes(14) && uniqueRanks.includes(2) && uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
        isStraight = true;
        straightHigh = 5;
    }

    // Hand rankings (score = category * 1000000 + kickers)
    const kicker = uniqueRanks[0] * 10000 + (uniqueRanks[1] || 0) * 100 + (uniqueRanks[2] || 0);

    if (isStraight && isFlush) return 8000000 + straightHigh;    // Straight flush
    if (counts[0] === 4) return 7000000 + kicker;                // Four of a kind
    if (counts[0] === 3 && counts[1] >= 2) return 6000000 + kicker; // Full house
    if (isFlush) return 5000000 + kicker;                        // Flush
    if (isStraight) return 4000000 + straightHigh;               // Straight
    if (counts[0] === 3) return 3000000 + kicker;                // Three of a kind
    if (counts[0] === 2 && counts[1] === 2) return 2000000 + kicker; // Two pair
    if (counts[0] === 2) return 1000000 + kicker;                // One pair
    return kicker;                                                // High card
}

/**
 * Calculate equity of hero hand vs a random villain hand on a given board.
 * Uses Monte Carlo sampling for speed.
 *
 * @param {string[]} heroCards - e.g. ['Ah', 'Kd']
 * @param {string[]} boardCards - e.g. ['Ts', '7h', '2c'] (0-5 cards)
 * @param {number} simulations - number of Monte Carlo iterations (default 2000)
 * @returns {{ heroEquity: number, villainEquity: number, ties: number, sampleSize: number }}
 */
export function calculateEquity(heroCards, boardCards = [], simulations = 2000) {
    if (!heroCards || heroCards.length < 2) return { heroEquity: 50, villainEquity: 50, ties: 0, sampleSize: 0 };

    const usedCards = new Set([...heroCards, ...boardCards]);
    const remainingDeck = buildDeck().filter(c => !usedCards.has(c));
    const cardsNeeded = 5 - boardCards.length; // Cards to complete the board

    let heroWins = 0, villainWins = 0, tieCount = 0;
    const actualSims = Math.min(simulations, 3000); // Cap for performance

    for (let i = 0; i < actualSims; i++) {
        // Shuffle remaining deck (Fisher-Yates partial shuffle)
        const deck = [...remainingDeck];
        for (let j = deck.length - 1; j > 0 && j > deck.length - cardsNeeded - 3; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [deck[j], deck[k]] = [deck[k], deck[j]];
        }

        // Deal: villain gets 2 cards, then complete the board
        const villainCards = [deck[deck.length - 1], deck[deck.length - 2]];
        const runout = [];
        for (let j = 0; j < cardsNeeded; j++) {
            runout.push(deck[deck.length - 3 - j]);
        }

        const fullBoard = [...boardCards, ...runout];
        const heroScore = evaluateHand([...heroCards, ...fullBoard]);
        const villainScore = evaluateHand([...villainCards, ...fullBoard]);

        if (heroScore > villainScore) heroWins++;
        else if (villainScore > heroScore) villainWins++;
        else tieCount++;
    }

    const total = heroWins + villainWins + tieCount;
    return {
        heroEquity: Math.round((heroWins + tieCount * 0.5) / total * 1000) / 10,
        villainEquity: Math.round((villainWins + tieCount * 0.5) / total * 1000) / 10,
        ties: Math.round(tieCount / total * 1000) / 10,
        sampleSize: total,
    };
}

/**
 * Get best/worst runout cards for hero hand on current board.
 * @param {string[]} heroCards
 * @param {string[]} boardCards - must have 3-4 cards
 * @param {number} trials - simulations per card
 * @returns {{ bestCards: string[], worstCards: string[], distribution: Object[] }}
 */
export function simulateRunouts(heroCards, boardCards, trials = 300) {
    if (!heroCards || heroCards.length < 2 || !boardCards || boardCards.length < 3) {
        return { bestCards: [], worstCards: [], distribution: [] };
    }

    const usedCards = new Set([...heroCards, ...boardCards]);
    const possibleCards = buildDeck().filter(c => !usedCards.has(c));

    const cardEquities = possibleCards.map(card => {
        const newBoard = [...boardCards, card];
        const eq = calculateEquity(heroCards, newBoard, trials);
        return { card, equity: eq.heroEquity };
    });

    cardEquities.sort((a, b) => b.equity - a.equity);

    return {
        bestCards: cardEquities.slice(0, 5).map(c => ({ card: c.card, equity: c.equity })),
        worstCards: cardEquities.slice(-5).reverse().map(c => ({ card: c.card, equity: c.equity })),
        improveRate: Math.round(cardEquities.filter(c => c.equity > 55).length / cardEquities.length * 100),
        worsenRate: Math.round(cardEquities.filter(c => c.equity < 45).length / cardEquities.length * 100),
        avgEquity: Math.round(cardEquities.reduce((s, c) => s + c.equity, 0) / cardEquities.length * 10) / 10,
        distribution: cardEquities,
    };
}
