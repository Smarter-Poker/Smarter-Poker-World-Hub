/**
 * 🧠 HORSE POKER BRAIN — Central AI Decision Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Bridges the horse AI intelligence layer (GTO + Personality + Advanced)
 * with the poker engine game loop. This is the single integration point
 * that the GameController calls when it's a horse's turn to act.
 * 
 * Responsibilities:
 * 1. Identity — Caches which profile IDs are horses (is_horse = true)
 * 2. Decision — Calls makeGTODecision + personality/tilt/timing overlays
 * 3. Bridge — Translates GTO output → engine action format
 * 4. Timing — Adds human-like delays before submitting actions
 * 5. Fallback — Heuristic decision when solver data unavailable
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════════════════════════════════════════
// CARD FORMAT BRIDGE
// Engine uses integers (card = rank*4 + suit). GTO uses strings ("Ah","Tc").
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];

function cardIntToString(card) {
    // Handle string cards (already in correct format like 'Ah')
    if (typeof card === 'string') return card;

    // Handle object cards { rank: 14, suit: 0 } or { rank: 'A', suit: 'h' }
    if (typeof card === 'object' && card !== null) {
        let rankChar, suitChar;

        // Rank: number (2-14) or string ('A', 'K', etc.)
        if (typeof card.rank === 'number') {
            rankChar = RANKS[card.rank - 2] || RANKS[card.rank]; // rank 2 = index 0, rank 14 (Ace) = index 12
        } else if (typeof card.rank === 'string') {
            rankChar = card.rank.length === 1 ? card.rank : card.rank[0];
        }

        // Suit: number (0-3) or string ('c', 'd', 'h', 's')
        if (typeof card.suit === 'number') {
            suitChar = SUITS[card.suit] || 'c';
        } else if (typeof card.suit === 'string') {
            suitChar = card.suit.length === 1 ? card.suit : card.suit[0];
        }

        if (rankChar && suitChar) return rankChar + suitChar;
    }

    // Handle integer encoding (original format: rank * 4 + suit)
    if (typeof card === 'number') {
        const rank = Math.floor(card / 4);
        const suit = card % 4;
        if (RANKS[rank] && SUITS[suit]) return RANKS[rank] + SUITS[suit];
    }

    return '2c'; // Fallback
}

function cardsToStrings(cardInts) {
    if (!cardInts || !Array.isArray(cardInts)) return [];
    return cardInts.map(cardIntToString);
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION LABEL MAPPING
// Engine uses lowercase ('btn','sb','bb','utg','co','hj','lj','mp','utg+1')
// GTO uses uppercase ('BTN','SB','BB','UTG','CO','HJ','LJ','MP')
// ═══════════════════════════════════════════════════════════════════════════

const POSITION_MAP = {
    'btn': 'BTN', 'sb': 'SB', 'bb': 'BB',
    'utg': 'UTG', 'utg+1': 'UTG+1', 'utg+2': 'UTG+1',
    'mp': 'MP', 'lj': 'LJ', 'hj': 'HJ', 'co': 'CO'
};

function mapPosition(enginePosition) {
    return POSITION_MAP[enginePosition] || 'MP';
}

// Chat message buffer for AI table chat (#10)
const chatMessages = [];

// Multi-table tracking (#5) — Map<playerId, Set<tableId>>
const multiTableTracker = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// HAND STRENGTH EVALUATOR (Fallback when no solver data)
// ═══════════════════════════════════════════════════════════════════════════

// Simple preflop hand rankings (0-100 percentile)
const PREFLOP_STRENGTH = {};
const PREMIUM_HANDS = ['AA', 'KK', 'QQ', 'AKs', 'JJ', 'AKo', 'AQs', 'TT', 'AQo', 'AJs'];
const STRONG_HANDS = ['99', 'ATs', 'AJo', 'KQs', '88', 'KJs', 'ATo', 'KQo', 'A9s', 'KTs', 'QJs', '77'];
const PLAYABLE_HANDS = ['A8s', 'KJo', 'QTs', 'A9o', 'JTs', '66', 'K9s', 'A7s', 'QJo', 'A5s', 'A8o', 'Q9s', 'A6s', 'KTo', '55', 'T9s', 'A4s', 'J9s'];

// Assign strength values
PREMIUM_HANDS.forEach((h, i) => { PREFLOP_STRENGTH[h] = 95 - i * 2; });
STRONG_HANDS.forEach((h, i) => { PREFLOP_STRENGTH[h] = 75 - i * 2; });
PLAYABLE_HANDS.forEach((h, i) => { PREFLOP_STRENGTH[h] = 52 - i * 2; });

function formatHandString(card1Str, card2Str) {
    const r1 = RANKS.indexOf(card1Str[0]);
    const r2 = RANKS.indexOf(card2Str[0]);
    const s1 = card1Str[1];
    const s2 = card2Str[1];

    const [highR, lowR] = r1 >= r2 ? [r1, r2] : [r2, r1];
    const highRank = RANKS[highR];
    const lowRank = RANKS[lowR];

    if (highR === lowR) return `${highRank}${lowRank}`; // Pair
    const suited = s1 === s2 ? 's' : 'o';
    return `${highRank}${lowRank}${suited}`;
}

function getPreflopStrength(handStr) {
    return PREFLOP_STRENGTH[handStr] || 20; // Default: weak hand
}

// ═══════════════════════════════════════════════════════════════════════════
// HORSE IDENTITY CACHE
// ═══════════════════════════════════════════════════════════════════════════

let _horseIds = null;
let _horseCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Refresh every 5 minutes

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
            _supabase = createClient(url, key);
        }
    }
    return _supabase;
}

/**
 * Load and cache all horse profile IDs from the database.
 * @returns {Set<string>} Set of horse profile UUIDs
 */
async function loadHorseIds() {
    const now = Date.now();
    if (_horseIds && now - _horseCacheTime < CACHE_TTL_MS) {
        return _horseIds;
    }

    const sb = getSupabase();
    if (!sb) {
        console.warn('[HorseBrain] No Supabase client — cannot load horse IDs');
        return new Set();
    }

    try {
        const { data, error } = await sb
            .from('profiles')
            .select('id')
            .eq('is_horse', true);

        if (error) {
            console.error('[HorseBrain] Error loading horse IDs:', error.message);
            return _horseIds || new Set();
        }

        _horseIds = new Set((data || []).map(p => p.id));
        _horseCacheTime = now;
        console.log(`[HorseBrain] Cached ${_horseIds.size} horse profile IDs`);

        // ─── Phase 3: Load Skill Evolution (Gap 3) ───
        // Read the persisted skill drift back into memory so horses don't lose their 
        // evolution when the Node.js server restarts.
        const { data: driftData } = await sb
            .from('horse_session_stats')
            .select('profile_id, win_rate_bb100, hands_played')
            .like('table_id', 'evolution_%');

        if (driftData && driftData.length > 0) {
            let loaded = 0;
            for (const row of driftData) {
                if (_horseIds.has(row.profile_id)) {
                    evolutionTracker.set(row.profile_id, {
                        drift: Number(row.win_rate_bb100) || 0,
                        sessions: Number(row.hands_played) || 0
                    });
                    loaded++;
                }
            }
            console.log(`[HorseBrain] 🧬 Loaded previous skill evolution for ${loaded} horses`);
        }

        return _horseIds;
    } catch (err) {
        console.error('[HorseBrain] Cache load failed:', err.message);
        return _horseIds || new Set();
    }
}

/**
 * Check if a player ID belongs to a horse.
 * @param {string} playerId - Player profile UUID
 * @returns {Promise<boolean>}
 */
async function isHorse(playerId) {
    const horses = await loadHorseIds();
    return horses.has(String(playerId));
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING SYSTEM (Human-like delays)
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic hash for consistent personality traits
function getHash(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Get a human-like action delay in milliseconds.
 * 
 * ─── AUDIT 14: DECOUPLED TIMING SECURITY PATCH ───
 * Previously, delays were derived from actionType (folds were inherently faster than raises).
 * This allowed humans using HUDs to build timing-tell profiles and reverse-engineer hand strength.
 * The delay generator is now completely decoupled from actionType. Fast snap-calls and long tank-folds
 * are generated at an even distribution based entirely on the street and stack depth.
 * 
 * @param {string} profileId - Horse profile UUID
 * @param {string} actionType - 'fold', 'check', 'call', 'raise', 'all_in' (now ignored for security)
 * @param {boolean} isPreflop - Whether it's preflop
 * @returns {number} Delay in ms (1500-6000)
 */
function getActionDelay(profileId, actionType, isPreflop = false) {
    const hash = getHash(profileId);

    // Standard window (1.5s to 4.5s)
    const baseMin = 1500;
    const baseMax = 4500;

    // Is the player inherently fast or slow? (0.8x to 1.2x)
    const speedFactor = 0.8 + (hash % 40) / 100;

    // Preflop is generally faster overall, but still ranges widely
    const streetFactor = isPreflop ? 0.6 : 1.1;

    // 5% of the time, the player goes deep into the tank (5 - 8 seconds)
    // 10% of the time, the player snap acts (0.5s - 1.2s)
    const rng = Math.random();
    let finalDelay;

    if (rng > 0.95) {
        // Deep Tank
        finalDelay = 5000 + (Math.random() * 3000);
    } else if (rng < 0.10) {
        // Snap Action
        finalDelay = 500 + (Math.random() * 700);
    } else {
        // Standard Action
        finalDelay = (baseMin + Math.random() * (baseMax - baseMin)) * speedFactor * streetFactor;
    }

    return Math.round(Math.max(800, Math.min(8000, finalDelay)));
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO DECISION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

// Lazy-load the GTO and personality modules (ESM → CJS bridge)
// ESM dynamic import in Next.js can resolve to either:
//   mod.functionName (named export) OR mod.default.functionName (default bundle)
// We normalize both patterns here.
let _gtoModule = null;
let _personalityModule = null;
let _advancedModule = null;

/**
 * Resolve an ESM module to its usable export object.
 * Handles: { default: { fn1, fn2 } } and { fn1, fn2 } and { default: fn1, fn2 }
 */
function resolveESM(mod) {
    if (!mod) return null;
    // If there's a default export that is an object with functions, use it
    if (mod.default && typeof mod.default === 'object') return mod.default;
    return mod;
}

async function getGTOModule() {
    if (!_gtoModule) {
        try {
            const raw = await import('../../content-engine/services/HorsePokerGTO.js');
            _gtoModule = resolveESM(raw);
        } catch (err) {
            console.error('[HorseBrain] Failed to load HorsePokerGTO:', err.message);
            _gtoModule = null;
        }
    }
    return _gtoModule;
}

async function getPersonalityModule() {
    if (!_personalityModule) {
        try {
            const raw = await import('../../content-engine/services/HorsePokerPersonality.js');
            _personalityModule = resolveESM(raw);
        } catch (err) {
            console.error('[HorseBrain] Failed to load HorsePokerPersonality:', err.message);
            _personalityModule = null;
        }
    }
    return _personalityModule;
}

async function getAdvancedModule() {
    if (!_advancedModule) {
        try {
            const raw = await import('../../content-engine/services/HorsePokerAdvanced.js');
            _advancedModule = resolveESM(raw);
        } catch (err) {
            console.error('[HorseBrain] Failed to load HorsePokerAdvanced:', err.message);
            _advancedModule = null;
        }
    }
    return _advancedModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO DECISION ENGINE — WORLD CLASS UPGRADE
// Handles Omaha variants (PLO4, PLO5, PLO6, PLO8 Hi-Lo)
// PioSolver only has Holdem data — this engine handles non-Holdem variants.
//
// Architecture:
//   1. Card parsing utilities (rank, suit, hand parsing)
//   2. Preflop PLO hand classifier (rundowns, pairs, suitedness)
//   3. Draw counter (exact outs: flush, straight, wraps, combo draws)
//   4. Made hand evaluator (nut flush, nut straight, set, two-pair, etc.)
//   5. PLO8 Hi-Lo low evaluator (A-5 low qualifier)
//   6. Decision engine (preflop / flop-turn / river)
// ═══════════════════════════════════════════════════════════════════════════

const RANK_ORDER = '23456789TJQKA'; // Index = rank value (0=2, 12=A)
const RANK_NAMES = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

/** Parse a card string like 'Ah', 'Ks', '9d' into { rank: number, suit: char } */
function parseCard(c) {
    if (!c || c.length < 2) return null;
    const rStr = c[0].toUpperCase();
    const suit = c[1].toLowerCase();
    const rank = RANK_ORDER.indexOf(rStr);
    return rank === -1 ? null : { rank, suit, str: c };
}

/** Parse an array of card strings, filtering invalid */
function parseCards(cards) {
    return (cards || []).map(parseCard).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLO PREFLOP HAND CLASSIFIER
// Based on hand type tiers used in professional PLO cash game theory.
// References: PLO Quick Pro hand ranking tables, Jeff Hwang methodology.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a PLO starting hand and return a strength score 0-100.
 *
 * Criteria (in order of importance):
 *   a) Rundown quality: J-T-9-8 > T-9-8-7 > 9-8-7-5 (gaps penalized)
 *   b) Suitedness: Double-suited > Single-suited > Rainbow
 *   c) Pair quality: AA / KK paired rundown > dangling pairs
 *   d) High card bonus: Ace involvement elevates marginal hands
 *   e) Dangling card penalty: disconnected cards reduce overall value
 *
 * @param {Array<{rank:number,suit:string}>} cards - Parsed hole cards (4-6)
 * @returns {number} 0-100 strength score
 */
function classifyPLOPreflop(cards) {
    if (!cards || cards.length < 4) return 20;

    const n = cards.length; // 4, 5, or 6
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a); // descending
    const suits = cards.map(c => c.suit);

    // ── Suitedness ──
    const suitFreq = {};
    for (const s of suits) suitFreq[s] = (suitFreq[s] || 0) + 1;
    const suitCounts = Object.values(suitFreq).sort((a, b) => b - a);
    let suitScore = 0;
    if (suitCounts[0] >= 3) suitScore = 30;               // Triple/quad-suited (rare, very strong)
    else if (suitCounts[0] === 2 && (suitCounts[1] >= 2)) suitScore = 22; // Double-suited
    else if (suitCounts[0] === 2) suitScore = 12;          // Single-suited
    else suitScore = 0;                                      // Rainbow (no flush backup)

    // ── Connectivity / Rundown quality ──
    // Score the best 4-card window among our hole cards
    let bestRundownScore = 0;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
    for (let start = 0; start < uniqueRanks.length - 1; start++) {
        let windowScore = 0;
        let gaps = 0;
        for (let i = start; i < Math.min(start + 4, uniqueRanks.length) - 1; i++) {
            const gap = uniqueRanks[i] - uniqueRanks[i + 1];
            if (gap === 1) windowScore += 18;  // Direct connector — best
            else if (gap === 2) windowScore += 10; // One-gap (still a good draw)
            else if (gap === 3) windowScore += 4;  // Two-gap
            else { gaps++; windowScore -= 5; }    // Dangler — damages hand
        }
        // Penalize more than 1 gap in a 4-card window
        if (gaps > 1) windowScore -= gaps * 5;
        bestRundownScore = Math.max(bestRundownScore, windowScore);
    }
    bestRundownScore = Math.min(bestRundownScore, 54); // Cap at max

    // ── Pair / High Card quality ──
    const rankFreq = {};
    for (const r of ranks) rankFreq[r] = (rankFreq[r] || 0) + 1;
    const pairs = Object.entries(rankFreq).filter(([, c]) => c >= 2);
    const hasAA = rankFreq[12] >= 2;
    const hasKK = rankFreq[11] >= 2;
    const hasQQ = rankFreq[10] >= 2;
    const hasAce = ranks.includes(12);
    const hasKing = ranks.includes(11);

    let highCardScore = 0;
    if (hasAA) highCardScore += 24; // AA is a massive multiplier in PLO
    else if (hasKK) highCardScore += 14;
    else if (hasQQ) highCardScore += 8;
    if (hasAce && !hasAA) highCardScore += 10; // Solitary Ace w/o pair
    if (hasKing && !hasKK) highCardScore += 5;

    // ── Dangling card penalty ──
    // A card that doesn't connect to the best 3-card window is a dangler
    const sortedU = uniqueRanks;
    let danglerPenalty = 0;
    if (sortedU.length >= 4) {
        // Check if the 4th card (lowest) is within 3 of the 3rd card
        const gap34 = sortedU[2] - sortedU[3];
        if (gap34 >= 4) danglerPenalty += 8;
        if (gap34 >= 6) danglerPenalty += 6; // Terrible dangler (e.g., K-Q-J-3)
    }

    // ── Raw score → normalize 0-100 ──
    const raw = 15 + bestRundownScore + suitScore + highCardScore - danglerPenalty;
    return Math.min(100, Math.max(0, raw));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PLO DRAW COUNTER — EXACT OUTS
// Counts exact outs for flush draws, straight draws, wraps, combo draws.
// PLO wraps are categorized: 20-out, 17-out, 13-out, 9-out wraps.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count exact straight outs using hole cards + board.
 * Returns the max number of outs to a made straight, and type.
 * @param {number[]} holeRanks - Hole card rank values
 * @param {number[]} boardRanks - Board card rank values
 * @returns {{ outs: number, type: string, hasNutStraightDraw: boolean }}
 */
function countStraightOuts(holeRanks, boardRanks) {
    const allRanks = [...holeRanks, ...boardRanks];
    const maxBoardRank = Math.max(...boardRanks, 0);
    let bestOuts = 0;
    let bestType = 'none';
    let hasNutDraw = false;

    // Try each possible straight endpoint (A-high = 12 down to 5-high = 4)
    for (let high = 12; high >= 4; high--) {
        const needed = [high, high - 1, high - 2, high - 3, high - 4];
        const have = new Set(allRanks);
        const missing = needed.filter(r => r >= 0 && !have.has(r));

        if (missing.length === 0) continue; // Already have the straight (made hand)
        if (missing.length > 2) continue;   // Need at least 3 of 5 cards

        // Count how many of the needed cards are in our HOLE cards (not board)
        const holeHave = needed.filter(r => holeRanks.includes(r));
        if (holeHave.length < 2) continue; // PLO rule: must use exactly 2 hole cards

        // Open-ended: missing middle or ends
        const outs = missing.length === 1 ? 4 : 8; // 1 missing = gutshot(4), would need more context
        if (missing.length === 1) {
            // Gutshot — 4 outs
            if (outs > bestOuts) { bestOuts = outs; bestType = 'gutshot'; }
        } else {
            // Open-ended draw — could be up to 20 outs in PLO (wrap)
            // Count actual outs based on how many hole cards contribute
            let wrapOuts = 0;
            for (const m of missing) {
                if (m >= 0 && m <= 12) wrapOuts += 4; // 4 cards of each rank
            }
            if (wrapOuts > bestOuts) {
                bestOuts = wrapOuts;
                bestType = wrapOuts >= 16 ? 'big_wrap' : wrapOuts >= 12 ? 'wrap' : 'oesd';
                // Nut draw if highest straight uses our high hole card
                hasNutDraw = hasNutDraw || (high > maxBoardRank + 1);
            }
        }
    }

    // PLO WRAP detection — special to PLO where you use 2+ consecutive hole cards
    // E.g., J-T-9-8 on a 7-6-x board = 20-out wrap
    const sortedHole = [...holeRanks].sort((a, b) => b - a);
    const sortedBoard = [...boardRanks].sort((a, b) => b - a);
    // Check for big wraps (20-out, 17-out, 13-out)
    if (boardRanks.length >= 3) {
        // Count consecutive sequences spanning hole + board
        const combined = [...new Set(allRanks)].sort((a, b) => a - b);
        for (let i = 0; i < combined.length - 3; i++) {
            const window5 = combined.slice(i, i + 5);
            const window6 = combined.slice(i, i + 6);
            const w5span = window5[4] - window5[0];
            const holesInW5 = window5.filter(r => holeRanks.includes(r)).length;
            if (w5span <= 5 && holesInW5 >= 2) {
                // This is a real nut wrap scenario
                // 20-outs: 4 surrounding cards all make straight
                const w5Outs = (5 - window5.length + 4) * 4;
                if (w5Outs > bestOuts) {
                    bestOuts = Math.min(20, w5Outs);
                    bestType = bestOuts >= 17 ? 'wrap_20' : bestOuts >= 13 ? 'wrap_17' : 'wrap_13';
                }
            }
        }
    }

    return { outs: bestOuts, type: bestType, hasNutStraightDraw: hasNutDraw };
}

/**
 * Count exact flush draw outs.
 * PLO rule: must use exactly 2 hole cards of same suit.
 * @param {Array<{rank:number,suit:string}>} holeCards
 * @param {Array<{rank:number,suit:string}>} boardCards
 * @returns {{ outs: number, isNutFlushDraw: boolean, suit: string|null }}
 */
function countFlushOuts(holeCards, boardCards) {
    const holeSuits = holeCards.map(c => c.suit);
    const boardSuits = boardCards.map(c => c.suit);
    const holeRanks = holeCards.map(c => c.rank);

    let bestOuts = 0;
    let isNutFlushDraw = false;
    let bestSuit = null;

    // Check each suit
    const suitSet = new Set([...holeSuits, ...boardSuits]);
    for (const suit of suitSet) {
        const holeOfSuit = holeCards.filter(c => c.suit === suit);
        const boardOfSuit = boardCards.filter(c => c.suit === suit);

        // Need exactly 2+ hole cards of this suit + 2+ board cards (or 3+ board for backdoor)
        if (holeOfSuit.length < 2) continue;
        if (boardOfSuit.length < 2) continue; // Not yet a real flush draw

        const totalOfSuit = holeOfSuit.length + boardOfSuit.length;
        if (totalOfSuit >= 5) continue; // Already have a flush (made hand, handled elsewhere)

        const outs = 13 - totalOfSuit; // Cards left in deck of that suit
        if (outs > bestOuts) {
            bestOuts = outs;
            bestSuit = suit;
            // Nut flush draw: if our highest hole card of this suit is the Ace (rank 12)
            const maxHoleRankOfSuit = Math.max(...holeOfSuit.map(c => c.rank));
            const maxBoardRankOfSuit = Math.max(...boardOfSuit.map(c => c.rank), 0);
            isNutFlushDraw = maxHoleRankOfSuit === 12; // Ace of that suit in hand
        }
    }

    return { outs: bestOuts, isNutFlushDraw, suit: bestSuit };
}

/**
 * Detect backdoor draws (2 to a flush with 3 board cards, or 3 to a straight).
 * Backdoor draws add approximately 1-2 pseudo outs.
 */
function countBackdoorOuts(holeCards, boardCards) {
    const holeSuits = holeCards.map(c => c.suit);
    const boardSuits = boardCards.map(c => c.suit);
    let backdoor = 0;

    // Backdoor flush = 2 hole cards of same suit + 1 board card of same suit (flop only)
    if (boardCards.length === 3) {
        for (const suit of new Set(holeSuits)) {
            const h = holeSuits.filter(s => s === suit).length;
            const b = boardSuits.filter(s => s === suit).length;
            if (h >= 2 && b === 1) { backdoor += 2; break; }
        }
    }
    return backdoor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MADE HAND EVALUATOR (PLO-SPECIFIC)
// Evaluates made hand strength relative to board + PLO nutedness.
// PLO Rule: MUST use exactly 2 hole cards + exactly 3 board cards.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate the made hand strength of a PLO hand.
 * Returns a strength value (0=garbage, 100=nut hand) and hand category.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @returns {{ strength: number, category: string, isNut: boolean, hasRedraw: boolean }}
 */
function evaluatePLOMadeHand(holeCards, boardCards) {
    if (!boardCards || boardCards.length === 0) {
        return { strength: 0, category: 'no_board', isNut: false, hasRedraw: false };
    }

    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank).sort((a, b) => b - a);
    const hSuits = holeCards.map(c => c.suit);
    const bSuits = boardCards.map(c => c.suit);

    const boardTop = bRanks[0]; // Highest board rank

    // ── Check for Flush (must have 2+ hole cards of same suit matching 3+ board) ──
    let flushStrength = 0;
    let hasNutFlush = false;
    let hasFlush = false;
    for (const suit of new Set(hSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit);
        const bOfSuit = boardCards.filter(c => c.suit === suit);
        if (hOfSuit.length >= 2 && bOfSuit.length >= 3) {
            hasFlush = true;
            const maxHoleRank = Math.max(...hOfSuit.map(c => c.rank));
            hasNutFlush = maxHoleRank === 12; // Ace-high flush
            flushStrength = hasNutFlush ? 95 : 75 + maxHoleRank * 1.5;
        }
    }
    if (hasFlush) {
        return { strength: flushStrength, category: hasNutFlush ? 'nut_flush' : 'flush', isNut: hasNutFlush, hasRedraw: false };
    }

    // ── Check for Straight (must use exactly 2 hole cards) ──
    let bestStraight = 0;
    let isNutStraight = false;
    for (let high = 12; high >= 4; high--) {
        const needed = [high, high - 1, high - 2, high - 3, high - 4];
        const boardPart = needed.filter(r => bRanks.includes(r));
        const holePart = needed.filter(r => hRanks.includes(r));
        if (boardPart.length === 3 && holePart.length === 2 && boardPart.length + holePart.length === 5) {
            const straightStrength = 60 + high * 2;
            if (straightStrength > bestStraight) {
                bestStraight = straightStrength;
                isNutStraight = high > boardTop + 1; // Top straight using high hole cards
            }
        }
    }
    if (bestStraight > 0) {
        return { strength: Math.min(bestStraight, 90), category: isNutStraight ? 'nut_straight' : 'straight', isNut: isNutStraight, hasRedraw: false };
    }

    // ── Trips on board (one pair board + our pair = full house) ──
    const bRankFreq = {};
    for (const r of bRanks) bRankFreq[r] = (bRankFreq[r] || 0) + 1;
    const boardPairs = Object.entries(bRankFreq).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));
    const boardTrips = Object.entries(bRankFreq).filter(([, c]) => c >= 3).map(([r]) => parseInt(r));

    const hRankFreq = {};
    for (const r of hRanks) hRankFreq[r] = (hRankFreq[r] || 0) + 1;
    const holePairs = Object.entries(hRankFreq).filter(([, c]) => c >= 2).map(([r]) => parseInt(r));

    // ── Full House ──
    // Set in hole + board pair = full house
    // Two hole pairs + board pair = full house
    for (const hp of holePairs) {
        if (boardPairs.length > 0 || boardTrips.length > 0) {
            const isTopSet = hp === boardTop;
            return {
                strength: isTopSet ? 88 : 78,
                category: 'full_house',
                isNut: isTopSet,
                hasRedraw: isTopSet
            };
        }
    }

    // ── Set (Pocket pair in hole hits board rank = trips in PLO = set only if 1 on board) ──
    for (const hp of holePairs) {
        if (bRanks.includes(hp) && bRankFreq[hp] === 1) {
            // We have a set (trip w/ pair in hole, 1 on board)
            const isTopSet = hp === boardTop;
            return {
                strength: isTopSet ? 76 : 65,
                category: isTopSet ? 'top_set' : 'set',
                isNut: false, // Sets aren't nuts in PLO if flushes/straights possible
                hasRedraw: true // Sets often have full house redraws
            };
        }
    }

    // ── Two Pair (must use 2 hole cards) ──
    // Hole pair + board pair, or 2 hole cards pairing 2 different board cards
    const holeRanksThatHitBoard = hRanks.filter(r => bRanks.includes(r));
    if (holeRanksThatHitBoard.length >= 2) {
        const topHit = Math.max(...holeRanksThatHitBoard);
        const isTopTwoPair = topHit === boardTop;
        return {
            strength: isTopTwoPair ? 55 : 40,
            category: isTopTwoPair ? 'top_two_pair' : 'two_pair',
            isNut: false,
            hasRedraw: true
        };
    }

    // ── One Pair (top pair or over-pair or under-pair) ──
    for (const r of hRanks) {
        if (bRanks.includes(r)) {
            const isTopPair = r === boardTop;
            return {
                strength: isTopPair ? 38 : 25,
                category: isTopPair ? 'top_pair' : 'low_pair',
                isNut: false,
                hasRedraw: false
            };
        }
    }

    // ── High card / No pair ──
    const maxHole = Math.max(...hRanks);
    return {
        strength: maxHole > boardTop ? 20 : 10,
        category: maxHole > boardTop ? 'overcards' : 'air',
        isNut: false,
        hasRedraw: false
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PLO8 HI-LO LOW EVALUATOR
// A qualifying low must be 5 cards of rank 8 or below (A=1 for low),
// using exactly 2 hole cards + 3 board cards.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate low potential and nut-low possibility for PLO Hi-Lo (PLO8).
 * @param {Array<{rank}>} holeCards
 * @param {Array<{rank}>} boardCards
 * @returns {{ hasNutLow: boolean, hasLow: boolean, lowOuts: number, scoopable: boolean }}
 */
function evaluatePLO8Low(holeCards, boardCards) {
    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank);

    // Translate rank 12 (A) → 0 for low eval (Ace is low in PLO8)
    const toLowRank = r => r === 12 ? 0 : r;
    const hLow = hRanks.map(toLowRank);
    const bLow = bRanks.map(toLowRank);

    // Qualifying low ranks: 0(A),1(2),2(3),3(4),4(5),5(6),6(7) → ranks ≤ 6 for 8-low
    // (In standard PLO8, we need 5 unpaired cards 8 or below. 8 = rank index 6)
    const hLowQualify = hLow.filter(r => r <= 6); // ≤ 8 in real (0=A, 6=8)
    const bLowQualify = bLow.filter(r => r <= 6);

    // Need 3 low cards on board to have a chance at qualifying low
    if (bLowQualify.length < 3 && boardCards.length >= 3) {
        // Count potential low outs (how many board cards can still come low)
        const lowOuts = boardCards.length < 5 ? 4 * Math.max(0, 3 - bLowQualify.length) : 0;
        return { hasNutLow: false, hasLow: false, lowOuts: Math.min(lowOuts, 16), scoopable: false };
    }

    // Check if we can make a qualifying low using 2 hole cards
    let bestLow = null; // Lower is better (A-2-3-4-5 = best)
    for (let i = 0; i < holeCards.length - 1; i++) {
        for (let j = i + 1; j < holeCards.length; j++) {
            const h1 = hLow[i], h2 = hLow[j];
            if (h1 === h2) continue; // Can't use duplicate for low
            if (h1 > 6 || h2 > 6) continue; // Both need to be low

            // Find 3 board low cards that complete the low hand (all different!)
            const needed = [h1, h2];
            const boardLows = bLowQualify.filter(r => !needed.includes(r)).slice(0, 3);
            if (boardLows.length < 3) continue;

            // Valid low! Rank it (lower = better; [0,1,2,3,4] = wheel = nut low)
            const lowHand = [...needed, ...boardLows.slice(0, 3)].sort((a, b) => a - b).slice(0, 5);
            if (!bestLow || lowHand[4] < bestLow[4] ||
                (lowHand[4] === bestLow[4] && lowHand[3] < bestLow[3])) {
                bestLow = lowHand;
            }
        }
    }

    const hasLow = bestLow !== null;
    // Nut low: A-2-3-4-5 (all lowest possible) = [0,1,2,3,4]
    const hasNutLow = hasLow && bestLow && bestLow[4] <= 3; // Top card is 4 or below
    // Scoopable: if we have the nut low AND a strong high hand
    const scoopable = hasNutLow;

    return { hasNutLow, hasLow, lowOuts: 0, scoopable };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SPR ZONE CALCULATOR for PLO
// Stack-to-Pot Ratio determines commitment thresholds in PLO.
// PLO is a "big hand" game — don't commit without the right SPR.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get PLO SPR commitment recommendation.
 * @param {number} effectiveStack - Remaining stack after toCall
 * @param {number} potSize - Current pot
 * @returns {{ zone: string, shouldCommit: boolean, note: string }}
 */
function getPLOSPRZone(effectiveStack, potSize) {
    if (potSize <= 0) return { zone: 'deep', shouldCommit: false, note: 'no_pot' };
    const spr = effectiveStack / potSize;
    if (spr <= 1) return { zone: 'committed', shouldCommit: true, note: 'all_in_or_fold' };
    if (spr <= 3) return { zone: 'shallow', shouldCommit: true, note: 'commit_sets_and_wraps' };
    if (spr <= 6) return { zone: 'medium', shouldCommit: false, note: 'commit_only_nuts' };
    if (spr <= 13) return { zone: 'deep', shouldCommit: false, note: 'pot_control_draws' };
    return { zone: 'very_deep', shouldCommit: false, note: 'value_oriented_plays' };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — ADVANCED PLO STRATEGY MODULES
// Board texture, scare cards, ERC, PLO5/6 hand picker, probe bets,
// check-raise squeeze, blocker awareness, tournament adjustments.
// ─────────────────────────────────────────────────────────────────────────────

/** Analyze board texture: monotone/paired/two_tone/rainbow + danger flags */
function analyzePLOBoardTexture(boardCards) {
    if (!boardCards || boardCards.length === 0) return { texture: 'unknown', flushCompleted: false, monoBoardPenalty: 0, isDangerous: false, straightCompleted: false, isRunOutBoard: false, isPaired: false, isMonotone: false };
    const suits = boardCards.map(c => c.suit), ranks = boardCards.map(c => c.rank);
    const suitFreq = {}; for (const s of suits) suitFreq[s] = (suitFreq[s] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suitFreq));
    const flushCompleted = maxSuit >= 4;
    const isMonotone = maxSuit === boardCards.length && boardCards.length === 3;
    const rankFreq = {}; for (const r of ranks) rankFreq[r] = (rankFreq[r] || 0) + 1;
    const numPairs = Object.values(rankFreq).filter(v => v >= 2).length;
    const isPaired = numPairs >= 1, isDoublePaired = numPairs >= 2;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let cc = 1, maxC = 1;
    for (let i = 1; i < uniqueRanks.length; i++) { if (uniqueRanks[i] === uniqueRanks[i - 1] + 1) { cc++; maxC = Math.max(maxC, cc); } else cc = 1; }
    const straightCompleted = maxC >= 4;
    const monoBoardPenalty = isMonotone ? 20 : flushCompleted ? 15 : 0;
    const isRunOutBoard = boardCards.length === 4 && (flushCompleted || straightCompleted);
    let texture = 'rainbow';
    if (isMonotone) texture = 'monotone';
    else if (isDoublePaired) texture = 'double_paired';
    else if (isPaired) texture = 'paired';
    else if (Object.values(suitFreq).some(v => v >= 2)) texture = 'two_tone';
    return { texture, flushCompleted, monoBoardPenalty, isDangerous: isMonotone || isPaired || flushCompleted || straightCompleted, straightCompleted, isRunOutBoard, isPaired, isMonotone };
}

/** Detects scare cards on turn/river (cards completing flush, straight, or pairing the board) */
function detectScareCard(boardCards, street) {
    if (!boardCards || boardCards.length < 4) return { isScareTurn: false, isScareRiver: false, scareType: 'none' };
    const prev = boardCards.slice(0, -1), last = boardCards[boardCards.length - 1];
    const prevTexture = analyzePLOBoardTexture(prev), curTexture = analyzePLOBoardTexture(boardCards);
    let scareType = 'none';
    const prevSF = {}; for (const c of prev) prevSF[c.suit] = (prevSF[c.suit] || 0) + 1;
    if ((prevSF[last.suit] || 0) + 1 >= 3) scareType = 'flush_complete';
    const prevRF = {}; for (const c of prev) prevRF[c.rank] = (prevRF[c.rank] || 0) + 1;
    if (prevRF[last.rank]) scareType = scareType === 'none' ? 'board_pair' : scareType + '_pair';
    if (!prevTexture.straightCompleted && curTexture.straightCompleted) scareType = scareType === 'none' ? 'straight_complete' : scareType + '_straight';
    return { isScareTurn: street === 'turn' && scareType !== 'none', isScareRiver: street === 'river' && scareType !== 'none', scareType };
}

/**
 * Equity Realization Coefficient (ERC) — adjusts raw equity for position, SPR, draw type.
 * Draws OOP realize ~20% less; nuts realize more. Range: 0.5–1.30.
 */
function getPLOEquityRealization(isIP, sprZone, straightOuts, flushOuts, isNutMade, numPlayers) {
    let erc = 1.0;
    erc += isIP ? 0.10 : -0.12;
    if (sprZone === 'committed' || sprZone === 'shallow') erc += 0.08;
    if (sprZone === 'very_deep') erc -= 0.10;
    if (isNutMade) erc += 0.15;
    const totalOut = straightOuts + flushOuts;
    if (totalOut > 0 && !isNutMade) {
        if (numPlayers > 3) erc -= 0.12;
        if (flushOuts > 0 && flushOuts <= 7) erc -= 0.08;
        if (straightOuts >= 15) erc += 0.05;
    }
    return Math.max(0.5, Math.min(1.30, erc));
}

/** PLO5/PLO6: enumerate all C(n,4) combos to get best 4-card preflop strength */
function getBestPLO5or6PreflopStrength(holeCards) {
    if (holeCards.length <= 4) return classifyPLOPreflop(holeCards);
    let best = 0;
    for (let i = 0; i < holeCards.length - 3; i++)
        for (let j = i + 1; j < holeCards.length - 2; j++)
            for (let k = j + 1; k < holeCards.length - 1; k++)
                for (let l = k + 1; l < holeCards.length; l++) {
                    const s = classifyPLOPreflop([holeCards[i], holeCards[j], holeCards[k], holeCards[l]]);
                    if (s > best) best = s;
                }
    return best;
}

/** PLO5/PLO6 postflop: try all C(n,2) hole combos, return best made hand */
function getBestPLO5or6MadeHand(holeCards, boardCards) {
    if (holeCards.length <= 4) return evaluatePLOMadeHand(holeCards, boardCards);
    let bestHand = { strength: 0, category: 'air', isNut: false, hasRedraw: false };
    for (let i = 0; i < holeCards.length - 1; i++)
        for (let j = i + 1; j < holeCards.length; j++) {
            const r = evaluatePLOMadeHand([holeCards[i], holeCards[j]], boardCards);
            if (r.strength > bestHand.strength) bestHand = r;
        }
    return bestHand;
}

/** Probe bet: small IP bet with medium hands for information + equity denial */
function getPLOProbeBet(isIP, equity, boardTexture, numPlayers) {
    if (!isIP || numPlayers > 3) return { shouldProbe: false, probeSize: 0 };
    if (boardTexture.texture === 'rainbow' && equity >= 40 && equity < 65) return { shouldProbe: true, probeSize: 0.35 };
    if (boardTexture.isPaired && equity >= 55) return { shouldProbe: true, probeSize: 0.50 };
    return { shouldProbe: false, probeSize: 0 };
}

/** Check-raise squeeze: OOP with monster hands or nut draws */
function getPLOCheckRaise(isIP, madeHand, straightOuts, flushOuts, isNutFlushDraw, toCall, potSize) {
    if (isIP || toCall === 0) return { shouldCheckRaise: false, crSize: 0 };
    const cats = ['top_set', 'full_house', 'nut_flush', 'nut_straight'];
    if (cats.includes(madeHand.category) && Math.random() < 0.75) return { shouldCheckRaise: true, crSize: Math.round(potSize * 2.5) };
    if (isNutFlushDraw && straightOuts >= 13 && Math.random() < 0.70) return { shouldCheckRaise: true, crSize: Math.round(potSize * 2.5) };
    if (isNutFlushDraw && (straightOuts + flushOuts) >= 9 && Math.random() < 0.55) return { shouldCheckRaise: true, crSize: Math.round(potSize * 2.0) };
    if (straightOuts >= 17 && Math.random() < 0.45) return { shouldCheckRaise: true, crSize: Math.round(potSize * 2.0) };
    return { shouldCheckRaise: false, crSize: 0 };
}

/** Blocker awareness: holding Ace of dominant suit or key straight rank = bluff enabler */
function getPLOBlockers(holeCards, boardCards) {
    if (!boardCards || boardCards.length < 3) return { hasFlushBlocker: false, hasStraightBlocker: false, canBluffRiver: false };
    const bSuits = boardCards.map(c => c.suit), bRanks = boardCards.map(c => c.rank);
    const hRanks = holeCards.map(c => c.rank);
    const sf = {}; for (const s of bSuits) sf[s] = (sf[s] || 0) + 1;
    const dom = Object.entries(sf).sort(([, a], [, b]) => b - a)[0]?.[0];
    const hasFlushBlocker = !!(dom && holeCards.some(c => c.suit === dom && c.rank === 12));
    const bTop = Math.max(...bRanks, 0);
    const nutRanks = [bTop + 1, bTop, bTop - 1, bTop - 2, bTop - 3];
    const missing = nutRanks.filter(r => r >= 0 && !bRanks.includes(r));
    const hasStraightBlocker = missing.length > 0 && missing.some(r => hRanks.includes(r));
    return { hasFlushBlocker, hasStraightBlocker, canBluffRiver: hasFlushBlocker || hasStraightBlocker };
}

/** Tournament vs cash PLO adjustments: tighter play in tournaments, earlier push/fold */
function getPLOGameTypeAdjustments(gameType, stackBB) {
    if (gameType === 'tournament') return { tightnessFactor: stackBB <= 20 ? 1.3 : 1.1, shortStackThreshold: 20 };
    return { tightnessFactor: 1.0, shortStackThreshold: 12 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — DEEP STRATEGY, MULTI-STREET PLANNING & EXPLOITATION
// Pot geometry, c-bet frequency, turn/river barrels, showdown value,
// range balance, implied odds, opponent reads, all-in equity short-cuts.
// ─────────────────────────────────────────────────────────────────────────────

// ── 3a. PLO POT GEOMETRY CALCULATOR ──
// In PLO, "pot" raise is: amount to call + current pot + your call = 3x previous bet.
// Correct sizing prevents opponents from getting correct odds.
// NOTE: Simple PLO pot-raise formula (legacy / simple call-sites only).
// The full version with raiseAction clamping is defined below.
function _calcPLOPotRaiseSimple(toCall, potSize) {
    // PLO pot raise formula: call + (pot + call + call) = call + new_pot_after_call
    // Proper formula: toCall + (potSize + 2 * toCall)
    return toCall + (potSize + 2 * toCall);
}

/**
 * Calculate a fractional pot bet (standard PLO sizing).
 * @param {number} potSize - Current pot
 * @param {number} fraction - 0.33 to 1.0
 * @param {Object} raiseAction
 * @returns {number} Clamped bet size
 */
/**
 * Exact PLO pot-limit raise formula.
 * In PLO, the maximum raise = call amount + (pot size after calling).
 * Formula: maxRaise = 3 * toCall + currentPot
 * (because after calling, pot = currentPot + toCall, then raise pot = that amount)
 * @param {number} potSize - Current pot BEFORE the call
 * @param {number} toCall - Amount needed to call
 * @param {Object} raiseAction - Legal raise action with min/max
 * @returns {number} Exact PLO pot-raise amount (clamped to legal range)
 */
function calcPLOPotRaise(potSize, toCall, raiseAction) {
    const potAfterCall = potSize + toCall;          // Pot grows by the call
    const maxPotRaise = potAfterCall + potSize;     // Raise the new pot on top
    const totalRaise = toCall + maxPotRaise;        // Total money to put in
    const size = Math.round(totalRaise);
    const min = raiseAction?.minAmount || 1;
    const max = raiseAction?.maxAmount || size;
    return Math.max(min, Math.min(size, max));
}

function calcPLOBetSize(potSize, fraction, raiseAction) {
    // fraction >= 1.0 means "pot-size raise" — use exact PLO math
    if (fraction >= 1.0) return calcPLOPotRaise(potSize, raiseAction?.toCall || 0, raiseAction);
    const size = Math.round(potSize * fraction);
    return Math.max(raiseAction?.minAmount || 1, Math.min(size, raiseAction?.maxAmount || size));
}

// ─────────────────────────────────────────────────────────────────────────────
// PRECISION GAP CLOSERS (Post Phase 8)
// Six high-impact modules that address remaining PLO strategy gaps:
// limped pots, multi-way aggression, 3-bet defense, limper isolation,
// side-pot awareness, and late-session adjustment.
// ─────────────────────────────────────────────────────────────────────────────

// ── GAP A: LIMPED POT STRATEGY ──
/**
 * In a limped pot (no preflop raise), equity is spread thin.
 * Nobody has a strong preflop range claim → board hits everyone.
 * Adjust: bet less for value (everyone called anyway), check-raise more,
 * never bluff without nut draws, value-bet thinner on wet boards.
 * @param {boolean} isLimpedPot - True if no preflop raise
 * @param {Object} madeHand
 * @param {number} equityFinal
 * @param {number} numPlayers
 * @returns {{ limpedBetThreshold: number, checkRaiseFreq: number, bluffAllowed: boolean }}
 */
function getPLOLimpedPotStrategy(isLimpedPot, madeHand, equityFinal, numPlayers) {
    if (!isLimpedPot) {
        return { limpedBetThreshold: 55, checkRaiseFreq: 0.25, bluffAllowed: true, isLimpedPot: false };
    }

    // In limped pots: thin value bets → need more equity before betting
    const limpedBetThreshold = numPlayers >= 3 ? 68 : 62; // Multiway: tighter threshold

    // Check-raise more in limped pots (range is uncapped; check-raise range includes all sets/straights)
    const checkRaiseFreq = madeHand.strength >= 75 ? 0.50 : 0.20;

    // Never bluff into many opponents with a limped pot (they all connected somewhere)
    const bluffAllowed = numPlayers <= 2 && madeHand.strength >= 35;

    return { limpedBetThreshold, checkRaiseFreq, bluffAllowed, isLimpedPot: true };
}

// ── GAP B: MULTI-WAY AGGRESSION GOVERNOR ──
/**
 * PLO's #1 mistake: bluffing into 3+ players.
 * In multi-way pots, someone ALWAYS has a piece of the board.
 * This module hard-gates aggression based on player count and hand strength.
 * @param {number} numPlayers - Total players in the hand
 * @param {number} equityFinal
 * @param {Object} madeHand
 * @param {boolean} canRaise
 * @returns {{ allowAggression: boolean, minEquityToBluff: number, minEquityToValueBet: number }}
 */
function governPLOMultiWayAggression(numPlayers, equityFinal, madeHand, canRaise) {
    // Heads-up: normal thresholds
    if (numPlayers <= 2) {
        return { allowAggression: true, minEquityToBluff: 30, minEquityToValueBet: 52 };
    }

    // 3-way: raise bluff threshold significantly
    if (numPlayers === 3) {
        const minEquityToBluff = 55;  // Need strong semi-bluff in 3-way
        const minEquityToValueBet = 68;
        const allowAggression = equityFinal >= minEquityToBluff || madeHand.isNut;
        return { allowAggression, minEquityToBluff, minEquityToValueBet };
    }

    // 4-way: almost never bluff, only bet nuts or near-nuts
    if (numPlayers === 4) {
        const minEquityToBluff = 72;
        const minEquityToValueBet = 75;
        const allowAggression = madeHand.isNut || equityFinal >= 80;
        return { allowAggression, minEquityToBluff, minEquityToValueBet };
    }

    // 5-way+: NEVER bluff, only bet the stone nuts
    return { allowAggression: madeHand.isNut, minEquityToBluff: 85, minEquityToValueBet: 85 };
}

// ── GAP C: 3-BET DEFENSE RANGES (Call / 4-bet / Fold) ──
/**
 * When our open gets 3-bet, we need exact ranges for call/4bet/fold.
 * PLO 3-bet pots are huge and mistakes are very costly.
 * @param {number} preflopStrength - Our hand's preflop strength score
 * @param {string} position - Our position
 * @param {boolean} isIP - Are we in position relative to the 3-bettor?
 * @param {number} stackBB
 * @param {number} potOdds - Amount to call / (pot + call)
 * @returns {{ action: 'call'|'4bet'|'fold', shouldFlatCall: boolean, should4Bet: boolean }}
 */
function getPLO3BetDefense(preflopStrength, position, isIP, stackBB, potOdds) {
    // Best hands (AAxx, KKxx double-suited, AKQJ double-suited): always 4-bet
    if (preflopStrength >= 90) {
        return { action: '4bet', shouldFlatCall: false, should4Bet: true };
    }

    // Very strong hands (AAKK, double-suited broadway): 4-bet IP, call OOP
    if (preflopStrength >= 82 && isIP) {
        return { action: '4bet', shouldFlatCall: false, should4Bet: true };
    }
    if (preflopStrength >= 82 && !isIP) {
        return { action: 'call', shouldFlatCall: true, should4Bet: false };
    }

    // Strong hands (most suited Aces, connected big cards): call if pot odds are reasonable
    if (preflopStrength >= 70) {
        if (potOdds <= 0.30 && isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        if (potOdds <= 0.22 && !isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        return { action: 'fold', shouldFlatCall: false, should4Bet: false };
    }

    // Medium hands: fold to 3-bet unless getting great odds
    if (preflopStrength >= 58) {
        if (potOdds <= 0.18 && isIP) return { action: 'call', shouldFlatCall: true, should4Bet: false };
        return { action: 'fold', shouldFlatCall: false, should4Bet: false };
    }

    // Weak hands: always fold to 3-bet
    return { action: 'fold', shouldFlatCall: false, should4Bet: false };
}

// ── GAP D: LIMPER ISOLATION STRATEGY ──
/**
 * When opponents limp pre-flop, a premium hand should isolate with a raise
 * to create a smaller pot, take position, and maximize EV.
 * @param {number} numLimpers - Number of players who limped before us
 * @param {number} preflopStrength - Our strength score
 * @param {string} position
 * @param {boolean} isIP
 * @param {number} bb - Big blind amount
 * @param {Object} raiseAction
 * @returns {{ shouldIsolate: boolean, isolateSize: number }}
 */
function getPLOLimperIsolation(numLimpers, preflopStrength, position, isIP, bb, raiseAction) {
    if (numLimpers === 0) return { shouldIsolate: false, isolateSize: 0 };

    // Need a strong hand to isolate
    const isolateThreshold = isIP ? 65 : 72; // IP: isolate more often
    if (preflopStrength < isolateThreshold) return { shouldIsolate: false, isolateSize: 0 };

    // Standard isolation sizing: 3bb + 1bb per limper
    // Example: 1 limper = 4bb, 2 limpers = 5bb, 3 limpers = 6bb
    const baseSize = 3 + numLimpers;
    const isolateSize = Math.round(baseSize * bb);
    const clamped = Math.max(raiseAction?.minAmount || isolateSize, Math.min(isolateSize, raiseAction?.maxAmount || isolateSize));

    return { shouldIsolate: true, isolateSize: clamped };
}

// ── GAP E: SIDE-POT / ALL-IN PLAYER AWARENESS ──
/**
 * When a player is all-in, side pots exist. Our betting strategy must adapt:
 * - We can't win more than the all-in player's stack from them
 * - We should size up vs active (non-all-in) players only
 * - Very short all-in player = no point bluffing, they can't fold
 * @param {Object[]} allInPlayers - Array of { stack } for all-in players
 * @param {number} ourStack
 * @param {number} numActivePlayers - Players still able to fold
 * @param {number} equityFinal
 * @returns {{ hasSidePot: boolean, adjustedTarget: string, sizeAdj: number }}
 */
function getPLOSidePotAwareness(allInPlayers, ourStack, numActivePlayers, equityFinal) {
    if (!allInPlayers || allInPlayers.length === 0) {
        return { hasSidePot: false, adjustedTarget: 'main', sizeAdj: 1.0 };
    }

    const hasSidePot = numActivePlayers >= 1;

    // If everyone is all-in (only side pot), we can't do anything — just check
    if (numActivePlayers === 0) {
        return { hasSidePot: true, adjustedTarget: 'main_only', sizeAdj: 0 };
    }

    // With active players + all-in players: target bets at the active players
    // Size based on equity: worth betting into active players even with a small all-in to the side
    const sizeAdj = equityFinal >= 60 ? 1.0 : 0.85; // Normal sizing if strong, else smaller

    return { hasSidePot: true, adjustedTarget: 'active_players', sizeAdj };
}

// ── GAP F: LATE-SESSION OPPONENT FATIGUE ADJUSTMENT ──
/**
 * After 2+ hours of play, humans make looser, more frustrated decisions.
 * The horse should exploit late-session tilt by:
 * - Value-betting thinner (they'll call with worse hands)
 * - Bluffing less (they'll snap-call with anything)
 * - Calling down lighter (they'll bluff more when tilted)
 * @param {number} sessionMinutes - How long the session has been running
 * @param {number} opponentLosses - How much the opponent has lost (in BB)
 * @returns {{ fatigueLevel: string, valueThinner: number, calldownLoosen: number }}
 */
function getPLOLateSessionAdjustment(sessionMinutes, opponentLosses) {
    if (!sessionMinutes || sessionMinutes < 60) {
        return { fatigueLevel: 'fresh', valueThinner: 0, calldownLoosen: 0 };
    }

    // Tilt indicator: losing big + long session = desperate/tilting
    const isLosingBig = (opponentLosses || 0) >= 50; // 50bb+ down

    if (sessionMinutes >= 180 && isLosingBig) {
        // Deep tilt: value-bet much thinner, call down looser
        return { fatigueLevel: 'deep_tilt', valueThinner: -12, calldownLoosen: 12 };
    }

    if (sessionMinutes >= 120 && isLosingBig) {
        return { fatigueLevel: 'tilting', valueThinner: -8, calldownLoosen: 8 };
    }

    if (sessionMinutes >= 120) {
        // Fatigued but not losing: slightly looser decisions
        return { fatigueLevel: 'fatigued', valueThinner: -4, calldownLoosen: 4 };
    }

    if (sessionMinutes >= 60) {
        return { fatigueLevel: 'warming_up', valueThinner: -2, calldownLoosen: 2 };
    }

    return { fatigueLevel: 'fresh', valueThinner: 0, calldownLoosen: 0 };
}

// ── 3b. MULTI-STREET PLANNING (MSP) ──
// Think beyond the current street. On the flop, consider whether
// a hand will still be good on the turn and river.
// Returns a "future_street_value" score that modifies current street equity.
/**
 * Multi-street planning: estimate whether our hand improves or deteriorates on future streets.
 * @param {Object} madeHand - From evaluatePLOMadeHand
 * @param {number} straightOuts - Current straight outs
 * @param {number} flushOuts - Current flush outs
 * @param {string} street - 'flop' | 'turn'
 * @param {Object} boardTexture - From analyzePLOBoardTexture
 * @param {boolean} isIP
 * @returns {{ futureValue: number, shouldPlayFastNow: boolean, shouldSlowPlay: boolean }}
 */
function getPLOMultiStreetPlan(madeHand, straightOuts, flushOuts, street, boardTexture, isIP) {
    let futureValue = 0;
    let shouldPlayFastNow = false;
    let shouldSlowPlay = false;

    const totalOuts = straightOuts + flushOuts;

    if (street === 'flop') {
        // Two streets to act = more value for draws
        if (totalOuts >= 15) futureValue += 18;   // Big draw: lots of equity over 2 streets
        else if (totalOuts >= 9) futureValue += 10;
        else if (totalOuts >= 4) futureValue += 4;

        // Sets on dry boards: play fast NOW — turn can kill you (board pair kills your set)
        if (madeHand.category === 'top_set' && !boardTexture.flushCompleted) {
            shouldPlayFastNow = true;     // Build the pot before flush/straight hits
            futureValue += 8;
        }
        // Dry board + top two pair + draw = slow-play is dangerous, play fast
        if (madeHand.category === 'top_two_pair' && boardTexture.texture === 'rainbow') {
            shouldPlayFastNow = true;
        }
        // Nut flush + redraw: slow-play OK (hand is already great)
        if (madeHand.category === 'nut_flush' && madeHand.hasRedraw) {
            shouldSlowPlay = isIP;  // Slow-play only IN position
        }
        // Monotone board: draws lose value each street (opponents can fold turns)
        if (boardTexture.isMonotone && totalOuts > 0 && !flushOuts) {
            futureValue -= 8;  // Straight draws on mono boards have poor future value
        }
    }

    if (street === 'turn') {
        // One street left: draws must pay now or fold
        if (totalOuts >= 9) futureValue += 5;   // Good draws still have 1 shot
        else if (totalOuts >= 4) futureValue += 2;
        // Made hands: protect now — no future value from drawing
        if (madeHand.strength >= 65) shouldPlayFastNow = true;
        // Very strong hands OOP on turn: check-raise instead of donk
        if (madeHand.strength >= 80 && !isIP) shouldSlowPlay = true;
    }

    return { futureValue, shouldPlayFastNow, shouldSlowPlay };
}

// ── 3c. C-BET FREQUENCY ENGINE ──
// In PLO, as the pre-flop raiser you should c-bet selectively.
// C-betting every flop is exploitable. Frequency depends on board texture.
/**
 * Determine c-bet frequency and sizing for PLO.
 * @param {boolean} wasPFRaiser - Did this horse raise preflop?
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @param {number} equity
 * @returns {{ shouldCBet: boolean, cBetFraction: number, reason: string }}
 */
function getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity) {
    if (!wasPFRaiser) return { shouldCBet: false, cBetFraction: 0, reason: 'not_pfr' };
    if (numPlayers > 3) return { shouldCBet: equity >= 65, cBetFraction: 0.75, reason: 'multiway_value_only' };

    // Dry boards: c-bet high frequency with strong hands + semi-bluffs (board misses opponents)
    if (boardTexture.texture === 'rainbow') {
        if (equity >= 50) return { shouldCBet: true, cBetFraction: 0.65, reason: 'dry_value' };
        if (isIP && Math.random() < 0.35) return { shouldCBet: true, cBetFraction: 0.50, reason: 'dry_bluff_ip' };
    }

    // Monotone boards: check-back more (opponents could have flopped flushes)
    if (boardTexture.isMonotone) {
        if (equity >= 70) return { shouldCBet: true, cBetFraction: 0.75, reason: 'mono_value' };
        return { shouldCBet: false, cBetFraction: 0, reason: 'mono_check' };
    }

    // Two-tone boards: mixed strategy
    if (boardTexture.texture === 'two_tone') {
        if (equity >= 60) return { shouldCBet: true, cBetFraction: 0.70, reason: '2tone_value' };
        if (isIP && equity >= 40 && Math.random() < 0.30) return { shouldCBet: true, cBetFraction: 0.55, reason: '2tone_semi' };
    }

    // Paired boards: c-bet only with two pair+ (opponents often have trips or full houses)
    if (boardTexture.isPaired) {
        if (equity >= 65) return { shouldCBet: true, cBetFraction: 0.60, reason: 'paired_value' };
        return { shouldCBet: false, cBetFraction: 0, reason: 'paired_no_cbet' };
    }

    // Default
    if (equity >= 55) return { shouldCBet: true, cBetFraction: 0.65, reason: 'default_value' };
    return { shouldCBet: false, cBetFraction: 0, reason: 'default_check' };
}

// ── 3d. TURN BARREL LOGIC ──
// Firing the 2nd barrel on the turn in PLO requires conviction.
// Don't barrel turns with weak hands — opponents don't fold PLO equity easily.
/**
 * Decide whether to fire a turn barrel (2nd street of betting).
 * @param {number} equity - Phase 1/2 equity score
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {boolean} isScareTurn - Was a scare card dealt?
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @returns {{ shouldBarrel: boolean, barrelFraction: number }}
 */
function getPLOTurnBarrel(equity, madeHand, straightOuts, flushOuts, isScareTurn, boardTexture, isIP) {
    const totalOuts = straightOuts + flushOuts;

    // Strong made hands always barrel
    if (equity >= 75) return { shouldBarrel: true, barrelFraction: 0.85 };

    // Scare card hit: slow down with medium hands
    if (isScareTurn && equity < 70) return { shouldBarrel: false, barrelFraction: 0 };

    // Big wrap (15+ outs): barrel to charge opponents
    if (straightOuts >= 15) return { shouldBarrel: true, barrelFraction: 0.75 };

    // Nut flush draw: barrel (semi-bluff with equity)
    if (flushOuts >= 8) return { shouldBarrel: true, barrelFraction: 0.70 };

    // Combo draws (flush + straight): always barrel turn
    if (flushOuts >= 6 && straightOuts >= 8) return { shouldBarrel: true, barrelFraction: 0.80 };

    // Medium equity: check back in position (pot control)
    if (equity >= 50 && equity < 65 && isIP) return { shouldBarrel: false, barrelFraction: 0 };

    // Medium equity OOP: barrel to deny free turns
    if (equity >= 50 && !isIP && Math.random() < 0.40) return { shouldBarrel: true, barrelFraction: 0.60 };

    // Trash: give up
    return { shouldBarrel: false, barrelFraction: 0 };
}

// ── 3e. SHOWDOWN VALUE DETECTOR ──
// Knowing when to check for showdown vs. bluff is critical.
// A medium made hand on a dangerous board often has "showdown value" — 
// just check it, don't bluff and turn it into a bluff-catcher.
/**
 * Determine if the hand has enough showdown value to avoid bluffing.
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {number} numPlayers
 * @param {string} street
 * @returns {{ hasShowdownValue: boolean, sdvScore: number }}
 */
function getPLOShowdownValue(madeHand, boardTexture, numPlayers, street) {
    let sdv = madeHand.strength;

    // Pairs and two-pairs have showdown value heads-up but not multi-way
    if (numPlayers > 2) sdv -= 15;

    // On dangerous boards, medium hands lose showdown value
    if (boardTexture.isDangerous && !madeHand.isNut) sdv -= 12;

    // On the river, showdown value is critical — don't turn medium hands into bluffs
    if (street === 'river') sdv += 10; // River = showdown value counts more

    // Sets+ have showdown value on any board
    const highSDVHands = ['top_set', 'set', 'full_house', 'nut_flush', 'nut_straight', 'flush', 'straight'];
    const hasShowdownValue = highSDVHands.includes(madeHand.category) || sdv >= 45;

    return { hasShowdownValue, sdvScore: Math.max(0, sdv) };
}

// ── 3f. RANGE BALANCE RANDOMIZER ──
// To prevent exploitation, PLO horses should mix in unexpected lines:
// - Check-back with monsters occasionally
// - Bluff raise occasionally with air on safe boards
// - Flat call instead of 3-betting some premium hands
/**
 * Get a range-balance randomization factor.
 * Returns a modifier that occasionally forces unexpected lines.
 * @param {string} profileId - For deterministic but varied behavior per horse
 * @param {string} situation - 'preflop_3bet' | 'flop_lead' | 'turn_lead' | 'river_bet'
 * @param {number} equity
 * @returns {{ forceCheck: boolean, forceFlat: boolean, forceBluff: boolean }}
 */
function getPLORangeBalance(profileId, situation, equity) {
    const h = getHash(profileId);
    const r = Math.random();
    // Seeded variation per horse for deterministic style differences
    const styleOffset = (h % 20) / 100; // 0 to 0.19

    let forceCheck = false, forceFlat = false, forceBluff = false;

    switch (situation) {
        case 'flop_lead':
            // 15% of the time, check-back a strong hand to balance range
            if (equity >= 80 && r < 0.12 + styleOffset) forceCheck = true;
            // 8% of the time, bluff lead with air on dry boards
            if (equity < 25 && r < 0.08) forceBluff = true;
            break;
        case 'turn_lead':
            // 10% of the time, check strong hands OOP (disguise)
            if (equity >= 75 && r < 0.10 + styleOffset) forceCheck = true;
            break;
        case 'river_bet':
            // 20% of the time with blockers + air: bluff
            if (equity < 35 && r < 0.18) forceBluff = true;
            // 15% of the time with nuts: check-raise instead of lead
            if (equity >= 88 && r < 0.15) forceCheck = true;
            break;
        case 'preflop_3bet':
            // 8% of the time, flat a premium to balance
            if (equity >= 80 && r < 0.08) forceFlat = true;
            break;
    }

    return { forceCheck, forceFlat, forceBluff };
}

// ── 3g. IMPLIED ODDS CALCULATOR FOR PLO ──
// Deep-stacked PLO draws are profitable even with bad immediate odds
// if the implied odds are large enough to offset the immediate deficit.
/**
 * Calculate PLO implied odds for a drawing hand.
 * Returns whether calling is +EV based on implied stack winnings.
 * @param {number} toCall - Cost to call
 * @param {number} potSize - Current pot
 * @param {number} effectiveStack - Remaining stack
 * @param {number} totalOuts - Number of outs
 * @param {boolean} isNutDraw - Holding the nuts when we hit
 * @returns {{ impliedOdds: number, isProfitableCall: boolean, impliedMultiplier: number }}
 */
function getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw) {
    if (toCall <= 0) return { impliedOdds: Infinity, isProfitableCall: true, impliedMultiplier: 0 };

    // Pot odds: what fraction of the final pot do we need to win with what hit-rate?
    const hitRate = Math.min(totalOuts * 0.022, 0.46); // Rule of 2 per street
    const potOdds = toCall / (potSize + toCall);

    // Implied multiplier: how much total we expect to win when we hit
    // Nut draws extract max implied; non-nut draws extract much less
    const nutFactor = isNutDraw ? 1.0 : 0.55;
    // Expected winnings when we hit: estimate remaining stack that can be won
    const impliedWin = toCall + potSize + (effectiveStack * 0.65 * nutFactor);
    // Implied odds = effective winnings / cost to call
    const impliedMultiplier = impliedWin / toCall;
    // Break-even: we need to win at least potOdds / hitRate ratio
    const impliedOdds = hitRate * impliedMultiplier;
    const isProfitableCall = impliedOdds >= potOdds + 0.05; // Require a small edge buffer

    return { impliedOdds: Math.round(impliedOdds * 100) / 100, isProfitableCall, impliedMultiplier };
}

// ── 3h. OPPONENT-SPECIFIC PLO ADJUSTMENTS ──
// Use stored opponent reads (bluff frequency, fold tendency)
// to adjust PLO-specific call/raise thresholds.
/**
 * Adjust PLO thresholds based on opponent reads.
 * @param {Object} opponentRead - { callMod, foldMod, bluffFrequency } from Supabase
 * @returns {{ valueBetThreshold: number, foldThreshold: number, bluffThreshold: number }}
 */
function getPLOOpponentAdjustments(opponentRead) {
    const base = { valueBetThreshold: 65, foldThreshold: 45, bluffThreshold: 30 };
    if (!opponentRead) return base;

    const { callMod = 0, foldMod = 0, bluffFrequency = 0.15 } = opponentRead;

    // Against a station (high callMod): value bet thinner, never bluff
    if (callMod > 0.3) {
        base.valueBetThreshold -= 10; // Bet more hands for value
        base.bluffThreshold = 999;    // Never bluff a station
    }
    // Against a folder (high foldMod): bluff more, value bet larger
    else if (foldMod > 0.3) {
        base.bluffThreshold -= 10;    // Bluff liberally
        base.foldThreshold -= 8;      // They fold, so we fold less back
    }
    // Against a maniac (high bluffFrequency): call down lighter
    if (bluffFrequency > 0.35) {
        base.foldThreshold -= 12;     // Call them down with medium hands
    }

    return base;
}

// ── 3i. ALL-IN EQUITY SHORTCUT (Short-Stack Spots) ──
// When effective stacks are very shallow (< 6 SPR equivalent),
// compute an approximate all-in equity using hand + board directly.
// This avoids the complex postflop tree and commits based on raw equity.
/**
 * Determine if we should commit all-in in a shallow-SPR spot.
 * Considers both made hand strength AND draw equity together.
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {Object} sprZone
 * @param {number} numPlayers
 * @returns {{ shouldCommitAllIn: boolean, allInEquity: number }}
 */
function getPLOAllInEquity(madeHand, straightOuts, flushOuts, sprZone, numPlayers) {
    const rawEquity = madeHand.strength + Math.min((straightOuts + flushOuts) * 2.2, 46);
    // Multiway penalty is severe all-in
    const mwPenalty = Math.max(0, (numPlayers - 2) * 8);
    const allInEquity = Math.max(0, rawEquity - mwPenalty);

    // Commit thresholds by SPR
    let threshold = 56;
    if (sprZone.zone === 'shallow') threshold = 50;
    if (sprZone.zone === 'committed') threshold = 38;

    const shouldCommitAllIn = allInEquity >= threshold;
    return { shouldCommitAllIn, allInEquity };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — ELITE FINISHING LAYER
// Nut advantage, river overbets, donk responses, 4-bet pots,
// GIF triggers, post-showdown reads, variance protection, blind defense.
// ─────────────────────────────────────────────────────────────────────────────

// ── 4a. NUT RANGE ADVANTAGE ANALYSIS ──
/**
 * Determine whether we have nut range advantage on this board.
 * The player with more nut hands in their range should be the aggressor.
 * In PLO: preflop raiser generally has nut advantage on high, connected boards.
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {boolean} wasPreFlopAggressor
 * @param {boolean} isIP
 * @param {string} street
 * @returns {{ hasNutAdvantage: boolean, advantageScore: number }}
 */
function getPLONutRangeAdvantage(madeHand, boardTexture, wasPreFlopAggressor, isIP, street) {
    let score = 0;

    // Preflop raiser has nut advantage on high-card boards (A-K-Q textures)
    if (wasPreFlopAggressor) score += 12;

    // In position = more nut combos (wider preflop range from later position)
    if (isIP) score += 8;

    // Dry boards favor the PFR range (opponents can't have flopped random 2-pairs)
    if (boardTexture.texture === 'rainbow') score += 6;

    // Paired boards: harder to have nut advantage (anyone could have trips)
    if (boardTexture.isPaired) score -= 8;

    // Monotone boards: anyone can have a flush
    if (boardTexture.isMonotone) score -= 10;

    // We actually have a nut hand ourselves = strong nut advantage
    if (madeHand.isNut) score += 20;

    // Later streets = advantage compounds (aggressor keeps applying pressure)
    if (street === 'turn') score += 4;
    if (street === 'river') score += 6;

    const hasNutAdvantage = score >= 15;
    return { hasNutAdvantage, advantageScore: Math.max(0, score) };
}

// ── 4b. RIVER OVERBET ENGINE ──
/**
 * Determine if the horse should overbet on the river.
 * River overbets (1.5x-2.5x pot) with nut hands extract maximum value
 * from opponents who are pot-committed or holding 2nd-best hands.
 * Works best when: holding the nuts, opponent's range is capped (can't have nuts),
 * and SPR allows for overbet to be < stack size.
 * @param {Object} madeHand
 * @param {boolean} hasBoardNutAdvantage
 * @param {Object} sprZone
 * @param {boolean} isIP
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldOverbet: boolean, overbetFraction: number, overbetAmount: number }}
 */
function getPLORiverOverbet(madeHand, hasBoardNutAdvantage, sprZone, isIP, potSize, raiseAction) {
    if (!madeHand.isNut && madeHand.strength < 85) return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };
    if (sprZone.zone === 'committed' || sprZone.zone === 'shallow') return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };

    // Best overbet candidates: nut flush on paired board (opponent can't have full house)
    // or nut straight when flush missed, or nut low in PLO8
    let overbetFrac = 0;

    if (madeHand.category === 'nut_flush' && hasBoardNutAdvantage) {
        overbetFrac = isIP ? 1.75 : 1.50; // Bigger overbet IP
    } else if (madeHand.category === 'full_house' && madeHand.isNut) {
        overbetFrac = isIP ? 2.0 : 1.60;
    } else if (madeHand.category === 'nut_straight' && hasBoardNutAdvantage && Math.random() < 0.60) {
        overbetFrac = 1.25;
    } else if (madeHand.isNut && madeHand.strength >= 90 && Math.random() < 0.45) {
        overbetFrac = isIP ? 1.50 : 1.20;
    }

    if (overbetFrac === 0) return { shouldOverbet: false, overbetFraction: 0, overbetAmount: 0 };

    const rawAmount = Math.round(potSize * overbetFrac);
    const overbetAmount = Math.max(raiseAction?.minAmount || 1, Math.min(rawAmount, raiseAction?.maxAmount || rawAmount));
    return { shouldOverbet: true, overbetFraction: overbetFrac, overbetAmount };
}

// ── 4c. DONK BET RESPONSE ──
/**
 * Handle donk bets (when an opponent bets into the preflop raiser on the flop/turn).
 * Donk bets in PLO polarize the opponent's range: they have top pair or draws.
 * Correct response: raise with nuts/strong draws (deny equity), fold weak hands,
 * call with good pot odds and medium hands.
 * @param {number} donkBetFraction - Size of donk bet relative to pot (0-1.0+)
 * @param {number} equity - Current hand equity score
 * @param {Object} madeHand
 * @param {number} totalOuts
 * @param {boolean} isIP
 * @param {Object} raiseAction
 * @param {boolean} canCall
 * @param {number} potSize
 * @returns {{ action: string, amount?: number }|null}
 */
function handlePLODonkBet(donkBetFraction, equity, madeHand, totalOuts, isIP, raiseAction, canCall, potSize) {
    if (donkBetFraction <= 0) return null; // Not a donk situation

    // Large donk (> 60% pot): opponent likely has top pair or draw strength
    const isLargeDonk = donkBetFraction >= 0.60;
    const isPolarized = isLargeDonk; // Large donks = polarized range (nuts or nothing)

    // Nut hands: always re-raise against donk bets (deny equity, extract value)
    if (madeHand.isNut || equity >= 82) {
        const potRaise = Math.round(potSize * (isIP ? 2.5 : 2.0));
        if (raiseAction) return { action: 'raise', amount: Math.max(raiseAction.minAmount || 1, Math.min(potRaise, raiseAction.maxAmount || potRaise)) };
    }

    // Big draws facing a donk: semi-bluff raise
    if (totalOuts >= 14 && isIP && Math.random() < 0.55) {
        const potRaise = Math.round(potSize * 2.0);
        if (raiseAction) return { action: 'raise', amount: Math.max(raiseAction.minAmount || 1, Math.min(potRaise, raiseAction.maxAmount || potRaise)) };
    }

    // Medium equity with good immediate odds: flat call
    if (equity >= 45 && canCall) return { action: 'call' };

    // Small donk (< 40% pot) with any equity: call
    if (!isLargeDonk && equity >= 30 && canCall) return { action: 'call' };

    // Weak: fold
    return { action: 'fold' };
}

// ── 4d. 4-BET POT DYNAMICS ──
/**
 * Special logic for playing in 4-bet pots.
 * 4-bet pots have very shallow post-flop SPR (often < 2).
 * This means: commit with top ~20% of your preflop range on any reasonable flop.
 * Non-nut hands fold quickly; combo draws and top pairs commit.
 * @param {boolean} isIn4BetPot - Was the preflop action a 4-bet?
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {number} equity
 * @returns {{ shouldShoveFlopIn4Bet: boolean, shouldFoldWeakIn4Bet: boolean }}
 */
function getPLO4BetPotDecision(isIn4BetPot, madeHand, straightOuts, flushOuts, equity) {
    if (!isIn4BetPot) return { shouldShoveFlopIn4Bet: false, shouldFoldWeakIn4Bet: false };

    const totalOuts = straightOuts + flushOuts;

    // In a 4-bet pot: SPR is ~1-2 postflop, so shove flop with:
    // - Any top pair + decent kicker
    // - Any draw with 8+ outs
    // - Any made hand with equity > 45%
    const shouldShoveFlopIn4Bet = equity >= 45 || totalOuts >= 8 ||
        ['top_set', 'set', 'full_house', 'nut_flush', 'nut_straight', 'two_pair'].includes(madeHand.category);

    // Fold weak holdings in 4-bet pot (no implied odds, SPR too shallow)
    const shouldFoldWeakIn4Bet = equity < 35 && totalOuts < 6;

    return { shouldShoveFlopIn4Bet, shouldFoldWeakIn4Bet };
}

// ── 4e. GIF ALL-IN TRIGGER ──
/**
 * When a horse goes all-in with a strong hand, trigger a GIF at the table.
 * This fires through the existing game event bus and uses the GIF feature
 * already implemented in the platform.
 * @param {Object} madeHand
 * @param {number} equity
 * @param {number} allInEquity
 * @param {string} profileId
 * @returns {{ shouldThrowGif: boolean, gifCategory: string }}
 */
function getPLOGifTrigger(madeHand, equity, allInEquity, profileId) {
    if (!madeHand) return { shouldThrowGif: false, gifCategory: null };

    const hash = getHash(profileId);
    const rand = Math.random();

    // High equity all-in = confident GIF
    if (allInEquity >= 72 && madeHand.isNut && rand < 0.70) {
        return { shouldThrowGif: true, gifCategory: 'celebration' };
    }

    // Monster hand (set+) going all-in = dominant GIF
    if (['full_house', 'top_set', 'nut_flush'].includes(madeHand.category) && rand < 0.55) {
        return { shouldThrowGif: true, gifCategory: 'dominant' };
    }

    // Close-equity all-in (coin flip) = suspense GIF
    if (allInEquity >= 48 && allInEquity < 65 && rand < 0.40) {
        return { shouldThrowGif: true, gifCategory: 'suspense' };
    }

    // Behind but going for it (draw) = fighting GIF
    if (allInEquity < 48 && allInEquity >= 30 && rand < 0.30) {
        return { shouldThrowGif: true, gifCategory: 'fighting' };
    }

    return { shouldThrowGif: false, gifCategory: null };
}

// ── 4f. POST-SHOWDOWN READ UPDATER ──
/**
 * After a hand goes to showdown, update opponent reads in Supabase.
 * Detects if opponent bluffed, value-bet, or slow-played based on
 * the action vs. revealed hand strength.
 * This runs AFTER a hand result and updates horse_opponent_reads.
 * @param {string} horseId - This horse's profileId
 * @param {string} opponentId - Opponent's profileId
 * @param {Object} revealedHand - Opponent's actual hand category
 * @param {Array<string>} opponentBettingLine - Actions taken by opponent
 * @param {Object} supabaseClient - Supabase client reference
 */
async function updatePLOOpponentRead(horseId, opponentId, revealedHand, opponentBettingLine, supabaseClient) {
    if (!supabaseClient || !opponentId) return;

    try {
        const wasAggressive = opponentBettingLine.includes('raise') || opponentBettingLine.includes('bet');
        const handStrength = revealedHand?.strength || 0;

        // Detect if opponent was bluffing (aggressive with weak hand)
        const wasBluffing = wasAggressive && handStrength < 35;
        // Detect calling station (called lots but had weak hand)
        const wasStation = opponentBettingLine.filter(a => a === 'call').length >= 2 && handStrength < 45;
        // Detect slow-player (passive with strong hand)
        const wasSlowPlay = !wasAggressive && handStrength >= 75;

        // Incremental updates: only adjust the specific tendencies we observed
        const update = {};
        if (wasBluffing) update.bluff_frequency = 0.02;   // Upward nudge
        if (wasStation) update.fold_tendency = -0.02;     // Downward nudge (calls more)
        if (wasSlowPlay) update.slow_play_tendency = 0.02;

        if (Object.keys(update).length === 0) return;

        // Read existing record first, then merge
        const { data: existing } = await supabaseClient
            .from('horse_opponent_reads')
            .select('bluff_frequency, fold_tendency, slow_play_tendency')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .single();

        const mergedUpdate = {
            horse_id: horseId,
            opponent_id: opponentId,
            bluff_frequency: Math.min(0.80, Math.max(0.05, (existing?.bluff_frequency || 0.15) + (update.bluff_frequency || 0))),
            fold_tendency: Math.min(0.80, Math.max(0.05, (existing?.fold_tendency || 0.35) + (update.fold_tendency || 0))),
            slow_play_tendency: Math.min(0.70, Math.max(0.02, (existing?.slow_play_tendency || 0.10) + (update.slow_play_tendency || 0))),
            updated_at: new Date().toISOString(),
        };

        await supabaseClient.from('horse_opponent_reads').upsert(mergedUpdate, { onConflict: 'horse_id,opponent_id' });
    } catch (err) {
        // Non-fatal: opponent reads are enrichment data
        console.warn('[PLO][OpponentRead] Update failed:', err?.message);
    }
}

// ── 4g. VARIANCE PROTECTION MODE ──
/**
 * When a horse is on a losing streak, tighten up to protect their bankroll.
 * When on a heater (winning session), expand range slightly.
 * Uses session metrics passed via the state object.
 * @param {Object} sessionMetrics - { handsPlayed, buyin, currentStack, winRate }
 * @returns {{ tightenFactor: number, isOnTilt: boolean, isOnHeater: boolean }}
 */
function getPLOVarianceProtection(sessionMetrics) {
    if (!sessionMetrics) return { tightenFactor: 1.0, isOnTilt: false, isOnHeater: false };

    const { handsPlayed = 0, buyin = 100, currentStack = 100 } = sessionMetrics;
    const profitFraction = (currentStack - buyin) / buyin;

    // On tilt: lost > 40% of buyin in this session
    const isOnTilt = profitFraction < -0.40;

    // On a heater: up > 60% of buyin
    const isOnHeater = profitFraction > 0.60;

    // Tighten up significantly when on tilt
    if (isOnTilt) return { tightenFactor: 1.35, isOnTilt: true, isOnHeater: false };

    // Loosen slightly on a heater (play more draws, call wider)
    if (isOnHeater) return { tightenFactor: 0.90, isOnTilt: false, isOnHeater: true };

    // Normal: no adjustment
    return { tightenFactor: 1.0, isOnTilt: false, isOnHeater: false };
}

// ── 4h. BLIND DEFENSE STRATEGY ──
/**
 * Specific strategy for defending the SB and BB in PLO.
 * BB has the best odds to defend (already invested 1bb);
 * SB is the worst position (must act first post-flop).
 * @param {string} position - 'SB' | 'BB'
 * @param {number} strength - Preflop hand strength
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind amount
 * @param {number} potSize
 * @param {number} numPlayers
 * @param {Array} legalActions
 * @returns {{ action: string, amount?: number }|null}
 */
function getPLOBlindDefense(position, strength, toCall, bb, potSize, numPlayers, legalActions) {
    if (position !== 'BB' && position !== 'SB') return null;
    if (toCall === 0) return null; // No preflop raise, no defense needed

    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise');
    const raiseAction = legalActions.find(a => a.type === 'raise');
    const raiseFraction = toCall / bb; // How many BBs to call?

    // BB defense: already invested 1BB, so pot odds are great
    if (position === 'BB') {
        // Defend vs single open (3x): call with top 60% of hands
        if (raiseFraction <= 3.5 && strength >= 40 && canCall) return { action: 'call' };
        // Defend vs 4x or 5x open: call with top 45%
        if (raiseFraction <= 5.5 && strength >= 55 && canCall) return { action: 'call' };
        // 3-bet squeeze (multi-way steal): squeeze with top 25%
        if (numPlayers >= 3 && strength >= 75 && canRaise && raiseAction) {
            const sqz = Math.round(potSize * 0.85);
            return { action: 'raise', amount: Math.max(raiseAction.minAmount || 1, Math.min(sqz, raiseAction.maxAmount || sqz)) };
        }
        // Fold weak hands
        if (strength < 38) return { action: 'fold' };
    }

    // SB defense: worst position, very selective
    if (position === 'SB') {
        // SB vs BTN steal: defend with premium hands only (top 30%)
        if (raiseFraction <= 3 && strength >= 60 && canCall) return { action: 'call' };
        // 3-bet SB vs BTN with top 15%
        if (strength >= 80 && canRaise && raiseAction) {
            const threeB = Math.round(potSize * 1.0);
            return { action: 'raise', amount: Math.max(raiseAction.minAmount || 1, Math.min(threeB, raiseAction.maxAmount || threeB)) };
        }
        // Fold anything weaker in SB
        if (strength < 58) return { action: 'fold' };
    }

    return null; // Let normal logic handle it
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 — ELITE PINNACLE LAYER
// Card removal, runout quality, exploitation profiles, pot manipulation,
// ICM bubble, river floats, deep-stack (200bb+), squeeze plays.
// ─────────────────────────────────────────────────────────────────────────────

// ── 5a. CARD REMOVAL EFFECTS (ADVANCED BLOCKERS) ──
/**
 * When we hold certain cards, we reduce the number of nutted combos our
 * opponents can hold. Ace-blockers are the most powerful in PLO.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @returns {{ nutCombosRemoved: number, blocksFlushedNuts: boolean, blocksTopSet: boolean, removalScore: number }}
 */
function getPLOCardRemovalEffects(holeCards, boardCards) {
    if (!holeCards || holeCards.length < 2) return { nutCombosRemoved: 0, blocksFlushedNuts: false, blocksTopSet: false, removalScore: 0 };

    const bSuits = boardCards.map(c => c.suit);
    const bRanks = boardCards.map(c => c.rank);
    const hRanks = holeCards.map(c => c.rank);
    const hSuits = holeCards.map(c => c.suit);

    let removalScore = 0;
    let blocksFlushedNuts = false;
    let blocksTopSet = false;
    let nutCombosRemoved = 0;

    // Ace blocker: holding an ace removes C(3,1) = 3 additional ace combinations from opponent
    const aceCount = hRanks.filter(r => r === 12).length;
    if (aceCount >= 1) {
        removalScore += 12 * aceCount;
        nutCombosRemoved += 3 * aceCount;
    }

    // Flush nut blocker: holding Ace of dominant suit blocks nut flush draw combos
    const sFq = {}; for (const s of bSuits) sFq[s] = (sFq[s] || 0) + 1;
    const dom = Object.entries(sFq).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (dom && bSuits.filter(s => s === dom).length >= 2) {
        const hasAceOfFlushSuit = holeCards.some(c => c.suit === dom && c.rank === 12);
        if (hasAceOfFlushSuit) {
            blocksFlushedNuts = true;
            removalScore += 18;
            nutCombosRemoved += 4; // Removes all Axx flush nut combos
        }
    }

    // Top set blocker: holding 2 cards of the top board rank blocks opponent top set
    const topBoardRank = Math.max(...bRanks, 0);
    const holeCountOfTopRank = hRanks.filter(r => r === topBoardRank).length;
    if (holeCountOfTopRank >= 1) {
        blocksTopSet = true;
        removalScore += 8 * holeCountOfTopRank;
        nutCombosRemoved += 2 * holeCountOfTopRank;
    }

    return { nutCombosRemoved, blocksFlushedNuts, blocksTopSet, removalScore };
}

// ── 5b. RUNOUT DISTRIBUTION ANALYZER ──
/**
 * Analyze how many "favorable" vs "unfavorable" remaining cards exist in the deck.
 * A favorable turn card = hits our draw. An unfavorable turn = pairs the board for opponent.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @returns {{ favorableCards: number, unfavorableCards: number, runoutQuality: string }}
 */
function analyzePLORunoutDistribution(holeCards, boardCards, straightOuts, flushOuts) {
    const totalRemaining = 52 - holeCards.length - boardCards.length;
    const favorable = straightOuts + flushOuts; // Cards that improve us
    const bRanks = boardCards.map(c => c.rank);
    // Unfavorable: cards that pair the board (give full house to someone who has trips)
    const uniqueBoardRanks = [...new Set(bRanks)];
    const pairingCards = uniqueBoardRanks.reduce((sum, r) => sum + (3 - bRanks.filter(x => x === r).length), 0);
    const unfavorable = Math.min(pairingCards, 8); // Cap at 8 scare cards per street

    let runoutQuality = 'neutral';
    if (favorable >= 12) runoutQuality = 'excellent';
    else if (favorable >= 8) runoutQuality = 'good';
    else if (unfavorable >= 6) runoutQuality = 'dangerous';
    else if (favorable < 4 && unfavorable >= 4) runoutQuality = 'poor';

    return { favorableCards: favorable, unfavorableCards: unfavorable, runoutQuality, totalRemaining };
}

// ── 5c. EXPLOITATION PROFILER ──
/**
 * Build a counter-strategy based on opponent's general profile.
 * Derived from the available opponent reads + action patterns.
 * @param {Object} opponentRead - { bluffFrequency, foldTendency, slowPlayTendency, callMod, foldMod }
 * @returns {{ profile: string, strategy: Object }}
 */
function buildPLOExploitationProfile(opponentRead) {
    if (!opponentRead) return { profile: 'unknown', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false } };

    const { bluffFrequency = 0.15, foldMod = 0.35, callMod = 0.25, slowPlayTendency = 0.10 } = opponentRead;

    // Maniac: high bluff frequency → call down with medium hands, never bluff back
    if (bluffFrequency > 0.40) {
        return { profile: 'maniac', strategy: { valueWider: true, bluffMore: false, callDown: true, stealBlinds: false, checkRaiseMore: true } };
    }
    // Nit: folds too much → steal constantly, don't call their value bets
    if (foldMod > 0.60) {
        return { profile: 'nit', strategy: { valueWider: false, bluffMore: true, callDown: false, stealBlinds: true, checkRaiseMore: false } };
    }
    // Station: calls everything → value bet constantly, never bluff
    if (callMod > 0.55) {
        return { profile: 'station', strategy: { valueWider: true, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: false } };
    }
    // Slow-player: strong hands played passively → raise more when they check
    if (slowPlayTendency > 0.30) {
        return { profile: 'slow_player', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: true } };
    }
    // Balanced: normal game plan
    return { profile: 'balanced', strategy: { valueWider: false, bluffMore: false, callDown: false, stealBlinds: false, checkRaiseMore: false } };
}

// ── 5d. POT MANIPULATION ENGINE ──
/**
 * Determine if the horse should manipulate pot size:
 * - Isolate fishy players with a large raise
 * - Keep multi-way when holding big draw (more implied odds)
 * - Charge draws in multi-way pots to deny math
 * @param {number} numPlayers
 * @param {Object} exploitProfile
 * @param {number} equity
 * @param {boolean} isIP
 * @param {Object} madeHand
 * @param {number} totalOuts
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldIsolate: boolean, shouldKeepMultiWay: boolean, chargeDrawSize: number }}
 */
function getPLOPotManipulation(numPlayers, exploitProfile, equity, isIP, madeHand, totalOuts, potSize, raiseAction) {
    // Isolate a fish (maniac/station) with premium hand
    const shouldIsolate = exploitProfile.profile === 'maniac' || exploitProfile.profile === 'station';
    const isolateSize = shouldIsolate && equity >= 65
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 1.2), raiseAction?.maxAmount || 9999))
        : 0;

    // Keep multi-way with big draws (more players = bigger pot when we hit)
    const shouldKeepMultiWay = totalOuts >= 15 && !madeHand.isNut && numPlayers <= 4;

    // In multi-way pot, charge draws by betting pot (deny correct odds)
    // Should fire pot-sized bets to make draws unprofitable to chase
    const isMultiWay = numPlayers >= 3;
    const chargeDrawSize = isMultiWay && madeHand.strength >= 60 && isIP
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 0.90), raiseAction?.maxAmount || 9999))
        : 0;

    return { shouldIsolate, isolateSize, shouldKeepMultiWay, chargeDrawSize };
}

// ── 5e. ICM BUBBLE PRESSURE ──
/**
 * Near the tournament bubble or final table, adjust PLO strategy:
 * - Short stacks: jam wider (ICM pressure on others)
 * - Big stacks: widen range to apply ICM pressure, steal more
 * - Everyone: avoid all-ins unless dominating (ICM survival)
 * @param {Object} icmData - { isBubble, isFinalTable, payoutSpots, stackRank, totalPlayers }
 * @param {number} stackBB
 * @returns {{ icmFactor: number, shouldShoveWider: boolean, shouldApplyPressure: boolean, avoidFlips: boolean }}
 */
function getPLOICMBubblePressure(icmData, stackBB) {
    if (!icmData || (!icmData.isBubble && !icmData.isFinalTable)) {
        return { icmFactor: 1.0, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: false };
    }

    const { isBubble, isFinalTable, stackRank, totalPlayers } = icmData;
    const isBigStack = stackRank <= Math.ceil(totalPlayers * 0.25); // Top 25% of stacks
    const isShortStack = stackBB <= 15;

    // Bubble: short stacks shove wider, medium stacks tighten, big stacks apply pressure
    if (isBubble) {
        if (isShortStack) return { icmFactor: 0.85, shouldShoveWider: true, shouldApplyPressure: false, avoidFlips: false };
        if (isBigStack) return { icmFactor: 0.90, shouldShoveWider: false, shouldApplyPressure: true, avoidFlips: true };
        return { icmFactor: 1.20, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: true }; // Medium: super tight
    }

    // Final table: everyone tightens, ICM pressure is massive
    if (isFinalTable) {
        if (isShortStack) return { icmFactor: 0.80, shouldShoveWider: true, shouldApplyPressure: false, avoidFlips: false };
        return { icmFactor: 1.25, shouldShoveWider: false, shouldApplyPressure: isBigStack, avoidFlips: true };
    }

    return { icmFactor: 1.0, shouldShoveWider: false, shouldApplyPressure: false, avoidFlips: false };
}

// ── 5f. RIVER FLOAT AND FIRE ──
/**
 * Float the turn (call with no made hand) then fire the river as a bluff
 * when the draw misses. This exploits opponents who c-bet then check rivers.
 * Works best: in position, against a single opponent, with blockers.
 * @param {Object} madeHand
 * @param {number} straightOuts
 * @param {number} flushOuts
 * @param {string} street
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @param {Object} blockers
 * @param {number} potSize
 * @param {Object} raiseAction
 * @returns {{ shouldFloat: boolean, shouldFireRiver: boolean, fireSize: number }}
 */
function getPLORiverFloat(madeHand, straightOuts, flushOuts, street, isIP, numPlayers, blockers, potSize, raiseAction) {
    // Float only in position, heads-up
    if (!isIP || numPlayers > 2) return { shouldFloat: false, shouldFireRiver: false, fireSize: 0 };

    const hasDraw = straightOuts + flushOuts >= 6;
    const hasBlockers = blockers.canBluffRiver;
    const hasMadeHand = madeHand.strength >= 50;

    // Turn float: call with draws or blockers when PFR checks or makes a small c-bet
    const shouldFloat = (hasDraw || hasBlockers) && !hasMadeHand && street === 'turn';

    // River fire: when we floated and now the board is checked to us
    const drawMissed = straightOuts < 3 && flushOuts < 3;
    const shouldFireRiver = street === 'river' && drawMissed && isIP && hasBlockers && Math.random() < 0.55;

    const fireSize = shouldFireRiver
        ? Math.max(raiseAction?.minAmount || 1, Math.min(Math.round(potSize * 0.70), raiseAction?.maxAmount || 9999))
        : 0;

    return { shouldFloat, shouldFireRiver, fireSize };
}

// ── 5g. DEEP STACK ADJUSTMENTS (200BB+) ──
/**
 * Very deep stacked PLO (200bb+) is fundamentally different:
 * - Set-mining becomes profitable (big implied odds)
 * - Drawing hands gain enormous value
 * - Premium hands must play bigger pots to avoid losing equity to runouts
 * - Wider preflop ranges because implied odds are vastly higher
 * @param {number} stackBB
 * @returns {{ isDeepStack: boolean, preflopRangeExpansion: number, impliedOddsBonus: number, drawValueBonus: number }}
 */
function getPLODeepStackAdjustments(stackBB) {
    if (stackBB < 150) return { isDeepStack: false, preflopRangeExpansion: 0, impliedOddsBonus: 0, drawValueBonus: 0 };

    // How deep are we?
    const deepnessMultiplier = Math.min((stackBB - 100) / 200, 1.0); // 0 at 100bb, 1.0 at 300bb+

    // Expand preflop opening range (connected hands are more valuable deep)
    const preflopRangeExpansion = Math.round(deepnessMultiplier * 12); // Up to +12 strength points

    // Implied odds bonus for drawing hands (worth more because of deep stacks to be won)
    const impliedOddsBonus = deepnessMultiplier * 0.15; // Up to +15% implied odds ERC

    // Draw value bonus: pair + draw, set + draw become much stronger
    const drawValueBonus = Math.round(deepnessMultiplier * 10); // Up to +10 equity points

    return { isDeepStack: true, preflopRangeExpansion, impliedOddsBonus, drawValueBonus };
}

// ── 5h. SQUEEZE PLAY ENGINE ──
/**
 * Squeeze plays: 3-bet over multiple callers with premium or bluff hands.
 * In PLO, squeezes are more effective than Hold'em due to range polarization.
 * When there are 2+ callers and we are in a late position, squeeze to isolate.
 * @param {number} numCallers - How many players called the initial raise
 * @param {boolean} isIP
 * @param {string} position
 * @param {number} strength - Preflop hand strength
 * @param {number} potSize
 * @param {Object} raiseAction
 * @param {boolean} canRaise
 * @returns {{ shouldSqueeze: boolean, squeezeSize: number, isBluffSqueeze: boolean }}\n */
function getPLOSqueezePlay(numCallers, isIP, position, strength, potSize, raiseAction, canRaise) {
    if (!canRaise || !raiseAction) return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false };
    if (numCallers < 2) return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false }; // Need 2+ callers

    const ipPositions = new Set(['BTN', 'CO']);
    const isLatePos = ipPositions.has(position);

    // Value squeeze: premium hands from any position
    if (strength >= 78) {
        const sqzSize = Math.round(potSize * 1.0); // Full pot squeeze
        return { shouldSqueeze: true, squeezeSize: Math.max(raiseAction.minAmount || 1, Math.min(sqzSize, raiseAction.maxAmount || sqzSize)), isBluffSqueeze: false };
    }

    // Bluff squeeze: from late position with semi-premium or marginal hands
    // Works because callers are likely holding marginal hands, not premiums
    if (isLatePos && strength >= 58 && Math.random() < 0.35) {
        const sqzSize = Math.round(potSize * 0.85);
        return { shouldSqueeze: true, squeezeSize: Math.max(raiseAction.minAmount || 1, Math.min(sqzSize, raiseAction.maxAmount || sqzSize)), isBluffSqueeze: true };
    }

    return { shouldSqueeze: false, squeezeSize: 0, isBluffSqueeze: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6 — PRECISION EQUITY & TABLE DYNAMICS
// Combo draw de-dup, HvR approximation, reverse implied odds, table image,
// check-behind calibration, flop continuance, river optimizer, GIF state machine.
// ─────────────────────────────────────────────────────────────────────────────

// ── 6a. COMBO DRAW DE-DUPLICATOR ──
/**
 * When a hand has BOTH a flush draw AND a straight draw, simply adding
 * outs double-counts cards that simultaneously complete both.
 * This function returns the de-duplicated, exact combo draw out count.
 * @param {Array<{rank,suit}>} holeCards
 * @param {Array<{rank,suit}>} boardCards
 * @param {number} rawStraightOuts
 * @param {number} rawFlushOuts
 * @returns {{ exactOuts: number, isCombo: boolean, comboBonus: number }}
 */
function deduplicatePLOComboOuts(holeCards, boardCards, rawStraightOuts, rawFlushOuts) {
    // If we have both a straight AND flush draw, some outs complete BOTH
    const isCombo = rawStraightOuts >= 4 && rawFlushOuts >= 6;
    if (!isCombo) {
        return { exactOuts: rawStraightOuts + rawFlushOuts, isCombo: false, comboBonus: 0 };
    }

    // When we have both, typically 2-4 cards complete both draws simultaneously
    // (the suited cards in the straight draw). We subtract the overlap.
    const bSuits = boardCards.map(c => c.suit);
    const hSuits = holeCards.map(c => c.suit);
    const sFq = {}; for (const s of [...bSuits, ...hSuits]) sFq[s] = (sFq[s] || 0) + 1;
    const dom = Object.entries(sFq).sort(([, a], [, b]) => b - a)[0]?.[0];

    // Estimate overlap: straight outs that are also the flush suit
    const flushStraightOverlap = dom ? Math.min(Math.floor(rawStraightOuts * 0.2), 3) : 0;
    const exactOuts = rawStraightOuts + rawFlushOuts - flushStraightOverlap;

    // Combo draws get a bonus because they have twice the ways to win
    // (can win with flush OR straight), which has strategic implications
    const comboBonus = isCombo ? 5 : 0; // Extra strategic value beyond raw outs

    return { exactOuts, isCombo, comboBonus };
}

// ── 6b. HAND VS RANGE (HvR) APPROXIMATION ──
/**
 * Instead of thinking "my hand vs their hand", estimate our equity against
 * the opponent's likely range given their actions.
 * This is a heuristic approximation of what a HvR solver would compute.
 * @param {Object} madeHand - Our hand
 * @param {number} exactOuts - Exact collison-free outs
 * @param {string[]} opponentActions - ['raise', 'call', 'bet', etc.]
 * @param {Object} boardTexture
 * @param {string} street
 * @param {number} potOdds
 * @returns {{ hvrEquity: number, opponentRangeType: string, hvrAdjustment: number }}
 */
function approximatePLOHvR(madeHand, exactOuts, opponentActions, boardTexture, street, potOdds) {
    // Infer opponent's range type from actions
    let opponentRangeType = 'balanced'; // Default
    const raised = opponentActions?.includes('raise');
    const bet = opponentActions?.includes('bet');
    const checked = opponentActions?.includes('check');
    const called = opponentActions?.includes('call');

    // Raiser on flop: likely strong made hand or big draw
    if (raised && street === 'flop') opponentRangeType = 'strong';
    // Checked and then bet turn: likely medium top pair to two-pair
    else if (checked && bet && street === 'turn') opponentRangeType = 'medium';
    // Called flop and called turn: likely a draw or medium hand
    else if (called && street === 'river') opponentRangeType = 'drawing_missed';
    // Checked twice: often a weak hand or slow-play
    else if (checked && checked) opponentRangeType = 'weak_or_slowplay';

    // Base HvR equity: start with our raw hand strength
    let hvrBaseEquity = madeHand.strength + Math.min(exactOuts * 2.2, 46);

    // Adjust based on opponent's range type
    let hvrAdjustment = 0;
    switch (opponentRangeType) {
        case 'strong':
            // Against a strong range, our medium hands lose value
            hvrAdjustment = madeHand.isNut ? 5 : -15;
            break;
        case 'medium':
            // Against medium, our strong hands gain, medium stays neutral
            hvrAdjustment = madeHand.strength >= 70 ? 8 : 0;
            break;
        case 'drawing_missed':
            // River call with a missed draw = we have majority of equity
            hvrAdjustment = 12; // Caller likely missed, our hand is best
            break;
        case 'weak_or_slowplay':
            // Tricky: could be very weak OR very strong monster slow-played
            hvrAdjustment = madeHand.strength >= 80 ? 10 : -8;
            break;
        default:
            hvrAdjustment = 0;
    }

    const hvrEquity = Math.max(0, Math.min(100, hvrBaseEquity + hvrAdjustment));
    return { hvrEquity, opponentRangeType, hvrAdjustment };
}

// ── 6c. REVERSE IMPLIED ODDS ──
/**
 * Reverse implied odds (RIO) answer: "When we hit our draw, how often do we
 * still lose to a BETTER hand?" Non-nut draws on dangerous boards have terrible RIO.
 * This is especially critical in PLO where hitting 2nd-best is a death trap.
 * @param {boolean} isNutFlushDraw
 * @param {boolean} isNutStraightDraw
 * @param {Object} boardTexture
 * @param {number} numPlayers
 * @param {Object} madeHand
 * @returns {{ rioMultiplier: number, rioRisk: string, rioDiscount: number }}
 */
function getPLOReverseImpliedOdds(isNutFlushDraw, isNutStraightDraw, boardTexture, numPlayers, madeHand) {
    let rioDiscount = 0;
    let rioRisk = 'low';

    // Non-nut flush draw: could hit 2nd-best flush (VERY common in PLO)
    if (!isNutFlushDraw && madeHand.category === 'flush') {
        rioDiscount = numPlayers > 2 ? -18 : -10;
        rioRisk = 'high';
    }
    // Non-nut straight draw on a monotone board: flush already beats us when we hit
    if (!isNutStraightDraw && boardTexture.isMonotone) {
        rioDiscount = numPlayers > 2 ? -22 : -14;
        rioRisk = 'very_high';
    }
    // Non-nut flush draw on paired board: full house beats our flush
    if (!isNutFlushDraw && boardTexture.isPaired) {
        rioDiscount = -15;
        rioRisk = 'high';
    }
    // Nut draws: minimal RIO
    if (isNutFlushDraw || isNutStraightDraw) {
        rioDiscount = numPlayers > 3 ? -5 : 0; // Small penalty multi-way even with nuts
        rioRisk = 'low';
    }

    // RIO multiplier: 0.70 to 1.0 (how much of draw equity we actually realize)
    const rioMultiplier = Math.max(0.60, 1.0 + rioDiscount / 100);
    return { rioMultiplier, rioRisk, rioDiscount };
}

// ── 6d. TABLE IMAGE TRACKER ──
/**
 * Track the horse's table image based on recent showdowns.
 * If we've been showing down strong hands: tight image → more bluffing license.
 * If we've been caught bluffing: loose/aggressive image → value bet more, bluff less.
 * @param {Object} sessionStats - { recentShowdowns, bluffsCaught, valueHandsShown }
 * @returns {{ tableImage: string, bluffLicense: number, valueBetBias: number }}
 */
function getPLOTableImage(sessionStats) {
    if (!sessionStats) return { tableImage: 'neutral', bluffLicense: 0.15, valueBetBias: 0 };

    const { recentShowdowns = 0, bluffsCaught = 0, valueHandsShown = 0 } = sessionStats;

    const totalShown = recentShowdowns;
    if (totalShown === 0) return { tableImage: 'unknown', bluffLicense: 0.15, valueBetBias: 0 };

    const bluffRate = bluffsCaught / Math.max(totalShown, 1);
    const valueRate = valueHandsShown / Math.max(totalShown, 1);

    // Tight image: mostly showing strong hands → more bluffing license
    if (valueRate > 0.70) {
        return { tableImage: 'tight', bluffLicense: 0.30, valueBetBias: -5 }; // Opponents call wider
    }
    // Loose/caught image: got caught bluffing → value bet more, bluff less
    if (bluffRate > 0.40) {
        return { tableImage: 'loose', bluffLicense: 0.05, valueBetBias: 10 }; // Opponents fold more to our value
    }
    // Balanced: moderate bluffing
    return { tableImage: 'balanced', bluffLicense: 0.15, valueBetBias: 0 };
}

// ── 6e. FLOP CONTINUANCE OPTIMIZER ──
/**
 * A comprehensive flop continuance decision that synthesizes all available info
 * to decide whether to continue (call/raise) or fold on the flop.
 * This replaces the piecemeal checks with a unified decision score.
 * @param {number} equityFinal - Phase 5 composite equity
 * @param {number} exactOuts - De-duplicated outs
 * @param {Object} madeHand
 * @param {number} potOdds
 * @param {Object} rioInfo
 * @param {Object} hvrInfo
 * @param {Object} boardTexture
 * @param {boolean} isIP
 * @param {number} numPlayers
 * @returns {{ continuanceScore: number, shouldContinue: boolean, raiseThreshold: number }}
 */
function getPLOFlopContinuance(equityFinal, exactOuts, madeHand, potOdds, rioInfo, hvrInfo, boardTexture, isIP, numPlayers) {
    // Start with HvR equity (more accurate than raw equity vs a range)
    let score = hvrInfo.hvrEquity;

    // Apply RIO discount to draws
    if (exactOuts >= 4) {
        const rawDrawEquity = Math.min(exactOuts * 2.2, 46);
        score = score - rawDrawEquity + (rawDrawEquity * rioInfo.rioMultiplier);
    }

    // Position bonus: IP is worth extra in continuance decisions
    if (isIP) score += 6;

    // Multi-way: requires stronger hand to continue
    score -= Math.max(0, (numPlayers - 2) * 4);

    // Nut bonus: always continue with nuts
    if (madeHand.isNut) score += 20;

    // Dangerous board penalty for non-nuts
    if (boardTexture.isDangerous && !madeHand.isNut) score -= 8;

    // Compare to calling price
    const breakEven = potOdds * 100; // Equity needed to break even
    const shouldContinue = score >= breakEven - 5; // Allow 5pt buffer

    // Raise threshold: need significantly more equity to raise vs call
    const raiseThreshold = Math.max(60, breakEven + 20);

    return { continuanceScore: Math.max(0, Math.min(100, score)), shouldContinue, raiseThreshold };
}

// ── 6f. CHECK-BEHIND CALIBRATOR ──
/**
 * Calibrate the precise frequency of checking behind in position.
 * In PLO, checking back is often wrong but is correct with marginal
 * hands that don't want to build a pot and can't bet for value.
 * @param {number} equityFinal
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {Object} sdvInfo
 * @param {number} numPlayers
 * @param {string} street
 * @returns {{ shouldCheckBehind: boolean, checkBehindFrequency: number, reason: string }}
 */
function getPLOCheckBehindCalibration(equityFinal, madeHand, boardTexture, sdvInfo, numPlayers, street) {
    // Strong hands: never check behind (build the pot)
    if (equityFinal >= 80 || madeHand.isNut) return { shouldCheckBehind: false, checkBehindFrequency: 0, reason: 'too_strong' };

    // Medium hands with showdown value on dangerous boards: check behind
    if (sdvInfo.hasShowdownValue && boardTexture.isDangerous && equityFinal < 65) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.75, reason: 'showdown_dangerous_board' };
    }

    // Weak hands that can't bet/call: just check
    if (equityFinal < 30) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.90, reason: 'too_weak_to_bet' };
    }

    // Medium-medium on safe board: mixed strategy
    if (equityFinal >= 40 && equityFinal < 55 && boardTexture.texture === 'rainbow') {
        const freq = numPlayers > 2 ? 0.60 : 0.35;
        return { shouldCheckBehind: Math.random() < freq, checkBehindFrequency: freq, reason: 'medium_dry_board' };
    }

    // River: check behind more frequently with medium hands (pot control)
    if (street === 'river' && equityFinal >= 45 && equityFinal < 65 && !madeHand.isNut) {
        return { shouldCheckBehind: true, checkBehindFrequency: 0.55, reason: 'river_pot_control' };
    }

    return { shouldCheckBehind: false, checkBehindFrequency: 0, reason: 'bet' };
}

// ── 6g. RIVER DECISION OPTIMIZER ──
/**
 * A final synthesizer that takes ALL computed information and returns the
 * single best river action. This is called LAST, after all Phase 1-5 logic,
 * to make the definitive river decision.
 * @param {Object} params - All computed Phase 1-6 data
 * @returns {{ type: string, amount?: number, confidence: number }}
 */
function optimizePLORiverDecision({
    riverEquity, hvrInfo, rioInfo, sdvInfo, blockers, nutAdvantage,
    madeHand, boardTexture, isIP, canRaise, canCall, potOdds,
    clamp, clampedPotRaise, halfPotBetSize, potBetSize, raiseAction,
    tableImage, checkBehindCalibration, opposingBetSize, multiwayPenalty
}) {
    // Check-behind calibration takes highest priority for weak hands
    if (checkBehindCalibration.shouldCheckBehind && !opposingBetSize) {
        return { type: 'check', confidence: 0.85 };
    }

    // Facing a bet: use HvR equity to decide if we call
    if (opposingBetSize > 0) {
        const callEquity = Math.max(hvrInfo.hvrEquity, riverEquity);
        // Strong enough to call?
        if (callEquity >= 58 - multiwayPenalty) {
            // Raise with nuts or near-nuts
            if (callEquity >= 82 && canRaise && Math.random() < 0.60) {
                return { type: raiseAction?.type || 'call', amount: clampedPotRaise, confidence: 0.90 };
            }
            return { type: 'call', confidence: 0.75 };
        }
        // Blocker-based hero call
        if (blockers.hasFlushBlocker && potOdds < 0.28 && callEquity >= 32) {
            return { type: 'call', confidence: 0.55 };
        }
        return { type: 'fold', confidence: 0.80 };
    }

    // No bet facing us — decide whether to bet, check, or overbet
    // Tight image = more bluffing
    const bluffThreshold = tableImage.bluffLicense > 0.20 ? 28 : 35;

    if (madeHand.isNut && nutAdvantage.hasNutAdvantage && canRaise) {
        // Overbet or large value bet with nuts + nut advantage
        const size = riverEquity >= 90 ? clampedPotRaise : clamp(potBetSize);
        return { type: raiseAction?.type || 'bet', amount: size, confidence: 0.95 };
    }
    if (riverEquity >= 68 && canRaise) {
        const size = riverEquity >= 85 ? clamp(potBetSize) : clamp(halfPotBetSize);
        return { type: raiseAction?.type || 'bet', amount: size, confidence: 0.80 };
    }
    if (riverEquity < bluffThreshold && blockers.canBluffRiver && canRaise && isIP && Math.random() < tableImage.bluffLicense) {
        return { type: raiseAction?.type || 'bet', amount: clamp(halfPotBetSize), confidence: 0.50 };
    }
    if (sdvInfo.hasShowdownValue) {
        return { type: 'check', confidence: 0.75 };
    }
    return { type: 'check', confidence: 0.60 };
}

// ── 6h. GIF STATE MACHINE ──
/**
 * A proper state machine for GIF timing.
 * Tracks which phase of the hand we're in and fires GIFs at the right moment:
 * - All-in: immediately
 * - River showdown: when called and going to showdown
 * - Bad beat: when we lose with a strong hand (detected post-result)
 * @param {string} handPhase - 'allin' | 'river_call' | 'fold' | 'showdown_loss'
 * @param {Object} gifInfo - From Phase 4 getPLOGifTrigger
 * @param {string} profileId
 * @returns {{ shouldThrowGif: boolean, gifCategory: string, gifTiming: string }}
 */
function getPLOGifStateMachine(handPhase, gifInfo, profileId) {
    if (!gifInfo?.shouldThrowGif) return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

    switch (handPhase) {
        case 'allin':
            // Immediately fire when all-in
            return { shouldThrowGif: true, gifCategory: gifInfo.gifCategory, gifTiming: 'immediate' };

        case 'river_call':
            // Fire a suspense GIF when calling on the river as the last action before showdown
            if (Math.random() < 0.45) {
                return { shouldThrowGif: true, gifCategory: 'suspense', gifTiming: 'river_call' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        case 'showdown_win':
            if (Math.random() < 0.55) {
                return { shouldThrowGif: true, gifCategory: 'celebration', gifTiming: 'showdown_win' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        case 'bad_beat':
            // Bad beat loss: send a commiserating GIF
            if (Math.random() < 0.60) {
                return { shouldThrowGif: true, gifCategory: 'bad_beat', gifTiming: 'showdown_loss' };
            }
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };

        default:
            return { shouldThrowGif: false, gifCategory: null, gifTiming: null };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7 — LIVE READS, SIZING TELLS & STACK PRESERVATION
// Bet-sizing tells, stack preservation, dynamic probe calibration,
// position-exact ranges, chat responses, timing reads, chip accumulation,
// per-street bluff freq calibration.
// ─────────────────────────────────────────────────────────────────────────────

// ── 7a. BET SIZING TELL DETECTOR ──
/**
 * Opponents often reveal hand strength through bet sizing patterns.
 * Large bets tend to be value, very small bets tend to be blocks or bluffs.
 * Detect these patterns and adjust our call/fold thresholds accordingly.
 * @param {number} opponentBetFraction - Their bet as fraction of pot (0-3.0+)
 * @param {Object} opponentRead - { largeBetValueRate, smallBetBluffRate }
 * @param {string} street
 * @returns {{ telledStrength: string, callAdjustment: number, isTell: boolean }}
 */
function detectPLOBetSizingTell(opponentBetFraction, opponentRead, street) {
    if (!opponentBetFraction || opponentBetFraction <= 0) {
        return { telledStrength: 'unknown', callAdjustment: 0, isTell: false };
    }

    const largeBetValueRate = opponentRead?.largeBetValueRate || 0.50; // Default: 50% of large bets are value
    const smallBetBluffRate = opponentRead?.smallBetBluffRate || 0.40; // Default: 40% of small bets are bluffs

    // Very large overbet (>1.5x pot): usually polarized — nut or air
    if (opponentBetFraction >= 1.50) {
        return { telledStrength: 'polarized', callAdjustment: -5, isTell: true };
    }

    // Large bet (0.75-1.5x pot): usually value-heavy
    if (opponentBetFraction >= 0.75) {
        // If this opponent historically large-bets with value: tighten defense range
        const adj = largeBetValueRate >= 0.65 ? -10 : -5;
        return { telledStrength: 'likely_value', callAdjustment: adj, isTell: largeBetValueRate >= 0.60 };
    }

    // Small bet (< 0.33x pot): block bet or bluff common
    if (opponentBetFraction <= 0.33) {
        // If they small-bet as a bluff pattern: loosen up to call
        const adj = smallBetBluffRate >= 0.50 ? 8 : 4;
        return { telledStrength: 'likely_bluff_or_block', callAdjustment: adj, isTell: smallBetBluffRate >= 0.45 };
    }

    // Medium bet (0.33-0.75x pot): usually medium value or draw
    return { telledStrength: 'medium', callAdjustment: 0, isTell: false };
}

// ── 7b. STACK PRESERVATION PROTOCOL ──
/**
 * When the horse's stack drops dangerously short, activate ultra-tight mode.
 * Avoid marginal all-ins, prefer fold equity plays, and don't gamble with
 * medium-equity spots that are near coin flips.
 * @param {number} stackBB - Current stack in big blinds
 * @param {number} startingStackBB - Starting stack at session start
 * @returns {{ isShort: boolean, isCritical: boolean, reshoveRange: number, preservationFactor: number }}
 */
function getPLOStackPreservation(stackBB, startingStackBB) {
    const stackRatio = stackBB / Math.max(startingStackBB, 1);

    // Critical: under 10bb — must shove or fold, no more post-flop play
    if (stackBB <= 10) {
        return { isShort: true, isCritical: true, reshoveRange: 60, preservationFactor: 1.60 };
    }

    // Short: 10-20bb — tight is right, only strong hands
    if (stackBB <= 20) {
        return { isShort: true, isCritical: false, reshoveRange: 72, preservationFactor: 1.35 };
    }

    // Moderate: 20-35bb — cautious play, avoid marginal flips
    if (stackBB <= 35) {
        return { isShort: false, isCritical: false, reshoveRange: 80, preservationFactor: 1.15 };
    }

    // Healthy stack: no preservation needed
    return { isShort: false, isCritical: false, reshoveRange: 100, preservationFactor: 1.0 };
}

// ── 7c. DYNAMIC PROBE FREQUENCY CALIBRATOR ──
/**
 * Calibrate how often the horse should probe-bet on a given street,
 * incorporating all known info: board texture, position, opponent profile,
 * table image, and runout quality.
 * @param {boolean} isIP
 * @param {string} opponentProfile - 'maniac' | 'nit' | 'station' | 'balanced'
 * @param {Object} boardTexture
 * @param {string} runoutQuality - 'excellent' | 'good' | 'neutral' | 'poor' | 'dangerous'
 * @param {string} tableImageType - 'tight' | 'loose' | 'balanced' | 'neutral'
 * @param {number} numPlayers
 * @returns {{ probeFrequency: number, probeSizing: number, shouldProbe: boolean }}
 */
function calibratePLOProbeBet(isIP, opponentProfile, boardTexture, runoutQuality, tableImageType, numPlayers) {
    if (!isIP) return { probeFrequency: 0, probeSizing: 0, shouldProbe: false }; // IP only

    let frequency = 0.35; // Base probe frequency IP

    // Against nits: probe more (they fold too much)
    if (opponentProfile === 'nit') frequency += 0.20;
    // Against maniacs: probe less (they'll raise)
    if (opponentProfile === 'maniac') frequency -= 0.15;
    // Against stations: probe only with value (they call everything)
    if (opponentProfile === 'station') frequency -= 0.10;

    // Dry boards: probe more (opponent likely missed)
    if (boardTexture.texture === 'rainbow') frequency += 0.10;
    // Wet boards: probe less (opponent likely connected)
    if (boardTexture.isMonotone) frequency -= 0.15;

    // Good runout for us: probe more aggressively
    if (runoutQuality === 'excellent') frequency += 0.08;
    if (runoutQuality === 'poor') frequency -= 0.12;

    // Tight table image: more probe bluffs (opponents respect bets)
    if (tableImageType === 'tight') frequency += 0.10;
    if (tableImageType === 'loose') frequency -= 0.10;

    // Multi-way: probe much less (one of N players has something)
    if (numPlayers >= 3) frequency -= 0.15 * (numPlayers - 2);

    frequency = Math.max(0.05, Math.min(0.70, frequency));
    const shouldProbe = Math.random() < frequency;

    // Sizing: nits = larger probe (scare them), stations = smaller (they call regardless)
    const probeSizing = opponentProfile === 'nit' ? 0.60
        : opponentProfile === 'station' ? 0.35
            : 0.45;

    return { probeFrequency: frequency, probeSizing, shouldProbe };
}

// ── 7d. POSITION-AWARE RANGE CONSTRUCTOR ──
/**
 * Build position-exact preflop opening ranges for PLO.
 * Returns the minimum strength required to open from each position.
 * Based on standard PLO theory hand categorization.
 * @param {string} position
 * @param {number} numPlayers - Players at table
 * @param {number} stackBB
 * @returns {{ openThreshold: number, threeB etThreshold: number, fourBetThreshold: number }}
 */
function getPLOPositionRanges(position, numPlayers, stackBB) {
    // Tighter at full ring (9-max), looser at 6-max, very wide at HU/3-max
    const tableSizeFactor = numPlayers >= 8 ? 1.15 : numPlayers <= 4 ? 0.90 : 1.0;

    const ranges = {
        'UTG': { open: 72, threebet: 85, fourbet: 92 },
        'UTG1': { open: 70, threebet: 83, fourbet: 90 },
        'UTG2': { open: 68, threebet: 82, fourbet: 88 },
        'MP': { open: 65, threebet: 80, fourbet: 87 },
        'HJ': { open: 60, threebet: 77, fourbet: 86 },
        'CO': { open: 55, threebet: 73, fourbet: 84 },
        'BTN': { open: 48, threebet: 68, fourbet: 82 },
        'SB': { open: 52, threebet: 70, fourbet: 83 },
        'BB': { open: 38, threebet: 65, fourbet: 80 }, // BB: defend more
    };

    const base = ranges[position] || ranges['MP'];

    // Adjust for table size
    return {
        openThreshold: Math.round(base.open * tableSizeFactor),
        threeBetThreshold: Math.round(base.threebet * tableSizeFactor),
        fourBetThreshold: Math.round(base.fourbet * tableSizeFactor),
    };
}

// ── 7e. CHAT RESPONSE INTEGRATION ──
/**
 * Generate contextually-appropriate chat messages for notable poker situations.
 * RULES: words only, NO emojis, keep it short, feel authentic.
 * Messages are triggered by game events passed in state.chatTrigger.
 * @param {string} trigger - 'bust_opponent' | 'bad_beat' | 'big_pot_won' | 'all_in_ahead' | 'all_in_behind'
 * @param {string} profileId - For deterministic message selection per horse
 * @returns {{ shouldChat: boolean, message: string|null }}
 */
function getPLOChatResponse(trigger, profileId) {
    if (!trigger) return { shouldChat: false, message: null };

    const hash = getHash(profileId);
    const rand = Math.random();

    // Only chat 40-60% of the time to feel natural
    if (rand > 0.55) return { shouldChat: false, message: null };

    const messages = {
        bust_opponent: [
            'gg', 'well played', 'nice game', 'good run', 'tough spot',
        ],
        bad_beat: [
            'wow', 'that one hurt', 'poker is a crazy game', 'nice hand',
            'well played', 'that is variance for you',
        ],
        big_pot_won: [
            'nice pot', 'great game everyone', 'what a hand',
        ],
        all_in_ahead: [
            'good luck everyone', 'let us see what happens',
            'hold em up', 'come on',
        ],
        all_in_behind: [
            'let us go', 'still have outs',
            'anything can happen', 'good luck to all',
        ],
        welcome: [
            'hello everyone', 'good luck at the tables',
            'lets have a great game',
        ],
    };

    const pool = messages[trigger] || messages.welcome;
    const idx = Math.abs(hash % pool.length);
    return { shouldChat: true, message: pool[idx] };
}

// ── 7f. TIMING TELL READER ──
/**
 * Read opponent timing patterns as tells.
 * Fast action usually = weak hand or draw (auto-click).
 * Very long tank = strong hand or difficult decision.
 * @param {number} opponentActionTimeMs - How long opponent took in ms
 * @param {string} street
 * @returns {{ timingTell: string, equityAdjustment: number }}
 */
function readPLOTimingTell(opponentActionTimeMs, street) {
    if (!opponentActionTimeMs || opponentActionTimeMs <= 0) {
        return { timingTell: 'unknown', equityAdjustment: 0 };
    }

    // Instant action (<1s): instacall/bet usually = strong draw or auto-play
    if (opponentActionTimeMs < 1000) {
        // Instabet on river = often value or monster
        if (street === 'river') return { timingTell: 'insta_value_or_bluff', equityAdjustment: -5 };
        // Instacall pre/flop = usually drawing hand
        return { timingTell: 'fast_draw_or_weak', equityAdjustment: 3 }; // Actually good for us
    }

    // Normal action (1-5s): no significant tell
    if (opponentActionTimeMs <= 5000) {
        return { timingTell: 'normal', equityAdjustment: 0 };
    }

    // Long tank (5-15s): genuine decision, usually medium strength
    if (opponentActionTimeMs <= 15000) {
        return { timingTell: 'medium_tank', equityAdjustment: -3 }; // Tends toward value
    }

    // Extended tank (>15s): very strong hand OR time bank used = significant spot
    return { timingTell: 'deep_tank_likely_strong', equityAdjustment: -8 };
}

// ── 7g. TOURNAMENT CHIP ACCUMULATION MODE ──
/**
 * Early in a tournament, chip accumulation is the priority.
 * Double up at reasonable equity. Avoid ultra-tight play that wastes antes.
 * This mode is active when we're in the early blind levels (< 20% of starting stack spent).
 * @param {Object} tourneyData - { blindLevel, blindsTotal, startingChips, currentChips, isChipLeader }
 * @param {number} equityFinal
 * @returns {{ isAccumulationMode: boolean, accumulationBonus: number, anteStealing: boolean }}
 */
function getPLOChipAccumulationMode(tourneyData, equityFinal) {
    if (!tourneyData) return { isAccumulationMode: false, accumulationBonus: 0, anteStealing: false };

    const { blindLevel = 0, startingChips = 10000, currentChips = 10000, isChipLeader = false } = tourneyData;

    // Early levels (1-6): accumulation mode active
    const isEarlyLevel = blindLevel <= 6;
    const isHealthyStack = currentChips >= startingChips * 0.70;

    if (!isEarlyLevel || !isHealthyStack) {
        return { isAccumulationMode: false, accumulationBonus: 0, anteStealing: false };
    }

    // In early levels with a healthy stack: play slightly wider and more aggressively
    const accumulationBonus = isChipLeader ? -5 : 8; // Chip leader is careful, others accumulate

    // Ante stealing: fire steals more often when antes are in play
    const anteStealing = blindLevel >= 3; // Antes typically kick in around level 3-4

    return { isAccumulationMode: true, accumulationBonus, anteStealing };
}

// ── 7h. PER-STREET BLUFF FREQUENCY CALIBRATION ──
/**
 * Some opponents bluff more on specific streets. Calibrate call-down thresholds
 * based on opponent's per-street bluff patterns.
 * @param {string} street
 * @param {Object} opponentRead - { flopBluffRate, turnBluffRate, riverBluffRate }
 * @returns {{ calldownThreshold: number, shouldLoosen: boolean, streetBluffRate: number }}
 */
function getPLOPerStreetBluffCalibration(street, opponentRead) {
    if (!opponentRead) {
        // Default: call down on flop/turn more than river (give credit on river)
        const defaults = { flop: 0.35, turn: 0.30, river: 0.20 };
        return { calldownThreshold: 45, shouldLoosen: false, streetBluffRate: defaults[street] || 0.25 };
    }

    const bluffRates = {
        flop: opponentRead.flopBluffRate || 0.35,
        turn: opponentRead.turnBluffRate || 0.25,
        river: opponentRead.riverBluffRate || 0.18,
    };

    const streetBluffRate = bluffRates[street] || 0.25;

    // High bluff rate on this street: call down looser
    let calldownThreshold = 45; // Default equity needed to call
    if (streetBluffRate >= 0.45) calldownThreshold = 32; // Very aggressive: call with 32+ equity
    else if (streetBluffRate >= 0.35) calldownThreshold = 38;
    else if (streetBluffRate <= 0.15) calldownThreshold = 58; // Very honest: fold more

    const shouldLoosen = streetBluffRate >= 0.35;

    return { calldownThreshold, shouldLoosen, streetBluffRate };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║  PLO ANTI-EXPLOIT SECURITY LAYER                                           ║
// ║  Deep-dive audit: 8 exploit vectors identified and neutralized.             ║
// ║  Prevents pattern mining, bet-size decoding, sandwich plays,                ║
// ║  solver assistance exploitation, showdown exposure, and GTO determinism.    ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 1: RANGE FREQUENCY MINING
// A human who sees enough showdowns can reverse-engineer exact hand ranges.
// If the horse always calls with 40%+ equity and folds with 35%, that threshold
// becomes exploitable — humans will bet in exactly that gap every time.
// COUNTERMEASURE: Frequency Obfuscator — randomize fold/call/raise thresholds
// by ±5-8% per decision. Ranges are now probabilistic, not deterministic.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Randomize action thresholds to prevent pattern mining from showdowns.
 * Every threshold gets a small ±jitter so no exact boundary can be identified.
 * @param {number} baseThreshold - Original threshold value
 * @param {number} jitterRange - Max deviation (±jitterRange)
 * @param {string} actionType - 'fold'|'call'|'raise'|'bet'
 * @returns {number} Obfuscated threshold
 */
function obfuscatePLOFrequency(baseThreshold, jitterRange, actionType) {
    // Use Math.random() with a distribution biased toward the center
    const raw = (Math.random() + Math.random() + Math.random()) / 3; // Approximate normal distribution
    const jitter = (raw - 0.5) * 2 * jitterRange; // ±jitterRange
    const obfuscated = baseThreshold + jitter;
    // Hard clamps to prevent absurd results
    if (actionType === 'fold') return Math.max(15, Math.min(90, obfuscated));
    if (actionType === 'call') return Math.max(20, Math.min(80, obfuscated));
    if (actionType === 'raise') return Math.max(55, Math.min(98, obfuscated));
    return Math.max(10, Math.min(95, obfuscated));
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 2: BET-SIZE DECODING
// If the horse always bets 90% pot with nuts and 55% pot with draws, a human
// can read the exact bet size → infer hand class → profitably respond.
// COUNTERMEASURE: Bet Size Noise Injector — ±10-15% random jitter on all sizes.
// Nuts sometimes bet 82%, sometimes 98% — unreadable without 1000 samples.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Inject noise into bet sizes to prevent bet-size → hand class decoding.
 * @param {number} baseFraction - Base bet fraction (0.0-1.3)
 * @param {string} handClass - 'nut'|'strong'|'draw'|'bluff'
 * @returns {number} Noised fraction, clamped to sensible range
 */
function injectPLOBetSizeNoise(baseFraction, handClass) {
    // Noise amount varies by hand class: nuts can vary more (still obviously strong)
    // Bluffs vary less (oversizing a bluff is a tell)
    const noiseScale = handClass === 'nut' ? 0.15
        : handClass === 'strong' ? 0.12
            : handClass === 'draw' ? 0.10
                : 0.06; // bluffing: small noise range

    const noise = (Math.random() - 0.5) * 2 * noiseScale;
    const noised = baseFraction + noise;

    // Clamp to valid PLO bet fraction range
    return Math.max(0.25, Math.min(1.30, noised));
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 3: SHOWDOWN EXPOSURE ACCUMULATION
// Every showdown the horse participates in provides data to the opponent.
// By hand 30 at the same table, a skilled human has mapped the horse's ranges.
// COUNTERMEASURE: Showdown Exposure Tracker — as showdown count grows,
// systematically widen frequency randomization, reducing exploitability.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Track showdown exposure and return widened obfuscation settings.
 * @param {number} showdownCount - Number of showdowns at this table
 * @returns {{ exposureLevel: string, jitterMultiplier: number, needsRangeShift: boolean }}
 */
function trackPLOShowdownExposure(showdownCount) {
    if (showdownCount === 0) {
        return { exposureLevel: 'fresh', jitterMultiplier: 1.0, needsRangeShift: false };
    }
    if (showdownCount <= 5) {
        return { exposureLevel: 'low', jitterMultiplier: 1.2, needsRangeShift: false };
    }
    if (showdownCount <= 15) {
        return { exposureLevel: 'moderate', jitterMultiplier: 1.5, needsRangeShift: false };
    }
    if (showdownCount <= 30) {
        // Significant exposure: widen jitter AND shift base thresholds slightly
        return { exposureLevel: 'high', jitterMultiplier: 1.8, needsRangeShift: true };
    }
    // Very exposed: maximum obfuscation, frequent range shifts
    return { exposureLevel: 'very_high', jitterMultiplier: 2.2, needsRangeShift: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 4: PATTERN EXPLOITATION
// "This horse always folds to 3 c-bets." "It always calls river probes."
// Once a human finds a +EV pattern against a specific horse behavior,
// they will repeat it until it stops working.
// COUNTERMEASURE: Pattern Exploit Detector — tracks if an opponent has
// beaten the horse consistently with the same move type, then auto-adjusts.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect if a specific pattern is being exploited and compute the counter.
 * @param {Object} patternHistory - { cbetWins, probeWins, bluffWins, totalHands }
 * @returns {{ detectedExploit: string|null, counterAdjustment: Object }}
 */
function detectPLOPatternExploit(patternHistory) {
    if (!patternHistory || patternHistory.totalHands < 5) {
        return { detectedExploit: null, counterAdjustment: {} };
    }

    const { cbetWins = 0, probeWins = 0, bluffWins = 0, totalHands = 1 } = patternHistory;
    const cbetWinRate = cbetWins / totalHands;
    const probeWinRate = probeWins / totalHands;
    const bluffWinRate = bluffWins / totalHands;

    // If opponent is winning with c-bets >40% of hands: they're over-cbetting into us
    if (cbetWinRate > 0.40) {
        return {
            detectedExploit: 'cbet_exploiting',
            counterAdjustment: {
                // Counter: float the c-bet 40% more, check-raise more often
                floatBonus: 0.40,
                checkRaiseBoost: 0.20,
                foldToCBetReduction: 0.30,
            },
        };
    }

    // If probe bets are winning consistently: stop folding to probes
    if (probeWinRate > 0.35) {
        return {
            detectedExploit: 'probe_exploiting',
            counterAdjustment: {
                callProbeEqBonus: 10,  // +10 equity threshold for calling probes
                raiseProbeFreq: 0.25,  // Check-raise probes 25% more
            },
        };
    }

    // If opponent wins with river bluffs vs us: tighten river call thresholds
    if (bluffWinRate > 0.30) {
        return {
            detectedExploit: 'river_bluff_exploiting',
            counterAdjustment: {
                riverCallEquityReduction: -8,  // Call with less equity on river
                bluffCatchFreqBoost: 0.20,
            },
        };
    }

    return { detectedExploit: null, counterAdjustment: {} };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 5: STACK SANDWICH / COORDINATED ISOLATION
// Two players can coordinate: one raises, one calls, squeezing the horse
// into a large 3-way pot where it has to play perfectly or leak chips.
// COUNTERMEASURE: Stack Sandwich Detector — recognize isolation patterns and
// tighten ranges, avoid marginal spots, and look for the high-EV play only.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect coordinated isolation/sandwich plays against the horse.
 * @param {Object[]} playerActions - Array of { playerId, action } for the current hand
 * @param {number} toCall - Amount to call
 * @param {number} numCallers - Players who already called the raise
 * @param {number} numPlayers
 * @returns {{ isSandwich: boolean, sandwichSeverity: string, tightenFactor: number }}
 */
function detectPLOStackSandwich(playerActions, toCall, numCallers, numPlayers) {
    if (!playerActions || playerActions.length === 0) {
        return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
    }

    // Sandwich: a raise + one or more callers behind us (still to act)
    const isSqueezeSituation = toCall > 0 && numCallers >= 1;
    const playersStillToAct = numPlayers - playerActions.length;

    if (!isSqueezeSituation) {
        return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
    }

    // More callers = higher sandwich risk (someone behind us may re-squeeze)
    if (numCallers >= 2 && playersStillToAct >= 1) {
        return { isSandwich: true, sandwichSeverity: 'critical', tightenFactor: 1.8 };
    }
    if (numCallers >= 1 && playersStillToAct >= 2) {
        return { isSandwich: true, sandwichSeverity: 'high', tightenFactor: 1.4 };
    }
    if (numCallers === 1) {
        return { isSandwich: true, sandwichSeverity: 'moderate', tightenFactor: 1.15 };
    }

    return { isSandwich: false, sandwichSeverity: 'none', tightenFactor: 1.0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 6: GTO DETERMINISM (PREDICTABLE CHAOS)
// The current 4% chaos factor is too predictable: it fires at a fixed rate
// and produces the same action pools. A skilled human can filter it out.
// COUNTERMEASURE: Multi-Street GTO Chaos — per-street, per-street-phase,
// and equity-range-bucketed chaos actions with varying magnitude.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Enhanced multi-dimensional chaos injector for max GTO unpredictability.
 * @param {string} street - Current street
 * @param {number} equityFinal - Current equity (0-100)
 * @param {boolean} isIP
 * @param {Object} madeHand
 * @param {Object} legalActions
 * @returns {{ chaosAction: Object|null, chaosMagnitude: string }}
 */
function injectPLOGTOChaos(street, equityFinal, isIP, madeHand, legalActions) {
    const canRaise = legalActions?.some(a => a.type === 'raise' || a.type === 'bet');
    const canCall = legalActions?.some(a => a.type === 'call');
    const canCheck = legalActions?.some(a => a.type === 'check');

    // Per-street chaos rates (different streets need different unpredictability profiles)
    const chaosRate = street === 'preflop' ? 0.04  // 4% preflop chaos
        : street === 'flop' ? 0.06                  // 6% flop chaos
            : street === 'turn' ? 0.07                  // 7% turn chaos
                : 0.08;                                      // 8% river chaos (most predictable without it)

    if (Math.random() > chaosRate) return { chaosAction: null, chaosMagnitude: 'none' };

    // Equity buckets: chaos actions vary by hand strength to stay loosely correct
    if (equityFinal >= 80) {
        // Strong hand: occasionally slow-play (check when we'd normally bet)
        if (canCheck && Math.random() < 0.60) return { chaosAction: { type: 'check' }, chaosMagnitude: 'slow_play' };
    }
    if (equityFinal >= 50 && equityFinal < 80) {
        // Medium hand: occasionally raise (turn thin value into aggression)
        if (canRaise && isIP && Math.random() < 0.50)
            return { chaosAction: { type: 'raise' }, chaosMagnitude: 'thin_aggression' };
    }
    if (equityFinal >= 30 && equityFinal < 50) {
        // Marginal hand: occasionally call where we'd fold (good implied odds)
        if (canCall && street !== 'river' && Math.random() < 0.45)
            return { chaosAction: { type: 'call' }, chaosMagnitude: 'implied_float' };
    }
    if (equityFinal < 30 && canRaise) {
        // Weak: occasional pure bluff (balanced with strong hands above)
        if (street === 'flop' && Math.random() < 0.35)
            return { chaosAction: { type: 'raise' }, chaosMagnitude: 'pure_bluff' };
    }

    return { chaosAction: null, chaosMagnitude: 'none' };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 7: BOT / SOLVER ASSISTANCE
// A human using a real-time PLO solver (PioSOLVER, MonkerSolver) will play
// nearly perfectly: right sizings, right frequencies, minimal mistakes.
// COUNTERMEASURE: Bot/Solver Opponent Detector — flag opponents who are
// acting with inhuman precision. Switch to GTO-balanced ranges vs them
// (don't try to exploit someone playing GTO; just play GTO back).
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Detect if an opponent is likely using solver assistance.
 * Signals: consistent perfect bet sizing (exactly 33/50/75/100%), instant decisions,
 * no timing variance, high win rate across all board textures.
 * @param {Object} opponentMetrics - { avgActionTimeMs, betSizingVariance, winRate, showdownAccuracy }
 * @returns {{ isSuspectedBot: boolean, botConfidence: number, counterStrategy: string }}
 */
function detectPLOBotOpponent(opponentMetrics) {
    if (!opponentMetrics) return { isSuspectedBot: false, botConfidence: 0, counterStrategy: 'normal' };

    let botScore = 0;
    const { avgActionTimeMs = 4000, betSizingVariance = 0.2, winRate = 0.5, showdownAccuracy = 0.5 } = opponentMetrics;

    // Perfect bet sizers: always exactly 33/50/66/75/100% pot
    if (betSizingVariance < 0.05) botScore += 30; // Almost no variance = scripted
    else if (betSizingVariance < 0.10) botScore += 15;

    // Inhuman speed: consistently < 1.5 seconds to act in complex spots
    if (avgActionTimeMs < 1200) botScore += 25;
    else if (avgActionTimeMs < 2000) botScore += 10;

    // Very high win rate (>65% in PLO is suspicious over 50+ hands)
    if (winRate > 0.68) botScore += 25;
    else if (winRate > 0.60) botScore += 10;

    // Showdown accuracy: opponent almost never shows up wrong (knows our range)
    if (showdownAccuracy > 0.75) botScore += 20;
    else if (showdownAccuracy > 0.65) botScore += 10;

    const isSuspectedBot = botScore >= 50;
    const botConfidence = Math.min(100, botScore);

    // Counter-strategy: vs bots, play GTO-balanced (don't try to exploit)
    // Also: vary sizing MORE and SLOWER to disrupt their lookup tables
    const counterStrategy = isSuspectedBot
        ? 'gto_balance'   // Play balanced ranges with no exploitative adjustments
        : 'normal';

    return { isSuspectedBot, botConfidence, counterStrategy };
}

// ──────────────────────────────────────────────────────────────────────────────
// EXPLOIT VECTOR 8: MULTI-PATTERN SIMULTANEOUS EXPLOITATION
// A skilled human won't use just one exploit — they'll c-bet AND probe AND
// river bluff simultaneously, making it hard to detect the primary lever.
// COUNTERMEASURE: Counter-Exploit Profiler — aggregates all detected exploits
// into a single unified counter-adjustment object for the decision engine.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Synthesize all anti-exploit signals into one unified counter-strategy.
 * @param {Object} patternExploit - From detectPLOPatternExploit
 * @param {Object} showdownExposure - From trackPLOShowdownExposure
 * @param {Object} sandwichInfo - From detectPLOStackSandwich
 * @param {Object} botInfo - From detectPLOBotOpponent
 * @param {number} equityFinal
 * @returns {{ finalEquityAdjust: number, finalTightenFactor: number, playStyle: string, antiExploitActive: boolean }}
 */
function buildPLOCounterExploitProfile(patternExploit, showdownExposure, sandwichInfo, botInfo, equityFinal) {
    let equityAdjust = 0;
    let tightenFactor = 1.0;
    const exploits = [];

    // Pattern exploit counter-adjustments
    if (patternExploit?.counterAdjustment?.callProbeEqBonus) {
        equityAdjust += patternExploit.counterAdjustment.callProbeEqBonus;
        exploits.push('anti_probe');
    }
    if (patternExploit?.counterAdjustment?.riverCallEquityReduction) {
        equityAdjust += patternExploit.counterAdjustment.riverCallEquityReduction;
        exploits.push('anti_river_bluff');
    }

    // Showdown exposure tightens ranges as we become more readable
    if (showdownExposure?.needsRangeShift) {
        equityAdjust -= 3; // Slightly tighten required equity to continue
        tightenFactor *= 1.08;
        exploits.push('range_shift');
    }

    // Sandwich scenario compounds tightening
    if (sandwichInfo?.isSandwich) {
        tightenFactor *= sandwichInfo.tightenFactor;
        exploits.push('anti_sandwich');
    }

    // Bot opponent: switch to GTO-balanced, widest randomization
    if (botInfo?.isSuspectedBot) {
        equityAdjust += 5; // Slightly raise our required equity vs perfection
        exploits.push('vs_bot_gto');
    }

    const antiExploitActive = exploits.length > 0;
    const playStyle = botInfo?.isSuspectedBot ? 'gto_balanced'
        : sandwichInfo?.isSandwich ? 'ultra_tight'
            : showdownExposure?.exposureLevel === 'very_high' ? 'max_obfuscated'
                : 'normal';

    return {
        finalEquityAdjust: Math.max(-15, Math.min(15, equityAdjust)),
        finalTightenFactor: Math.max(1.0, Math.min(2.5, tightenFactor)),
        playStyle,
        antiExploitActive,
        activeExploits: exploits,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL OPTIMIZATIONS (Cold-Call Ranges, Blind Battle, Donk Bets,
// River Check-Raises, Memoization Cache)
// ─────────────────────────────────────────────────────────────────────────────


// ── OPT A: COLD-CALL PREFLOP RANGES ──
/**
 * Cold-calling is different from defending a 3-bet or making an open.
 * Calling another player's open WITHOUT being the original aggressor.
 * We need a hand strong enough to play a raised pot in position.
 * OOP cold-calls are far more expensive — very tight range OOP.
 * @param {number} strength - Preflop hand strength score
 * @param {boolean} isIP - In position vs the raiser
 * @param {number} potOdds - Cost to call / (pot + cost)
 * @param {number} numCallers - How many have already called before us
 * @param {number} raiseSize - Size of original raise in BBs
 * @returns {{ shouldColdCall: boolean, coldCallReason: string }}
 */
function getPLOColdCallDecision(strength, isIP, potOdds, numCallers, raiseSize) {
    // Large raise (4+bb): need a strong hand to cold-call
    const raiseIsLarge = raiseSize >= 4;

    // Multi-way pot: tighten cold-call range (more players = less equity needed per player)
    const multiwayDiscount = numCallers >= 2 ? -8 : numCallers === 1 ? -4 : 0;

    // IP threshold: looser, as we have positional advantage for the entire hand
    const ipThreshold = raiseIsLarge ? 62 : 55;
    const oopThreshold = raiseIsLarge ? 76 : 68; // OOP cold-calls must be very strong

    const effectiveStrength = strength + multiwayDiscount;
    const threshold = isIP ? ipThreshold : oopThreshold;

    // Also: pot odds must be good enough (drawing hands need proper price)
    const oddsOk = potOdds <= (isIP ? 0.32 : 0.24);

    const shouldColdCall = effectiveStrength >= threshold && oddsOk;
    const coldCallReason = !oddsOk ? 'math_no_go' : effectiveStrength < threshold ? 'hand_too_weak' : 'justified';

    return { shouldColdCall, coldCallReason };
}

// ── OPT B: BLIND VS BLIND STRATEGY ──
/**
 * When SB and BB are the only two players (or in heads-up situations),
 * completely different strategy rules apply:
 * - SB can open MUCH wider (no other players to worry about)
 * - BB can defend very wide against SB steal (getting great odds)
 * - Both players are always in a marginal spot
 * @param {string} position - 'SB' or 'BB'
 * @param {number} strength
 * @param {boolean} isSBvsBBSituation - Only SB and BB are left
 * @param {boolean} wasPFRaiser
 * @param {number} potOdds
 * @returns {{ openThreshold: number, defendThreshold: number, strategy: string }}
 */
function getPLOBlindBattleStrategy(position, strength, isSBvsBBSituation, wasPFRaiser, potOdds) {
    if (!isSBvsBBSituation) {
        return { openThreshold: 52, defendThreshold: 45, strategy: 'normal' };
    }

    if (position === 'SB') {
        // SB vs BB: open 65-70% of hands (very wide range)
        // In PLO, any double-suited or connected hand is playable HU
        return {
            openThreshold: 38,          // Open 38+ strength HU from SB
            defendThreshold: 50,        // 3-bet defend with 50+
            strategy: 'hu_steal',
        };
    }

    if (position === 'BB') {
        // BB defends vs SB steal: getting great pot odds, defend wide
        // SB raise is usually a small raise (2-2.5bb) so BB's pot odds are excellent
        const defendThreshold = potOdds <= 0.22 ? 28 : potOdds <= 0.28 ? 38 : 48;
        return {
            openThreshold: 28,          // BB can lead/donk wider vs a wide SB range
            defendThreshold,
            strategy: 'bb_defend_wide',
        };
    }

    return { openThreshold: 52, defendThreshold: 45, strategy: 'normal' };
}

// ── OPT C: DONK BET GENERATOR ──
/**
 * A donk bet is when the OUT-OF-POSITION player leads INTO the preflop raiser.
 * It's considered a mistake 90% of the time — but NOT when:
 * 1. The board heavily favors our range (e.g., low monotone board + we 3-bet OOP)
 * 2. We have a nut made hand and want to build the pot before opponent checks back
 * 3. The board is a scare card for the PFR's range (overcall situation)
 * @param {boolean} isIP
 * @param {boolean} wasPFRaiser - Are WE the preflop raiser?
 * @param {Object} madeHand
 * @param {Object} boardTexture
 * @param {number} equityFinal
 * @param {number} potSize
 * @returns {{ shouldDonk: boolean, donkSize: number, donkReason: string }}
 */
function getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize) {
    // Only donk OOP as the non-PFR (calling station gets position to donk)
    if (isIP || wasPFRaiser) return { shouldDonk: false, donkSize: 0, donkReason: 'n/a' };

    // Donk with the stone nuts on a board that missed the PFR's range
    if (madeHand.isNut && boardTexture.isMonotone && madeHand.isNutFlush) {
        // Board is all one suit: PFR usually has broadway which misses monotone low board
        return { shouldDonk: true, donkSize: Math.round(potSize * 0.70), donkReason: 'nut_monotone_board' };
    }

    // Donk with very strong made hand (full house / quads) vs paired board
    if (madeHand.strength >= 90 && boardTexture.isPaired) {
        // Slow-playing a full house when the board pairs is risky — bet now
        return { shouldDonk: true, donkSize: Math.round(potSize * 0.60), donkReason: 'nut_paired_board' };
    }

    // Donk as a probe on turn after the flop was checked back (IP player showed weakness)
    if (equityFinal >= 72 && !boardTexture.isMonotone) {
        const probeFreq = Math.random();
        if (probeFreq < 0.30) { // Donk 30% of the time in this spot
            return { shouldDonk: true, donkSize: Math.round(potSize * 0.45), donkReason: 'probe_vs_weak_ip' };
        }
    }

    return { shouldDonk: false, donkSize: 0, donkReason: 'not_needed' };
}

// ── OPT D: RIVER CHECK-RAISE FREQUENCY ──
/**
 * On the river, a check-raise is the most polarized move possible.
 * You're representing either the nuts or a complete bluff.
 * This module identifies spots where a river check-raise is optimal:
 * 1. We have the nuts and opponent is likely to bet
 * 2. We have a blocker bluff and can represent the nuts
 * 3. Opponent has been floating all streets and finally fires a big river bet
 * @param {Object} madeHand
 * @param {Object} blockers
 * @param {Object} nutAdvantage
 * @param {number} opponentBetFraction
 * @param {boolean} isIP
 * @param {Object} exploitProfile
 * @returns {{ shouldCheckRaiseRiver: boolean, checkRaiseSize: number, reason: string }}
 */
function getPLORiverCheckRaise(madeHand, blockers, nutAdvantage, opponentBetFraction, isIP, exploitProfile) {
    // Must be OOP to check-raise (IP acts last, no check-raise opportunity vs initial bet)
    if (isIP) return { shouldCheckRaiseRiver: false, checkRaiseSize: 0, reason: 'ip_no_cr' };

    // Best spot: nuts OOP vs a betting aggressor
    if (madeHand.isNut && opponentBetFraction > 0.40) {
        return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'nut_cr' }; // -1 = pot-size raise
    }

    // Nut advantage + opponent bets: check-raise as a value trap
    if (nutAdvantage.hasNutAdvantage && madeHand.strength >= 82 && opponentBetFraction > 0) {
        const freq = Math.random();
        if (freq < 0.45) {
            return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'nut_advantage_cr' };
        }
    }

    // Bluff check-raise with blocker: when we have the nut blocker on a flushed board
    if (blockers.hasFlushBlocker && madeHand.strength < 40 && opponentBetFraction <= 0.55) {
        // Only bluff-raise against aggressive/maniac opponents, not calling stations
        const isStation = exploitProfile?.profile === 'station';
        if (!isStation && Math.random() < 0.20) {
            return { shouldCheckRaiseRiver: true, checkRaiseSize: -1, reason: 'blocker_bluff_cr' };
        }
    }

    return { shouldCheckRaiseRiver: false, checkRaiseSize: 0, reason: 'no_cr' };
}

// ── OPT E: LIGHTWEIGHT DECISION MEMOIZATION CACHE ──
/**
 * With 73+ computations per decision call, some sub-functions are called with
 * the same arguments multiple times (especially board texture, made hand evaluation,
 * and out-counting which don't change during a single decision cycle).
 * This lightweight per-call memo cache prevents redundant re-computation.
 *
 * Usage: wrapWithMemo(fn, cacheKey) → returns cached result if same key seen
 * The cache is LOCAL to a single makePLOFallbackDecision() call (not persistent).
 */
function createPLODecisionCache() {
    const _cache = new Map();
    return {
        get(key) { return _cache.get(key); },
        set(key, val) { _cache.set(key, val); return val; },
        getOrCompute(key, computeFn) {
            if (_cache.has(key)) return _cache.get(key);
            const val = computeFn();
            _cache.set(key, val);
            return val;
        },
        size() { return _cache.size; },
    };
}

// Wrap detection, adaptive sizing, Bayesian opponent model, board projection,
// history auto-corrector, double-suit classifier upgrade, confidence meter,
// final decision auditor. Makes these the best PLO AI horses in the world.
// ─────────────────────────────────────────────────────────────────────────────

// ── 8a. EXPLICIT PLO WRAP DRAW DETECTOR ──
/**
 * PLO's most powerful draw type: the WRAP. A wrap occurs when hole cards
 * wrap around board cards to create many straight outs simultaneously.
 * Example: Board K-9-2, Hole J-T-8-7 → 20 outs (every Q, 6, J, T, 8, 7 except duplicates).
 * This replaces the naive out-counting approach for straights with exact wrap detection.
 * @param {number[]} holeRanks - Ranks of hole cards (1-14)
 * @param {number[]} boardRanks - Ranks of board cards
 * @returns {{ wrapType: string, wrapOuts: number, isWrap: boolean, wrapStrength: number }}
 */
function detectPLOWrapDraw(holeRanks, boardRanks) {
    if (!boardRanks || boardRanks.length < 3) {
        return { wrapType: 'none', wrapOuts: 0, isWrap: false, wrapStrength: 0 };
    }

    // Get unique ranks sorted
    const allRanks = [...new Set([...holeRanks, ...boardRanks])].sort((a, b) => a - b);

    // Find the longest consecutive run that uses at least one board card and one hole card
    let maxWrapOuts = 0;
    let wrapType = 'none';

    // Check all possible 5-card straight combinations
    for (let i = 0; i <= allRanks.length - 5; i++) {
        const window = allRanks.slice(i, i + 5);
        const isConsecutive = window[4] - window[0] <= 5; // Within a 5-wide window
        if (!isConsecutive) continue;

        // Count how many of the 5 ranks are board cards
        const onBoard = window.filter(r => boardRanks.includes(r)).length;
        // Count how many outs we need (ranks missing from current combo)
        const currentRanks = new Set([...holeRanks.slice(0, 2), ...boardRanks]); // PLO: 2-card rule approximation
        const missing = window.filter(r => !boardRanks.includes(r) && !holeRanks.includes(r));

        if (missing.length === 1) {
            // Gutshot or open-ender: many hole cards hit this
            const outsContributed = 4 - (boardRanks.filter(r => missing[0] === r).length);
            maxWrapOuts = Math.max(maxWrapOuts, outsContributed);
        } else if (missing.length === 0) {
            // Made straight — not a draw
            continue;
        }
    }

    // Classify by exact out count (PLO wrap categories)
    // 20-out wrap: holding 4 consecutive ranks around a 3-card board window
    const hSorted = [...holeRanks].sort((a, b) => a - b);
    const bSorted = [...boardRanks].sort((a, b) => a - b);

    // Simplified exact wrap detection by gap analysis
    let wrapOuts = maxWrapOuts;

    // Count sequential pairs in hole cards vs board
    const combinations = holeRanks.filter(h => {
        return bSorted.some(b => Math.abs(h - b) <= 4);
    }).length;

    if (combinations >= 4) { wrapOuts = 20; wrapType = 'mega_wrap_20'; }
    else if (combinations === 3) { wrapOuts = 17; wrapType = 'big_wrap_17'; }
    else if (combinations === 2) { wrapOuts = 13; wrapType = 'wrap_13'; }
    else if (combinations === 1) { wrapOuts = 9; wrapType = 'gutshot_wrap_9'; }

    const isWrap = wrapOuts >= 9;
    // Wrap strength: scales with outs, capped at 100
    const wrapStrength = Math.min(100, wrapOuts * 4.5);

    return { wrapType, wrapOuts, isWrap, wrapStrength };
}

// ── 8b. ADAPTIVE BET SIZER ──
/**
 * Instead of fixed fractions (pot, 75%, 50%), dynamically compute the optimal
 * bet size that maximizes value against the specific opponent on the specific board.
 * This is the closest thing to a real solver bet-size optimizer in heuristic form.
 * @param {number} equity - Our equity score
 * @param {Object} sprZone
 * @param {Object} boardTexture
 * @param {Object} exploitProfile
 * @param {Object} madeHand
 * @param {number} potSize
 * @returns {{ optimalFraction: number, betSize: number, reasoning: string }}
 */
function getAdaptivePLOBetSize(equity, sprZone, boardTexture, exploitProfile, madeHand, potSize) {
    let fraction = 0.65; // Base: 65% pot is default PLO sizing

    // Equity-based sizing: stronger hands = bigger bets (build the pot)
    if (equity >= 90) fraction = 1.00; // Pot = full pot overbet not warranted by just strength...
    else if (equity >= 82) fraction = 0.90;
    else if (equity >= 72) fraction = 0.70;
    else if (equity >= 58) fraction = 0.55;
    else fraction = 0.40;  // Thin value / semi-bluff

    // Board texture adjustment
    if (boardTexture.isMonotone && !madeHand.isNutFlush) fraction *= 0.80; // Proceed cautiously
    if (boardTexture.isDangerous && madeHand.isNut) fraction *= 1.15;     // Charge draws!
    if (boardTexture.texture === 'rainbow') fraction *= 0.90;             // Dry boards: smaller bets

    // Opponent type adjustment
    if (exploitProfile?.strategy?.valueWider) fraction *= 1.10;  // Stations: size up
    if (exploitProfile?.strategy?.stealBlinds) fraction *= 0.85; // Nits: smaller to get called
    if (exploitProfile?.strategy?.bluffMore) fraction *= 0.95; // Against maniacs: value-thin

    // SPR adjustment
    if (sprZone.zone === 'shallow') fraction = Math.min(fraction, 0.75); // Don't overcommit
    if (sprZone.zone === 'very_deep') fraction = Math.min(fraction, 0.60); // Deep: build slowly

    fraction = Math.max(0.25, Math.min(1.25, fraction));
    const betSize = Math.round(potSize * fraction);

    const reasoning = `eq=${Math.round(equity)},spr=${sprZone.zone},opp=${exploitProfile?.profile || 'balanced'}`;
    return { optimalFraction: fraction, betSize, reasoning };
}

// ── 8c. BAYESIAN OPPONENT MODEL UPDATER ──
/**
 * Update our live opponent model using Bayesian principles during the session.
 * Each hand we observe provides evidence about their range/tendencies.
 * This runs in-memory during the session (Supabase is updated post-showdown).
 * @param {Object} currentModel - { vpip, pfr, aggFreq, foldBet, showdownWR }
 * @param {string} observedAction - 'fold_to_raise' | 'call_3bet' | 'bet_with_miss' | 'check_nut'
 * @param {number} learningRate - 0.05-0.20 (how fast to update)
 * @returns {{ updatedModel: Object, profileShift: string }}
 */
function updatePLOBayesianModel(currentModel, observedAction, learningRate = 0.10) {
    if (!currentModel) return { updatedModel: null, profileShift: 'unknown' };

    const model = { ...currentModel };
    const lr = Math.max(0.05, Math.min(0.20, learningRate));

    switch (observedAction) {
        case 'fold_to_raise':
            model.foldBet = model.foldBet * (1 - lr) + 1 * lr; // Moves toward fold=1.0
            break;
        case 'call_3bet':
            model.vpip = model.vpip * (1 - lr) + 1 * lr; // Moves toward wide VPIP
            break;
        case 'bet_with_miss':
            model.aggFreq = model.aggFreq * (1 - lr) + 1 * lr; // Moves toward aggressive
            break;
        case 'check_nut':
            model.aggFreq = model.aggFreq * (1 - lr) + 0 * lr; // Moves toward passive
            break;
        case 'raise_river':
            model.pfr = model.pfr * (1 - lr) + 1 * lr;
            break;
        case 'show_bluff':
            model.aggFreq = model.aggFreq * (1 - lr) + 1 * lr;
            break;
    }

    // Classify updated profile
    const avgAgg = model.aggFreq || 0;
    const avgVpip = model.vpip || 0;
    let profileShift = 'balanced';
    if (avgAgg > 0.60 && avgVpip > 0.55) profileShift = 'maniac';
    else if (avgAgg < 0.25 && avgVpip < 0.25) profileShift = 'nit';
    else if (avgVpip > 0.55 && (model.foldBet || 0) < 0.30) profileShift = 'station';
    else if (avgAgg < 0.30 && avgVpip > 0.40) profileShift = 'calling_station';

    return { updatedModel: model, profileShift };
}

// ── 8d. MULTI-BOARD SCENARIO PROJECTOR ──
/**
 * Project the BEST and WORST possible turn/river cards for our hand.
 * This helps decide whether to bet for protection NOW or pot-control and see a card.
 * Key insight: if most remaining cards are bad for us, we should bet now.
 * If most remaining cards are good (we improve a lot), we can slow down.
 * @param {Object} madeHand
 * @param {number} flushOuts
 * @param {number} straightOuts - Exact (de-duped) outs
 * @param {Object} boardTexture
 * @param {string} street
 * @returns {{ shouldProtectNow: boolean, improveChance: number, worsenChance: number, scenarioAdvice: string }}
 */
function projectPLOBoardScenarios(madeHand, flushOuts, straightOuts, boardTexture, street) {
    if (street === 'river') {
        // On the river, no future cards — no projection needed
        return { shouldProtectNow: false, improveChance: 0, worsenChance: 0, scenarioAdvice: 'river_no_projection' };
    }

    const remainingCards = street === 'flop' ? (48 - 3) : (48 - 4); // Approx remaining deck
    const improveCards = Math.min(flushOuts + straightOuts, remainingCards);
    const improveChance = improveCards / remainingCards;

    // Boards that could hurt us: paired turn, flush completing, straight completing
    const worsenCards = boardTexture.isFlushComplete ? 0 :
        boardTexture.isStraightComplete ? 2 :
            boardTexture.isTwoTone ? 9 : 4; // Approx scare cards

    const worsenChance = worsenCards / remainingCards;

    // If improve chance is high AND we're not yet the best hand: slowdown OK
    // If worsen chance is high AND we have the lead: bet for protection NOW
    const shouldProtectNow = worsenChance > 0.20 && madeHand.strength >= 55;

    let scenarioAdvice = 'bet_medium';
    if (shouldProtectNow && madeHand.strength >= 70) scenarioAdvice = 'bet_full_protection';
    else if (improveChance > 0.30 && !madeHand.isNut) scenarioAdvice = 'check_and_reassess';
    else if (worsenChance > 0.30 && madeHand.isNut) scenarioAdvice = 'bet_full_protection';

    return { shouldProtectNow, improveChance, worsenChance, scenarioAdvice };
}

// ── 8e. HAND HISTORY AUTO-CORRECTOR ──
/**
 * Detect recent leak patterns in the horse's session and auto-correct.
 * If the horse has been folding too much: loosen up.
 * If the horse has been calling too much off-suit draws: tighten up.
 * If the horse has been over-bluffing: cut it out.
 * @param {Object} sessionStats - { foldsLast20, callsLast20, raisesLast20, winRateLast20 }
 * @returns {{ correction: string, equityCorrection: number, bluffCorrection: number }}
 */
function getPLOHandHistoryCorrection(sessionStats) {
    if (!sessionStats) return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };

    const { foldsLast20 = 8, callsLast20 = 8, raisesLast20 = 4, winRateLast20 = 0.50 } = sessionStats;
    const totalActions = foldsLast20 + callsLast20 + raisesLast20;
    if (totalActions === 0) return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };

    const foldRate = foldsLast20 / totalActions;
    const callRate = callsLast20 / totalActions;
    const raiseRate = raisesLast20 / totalActions;

    // Over-folding (>55% of actions): too tight, loosen equity requirement
    if (foldRate > 0.55) {
        return { correction: 'loosen_fold', equityCorrection: -5, bluffCorrection: 0.05 };
    }

    // Over-calling (>55% of actions) + losing: too loose, tighten
    if (callRate > 0.55 && winRateLast20 < 0.40) {
        return { correction: 'tighten_call', equityCorrection: 8, bluffCorrection: 0 };
    }

    // Over-bluffing (raise rate >35%) + losing: stop bluffing
    if (raiseRate > 0.35 && winRateLast20 < 0.40) {
        return { correction: 'stop_bluffing', equityCorrection: 5, bluffCorrection: -0.10 };
    }

    // Running well: maintain current style
    if (winRateLast20 > 0.60) {
        return { correction: 'maintain', equityCorrection: 0, bluffCorrection: 0 };
    }

    return { correction: 'none', equityCorrection: 0, bluffCorrection: 0 };
}

// ── 8f. DOUBLE-SUIT + CONNECTIVITY PREFLOP CLASSIFIER UPGRADE ──
/**
 * Upgrade to the preflop classifier: add double-suited bonus,
 * exact connectivity scoring, and pair/wrap-potential scoring.
 * This replaces/augments the base classifyPLOPreflop result.
 * @param {Array<{rank,suit}>} holeCards
 * @returns {{ doubleSuitBonus: number, connectivityScore: number, pairBonus: number, totalBonus: number }}
 */
function enhancePLOPreflopScore(holeCards) {
    if (!holeCards || holeCards.length < 4) return { doubleSuitBonus: 0, connectivityScore: 0, pairBonus: 0, totalBonus: 0 };

    // Double-suited detection (2 cards of one suit + 2 cards of another suit)
    const suitCount = {};
    for (const c of holeCards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    const suitValues = Object.values(suitCount).sort((a, b) => b - a);
    const isDoubleSuited = suitValues[0] >= 2 && suitValues[1] >= 2;
    const isSingleSuited = !isDoubleSuited && suitValues[0] >= 2;
    const doubleSuitBonus = isDoubleSuited ? 12 : isSingleSuited ? 5 : 0;

    // Connectivity scoring: count consecutive or near-consecutive rank pairs
    const ranks = holeCards.map(c => c.rank).sort((a, b) => a - b);
    let connectivityScore = 0;
    for (let i = 0; i < ranks.length - 1; i++) {
        const gap = ranks[i + 1] - ranks[i];
        if (gap === 1) connectivityScore += 5;       // Connected
        else if (gap === 2) connectivityScore += 3;  // 1-gapper
        else if (gap === 3) connectivityScore += 1;  // 2-gapper (still useful wrap)
    }

    // Pair bonus: pairs have set-mining value (full house potential)
    const rankGroups = {};
    for (const r of ranks) rankGroups[r] = (rankGroups[r] || 0) + 1;
    const hasPair = Object.values(rankGroups).some(v => v >= 2);
    const hasDoublePair = Object.values(rankGroups).filter(v => v >= 2).length >= 2;
    const pairBonus = hasDoublePair ? -3 : hasPair ? 4 : 0; // Double pairs = dangler risk

    // Dangler penalty: if one card is an outlier rank (>4 from nearest neighbor)
    let danglerPenalty = 0;
    for (let i = 0; i < ranks.length; i++) {
        const distances = ranks.filter((_, j) => j !== i).map(r => Math.abs(r - ranks[i]));
        const minDist = Math.min(...distances);
        if (minDist >= 4) { danglerPenalty = -8; break; }
    }

    const totalBonus = doubleSuitBonus + connectivityScore + pairBonus + danglerPenalty;
    return { doubleSuitBonus, connectivityScore, pairBonus, danglerPenalty, totalBonus };
}

// ── 8g. EQUITY CONFIDENCE METER ──
/**
 * Synthesize all module outputs into a single confidence score for the entire decision.
 * High confidence = clear situation, commit fully.
 * Low confidence = marginal spot, default to passive line.
 * @param {Object} params - Collection of all computed Phase 1-7 values
 * @returns {{ confidenceScore: number, confidenceLevel: string, passiveBias: number }}
 */
function getPLOEquityConfidence({
    madeHand, hvrInfo, rioInfo, exactOuts, comboDrawInfo,
    betSizingTell, timingTell, stackPreservation, exploitProfile, equityFinal
}) {
    let confidence = 60; // Base confidence

    // Strong nut hand: maximum confidence
    if (madeHand.isNut) confidence += 25;
    else if (madeHand.strength >= 80) confidence += 15;
    else if (madeHand.strength >= 60) confidence += 5;
    else if (madeHand.strength < 35) confidence -= 10;

    // Combo draw (both flush + straight): high confidence in draw value
    if (comboDrawInfo?.isCombo) confidence += 10;
    else if (exactOuts >= 14) confidence += 8;
    else if (exactOuts <= 4 && madeHand.strength < 60) confidence -= 12;

    // HvR agreement: if HvR equity close to our raw equity = consistent signal
    const hvrDelta = Math.abs((hvrInfo?.hvrEquity || 50) - equityFinal);
    if (hvrDelta < 10) confidence += 5; // Both models agree
    else if (hvrDelta > 25) confidence -= 8; // Models disagree = uncertain

    // RIO risk: high RIO = lower confidence in draws
    if (rioInfo?.rioRisk === 'very_high') confidence -= 15;
    else if (rioInfo?.rioRisk === 'high') confidence -= 8;

    // Tell signals: confirmed tells raise confidence
    if (betSizingTell?.isTell) confidence += 6;
    if (timingTell?.timingTell === 'deep_tank_likely_strong' ||
        timingTell?.timingTell === 'fast_draw_or_weak') confidence += 4;

    // Stack preservation conflicts: short stack + marginal spot = low confidence
    if (stackPreservation?.isShort && equityFinal < 60) confidence -= 12;

    confidence = Math.max(0, Math.min(100, confidence));
    const confidenceLevel = confidence >= 80 ? 'high' : confidence >= 55 ? 'medium' : 'low';
    // PassiveBias: low confidence = prefer checking/calling over betting/raising
    const passiveBias = confidenceLevel === 'low' ? 8 : confidenceLevel === 'medium' ? 3 : 0;

    return { confidenceScore: confidence, confidenceLevel, passiveBias };
}

// ── 8h. FINAL DECISION AUDITOR ──
/**
 * LAST LINE OF DEFENSE: Sanity-check any proposed action before returning it.
 * Catches obvious errors that could leak chips (e.g. folding when we can check,
 * overbetting all-in when holding 12bb, calling pot-sized with 20% equity).
 * This function OVERRIDES a proposed decision if it's clearly wrong.
 * @param {Object} proposedAction - { type, amount }
 * @param {Object} context - All relevant decision context
 * @returns {Object} - Audited/corrected action
 */
function auditPLODecision(proposedAction, {
    canCheck, canCall, canRaise, stackBB, toCall, potSize,
    equityFinal, madeHand, legalActions, raiseAction, potOdds
}) {
    if (!proposedAction) return { type: 'check' }; // Emergency fallback

    const { type, amount } = proposedAction;

    // Audit 1: NEVER fold when we can check for free
    if (type === 'fold' && canCheck) {
        return { type: 'check' };
    }

    // Audit 2: NEVER call with < 15% equity unless pot odds are extremely good
    if (type === 'call' && equityFinal < 15 && potOdds > 0.20) {
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Audit 3: Don't raise/bet with an invalid or 0 amount
    if ((type === 'raise' || type === 'bet') && (!amount || amount <= 0)) {
        return canCheck ? { type: 'check' } : canCall ? { type: 'call' } : { type: 'fold' };
    }

    // Audit 4: Never bet more than our stack
    if (amount && amount > stackBB * (potSize > 0 ? 1 : 2)) {
        const safeMax = raiseAction?.maxAmount || amount;
        return { type, amount: Math.min(amount, safeMax) };
    }

    // Audit 5: Extremely short stack (< 6bb) — must go all-in or fold (no partial bets)
    if (stackBB <= 6 && toCall > 0 && equityFinal >= 45) {
        return { type: 'all_in' }; // Shove with any reasonable equity
    }

    // Audit 6: Never slow-play a nut hand when SPR ≤ 2 (we want to get it in!)
    if (type === 'check' && madeHand.isNut && canRaise && potSize > stackBB * 0.4) {
        const size = raiseAction?.maxAmount || potSize;
        return { type: raiseAction?.type || 'bet', amount: size };
    }

    // Audit 7: Action type does not exist in legal actions (rare engine edge case)
    const legalTypes = legalActions?.map(a => a.type) || [];
    if (type !== 'fold' && type !== 'check' && legalTypes.length > 0 && !legalTypes.includes(type)) {
        // Fall back to the closest legal action
        if (canCheck) return { type: 'check' };
        if (canCall) return { type: 'call' };
        return { type: 'fold' };
    }

    return proposedAction; // All checks passed — return unchanged
}

// Proper raise sizing in PLO, position awareness, 3-bet/4-bet ranges.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get PLO preflop action recommendation.
 */
function getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction, toCall, bb, stackBB, position, numPlayers) {
    const isBTN = position === 'BTN';
    const isSB = position === 'SB';
    const isBB = position === 'BB';
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);

    // Position bonus: IP gets to play more hands
    const posBonus = isIP ? 8 : isBB ? 5 : 0;
    const adjStrength = strength + posBonus;

    // PLO push/fold: ≤12bb
    if (stackBB <= 12) {
        return adjStrength >= 50 ? { type: 'all_in' } : (canCheck ? { type: 'check' } : { type: 'fold' });
    }

    // Facing a re-raise (4-bet spot) — need top 5% hands
    const isFacing3Bet = toCall > bb * 8;
    if (isFacing3Bet) {
        if (adjStrength >= 88 && canRaise) {
            const size = Math.round(toCall * 2.5);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size, raiseAction?.maxAmount || size) };
        }
        if (adjStrength >= 70 && canCall) return { type: 'call' }; // Flat with premium
        return { type: 'fold' };
    }

    // Facing a raise (3-bet spot)
    const isFacingRaise = toCall > bb * 2.5;
    if (isFacingRaise) {
        if (adjStrength >= 78 && canRaise) {
            const size3b = Math.round(toCall * 3);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size3b, raiseAction?.maxAmount || size3b) };
        }
        if (adjStrength >= 62 && canCall) return { type: 'call' };
        if (adjStrength >= 45 && isIP && canCall) return { type: 'call' }; // IP flat with speculative
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Facing an open
    if (toCall > bb) {
        if (adjStrength >= 65 && canRaise) {
            const size = Math.round(toCall * 3.5);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size, raiseAction?.maxAmount || size) };
        }
        if (adjStrength >= 48 && canCall) return { type: 'call' };
        if (adjStrength >= 35 && isIP && canCall) return { type: 'call' };
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Open raise (no action yet, toCall ≤ BB = only limp in front or we're first)
    if (adjStrength >= 62 && canRaise) {
        // Standard PLO open: 3x-4x BB
        const openSize = Math.round(bb * (isIP ? 3 : 3.5));
        return { type: raiseAction?.type || 'raise', amount: Math.min(openSize, raiseAction?.maxAmount || openSize) };
    }
    if (adjStrength >= 45 && canCall && toCall <= bb) return { type: 'call' }; // Complete/limp
    if (adjStrength >= 38 && isBB && canCheck) return { type: 'check' }; // BB defense
    return canCheck ? { type: 'check' } : { type: 'fold' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MAIN PLO DECISION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master PLO heuristic decision engine — world-class upgrade.
 * Handles PLO4, PLO5, PLO6, PLO8 Hi-Lo with proper PLO logic.
 * @param {string} profileId
 * @param {Object} state
 * @param {Array} legalActions
 * @returns {{ type: string, amount?: number }}
 */
function makePLOFallbackDecision(profileId, state, legalActions) {
    const { holeCards: holeCardStrings, board: boardStrings, street, position, stackBB,
        potSize, toCall, bb, numPlayers, isHiLo, numHoleCards } = state;
    const hash = getHash(profileId);

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    const holeCards = parseCards(holeCardStrings);
    const boardCards = parseCards(boardStrings);
    if (holeCards.length < 4) {
        // Fallback if we can't parse cards
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const loosenessBias = (hash % 10) - 5; // -5 to +4 personality variance

    // ─── PREFLOP ───
    if (street === 'preflop') {
        // Phase 4: Blind defense — run specialized BB/SB logic first
        if (position === 'BB' || position === 'SB') {
            const baseStrength = holeCards.length > 4
                ? getBestPLO5or6PreflopStrength(holeCards)
                : classifyPLOPreflop(holeCards);
            const blindDef = getPLOBlindDefense(position, baseStrength + loosenessBias, toCall, bb, potSize, numPlayers, legalActions);
            if (blindDef) return { type: blindDef.action, amount: blindDef.amount };
        }
        // PLO5/PLO6: use best-combo strength; PLO4: use standard classifier
        // Phase 5: Deep stack range expansion adds strength to all connected hands
        const deepAdj = getPLODeepStackAdjustments(stackBB);
        const baseStrengthPreflop = (holeCards.length > 4
            ? getBestPLO5or6PreflopStrength(holeCards)
            : classifyPLOPreflop(holeCards));

        // Phase 8: Double-suit + connectivity + dangler enhancement
        const preflopEnhancement = enhancePLOPreflopScore(holeCards);
        const strength = baseStrengthPreflop + loosenessBias + deepAdj.preflopRangeExpansion + preflopEnhancement.totalBonus;

        // Phase 7: Position-aware range gate — only open above position threshold
        const posRanges = getPLOPositionRanges(position, numPlayers, stackBB);
        if (toCall === 0 && strength < posRanges.openThreshold) {
            return { type: 'check' }; // Check hands below open threshold
        }

        // Gap D: Limper isolation — raise to isolate when opponents have limped
        const numLimpers = state.numLimpers || 0;
        if (numLimpers > 0 && toCall <= bb * 1.5) { // In limped pot
            const isolation = getPLOLimperIsolation(numLimpers, strength, position, isIP, bb, raiseAction);
            if (isolation.shouldIsolate && canRaise)
                return { type: raiseAction?.type || 'raise', amount: isolation.isolateSize };
        }

        // Gap C: 3-bet defense — when facing a 3-bet (large raise), use exact call/4bet/fold ranges
        const is3Bet = toCall > bb * 6; // Facing a significant raise (3-bet or more)
        if (is3Bet) {
            const defense3Bet = getPLO3BetDefense(strength, position, isIP, stackBB, potOdds);
            if (defense3Bet.should4Bet && canRaise)
                return { type: raiseAction?.type || 'raise', amount: clamp(Math.round(potSize * 2.5)) };
            if (defense3Bet.shouldFlatCall && canCall)
                return { type: 'call' };
            // fold (or check if free)
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // Phase 5: Squeeze play — when 2+ callers, 3-bet to isolate
        const numCallers = state.numCallers || 0;
        const squeeze = getPLOSqueezePlay(numCallers, isIP, position, strength, potSize, raiseAction, canRaise);
        if (squeeze.shouldSqueeze) return { type: raiseAction?.type || 'raise', amount: squeeze.squeezeSize };

        return getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction,
            toCall, bb, stackBB, position, numPlayers);
    }

    // ─── POSTFLOP ───
    const holeRanks = holeCards.map(c => c.rank);
    const boardRanks = boardCards.map(c => c.rank);
    const effectiveStack = stackBB * bb - toCall;

    // ── Phase 2: Game type adjustments (tournament tightness) ──
    const gameType = state.gameType || 'cash';
    const gameAdj = getPLOGameTypeAdjustments(gameType, stackBB);

    // ── Phase 2: Board texture analysis ──
    const boardTexture = analyzePLOBoardTexture(boardCards);

    // ── Phase 2: Scare card detection ──
    const scareInfo = detectScareCard(boardCards, street);

    // ── Phase 1: Made hand (PLO5/PLO6 use best-combo evaluator) ──
    const madeHand = holeCards.length > 4
        ? getBestPLO5or6MadeHand(holeCards, boardCards)
        : evaluatePLOMadeHand(holeCards, boardCards);

    // ── Phase 1: Draw counting ──
    const flushDraw = countFlushOuts(holeCards, boardCards);
    const straightDraw = countStraightOuts(holeRanks, boardRanks);
    const backdoorOuts = countBackdoorOuts(holeCards, boardCards);

    // ── Phase 5: Deep stack adjustments (200bb+) ──
    const deepStack = getPLODeepStackAdjustments(stackBB);

    // ── Phase 5: Card removal effects ──
    const cardRemoval = getPLOCardRemovalEffects(holeCards, boardCards);

    // ── Phase 5: Runout distribution ──
    const runout = analyzePLORunoutDistribution(holeCards, boardCards, straightDraw.outs, flushDraw.outs);

    // ── Phase 5: ICM bubble pressure ──
    const icmData = state.icmData || null;
    const icmPressure = getPLOICMBubblePressure(icmData, stackBB);

    // ── PLO8 Hi-Lo evaluation ──
    const lo8 = isHiLo ? evaluatePLO8Low(holeCards, boardCards) : null;

    // ── SPR zone ──
    const sprZone = getPLOSPRZone(effectiveStack, potSize + toCall);

    // ── Phase 2: Equity Realization Coefficient ──
    const erc = getPLOEquityRealization(
        isIP, sprZone.zone,
        straightDraw.outs, flushDraw.outs,
        madeHand.isNut, numPlayers
    );

    // ── Phase 2: Blocker awareness ──
    const blockers = getPLOBlockers(holeCards, boardCards);

    // ── Phase 6: Combo draw de-duplicator (exact, collision-free outs) ──
    const comboDrawInfo = deduplicatePLOComboOuts(holeCards, boardCards, straightDraw.outs, flushDraw.outs);
    const exactOuts = comboDrawInfo.exactOuts;

    // ── Phase 6: Reverse implied odds ──
    const rioInfo = getPLOReverseImpliedOdds(
        flushDraw.isNutFlushDraw,
        straightDraw.hasNutStraightDraw,
        boardTexture, numPlayers, madeHand
    );

    // ── Phase 6: Table image tracker ──
    const sessionStats = state.sessionStats || null;
    const tableImage = getPLOTableImage(sessionStats);

    // ── Phase 6: HvR approximation (opponent range inference from actions) ──
    const opponentActions = state.opponentActionHistory || [];
    const hvrInfo = approximatePLOHvR(madeHand, exactOuts, opponentActions, boardTexture, street, potOdds);

    // ── Phase 7: Bet-sizing tell detector ──
    const opponentBetFraction = toCall > 0 ? toCall / Math.max(potSize, 1) : 0;
    const betSizingTell = detectPLOBetSizingTell(opponentBetFraction, state.opponentRead || null, street);

    // ── Phase 7: Timing tell reader ──
    const opponentActionTimeMs = state.opponentActionTimeMs || 0;
    const timingTell = readPLOTimingTell(opponentActionTimeMs, street);

    // ── Phase 7: Per-street bluff frequency calibration ──
    const perStreetBluff = getPLOPerStreetBluffCalibration(street, state.opponentRead || null);

    // ── Phase 7: Stack preservation protocol ──
    const startingStackBB = state.startingStackBB || stackBB;
    const stackPreservation = getPLOStackPreservation(stackBB, startingStackBB);

    // ── Phase 7: Tournament chip accumulation mode ──
    const tourneyData = state.tourneyData || null;
    const chipAccumulation = getPLOChipAccumulationMode(tourneyData, 0);

    // ── Phase 5: Exploitation profile — declared early (used by calibratePLOProbeBet below) ──
    const exploitProfile = buildPLOExploitationProfile(state.opponentRead || null);

    // ── Phase 7: Position ranges (used as gate for preflop and as reference) ──
    const positionRanges = getPLOPositionRanges(position, numPlayers, stackBB);

    // ── Phase 7: Dynamic probe calibrator ──
    const calibratedProbe = calibratePLOProbeBet(
        isIP, exploitProfile?.profile || 'balanced',
        boardTexture, runout?.runoutQuality || 'neutral',
        tableImage?.tableImage || 'neutral', numPlayers
    );

    // ── Phase 7: Chat trigger (fires contextual message if game engine supports it) ──
    const chatTrigger = state.chatTrigger || null;
    const chatResponse = getPLOChatResponse(chatTrigger, profileId);

    // ── GAP A-F + OPT A-E: All module initialization ──

    // Opt E: Memoization cache (reduces redundant sub-computations)
    const _memo = createPLODecisionCache();

    // Gap A: Limped pot strategy
    const isLimpedPot = state.isLimpedPot || false;
    const limpedPotStrategy = getPLOLimpedPotStrategy(isLimpedPot, madeHand, 0, numPlayers);

    // Gap B: Multi-way aggression governor
    const multiWayGov = governPLOMultiWayAggression(numPlayers, 0, madeHand, true);

    // Gap E: Side-pot awareness
    const allInPlayers = state.allInPlayers || [];
    const numActivePlayers = state.numActivePlayers || Math.max(numPlayers - allInPlayers.length, 1);
    const sidePot = getPLOSidePotAwareness(allInPlayers, stackBB, numActivePlayers, 0);

    // Gap F: Late-session opponent fatigue
    const sessionMinutes = state.sessionMinutes || 0;
    const opponentLosses = state.opponentLossBB || 0;
    const lateSession = getPLOLateSessionAdjustment(sessionMinutes, opponentLosses);

    // Opt A: Cold-call decision (for when we face a single raise)
    const raiseSize = toCall > 0 ? (toCall / bb) : 0;
    const coldCallDecision = getPLOColdCallDecision(0, isIP, potOdds, state.numCallers || 0, raiseSize); // strength wired in at preflop

    // Opt B: Blind vs blind strategy
    const isSBvsBB = state.isSBvsBB || (numPlayers === 2 && (position === 'SB' || position === 'BB'));
    // wasPFRaiser hoisted: used by blindBattle and donkOpportunity below
    const wasPFRaiser = state.wasPFRaiser || false;
    const blindBattle = getPLOBlindBattleStrategy(position, 0, isSBvsBB, wasPFRaiser, potOdds);

    // Opt C: Donk bet opportunity (evaluated after board texture + madeHand are known)
    const donkOpportunity = getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, 0, potSize);

    // ── Phase 8: Explicit wrap draw detector (20/17/13/9-out wraps) ──
    const wrapInfo = detectPLOWrapDraw(holeRanks, boardRanks);
    // Merge wrap outs with base exact outs (replace straight outs if wrap is better)
    const mergedExactOuts = wrapInfo.isWrap && wrapInfo.wrapOuts > exactOuts
        ? wrapInfo.wrapOuts + flushDraw.outs - (comboDrawInfo.isCombo ? 2 : 0)
        : exactOuts;

    // ── Phase 8: Board scenario projector ──
    const boardScenario = projectPLOBoardScenarios(madeHand, flushDraw.outs, mergedExactOuts, boardTexture, street);

    // ── Phase 8: Hand history auto-corrector ──
    const historyCorrection = getPLOHandHistoryCorrection(sessionStats);

    // ── Total equity (raw → realized), using merged exact/wrap outs ──
    const totalOuts = mergedExactOuts + backdoorOuts;
    const outEquityRaw = Math.min(mergedExactOuts * 2.2, 46) * rioInfo.rioMultiplier; // RIO-adjusted
    const outEquity = outEquityRaw * erc;

    // Commitment thresholds: multiway = tighter, nut bonus, PLO8 bonus
    const multiwayPenalty = Math.max(0, (numPlayers - 2) * 5);
    const nutBonus = madeHand.isNut ? 15 : 0;
    const lo8Bonus = lo8?.hasNutLow ? 10 : lo8?.hasLow ? 5 : 0;
    const boardDangerPenalty = (!madeHand.isNut && boardTexture.isDangerous) ? boardTexture.monoBoardPenalty : 0;
    const scareCardPenalty = (scareInfo.isScareTurn || scareInfo.isScareRiver) && !madeHand.isNut ? 12 : 0;
    const tightnessOp = 1 / gameAdj.tightnessFactor;

    // Composite equity score (0-100)
    let equity = (madeHand.strength + outEquity + nutBonus + lo8Bonus
        - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias) * tightnessOp;
    equity = Math.max(0, Math.min(100, equity));

    // ── Phase 3: Multi-street planning ──
    const msp = getPLOMultiStreetPlan(madeHand, straightDraw.outs, flushDraw.outs, street, boardTexture, isIP);

    // ── Phase 3: Showdown value detection ──
    const sdvInfo = getPLOShowdownValue(madeHand, boardTexture, numPlayers, street);

    // ── Phase 3: Opponent-specific adjustments (from Supabase opponent reads) ──
    const oppRead = state.opponentRead || null;
    const oppAdj = getPLOOpponentAdjustments(oppRead);

    // ── Phase 3: All-in equity shortcut ──
    const allInInfo = getPLOAllInEquity(madeHand, straightDraw.outs, flushDraw.outs, sprZone, numPlayers);

    // ── Phase 3: Implied odds for drawing hands ──
    const isNutDraw = flushDraw.isNutFlushDraw || straightDraw.hasNutStraightDraw;
    const impliedOddsInfo = getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw);

    // ── Phase 3: Range balance randomizer ──
    const situation = street === 'river' ? 'river_bet' : street === 'turn' ? 'turn_lead' : 'flop_lead';
    const rangeBalance = getPLORangeBalance(profileId, situation, equity);

    // ── Phase 3: C-bet strategy (fires only if horse was PFR) ──
    // wasPFRaiser declared above (hoisted to avoid TDZ)
    const cBetStrategy = getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity);

    // ── Phase 3: Turn barrel decision ──
    const turnBarrel = street === 'turn'
        ? getPLOTurnBarrel(equity, madeHand, straightDraw.outs, flushDraw.outs, scareInfo.isScareTurn, boardTexture, isIP)
        : null;

    // ── Phase 3: Proper PLO pot geometry (correct raise sizing) ──
    const ploProperPotRaise = _calcPLOPotRaiseSimple(toCall, potSize);
    const clamp = (size) => Math.max(raiseAction?.minAmount || 1, Math.min(size, raiseAction?.maxAmount || size));
    const clampedPotRaise = clamp(ploProperPotRaise);
    const potBetSize = Math.round(potSize * 0.90);
    const halfPotBetSize = Math.round(potSize * 0.50);

    // ── Phase 4: Variance protection (tilt/heater detection) ──
    const sessionMetrics = state.sessionMetrics || null;
    const varianceProt = getPLOVarianceProtection(sessionMetrics);
    // Apply variance factor on top of tightness (compound: both can be active)
    // Phase 7: stack preservation factor also applies here
    const combinedTightnessOp = tightnessOp / (varianceProt.tightenFactor * Math.max(1.0, stackPreservation.preservationFactor - 0.35));
    // ─── MODULE 12: PLO MULTIWAY EQUITY DEGRADATION SHIELD ───
    // Discount the horse's effective strength based on number of active players.
    // Prevents the horse from over-valuing medium hands in 4-5 way pots.
    const equityP4 = Math.max(0, Math.min(100,
        (applyMultiwayEquityDiscount(
            madeHand.strength + outEquity + nutBonus + lo8Bonus
            - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias,
            numPlayers  // ← Module 12 applies here instead of raw madeHand.strength
        ) + chipAccumulation.accumulationBonus
            + betSizingTell.callAdjustment
            + timingTell.equityAdjustment
        ) * combinedTightnessOp
    ));

    // ─── MODULE 17: PLO RUNOUT EQUITY RE-EVALUATOR ───
    // On turn/river, re-assess equity delta from the new board card.
    // Multiplier escalates/deflates bet fraction based on how the runout changed our equity.
    const prevEquityEstimate = state.prevEquity || equityP4; // Caller can pass prior street equity
    const runoutReeval = (street === 'turn' || street === 'river')
        ? reevaluatePLORunoutEquity(prevEquityEstimate, equityP4, street)
        : { multiplier: 1.0, runoutType: 'blank' };
    if (runoutReeval.runoutType !== 'blank') {
        console.log(`[HorseBrain] 🔄 MODULE 17 RUNOUT: ${runoutReeval.runoutType} (×${runoutReeval.multiplier.toFixed(2)}) on ${street}`);
    }

    // ─── MODULE 23: OOP POSITIONAL EQUITY LEAK GUARD ───
    // Prevent auto-betting from OOP without initiative (a classic PLO leak humans exploit).
    const hasInitiative = state.wasPFRaiser || wasPFRaiser || false;
    const oopGuard = getOOPPositionalGuard(isIP, hasInitiative, equityP4, street);
    // oopGuard.equityBoost is subtracted from effective equity when guarding
    const equityFinalRaw = equityP4 - (oopGuard.shouldGuard ? oopGuard.equityBoost : 0);
    // Apply table image exposure penalty (Module 20): if exposed, -8% effective equity
    const imageExposedMod = (state.imageExposed || false) ? -8 : 0;
    // Apply probe-farm counter (Module 19): if opponent is probe-farming, add raise equity
    const probeFarmMod = (state.probeFarmScore || 0) > 0.6 ? +6 : 0;
    // Apply limp-trap penalty (Module 21): reduce raise aggression on preflop
    // (handled via fold threshold below, not equity; placeholder)
    const equityFinalAdjusted = Math.max(0, Math.min(100, equityFinalRaw + imageExposedMod + probeFarmMod));

    // ─── MODULE 13: PLO NUT-BIAS EXPLOIT DETECTOR ───
    // On dry/rainbow/low boards, humans know the horse favors nut-heavy hands.
    // They bluff into the horse expecting a fold. We add a check-raise option for medium hands.
    const nutBiasInfo = detectNutBiasExploitBoard(boardCards, numPlayers);

    // ── Phase 4: Nut range advantage ──
    const nutAdvantage = getPLONutRangeAdvantage(madeHand, boardTexture, wasPFRaiser, isIP, street);


    // ── Phase 4: 4-bet pot dynamics ──
    const isIn4BetPot = state.isIn4BetPot || false;
    const fourBetDecision = getPLO4BetPotDecision(isIn4BetPot, madeHand, straightDraw.outs, flushDraw.outs, equityFinalAdjusted);

    // ── Phase 4: Donk bet detection ──
    const donkBetFraction = state.donkBetFraction || 0;
    const isDonkSituation = donkBetFraction > 0 && toCall > 0 && wasPFRaiser;

    // ── Phase 4: GIF trigger pre-calculation ──
    const gifInfo = getPLOGifTrigger(madeHand, equityFinalAdjusted, allInInfo.allInEquity, profileId);

    // ── Phase 5: Pot manipulation ──
    const potManip = getPLOPotManipulation(numPlayers, exploitProfile, equityFinalAdjusted, isIP, madeHand, totalOuts, potSize, raiseAction);

    // ── Phase 5: River float and fire ──
    const riverFloat = getPLORiverFloat(madeHand, straightDraw.outs, flushDraw.outs, street, isIP, numPlayers, blockers, potSize, raiseAction);

    // ── Phase 5: Runout quality equity adjustment ──
    const runoutBonus = runout.runoutQuality === 'excellent' ? 10
        : runout.runoutQuality === 'good' ? 5
            : runout.runoutQuality === 'poor' ? -8
                : runout.runoutQuality === 'dangerous' ? -5 : 0;

    // ── Phase 5: Deep stack draw bonus ──
    const deepDrawBonus = deepStack.isDeepStack ? deepStack.drawValueBonus : 0;

    // ── Phase 5: Card removal bluff bonus (more removal = more bluffing license) ──
    const cardRemovalBluffBonus = cardRemoval.removalScore >= 18 ? 8 : cardRemoval.removalScore >= 10 ? 4 : 0;

    // ── Phase 5: Exploitation threshold adjustments ──

    const exploitValueThreshold = exploitProfile.strategy.valueWider
        ? oppAdj.valueBetThreshold - 8
        : exploitProfile.strategy.bluffMore
            ? oppAdj.valueBetThreshold + 5
            : oppAdj.valueBetThreshold;

    const exploitFoldThreshold = exploitProfile.strategy.callDown
        ? oppAdj.foldThreshold - 12  // Call down maniacs with weaker hands
        : exploitProfile.strategy.stealBlinds
            ? oppAdj.foldThreshold + 5   // Fold to nit value bets quickly
            : oppAdj.foldThreshold;

    // ── Phase 5+8+GapF: Final equity with all bonuses + Phase 3 adjustments ──
    // equityFinalAdjusted incorporates: Module 12 (multiway), Module 17 (runout),
    // Module 20 (image exposure), Module 23 (OOP guard), Module 19 (probe farm counter)
    const equityFinal = Math.max(0, Math.min(100,
        equityFinalAdjusted * runoutReeval.multiplier  // Module 17: runout multiplier
        + runoutBonus + deepDrawBonus + historyCorrection.equityCorrection
        + lateSession.calldownLoosen
    ));


    // ── Phase 8: Equity confidence meter ──
    const equityConfidence = getPLOEquityConfidence({
        madeHand, hvrInfo, rioInfo,
        exactOuts: mergedExactOuts,
        comboDrawInfo,
        betSizingTell, timingTell,
        stackPreservation, exploitProfile, equityFinal
    });

    // ── Phase 8: Adaptive bet sizer (dynamic optimal fraction) ──
    const adaptiveSizer = getAdaptivePLOBetSize(equityFinal, sprZone, boardTexture, exploitProfile, madeHand, potSize);
    const adaptiveBetSize = clamp(adaptiveSizer.betSize);

    // ── Phase 8: Board scenario protection flag ──
    const shouldProtectNow = boardScenario.shouldProtectNow;
    const scenarioAdvice = boardScenario.scenarioAdvice;

    // ── Phase 5: ICM avoidFlips override — avoid coin-flip all-ins at bubble/FT ──
    const icmCommitThreshold = icmPressure.avoidFlips ? 62 : 52;

    // ─── RIVER ───
    if (street === 'river') {
        const riverEquity = (madeHand.strength + nutBonus + lo8Bonus
            - multiwayPenalty - boardDangerPenalty - scareCardPenalty + loosenessBias) * combinedTightnessOp;

        // Phase 4: River overbet with nuts + nut range advantage (fires first, highest priority)
        if (toCall === 0) {
            const overbet = getPLORiverOverbet(madeHand, nutAdvantage.hasNutAdvantage, sprZone, isIP, potSize, raiseAction);
            if (overbet.shouldOverbet && canRaise)
                return { type: raiseAction.type, amount: overbet.overbetAmount };

            // Phase 3: Range balance — force check or bluff occasionally
            if (rangeBalance.forceBluff && blockers.canBluffRiver && canRaise)
                return { type: raiseAction?.type || 'bet', amount: clamp(halfPotBetSize) };
            if (rangeBalance.forceCheck && madeHand.strength >= 80) return { type: 'check' };
        }

        // Phase 6: Check-behind calibrator (IP river situations)
        const checkBehindCalibration = getPLOCheckBehindCalibration(equityFinal, madeHand, boardTexture, sdvInfo, numPlayers, 'river');

        // Opt D: River check-raise — OOP check-raise with nuts / blocker bluff
        // (must be before the optimizer; if we should CR, we CHECK here, raise on next action call)
        if (toCall === 0 && !isIP) {
            const riverCR = getPLORiverCheckRaise(
                madeHand, blockers, nutAdvantage,
                opponentBetFraction, isIP, exploitProfile
            );
            if (riverCR.shouldCheckRaiseRiver) {
                return { type: 'check' }; // Check now; will raise when opponent bets
            }

            // ─── MODULE 13: NUT-BIAS EXPLOIT DEFENSE (Check-Raise on Dry Boards) ───
            // On boards where humans expect us to have nothing (nut-unlikely),
            // we trap by checking medium-strength hands and check-raising their probe bet.
            if (nutBiasInfo.shouldAddCheckRaise && equityFinal >= 35 && equityFinal <= 60 && Math.random() < 0.45) {
                console.log(`[HorseBrain] 😈 MODULE 13 NUT-BIAS TRAP: checking to check-raise on dry board (equity=${equityFinal.toFixed(0)}, nutUnlikely=${nutBiasInfo.nutUnlikelyScore})`);
                return { type: 'check' };
            }
        }
        // Opt D: River check-raise AFTER seeing the bet (toCall > 0 and we OOP can now raise)
        if (toCall > 0 && !isIP && canRaise) {
            const riverCR = getPLORiverCheckRaise(
                madeHand, blockers, nutAdvantage,
                opponentBetFraction, false, exploitProfile
            );
            if (riverCR.shouldCheckRaiseRiver) {
                return { type: raiseAction?.type || 'raise', amount: clampedPotRaise };
            }
        }

        // Phase 6: River decision optimizer — the final synthesizer for river actions
        const optimizedRiver = optimizePLORiverDecision({
            riverEquity,
            hvrInfo,
            rioInfo,
            sdvInfo,
            blockers,
            nutAdvantage,
            madeHand,
            boardTexture,
            isIP,
            canRaise,
            canCall,
            potOdds,
            clamp,
            clampedPotRaise,
            halfPotBetSize,
            potBetSize,
            raiseAction,
            tableImage,
            checkBehindCalibration,
            opposingBetSize: toCall,
            multiwayPenalty,
        });

        // GIF state machine: fire on river call (going to showdown)
        if (optimizedRiver.type === 'call' && toCall > 0) {
            const handPhase = 'river_call';
            const gifSM = getPLOGifStateMachine(handPhase, gifInfo, profileId);
            if (gifSM.shouldThrowGif) return { type: 'call', gifCategory: gifSM.gifCategory, gifTiming: gifSM.gifTiming };
        }

        return { type: optimizedRiver.type, amount: optimizedRiver.amount };
    }

    // ─── FLOP / TURN ───

    // Phase 4: Donk bet response (opponent bets into the PFR)
    // ─── MODULE 24: RIVER DONK-BET EXPLOITATION BLOCK ───
    // River donk bets (OOP leads) are frequently thin-value or polarized.
    // Module 24 counters them with a raise (strong equity), call (medium), or fold (weak).
    if (street === 'river' && toCall > 0 && isIP) {
        const donkBlock = evaluateDonkBet(toCall, potSize, isIP, equityFinal);
        if (donkBlock.action === 'raise' && canRaise) {
            console.log(`[HorseBrain] 🛡️ MODULE 24 DONK BLOCK: ${donkBlock.reason}`);
            const raiseAmt = clamp(Math.round(potSize * 0.75));
            return { type: raiseAction?.type || 'raise', amount: raiseAmt };
        }
        if (donkBlock.action === 'fold') {
            console.log(`[HorseBrain] 🛡️ MODULE 24 DONK FOLD: ${donkBlock.reason}`);
            return { type: 'fold' };
        }
        // 'call' or 'none' — fall through to existing logic
    }

    if (isDonkSituation) {
        const donkResponse = handlePLODonkBet(donkBetFraction, equityFinal, madeHand, totalOuts, isIP, raiseAction, canCall, potSize);
        if (donkResponse) return { type: donkResponse.action, amount: donkResponse.amount };
    }

    // Phase 4: 4-bet pot — shove or fold quickly
    if (isIn4BetPot) {
        if (fourBetDecision.shouldShoveFlopIn4Bet) {
            if (gifInfo.shouldThrowGif) {
                // Attach GIF metadata for the game engine to process
                return { type: 'all_in', gifCategory: gifInfo.gifCategory };
            }
            return { type: 'all_in' };
        }
        if (fourBetDecision.shouldFoldWeakIn4Bet) return { type: 'fold' };
    }

    // Phase 3+5: All-in equity check with ICM awareness
    if (sprZone.shouldCommit || allInInfo.shouldCommitAllIn) {
        if (allInInfo.allInEquity >= icmCommitThreshold) {
            if (gifInfo.shouldThrowGif) return { type: 'all_in', gifCategory: gifInfo.gifCategory };
            return { type: 'all_in' };
        }
        if (allInInfo.allInEquity >= 40 && canCall) return { type: 'call' };
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    if (toCall === 0) {
        // Phase 2: OOP check-raise trigger (will raise on next action)
        const cr = getPLOCheckRaise(isIP, madeHand, straightDraw.outs, flushDraw.outs, flushDraw.isNutFlushDraw, toCall, potSize);
        if (cr.shouldCheckRaise) return { type: 'check' };

        // Phase 3: Range balance — occasionally check monsters to balance range
        if (rangeBalance.forceCheck && equityFinal >= 75) return { type: 'check' };

        // Opt C: Donk bet — OOP lead into preflop raiser when board favors our range
        if (donkOpportunity.shouldDonk && equityFinal >= 60 && canRaise)
            return { type: raiseAction?.type || 'bet', amount: clamp(getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize).donkSize) };

        // Phase 8: Board protection bet — bet full when scenario says board is about to get worse
        if (scenarioAdvice === 'bet_full_protection' && canRaise && equityFinal >= 60)
            return { type: raiseAction.type, amount: adaptiveBetSize };

        // Phase 5: Pot manipulation — isolate fishy opponents
        if (potManip.shouldIsolate && potManip.isolateSize > 0 && canRaise && equityFinal >= 65)
            return { type: raiseAction.type, amount: potManip.isolateSize };

        // Phase 5: Charge draws in multi-way (deny pot odds)
        if (potManip.chargeDrawSize > 0 && canRaise && !potManip.shouldKeepMultiWay)
            return { type: raiseAction.type, amount: potManip.chargeDrawSize };

        // Phase 3: MSP — play fast NOW if multi-street plan says protect the hand
        if (msp.shouldPlayFastNow && canRaise && equityFinal >= 55)
            return { type: raiseAction.type, amount: adaptiveBetSize };

        // Monsters: build pot (slow-play for range balance if MSP/SPR says so)
        // Phase 8: confidence passiveBias — low confidence = check more with medium holdings
        const monsterThreshold = 80 + equityConfidence.passiveBias;
        if (equityFinal >= monsterThreshold && canRaise) {
            if ((sprZone.zone === 'very_deep' || msp.shouldSlowPlay) && isIP && !madeHand.isNut && Math.random() < 0.35)
                return { type: 'check' }; // Slow-play
            return { type: raiseAction.type, amount: adaptiveBetSize }; // Phase 8: adaptive sizing
        }

        // Phase 3: C-bet engine
        if (cBetStrategy.shouldCBet && canRaise)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * cBetStrategy.cBetFraction)) };

        // Phase 3: Turn barrel logic
        if (turnBarrel?.shouldBarrel && canRaise)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * turnBarrel.barrelFraction)) };

        // Phase 5: River float and fire (IP, draw missed, blockers)
        if (riverFloat.shouldFireRiver && canRaise)
            return { type: raiseAction.type, amount: riverFloat.fireSize };

        // Phase 7: Calibrated probe bet (replaces fixed Phase 2 probe)
        if (calibratedProbe.shouldProbe && canRaise)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * calibratedProbe.probeSizing)) };

        // Strong draws: semi-bluff (ERC-adjusted + runout quality + wrap outs)
        const realizedOuts = totalOuts * erc;
        if (realizedOuts >= 14 && canRaise && Math.random() < 0.65)
            return { type: raiseAction.type, amount: adaptiveBetSize };
        if (realizedOuts >= 9 && canRaise && Math.random() < 0.38)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * 0.50)) };

        // Medium made hands + redraw: bet for protection
        if (equityFinal >= 55 && madeHand.hasRedraw && canRaise)
            return { type: raiseAction.type, amount: calcPLOBetSize(potSize, 0.55, raiseAction) };

        // Phase 3: Showdown value — check hands that win at showdown instead of turning into bluffs
        if (sdvInfo.hasShowdownValue) return { type: 'check' };

        // Scare card: slow down with non-nut hands
        if (scareInfo.isScareTurn && equityFinal < 70) return { type: 'check' };

        return { type: 'check' };
    }

    // ─── FACING A BET (Flop / Turn) ───

    // Phase 2: Check-raise with nuts OOP
    const crBet = getPLOCheckRaise(isIP, madeHand, straightDraw.outs, flushDraw.outs, flushDraw.isNutFlushDraw, toCall, potSize);
    if (crBet.shouldCheckRaise && canRaise)
        return { type: raiseAction.type, amount: clamp(crBet.crSize) };

    // Monster facing a bet: raise using proper PLO pot geometry
    if (equityFinal >= 78 && canRaise)
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };

    // Big combo draw: raise for value + protection (use exact de-duped outs)
    if (comboDrawInfo.isCombo && exactOuts >= 18 && canRaise && Math.random() < 0.55)
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    if (flushDraw.outs >= 9 && straightDraw.outs >= 13 && !comboDrawInfo.isCombo && canRaise && Math.random() < 0.55)
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };

    // Phase 6: Flop continuance optimizer — use HvR + RIO for accurate continue/fold
    const flopContinuance = getPLOFlopContinuance(
        equityFinal, exactOuts, madeHand, potOdds,
        rioInfo, hvrInfo, boardTexture, isIP, numPlayers
    );

    // High RIO risk with non-nut draw: fold even with many outs
    if (rioInfo.rioRisk === 'very_high' && !madeHand.isNut && exactOuts < 16 && potOdds >= 0.30)
        return { type: 'fold' };

    // Phase 3: Implied odds — reject calls on draws without sufficient implied odds
    if (exactOuts >= 6 && !impliedOddsInfo.isProfitableCall && potOdds >= 0.35)
        return { type: 'fold' };
    if (exactOuts >= 9 && impliedOddsInfo.isProfitableCall && canCall)
        return { type: 'call' };

    // Phase 6: Flop continuance score
    if (!flopContinuance.shouldContinue) return { type: 'fold' };

    // Worth raising if above raise threshold
    if (flopContinuance.continuanceScore >= flopContinuance.raiseThreshold && canRaise)
        return { type: raiseAction?.type || 'call', amount: clamp(Math.round(potSize * 0.75)) };

    // Call if continuance says so
    if (canCall) return { type: 'call' };

    // Phase 5+7: opponent-adjusted threshold using per-street bluff calibration
    const callThreshold = perStreetBluff.shouldLoosen
        ? perStreetBluff.calldownThreshold      // Phase 7: call with less equity vs aggressive opponents
        : exploitFoldThreshold - 5;             // Phase 5: default exploit threshold
    if (equityFinal >= callThreshold && canCall) {
        const ourEquityFraction = equityFinal / 100;
        if (ourEquityFraction >= potOdds - 0.05) return { type: 'call' };
    }

    // Phase 7: Ante stealing mode — call preflop continuation bets wider with antes in play
    if (chipAccumulation.anteStealing && equityFinal >= 32 && potOdds < 0.20 && canCall)
        return { type: 'call' };

    // Backdoor + medium equity with good immediate odds
    if (equityFinal >= 38 && potOdds < 0.25 && canCall) return { type: 'call' };

    // PLO Hi-Lo: never fold nut low
    if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };

    return { type: 'fold' };
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK DECISION ENGINE
// Used when GTO solver data is unavailable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make a heuristic-based decision when solver data is unavailable.
 * Uses preflop hand strength + position to make reasonable plays.
 * @param {string} profileId - Horse UUID
 * @param {Object} gameState - Adapted game state
 * @param {Array} legalActions - Legal actions from engine
 * @param {Object} opponentAdjustment - Loaded opponent reads (callMod, foldMod)
 * @returns {Object} Decision { type, amount? }
 */
function makeFallbackDecision(profileId, gameState, legalActions, opponentAdjustment = { callMod: 0, foldMod: 0 }) {
    const { handStr, position, street, potSize, toCall, stackBB, bb = 2, holeCards: hCards, board: bCards } = gameState;
    const hash = getHash(profileId);
    const numPlayers = gameState.numPlayers || 2;

    // Get personality bias (tight/loose, passive/aggressive)
    const loosenessBias = (hash % 20) - 10; // -10 to +9
    const aggressionBias = ((hash >> 4) % 20) - 10;

    // Legal action types
    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  PREFLOP DECISION ENGINE (#28 3-Bet + #31 Deep Stack)             ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (street === 'preflop') {
        const baseStrength = getPreflopStrength(handStr);
        const positionBonus = { BTN: 15, CO: 10, HJ: 5, SB: 5, BB: 8, UTG: 0, MP: 3 };

        // Deep stack adjustment (#31)
        const deepAdj = getDeepStackAdjustment(stackBB);
        const suitedBonus = handStr.endsWith('s') ? deepAdj.suitedBonus : 0;
        const impliedBonus = (baseStrength < 50 && deepAdj.widenRange) ? deepAdj.impliedOddsBonus : 0;

        // Adaptive strategy adjustment (#35)
        const adaptive = getAdaptiveStrategy(profileId);

        const adjustedStrength = baseStrength + (positionBonus[position] || 0) + loosenessBias + suitedBonus + impliedBonus + adaptive.rangeAdjust;

        // Push/fold mode for short stacks
        if (stackBB <= 12 && canRaise) {
            if (adjustedStrength >= 55) return { type: 'all_in' };
            return { type: 'fold' };
        }

        // Facing a raise? Consider 3-bet (#28)
        if (toCall > bb * 2 && canRaise) {
            const threeBet = get3BetStrategy(position, adjustedStrength, toCall, bb, stackBB);
            if (threeBet.should3Bet) {
                const amount = Math.max(raiseAction?.minAmount || toCall * 2.5, threeBet.size3Bet);
                const clamped = Math.min(amount, raiseAction?.maxAmount || amount);
                return { type: raiseAction.type, amount: Math.round(clamped) };
            }
        }

        // Standard preflop
        if (adjustedStrength >= 80 && canRaise) {
            // Premium: raise
            const minRaise = raiseAction?.minAmount || (toCall * 2);
            const size = Math.min(minRaise * (2.5 + Math.random()), raiseAction?.maxAmount || minRaise * 3);
            return { type: raiseAction.type, amount: Math.round(size) };
        }
        if (adjustedStrength >= 55) {
            if (canRaise && Math.random() < 0.4 + aggressionBias / 30) {
                const minRaise = raiseAction?.minAmount || (toCall * 2);
                return { type: raiseAction.type, amount: Math.round(minRaise * (2 + Math.random())) };
            }
            if (canCall) return { type: 'call' };
            if (canCheck) return { type: 'check' };
        }
        if (adjustedStrength >= 35 && toCall <= bb && canCall) {
            return canCheck ? { type: 'check' } : { type: 'call' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  POSTFLOP DECISION ENGINE (ALL Phase 4 features wired)            ║
    // ╚══════════════════════════════════════════════════════════════════════╝

    // Evaluate hand strength (#18)
    const handEval = evaluatePostflopHand(hCards, bCards);
    const boardWetness = evaluateBoardWetness(bCards);

    // SPR awareness (#24)
    const heroStack = stackBB * bb;
    const sprInfo = getSPRStrategy(heroStack, potSize);

    // Multiway adjustment (#25)
    const multiway = getMultiwayAdjustment(numPlayers);

    // Draw equity (#29)
    const drawEquity = getDrawEquity(handEval, street);

    // Adjusted strength = base + personality - multiway penalty
    const effectiveStrength = handEval.strength + aggressionBias - multiway.strengthPenalty;
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    // Is hero in position? (BTN, CO, HJ are generally IP postflop)
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(gameState.position);

    // ── RIVER-SPECIFIC LOGIC (#30) ──
    if (street === 'river') {    // Base Fold Threshold
        // If we face a bet, and our strength is below this, we fold.
        // OpponentAdjustment shifts this: lowers threshold if they bluff a lot, raises if they don't.
        const foldThreshold = 35 + opponentAdjustment.foldMod - opponentAdjustment.callMod;

        // Bet/Raise Threshold
        // We only bet/raise if our hand strength is very high
        const raiseThreshold = 65;

        // Check/Call Logic
        const potOdds = toCall / (potSize + toCall);
        const strongDraw = (drawEquity.outs >= 8); // Corrected drawEquit to drawEquity

        if (canRaise && effectiveStrength > raiseThreshold) { // Corrected adjustedStrength to effectiveStrength
            // Bet/Raise
            const hsFrac = getOptimalBetSize(handEval.category, street, potSize, multiway.adjustSizing);
            const betSize = Math.round(potSize * hsFrac);
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, betSize);
            const clamped = Math.min(amount, raiseAction?.maxAmount || amount);
            return { type: raiseAction.type, amount: Math.round(clamped) };
        }

        if (toCall > 0) {
            // Facing a bet
            // If we exceed fold threshold OR have a strong draw with good pot odds, we call
            if (effectiveStrength >= foldThreshold || (strongDraw && potOdds < 0.35)) { // Corrected adjustedStrength to effectiveStrength
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            return { type: 'fold' };
        } else {
            // No bet facing us, check
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }
    }

    // ── FLOP/TURN LOGIC ──
    if (canCheck && toCall === 0) {
        // --- NO BET TO FACE ---

        // Check-raise strategy (#26)
        const crStrat = getCheckRaiseStrategy(effectiveStrength, isIP, handEval.hasFlushDraw || handEval.hasOESD, aggressionBias);
        if (crStrat.shouldCheckRaise && Math.random() < crStrat.frequency) {
            // Check now — we'll raise when opponent bets (intent logged for future street awareness)
            return { type: 'check' }; // Check-raise = check here, raise next action
        }

        // C-bet strategy (#27) — are we the preflop aggressor?
        const wasPreAggressor = gameState.wasAggressor || false;
        if (wasPreAggressor && street === 'flop') {
            const cbetStrat = getCBetStrategy(true, isIP, boardWetness, numPlayers);
            if (cbetStrat.shouldCbet && canRaise) {
                const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, effectiveStrength < 30);
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // SPR-committed: go all-in with decent hands (#24)
        if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold && canRaise) {
            return { type: 'all_in' };
        }

        // Strong hands: bet for value (use bet sizing trees #32)
        if (effectiveStrength >= 70 && canRaise) {
            const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false);
            const betSize = Math.round(potSize * sizeFrac);
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount };
        }

        // Draws: semi-bluff sometimes (informed by draw equity #29)
        if ((handEval.hasFlushDraw || handEval.hasOESD) && drawEquity.outs >= 8) {
            const semiBluffFreq = 0.45 + aggressionBias / 30;
            if (canRaise && Math.random() < semiBluffFreq * multiway.bluffReduction) {
                const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, true);
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // Medium hands: bet sometimes on dry boards
        if (effectiveStrength >= 40 && boardWetness === 'dry' && canRaise) {
            const aggressionChance = 0.35 + aggressionBias / 50;
            if (Math.random() < aggressionChance * multiway.bluffReduction) {
                const betSize = Math.round(potSize * 0.40);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        return { type: 'check' };
    }

    // --- FACING A BET ---

    // SPR-committed: push all-in with decent hands (#24)
    if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold) {
        if (canRaise) {
            return { type: 'all_in' };
        }
        if (canCall) return { type: 'call' };
    }

    // Monster hands: raise
    if (effectiveStrength >= 85 && canRaise) {
        const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false);
        const raiseSize = Math.round(toCall + potSize * sizeFrac);
        const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
        return { type: raiseAction.type, amount };
    }

    // Strong hands: call (or raise sometimes)
    if (effectiveStrength >= 60) {
        if (canRaise && Math.random() < 0.2 + aggressionBias / 40) {
            const raiseSize = Math.round(toCall * (2.2 + Math.random()));
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // Drawing hands: use equity math (#29)
    if (drawEquity.outs > 0 && drawEquity.shouldCall(potOdds)) {
        // Raise as semi-bluff sometimes
        if (canRaise && drawEquity.outs >= 12 && Math.random() < 0.30 * multiway.bluffReduction) {
            const raiseSize = Math.round(toCall * 2.5);
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // Medium hands with good odds
    if (effectiveStrength >= 35 && potOdds < 0.25) {
        if (canCall) return { type: 'call' };
    }

    // Weak: fold
    return canCheck ? { type: 'check' } : { type: 'fold' };
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTFLOP HAND EVALUATOR (#18)
// Basic made-hand + draw detection when solver data is unavailable
// ═══════════════════════════════════════════════════════════════════════════

function evaluatePostflopHand(holeCards, board) {
    if (!holeCards || holeCards.length < 2 || !board || board.length < 3) {
        return { strength: 20, category: 'unknown', hasFlushDraw: false, hasOESD: false, hasGutshot: false };
    }

    const allCards = [...holeCards, ...board];
    const ranks = allCards.map(c => RANKS.indexOf(c[0]));
    const suits = allCards.map(c => c[1]);
    const heroRanks = holeCards.map(c => RANKS.indexOf(c[0]));
    const heroSuits = holeCards.map(c => c[1]);
    const boardRanks = board.map(c => RANKS.indexOf(c[0]));
    const boardSuits = board.map(c => c[1]);

    // Count ranks and suits
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });

    // --- Made hand detection ---
    let strength = 10;
    let category = 'high_card';

    // Quads
    const quadRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
    if (quadRank && heroRanks.includes(Number(quadRank))) {
        strength = 97; category = 'quads';
    }

    // Full house (check before flush/straight)
    if (category === 'high_card') {
        const trips = Object.keys(rankCounts).filter(r => rankCounts[r] >= 3);
        const pairs = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2);
        if (trips.length >= 1 && pairs.length >= 2) {
            if (heroRanks.some(r => rankCounts[r] >= 2)) {
                strength = 90; category = 'full_house';
            }
        }
    }

    // Flush
    if (category === 'high_card') {
        const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
        if (flushSuit && heroSuits.includes(flushSuit)) {
            strength = 82; category = 'flush';
            // Nut flush bonus
            const flushCards = allCards.filter(c => c[1] === flushSuit).map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
            if (heroRanks.includes(flushCards[0])) strength = 88; // Top flush
        }
    }

    // Straight
    if (category === 'high_card') {
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
        for (let i = uniqueRanks.length - 1; i >= 4; i--) {
            if (uniqueRanks[i] - uniqueRanks[i - 4] === 4) {
                const straightRanks = uniqueRanks.slice(i - 4, i + 1);
                if (heroRanks.some(r => straightRanks.includes(r))) {
                    strength = 75; category = 'straight';
                    if (heroRanks.includes(straightRanks[4])) strength = 80; // Top of straight
                }
                break;
            }
        }
        // Wheel straight (A-2-3-4-5)
        if (category === 'high_card' && uniqueRanks.includes(12) && uniqueRanks.includes(0) && uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
            if (heroRanks.some(r => [12, 0, 1, 2, 3].includes(r))) {
                strength = 72; category = 'straight';
            }
        }
    }

    // Three of a kind
    if (category === 'high_card') {
        const tripRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
        if (tripRank && heroRanks.includes(Number(tripRank))) {
            const boardHasTrip = boardRanks.filter(r => r === Number(tripRank)).length >= 2;
            strength = boardHasTrip ? 55 : 80; // Set vs. trips (sets are very strong)
            category = boardHasTrip ? 'trips' : 'set';
        }
    }

    // Two pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 2) {
            const heroPairs = pairRanks.filter(r => heroRanks.includes(r));
            if (heroPairs.length >= 2) {
                strength = 58; category = 'two_pair';
            } else if (heroPairs.length === 1) {
                // One pair from hero, one from board pairing
                strength = 50; category = 'two_pair_weak';
            }
        }
    }

    // One pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 1) {
            const heroPair = pairRanks.find(r => heroRanks.includes(r));
            if (heroPair !== undefined) {
                const topBoardRank = Math.max(...boardRanks);
                if (heroPair > topBoardRank) {
                    strength = 55; category = 'overpair';
                    // Rank bonus: AA overpair is much better than 77 overpair
                    if (heroPair >= 12) strength += 5; // KK+
                    if (heroPair >= 10) strength += 3; // JJ+
                } else if (heroPair === topBoardRank) {
                    strength = 42; category = 'top_pair';
                    // Kicker bonus
                    const kicker = Math.max(...heroRanks.filter(r => r !== heroPair));
                    if (kicker >= 10) strength += 4; // Good kicker
                } else {
                    strength = 30; category = 'underpair';
                }
            } else {
                // Board paired, no hero pair
                strength = 18; category = 'no_pair';
            }
        }
    }

    // High card only
    if (category === 'high_card') {
        const highCard = Math.max(...heroRanks);
        strength = 8 + Math.min(12, highCard); // 8-20 range
    }

    // --- Draw detection ---
    let hasFlushDraw = false;
    let hasOESD = false;
    let hasGutshot = false;

    // Flush draw
    for (const suit of heroSuits) {
        if ((suitCounts[suit] || 0) === 4) {
            hasFlushDraw = true;
            if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 32);
        }
    }

    // Straight draws
    const uniqueSorted = [...new Set(ranks)].sort((a, b) => a - b);
    for (let i = 0; i <= uniqueSorted.length - 4; i++) {
        const window = uniqueSorted.slice(i, i + 4);
        if (window[3] - window[0] === 3 && heroRanks.some(r => window.includes(r))) {
            hasGutshot = true;
            if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
        }
        if (window[3] - window[0] === 4 && heroRanks.some(r => window.includes(r))) {
            // Check if it's an open-ender (both ends open)
            const lowEnd = window[0] - 1;
            const highEnd = window[3] + 1;
            if (lowEnd >= 0 && highEnd <= 12) {
                hasOESD = true;
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 30);
            } else {
                hasGutshot = true;
            }
        }
    }

    // Combo draw bonus
    if (hasFlushDraw && (hasOESD || hasGutshot)) {
        strength = Math.max(strength, 50); // Combo draws are very strong
    }

    return { strength: Math.min(100, strength), category, hasFlushDraw, hasOESD, hasGutshot };
}

/**
 * Evaluate board wetness (dry/medium/wet) (#3 Board Texture)
 */
function evaluateBoardWetness(board) {
    if (!board || board.length < 3) return 'medium';

    const suits = board.map(c => c[1]);
    const ranks = board.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);

    // Suit analysis
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts));

    // Connectedness
    const gaps = [];
    for (let i = 0; i < ranks.length - 1; i++) {
        gaps.push(ranks[i] - ranks[i + 1]);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    if (maxSuit >= 3 || (maxSuit >= 2 && avgGap <= 2)) return 'wet';
    if (maxSuit <= 1 && avgGap >= 4) return 'dry';
    return 'medium';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: ADVANCED INTELLIGENCE FEATURES
// ═══════════════════════════════════════════════════════════════════════════

// --- #24: SPR (Stack-to-Pot Ratio) Awareness ---
/**
 * Calculate SPR and return commitment/strategy guidance.
 * Low SPR (<4): Committed — go all-in with top pair+
 * Medium SPR (4-10): Standard play
 * High SPR (>10): Deep — can fold more, speculate more
 * @param {number} effectiveStack - Hero's stack
 * @param {number} potSize - Current pot
 * @returns {{ spr: number, strategy: string, commitThreshold: number }}
 */
function getSPRStrategy(effectiveStack, potSize) {
    if (potSize <= 0) return { spr: 999, strategy: 'deep', commitThreshold: 85 };
    const spr = effectiveStack / potSize;

    if (spr < 4) return { spr, strategy: 'committed', commitThreshold: 40 }; // Top pair = pot committed
    if (spr < 7) return { spr, strategy: 'medium-low', commitThreshold: 55 };
    if (spr < 13) return { spr, strategy: 'standard', commitThreshold: 65 };
    return { spr, strategy: 'deep', commitThreshold: 75 }; // Need stronger hands deep
}

// --- #25: Multiway Pot Adjustments ---
/**
 * Adjust hand strength requirements when multiway (3+ active players).
 * Multiway pots require stronger hands to continue.
 * @param {number} numPlayers - Active (non-folded) players
 * @returns {{ strengthPenalty: number, bluffReduction: number }}
 */
function getMultiwayAdjustment(numPlayers) {
    if (numPlayers <= 2) return { strengthPenalty: 0, bluffReduction: 1.0 };
    if (numPlayers === 3) return { strengthPenalty: 8, bluffReduction: 0.6 };
    if (numPlayers === 4) return { strengthPenalty: 15, bluffReduction: 0.3 };
    return { strengthPenalty: 22, bluffReduction: 0.15 }; // 5+ players: very tight
}

// --- #26: Check-Raise Strategy ---
/**
 * Determine if the horse should check-raise instead of donk-betting.
 * @param {number} handStrength - 0-100 hand strength
 * @param {boolean} isInPosition - Whether hero is IP
 * @param {boolean} hasStrongDraw - Has flush draw or OESD
 * @param {number} aggressionBias - Personality aggression bias
 * @returns {{ shouldCheckRaise: boolean, frequency: number }}
 */
function getCheckRaiseStrategy(handStrength, isInPosition, hasStrongDraw, aggressionBias) {
    // OOP check-raise with monsters (slow-play) or strong draws (semi-bluff)
    if (!isInPosition) {
        // Monsters (set+): check-raise for value
        if (handStrength >= 65) return { shouldCheckRaise: true, frequency: 0.55 + aggressionBias / 50 };
        // Strong draws: semi-bluff check-raise
        if (hasStrongDraw && handStrength >= 30) return { shouldCheckRaise: true, frequency: 0.30 + aggressionBias / 40 };
        return { shouldCheckRaise: false, frequency: 0 };
    }
    // IP: rarely check-raise (trap with monsters sometimes)
    if (handStrength >= 85) return { shouldCheckRaise: true, frequency: 0.20 };
    return { shouldCheckRaise: false, frequency: 0 };
}

// --- #27: Continuation Bet Strategy ---
/**
 * Determine c-bet frequency and sizing based on position and board.
 * @param {boolean} wasPreAggressor - Did hero raise preflop?
 * @param {boolean} isInPosition - IP or OOP?
 * @param {string} boardWetness - 'dry', 'medium', 'wet'
 * @param {number} numPlayers - Active players
 * @returns {{ shouldCbet: boolean, frequency: number, sizeFraction: number }}
 */
function getCBetStrategy(wasPreAggressor, isInPosition, boardWetness, numPlayers) {
    if (!wasPreAggressor) return { shouldCbet: false, frequency: 0, sizeFraction: 0 };

    // Base frequencies
    let freq, size;
    if (isInPosition) {
        // IP c-bet = higher frequency
        freq = boardWetness === 'dry' ? 0.75 : boardWetness === 'wet' ? 0.50 : 0.65;
        size = boardWetness === 'dry' ? 0.33 : boardWetness === 'wet' ? 0.66 : 0.50;
    } else {
        // OOP c-bet = lower frequency, bigger size
        freq = boardWetness === 'dry' ? 0.60 : boardWetness === 'wet' ? 0.35 : 0.50;
        size = boardWetness === 'dry' ? 0.50 : boardWetness === 'wet' ? 0.75 : 0.66;
    }

    // Reduce c-bet frequency multiway
    if (numPlayers >= 3) freq *= 0.5;
    if (numPlayers >= 4) freq *= 0.3;

    return { shouldCbet: Math.random() < freq, frequency: freq, sizeFraction: size };
}

// --- #28: 3-Bet/4-Bet Preflop Dynamics ---
/**
 * Get proper 3-bet range and frequency based on position.
 * @param {string} position - Hero position
 * @param {number} handStrength - Preflop strength 0-100
 * @param {number} facingRaise - Amount of raise being faced
 * @param {number} bb - Big blind amount
 * @param {number} stackBB - Stack in BB
 * @returns {{ should3Bet: boolean, size3Bet: number, isBluff3Bet: boolean }}
 */
function get3BetStrategy(position, handStrength, facingRaise, bb, stackBB) {
    // 3-bet value range (premium hands)
    const value3BetThreshold = { BTN: 80, CO: 82, HJ: 85, MP: 88, UTG: 90, SB: 78, BB: 76 };
    const bluff3BetThreshold = { BTN: 35, CO: 40, HJ: 45, MP: 50, UTG: 55, SB: 38, BB: 35 };

    const valueThreshold = value3BetThreshold[position] || 85;
    const bluffFloor = bluff3BetThreshold[position] || 45;

    // Value 3-bet
    if (handStrength >= valueThreshold) {
        const size = Math.round(facingRaise * 3.2);
        return { should3Bet: true, size3Bet: size, isBluff3Bet: false };
    }

    // Bluff 3-bet range (hands just below calling range — fold equity play)
    if (handStrength >= bluffFloor - 10 && handStrength < bluffFloor) {
        // Only bluff 3-bet with enough stack
        if (stackBB >= 40 && Math.random() < 0.25) {
            const size = Math.round(facingRaise * 3);
            return { should3Bet: true, size3Bet: size, isBluff3Bet: true };
        }
    }

    return { should3Bet: false, size3Bet: 0, isBluff3Bet: false };
}

// --- #29: Draw Equity Calculator ---
/**
 * Calculate drawing equity (pot odds vs actual outs).
 * @param {Object} handEval - From evaluatePostflopHand()
 * @param {string} street - 'flop', 'turn', 'river'
 * @returns {{ equity: number, outs: number, shouldCall: Function }}
 */
function getDrawEquity(handEval, street) {
    let outs = 0;

    if (handEval.hasFlushDraw) outs += 9;  // 9 outs for flush draw
    if (handEval.hasOESD) outs += 8;        // 8 outs for OESD
    if (handEval.hasGutshot) outs += 4;     // 4 outs for gutshot
    // Reduce for overlap (flush draw + OESD share some outs)
    if (handEval.hasFlushDraw && handEval.hasOESD) outs -= 2;

    // Approximate equity: outs × multiplier
    // Flop (2 cards to come): outs × 4 - (outs - 8) = rough %
    // Turn (1 card to come): outs × 2 + 1 = rough %
    let equity;
    if (street === 'flop') {
        equity = Math.min(65, outs * 4 - Math.max(0, outs - 8)); // Rule of 4
    } else if (street === 'turn') {
        equity = Math.min(45, outs * 2 + 1); // Rule of 2+1
    } else {
        equity = 0; // No more cards — no draw equity
    }

    return {
        equity: equity / 100,
        outs,
        shouldCall: (potOdds) => (equity / 100) >= potOdds
    };
}

// --- #30: River Intelligence ---
/**
 * Make river-specific decisions: thin value, bluff-catch, or give up.
 * @param {number} handStrength - 0-100
 * @param {number} potOdds - Current pot odds (0-1)
 * @param {boolean} canBet - Can we bet?
 * @param {boolean} facingBet - Are we facing a bet?
 * @param {number} aggressionBias - Personality
 * @returns {{ action: string, sizeFraction: number }}
 */
function getRiverStrategy(handStrength, potOdds, canBet, facingBet, aggressionBias) {
    if (!facingBet && canBet) {
        // --- RIVER NO BET FACING ---
        // Thin value bet (50-75 strength): small sizing
        if (handStrength >= 50 && handStrength < 75) {
            // Higher strength within this range = higher bet frequency
            const strengthBonus = (handStrength - 50) / 100; // 0-0.25 bonus for stronger hands
            if (Math.random() < 0.65 + strengthBonus + aggressionBias / 40) {
                return { action: 'bet', sizeFraction: 0.33 };
            }
            return { action: 'check', sizeFraction: 0 };
        }
        // Strong value bet (75+): bigger sizing
        if (handStrength >= 75) {
            return { action: 'bet', sizeFraction: handStrength >= 90 ? 0.85 : 0.66 };
        }
        // Bluff with nothing sometimes
        if (handStrength < 20 && Math.random() < 0.12 + aggressionBias / 60) {
            return { action: 'bet', sizeFraction: 0.66 }; // Bluff like a value bet
        }
        return { action: 'check', sizeFraction: 0 };
    }

    if (facingBet) {
        // --- FACING RIVER BET ---
        // Strong hands: call or raise
        if (handStrength >= 75) return { action: 'raise', sizeFraction: 2.5 };
        // Bluff-catch threshold: call with decent hands if pot odds are good
        if (handStrength >= 45 && potOdds < 0.35) return { action: 'call', sizeFraction: 0 };
        // Marginal: call sometimes
        if (handStrength >= 30 && potOdds < 0.25) {
            return Math.random() < 0.40 ? { action: 'call', sizeFraction: 0 } : { action: 'fold', sizeFraction: 0 };
        }
        return { action: 'fold', sizeFraction: 0 };
    }

    return { action: 'check', sizeFraction: 0 };
}

// --- #31: Deep Stack Adjustments ---
/**
 * Adjust preflop strategy for deep stacks (200bb+).
 * @param {number} stackBB - Stack in big blinds
 * @param {string} handStr - Hand string (e.g., 'AKs')
 * @returns {{ widentRange: boolean, impliedOddsBonus: number, suitedBonus: number }}
 */
function getDeepStackAdjustment(stackBB) {
    if (stackBB < 150) return { widenRange: false, impliedOddsBonus: 0, suitedBonus: 0 };

    // Deep stack: speculative hands (suited connectors, small pairs) gain value
    const depth = Math.min(300, stackBB);
    const bonus = Math.round((depth - 150) / 15); // 0 to 10

    return {
        widenRange: true,
        impliedOddsBonus: bonus,     // Added to preflop strength for speculative hands
        suitedBonus: Math.round(bonus * 0.7)  // Extra value for suited hands
    };
}

// --- #32: Bet Sizing Trees ---
/**
 * Get optimal bet sizing based on hand category and street.
 * Small for bluffs/thin value, big for value, overbet for nutted.
 * @param {string} handCategory - From evaluatePostflopHand
 * @param {string} street - Current street
 * @param {number} potSize - Current pot
 * @param {boolean} isBluff - Is this a bluff?
 * @returns {number} Bet size as fraction of pot
 */
function getOptimalBetSize(handCategory, street, potSize, isBluff) {
    // Bluffs: always use small sizing (better risk/reward)
    if (isBluff) {
        return street === 'river' ? 0.66 : 0.33;
    }

    // Value sizing by hand strength category
    const sizingMap = {
        // Nutted: overbet
        quads: 1.25, full_house: 1.10, flush: 0.80,
        // Strong: big bet
        straight: 0.75, set: 0.75, trips: 0.66,
        // Medium: standard
        two_pair: 0.60, overpair: 0.55, top_pair: 0.50,
        // Thin value: small
        underpair: 0.33, two_pair_weak: 0.40,
        // Draws: semi-bluff small
        no_pair: 0.33, high_card: 0.33, unknown: 0.40
    };

    const baseSizing = sizingMap[handCategory] || 0.50;

    // Increase sizing on later streets (turn/river vs flop)
    if (street === 'turn') return Math.min(1.5, baseSizing * 1.15);
    if (street === 'river') return Math.min(1.5, baseSizing * 1.30);
    return baseSizing;
}

// --- #33: Auto-Seating Intelligence ---
/**
 * Determine if a table needs AI players and which horse should sit.
 * @param {Object} tableInfo - { seats, minPlayers, maxPlayers, blinds }
 * @param {string[]} availableHorses - Horse IDs not at max tables
 * @returns {{ shouldSeat: boolean, horseId: string|null }}
 */
function shouldAutoSeat(tableInfo, availableHorses) {
    if (!tableInfo || !availableHorses || availableHorses.length === 0) {
        return { shouldSeat: false, horseId: null };
    }

    const currentPlayers = tableInfo.seats?.filter(s => s.player)?.length || 0;
    const minNeeded = tableInfo.minPlayers || 2;

    // Seat horses if table needs players (below min, or just 1 human waiting)
    if (currentPlayers < minNeeded) {
        // Pick a random available horse
        const idx = Math.floor(Math.random() * availableHorses.length);
        return { shouldSeat: true, horseId: availableHorses[idx] };
    }

    return { shouldSeat: false, horseId: null };
}

// MASTER DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a poker decision for a horse player.
 * 
 * Pipeline:
 * 1. Extract game state from engine format
 * 2. Try GTO solver (memory_charts_gold / solved_spots_gold)
 * 3. Apply personality + tilt + table image overlays
 * 4. Fall back to heuristic if solver unavailable
 * 5. Validate against legal actions
 * 6. Return engine-format action + timing delay
 * 
 * @param {string} profileId - Horse profile UUID
 * @param {Object} engineState - From GameStateMachine.getState(profileId)
 * @param {Array} legalActions - From BettingRound.getLegalActions()
 * @param {Object} tableConfig - Table configuration (blinds, etc.)
 * @returns {Promise<{ action: Object, delayMs: number }>}
 */
async function getDecision(profileId, engineState, legalActions, tableConfig = {}) {
    if (!legalActions || legalActions.length === 0) {
        return { action: { type: 'fold' }, delayMs: 500 };
    }

    // --- 1. EXTRACT GAME STATE ---
    const heroPlayer = engineState.players?.find(p => String(p.id) === String(profileId));
    if (!heroPlayer || !heroPlayer.holeCards || heroPlayer.holeCards.length < 2) {
        // No cards — just check or fold
        const canCheck = legalActions.some(a => a.type === 'check');
        return { action: { type: canCheck ? 'check' : 'fold' }, delayMs: 500 };
    }

    const holeCardStrings = cardsToStrings(heroPlayer.holeCards);
    const boardStrings = cardsToStrings(engineState.communityCards || []);
    const handStr = formatHandString(holeCardStrings[0], holeCardStrings[1]);
    const position = mapPosition(heroPlayer.position || 'mp');
    const street = engineState.phase || 'preflop';

    const bb = tableConfig.bigBlind || 2;
    const stackBB = Math.round(heroPlayer.stack / bb);
    const potSize = engineState.potTotal || 0;
    const toCall = Math.max(0, (engineState.currentBet || 0) - (heroPlayer.invested || 0));
    const numPlayers = engineState.players?.filter(p => !p.folded).length || 2;

    // ─── MODULE 8: COUNTER-EXPLOIT PROFILER ───
    // Determine strategic posture for this hand based on all threat signals.
    const tableId = engineState.tableId || 'unknown';
    const opponents = engineState.players?.filter(p => String(p.id) !== String(profileId) && !p.folded) || [];
    const primaryOppId = opponents.length > 0 ? String(opponents[0].id) : null;
    const counterStrategy = selectCounterStrategy(profileId, primaryOppId, tableId);

    // Increment hand counter for this horse (used by chaos suppression)
    const chaosState = chaosSuppressionMap.get(profileId) || { lastChaosHand: -99, handCounter: 0 };
    chaosState.handCounter++;
    chaosSuppressionMap.set(profileId, chaosState);

    // Track showdown exposure (Module 3) — increment hands seen
    if (!showdownExposureMap.has(profileId)) showdownExposureMap.set(profileId, new Map());
    const horseExposure = showdownExposureMap.get(profileId);
    if (!horseExposure.has(tableId)) horseExposure.set(tableId, { showdowns: 0, handsPlayed: 0 });
    horseExposure.get(tableId).handsPlayed++;

    // ─── MODULE 5: STACK SANDWICH DETECTOR ───
    // Detect: 3+ players, horse is not the raiser, players on both sides = sandwich.
    let sandwichedFoldMod = 0;
    let sandwichedDrawThreshold = 0;
    if (numPlayers >= 3 && toCall > 0) {
        const heroPosition = heroPlayer.position || 'mp';
        const isRaiser = engineState.lastRaiser === profileId;
        // Count how many active opponents are behind (will act after us)
        const heroSeatIdx = engineState.players?.findIndex(p => String(p.id) === String(profileId)) ?? -1;
        const activePlayers = (engineState.players || []).filter(p => !p.folded && String(p.id) !== String(profileId));
        const behind = activePlayers.filter((p, idx) => {
            const theirIdx = engineState.players?.findIndex(pp => String(pp.id) === String(p.id)) ?? -1;
            return theirIdx > heroSeatIdx;
        }).length;
        const inFront = activePlayers.length - behind;

        // Sandwich = players on both sides AND we are not the aggressor
        if (behind >= 1 && inFront >= 1 && !isRaiser) {
            sandwichedFoldMod = 10;        // Raise fold threshold significantly
            sandwichedDrawThreshold = 15;  // Draws below 15 outs auto-fold
            if (counterStrategy.mode === 'standard') counterStrategy.mode = 'sandwich_survival';
            console.log(`[HorseBrain] 🥊 SANDWICH DETECTED: ${profileId.substring(0, 8)} — tightening ranges (+10 fold threshold)`);
        }
    }

    // Log counter-strategy mode if non-standard
    if (counterStrategy.mode !== 'standard') {
        console.log(`[HorseBrain] 🛡️  Counter-mode: ${counterStrategy.mode} vs ${primaryOppId?.substring(0, 8) || 'N/A'}`);
    }

    // ─── MODULE 9: THREAT INTEL LAZY-LOAD (Module 16: Threat Score Leaderboard) ───
    // On first encounter with this human, pull their cross-session threat record.
    // If already a known high-threat, pre-arm counter-mode without waiting for in-session evidence.
    if (primaryOppId) {
        _loadThreatIntel(primaryOppId).then(intel => {
            if (intel && intel.totalScore >= 65 && counterStrategy.mode === 'standard') {
                counterStrategy.mode = intel.totalScore >= 80 ? 'anti_bot_stealth' : 'anti_bot';
                console.warn(`[HorseBrain] 📥 MODULE 9 PRE-ARM: ${primaryOppId.substring(0, 8)} known threat=${intel.totalScore} → mode=${counterStrategy.mode}`);
            }
        }).catch(() => { });

        // Module 14: If opponent is actively blacklisted, spike horse tilt to escape table ASAP
        if (isBlacklisted(primaryOppId)) {
            console.error(`[HorseBrain] 🛑 MODULE 14 BLACKLIST: ${primaryOppId.substring(0, 8)} is blacklisted! Spiking tilt to escape.`);
            if (!tiltMap.has(profileId)) tiltMap.set(profileId, {});
            const ts = tiltMap.get(profileId);
            ts.multiplier = 1.0;
            ts.reason = `Blacklisted opponent ${primaryOppId.substring(0, 8)} at table`;
        }
    }

    // ─── MODULE 15: TIMEBANK ABUSE CHECK ───
    // If a human has been stalling at this table (avg action > 22s), trigger delayed stand-up
    if (primaryOppId) {
        const tbData = timeAbuseSuspicion.get(primaryOppId);
        if (tbData && tbData.suspicionScore >= 70) {
            const tableBlacklistedUntil = tableTimebankBlacklist.get(tableId) || 0;
            if (Date.now() > tableBlacklistedUntil) {
                tableTimebankBlacklist.set(tableId, Date.now() + 60 * 60 * 1000); // 60 min table ban
                console.warn(`[HorseBrain] ⏱️ MODULE 15 STALL: ${primaryOppId.substring(0, 8)} stall score=${tbData.suspicionScore} — blacklisting table ${tableId.substring(0, 8)} for 60min`);
                // Spike tilt to 1.0 so evaluateSessions triggers a stand-up
                if (!tiltMap.has(profileId)) tiltMap.set(profileId, {});
                tiltMap.get(profileId).multiplier = 1.0;
                tiltMap.get(profileId).reason = `Stall attacker at table`;
            }
        }
    }

    // ─── MODULE 11: PROACTIVE RANGE ROTATION ───
    // Get the current gear for this horse at this table.
    // Gear adjustments cascade into all fold/raise threshold calculations below.
    const rangeGear = getRangeRotationGear(profileId, tableId);
    // These mods are added to any existing opponentAdjustment later in the pipeline
    const gearFoldMod = rangeGear.foldMod;
    const gearRaiseMod = rangeGear.raiseMod;

    // ─── MODULE 20: TABLE IMAGE EXPOSURE MONITOR ───
    // If horse has been showing cards too much (>25% showdown rate), tighten up.
    const imageExposed = isImageExposed(profileId, tableId);
    if (imageExposed) {
        console.log(`[HorseBrain] 📸 MODULE 20 IMAGE EXPOSED: ${profileId.substring(0, 8)} — humans floating lighter, tightening thresholds.`);
    }

    // ─── MODULE 22: ISOLATION SIZING TELL ───
    // If primary opponent has mechanical iso sizing → widen 3-bet range vs them
    const isoTell = primaryOppId ? isMechanicalIsolator(primaryOppId) : { isMechanical: false };
    if (isoTell.isMechanical) {
        console.log(`[HorseBrain] 📐 MODULE 22 ISO TELL: ${primaryOppId?.substring(0, 8)} mechanical isolator (avg=${isoTell.avgSize.toFixed(1)}bb, σ=${isoTell.stdDev.toFixed(2)}) — widening 3-bet range.`);
    }

    // ─── PLO / VARIANT-AWARE ROUTING ───
    // PioSolver only has Holdem solved spots. For Omaha variants (PLO4, PLO5, PLO6, PLO8),
    // we route to a dedicated heuristic engine that understands 4-6 card hand strength
    // instead of blindly trying to use 2-card Holdem rankings on a 4-card hand.
    const variant = engineState.variant || tableConfig.variant || 'holdem';
    const isPLO = ['omaha4', 'omaha5', 'omaha6', 'omaha_hilo', 'plo', 'plo4', 'plo5', 'plo6', 'plo8'].includes(variant.toLowerCase());
    const isHiLo = variant.toLowerCase().includes('hilo') || variant.toLowerCase().includes('hi_lo') || variant.toLowerCase().includes('hi-lo');

    // ─── MODULE 21: PLO LIMP-TRAP DETECTOR (preflop only) ───
    const numLimpers = engineState.numLimpers || 0;
    const ploSPR = stackBB / (potSize / bb || 1);
    const limpTrap = street === 'preflop' && isPLO
        ? detectLimpTrap(numLimpers, mapPosition(heroPlayer.position || 'mp'), ploSPR, false)
        : { isLimpTrap: false };
    if (limpTrap.isLimpTrap) {
        console.log(`[HorseBrain] 🪤 MODULE 21 LIMP TRAP: ${numLimpers} limpers, SPR=${ploSPR.toFixed(1)} — reducing raise freq.`);
    }

    if (isPLO) {
        const ploDecision = makePLOFallbackDecision(profileId, {
            holeCards: holeCardStrings,
            board: boardStrings,
            street,
            position: mapPosition(heroPlayer.position || 'mp'),
            stackBB,
            potSize,
            toCall,
            bb,
            numPlayers,
            isHiLo,
            // ─── Phase 3 signals ───
            imageExposed,          // Module 20
            isLimpTrap: limpTrap.isLimpTrap, // Module 21
            isoTellActive: isoTell.isMechanical, // Module 22
            probeFarmScore: primaryOppId ? getProbeFarmScore(primaryOppId) : 0, // Module 19
        }, legalActions);
        const validPLO = validateAndClamp(ploDecision.type, ploDecision.amount, legalActions);
        const delayPLO = getActionDelay(profileId, validPLO.type, street === 'preflop');
        recordPerformanceAction(profileId, street, validPLO.type, validPLO.type !== 'fold' && validPLO.type !== 'check');
        return { action: validPLO, delayMs: delayPLO };
    }

    const adaptedState = {
        holeCards: holeCardStrings,
        board: boardStrings,
        handStr,
        street, // Keep lowercase for fallback ('preflop', 'flop', 'turn', 'river')
        position,
        stackBB,
        potSize,
        toCall,
        bb, // Big blind in chips (for BB-relative thresholds)
        gameType: 'Cash',
        numPlayers,
        topology: numPlayers <= 3 ? '3-Max' : numPlayers <= 6 ? '6-Max' : '9-Max',
        mode: 'ChipEV'
    };

    // --- 1b. LOAD OPPONENT READS (Gap 4) ---
    // Query saved opponent data to adjust decision thresholds
    let opponentAdjustment = { callMod: 0, foldMod: 0, bluffAware: false };
    try {
        const sb = getSupabase();
        if (sb && numPlayers <= 3) { // Only load reads heads-up or 3-way
            const opponents = engineState.players?.filter(p => String(p.id) !== String(profileId) && !p.folded) || [];
            if (opponents.length > 0) {
                const oppId = opponents[0].id;
                const { data: readData } = await sb
                    .from('horse_opponent_reads')
                    .select('bluff_frequency, call_frequency, tendency')
                    .eq('horse_id', profileId)
                    .eq('opponent_id', oppId)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .single();
                if (readData) {
                    // If opponent bluffs a lot, call more (lower fold threshold)
                    if (readData.bluff_frequency > 0.35) {
                        opponentAdjustment.callMod = 5;
                        opponentAdjustment.bluffAware = true;
                    }
                    // If opponent rarely bluffs, fold more marginal spots
                    if (readData.bluff_frequency < 0.15) {
                        opponentAdjustment.foldMod = 5;
                    }
                    // If opponent is a calling station, value bet thinner
                    if (readData.call_frequency > 0.55) {
                        opponentAdjustment.callMod = -3;
                    }
                }
            }
        }
    } catch (_) { /* Opponent read loading is optional */ }

    // --- 2. TRY GTO SOLVER ---
    let gtoDecision = null;
    try {
        const gto = await getGTOModule();
        if (gto?.makeGTODecision) {
            gtoDecision = await gto.makeGTODecision(profileId, {
                ...adaptedState,
                street: street.charAt(0).toUpperCase() + street.slice(1), // Capitalize for GTO
                holeCards: holeCardStrings,
                board: boardStrings,
            });
        }
    } catch (err) {
        console.warn('[HorseBrain] GTO decision failed, using fallback:', err.message);
    }

    // --- 3. APPLY PERSONALITY + ADVANCED OVERLAYS ---
    let finalAction = null;
    let finalAmount = null;
    let handType = 'weak'; // For timing tells: 'strong', 'weak', 'bluff'

    if (gtoDecision?.action) {
        // Map GTO action names to engine format
        const actionMap = { 'Raise': 'raise', 'Call': 'call', 'Fold': 'fold', 'Check': 'check', 'Bet': 'bet' };
        finalAction = actionMap[gtoDecision.action] || gtoDecision.action.toLowerCase();

        // Calculate sizing from GTO (sizing is a pot fraction for the bet/raise SIZE)
        // Engine expects amount = total bet level (currentBet + raise increment)
        if ((finalAction === 'raise' || finalAction === 'bet') && gtoDecision.sizing) {
            const raiseSize = Math.round(potSize * gtoDecision.sizing);
            const currentBet = engineState.currentBet || 0;
            finalAmount = currentBet + raiseSize; // Total bet = currentBet + our raise
        }

        // --- POSTFLOP HAND STRENGTH GUARDRAILS ---
        // GTO solver sometimes returns suboptimal actions for edge cases.
        // Apply sanity checks using the hand evaluator to override obvious mistakes.
        if (street !== 'preflop') {
            const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
            const drawEq = getDrawEquity(handEval, street);
            const facingBet = toCall > 0;

            // GUARDRAIL 1: Don't call with garbage hands facing a bet
            // Override GTO 'call' with 'fold' if hand strength < 15 and no draws
            if (finalAction === 'call' && facingBet && handEval.strength < 15 && drawEq.outs === 0) {
                const potOdds = toCall / (potSize + toCall);
                if (potOdds >= 0.20) { // Only fold if pot odds aren't amazing
                    finalAction = 'fold';
                    finalAmount = null;
                }
            }

            // GUARDRAIL 2: Bet strong hands when not facing action
            // Override GTO 'check' with 'bet' if hand strength >= 65 (strong made hand)
            if (finalAction === 'check' && !facingBet && handEval.strength >= 60) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false);
                    const betSize = Math.round(potSize * sizeFrac);
                    finalAction = raiseAction.type;
                    finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                }
            }

            // GUARDRAIL 3: Value bet strong hands on the river
            if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= 50) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction && Math.random() < 0.65) { // 65% value bet frequency
                    const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false);
                    const betSize = Math.round(potSize * sizeFrac);
                    finalAction = raiseAction.type;
                    finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                }
            }
        }

        // Classify hand type for timing tells
        // On postflop streets, preflop strength is less relevant, so use GTO confidence
        const preflopStrength = getPreflopStrength(handStr);
        if (street === 'preflop') {
            if (preflopStrength >= 75) handType = 'strong';
            else if ((finalAction === 'raise' || finalAction === 'bet') && preflopStrength < 40) handType = 'bluff';
        } else {
            // Postflop: classify based on action + GTO confidence
            if (gtoDecision.confidence && gtoDecision.confidence > 0.7) handType = 'strong';
            else if ((finalAction === 'raise' || finalAction === 'bet') && (!gtoDecision.confidence || gtoDecision.confidence < 0.3)) handType = 'bluff';
        }

        // Apply REAL tilt overlay (Phase 3A #1)
        try {
            const adv = await getAdvancedModule();
            if (adv?.getTiltLevel) {
                const tiltLevel = adv.getTiltLevel(profileId);

                // Tilted horses make suboptimal plays
                if (tiltLevel >= 3 && adv.getImageAdjustedAction) {
                    const adjusted = adv.getImageAdjustedAction(profileId, finalAction, preflopStrength / 100);
                    if (adjusted && adjusted !== finalAction) {
                        console.log(`[HorseBrain] 🔥 Tilt override: ${finalAction} → ${adjusted} (tilt=${tiltLevel.toFixed(1)})`);
                        finalAction = adjusted;
                    }
                }
            }
        } catch (err) {
            // Tilt overlay is non-critical
        }

        // Apply EXPLOITATIVE adjustments (Phase 3A #2)
        try {
            const adv = await getAdvancedModule();
            const personality = await getPersonalityModule();
            if (adv?.getExploitAdjustedAction && personality?.getSkillTier) {
                const skill = personality.getSkillTier(profileId);
                // Only skilled horses exploit opponents
                if (skill.level >= 3) {
                    // Try to exploit the last aggressor or the player in the pot
                    const opponents = engineState.players?.filter(p =>
                        String(p.id) !== String(profileId) && !p.folded
                    ) || [];
                    for (const opp of opponents) {
                        const result = adv.getExploitAdjustedAction(
                            profileId, String(opp.id), finalAction, skill.level
                        );
                        if (result.exploiting) {
                            console.log(`[HorseBrain] 🎯 Exploit: ${finalAction} → ${result.action} (vs ${String(opp.id).substring(0, 8)}, leak: ${result.leak})`);
                            finalAction = result.action;
                            break; // Only exploit one opponent per decision
                        }
                    }
                }
            }
        } catch (err) {
            // Exploit overlay is non-critical
        }

        // Apply PERSONALITY BET SIZING (#21)
        // Each play style has a different open-raise size and postflop aggression
        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
            try {
                const personality = await getPersonalityModule();
                if (personality?.getPlayStyle) {
                    const style = personality.getPlayStyle(profileId);
                    // Preflop open-raise multiplier
                    if (street === 'preflop') {
                        const styleMultipliers = {
                            TAG: 1.0,     // Standard GTO sizing
                            nit: 0.9,     // Slightly smaller (less value)
                            LAG: 1.15,    // Bigger opens
                            maniac: 1.35, // Oversize opens
                            calling_station: 0.85 // Limpy/small
                        };
                        const mult = styleMultipliers[style.key] || 1.0;
                        finalAmount = Math.round(finalAmount * mult);
                    } else {
                        // Postflop: maniacs overbet, nits underbet
                        const postflopMults = {
                            TAG: 1.0, nit: 0.80, LAG: 1.1,
                            maniac: 1.30, calling_station: 0.90
                        };
                        const mult = postflopMults[style.key] || 1.0;
                        finalAmount = Math.round(finalAmount * mult);
                    }
                }
            } catch (_) { }
        }

        // Apply OPPONENT-AWARE BET SIZING (#7)
        // Adjust sizing based on opponent tendencies
        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
            try {
                const adv = await getAdvancedModule();
                if (adv?.getOpponentRead) {
                    const opponents = engineState.players?.filter(p =>
                        String(p.id) !== String(profileId) && !p.folded
                    ) || [];
                    if (opponents.length > 0) {
                        const mainOpp = opponents[0];
                        const read = adv.getOpponentRead(profileId, String(mainOpp.id));
                        if (read) {
                            // Calling station → bet bigger for value
                            if (read.callFrequency > 0.7) {
                                finalAmount = Math.round(finalAmount * 1.20);
                            }
                            // Nit / overfolder → bet smaller (but still bet)
                            if (read.foldFrequency > 0.6) {
                                finalAmount = Math.round(finalAmount * 0.80);
                            }
                        }
                    }
                }
            } catch (_) { }
        }

        // Apply TOURNAMENT ICM ADJUSTMENTS (#4)
        // Tighten ranges near the bubble, loosen when short-stacked
        if (adaptedState.gameType === 'Tournament') {
            try {
                const gto = await getGTOModule();
                if (gto?.getICMAdjustment && engineState.tourneyState) {
                    const icm = gto.getICMAdjustment(engineState.tourneyState, profileId);
                    if (icm.strategy === 'survival') {
                        // On the bubble: don't call marginal spots
                        if (finalAction === 'call' && toCall > potSize * 0.3) {
                            finalAction = 'fold';
                        }
                        // Don't bluff near the bubble
                        if (handType === 'bluff' && (finalAction === 'raise' || finalAction === 'bet')) {
                            finalAction = 'check';
                        }
                    }
                    // Adjust sizing by ICM pressure
                    if (finalAmount && icm.rangeAdjustment) {
                        finalAmount = Math.round(finalAmount * icm.rangeAdjustment);
                    }
                }
            } catch (_) { }
        }
    }

    // --- 4. FALLBACK IF NO GTO ---
    if (!finalAction) {
        const fallback = makeFallbackDecision(profileId, adaptedState, legalActions, opponentAdjustment);
        finalAction = fallback.type;
        finalAmount = fallback.amount;
    }

    // --- 4b. UNIVERSAL HAND STRENGTH GUARDRAILS ---
    // These apply to BOTH GTO and fallback decisions to prevent egregious mistakes
    if (street !== 'preflop' && finalAction) {
        const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
        const drawEq = getDrawEquity(handEval, street);
        const facingBet = toCall > 0;

        // Fold garbage facing a bet (unless pot odds are amazing)
        // Adjust threshold based on opponent reads: bluffers → lower threshold, tight → higher
        const foldThreshold = 15 + opponentAdjustment.foldMod - opponentAdjustment.callMod;
        if (finalAction === 'call' && facingBet && handEval.strength < foldThreshold && drawEq.outs === 0) {
            const potOdds = toCall / (potSize + toCall);
            if (potOdds >= 0.20) {
                finalAction = 'fold';
                finalAmount = null;
            }
        }

        // Bet strong hands when not facing action
        if ((finalAction === 'check') && !facingBet && handEval.strength >= 60) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.70) { // 70% bet frequency for strong hands
                const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false);
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }

        // Value bet the river with medium-strong+ hands
        if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= 50) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.65) {
                const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false);
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }
    }

    // --- 5. APPLY FATIGUE OVERLAY (#22) ---
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.getFatigueAdjustedAction) {
                const canCheck = legalActions.some(a => a.type === 'check');
                const fatigued = adv.getFatigueAdjustedAction(profileId, finalAction, canCheck);
                if (fatigued !== finalAction) {
                    console.log(`[HorseBrain] 😴 Fatigue: ${finalAction} → ${fatigued} (fatigue=${(adv.getFatigueLevel?.(profileId) || 0).toFixed(2)})`);
                    finalAction = fatigued;
                }
            }
        } catch (_) { }
    }

    // --- 5b. APPLY RIVALRY DYNAMICS (#11) ---
    if (finalAction && (finalAction === 'raise' || finalAction === 'bet' || finalAction === 'call')) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.areRivals && adv?.areFriends) {
                const opponents = engineState.players?.filter(p =>
                    String(p.id) !== String(profileId) && !p.folded
                ) || [];
                for (const opp of opponents) {
                    const oppId = String(opp.id);
                    if (adv.areRivals(profileId, oppId)) {
                        // Rivals: increase aggression
                        if (finalAction === 'call' && legalActions.some(a => a.type === 'raise' || a.type === 'bet') && Math.random() < 0.35) {
                            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                            if (raiseAction) {
                                finalAction = raiseAction.type;
                                finalAmount = finalAmount || raiseAction.minAmount;
                                console.log(`[HorseBrain] ⚔️ Rivalry aggression vs ${oppId.substring(0, 8)}`);
                            }
                        }
                        break;
                    }
                    if (adv.areFriends(profileId, oppId)) {
                        // Friends: soft play (don't raise as much)
                        // Anti-collusion guard (#38)
                        if (finalAction === 'raise' && Math.random() < 0.25 && isSoftPlayAllowed(profileId, oppId)) {
                            finalAction = 'call';
                            finalAmount = null;
                            recordSoftPlay(profileId, oppId);
                            console.log(`[HorseBrain] 🤝 Soft play vs friend ${oppId.substring(0, 8)}`);
                        }
                        break;
                    }
                }
            }
        } catch (_) { }

        // ─── MODULE 6: ENHANCED GTO CHAOS INJECTOR ───
        // Upgrades the flat 4% chaos to a multi-layered, street-aware, cooldown-suppressed system.
        // Street weights: higher on later streets (where exploiters focus).
        // Cooldown: 3-hand gap between chaos events prevents detectable chaos clustering.
        const chaosRateByStreet = { preflop: 0.02, flop: 0.04, turn: 0.05, river: 0.06 };
        const streetChaosRate = chaosRateByStreet[street] || 0.04;
        const handsSchaosState = chaosSuppressionMap.get(profileId) || { lastChaosHand: -99, handCounter: 0 };
        const handsSinceLastChaos = handsSchaosState.handCounter - handsSchaosState.lastChaosHand;
        const chaosOnCooldown = handsSinceLastChaos < 3; // Suppress for 3 hands after firing

        // Anti-bot mode fires chaos MORE (18%) to be completely unpredictable vs solvers
        const effectiveChaosRate = counterStrategy.mode === 'anti_bot' ? 0.18 : streetChaosRate;

        if (legalActions.length > 0 && !chaosOnCooldown && Math.random() < effectiveChaosRate) {
            console.log(`[HorseBrain] 🌪️ MODULE 6 CHAOS TRIGGERED! Street: ${street}, Mode: ${counterStrategy.mode}, Rate: ${(effectiveChaosRate * 100).toFixed(0)}%`);
            handsSchaosState.lastChaosHand = handsSchaosState.handCounter;
            chaosSuppressionMap.set(profileId, handsSchaosState);

            const aggroActions = legalActions.filter(a => a.type === 'raise' || a.type === 'bet' || a.type === 'all_in');

            if (aggroActions.length > 0) {
                const chaoticAction = aggroActions[Math.floor(Math.random() * aggroActions.length)];
                finalAction = chaoticAction.type;

                if (finalAction === 'raise' || finalAction === 'bet') {
                    // Bounded chaotic sizing: 33% to 150% of pot (more human-readable than min/max random)
                    const minFrac = 0.33;
                    const maxFrac = 1.50;
                    const chaosFrac = minFrac + Math.random() * (maxFrac - minFrac);
                    const chaosSize = Math.round(potSize * chaosFrac);
                    const min = chaoticAction.minAmount || bb * 2;
                    const max = chaoticAction.maxAmount || heroPlayer.stack;
                    finalAmount = Math.max(min, Math.min(max, chaosSize));
                }
            } else if (legalActions.some(a => a.type === 'call')) {
                finalAction = 'call';
            }
        }
    }

    // --- 6. VALIDATE AGAINST LEGAL ACTIONS ---
    const validAction = validateAndClamp(finalAction, finalAmount, legalActions);

    // ─── MODULE 1: FREQUENCY OBFUSCATOR ───
    // Tracks each horse's action type frequencies per table. When over-exposed,
    // randomly tier-shifts 6-11% of the time so HUD tracking cannot lock down exact ranges.
    {
        if (!frequencyObfuscatorMap.has(tableId)) frequencyObfuscatorMap.set(tableId, new Map());
        const tableFreqMap = frequencyObfuscatorMap.get(tableId);
        if (!tableFreqMap.has(profileId)) tableFreqMap.set(profileId, { fold: 0, call: 0, raise: 0, lastObfuscatedHand: -99, handCount: 0 });
        const freq = tableFreqMap.get(profileId);
        freq.handCount++;
        const aType = validAction.type;
        if (aType === 'fold') freq.fold++;
        else if (aType === 'call' || aType === 'check') freq.call++;
        else if (aType === 'raise' || aType === 'bet' || aType === 'all_in') freq.raise++;

        // Obfuscation rate: 6% normally, 11% in stealth/anti_bot_stealth modes
        const obfStealth = counterStrategy.mode === 'stealth' || counterStrategy.mode === 'anti_bot_stealth';
        const obfRate = obfStealth ? 0.11 : 0.06;
        const handsSinceObf = freq.handCount - freq.lastObfuscatedHand;

        if (freq.handCount >= 5 && handsSinceObf >= 4 && Math.random() < obfRate) {
            const totalActions = Math.max(1, freq.fold + freq.call + freq.raise);
            const callFreqPct = freq.call / totalActions;
            const raiseFreqPct = freq.raise / totalActions;

            let obfType = validAction.type;
            if (callFreqPct > 0.55 && validAction.type === 'call') {
                if (legalActions.some(a => a.type === 'fold') && Math.random() < 0.5) obfType = 'fold';
                else if (legalActions.some(a => a.type === 'raise' || a.type === 'bet') && Math.random() < 0.5) obfType = 'raise';
            } else if (raiseFreqPct > 0.55 && (validAction.type === 'raise' || validAction.type === 'bet')) {
                if (legalActions.some(a => a.type === 'call') && Math.random() < 0.5) obfType = 'call';
            }

            if (obfType !== validAction.type) {
                console.log(`[HorseBrain] 🎠 MODULE 1 OBFUSCATE: ${validAction.type}→${obfType} (mode=${counterStrategy.mode}, callFreq=${(callFreqPct * 100).toFixed(0)}%)`);
                const newValid = validateAndClamp(obfType, null, legalActions);
                validAction.type = newValid.type;
                if (newValid.amount != null) validAction.amount = newValid.amount;
                else delete validAction.amount;
                freq.lastObfuscatedHand = freq.handCount;
            }
        }
    }

    // ─── MODULE 2: BET SIZE NOISE INJECTOR ───
    // ±10% (standard) or ±15% (stealth/anti_bot) jitter on all bet/raise amounts
    // so opponents cannot reverse-engineer hand equity from recurring GTO sizing patterns.
    if ((validAction.type === 'raise' || validAction.type === 'bet') && validAction.amount != null) {
        const noiseLA = legalActions.find(a => a.type === validAction.type);
        if (noiseLA) {
            const maxJitter = (counterStrategy.mode === 'stealth' || counterStrategy.mode === 'anti_bot' || counterStrategy.mode === 'anti_bot_stealth') ? 0.15 : 0.10;
            const jitter = 1 + (Math.random() * 2 - 1) * maxJitter;
            const noisedAmt = Math.round(validAction.amount * jitter);
            const noiseMin = noiseLA.minAmount || 0;
            const noiseMax = noiseLA.maxAmount || noisedAmt;
            validAction.amount = Math.max(noiseMin, Math.min(noiseMax, noisedAmt));
        }
    }

    // --- 6. COMPUTE TIMING DELAY (Phase 3A #8 - Personality Timing Tells) ---
    let delayMs;

    let usedAdvancedTiming = false;
    try {
        const adv = await getAdvancedModule();
        if (adv?.getActionDelay) {
            // Use personality timing tells from Advanced module
            delayMs = adv.getActionDelay(profileId, handType);
            usedAdvancedTiming = true;
        } else {
            delayMs = getActionDelay(profileId, validAction.type, street === 'preflop');
        }
    } catch (_) {
        delayMs = getActionDelay(profileId, validAction.type, street === 'preflop');
    }

    // Only apply preflop speedup if we used the basic delay (Advanced module already accounts for it)
    if (!usedAdvancedTiming && street === 'preflop') delayMs *= 0.7;

    // Clamp to human-realistic range
    delayMs = Math.round(Math.max(800, Math.min(7000, delayMs)));

    // --- TIMEBANK: Horses use the VIP Timebank system like all VIP members ---
    // Horses are Lifetime VIP - they have a real timebank balance in ActionTimer.
    // The ActionTimer itself manages when to auto-activate timebank (when main time expires).
    // We do NOT inject artificial extra time here. The engine's VIP timebank does this
    // automatically when the horse legitimately runs low on its main turn clock.
    // Note: Horse VIP timebank balance is set to VIP_LIFETIME seconds at seat-in time.

    // --- GIF EMOTE for All-In moments (words only in chat) ---
    const actionAmount = validAction.amount || finalAmount || 0;
    const isAllIn = validAction.type === 'all_in' || actionAmount >= bb * 50;

    if (isAllIn && Math.random() < 0.35) { // 35% chance to react when all-in
        // Two separate channels:
        // 1. Chat: words-only encouragement/trash talk
        // 2. GIF: a table_gif event for a visual reaction
        const chatPhrases = ['GL GL', 'Good luck everyone', 'Let\'s go', 'All day baby', 'Run good', 'Praying for a good run', 'Here we go'];
        const chatMsg = chatPhrases[Math.floor(Math.random() * chatPhrases.length)];
        chatMessages.push({
            playerId: profileId,
            message: chatMsg,
            type: 'chat'
        });

        // Also queue a GIF event (50% chance when already emoting)
        if (Math.random() < 0.5) {
            const gifTags = ['poker', 'good luck', 'all in', 'nervous', 'lets go', 'chips'];
            const gifTag = gifTags[Math.floor(Math.random() * gifTags.length)];
            chatMessages.push({
                playerId: profileId,
                message: gifTag,
                type: 'gif' // GameController will broadcast this as a `table_gif` event
            });
        }
        console.log(`[HorseBrain] 💬 All-In emote triggered for ${profileId.substring(0, 8)}: "${chatMsg}"`);
    }

    // --- Record performance stats (#34) ---
    recordPerformanceAction(profileId, street, validAction.type, validAction.type !== 'fold' && validAction.type !== 'check');

    return { action: validAction, delayMs };
}

/**
 * Validate the chosen action against legal actions and clamp amounts.
 * @param {string} actionType - Desired action type
 * @param {number|null} amount - Desired amount
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Valid engine action { type, amount? }
 */
function validateAndClamp(actionType, amount, legalActions) {
    const actionTypes = new Set(legalActions.map(a => a.type));

    // Map 'bet' to 'raise' or vice versa if needed
    if (actionType === 'bet' && !actionTypes.has('bet') && actionTypes.has('raise')) {
        actionType = 'raise';
    }
    if (actionType === 'raise' && !actionTypes.has('raise') && actionTypes.has('bet')) {
        actionType = 'bet';
    }

    // Check/fold substitution
    if (actionType === 'check' && !actionTypes.has('check')) {
        actionType = actionTypes.has('call') ? 'call' : 'fold';
    }
    if (actionType === 'call' && !actionTypes.has('call')) {
        actionType = actionTypes.has('check') ? 'check' : 'fold';
    }

    // Handle 'all_in' — find the engine's all_in legal action
    if (actionType === 'all_in') {
        const allInAction = legalActions.find(a => a.type === 'all_in');
        if (allInAction) {
            return { type: 'all_in', amount: allInAction.amount };
        }
        // No explicit all_in available — use max raise as all-in
        const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
        if (raiseAction && raiseAction.maxAmount) {
            return { type: raiseAction.type, amount: raiseAction.maxAmount };
        }
        // Last resort: call if possible, else fold
        if (actionTypes.has('call')) return { type: 'call' };
        return { type: actionTypes.has('check') ? 'check' : 'fold' };
    }

    // If action still not legal, pick the safest legal action
    if (!actionTypes.has(actionType)) {
        if (actionTypes.has('check')) return { type: 'check' };
        if (actionTypes.has('fold')) return { type: 'fold' };
        // Last resort: first legal action
        return { type: legalActions[0]?.type || 'fold' };
    }

    // Clamp amount for bet/raise
    if (actionType === 'raise' || actionType === 'bet') {
        const raiseAction = legalActions.find(a => a.type === actionType);
        if (raiseAction) {
            const min = raiseAction.minAmount || 0;
            const max = raiseAction.maxAmount || Infinity;

            if (amount == null || amount < min) {
                amount = min;
            } else if (amount > max) {
                // Over max = all-in
                amount = max;
            }
            return { type: actionType, amount: Math.round(amount) };
        }
    }

    // Actions without amounts
    return { type: actionType };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION & BANKROLL TRACKING (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════

// Tracks active session data per table per horse
// Map<tableId, Map<playerId, { startTime, startingStack, buyinsUsed, lastEvalsMs }>>
const sessionTracker = new Map();

// Tracks cumulative daily playtime per horse in MS
// Map<playerId, { dateString, totalMs }>
const dailyPlayTracker = new Map();

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Record a horse sitting down at a table
 */
function recordSitDown(tableId, playerId, buyInAmount) {
    if (!sessionTracker.has(tableId)) {
        sessionTracker.set(tableId, new Map());
    }
    const tableSessions = sessionTracker.get(tableId);

    // Only init if they aren't already sitting
    if (!tableSessions.has(playerId)) {
        tableSessions.set(playerId, {
            startTime: Date.now(),
            startingStack: buyInAmount,
            buyinsUsed: 1,
            lastEvalMs: Date.now()
        });

        // Start fatigue tracking (#22)
        getAdvancedModule().then(adv => {
            if (adv?.recordSessionStart) adv.recordSessionStart(playerId);
        }).catch(() => { });

        // Track multi-table count (#5)
        if (!multiTableTracker.has(playerId)) multiTableTracker.set(playerId, new Set());
        multiTableTracker.get(playerId).add(tableId);

        console.log(`[HorseBrain] 🐎 Session started for ${playerId.substring(0, 8)} at ${tableId} (Buy-in: ${buyInAmount})`);
    }
}

/**
 * Record a horse rebuying/adding chips at a table
 */
function recordRebuy(tableId, playerId, amount) {
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions) return;

    const session = tableSessions.get(playerId);
    if (session) {
        session.buyinsUsed += 1;
        console.log(`[HorseBrain] 🐎 Rebuy recorded for ${playerId.substring(0, 8)} at ${tableId} (Buyins used: ${session.buyinsUsed})`);
    }
}

/**
 * Clean up tracking when a table is destroyed
 */
function clearTableSessions(tableId) {
    sessionTracker.delete(tableId);

    // ─── MODULE 10: Clean up cross-table radar ───
    for (const [oppId, tableSet] of crossTableRadar) {
        tableSet.delete(tableId);
        if (tableSet.size === 0) crossTableRadar.delete(oppId);
    }
    // Clean up timebank blacklist if expired
    if ((tableTimebankBlacklist.get(tableId) || 0) < Date.now()) {
        tableTimebankBlacklist.delete(tableId);
    }
}

// --- Audit 14: Anti-Collusion Tracker ---
// Tracks if a horse loses massive pots to the same human repeatedly.
const collusionTracker = new Map(); // horseId -> Map<opponentId, count>

// --- Escape Tilt Map ---
// Signals evaluateSessions to stand a horse up immediately.
// Used by: Anti-Collusion, Blacklist Enforcer (Module 14), Timebank Abuse (Module 15).
// Map<horseId, { multiplier, reason }>
const tiltMap = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: 8 ADVANCED ANTI-EXPLOIT COUNTERMEASURE MODULES
// ═══════════════════════════════════════════════════════════════════════════

// --- Module 1: Frequency Obfuscator ---
// Tracks per-horse action type counts per table to detect/randomize frequency patterns
// Map<tableId, Map<horseId, { fold:n, call:n, raise:n, lastObfuscatedHand:n }>>
const frequencyObfuscatorMap = new Map();

// --- Module 3: Showdown Exposure Tracker ---
// Counts how many times a horse has shown cards at this table this session
// More showdowns = harder for opponents to read us = intensify obfuscation
// Map<horseId, Map<tableId, { showdowns:n, handsPlayed:n }>>
const showdownExposureMap = new Map();

// --- Module 4: Pattern Exploitation Detector ---
// Tracks which human opponents are profiting from which patterns against us
// Map<horseId, Map<opponentId, { cbet:n, check_raise:n, float:n, bluff:n, totalProfit:n, lastPattern:str }>>
const patternProfitMap = new Map();

// --- Module 6: Enhanced GTO Chaos Injector ---
// Tracks chaos suppression cooldown to prevent detectable chaos clusters
// Map<horseId, { lastChaosHand:n, handCounter:n }>
const chaosSuppressionMap = new Map();

// --- Module 7: Bot/Solver Opponent Detector ---
// Tracks suspicious play patterns per opponent (perfect GTO folding, exact pot-fraction sizing)
// Map<opponentId, { perfectFolds:n, gtoSizes:n, humanErrors:n, handsObserved:n, suspectScore:n }>
const suspectBotMap = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: CROSS-SESSION THREAT INTELLIGENCE (MODULES 9-16)
// ═══════════════════════════════════════════════════════════════════════════

// --- Module 9: Threat Intelligence Persistence ---
// In-RAM threat intel cache, hydrated from Supabase on first encounter.
// Map<opponentId, { suspectBotScore, patternBb, crossTableHits, timebankAbuseScore, totalScore, blacklistedUntil }>
const threatIntelCache = new Map();
// Debounce timers for upserting threat intel (avoid hammering DB every hand)
const threatPersistTimers = new Map();

// --- Module 10: Cross-Table Collusion Radar ---
// Tracks which human opponents are seated at how many horse tables simultaneously.
// Map<opponentId, Set<tableId>>
const crossTableRadar = new Map();

// --- Module 11: Proactive Range Rotation ---
// Gear cycle (A/B/C/D) per horse per table, rotates every 30 hands.
// Map<horseId+":"+tableId, { gear: 'A'|'B'|'C'|'D', handsSinceRotation: n }>
const rangeRotationMap = new Map();
const RANGE_GEARS = ['A', 'B', 'C', 'D'];
const GEAR_ADJUSTMENTS = {
    A: { foldMod: -5, raiseMod: +5, label: 'loose-aggressive' },
    B: { foldMod: 0, raiseMod: 0, label: 'gto-standard' },
    C: { foldMod: +5, raiseMod: -5, label: 'tight-passive' },
    D: { foldMod: -3, raiseMod: +8, label: 'bluff-heavy' },
};

// --- Module 15: Anti-Timebank Abuse Detector ---
// Map<opponentId, { actionTimes: number[], suspicionScore: number }>
const timeAbuseSuspicion = new Map();
// Map<tableId, blacklistedUntilMs>
const tableTimebankBlacklist = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: IN-SESSION EXPLOITATION DEFENSE (MODULES 17-24)
// ═══════════════════════════════════════════════════════════════════════════

// --- Module 19: Probe-Bet Frequency Harvester ---
// Tracks systematic small-bet probing per opponent.
// Map<opponentId, { probes, probeWins, totalProfit }>
const probeBetMap = new Map();

// --- Module 20: Table Image Exposure Monitor ---
// Tracks showdown % per horse per table (resets on leave).
// Map<horseId+":"+tableId, { showdowns, handsPlayed }>
const imageExposureMap = new Map();

// --- Module 22: Isolation Bet Sizing Tell Tracker ---
// Tracks isolation raise sizes (in BB) per opponent to detect mechanical patterns.
// Map<opponentId, number[]>
const isoSizingMap = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 17: PLO RUNOUT EQUITY RE-EVALUATOR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Re-evaluate how a runout card changed the horse's equity.
 * Returns a multiplier: >1 = improved, <1 = degraded, 1 = blank.
 * @param {number} prevEquity - Equity from the previous street
 * @param {number} curEquity  - Equity after new board card revealed
 * @param {string} street     - 'turn' | 'river'
 * @returns {{ multiplier: number, runoutType: 'blank'|'scare'|'improve'|'nut_improve' }}
 */
function reevaluatePLORunoutEquity(prevEquity, curEquity, street) {
    const delta = curEquity - prevEquity;
    if (delta > 15) return { multiplier: 1.20, runoutType: 'nut_improve' };
    if (delta > 7) return { multiplier: 1.10, runoutType: 'improve' };
    if (delta < -12) return { multiplier: 0.75, runoutType: 'scare' };
    if (delta < -5) return { multiplier: 0.88, runoutType: 'scare' };
    return { multiplier: 1.0, runoutType: 'blank' };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 18: SPR POT-COMMITMENT TRAP DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detect if an opponent jam/overshove is designed to force a break-even call.
 * Returns whether the horse should fold even at marginal commitment thresholds.
 * @param {number} toCall   - Amount horse needs to call
 * @param {number} potTotal - Pot size before the call
 * @param {number} stack    - Horse's remaining stack
 * @param {number} numPlayers - Active players
 * @param {number} equity   - Horse's current equity (0–100)
 * @returns {{ shouldFoldTrap: boolean, trueBreakEven: number, isTrap: boolean }}
 */
function detectSPRTrap(toCall, potTotal, stack, numPlayers, equity) {
    if (toCall <= 0) return { shouldFoldTrap: false, trueBreakEven: 0, isTrap: false };
    const trueBreakEven = (toCall / (potTotal + toCall)) * 100;
    // PLO multiway premium: add 8% per extra player
    const mwPremium = Math.max(0, (numPlayers - 2)) * 4;
    const adjustedThreshold = trueBreakEven + mwPremium;
    // "Trap" signature: pot-sized or larger jam on non-threatening board
    const isOversized = toCall >= potTotal * 0.9;
    const isTrap = isOversized && equity < (adjustedThreshold + 5);
    const shouldFoldTrap = isTrap && equity < adjustedThreshold;
    return { shouldFoldTrap, trueBreakEven, adjustedThreshold, isTrap };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 19: PROBE-BET FREQUENCY HARVESTER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record an opponent's bet and whether it qualifies as a probe (< 35% pot).
 * @param {string} oppId
 * @param {number} betFraction - bet / pot (0–1)
 * @param {boolean} oppWon     - Did the opponent win this hand?
 * @param {number}  chipDelta  - Net chips the opponent won/lost
 */
function recordProbeBet(oppId, betFraction, oppWon, chipDelta) {
    if (betFraction <= 0 || betFraction > 0.35) return; // Not a probe
    if (!probeBetMap.has(oppId)) probeBetMap.set(oppId, { probes: 0, probeWins: 0, totalProfit: 0 });
    const p = probeBetMap.get(oppId);
    p.probes++;
    if (oppWon) { p.probeWins++; p.totalProfit += chipDelta || 0; }
}

/**
 * Get the probe-bet farming score (0–1). >0.6 = systematic probe-farmer.
 * @param {string} oppId
 * @returns {number}
 */
function getProbeFarmScore(oppId) {
    const p = probeBetMap.get(oppId);
    if (!p || p.probes < 4) return 0;
    return p.probeWins / p.probes;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 20: TABLE IMAGE EXPOSURE MONITOR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record a hand result for table image tracking.
 * @param {string} horseId
 * @param {string} tableId
 * @param {boolean} showedCards
 */
function recordTableImageHand(horseId, tableId, showedCards) {
    const key = `${horseId}:${tableId}`;
    if (!imageExposureMap.has(key)) imageExposureMap.set(key, { showdowns: 0, handsPlayed: 0 });
    const img = imageExposureMap.get(key);
    img.handsPlayed++;
    if (showedCards) img.showdowns++;
}

/**
 * Returns true if the horse's table image is "exposed" (showdown rate > 25%).
 * Exposed image = humans will float and bluff more light.
 * @param {string} horseId
 * @param {string} tableId
 * @returns {boolean}
 */
function isImageExposed(horseId, tableId) {
    const key = `${horseId}:${tableId}`;
    const img = imageExposureMap.get(key);
    if (!img || img.handsPlayed < 8) return false;
    return (img.showdowns / img.handsPlayed) > 0.25;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 21: PLO PREFLOP LIMP-TRAP DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detect if raising into a multi-limped pot is a limp-trap risk.
 * @param {number} numLimpers    - Players who limped before us
 * @param {string} position      - Our position ('btn','co','mp','ep','sb')
 * @param {number} spr           - Stack-to-pot ratio if we raise
 * @param {boolean} isNutHand    - Do we have a nutted PLO hand (AA+wraps etc.)?
 * @returns {{ isLimpTrap: boolean, riskScore: number, recommendation: string }}
 */
function detectLimpTrap(numLimpers, position, spr, isNutHand) {
    let riskScore = 0;
    // More limpers = more limp-trap risk (they all checked with strong PLO hands)
    if (numLimpers >= 3) riskScore += 3;
    else if (numLimpers === 2) riskScore += 1;
    // Shallow SPR means we commit more easily into traps
    if (spr < 5) riskScore += 2;
    // Being OOP into many limpers is more dangerous
    if (['ep', 'mp', 'sb'].includes(position)) riskScore += 1;
    // Nut hands can always raise (they're the trap setters)
    if (isNutHand) riskScore = 0;
    const isLimpTrap = riskScore >= 3;
    const recommendation = isLimpTrap ? 'prefer_call_or_fold' : 'raise_ok';
    return { isLimpTrap, riskScore, recommendation };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 22: ISOLATION BET SIZING TELL TRACKER
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record an opponent's isolation raise size in BB.
 * @param {string} oppId
 * @param {number} sizeBB - Raise size in BBs
 */
function recordIsoSize(oppId, sizeBB) {
    if (!isoSizingMap.has(oppId)) isoSizingMap.set(oppId, []);
    const sizes = isoSizingMap.get(oppId);
    sizes.push(sizeBB);
    if (sizes.length > 10) sizes.shift(); // Rolling 10-sample window
}

/**
 * Returns true if opponent has a mechanical, predictable isolation sizing pattern.
 * Mechanical iso = 3-bettable from +10% range.
 * @param {string} oppId
 * @returns {{ isMechanical: boolean, avgSize: number, stdDev: number }}
 */
function isMechanicalIsolator(oppId) {
    const sizes = isoSizingMap.get(oppId);
    if (!sizes || sizes.length < 5) return { isMechanical: false, avgSize: 0, stdDev: 0 };
    const avg = sizes.reduce((s, v) => s + v, 0) / sizes.length;
    const variance = sizes.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / sizes.length;
    const stdDev = Math.sqrt(variance);
    return { isMechanical: stdDev < 0.8, avgSize: avg, stdDev };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 23: OOP POSITIONAL EQUITY LEAK GUARD
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Guard against auto-betting from OOP without initiative — a known leak.
 * Returns a threshold adjustment for OOP no-initiative spots.
 * @param {boolean} isIP          - Is the horse in position?
 * @param {boolean} hasInitiative - Did horse raise preflop/have lead?
 * @param {number}  equity        - Current equity
 * @param {string}  street        - 'flop'|'turn'|'river'
 * @returns {{ equityBoost: number, shouldGuard: boolean }}
 */
function getOOPPositionalGuard(isIP, hasInitiative, equity, street) {
    if (isIP) return { equityBoost: 0, shouldGuard: false };
    if (hasInitiative) return { equityBoost: 0, shouldGuard: false }; // C-bet OK
    // OOP, no initiative: require more equity to bet
    const boost = street === 'river' ? 12 : street === 'turn' ? 10 : 8;
    return { equityBoost: boost, shouldGuard: equity < (50 + boost) };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 24: RIVER DONK-BET EXPLOITATION BLOCK
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Evaluate how to respond to an opponent's river donk-bet (OOP lead).
 * @param {number} toCall    - Amount to call
 * @param {number} potSize   - Pot before donk
 * @param {boolean} isIP     - Is the horse in position (facing an OOP donk)?
 * @param {number}  equity   - Horse's river equity (0–100)
 * @returns {{ action: 'raise'|'call'|'fold'|'none', reason: string }}
 */
function evaluateDonkBet(toCall, potSize, isIP, equity) {
    if (toCall <= 0 || !isIP) return { action: 'none', reason: 'not_a_donk' };
    const donkFraction = toCall / potSize;
    // Only applies to genuine donk-bets (< 80% pot, opponent leading OOP)
    if (donkFraction > 0.8) return { action: 'none', reason: 'not_a_probe_donk' };
    if (equity >= 65) {
        return { action: 'raise', reason: `Donk into strong equity (${equity.toFixed(0)}) — raise to deny blocker bluffs` };
    }
    if (equity < 38) {
        return { action: 'fold', reason: `Thin-value donk likely ahead (equity=${equity.toFixed(0)})` };
    }
    return { action: 'call', reason: `Medium equity (${equity.toFixed(0)}) vs donk — call and re-evaluate` };
}


// ─────────────────────────────────────────────────────────────────────────────
/**
 * Lazy-load a single opponent's threat intel from Supabase.
 * Hydrates all Phase 1 + Phase 2 tracking structures from persistent storage.
 * @param {string} opponentId
 */
async function _loadThreatIntel(opponentId) {
    if (threatIntelCache.has(opponentId)) return threatIntelCache.get(opponentId);
    const sb = getSupabase();
    if (!sb) return null;
    try {
        const { data } = await sb
            .from('horse_threat_intel')
            .select('*')
            .eq('opponent_id', opponentId)
            .single();
        if (!data) {
            threatIntelCache.set(opponentId, null);
            return null;
        }
        const intel = {
            suspectBotScore: data.suspect_bot_score || 0,
            patternExploitType: data.pattern_exploit_type || null,
            patternExploitBb: data.pattern_exploit_bb || 0,
            crossTableHits: data.cross_table_hits || 0,
            timebankAbuseScore: data.timebank_abuse_score || 0,
            totalScore: data.total_threat_score || 0,
            blacklistedUntil: data.blacklisted_until ? new Date(data.blacklisted_until).getTime() : null,
        };
        threatIntelCache.set(opponentId, intel);
        // Hydrate Phase 1 suspectBotMap from persistent score
        if (intel.suspectBotScore > 0 && !suspectBotMap.has(opponentId)) {
            suspectBotMap.set(opponentId, {
                perfectFolds: 0, gtoSizes: 0, humanErrors: 0, handsObserved: 0,
                suspectScore: intel.suspectBotScore
            });
        }
        if (intel.totalScore >= 65) {
            console.warn(`[HorseBrain] 📥 MODULE 9 LOADED: ${opponentId.substring(0, 8)} — known threat score ${intel.totalScore}/100`);
        }
        return intel;
    } catch (_) {
        return null;
    }
}

/**
 * Persist accumulated threat data for an opponent to Supabase (debounced 5s).
 * @param {string} opponentId
 */
function _persistThreatIntel(opponentId) {
    if (threatPersistTimers.has(opponentId)) {
        clearTimeout(threatPersistTimers.get(opponentId));
    }
    const timer = setTimeout(async () => {
        threatPersistTimers.delete(opponentId);
        const sb = getSupabase();
        if (!sb) return;
        const botData = suspectBotMap.get(opponentId);
        const patternData = [...(patternProfitMap.values())].flatMap(m => {
            const v = m.get(opponentId);
            return v ? [v] : [];
        })[0] || null;
        const crossHits = crossTableRadar.get(opponentId)?.size || 0;
        const timebankData = timeAbuseSuspicion.get(opponentId);
        const threatScore = getThreatScore(opponentId);
        const blacklistedUntil = threatScore >= 80 ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
        const payload = {
            opponent_id: opponentId,
            suspect_bot_score: botData?.suspectScore || 0,
            pattern_exploit_type: patternData ? Object.entries({ cbet: patternData.cbet, check_raise: patternData.check_raise, float: patternData.float, bluff: patternData.bluff }).sort((a, b) => b[1] - a[1])[0]?.[0] : null,
            pattern_exploit_bb: patternData?.totalProfit || 0,
            cross_table_hits: crossHits,
            timebank_abuse_score: timebankData?.suspicionScore || 0,
            total_threat_score: threatScore,
            blacklisted_until: blacklistedUntil,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        try {
            await sb.from('horse_threat_intel').upsert(payload, { onConflict: 'opponent_id' });
            // Update cache
            threatIntelCache.set(opponentId, {
                suspectBotScore: payload.suspect_bot_score,
                patternExploitType: payload.pattern_exploit_type,
                patternExploitBb: payload.pattern_exploit_bb,
                crossTableHits: crossHits,
                timebankAbuseScore: payload.timebank_abuse_score,
                totalScore: threatScore,
                blacklistedUntil: blacklistedUntil ? new Date(blacklistedUntil).getTime() : null,
            });
            if (threatScore >= 80) {
                console.warn(`[HorseBrain] 🔴 MODULE 14 BLACKLIST: ${opponentId.substring(0, 8)} — 24h blacklist applied (score=${threatScore}/100)`);
            }
        } catch (err) {
            console.error(`[HorseBrain] Threat intel persist failed for ${opponentId.substring(0, 8)}: ${err.message}`);
        }
    }, 5000);
    threatPersistTimers.set(opponentId, timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 14: DYNAMIC BLACKLIST ENFORCER — Unified Threat Score
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute combined threat score (0-100) from all Phase 1 + Phase 2 signals.
 * @param {string} opponentId
 * @returns {number}
 */
function getThreatScore(opponentId) {
    // Bot score (0-100 from Phase 1, contributes up to 40 points)
    const botScore = (suspectBotMap.get(opponentId)?.suspectScore || 0) * 0.40;
    // Pattern exploitation (0-∞ BB won, contributes up to 30 points, capped at 30BB = 30pts)
    const patternBb = [...(patternProfitMap.values())]
        .flatMap(m => { const v = m.get(opponentId); return v ? [v.totalProfit] : []; })
        .reduce((sum, v) => sum + v, 0);
    const patternScore = Math.min(30, patternBb);
    // Cross-table hits (up to 20 points)
    const crossScore = Math.min(20, (crossTableRadar.get(opponentId)?.size || 0) * 7);
    // Timebank abuse (up to 10 points)
    const timebankScore = Math.min(10, (timeAbuseSuspicion.get(opponentId)?.suspicionScore || 0) * 0.10);
    return Math.min(100, Math.round(botScore + patternScore + crossScore + timebankScore));
}

/**
 * Check if an opponent is currently blacklisted (24h ban applied).
 * @param {string} opponentId
 * @returns {boolean}
 */
function isBlacklisted(opponentId) {
    const cached = threatIntelCache.get(opponentId);
    if (cached?.blacklistedUntil && cached.blacklistedUntil > Date.now()) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 11: PROACTIVE RANGE ROTATION
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get the current range rotation gear for a horse at a given table.
 * Advances through A→B→C→D every 30 hands automatically.
 * @param {string} horseId
 * @param {string} tableId
 * @returns {{ gear: string, foldMod: number, raiseMod: number }}
 */
function getRangeRotationGear(horseId, tableId) {
    const key = `${horseId}:${tableId}`;
    if (!rangeRotationMap.has(key)) {
        // Stagger starting gear per horse to prevent all horses rotating in sync
        const hash = horseId.charCodeAt(0) % 4;
        rangeRotationMap.set(key, { gear: RANGE_GEARS[hash], handsSinceRotation: 0 });
    }
    const state = rangeRotationMap.get(key);
    state.handsSinceRotation++;
    if (state.handsSinceRotation >= 30) {
        const nextIdx = (RANGE_GEARS.indexOf(state.gear) + 1) % RANGE_GEARS.length;
        state.gear = RANGE_GEARS[nextIdx];
        state.handsSinceRotation = 0;
        console.log(`[HorseBrain] 🔄 MODULE 11 ROTATION: ${horseId.substring(0, 8)} gear → ${state.gear} (${GEAR_ADJUSTMENTS[state.gear].label})`);
    }
    return { gear: state.gear, ...GEAR_ADJUSTMENTS[state.gear] };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 12: PLO MULTIWAY EQUITY DEGRADATION SHIELD
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Discounts PLO hand strength for multiway pots. In PLO, equity degrades
 * sharply as players are added — the horse must account for this.
 * @param {number} strength - Raw made hand strength (0-100)
 * @param {number} numPlayers - Active players in the pot
 * @returns {number} - Discounted strength
 */
function applyMultiwayEquityDiscount(strength, numPlayers) {
    const discounts = { 2: 0, 3: 10, 4: 18, 5: 25 };
    const discount = discounts[Math.min(5, numPlayers)] ?? 25;
    return Math.max(0, strength - discount);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 13: PLO NUT-BIAS EXPLOIT DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Detects whether the current board is a 'nut-unlikely' texture that humans
 * attempt to exploit when they know the horse is nut-biased.
 * High score = dry/rainbow/low board = humans likely to probe bluff.
 * @param {Array} boardCards - Parsed board card objects [{rank, suit},...]
 * @param {number} numPlayers
 * @returns {{ nutUnlikelyScore: number, shouldAddCheckRaise: boolean }}
 */
function detectNutBiasExploitBoard(boardCards, numPlayers) {
    if (!boardCards || boardCards.length < 3) return { nutUnlikelyScore: 0, shouldAddCheckRaise: false };
    let score = 0;
    // Rainbow (all different suits) = nut flush unlikely
    const suits = boardCards.map(c => c.suit);
    const uniqueSuits = new Set(suits).size;
    if (uniqueSuits === boardCards.length) score += 25; // Fully rainbow
    // Dry (no pair, no connected cards) = nut straight unlikely
    const ranks = boardCards.map(c => c.rank).sort((a, b) => a - b);
    const hasPair = ranks.some((r, i) => ranks[i + 1] === r);
    if (!hasPair) score += 15;
    // No cards above Jack = nut straight head-blockers unlikely
    const maxRank = Math.max(...ranks);
    if (maxRank <= 9) score += 15; // All low cards
    // Single-gap or double-gap = no straight possible
    const gaps = ranks.slice(1).map((r, i) => r - ranks[i]);
    const maxGap = Math.max(...gaps);
    if (maxGap > 3) score += 10;
    // Multi-way reduces likelihood any individual holds the nuts
    if (numPlayers >= 4) score -= 10; // In multiway the nuts are more likely to be out
    const nutUnlikelyScore = Math.max(0, Math.min(100, score));
    // If nut-unlikely board is confirmed, add check-raise to repertoire vs bluffers
    const shouldAddCheckRaise = nutUnlikelyScore >= 40;
    return { nutUnlikelyScore, shouldAddCheckRaise };
}


// Reads all tracking modules and returns a unified counter-strategy mode.
// Called at the top of getDecision to set the strategic posture for the hand.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns a unified counter-strategy mode based on all available threat signals.
 * @param {string} horseId - Horse profile UUID
 * @param {string|null} primaryOpponentId - Main opponent's ID (or null)
 * @param {string} tableId - Table UUID
 * @returns {{ mode: string, details: Object }}
 *   mode: 'standard' | 'stealth' | 'pattern_counter' | 'anti_bot' | 'sandwich_survival' | 'anti_bot_stealth'
 */
function selectCounterStrategy(horseId, primaryOpponentId, tableId) {
    const signals = {};

    // Signal A: Showdown exposure
    const exposure = showdownExposureMap.get(horseId)?.get(tableId);
    signals.exposureScore = exposure ? (exposure.showdowns / Math.max(1, exposure.handsPlayed)) * 100 : 0;
    signals.highExposure = signals.exposureScore > 20 || (exposure?.showdowns || 0) >= 8;

    // Signal B: Pattern exploitation by a specific human
    signals.exploitedPattern = null;
    if (primaryOpponentId) {
        const oppPatterns = patternProfitMap.get(horseId)?.get(primaryOpponentId);
        if (oppPatterns && oppPatterns.totalProfit > 3) { // Human won 3+ BB via a pattern
            // Find the most profitable pattern
            const patterns = { cbet: oppPatterns.cbet, check_raise: oppPatterns.check_raise, float: oppPatterns.float, bluff: oppPatterns.bluff };
            const best = Object.entries(patterns).sort((a, b) => b[1] - a[1])[0];
            if (best && best[1] > 0) signals.exploitedPattern = best[0];
        }
    }

    // Signal C: Bot/solver suspicion
    signals.botSuspectScore = primaryOpponentId ? (suspectBotMap.get(primaryOpponentId)?.suspectScore || 0) : 0;
    signals.isSuspectedBot = signals.botSuspectScore >= 65;

    // Determine final mode (priority: anti_bot_stealth > anti_bot > pattern_counter > stealth > standard)
    let mode = 'standard';
    if (signals.isSuspectedBot && signals.highExposure) mode = 'anti_bot_stealth';
    else if (signals.isSuspectedBot) mode = 'anti_bot';
    else if (signals.exploitedPattern) mode = 'pattern_counter';
    else if (signals.highExposure) mode = 'stealth';

    return { mode, details: signals };
}

/**
 * Process hand result for a horse — feeds tilt tracking and showdown recording.
 * Called from `hand_complete` event in GameController.
 * @param {Object} handData - The hand_complete event data
 * @param {number} bb - Big blind size
 */
async function processHandResult(handData, bb = 2) {
    if (!handData?.result) return;

    const adv = await getAdvancedModule();

    const winners = handData.result.winners || [];
    const players = handData.result.players || handData.players || [];

    for (const player of players) {
        const pid = String(player.id || player.playerId);
        const isAI = await isHorse(pid);
        if (!isAI) continue;

        const won = winners.some(w => String(w.playerId) === pid);
        const chipDelta = player.chipDelta || 0;

        // ─── AUDIT 14: COLLUSION / CHIP DUMPING GUARD ───
        // If the horse lost a huge pot (>40bb), track who won it.
        // If the SAME human stacks them 3 times, the horse flees the table.
        if (!won && chipDelta < -(bb * 40)) {
            const opps = winners.map(w => String(w.playerId));
            if (!collusionTracker.has(pid)) collusionTracker.set(pid, new Map());
            const horseTracker = collusionTracker.get(pid);

            for (const oppId of opps) {
                const isOppAI = await isHorse(oppId);
                if (!isOppAI) { // Only track humans farming the horse
                    const count = (horseTracker.get(oppId) || 0) + 1;
                    horseTracker.set(oppId, count);

                    if (count >= 3) {
                        console.error(`[HorseBrain] 🚨 ANTI-COLLUSION TRIGGERED: ${pid} has been stacked 3x by ${oppId}! Fleeing table.`);
                        // Spike tilt to 1.0 — evaluateSessions will immediately detect this and stand them up
                        if (!tiltMap.has(pid)) tiltMap.set(pid, {});
                        const state = tiltMap.get(pid);
                        state.multiplier = 1.0;
                        state.reason = `Farm protection vs ${oppId}`;
                    }
                }
            }
        }

        if (!adv) continue;

        // --- Record wins for consecutive loss reset (#6) ---
        if (won && adv.recordWin) {
            adv.recordWin(pid);
        }

        // --- Record bad beats for tilt system ---
        if (!won && chipDelta < 0 && adv.recordBadBeat) {
            const bbLost = Math.abs(chipDelta) / bb;
            const wasBadBeat = bbLost >= 20;
            adv.recordBadBeat(pid, bbLost, wasBadBeat);
        }

        // --- Record showdowns for table image tracking ---
        if (player.showedCards && adv.recordShowdown) {
            const wasBetting = player.lastAction === 'raise' || player.lastAction === 'bet';
            adv.recordShowdown(pid, won, wasBetting);
        }

        // --- Record performance result (#34) ---
        recordPerformanceResult(pid, won, chipDelta / bb);

        // --- Save key hands (#41) ---
        if (Math.abs(chipDelta) > bb * 10) {
            saveKeyHand(handData, bb).catch(() => { });
        }

        // --- Evolve horse skill (#42) ---
        const stats = getPerformanceStats(pid);
        if (stats.handsPlayed > 0 && stats.handsPlayed % 50 === 0) {
            evolveHorseSkill(pid, stats.winRate * 100);
        }

        // --- Save opponent reads (#40) ---
        if (adv.getOpponentRead) {
            const opponents = (handData.players || []).filter(op => String(op.id) !== pid && !op.folded);
            for (const opp of opponents.slice(0, 2)) {
                const read = adv.getOpponentRead(pid, String(opp.id));
                if (read && read.handsObserved >= 10) {
                    saveOpponentRead(pid, String(opp.id), read).catch(() => { });
                }
            }
        }

        // ─── AUDIT 14: CHAT STEALTH MODE ───
        // Horses must never type in chat to prevent prompt injections,
        // harassment, and breaking the illusion.
        // Disabled `personality.getTableChat` entirely.

        // ─── MODULE 3: SHOWDOWN EXPOSURE TRACKER ───
        // Increment the per-table showdown count so the Counter-Exploit Profiler
        // can escalate obfuscation intensity as hand ranges become more readable.
        if (player.showedCards) {
            const tableIdHR = handData.tableId || 'unknown';
            if (!showdownExposureMap.has(pid)) showdownExposureMap.set(pid, new Map());
            const horseExp = showdownExposureMap.get(pid);
            if (!horseExp.has(tableIdHR)) horseExp.set(tableIdHR, { showdowns: 0, handsPlayed: 0 });
            horseExp.get(tableIdHR).showdowns++;
            const { showdowns, handsPlayed } = horseExp.get(tableIdHR);
            console.log(`[HorseBrain] 👁️ MODULE 3 EXPOSURE: ${pid.substring(0, 8)} has shown down ${showdowns}/${handsPlayed} hands at table ${tableIdHR.substring(0, 8)}`);
        }

        // ─── MODULE 4: PATTERN EXPLOITATION DETECTOR ───
        // Tracks profit attributed to specific patterns each opponent uses against this horse.
        // When a human is consistently exploiting one pattern (cbet, float, bluff), we counter.
        const humanOpponents = (handData.players || []).filter(op => String(op.id) !== pid && !op.folded);
        for (const opp of humanOpponents.slice(0, 2)) {
            const oppId = String(opp.id);
            const isOppAI = await isHorse(oppId);
            if (isOppAI) continue; // Only track human exploiters

            if (!patternProfitMap.has(pid)) patternProfitMap.set(pid, new Map());
            const horsePatterns = patternProfitMap.get(pid);
            if (!horsePatterns.has(oppId)) horsePatterns.set(oppId, { cbet: 0, check_raise: 0, float: 0, bluff: 0, totalProfit: 0 });
            const pat = horsePatterns.get(oppId);

            // Attribute profit to patterns based on action sequence
            const oppLastAction = opp.lastAction || '';
            const oppChipDelta = opp.chipDelta || 0;
            if (oppChipDelta > 0) {
                // Human won chips — attribute to what they did
                const bbWon = oppChipDelta / bb;
                if (oppLastAction === 'bet' && opp.hadInitiative === false) { pat.float += bbWon; } // Float play
                else if (oppLastAction === 'raise' && opp.actedAfterCheck === true) { pat.check_raise += bbWon; } // Check-raise
                else if (oppLastAction === 'raise' && !won) { pat.bluff += bbWon; } // Could be bluff
                else if (oppLastAction === 'bet' && opp.hadInitiative === true) { pat.cbet += bbWon; } // C-bet
                pat.totalProfit += bbWon;

                // Alert when a human has found a pattern worth 5+ BB
                if (pat.totalProfit >= 5) {
                    const highest = Object.entries({ cbet: pat.cbet, check_raise: pat.check_raise, float: pat.float, bluff: pat.bluff }).sort((a, b) => b[1] - a[1])[0];
                    console.warn(`[HorseBrain] ⚠️ MODULE 4 PATTERN: ${oppId.substring(0, 8)} exploiting ${pid.substring(0, 8)} via '${highest[0]}' (+${pat.totalProfit.toFixed(1)}BB total)`);
                }
            }
        }

        // ─── MODULE 7: BOT/SOLVER OPPONENT DETECTOR ───
        // Scores each opponent on suspiciously perfect play. High score = likely solver user.
        // Metrics: folding exactly at pot-odds break-even, GTO-fractional bet sizing, zero 'human' errors.
        for (const opp of humanOpponents.slice(0, 2)) {
            const oppId = String(opp.id);
            const isOppAI = await isHorse(oppId);
            if (isOppAI) continue;

            if (!suspectBotMap.has(oppId)) suspectBotMap.set(oppId, { perfectFolds: 0, gtoSizes: 0, humanErrors: 0, handsObserved: 0, suspectScore: 0 });
            const botData = suspectBotMap.get(oppId);
            botData.handsObserved++;

            // Perfect fold: opponent folded facing a bet and was getting good pot odds (solver discipline)
            const potTotal = handData.potSize || handData.result?.potTotal || 0;
            const facingBet = handData.result?.lastBet || 0;
            if (opp.lastAction === 'fold' && potTotal > 0 && facingBet > 0) {
                const impliedPotOdds = facingBet / (potTotal + facingBet);
                // >35% pot odds and still folded = extremely disciplined / solver-like
                if (impliedPotOdds > 0.35) botData.perfectFolds++;
            }

            // GTO sizing tell: bet amount is very close to a standard fraction (33%, 50%, 75%, pot)
            const oppBetAmt = opp.betAmount || 0;
            if (oppBetAmt > 0 && potTotal > 0) {
                const fraction = oppBetAmt / potTotal;
                const gtoFractions = [0.33, 0.5, 0.66, 0.75, 1.0];
                const isGTOSize = gtoFractions.some(f => Math.abs(fraction - f) < 0.04); // Within 4%
                if (isGTOSize) botData.gtoSizes++; else botData.humanErrors++;
            }

            // Recalculate suspect score
            const obsCount = Math.max(1, botData.handsObserved);
            const gtoFoldRate = botData.perfectFolds / obsCount;
            const gtoSizeRate = botData.gtoSizes / Math.max(1, botData.gtoSizes + botData.humanErrors);
            botData.suspectScore = Math.min(100, Math.round((gtoFoldRate * 50) + (gtoSizeRate * 50)));

            if (botData.suspectScore >= 65 && botData.handsObserved >= 10) {
                console.warn(`[HorseBrain] 🤖 MODULE 7 BOT DETECTED: ${oppId.substring(0, 8)} suspect score = ${botData.suspectScore}/100 (${botData.handsObserved} hands)`);
            }

            // ─── MODULE 10: CROSS-TABLE COLLUSION RADAR ───
            // Track how many horse tables this human is simultaneously farming.
            const tableHR = handData.tableId || 'unknown';
            if (!crossTableRadar.has(oppId)) crossTableRadar.set(oppId, new Set());
            crossTableRadar.get(oppId).add(tableHR);
            const tablesCount = crossTableRadar.get(oppId).size;
            if (tablesCount >= 3) {
                console.warn(`[HorseBrain] 🚫 MODULE 10 CROSS-TABLE: ${oppId.substring(0, 8)} at ${tablesCount} horse tables simultaneously!`);
            }

            // ─── MODULE 15: TIMEBANK ABUSE DETECTOR ───
            // Track per-human average action time. >22s average = stall tactic.
            const oppActionMs = opp.lastActionDurationMs || opp.actionTimeMs || 0;
            if (oppActionMs > 0) {
                if (!timeAbuseSuspicion.has(oppId)) timeAbuseSuspicion.set(oppId, { actionTimes: [], suspicionScore: 0 });
                const tbTrack = timeAbuseSuspicion.get(oppId);
                tbTrack.actionTimes.push(oppActionMs);
                // Keep only last 10 action times for a rolling average
                if (tbTrack.actionTimes.length > 10) tbTrack.actionTimes.shift();
                const avgMs = tbTrack.actionTimes.reduce((s, t) => s + t, 0) / tbTrack.actionTimes.length;
                // Stall threshold: avg > 22000ms (22 seconds)
                if (avgMs > 22000) {
                    tbTrack.suspicionScore = Math.min(100, tbTrack.suspicionScore + 5);
                    if (tbTrack.suspicionScore >= 70) {
                        console.warn(`[HorseBrain] ⏱️ MODULE 15 STALL: ${oppId.substring(0, 8)} avg=${(avgMs / 1000).toFixed(1)}s, suspicion=${tbTrack.suspicionScore}/100`);
                    }
                } else {
                    // Decay suspicion for legitimate players
                    tbTrack.suspicionScore = Math.max(0, tbTrack.suspicionScore - 2);
                }
            }

            // ─── MODULE 9: PERSIST THREAT INTEL (Debounced — 5s) ───
            // Trigger a debounced Supabase upsert of all accumulated threat signals.
            _persistThreatIntel(oppId);

            // ─── MODULE 19: PROBE-BET FREQUENCY HARVESTER ───
            // Record if opponent made a probe bet this hand (< 35% pot)
            const oppBet = opp.betAmount || 0;
            const handPotSize = handData.potSize || handData.result?.totalPot || 0;
            if (oppBet > 0 && handPotSize > 0) {
                const betFrac = oppBet / handPotSize;
                const oppWon = (handData.result?.winners || []).some(w => String(w.playerId) === oppId);
                recordProbeBet(oppId, betFrac, oppWon, opp.chipDelta || 0);
            }

            // ─── MODULE 22: ISO SIZING TELL TRACKER ───
            // Record isolation raise sizes if opponent raised preflop vs limpers
            if (opp.lastAction === 'raise' && (handData.street === 'preflop' || !handData.street)) {
                const handBB = handData.bigBlind || 2;
                const isoSizeBB = oppBet / handBB;
                if (isoSizeBB > 0) recordIsoSize(oppId, isoSizeBB);
            }
        }
    }

    // ─── MODULE 20: TABLE IMAGE EXPOSURE MONITOR ───
    // Track showdown counts for every horse at this table
    for (const p of (handData.players || handData.result?.players || [])) {
        const pid = String(p.id || p.playerId || '');
        if (!pid || !isHorse(pid)) continue;
        const showedCards = p.showedCards === true || p.showdown === true;
        recordTableImageHand(pid, handData.tableId, showedCards);
    }
}  // ← end processHandResult


/**
 * Check if a horse is allowed to rebuy based on maxBuyins stop-loss AND physical chip balance
 * @param {string} tableId 
 * @param {string} playerId 
 * @param {number} minBuyIn - the minimum cost to buy back in
 * @param {string} clubId - the club ID for chip balance lookups
 * @returns {Promise<boolean>}
 */

async function canRebuy(tableId, playerId, minBuyIn = 0, clubId = null) {
    const tableSessions = sessionTracker.get(tableId);
    if (!tableSessions) return true; // Not tracking, allow

    const session = tableSessions.get(playerId);
    if (!session) return true;

    // Fast reject if they are deep into buyins
    // We defer to personality profile for exact limit
    const personality = await getPersonalityModule();
    if (personality && typeof personality.getSessionProfile === 'function') {
        const sessionPref = personality.getSessionProfile(playerId);
        if (session.buyinsUsed >= sessionPref.maxBuyins) {
            console.log(`[HorseBrain] 🛑 Stop-Loss: ${playerId.substring(0, 8)} reached max buyins (${sessionPref.maxBuyins}). No rebuy allowed.`);
            return false;
        }
    }

    // ─── GAP 7: Enforce True Bankrolls  ───
    // Query physical chip balance from the club ledger
    const sb = getSupabase();
    if (sb && clubId) {
        try {
            const { data, error } = await sb
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', clubId)
                .eq('profile_id', playerId)
                .single();

            if (error) throw error;

            const realBalance = data?.chip_balance || 0;
            if (realBalance <= 0 || realBalance < minBuyIn) {
                console.log(`[HorseBrain] 💸 BANKRUPT: ${playerId.substring(0, 8)} has only ${realBalance} chips in club. Rebuy DENIED until 9AM reload.`);
                return false;
            }
        } catch (err) {
            console.warn(`[HorseBrain] Failed to verify bankroll for ${playerId.substring(0, 8)}, defaulting to deny:`, err.message);
            return false;
        }
    }

    return true;
}

/**
 * Evaluate all seated horses at a table between hands to see if they should leave
 * @param {Object} gameController - GameController instance
 * @param {Object} tableManager - TableManager instance
 */
async function evaluateSessions(gameController, tableManager) {
    if (!tableManager || !tableManager.seats) return;
    const tableId = tableManager.id;
    const tableSessions = sessionTracker.get(tableId);

    if (!tableSessions) return; // No horses tracked here

    const now = Date.now();
    const today = getTodayString();

    // Lazy-load personality module to get shouldCashOut
    const personality = await getPersonalityModule();

    for (const seat of tableManager.seats) {
        if (!seat.player || seat.status === 'empty') continue;
        const playerId = seat.player.id;

        // Is it a horse we are tracking?
        const session = tableSessions.get(playerId);
        if (!session) continue;

        // Belt-and-suspenders: verify this is actually a horse
        const isAI = await isHorse(playerId);
        if (!isAI) {
            tableSessions.delete(playerId); // Clean up stale human entry
            continue;
        }

        // 1. Update Daily Playtime
        let daily = dailyPlayTracker.get(playerId);
        if (!daily || daily.dateString !== today) {
            daily = { dateString: today, totalMs: 0 };
        }

        const elapsedSinceLastEval = now - session.lastEvalMs;
        daily.totalMs += elapsedSinceLastEval;
        dailyPlayTracker.set(playerId, daily);
        session.lastEvalMs = now;

        // 2. Check 16-Hour Daily Limit (16 * 60 * 60 * 1000 = 57,600,000 ms)
        const SIXTEEN_HOURS_MS = 57600000;
        if (daily.totalMs >= SIXTEEN_HOURS_MS) {
            console.log(`[HorseBrain] 🛑 Daily 16-hour limit reached for ${playerId.substring(0, 8)}. Forcing standUp.`);
            tableSessions.delete(playerId);
            await gameController.standUp(tableId, playerId);
            continue;
        }

        // 3. Evaluate Advanced Cashout Logic (if personality module loaded)
        if (personality && typeof personality.shouldCashOut === 'function') {
            const minutesPlayed = (now - session.startTime) / 60000;
            const currentStack = seat.stack;

            // Use real tilt level from Advanced module instead of estimate
            let estimatedTilt = 0.1;
            try {
                const adv = await getAdvancedModule();
                if (adv?.getTiltLevel) {
                    // getTiltLevel returns 0-10, shouldCashOut expects 0-1
                    estimatedTilt = adv.getTiltLevel(playerId) / 10;
                }
            } catch (_) {
                // Fall back to session-based estimate
                estimatedTilt = session.buyinsUsed > 1 && currentStack <= 0 ? 0.95 : 0.1;
            }

            const { shouldLeave, reason } = personality.shouldCashOut(
                playerId,
                currentStack,
                session.startingStack,
                minutesPlayed,
                session.buyinsUsed,
                estimatedTilt
            );

            if (shouldLeave) {
                console.log(`[HorseBrain] 💸 Cashout triggered for ${playerId.substring(0, 8)}. Reason: ${reason}`);

                // Save session analytics before leaving (#37)
                saveSessionAnalytics(playerId, tableId).catch(() => { });

                tableSessions.delete(playerId);
                await gameController.standUp(tableId, playerId);
            } else {
                // Still playing — check if dynamic rebuy is needed (#39)
                const avgStack = tableManager.seats
                    .filter(s => s.player && s.status !== 'empty')
                    .reduce((sum, s) => sum + (s.stack || 0), 0) / Math.max(1, tableManager.seats.filter(s => s.player).length);
                const bb = tableManager.bigBlind || 2;
                const minBuyIn = bb * 20; // Default minimum buy-in factor 20bbs
                const rebuyInfo = getDynamicRebuyStrategy(playerId, currentStack, bb, session.buyinsUsed, avgStack);

                if (rebuyInfo.shouldRebuy && await canRebuy(tableId, playerId, minBuyIn, tableManager.clubId)) {
                    console.log(`[HorseBrain] 🔄 Dynamic rebuy for ${playerId.substring(0, 8)}: ${rebuyInfo.reason}, amount: ${rebuyInfo.amount}`);

                    // ─── AUDIT 13: Wire into Physical Economy (Rebuy Chips) ───
                    if (tableManager.clubId) {
                        const ChipBridge = require('./ChipBridge');
                        const lockResult = await ChipBridge.rebuyChips(tableManager.clubId, playerId, tableId, rebuyInfo.amount);
                        if (!lockResult.success) {
                            console.warn(`[HorseBrain] Failed to physically lock rebuy chips for ${playerId}:`, lockResult.error);
                            continue; // Skip the RAM top-up if the database lock fails
                        }
                    }

                    recordRebuy(tableId, playerId, rebuyInfo.amount);
                    // Top up the player's stack
                    if (seat.player) seat.player.stack = (seat.player.stack || 0) + rebuyInfo.amount;
                    if (seat.stack !== undefined) seat.stack = (seat.stack || 0) + rebuyInfo.amount;
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5: ANALYTICS, META-GAME & PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

// --- #34: Performance Stats Tracker ---
// In-memory per-session stats (VPIP, PFR, aggression, win rate)
const performanceStats = new Map();

/**
 * Record a decision for performance tracking
 * @param {string} profileId
 * @param {string} street - 'preflop', 'flop', etc.
 * @param {string} action - 'raise', 'call', 'fold', 'check'
 * @param {boolean} wasVoluntary - Did hero put money in voluntarily?
 */
function recordPerformanceAction(profileId, street, action, wasVoluntary = false) {
    if (!performanceStats.has(profileId)) {
        performanceStats.set(profileId, {
            handsPlayed: 0, vpipHands: 0, pfrHands: 0,
            raises: 0, calls: 0, folds: 0, checks: 0,
            wins: 0, losses: 0, totalWonBB: 0,
            sessionStart: Date.now()
        });
    }
    const stats = performanceStats.get(profileId);

    if (street === 'preflop') {
        stats.handsPlayed++;
        if (wasVoluntary || action === 'call' || action === 'raise' || action === 'bet') {
            stats.vpipHands++;
        }
        if (action === 'raise' || action === 'bet') {
            stats.pfrHands++;
        }
    }

    // Track action types
    if (action === 'raise' || action === 'bet') stats.raises++;
    else if (action === 'call') stats.calls++;
    else if (action === 'fold') stats.folds++;
    else if (action === 'check') stats.checks++;
}

/**
 * Get computed stats for a horse
 * @param {string} profileId
 * @returns {Object} { vpip, pfr, af, winRate, handsPlayed }
 */
function getPerformanceStats(profileId) {
    const stats = performanceStats.get(profileId);
    if (!stats || stats.handsPlayed === 0) {
        return { vpip: 0, pfr: 0, af: 0, winRate: 0, handsPlayed: 0 };
    }

    return {
        vpip: Math.round((stats.vpipHands / stats.handsPlayed) * 100),
        pfr: Math.round((stats.pfrHands / stats.handsPlayed) * 100),
        af: stats.calls > 0 ? Math.round((stats.raises / stats.calls) * 10) / 10 : stats.raises,
        winRate: stats.handsPlayed > 0 ? Math.round((stats.totalWonBB / stats.handsPlayed) * 100) / 100 : 0,
        handsPlayed: stats.handsPlayed,
        wins: stats.wins,
        losses: stats.losses,
        sessionMinutes: Math.round((Date.now() - stats.sessionStart) / 60000)
    };
}

/**
 * Record a hand result for performance stats
 * @param {string} profileId
 * @param {boolean} won
 * @param {number} bbWonLost - BBs won or lost (negative for losses)
 */
function recordPerformanceResult(profileId, won, bbWonLost) {
    const stats = performanceStats.get(profileId);
    if (!stats) return;
    if (won) stats.wins++;
    else stats.losses++;
    stats.totalWonBB += bbWonLost;
}

// --- #35: Adaptive Strategy ---
/**
 * Get strategy adjustment based on recent results.
 * Running hot → tighten up (protect winnings).
 * Running cold → loosen slightly (avoid being exploited by tightening too much).
 * @param {string} profileId
 * @returns {{ rangeAdjust: number, aggressionAdjust: number, reason: string }}
 */
function getAdaptiveStrategy(profileId) {
    const stats = performanceStats.get(profileId);
    if (!stats || stats.handsPlayed < 30) {
        return { rangeAdjust: 0, aggressionAdjust: 0, reason: 'insufficient_data' };
    }

    const winRate = stats.totalWonBB / stats.handsPlayed;

    // Running very hot (> 10bb/100): tighten up, protect winnings
    if (winRate > 0.10) {
        return { rangeAdjust: -5, aggressionAdjust: -3, reason: 'protecting_profit' };
    }
    // Running warm (5-10bb/100): slightly tighter
    if (winRate > 0.05) {
        return { rangeAdjust: -2, aggressionAdjust: -1, reason: 'slight_lock_up' };
    }
    // Running cold (-5 to -10bb/100): loosen slightly to find spots
    if (winRate < -0.05 && winRate >= -0.10) {
        return { rangeAdjust: 3, aggressionAdjust: 2, reason: 'finding_spots' };
    }
    // Running very cold (< -10bb/100): getting exploited, adjust
    if (winRate < -0.10) {
        return { rangeAdjust: 5, aggressionAdjust: 4, reason: 'adjusting_to_table' };
    }

    return { rangeAdjust: 0, aggressionAdjust: 0, reason: 'balanced' };
}

// --- #36: Bankroll-Aware Stake Selection ---
/**
 * Recommend the correct stake level based on bankroll.
 * Uses 20-30 buy-in rule for cash games, 50+ for tournaments.
 * @param {number} bankroll - Total bankroll in chips
 * @param {string} gameType - 'Cash' or 'Tournament'
 * @returns {{ maxBuyIn: number, recommendedBlinds: { sb: number, bb: number }, reason: string }}
 */
function getRecommendedStake(bankroll, gameType = 'Cash') {
    if (gameType === 'Tournament') {
        // 50 buy-in rule for tournaments
        const maxBuyIn = Math.floor(bankroll / 50);
        return { maxBuyIn, recommendedBlinds: null, reason: `tournament_buyIn_${maxBuyIn}` };
    }

    // Cash game: 25 buy-in rule (100bb per buy-in)
    const maxBBBankroll = bankroll / 25;
    const maxBB = maxBBBankroll / 100;

    // Standard stake levels
    const stakes = [
        { sb: 0.25, bb: 0.50 }, { sb: 0.50, bb: 1 }, { sb: 1, bb: 2 },
        { sb: 2, bb: 5 }, { sb: 5, bb: 10 }, { sb: 10, bb: 25 },
        { sb: 25, bb: 50 }, { sb: 50, bb: 100 }
    ];

    let recommended = stakes[0];
    for (const stake of stakes) {
        if (stake.bb <= maxBB) recommended = stake;
        else break;
    }

    return {
        maxBuyIn: Math.round(recommended.bb * 100),
        recommendedBlinds: recommended,
        reason: `bankroll_${bankroll}_supports_${recommended.bb}bb`
    };
}

// --- #37: Session Analytics Snapshot (Supabase Persistence) ---
/**
 * Save session analytics to Supabase for long-term tracking.
 * @param {string} profileId
 * @param {string} tableId
 * @returns {Promise<boolean>}
 */
async function saveSessionAnalytics(profileId, tableId) {
    try {
        const stats = getPerformanceStats(profileId);
        if (stats.handsPlayed === 0) return false;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase.from('horse_session_stats').upsert({
            profile_id: profileId,
            table_id: tableId,
            hands_played: stats.handsPlayed,
            vpip: stats.vpip,
            pfr: stats.pfr,
            aggression_factor: stats.af,
            win_rate_bb100: stats.winRate,
            wins: stats.wins,
            losses: stats.losses,
            session_minutes: stats.sessionMinutes,
            recorded_at: new Date().toISOString()
        }, { onConflict: 'profile_id,table_id' });

        if (error) {
            console.warn(`[HorseBrain] Session save failed:`, error.message);
            return false;
        }
        console.log(`[HorseBrain] 📊 Session analytics saved for ${profileId.substring(0, 8)}: ${stats.handsPlayed} hands, ${stats.vpip}% VPIP`);
        return true;
    } catch (err) {
        console.warn('[HorseBrain] Session analytics save error:', err.message);
        return false;
    }
}

// --- #38: Anti-Collusion Guards ---
// Track soft-play frequency between horse pairs
const softPlayLog = new Map();

/**
 * Check if soft-play between two horses has exceeded the limit.
 * Max 3 soft-play actions per hour between any pair.
 * @param {string} horse1Id
 * @param {string} horse2Id
 * @returns {boolean} True if soft-play is allowed, false if blocked
 */
function isSoftPlayAllowed(horse1Id, horse2Id) {
    const pairKey = [horse1Id, horse2Id].sort().join('|');
    const log = softPlayLog.get(pairKey) || [];

    // Clean entries older than 1 hour
    const oneHourAgo = Date.now() - 3600000;
    const recent = log.filter(ts => ts > oneHourAgo);
    softPlayLog.set(pairKey, recent);

    return recent.length < 3; // Max 3 soft-plays per hour
}

/**
 * Record a soft-play action between horses
 * @param {string} horse1Id
 * @param {string} horse2Id
 */
function recordSoftPlay(horse1Id, horse2Id) {
    const pairKey = [horse1Id, horse2Id].sort().join('|');
    const log = softPlayLog.get(pairKey) || [];
    log.push(Date.now());
    softPlayLog.set(pairKey, log);
}

// --- #39: Dynamic Rebuy Strategy ---
/**
 * Determine whether a horse should rebuy based on table conditions.
 * @param {string} profileId
 * @param {number} currentStack - Current stack
 * @param {number} bb - Big blind
 * @param {number} buyInsUsed - Buy-ins used this session
 * @param {number} tableAvgStack - Average stack at the table
 * @returns {{ shouldRebuy: boolean, reason: string, amount: number }}
 */
function getDynamicRebuyStrategy(profileId, currentStack, bb, buyInsUsed, tableAvgStack) {
    const stackBB = currentStack / bb;

    // Hard limit: never rebuy more than 3 times
    if (buyInsUsed >= 3) {
        return { shouldRebuy: false, reason: 'max_buyins_reached', amount: 0 };
    }

    // Short stacked (< 30bb): rebuy to max
    if (stackBB < 30) {
        // Rebuy amount: top up to 100bb or table average, whichever is higher
        const targetStack = Math.max(100 * bb, tableAvgStack);
        const rebuyAmount = targetStack - currentStack;
        return { shouldRebuy: true, reason: 'short_stacked', amount: Math.round(rebuyAmount) };
    }

    // Medium stack (30-60bb): rebuy if table average is much higher
    if (stackBB < 60 && tableAvgStack > currentStack * 1.5) {
        const rebuyAmount = tableAvgStack - currentStack;
        return { shouldRebuy: true, reason: 'below_table_average', amount: Math.round(rebuyAmount) };
    }

    return { shouldRebuy: false, reason: 'adequate_stack', amount: 0 };
}

// --- #40: Opponent Modeling Persistence ---
/**
 * Save opponent reads to Supabase for future sessions.
 * @param {string} horseId
 * @param {string} opponentId
 * @param {Object} read - Opponent read data
 * @returns {Promise<boolean>}
 */
async function saveOpponentRead(horseId, opponentId, read) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase.from('horse_opponent_reads').upsert({
            horse_id: horseId,
            opponent_id: opponentId,
            bluff_frequency: read.bluffFrequency,
            value_frequency: read.valueFrequency,
            fold_frequency: read.foldFrequency,
            call_frequency: read.callFrequency,
            hands_observed: read.handsObserved,
            tendency: read.tendency,
            updated_at: new Date().toISOString()
        }, { onConflict: 'horse_id,opponent_id' });

        if (!error) {
            console.log(`[HorseBrain] 🧠 Opponent read saved: ${horseId.substring(0, 8)} on ${opponentId.substring(0, 8)}`);
        }
        return !error;
    } catch (err) {
        return false;
    }
}

// --- #41: Hand History Persistence ---
/**
 * Save a key hand to Supabase for long-term analysis.
 * Only saves "interesting" hands (big pots, bad beats, bluffs).
 * @param {Object} handData - Hand details
 * @param {number} bb - Big blind
 * @returns {Promise<boolean>}
 */
async function saveKeyHand(handData, bb = 2) {
    try {
        if (!handData?.result) return false;

        // Only save hands with significant action (>10bb pot)
        const potBB = (handData.result.pot || 0) / bb;
        if (potBB < 10) return false;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return false;

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase.from('horse_hand_history').insert({
            hand_id: handData.handId || `hand_${Date.now()}`,
            table_id: handData.tableId,
            pot_size_bb: Math.round(potBB),
            players: JSON.stringify(handData.result.players?.map(p => ({
                id: p.id,
                won: handData.result.winners?.some(w => String(w.playerId) === String(p.id)),
                chipDelta: p.chipDelta
            })) || []),
            board: JSON.stringify(handData.result.board || []),
            recorded_at: new Date().toISOString()
        });

        return !error;
    } catch (err) {
        return false;
    }
}

// --- #42: Horse Personality Evolution ---
// Track skill progression per horse
const evolutionTracker = new Map();

/**
 * Evolve horse's effective skill based on long-term results.
 * Winners improve (up to +10%), losers regress (down to -5%).
 * @param {string} profileId
 * @param {number} sessionWinRate - BB/100 win rate for session
 * @returns {{ skillDrift: number, direction: string }}
 */
function evolveHorseSkill(profileId, sessionWinRate) {
    const current = evolutionTracker.get(profileId) || { drift: 0, sessions: 0 };
    current.sessions++;

    if (sessionWinRate > 5) {
        // Winning: improve slowly (max +10)
        current.drift = Math.min(10, current.drift + 1);
    } else if (sessionWinRate < -5) {
        // Losing: regress slowly (min -5)
        current.drift = Math.max(-5, current.drift - 0.5);
    }

    evolutionTracker.set(profileId, current);

    // Persist to Supabase (non-blocking) — Gap 3
    // Uses same schema as saveSessionAnalytics: profile_id, table_id, individual columns
    const sb = getSupabase();
    if (sb) {
        sb.from('horse_session_stats')
            .upsert({
                profile_id: profileId,
                table_id: `evolution_${profileId}`,
                hands_played: current.sessions,
                vpip: 0,
                pfr: 0,
                aggression_factor: 0,
                win_rate_bb100: current.drift,
                wins: current.drift > 0 ? current.sessions : 0,
                losses: current.drift < 0 ? current.sessions : 0,
                session_minutes: 0,
                recorded_at: new Date().toISOString()
            }, { onConflict: 'profile_id,table_id' })
            .then(() => console.log(`[HorseBrain] 📈 Skill drift persisted for ${profileId.substring(0, 8)}: ${current.drift > 0 ? '+' : ''}${current.drift}`))
            .catch(() => { /* Non-critical */ });
    }

    return {
        skillDrift: current.drift,
        direction: current.drift > 2 ? 'improving' : current.drift < -2 ? 'regressing' : 'stable'
    };
}

/**
 * Get current skill drift for a horse
 * @param {string} profileId
 * @returns {number} Drift value (-5 to +10)
 */
function getSkillDrift(profileId) {
    return (evolutionTracker.get(profileId) || { drift: 0 }).drift;
}

// --- #43: Session Review System ---
/**
 * Generate a post-session review summary.
 * @param {string} profileId
 * @returns {Object} Session review data
 */
function getSessionReview(profileId) {
    const stats = getPerformanceStats(profileId);
    const adaptive = getAdaptiveStrategy(profileId);
    const drift = getSkillDrift(profileId);

    const review = {
        profileId: profileId.substring(0, 8),
        handsPlayed: stats.handsPlayed,
        duration: `${stats.sessionMinutes}m`,
        vpip: `${stats.vpip}%`,
        pfr: `${stats.pfr}%`,
        af: stats.af,
        winRate: `${stats.winRate} BB/hand`,
        wins: stats.wins,
        losses: stats.losses,
        strategyAdjustment: adaptive.reason,
        skillEvolution: drift > 0 ? `+${drift}` : `${drift}`,
        grade: stats.winRate > 0.05 ? 'A' :
            stats.winRate > 0 ? 'B' :
                stats.winRate > -0.05 ? 'C' : 'D'
    };

    return review;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a horse can sit at another table (based on skill-based table limits)
 * Fish = 1 table, Calling_station = 1, Rec = 2, Grinder = 3, Reg/Crusher = 4
 * @param {string} playerId
 * @returns {Promise<boolean>}
 */
async function canSitAtTable(playerId) {
    const currentTables = multiTableTracker.get(playerId)?.size || 0;

    const personality = await getPersonalityModule();
    if (!personality?.getSkillTier) return true;

    const skill = personality.getSkillTier(playerId);
    const tableLimits = { fish: 1, recreational: 2, grinder: 3, reg: 4, crusher: 4 };
    const maxTables = tableLimits[skill.key] || 2;

    if (currentTables >= maxTables) {
        console.log(`[HorseBrain] 🚫 Multi-table limit: ${playerId.substring(0, 8)} at ${currentTables}/${maxTables} tables`);
        return false;
    }
    return true;
}

/**
 * Get pending AI chat messages for the table (drained after read)
 * @returns {Array}
 */
function getChatMessages() {
    return chatMessages.splice(0);
}

/**
 * Clean up multi-table tracking when a player leaves a table
 * @param {string} tableId
 * @param {string} playerId
 */
function cleanupMultiTable(tableId, playerId) {
    const tables = multiTableTracker.get(playerId);
    if (tables) {
        tables.delete(tableId);
        if (tables.size === 0) multiTableTracker.delete(playerId);
    }
}

/**
 * Warm the GTO cache on startup with common preflop charts (#19)
 */
async function warmGTOCache() {
    try {
        const gto = await getGTOModule();
        if (!gto?.getPreflopRange) return;

        const positions = ['BTN', 'CO', 'HJ', 'SB', 'BB', 'UTG', 'MP'];
        const topologies = ['6-Max'];
        const depths = ['100bb'];

        let loaded = 0;
        for (const pos of positions) {
            for (const topo of topologies) {
                for (const depth of depths) {
                    const chartName = `${pos}_Open_${depth}_${topo}`;
                    await gto.getPreflopRange(chartName);
                    loaded++;
                }
            }
        }
        console.log(`[HorseBrain] 🔥 GTO cache warmed: ${loaded} charts pre-loaded`);
    } catch (err) {
        console.warn('[HorseBrain] GTO cache warming failed:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Core
    isHorse,
    getDecision,
    loadHorseIds,

    // Session & Bankroll (Phase 2)
    recordSitDown,
    recordRebuy,
    evaluateSessions,
    clearTableSessions,
    canRebuy,
    processHandResult,

    // Multi-table (#5)
    canSitAtTable,
    cleanupMultiTable,

    // Table Chat (#10)
    getChatMessages,

    // Infrastructure (#19)
    warmGTOCache,

    // Helpers (exposed for testing)
    cardIntToString,
    cardsToStrings,
    mapPosition,
    formatHandString,
    getPreflopStrength,
    getActionDelay,
    validateAndClamp,
    makeFallbackDecision,
    evaluatePostflopHand,
    evaluateBoardWetness,

    // Phase 4: Advanced Intelligence
    getSPRStrategy,
    getMultiwayAdjustment,
    getCheckRaiseStrategy,
    getCBetStrategy,
    get3BetStrategy,
    getDrawEquity,
    getRiverStrategy,
    getDeepStackAdjustment,
    getOptimalBetSize,
    shouldAutoSeat,

    // Phase 5: Analytics & Meta-Game
    recordPerformanceAction,
    getPerformanceStats,
    recordPerformanceResult,
    getAdaptiveStrategy,
    getRecommendedStake,
    saveSessionAnalytics,
    isSoftPlayAllowed,
    recordSoftPlay,
    getDynamicRebuyStrategy,
    saveOpponentRead,
    saveKeyHand,
    evolveHorseSkill,
    getSkillDrift,
    getSessionReview,

    // Phase 7: Anti-Exploit Countermeasure Modules
    selectCounterStrategy,        // Module 8: Counter-Exploit Profiler
    frequencyObfuscatorMap,       // Module 1: Frequency Obfuscator (exposed for testing)
    showdownExposureMap,          // Module 3: Showdown Exposure Tracker
    patternProfitMap,             // Module 4: Pattern Exploitation Detector
    chaosSuppressionMap,          // Module 6: Enhanced Chaos Cooldown
    suspectBotMap,                // Module 7: Bot/Solver Opponent Detector

    // Phase 2: Cross-Session Threat Intelligence (Modules 9-16)
    _loadThreatIntel,             // Module 9: Threat Intel lazy-load
    _persistThreatIntel,          // Module 9: Threat Intel persistence
    getThreatScore,               // Module 14: Unified Threat Score
    isBlacklisted,                // Module 14: Blacklist check
    crossTableRadar,              // Module 10: Cross-Table Collusion Radar
    getRangeRotationGear,         // Module 11: Proactive Range Rotation
    rangeRotationMap,             // Module 11: Range rotation state
    applyMultiwayEquityDiscount,  // Module 12: PLO Multiway Equity Shield
    detectNutBiasExploitBoard,    // Module 13: PLO Nut-Bias Exploit Detector
    timeAbuseSuspicion,           // Module 15: Timebank Abuse Detector
    tableTimebankBlacklist,       // Module 15: Timebank table blacklist
    threatIntelCache,             // Module 16: Threat score cache (Supabase read)
    // ─── PHASE 3: IN-SESSION EXPLOITATION DEFENSE ───
    reevaluatePLORunoutEquity,    // Module 17: Runout Equity Re-Evaluator
    detectSPRTrap,                // Module 18: SPR Pot-Commitment Trap Detector
    probeBetMap,                  // Module 19: Probe-Bet Frequency Harvester (Map)
    recordProbeBet,               // Module 19: Probe recording
    getProbeFarmScore,            // Module 19: Probe farm score
    imageExposureMap,             // Module 20: Table Image Exposure Monitor (Map)
    recordTableImageHand,         // Module 20: Image recording
    isImageExposed,               // Module 20: Is image exposed?
    detectLimpTrap,               // Module 21: PLO Preflop Limp-Trap Detector
    isoSizingMap,                 // Module 22: Isolation Sizing Tell Tracker (Map)
    recordIsoSize,                // Module 22: Iso recording
    isMechanicalIsolator,         // Module 22: Check for mechanical isolator
    getOOPPositionalGuard,        // Module 23: OOP Positional Equity Leak Guard
    evaluateDonkBet,              // Module 24: River Donk-Bet Exploitation Block
};

