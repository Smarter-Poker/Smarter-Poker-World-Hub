/* ═══════════════════════════════════════════════════════════════════════════
   MONTE CARLO EQUITY ENGINE — Real-time hand vs range equity simulation
   Simulates thousands of runouts to calculate precise equity percentages
   ═══════════════════════════════════════════════════════════════════════════ */

// Card representation
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

interface Card {
    rank: number;  // 0-12 (2-A)
    suit: number;  // 0-3 (s,h,d,c)
}

interface HandResult {
    strength: number;
    handRank: number;  // 1-9 (high card to straight flush)
    kickers: number[];
}

// Convert card string like "Ah" to Card object
export function parseCard(cardStr: string): Card | null {
    if (!cardStr || cardStr.length !== 2) return null;
    const rank = RANKS.indexOf(cardStr[0].toUpperCase());
    const suit = SUITS.indexOf(cardStr[1].toLowerCase());
    if (rank === -1 || suit === -1) return null;
    return { rank, suit };
}

// Convert Card object to string
export function cardToString(card: Card): string {
    return RANKS[card.rank] + SUITS[card.suit];
}

// Create a full deck
function createDeck(): Card[] {
    const deck: Card[] = [];
    for (let suit = 0; suit < 4; suit++) {
        for (let rank = 0; rank < 13; rank++) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}

// Remove specific cards from deck
function removeCards(deck: Card[], cardsToRemove: Card[]): Card[] {
    return deck.filter(d =>
        !cardsToRemove.some(r => r.rank === d.rank && r.suit === d.suit)
    );
}

// Fisher-Yates shuffle
function shuffle(deck: Card[]): Card[] {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Evaluate 5-card hand strength
function evaluateHand(cards: Card[]): HandResult {
    if (cards.length < 5) {
        return { strength: 0, handRank: 0, kickers: [] };
    }

    // Get all 5-card combinations if more than 5 cards
    const combos = cards.length === 5
        ? [cards]
        : getCombinations(cards, 5);

    let bestResult: HandResult = { strength: 0, handRank: 0, kickers: [] };

    for (const combo of combos) {
        const result = evaluate5Cards(combo);
        if (result.strength > bestResult.strength) {
            bestResult = result;
        }
    }

    return bestResult;
}

// Get all n-combinations from array
function getCombinations<T>(arr: T[], n: number): T[][] {
    if (n === 0) return [[]];
    if (arr.length === 0) return [];

    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, n - 1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, n);

    return [...withFirst, ...withoutFirst];
}

// Evaluate exactly 5 cards
function evaluate5Cards(cards: Card[]): HandResult {
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);

    // Check flush
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight
    let isStraight = false;
    let straightHigh = 0;

    // Normal straight
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
        isStraight = true;
        straightHigh = ranks[0];
    }
    // Wheel (A2345)
    if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
        isStraight = true;
        straightHigh = 3; // 5-high straight
    }

    // Count rank frequencies
    const rankCounts: Map<number, number> = new Map();
    for (const r of ranks) {
        rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
    }
    const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);
    const uniqueRanks = Array.from(rankCounts.entries())
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .map(e => e[0]);

    // Hand ranking (higher is better)
    let handRank = 1;
    let strength = 0;
    let kickers = uniqueRanks;

    if (isFlush && isStraight) {
        handRank = 9; // Straight flush
        kickers = [straightHigh];
    } else if (counts[0] === 4) {
        handRank = 8; // Four of a kind
    } else if (counts[0] === 3 && counts[1] === 2) {
        handRank = 7; // Full house
    } else if (isFlush) {
        handRank = 6; // Flush
    } else if (isStraight) {
        handRank = 5; // Straight
        kickers = [straightHigh];
    } else if (counts[0] === 3) {
        handRank = 4; // Three of a kind
    } else if (counts[0] === 2 && counts[1] === 2) {
        handRank = 3; // Two pair
    } else if (counts[0] === 2) {
        handRank = 2; // One pair
    } else {
        handRank = 1; // High card
    }

    // Calculate strength (handRank * 10^10 + kickers weighted)
    strength = handRank * 1e10;
    for (let i = 0; i < kickers.length; i++) {
        strength += kickers[i] * Math.pow(13, 4 - i);
    }

    return { strength, handRank, kickers };
}

// Monte Carlo equity calculation
export interface EquityResult {
    equity: number;
    wins: number;
    ties: number;
    losses: number;
    iterations: number;
}

export function calculateEquity(
    heroCards: Card[],
    villainCards: Card[],
    board: Card[] = [],
    iterations: number = 10000
): EquityResult {
    let wins = 0;
    let ties = 0;
    let losses = 0;

    // Remove known cards from deck
    let deck = createDeck();
    deck = removeCards(deck, [...heroCards, ...villainCards, ...board]);

    const cardsNeeded = 5 - board.length;

    for (let i = 0; i < iterations; i++) {
        const shuffled = shuffle(deck);
        const runout = shuffled.slice(0, cardsNeeded);
        const fullBoard = [...board, ...runout];

        const heroHand = evaluateHand([...heroCards, ...fullBoard]);
        const villainHand = evaluateHand([...villainCards, ...fullBoard]);

        if (heroHand.strength > villainHand.strength) {
            wins++;
        } else if (heroHand.strength < villainHand.strength) {
            losses++;
        } else {
            ties++;
        }
    }

    return {
        equity: ((wins + ties / 2) / iterations) * 100,
        wins,
        ties,
        losses,
        iterations
    };
}

// Parse hand notation like "AhKs" into array of Cards
export function parseHand(handStr: string): Card[] | null {
    if (!handStr || handStr.length < 4) return null;

    const cards: Card[] = [];
    for (let i = 0; i < handStr.length; i += 2) {
        const card = parseCard(handStr.slice(i, i + 2));
        if (!card) return null;
        cards.push(card);
    }
    return cards;
}

// Parse board notation like "Ah Ks Qc" or "AhKsQc"
export function parseBoard(boardStr: string): Card[] | null {
    if (!boardStr) return [];

    // Remove spaces
    const cleaned = boardStr.replace(/\s+/g, '');

    const cards: Card[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
        const card = parseCard(cleaned.slice(i, i + 2));
        if (!card) return null;
        cards.push(card);
    }
    return cards;
}

// Get hand name for display
export function getHandName(result: HandResult): string {
    const names = [
        '', 'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
        'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
    ];
    return names[result.handRank] || 'Unknown';
}

// Calculate equity using simple hand notation (e.g., "AA" vs "KK")
export function quickEquityLookup(hero: string, villain: string): number | null {
    // Pre-calculated common matchups
    const matchups: Record<string, Record<string, number>> = {
        'AA': { 'KK': 82, 'QQ': 82, 'AKs': 87, 'AKo': 93, 'random': 85 },
        'KK': { 'AA': 18, 'QQ': 82, 'AKs': 70, 'AKo': 70, 'random': 83 },
        'QQ': { 'AA': 18, 'KK': 18, 'AKs': 54, 'AKo': 57, 'random': 80 },
        'JJ': { 'AA': 19, 'AKs': 54, 'TT': 82, 'random': 77 },
        'TT': { 'AA': 19, 'AKs': 54, 'JJ': 18, 'random': 75 },
        'AKs': { 'AA': 13, 'KK': 30, 'QQ': 46, '22': 48, 'random': 67 },
        'AKo': { 'AA': 7, 'KK': 30, 'QQ': 43, '22': 46, 'random': 65 }
    };

    return matchups[hero]?.[villain] ?? null;
}

export default {
    parseCard,
    parseHand,
    parseBoard,
    calculateEquity,
    quickEquityLookup,
    getHandName
};
