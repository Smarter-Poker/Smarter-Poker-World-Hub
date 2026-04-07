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

/**
 * Synchronous check if a player ID is a horse (uses cache only).
 * Returns false if cache is not yet loaded. Use isHorse() for async guaranteed check.
 * @param {string} playerId
 * @returns {boolean}
 */
function isHorseSync(playerId) {
    return _horseIds ? _horseIds.has(String(playerId)) : false;
}

/**
 * Get all horse IDs seated at a table from a player list.
 * Uses the synchronous cache for zero-latency lookups on every action.
 * @param {Array} players - [{id, ...}]
 * @returns {string[]} Array of horse profile IDs at this table
 */
function getHorseIdsAtTable(players) {
    if (!_horseIds || !players) return [];
    return players
        .map(p => String(p.id || p.playerId || p))
        .filter(id => _horseIds.has(id));
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
    // Bug #78 fix: AA/KK were dramatically undervalued. In PLO, AA is always premium
    // even with danglers. KK double-suited is tier 1. These bonuses ensure premium pairs
    // score above the open-raise threshold even when bare/rainbow.
    if (hasAA) highCardScore += 48; // AA is THE best starting hand in PLO — always opens
    else if (hasKK) highCardScore += 32; // KK is tier 1-2 — opens from most positions
    else if (hasQQ) highCardScore += 16; // QQ connected is solid
    // General pair bonus for JJ-TT-99 etc (set-mining value in PLO)
    if (!hasAA && !hasKK && !hasQQ && pairs.length > 0) {
        const pairRank = Math.max(...pairs.map(([r]) => Number(r)));
        if (pairRank >= 9) highCardScore += 10;       // JJ, TT (good set mine)
        else if (pairRank >= 7) highCardScore += 6;    // 99, 88 (decent set mine)
        else highCardScore += 3;                        // Low pairs (marginal set mine)
    }
    // Suited side card bonus: AA83 with Ah8h is MUCH stronger than AA83 rainbow
    // The ace-suited side card gives nut flush draw potential post-flop
    if (hasAA) {
        const aceSuits = cards.filter(c => c.rank === 12).map(c => c.suit);
        const nonAceSuits = cards.filter(c => c.rank !== 12).map(c => c.suit);
        const hasAceSuitMatch = aceSuits.some(s => nonAceSuits.includes(s));
        if (hasAceSuitMatch) highCardScore += 8; // Ace matches a side card suit → nut flush draw backup
    }
    if (hasKK) {
        const kingSuits = cards.filter(c => c.rank === 11).map(c => c.suit);
        const nonKingSuits = cards.filter(c => c.rank !== 11).map(c => c.suit);
        const hasKingSuitMatch = kingSuits.some(s => nonKingSuits.includes(s));
        if (hasKingSuitMatch) highCardScore += 5; // King-suited side card
    }
    if (hasAce && !hasAA) highCardScore += 10; // Solitary Ace w/o pair
    if (hasKing && !hasKK) highCardScore += 5;

    // Bug #78 fix: High rundowns are much stronger than low rundowns in PLO.
    // T-J-Q-K rundown makes nut straights; 2-3-4-5 makes only bottom straights.
    // Low rundowns have reverse-implied-odds but pure connected low hands can still be IP-playable.
    const highestRank = Math.max(...ranks);
    if (highestRank <= 3) bestRundownScore = Math.round(bestRundownScore * 0.45); // 5-high: very weak straights
    else if (highestRank <= 5) bestRundownScore = Math.round(bestRundownScore * 0.58); // 6-7 high: low but connected
    else if (highestRank <= 7) bestRundownScore = Math.round(bestRundownScore * 0.72); // 8-9 high: moderate discount
    else if (highestRank <= 9) bestRundownScore = Math.round(bestRundownScore * 0.85); // T-J high: slight discount

    // ── Dangling card penalty ──
    // Bug #78 fix: Check non-paired cards for disconnection from the hand's core
    // Pair cards (AA, KK etc.) are the VALUE — they can't be danglers.
    // Only non-paired cards that are far from the rest count as danglers.
    const sortedU = uniqueRanks;
    let danglerPenalty = 0;
    const pairedRanks = new Set(pairs.map(([r]) => Number(r)));
    if (sortedU.length >= 3) {
        for (let i = 0; i < sortedU.length; i++) {
            if (pairedRanks.has(sortedU[i])) continue; // Skip paired ranks — they're the hand's value
            const distances = sortedU.filter((_, j) => j !== i).map(r => Math.abs(r - sortedU[i]));
            const minDist = Math.min(...distances);
            if (minDist >= 5) danglerPenalty += 12;       // Extreme dangler (K-4-3-2 type)
            else if (minDist >= 4) danglerPenalty += 8;    // Bad dangler (J-4-3-2 type)
            else if (minDist >= 3) danglerPenalty += 4;    // Mild dangler (7-4-3-2 type)
        }
        // Premium pairs: side cards being danglers matters less because the pair IS the hand
        if (hasAA) danglerPenalty = Math.round(danglerPenalty * 0.30);
        else if (hasKK) danglerPenalty = Math.round(danglerPenalty * 0.45);
        else if (hasQQ) danglerPenalty = Math.round(danglerPenalty * 0.55);
    }

    // ── PURE TRASH GATE ──
    // Hands like J432, K832, 9532, Q732 are auto-fold in PLO regardless of position.
    // Pattern: one high card completely disconnected from a group of low cards, no premium pair.
    // These hands make dominated straights, can't nut, and have zero post-flop playability.
    if (!hasAA && !hasKK && !hasQQ && pairs.length === 0) {
        // Check if the highest card is >= 3 ranks away from the 2nd highest
        const topGap = sortedU.length >= 2 ? sortedU[0] - sortedU[1] : 0;
        // And the rest of the hand is low (all non-top cards <= 6 = rank 4)
        const lowCards = sortedU.slice(1);
        const allLow = lowCards.every(r => r <= 4);
        if (topGap >= 3 && allLow) {
            return Math.min(30, 10 + suitScore); // Cap at 30 (always fold territory)
        }
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

    // Bug #99: Include wheel (A-2-3-4-5 = ranks [3,2,1,0,12])
    const straightDrawWindows = [];
    for (let h = 12; h >= 4; h--) {
        straightDrawWindows.push({ ranks: [h, h - 1, h - 2, h - 3, h - 4], highVal: h });
    }
    straightDrawWindows.push({ ranks: [3, 2, 1, 0, 12], highVal: 3 }); // Wheel (5-high)
    for (const { ranks: needed, highVal: high } of straightDrawWindows) {
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

    // Bug #84: If we hold 3+ cards of the flush suit, our implied odds are REDUCED.
    // Opponents are less likely to have that suit themselves, so when we hit,
    // we get less action. Also, having 3 of a suit means we hold more of the outs ourselves.
    const holdingThreeOfSuit = bestSuit && holeCards.filter(c => c.suit === bestSuit).length >= 3;
    if (holdingThreeOfSuit && bestOuts > 0) {
        bestOuts = Math.max(bestOuts - 2, 0); // Reduce by 2 for diminished implied odds
    }

    return { outs: bestOuts, isNutFlushDraw, suit: bestSuit, holdingThreeOfSuit: !!holdingThreeOfSuit };
}

/**
 * Detect backdoor draws (2 to a flush with 3 board cards, or 3 to a straight).
 * Backdoor draws add approximately 1-2 pseudo outs.
 */
function countBackdoorOuts(holeCards, boardCards) {
    const holeSuits = holeCards.map(c => c.suit);
    const boardSuits = boardCards.map(c => c.suit);
    const holeRanks = holeCards.map(c => c.rank);
    const boardRanks = boardCards.map(c => c.rank);
    let backdoor = 0;

    // Backdoor flush = 2 hole cards of same suit + 1 board card of same suit (flop only)
    if (boardCards.length === 3) {
        for (const suit of new Set(holeSuits)) {
            const h = holeSuits.filter(s => s === suit).length;
            const b = boardSuits.filter(s => s === suit).length;
            if (h >= 2 && b === 1) { backdoor += 2; break; }
        }

        // Bug #95: Backdoor straight = 3 cards to a straight using 2+ hole cards
        const allRanks = [...new Set([...holeRanks, ...boardRanks])].sort((a, b) => a - b);
        for (let high = 12; high >= 4; high--) {
            const needed = [high, high - 1, high - 2, high - 3, high - 4];
            const haveCount = needed.filter(r => allRanks.includes(r)).length;
            const holeContrib = needed.filter(r => holeRanks.includes(r)).length;
            if (haveCount >= 3 && holeContrib >= 2) {
                backdoor += 1; // ~1 pseudo-out for backdoor straight
                break;
            }
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
        return { strength: 0, category: 'no_board', isNut: false, hasRedraw: false, isMade: false };
    }

    const hRanks = holeCards.map(c => c.rank);
    const bRanks = boardCards.map(c => c.rank).sort((a, b) => b - a);
    const hSuits = holeCards.map(c => c.suit);
    const bSuits = boardCards.map(c => c.suit);

    const boardTop = bRanks[0]; // Highest board rank

    // ── Bug #82a: Check for Quads (four of a kind) ──
    const allRanks = [...hRanks, ...bRanks];
    const allRankFreq = {};
    for (const r of allRanks) allRankFreq[r] = (allRankFreq[r] || 0) + 1;
    for (const [rank, count] of Object.entries(allRankFreq)) {
        if (count >= 4) {
            const r = parseInt(rank);
            const holeCount = hRanks.filter(hr => hr === r).length;
            const boardCount = bRanks.filter(br => br === r).length;
            // PLO rule: must use exactly 2 hole cards. Need at least 2 from hole AND 2 from board
            if (holeCount >= 2 && boardCount >= 2) {
                return { strength: 98, category: 'quads', isNut: true, hasRedraw: false, isMade: true };
            }
        }
    }

    // ── Bug #82b: Check for Straight Flush ──
    for (const suit of new Set(hSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit).map(c => c.rank);
        const bOfSuit = boardCards.filter(c => c.suit === suit).map(c => c.rank);
        if (hOfSuit.length >= 2 && bOfSuit.length >= 3) {
            // Check if we can make a 5-card straight flush using 2 hole + 3 board
            for (let high = 12; high >= 4; high--) {
                const needed = [high, high - 1, high - 2, high - 3, high - 4];
                const holePart = needed.filter(r => hOfSuit.includes(r));
                const boardPart = needed.filter(r => bOfSuit.includes(r));
                if (holePart.length >= 2 && boardPart.length >= 3 && holePart.length + boardPart.length >= 5) {
                    return { strength: 100, category: 'straight_flush', isNut: true, hasRedraw: false, isMade: true };
                }
            }
        }
    }

    // ── Check for Flush (must have 2+ hole cards of same suit matching 3+ board) ──
    let flushStrength = 0;
    let hasNutFlush = false;
    let hasFlush = false;
    let flushHasRedraw = false;
    for (const suit of new Set(hSuits)) {
        const hOfSuit = holeCards.filter(c => c.suit === suit);
        const bOfSuit = boardCards.filter(c => c.suit === suit);
        if (hOfSuit.length >= 2 && bOfSuit.length >= 3) {
            hasFlush = true;
            const maxHoleRank = Math.max(...hOfSuit.map(c => c.rank));
            hasNutFlush = maxHoleRank === 12; // Ace-high flush
            // Bug #82c: In PLO, 2nd nut flush is MUCH weaker than nut flush.
            // Non-nut flushes face serious reverse implied odds.
            if (hasNutFlush) {
                flushStrength = 95;
            } else if (maxHoleRank === 11) { // King-high flush
                flushStrength = 80; // Decent but vulnerable
            } else {
                flushStrength = 60 + maxHoleRank; // 3rd nut and below: very risky in PLO
            }
            // Bug #82d: Check for flush + set/two-pair redraw (full house potential)
            // If any of our hole cards pair the board, we have a full house redraw
            if (hRanks.some(r => bRanks.includes(r))) flushHasRedraw = true;
            // If we have a pocket pair, we have set-mine potential on future boards
            const hRankFreqLocal = {};
            for (const r of hRanks) hRankFreqLocal[r] = (hRankFreqLocal[r] || 0) + 1;
            if (Object.values(hRankFreqLocal).some(cnt => cnt >= 2)) flushHasRedraw = true;
        }
    }
    if (hasFlush) {
        return { strength: flushStrength, category: hasNutFlush ? 'nut_flush' : 'flush', isNut: hasNutFlush, hasRedraw: flushHasRedraw, isMade: true };
    }

    // ── Check for Straight (must use exactly 2 hole cards) ──
    let bestStraight = 0;
    let isNutStraight = false;
    // Bug #100: Include wheel (A-2-3-4-5 = ranks [3,2,1,0,12])
    const madeStrWindows = [];
    for (let h = 12; h >= 4; h--) {
        madeStrWindows.push({ needed: [h, h - 1, h - 2, h - 3, h - 4], high: h });
    }
    madeStrWindows.push({ needed: [3, 2, 1, 0, 12], high: 3 }); // Wheel (5-high)
    for (const { needed, high } of madeStrWindows) {
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
        return { strength: Math.min(bestStraight, 90), category: isNutStraight ? 'nut_straight' : 'straight', isNut: isNutStraight, hasRedraw: false, isMade: true };
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
    // Case A: Hole pair hits a board rank (making trips) AND another pair exists
    // Case B: Board has trips AND we have any pocket pair (boat)
    // Phase 48 FIX: Was returning full_house for ANY hole pair when board had a pair,
    // even when the hole pair didn't connect to the board at all.
    for (const hp of holePairs) {
        // Case A: Our pair matches a board card → we have trips
        if (bRanks.includes(hp)) {
            // We have trips; any other pair on board completes the boat
            const otherBoardPairs = boardPairs.filter(bp => bp !== hp);
            if (otherBoardPairs.length > 0 || boardTrips.length > 0) {
                const isTopSet = hp === boardTop;
                return {
                    strength: isTopSet ? 88 : 78,
                    category: 'full_house',
                    isNut: isTopSet,
                    hasRedraw: isTopSet,
                    isMade: true
                };
            }
        }
        // Case B: Board has trips and we have a pocket pair → boat
        if (boardTrips.length > 0) {
            return {
                strength: hp > boardTrips[0] ? 82 : 72,
                category: 'full_house',
                isNut: false,
                hasRedraw: false,
                isMade: true
            };
        }
    }

    // ── Set (Pocket pair in hole hits board rank = trips in PLO = set only if 1 on board) ──
    // Bug #86: Set-over-set risk in PLO is MUCH higher than Hold'em (4 hole cards each).
    // Top set is strong. Middle set is okay but risky. Bottom set is very dangerous
    // and should be played cautiously — it's a trap hand in PLO.
    for (const hp of holePairs) {
        if (bRanks.includes(hp) && bRankFreq[hp] === 1) {
            const isTopSet = hp === boardTop;
            // Bug #86: Calculate set position relative to board
            const sortedBoardUnique = [...new Set(bRanks)].sort((a, b) => b - a);
            const setPosition = sortedBoardUnique.indexOf(hp); // 0=top, 1=middle, 2+=bottom
            let setStrength;
            if (isTopSet) {
                setStrength = 76; // Top set: strong but not invincible in PLO
            } else if (setPosition === 1) {
                setStrength = 60; // Middle set: risky, set-over-set happens often in PLO
            } else {
                setStrength = 50; // Bottom set: very dangerous, play cautiously
            }
            return {
                strength: setStrength,
                category: isTopSet ? 'top_set' : setPosition === 1 ? 'middle_set' : 'bottom_set',
                isNut: false, // Sets aren't nuts in PLO if flushes/straights possible
                hasRedraw: true, // Sets have full house redraws
                isMade: true
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
            hasRedraw: true,
            isMade: true
        };
    }

    // ── Bug #90: Overpair detection (pocket pair above all board cards) ──
    const hRankFreqOP = {};
    for (const r of hRanks) hRankFreqOP[r] = (hRankFreqOP[r] || 0) + 1;
    for (const [rank, cnt] of Object.entries(hRankFreqOP)) {
        const r = parseInt(rank);
        if (cnt >= 2 && r > boardTop) {
            return {
                strength: r >= 10 ? 45 : 40,
                category: 'overpair',
                isNut: false,
                hasRedraw: true,
                isMade: true
            };
        }
    }

    // ── One Pair (top pair or under-pair) ──
    for (const r of hRanks) {
        if (bRanks.includes(r)) {
            const isTopPair = r === boardTop;
            return {
                strength: isTopPair ? 38 : 25,
                category: isTopPair ? 'top_pair' : 'low_pair',
                isNut: false,
                hasRedraw: false,
                isMade: true
            };
        }
    }

    // ── High card / No pair ──
    const maxHole = Math.max(...hRanks);
    return {
        strength: maxHole > boardTop ? 20 : 10,
        category: maxHole > boardTop ? 'overcards' : 'air',
        isNut: false,
        hasRedraw: false,
        isMade: false
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

    // Phase 48 FIX: Translate rank 12 (A) → -1 for low eval (Ace is the LOWEST card in PLO8).
    // Previously mapped A→0, which collided with rank 0 (the 2 card), making A-2 combos
    // fail the h1 === h2 duplicate check. Now A→-1 so A and 2 are distinct.
    const toLowRank = r => r === 12 ? -1 : r;
    const hLow = hRanks.map(toLowRank);
    const bLow = bRanks.map(toLowRank);

    // Qualifying low ranks: -1(A),0(2),1(3),2(4),3(5),4(6),5(7),6(8) → ranks ≤ 6 for 8-low
    const hLowQualify = hLow.filter(r => r <= 6); // ≤ 8 in real (-1=A, 6=8)
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
    // Bug #106: Was `maxSuit === boardCards.length && boardCards.length === 3` — only detected
    // monotone on the FLOP. A 4-card or 5-card all-same-suit board was labeled 'two_tone'
    // because isMonotone was false, causing all monotone-specific logic (RIO penalties,
    // texture classification, aggression dampening) to silently fail on turn/river.
    const isMonotone = maxSuit === boardCards.length;
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
    const twoTone = Object.values(suitFreq).some(v => v >= 2) && !isMonotone;
    const isWet = twoTone || isMonotone || straightCompleted || (maxC >= 3);
    return { texture, flushCompleted, monoBoardPenalty, isDangerous: isMonotone || isPaired || flushCompleted || straightCompleted, straightCompleted, isRunOutBoard, isPaired, isMonotone, twoTone, isWet };
}

/** Detects scare cards on turn/river (cards completing flush, straight, or pairing the board) */
function detectScareCard(boardCards, street) {
    if (!Array.isArray(boardCards) || boardCards.length < 4) return { isScareTurn: false, isScareRiver: false, scareType: 'none' }; // Bug #51: guard non-array
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

    // Standard isolation sizing: 3BB + 1BB per limper
    // Example: 1 limper = 4BB, 2 limpers = 5BB, 3 limpers = 6BB
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
    const isLosingBig = (opponentLosses || 0) >= 50; // 50BB+ down

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
        // Bug #94: Bottom/middle sets on turn need urgent protection
        if (madeHand.category === 'bottom_set' || madeHand.category === 'middle_set') {
            shouldPlayFastNow = true;
            futureValue -= 5; // Vulnerable sets lose to straights/flushes on river
        }
        // Bug #94: Combo draws on turn are pure equity plays
        if (totalOuts >= 12) {
            shouldPlayFastNow = true;
            futureValue += 8;
        }
    }

    // Bug #94: River handling — no draws to improve, pure made hand value
    if (street === 'river') {
        futureValue = 0;
        if (madeHand.strength >= 70) shouldPlayFastNow = true;
        if (madeHand.strength >= 40 && madeHand.strength < 65) shouldSlowPlay = true;
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
function getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity, madeHandStrength) {
    if (!wasPFRaiser) return { shouldCBet: false, cBetFraction: 0, reason: 'not_pfr' };
    if (numPlayers > 3) return { shouldCBet: equity >= 65, cBetFraction: 0.75, reason: 'multiway_value_only' };

    // Bug #96: Distinguish made hand equity from draw equity for c-bet sizing
    const mhs = madeHandStrength || 0;
    const isDrawHeavy = equity >= 50 && mhs < 35;

    // Dry boards: c-bet high frequency with strong hands + semi-bluffs
    if (boardTexture.texture === 'rainbow') {
        if (mhs >= 50) return { shouldCBet: true, cBetFraction: 0.65, reason: 'dry_value' };
        if (isDrawHeavy && isIP) return { shouldCBet: true, cBetFraction: 0.50, reason: 'dry_semi_bluff' };
        if (equity >= 50) return { shouldCBet: true, cBetFraction: 0.60, reason: 'dry_value' };
        if (isIP && Math.random() < 0.35) return { shouldCBet: true, cBetFraction: 0.45, reason: 'dry_bluff_ip' };
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
function getPLOTurnBarrel(equity, madeHand, straightOuts, flushOuts, isScareTurn, boardTexture, isIP, isNutFlushDraw) {
    const totalOuts = straightOuts + flushOuts;

    // Strong made hands always barrel
    if (equity >= 75) return { shouldBarrel: true, barrelFraction: 0.85 };

    // Scare card hit: slow down with medium hands
    if (isScareTurn && equity < 70) return { shouldBarrel: false, barrelFraction: 0 };

    // Big wrap (15+ outs): barrel to charge opponents
    if (straightOuts >= 15) return { shouldBarrel: true, barrelFraction: 0.75 };

    // Bug #93: Nut flush draw: barrel aggressively. Non-nut: barrel smaller.
    if (flushOuts >= 8 && isNutFlushDraw) return { shouldBarrel: true, barrelFraction: 0.70 };
    if (flushOuts >= 8 && !isNutFlushDraw) return { shouldBarrel: true, barrelFraction: 0.55 };

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
    const highSDVHands = ['top_set', 'middle_set', 'bottom_set', 'set', 'full_house', 'nut_flush', 'nut_straight', 'flush', 'straight', 'overpair'];
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
function getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw, street) {
    if (toCall <= 0) return { impliedOdds: Infinity, isProfitableCall: true, impliedMultiplier: 0 };

    // Bug #92: Rule of 4 on flop (2 cards to come), Rule of 2 on turn (1 card to come)
    const perOutRate = (street === 'flop') ? 0.042 : 0.022;
    const hitRate = Math.min(totalOuts * perOutRate, 0.65); // Cap at 65%
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
        ['top_set', 'middle_set', 'bottom_set', 'full_house', 'nut_flush', 'nut_straight', 'two_pair', 'overpair'].includes(madeHand.category);

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
            .maybeSingle();

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
 * BB has the best odds to defend (already invested 1BB);
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
        // Bug #97: Fold truly weak hands — PLO BB gets great pot odds, defend wider
        if (strength < 32) return { action: 'fold' };
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
// ICM bubble, river floats, deep-stack (200BB+), squeeze plays.
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
 * Very deep stacked PLO (200BB+) is fundamentally different:
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
    const deepnessMultiplier = Math.min((stackBB - 100) / 200, 1.0); // 0 at 100BB, 1.0 at 300BB+

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

    // Bug #83: Non-nut DRAWS (not just made hands) have significant RIO in PLO.
    // Drawing to the 2nd or 3rd nut flush is a recipe for stacking off with 2nd best.
    // This was only checking made hand category before — now checks draw quality too.

    // Non-nut flush draw: could HIT 2nd-best flush (VERY common in PLO)
    if (!isNutFlushDraw && madeHand.category === 'flush') {
        rioDiscount = numPlayers > 2 ? -18 : -10;
        rioRisk = 'high';
    }
    // Bug #83: Non-nut flush DRAW (not yet made): if we're drawing without the nut flush draw,
    // we might make a flush that loses to a bigger flush. This is the #1 way to go broke in PLO.
    if (!isNutFlushDraw && madeHand.category !== 'flush' && madeHand.category !== 'nut_flush') {
        // We're still drawing — if we have flush outs but they're not the nut flush draw,
        // apply a penalty. The penalty is milder than for made non-nut flushes because
        // we haven't invested as much yet.
        if (boardTexture.isMonotone || (boardTexture.twoTone && !isNutFlushDraw)) {
            rioDiscount = Math.min(rioDiscount, numPlayers > 2 ? -12 : -6);
            rioRisk = rioRisk === 'very_high' ? 'very_high' : 'medium';
        }
    }
    // Non-nut straight draw on a monotone board: flush already beats us when we hit
    if (!isNutStraightDraw && boardTexture.isMonotone) {
        rioDiscount = numPlayers > 2 ? -22 : -14;
        rioRisk = 'very_high';
    }
    // Non-nut flush draw on paired board: full house beats our flush
    if (!isNutFlushDraw && boardTexture.isPaired) {
        rioDiscount = Math.min(rioDiscount, -15);
        rioRisk = 'high';
    }
    // Bug #83: Non-nut straight on wet board: higher straight could be out there
    if (!isNutStraightDraw && !boardTexture.isMonotone && boardTexture.isWet) {
        rioDiscount = Math.min(rioDiscount, numPlayers > 2 ? -8 : -4);
        if (rioRisk === 'low') rioRisk = 'medium';
    }
    // Nut draws: minimal RIO (checked LAST to override penalties)
    if (isNutFlushDraw && isNutStraightDraw) {
        rioDiscount = numPlayers > 3 ? -3 : 0; // Combo nut draw: almost no RIO
        rioRisk = 'low';
    } else if (isNutFlushDraw || isNutStraightDraw) {
        rioDiscount = Math.max(rioDiscount, numPlayers > 3 ? -5 : 0); // Small penalty multi-way even with nuts
        rioRisk = 'low';
    }

    // RIO multiplier: 0.60 to 1.0 (how much of draw equity we actually realize)
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
    const callThreshold = breakEven - 5; // Allow 5pt buffer
    const shouldContinue = score >= callThreshold;

    // Raise threshold: need significantly more equity to raise vs call
    const raiseThreshold = Math.max(60, breakEven + 20);

    return { continuanceScore: Math.max(0, Math.min(100, score)), shouldContinue, callThreshold, raiseThreshold };
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

    // Critical: under 10BB — must shove or fold, no more post-flop play
    if (stackBB <= 10) {
        return { isShort: true, isCritical: true, reshoveRange: 60, preservationFactor: 1.60 };
    }

    // Short: 10-20BB — tight is right, only strong hands
    if (stackBB <= 20) {
        return { isShort: true, isCritical: false, reshoveRange: 72, preservationFactor: 1.35 };
    }

    // Moderate: 20-35BB — cautious play, avoid marginal flips
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
        // SB raise is usually a small raise (2-2.5BB) so BB's pot odds are excellent
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

    // ── Phase 48c FIX: Correct PLO wrap detection using exact 2-from-hand / 3-from-board rule ──
    // The old proximity-based heuristic (counting hole cards within 4 of a board card)
    // was completely broken — it assigned 9-20 phantom outs to hands with ZERO actual
    // straight draws. Example: 2-3-4-8 on A-K-Q board got 9 outs (should be 0).
    //
    // New approach: for each possible turn card rank (0-12), simulate it appearing on
    // the board and check if any NEW 5-card straight becomes possible under PLO rules
    // (exactly 2 hole cards + exactly 3 board cards).

    // Step 1: Pre-compute which straights are already MADE before any new card
    const madeHighs = new Set();
    for (let high = 12; high >= 4; high--) {
        const needed = [high, high - 1, high - 2, high - 3, high - 4];
        const bO = needed.filter(r => boardRanks.includes(r) && !holeRanks.includes(r));
        const hO = needed.filter(r => !boardRanks.includes(r) && holeRanks.includes(r));
        const bth = needed.filter(r => boardRanks.includes(r) && holeRanks.includes(r));
        const miss = needed.filter(r => !boardRanks.includes(r) && !holeRanks.includes(r));
        if (miss.length > 0) continue;
        // All 5 ranks present — check if PLO 2/3 split is achievable
        if (hO.length <= 2 && bO.length <= 3) {
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh >= 0 && nbb >= 0 && nbh + nbb <= bth.length) {
                madeHighs.add(high);
            }
        }
    }

    // Step 2: For each candidate turn/river rank, check if it enables a NEW straight
    const completingRanks = new Set();
    for (let cardRank = 0; cardRank <= 12; cardRank++) {
        const newBoard = [...boardRanks, cardRank];

        for (let high = 12; high >= 4; high--) {
            if (madeHighs.has(high)) continue; // Already made before this card

            const needed = [high, high - 1, high - 2, high - 3, high - 4];
            const bO = needed.filter(r => newBoard.includes(r) && !holeRanks.includes(r));
            const hO = needed.filter(r => !newBoard.includes(r) && holeRanks.includes(r));
            const bth = needed.filter(r => newBoard.includes(r) && holeRanks.includes(r));
            const miss = needed.filter(r => !newBoard.includes(r) && !holeRanks.includes(r));

            if (miss.length > 0) continue;
            if (hO.length > 2 || bO.length > 3) continue;
            const nbh = 2 - hO.length;
            const nbb = 3 - bO.length;
            if (nbh < 0 || nbb < 0 || nbh + nbb > bth.length) continue;

            // This card enables a new straight under PLO rules
            completingRanks.add(cardRank);
            break; // One straight is enough to confirm this rank is an out
        }
    }

    // Step 3: Calculate actual outs (subtract cards already in play)
    let actualOuts = 0;
    for (const rank of completingRanks) {
        let available = 4; // 4 suits
        available -= holeRanks.filter(r => r === rank).length;
        available -= boardRanks.filter(r => r === rank).length;
        actualOuts += Math.max(0, available);
    }

    let wrapType = 'none';
    if (actualOuts >= 20) wrapType = 'mega_wrap_20';
    else if (actualOuts >= 16) wrapType = 'big_wrap_17';
    else if (actualOuts >= 12) wrapType = 'wrap_13';
    else if (actualOuts >= 4) wrapType = 'small_wrap';

    const isWrap = actualOuts >= 9;
    const wrapStrength = Math.min(100, actualOuts * 4.5);

    return { wrapType, wrapOuts: actualOuts, isWrap, wrapStrength };
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
 * overbetting all-in when holding 12BB, calling pot-sized with 20% equity).
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

    // Audit 5: Extremely short stack (< 6BB) — must go all-in or fold (no partial bets)
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
 * Bug #79: Added handStructure parameter for raise-facing playability degradation.
 * Speculative hands (low connectivity, no suits) lose MORE value when facing aggression.
 * Premium structured hands (suited, connected) retain their value facing raises.
 * @param {number} strength - Base hand strength (0-100)
 * @param {boolean} canCheck
 * @param {boolean} canCall
 * @param {boolean} canRaise
 * @param {Object} raiseAction
 * @param {number} toCall - Amount to call
 * @param {number} bb - Big blind size
 * @param {number} stackBB - Stack in big blinds
 * @param {string} position
 * @param {number} numPlayers
 * @param {Object} [handStructure] - From enhancePLOPreflopScore: {doubleSuitBonus, connectivityScore, pairBonus, danglerPenalty}
 */
function getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction, toCall, bb, stackBB, position, numPlayers, handStructure) {
    const isBTN = position === 'BTN';
    const isSB = position === 'SB';
    const isBB = position === 'BB';
    const isUTG = position === 'UTG';
    const isUTG1 = position === 'UTG+1' || position === 'UTG1';
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);

    // Position bonus: tighter UTG/UTG+1, wider IP. Position is KEY in PLO.
    let posBonus = 0;
    if (isBTN) posBonus = 10;       // Button: widest range
    else if (position === 'CO') posBonus = 8;  // Cutoff: very wide
    else if (position === 'HJ') posBonus = 6;  // Hijack: still IP
    else if (isBB) posBonus = 5;     // BB: already invested, can defend wider
    else if (position === 'MP') posBonus = 2;  // Middle: slightly tighter
    else if (isSB) posBonus = 0;     // SB: OOP postflop, tightest after UTG
    else if (isUTG1) posBonus = -2;  // UTG+1: tight
    else if (isUTG) posBonus = -4;   // UTG: tightest range
    const adjStrength = strength + posBonus;

    // ── Bug #79: Raise-facing playability penalty ──
    // When facing aggression, hands WITHOUT suits + connectivity lose significant value.
    // A suited-connected hand at score 55 plays WAY better facing a raise than
    // a disconnected rainbow hand at 55. This penalty makes sure speculative junk
    // doesn't call raises just because it scraped together enough raw points.
    const hs = handStructure || {};
    const suitQuality = (hs.doubleSuitBonus || 0);     // 12 = double suited, 5 = single, 0 = rainbow
    const connectQuality = (hs.connectivityScore || 0); // 0-15, higher = more connected
    const hasDangler = (hs.danglerPenalty || 0) < -4;   // Has a significant dangler

    // Playability score: 0 (terrible) to 27+ (excellent structure)
    const playability = suitQuality + connectQuality;
    // Penalty when facing a raise: rainbow disconnected hands get hammered
    // Well-structured hands (playability >= 15) get NO penalty
    // Marginal structure (5-14) gets small penalty
    // Junk structure (0-4) gets big penalty
    let raiseFacingPenalty = 0;
    if (toCall > bb * 2) { // Only apply when facing real aggression (not just completing BB)
        if (playability < 5) raiseFacingPenalty = -12;       // Rainbow junk: big penalty
        else if (playability < 10) raiseFacingPenalty = -7;  // Marginal: medium penalty
        else if (playability < 15) raiseFacingPenalty = -3;  // Decent: small penalty
        // playability >= 15: no penalty (well-structured hand plays fine vs raises)

        // Dangler compounds the penalty when facing a raise
        if (hasDangler && raiseFacingPenalty < 0) raiseFacingPenalty -= 4;

        // Facing a 3-bet (toCall > 8bb): penalties are DOUBLED — speculative junk is dead money
        if (toCall > bb * 8) raiseFacingPenalty = Math.round(raiseFacingPenalty * 1.8);
    }
    const raiseFacingAdj = adjStrength + raiseFacingPenalty;

    // PLO push/fold: ≤12BB
    if (stackBB <= 12) {
        return adjStrength >= 50 ? { type: 'all_in' } : (canCheck ? { type: 'check' } : { type: 'fold' });
    }

    // Facing a re-raise (4-bet spot) — need top 5% hands
    // Use raiseFacingAdj: speculative hands should NOT be calling 3-bets
    const isFacing3Bet = toCall > bb * 8;
    if (isFacing3Bet) {
        if (raiseFacingAdj >= 88 && canRaise) {
            const size = Math.round(toCall * 2.5);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size, raiseAction?.maxAmount || size) };
        }
        if (raiseFacingAdj >= 70 && canCall) return { type: 'call' }; // Flat with premium
        return { type: 'fold' };
    }

    // Facing a raise (3-bet spot) — use raiseFacingAdj for call thresholds
    const isFacingRaise = toCall > bb * 2.5;
    if (isFacingRaise) {
        if (raiseFacingAdj >= 78 && canRaise) {
            const size3b = Math.round(toCall * 3);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size3b, raiseAction?.maxAmount || size3b) };
        }
        if (raiseFacingAdj >= 62 && canCall) return { type: 'call' };
        if (raiseFacingAdj >= 48 && isIP && canCall) return { type: 'call' }; // IP flat — raised threshold from 45 to 48
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Facing an open — mild penalty applies
    if (toCall > bb) {
        if (raiseFacingAdj >= 65 && canRaise) {
            const size = Math.round(toCall * 3.5);
            return { type: raiseAction?.type || 'raise', amount: Math.min(size, raiseAction?.maxAmount || size) };
        }
        if (raiseFacingAdj >= 48 && canCall) return { type: 'call' };
        if (raiseFacingAdj >= 38 && isIP && canCall) return { type: 'call' }; // Raised from 35 to 38
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Open raise (no action yet, toCall ≤ BB = only limp in front or we're first)
    // No raise-facing penalty when opening — use raw adjStrength
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
    const clamp = (size) => Math.max(raiseAction?.minAmount || 1, Math.min(size, raiseAction?.maxAmount || size));
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    // ═══ PHASE 37: PLO LIVE-READ INTEGRATION ═══
    // Query live observer for real-time opponent data (same system the Hold'em engine uses).
    // This enables the PLO engine to adjust c-bets, value/fold thresholds, and sizing
    // based on what we've observed about THIS specific opponent at THIS table.
    const ploTableId = state.tableId || 'unknown';
    const ploPrimaryOppId = state.primaryOppId || null;
    const ploLiveRead = ploPrimaryOppId ? getLiveRead(profileId, ploTableId, ploPrimaryOppId) : null;
    const ploLiveConf = ploLiveRead?.confidence || 0;

    // Pre-compute live-read adjustments for PLO postflop decisions
    let ploLiveFoldAdj = 0;    // + = call wider, - = fold more
    let ploLiveValueAdj = 0;   // + = bet thinner for value, - = bet tighter
    let ploLiveSizeAdj = 1.0;  // Sizing multiplier: >1 = bigger, <1 = smaller
    let ploLiveBluffAdj = 0;   // + = bluff more, - = bluff less
    if (ploLiveRead && ploLiveConf >= 0.20) {
        // Against calling stations: value bet thinner, bluff less, size up value
        if (ploLiveRead.callFreq > 0.55) {
            ploLiveValueAdj += 8;     // Value bet wider
            ploLiveBluffAdj -= 6;     // Don't bluff stations
            ploLiveSizeAdj = 1.10;    // Size up value bets
        }
        // Against folders: bluff more, value bet less thin
        if (ploLiveRead.foldFreq > 0.50) {
            ploLiveBluffAdj += 8;
            ploLiveSizeAdj = 0.92;    // Smaller bets still fold them
        }
        // Against aggressive opponents: call wider (they barrel wide)
        if (ploLiveRead.aggFreq > 0.45) {
            ploLiveFoldAdj += 5;      // Call wider vs aggro
        }
        // Against passive players: fold more when they bet (it's real)
        if (ploLiveRead.aggFreq < 0.18) {
            ploLiveFoldAdj -= 6;      // Respect passive bets
        }
        // WTSD adjustments
        if (ploLiveRead.wtsd !== null && ploLiveRead.wtsd > 0.30) {
            ploLiveFoldAdj += 3;      // They go to showdown wide
        }
        if (ploLiveRead.wtsd !== null && ploLiveRead.wtsd < 0.22) {
            ploLiveBluffAdj += 5;     // They give up easily
        }
        // Fold-to-raise: high = our raises are profitable
        if (ploLiveRead.foldToRaisePct !== null && ploLiveRead.foldToRaisePct > 0.55) {
            ploLiveBluffAdj += 5;
        }
        if (street !== 'preflop') {
            console.log(`[HorseBrain] 👁️ PLO LIVE-READ: opp=${ploPrimaryOppId?.substring(0, 8)} conf=${Math.round(ploLiveConf * 100)}% agg=${ploLiveRead.aggFreq?.toFixed(2)} call=${ploLiveRead.callFreq?.toFixed(2)} fold=${ploLiveRead.foldFreq?.toFixed(2)} foldAdj=${ploLiveFoldAdj} valAdj=${ploLiveValueAdj} bluffAdj=${ploLiveBluffAdj}`);
        }
    }

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

        // ── Bug #80: AAxx pot/re-pot when 60%+ of stack can go in preflop ──
        // Dan's rule: "when you have AAxx, if by Potting or Re-Potting it can get
        // 60% or more of your stack in preflop, you should always do it."
        // This intercepts BEFORE other logic — AA is always aggressive preflop.
        const holeRanksPreflop = holeCards.map(c => c.rank);
        // Bug #101: parseCard maps Ace to rank 12 (NOT 14). Was checking === 14, NEVER matched.
        const aceCount = holeRanksPreflop.filter(r => r === 12).length;
        if (aceCount >= 2 && canRaise) {
            const stack = stackBB * bb;
            // Calculate pot size: potting = current pot + toCall, then raise to 3x that
            const potRaiseSize = raiseAction?.maxAmount || Math.round((potSize + toCall) * 3);
            // How much of our stack goes in if we pot/re-pot?
            const totalCommitted = toCall + potRaiseSize;
            const stackPctCommitted = totalCommitted / stack;

            if (stackPctCommitted >= 0.60) {
                // 60%+ of stack goes in = just shove all-in with AA
                console.log(`[HorseBrain] 🚀 AAxx ALL-IN: pot-raise commits ${Math.round(stackPctCommitted * 100)}% of stack — shoving`);
                return { type: 'all_in' };
            } else if (stackPctCommitted >= 0.40) {
                // 40-60%: pot it aggressively (sets up all-in on flop)
                console.log(`[HorseBrain] 🚀 AAxx POT-RAISE: commits ${Math.round(stackPctCommitted * 100)}% of stack`);
                return { type: raiseAction?.type || 'raise', amount: Math.min(potRaiseSize, raiseAction?.maxAmount || potRaiseSize) };
            }
            // < 40% committed: still raise but handled by normal logic below (AA will always raise)
        }

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

        // Bug #79: Pass hand structure to preflop action for raise-facing playability penalties
        return getPLOPreflopAction(strength, canCheck, canCall, canRaise, raiseAction,
            toCall, bb, stackBB, position, numPlayers, preflopEnhancement);
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

    // ── Phase 5: Deep stack adjustments (200BB+) ──
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

    // Gap A-F + Opt A-C: Variable declarations (functions called after equityFinal is computed below)
    const isLimpedPot = state.isLimpedPot || false;
    const allInPlayers = state.allInPlayers || [];
    const numActivePlayers = state.numActivePlayers || Math.max(numPlayers - allInPlayers.length, 1);
    const sessionMinutes = state.sessionMinutes || 0;
    const opponentLosses = state.opponentLossBB || 0;
    const lateSession = getPLOLateSessionAdjustment(sessionMinutes, opponentLosses);
    const raiseSize = toCall > 0 ? (toCall / bb) : 0;
    const isSBvsBB = state.isSBvsBB || (numPlayers === 2 && (position === 'SB' || position === 'BB'));
    const wasPFRaiser = state.wasPFRaiser || false;

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
    const impliedOddsInfo = getPLOImpliedOdds(toCall, potSize, effectiveStack, totalOuts, isNutDraw, street);

    // ── Phase 3: Range balance randomizer ──
    const situation = street === 'river' ? 'river_bet' : street === 'turn' ? 'turn_lead' : 'flop_lead';
    const rangeBalance = getPLORangeBalance(profileId, situation, equity);

    // ── Phase 3: C-bet strategy (fires only if horse was PFR) ──
    // wasPFRaiser declared above (hoisted to avoid TDZ)
    const cBetStrategy = getPLOCBetStrategy(wasPFRaiser, boardTexture, isIP, numPlayers, equity, madeHand.strength);

    // ── Phase 3: Turn barrel decision ──
    const turnBarrel = street === 'turn'
        ? getPLOTurnBarrel(equity, madeHand, straightDraw.outs, flushDraw.outs, scareInfo.isScareTurn, boardTexture, isIP, flushDraw.isNutFlushDraw)
        : null;

    // ── Phase 3: Proper PLO pot geometry (correct raise sizing) ──
    const ploProperPotRaise = _calcPLOPotRaiseSimple(toCall, potSize);
    // clamp already declared at top of function (before preflop section)
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

    const exploitFoldThresholdBase = exploitProfile.strategy.callDown
        ? oppAdj.foldThreshold - 12  // Call down maniacs with weaker hands
        : exploitProfile.strategy.stealBlinds
            ? oppAdj.foldThreshold + 5   // Fold to nit value bets quickly
            : oppAdj.foldThreshold;

    // ═══ PHASE 37: PLO LIVE-READ → FOLD/VALUE THRESHOLD ADJUSTMENTS ═══
    // Live observer data refines static opponent read thresholds with real-time intelligence.
    const exploitFoldThreshold = Math.max(15, Math.min(55, exploitFoldThresholdBase - ploLiveFoldAdj));
    const exploitValueThresholdFinal = Math.max(35, Math.min(85, exploitValueThreshold - ploLiveValueAdj));

    // ── Phase 5+8+GapF: Final equity with all bonuses + Phase 3 adjustments ──
    // equityFinalAdjusted incorporates: Module 12 (multiway), Module 17 (runout),
    // Module 20 (image exposure), Module 23 (OOP guard), Module 19 (probe farm counter)
    let equityFinal = Math.max(0, Math.min(100,
        equityFinalAdjusted * runoutReeval.multiplier  // Module 17: runout multiplier
        + runoutBonus + deepDrawBonus + historyCorrection.equityCorrection
        + lateSession.calldownLoosen
    ));

    // ─── MODULE 28 & 32: GLOBAL EQUITY REDUCTION ───
    const coldCallPenalty = (state.isColdCallTrap) ? 10 : 0;
    const { oopBoost = 0, multiwayBoost = 0, drawBoost = 0, donkBoost = 0 } = state.chipLeakBoosts || {};
    const chipLeakFoldAdjust = (!isIP ? oopBoost : 0) + (numPlayers >= 4 ? multiwayBoost : 0);

    // Cold-call trap reduces equity to dampen barrel aggression; chip-leak adjusts OOP/multiway over-aggression.
    if (coldCallPenalty > 0 || chipLeakFoldAdjust > 0) {
        equityFinal = Math.max(0, equityFinal - coldCallPenalty - chipLeakFoldAdjust);
        if (coldCallPenalty > 0) console.log(`[HorseBrain] 🧊 MODULE 28 COLD-CALL TRAP: applying -${coldCallPenalty} global equity penalty to reduce barrel freq.`);
        if (chipLeakFoldAdjust > 0) console.log(`[HorseBrain] 📉 MODULE 32 CHIP LEAK: applying -${chipLeakFoldAdjust} equity penalty for OOP/multiway leaks.`);
    }

    // ── BUG-FIX: Deferred utility calls now use computed equityFinal instead of hardcoded 0 ──
    const limpedPotStrategy = getPLOLimpedPotStrategy(isLimpedPot, madeHand, equityFinal, numPlayers);
    const multiWayGov = governPLOMultiWayAggression(numPlayers, equityFinal, madeHand, true);
    const sidePot = getPLOSidePotAwareness(allInPlayers, stackBB, numActivePlayers, equityFinal);
    const coldCallDecision = getPLOColdCallDecision(equityFinal, isIP, potOdds, state.numCallers || 0, raiseSize);
    const blindBattle = getPLOBlindBattleStrategy(position, equityFinal, isSBvsBB, wasPFRaiser, potOdds);
    const donkOpportunity = getPLODonkBetOpportunity(isIP, wasPFRaiser, madeHand, boardTexture, equityFinal, potSize);

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
    // ═══ PHASE 37: LIVE-READ SIZING ADJUSTMENT ═══
    // Apply live-read sizing multiplier: bigger vs stations, smaller vs folders
    const adaptiveBetSize = clamp(Math.round(adaptiveSizer.betSize * ploLiveSizeAdj));

    // ── Phase 8: Board scenario protection flag ──
    const shouldProtectNow = boardScenario.shouldProtectNow;
    const scenarioAdvice = boardScenario.scenarioAdvice;

    // ── Phase 5: ICM avoidFlips override — avoid coin-flip all-ins at bubble/FT ──
    const icmCommitThreshold = icmPressure.avoidFlips ? 62 : 52;

    // ─── MODULE 29 & 31: ADJUSTED COMMIT THRESHOLDS ───
    const bombPotBoost = state.bombPotBoost || 0;
    const adjustedCommitThreshold = icmCommitThreshold + bombPotBoost;
    if (bombPotBoost > 0) console.log(`[HorseBrain] 💣 MODULE 29: commit threshold raised to ${adjustedCommitThreshold} (bomb-pot/straddle boost +${bombPotBoost})`);

    const ritRefuserBoost = (state.isRITRefuser) ? 5 : 0;
    const finalCommitThreshold = adjustedCommitThreshold + ritRefuserBoost;

    // ─── MODULE 27: REVERSE IMPLIED ODDS GUARD ───
    const rioGuard = detectReverseImplied(
        totalOuts,
        toCall > 0 ? toCall / (potSize + toCall) : 0,
        stackBB,
        numPlayers,
        boardTexture.isWet || false
    );
    if (rioGuard.shouldBlock) console.log(`[HorseBrain] 🔄 MODULE 27 RIO BLOCK: ${rioGuard.reason}`);

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

        // ─── MODULE 24: RIVER DONK-BET EXPLOITATION BLOCK ───
        // River donk bets (OOP leads) are frequently thin-value or polarized.
        // Module 24 counters them with a raise (strong equity), call (medium), or fold (weak).
        if (toCall > 0 && isIP) {
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
            // 'call' or 'none' — fall through to optimizer
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
    // (Module 24 donk-block now correctly fires in the river section above)

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
        if (allInInfo.allInEquity >= finalCommitThreshold) {
            if (gifInfo.shouldThrowGif) return { type: 'all_in', gifCategory: gifInfo.gifCategory };
            return { type: 'all_in' };
        }
        // Force shallow SPR calls to respect the bomb-pot penalty
        const shortStackCallThreshold = 40 + (bombPotBoost || 0);
        if (allInInfo.allInEquity >= shortStackCallThreshold && canCall) {
            return { type: 'call' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    if (toCall === 0) {
        // ─── MODULE 28: COLD-CALL TRAP GUARD ───
        // Passively check draws and marginal hands vs opponents who flat preflop to trap
        if (state.isColdCallTrap && !madeHand.isMade) {
            console.log("[HorseBrain] 🧊 MODULE 28 COLD-CALL TRAP: suppressing barrel with draw/air.");
            return { type: 'check' };
        }

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
        // ═══ PHASE 37: LIVE-READ C-BET SUPPRESSION ═══
        // Against calling stations (live data), reduce c-bet frequency with weak hands
        if (cBetStrategy.shouldCBet && canRaise) {
            let cBetLiveGo = true;
            if (ploLiveConf >= 0.20 && ploLiveRead.callFreq > 0.60 && equityFinal < 45) {
                // Station won't fold to c-bet → don't c-bet weak hands
                cBetLiveGo = Math.random() < 0.30; // Only 30% of the time
            }
            if (ploLiveConf >= 0.20 && ploLiveRead.foldFreq > 0.55 && equityFinal < 30) {
                // Folder will fold → c-bet bluff more aggressively
                cBetLiveGo = true;
            }
            if (cBetLiveGo)
                return { type: raiseAction.type, amount: clamp(Math.round(potSize * cBetStrategy.cBetFraction * ploLiveSizeAdj)) };
        }

        // Phase 3: Turn barrel logic
        if (turnBarrel?.shouldBarrel && canRaise)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * turnBarrel.barrelFraction * ploLiveSizeAdj)) };

        // Phase 5: River float and fire (IP, draw missed, blockers)
        // ═══ PHASE 37: LIVE-READ RIVER BLUFF GATE ═══
        if (riverFloat.shouldFireRiver && canRaise) {
            let fireGo = true;
            if (ploLiveConf >= 0.20 && ploLiveRead.callFreq > 0.60) {
                fireGo = Math.random() < 0.25; // Don't fire into stations
            }
            if (fireGo)
                return { type: raiseAction.type, amount: riverFloat.fireSize };
        }

        // Phase 7: Calibrated probe bet (replaces fixed Phase 2 probe)
        if (calibratedProbe.shouldProbe && canRaise)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * calibratedProbe.probeSizing)) };

        // Strong draws: semi-bluff (ERC-adjusted + runout quality + wrap outs)
        // Bug #87: Blocker-aware semi-bluffing — having nut flush blockers or straight
        // blockers makes our semi-bluffs much more effective (opponent less likely to have the nuts)
        const realizedOuts = totalOuts * erc;
        const blockerBluffBoost = blockers.hasFlushBlocker ? 0.12 : blockers.hasStraightBlocker ? 0.06 : 0;
        if (realizedOuts >= 14 && canRaise && Math.random() < (0.65 + blockerBluffBoost))
            return { type: raiseAction.type, amount: adaptiveBetSize };
        if (realizedOuts >= 9 && canRaise && Math.random() < (0.38 + blockerBluffBoost))
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * 0.50)) };
        // Bug #87: Pure blocker bluff — no real outs but we block the nuts
        if (realizedOuts < 6 && blockers.canBluffRiver && canRaise && equityFinal >= 20 && Math.random() < 0.18)
            return { type: raiseAction.type, amount: clamp(Math.round(potSize * 0.55)) };

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

    // Bug #85: Multiway tightening when facing bets.
    // In PLO multiway pots (3+ players), when someone bets into multiple opponents,
    // they're usually strong. We need SIGNIFICANTLY stronger hands to raise/continue.
    const multiwayRaisePenalty = numPlayers >= 4 ? 8 : numPlayers >= 3 ? 4 : 0;
    const multiwayCallPenalty = numPlayers >= 4 ? 5 : numPlayers >= 3 ? 2 : 0;

    // Phase 2: Check-raise with nuts OOP
    const crBet = getPLOCheckRaise(isIP, madeHand, straightDraw.outs, flushDraw.outs, flushDraw.isNutFlushDraw, toCall, potSize);
    if (crBet.shouldCheckRaise && canRaise)
        return { type: raiseAction.type, amount: clamp(crBet.crSize) };

    // Monster facing a bet: raise using proper PLO pot geometry
    // Bug #85: Multiway requires even stronger hand to raise
    if (equityFinal >= (78 + multiwayRaisePenalty) && canRaise) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }

    // Big combo draw: raise for value + protection (use exact de-duped outs)
    // Bug #85: In multiway, don't raise draws as aggressively (too much dead money risk)
    const comboRaiseFreq = numPlayers >= 3 ? 0.35 : 0.55;
    if (comboDrawInfo.isCombo && exactOuts >= 18 && canRaise && Math.random() < comboRaiseFreq) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }
    if (flushDraw.outs >= 9 && straightDraw.outs >= 13 && !comboDrawInfo.isCombo && canRaise && Math.random() < comboRaiseFreq) {
        return { type: raiseAction?.type || 'call', amount: clampedPotRaise };
    }

    // Phase 6: Flop continuance optimizer — use HvR + RIO for accurate continue/fold
    const flopContinuance = getPLOFlopContinuance(
        equityFinal, exactOuts, madeHand, potOdds,
        rioInfo, hvrInfo, boardTexture, isIP, numPlayers
    );

    // High RIO risk with non-nut draw: fold even with many outs
    if (rioInfo.rioRisk === 'very_high' && !madeHand.isNut && exactOuts < 16 && potOdds >= 0.30)
        return { type: 'fold' };

    // Phase 6: Flop/Turn continuance score
    // ─── MODULE 32 / 29 / 28: GLOBAL EQUITY & THRESHOLD REDUCTIONS ───
    // drawBoost penalty, bombPotBoost penalty tighten requirements
    const continuanceScore = flopContinuance.continuanceScore - drawBoost - bombPotBoost;
    // ═══ Phase 39A FIX: PLO8 nut low override — never fold nut low regardless of continuance score ═══
    if (continuanceScore < flopContinuance.callThreshold) {
        if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' }; // Nut low = always continue
        return { type: 'fold' };
    }

    // Phase 3: Implied odds — reject calls on draws without sufficient implied odds
    if (exactOuts >= 6 && !impliedOddsInfo.isProfitableCall && potOdds >= 0.35)
        return { type: 'fold' };
    if (exactOuts >= 9 && impliedOddsInfo.isProfitableCall && canCall)
        return { type: 'call' };

    // ─── MODULE 27: RIO GUARD — veto draw calls when RIO > forward implied odds ───
    if (rioGuard.shouldBlock && toCall > 0 && !madeHand.isMade) {
        console.log(`[HorseBrain] 🚫 MODULE 27 RIO VETO: folding draw — ${rioGuard.reason}`);
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    if (continuanceScore >= flopContinuance.raiseThreshold && canRaise) {
        // Module 32: Donk-overcall penalty
        if (!isIP && toCall > 0 && donkBoost > 0 && continuanceScore < flopContinuance.raiseThreshold + donkBoost) {
            console.log(`[HorseBrain] 📉 MODULE 32 DONK LEAK: passing on marginal raise OOP due to leak pattern.`);
            return { type: 'call' };
        }
        return { type: raiseAction?.type || 'call', amount: clamp(Math.round(potSize * 0.75)) };
    }

    // ═══ Phase 39A FIX: Restructured facing-bet fallback section ═══
    // The unconditional `if (canCall) return call` at this point was making ALL subsequent
    // blocks dead code — perStreetBluff calldown, ante stealing, and PLO8 nut low force-call
    // never fired. Now: specific checks run FIRST, generic call is the TRUE final fallback.

    // PLO Hi-Lo: NEVER fold nut low (highest priority safety net)
    if (isHiLo && lo8?.hasNutLow && canCall) return { type: 'call' };

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

    // Generic call if continuance score passed threshold (final fallback before fold)
    if (canCall) return { type: 'call' };

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
    if (!gameState || typeof gameState !== 'object') return { type: 'fold', amount: 0 }; // Bug #46: guard null/garbage gameState
    if (!Array.isArray(legalActions) || legalActions.length === 0) return { type: 'fold', amount: 0 };
    const { handStr, position, street, potSize, toCall, stackBB, bb = 2, holeCards: hCards, board: bCards, tableId = 'unknown', primaryOppId = null } = gameState;
    const hash = getHash(profileId);
    const numPlayers = gameState.numPlayers || 2;

    // ═══ ALWAYS-ON: Live observer read for preflop exploit adjustments ═══
    const preflopLiveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    const preflopLiveConf = preflopLiveRead?.confidence || 0;
    if (preflopLiveRead && preflopLiveConf >= 0.10 && street === 'preflop') {
        console.log(`[HorseBrain] 👁️ PREFLOP LIVE: ${primaryOppId?.substring(0, 8)} 3bet=${preflopLiveRead.threeBetPct !== null ? Math.round(preflopLiveRead.threeBetPct * 100) + '%' : '?'} foldTo3b=${preflopLiveRead.foldToThreeBetPct !== null ? Math.round(preflopLiveRead.foldToThreeBetPct * 100) + '%' : '?'} pfr=${preflopLiveRead.pfrPct !== null ? Math.round(preflopLiveRead.pfrPct * 100) + '%' : '?'} foldSteal=${preflopLiveRead.foldToStealPct !== null ? Math.round(preflopLiveRead.foldToStealPct * 100) + '%' : '?'} type=${preflopLiveRead.playerType} conf=${Math.round(preflopLiveConf * 100)}%`);
    }

    // ═══ UPGRADED: Use real personality module for play style if available ═══
    // Fallback to hash-based biases only if personality module isn't loaded
    let loosenessBias = (hash % 20) - 10; // -10 to +9 (default)
    let aggressionBias = ((hash >> 4) % 20) - 10; // (default)
    try {
        if (_personalityModule) {
            const style = _personalityModule.getPlayStyle?.(profileId);
            if (style?.key) {
                // Map real play styles to concrete bias values
                const styleLooseness = {
                    TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10
                };
                const styleAggression = {
                    TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8
                };
                loosenessBias = styleLooseness[style.key] ?? loosenessBias;
                aggressionBias = styleAggression[style.key] ?? aggressionBias;
            }
            // Also factor in skill tier — higher skill = tighter, more accurate decisions
            const skillTier = _personalityModule.getSkillTier?.(profileId);
            if (skillTier?.level) {
                // Skill levels 1-5: fish makes more mistakes, crusher plays near-GTO
                const skillTightness = { 1: -8, 2: -4, 3: 0, 4: 3, 5: 6 };
                loosenessBias -= (skillTightness[skillTier.level] || 0);
            }
        }
    } catch (_) { /* Personality enhancement is non-critical for fallback */ }

    // Legal action types
    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  PREFLOP DECISION ENGINE — UPGRADED WITH POSITION-AWARE RANGES    ║
    // ║  + 3-Bet Strategy + Deep Stack + Personality-Driven Aggression    ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (street === 'preflop') {
        const baseStrength = getPreflopStrength(handStr);

        // ═══ UPGRADED: Position bonuses now much more differentiated ═══
        // BTN gets massive bonus (widest range), UTG gets penalty (tightest range)
        // This creates proper position-aware opening ranges
        const positionBonus = {
            BTN: 18,  // Widest opens — steal equity + IP advantage
            CO: 12,   // Wide but not as wide as BTN
            HJ: 6,    // Standard
            MP: 2,    // Tighter than HJ
            UTG: -5,  // Tightest — negative bonus = penalty for early position
            SB: 7,    // SB gets some bonus (steal blind) but OOP penalty postflop
            BB: 10    // BB gets bonus for closing action + pot odds
        };

        // ═══ UPGRADED: Different open thresholds by position ═══
        // A hand like KTo should open BTN but fold UTG
        const openThresholds = {
            BTN: 45, CO: 52, HJ: 58, MP: 62, UTG: 68, SB: 50, BB: 40
        };
        const openThreshold = openThresholds[position] || 55;

        // Deep stack adjustment (#31)
        const deepAdj = getDeepStackAdjustment(stackBB);
        const suitedBonus = handStr.endsWith('s') ? deepAdj.suitedBonus : 0;
        const impliedBonus = (baseStrength < 50 && deepAdj.widenRange) ? deepAdj.impliedOddsBonus : 0;

        // ═══ UPGRADED: Connectors get implied odds bonus in position ═══
        const isConnector = handStr.length >= 3 && Math.abs(RANKS.indexOf(handStr[0]) - RANKS.indexOf(handStr[1])) <= 2;
        const connectorBonus = isConnector && (position === 'BTN' || position === 'CO') && stackBB >= 50 ? 5 : 0;

        // Adaptive strategy adjustment (#35)
        const adaptive = getAdaptiveStrategy(profileId);

        const adjustedStrength = baseStrength + (positionBonus[position] || 0) + loosenessBias + suitedBonus + impliedBonus + connectorBonus + adaptive.rangeAdjust;

        // Push/fold mode for short stacks (now uses Nash-like thresholds)
        if (stackBB <= 12) {
            // Nash push/fold: wider in late position, tighter early
            const pushThreshold = stackBB <= 6
                ? (position === 'BTN' || position === 'SB' ? 30 : position === 'CO' ? 40 : 50)
                : (position === 'BTN' || position === 'SB' ? 40 : position === 'CO' ? 48 : 55);
            if (canRaise && adjustedStrength >= pushThreshold) return { type: 'all_in' };
            if (canCheck) return { type: 'check' };
            return { type: 'fold' };
        }

        // ═══ FACING A RAISE? 3-BET / 4-BET / FLAT / FOLD DECISION ═══
        if (toCall > bb * 2 && canRaise) {
            const raiseSize = toCall / bb; // Size of the raise in BBs

            // ═══ LIVE DATA: Opponent 3-bet tendencies for preflop adjustments ═══
            let opp3BetPctLive = null;
            let oppFoldTo3BetLive = null;
            let oppAvgPFRSizeLive = null;
            let oppPreflopExploits = [];
            if (preflopLiveRead && preflopLiveConf >= 0.10) {
                opp3BetPctLive = preflopLiveRead.threeBetPct;
                oppFoldTo3BetLive = preflopLiveRead.foldToThreeBetPct;
                oppAvgPFRSizeLive = preflopLiveRead.avgPreflopRaise;
                oppPreflopExploits = preflopLiveRead.exploits || [];
            }

            // ═══ FACING A 3-BET (raise was 8-15 BB = likely a 3-bet over our open) ═══
            if (raiseSize >= 7 && raiseSize <= 20) {

                // ═══ LIVE EXPLOIT: Adjust thresholds based on opponent's 3-bet frequency ═══
                // Over-3-bettor (>12%): widen 4-bet range, tighten flat range
                // Tight 3-bettor (<5%): respect 3-bet more, fold wider
                let fourBetThreshold = 90;     // Base: QQ+, AKs
                let fourBetBluffFloor = 40;    // Base: suited Ax, SC minimum
                let fourBetBluffFreq = 0.12 + aggressionBias / 60;
                let flatCallFloor = 75;        // Base: JJ, TT, AQs
                let foldThreshold = 75;        // Below this = fold

                if (opp3BetPctLive !== null && preflopLiveConf >= 0.15) {
                    if (opp3BetPctLive > 0.12) {
                        // Opponent over-3-bets → widen 4-bet for value + bluff
                        fourBetThreshold = 85;           // Now include JJ, AKo
                        fourBetBluffFreq += 0.08;        // 4-bet bluff more
                        fourBetBluffFloor = 35;          // Wider bluff combos
                        flatCallFloor = 70;              // Flat wider (TT, AJs)
                        foldThreshold = 70;              // Fold less
                    } else if (opp3BetPctLive > 0.09) {
                        // Slightly loose 3-bettor → minor widening
                        fourBetThreshold = 88;
                        fourBetBluffFreq += 0.04;
                        flatCallFloor = 72;
                        foldThreshold = 72;
                    } else if (opp3BetPctLive < 0.05) {
                        // Very tight 3-bettor → 3-bet = AA-QQ, AK → respect heavily
                        fourBetThreshold = 93;           // Only KK+ 4-bet
                        fourBetBluffFreq *= 0.3;         // Almost never 4-bet bluff
                        flatCallFloor = 80;              // Only flat QQ, AKo
                        foldThreshold = 80;              // Fold more — they have it
                    } else if (opp3BetPctLive < 0.07) {
                        // Tight 3-bettor → slightly more respect
                        fourBetThreshold = 91;
                        fourBetBluffFreq *= 0.6;
                        flatCallFloor = 77;
                        foldThreshold = 77;
                    }
                }

                // ═══ LIVE EXPLOIT: Sizing tell on 3-bet size ═══
                if (oppAvgPFRSizeLive && preflopLiveConf >= 0.20) {
                    // If opponent uses larger-than-normal 3-bet → they're polarized → fold marginal
                    if (raiseSize > oppAvgPFRSizeLive * 1.4) {
                        foldThreshold += 3;  // Bigger 3-bet = stronger range
                    }
                    // If opponent uses min-3-bet → they're often merged/wide → widen defense
                    else if (raiseSize < oppAvgPFRSizeLive * 0.8) {
                        foldThreshold -= 3;
                        flatCallFloor -= 3;
                    }
                }

                // ═══ LIVE POSITION STATS: Adjust based on raiser's position tendencies ═══
                if (preflopLiveRead && preflopLiveRead.positionStats && preflopLiveConf >= 0.15) {
                    const posOrder = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
                    for (const pos of posOrder) {
                        if (pos === position) break;
                        const pd = preflopLiveRead.positionStats[pos];
                        if (pd && pd.hands >= 3) {
                            const oppPosPFR = pd.pfr / pd.hands;
                            if (oppPosPFR < 0.12) { foldThreshold += 4; flatCallFloor += 4; fourBetBluffFreq *= 0.3; }
                            else if (oppPosPFR < 0.18) { foldThreshold += 2; flatCallFloor += 2; }
                            else if (oppPosPFR > 0.35) { foldThreshold -= 4; flatCallFloor -= 4; fourBetBluffFreq += 0.06; }
                            else if (oppPosPFR > 0.25) { foldThreshold -= 2; flatCallFloor -= 2; }
                            break;
                        }
                    }
                }

                // 4-bet with premium hands
                if (adjustedStrength >= fourBetThreshold) {
                    const fourBetSize = Math.round(toCall * 2.2);
                    const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(fourBetSize, raiseAction?.maxAmount || fourBetSize));
                    return { type: raiseAction.type, amount: clamped };
                }
                // 4-bet bluff occasionally with strong suited hands
                if (adjustedStrength >= fourBetBluffFloor && adjustedStrength < 55 && handStr.endsWith('s') && stackBB >= 50) {
                    if (Math.random() < Math.min(0.30, fourBetBluffFreq)) {
                        const fourBetBluff = Math.round(toCall * 2.2);
                        const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(fourBetBluff, raiseAction?.maxAmount || fourBetBluff));
                        return { type: raiseAction.type, amount: clamped };
                    }
                }
                // Flat call with strong hands that play well postflop
                if (adjustedStrength >= flatCallFloor && adjustedStrength < fourBetThreshold && canCall) {
                    return { type: 'call' };
                }
                // Fold everything else vs 3-bet
                if (adjustedStrength < foldThreshold) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }

            // ═══ FACING A 4-BET / 5-BET (raise > 20 BB) ═══
            if (raiseSize > 20) {
                // Only continue with premium (KK+, AKs)
                if (adjustedStrength >= 92 && canRaise) {
                    return { type: 'all_in' }; // Jam vs 4-bet with premiums
                }
                if (adjustedStrength >= 85 && canCall) {
                    return { type: 'call' }; // Flat QQ, AKo vs 4-bet
                }
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ═══ SQUEEZE PLAY — 3-bet after raise + caller(s) ═══
            // A squeeze is a 3-bet when there's a raise and 1+ callers behind.
            // Dead money from callers makes this extremely profitable.
            // Detect callers by pot size: raise to ~3bb + callers = pot > ~8bb
            const estimatedCallers = Math.max(0, Math.round((potSize / bb - toCall / bb - 1.5) / (toCall / bb)));
            if (estimatedCallers >= 1 && raiseSize >= 2 && raiseSize <= 7) {
                // Squeeze spots: late position or blinds with wider range
                const isSqueezePosition = position === 'BTN' || position === 'CO' || position === 'SB' || position === 'BB';
                if (isSqueezePosition && stackBB >= 25) {
                    let squeezeThreshold = 55; // Base: need decent hand
                    // From blinds, squeeze tighter (we'll be OOP)
                    if (position === 'SB' || position === 'BB') squeezeThreshold = 62;
                    // With more callers, more dead money → squeeze wider
                    if (estimatedCallers >= 2) squeezeThreshold -= 5;
                    // Aggressive horses squeeze wider
                    squeezeThreshold -= aggressionBias / 3;

                    // ═══ LIVE EXPLOIT: Opponent fold-to-3-bet adjusts squeeze profitability ═══
                    if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                        if (oppFoldTo3BetLive > 0.70) {
                            squeezeThreshold -= 8; // They fold a ton → squeeze much wider
                        } else if (oppFoldTo3BetLive > 0.60) {
                            squeezeThreshold -= 4;
                        } else if (oppFoldTo3BetLive < 0.35) {
                            squeezeThreshold += 5; // They rarely fold → squeeze tighter for value
                        }
                    }

                    if (adjustedStrength >= squeezeThreshold && canRaise) {
                        // Squeeze sizing: bigger than standard 3-bet (3.5-4.5x raise + 1x per caller)
                        let squeezeMult = 3.5;
                        // ═══ PHASE 17: LIVE-READ DRIVEN SQUEEZE SIZING ═══
                        // Against over-folders: smaller squeeze (save chips, same fold equity)
                        // Against calling stations: bigger squeeze (charge them)
                        if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                            if (oppFoldTo3BetLive > 0.65) squeezeMult = 3.0; // Smaller — they fold anyway
                            else if (oppFoldTo3BetLive < 0.40) squeezeMult = 4.0; // Bigger — charge them
                        }
                        const squeezeBBs = (toCall / bb) * squeezeMult + estimatedCallers * (toCall / bb) * 0.5;
                        const squeezeSize = Math.round(bb * squeezeBBs);
                        const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(squeezeSize, raiseAction?.maxAmount || squeezeSize));
                        // Squeeze frequency: not every time (balance)
                        let squeezeFreq = adjustedStrength >= 80 ? 0.90 : 0.40 + aggressionBias / 30;
                        // 4-bet bluff component for aggressive horses with suited hands
                        if (adjustedStrength < squeezeThreshold + 10 && handStr.endsWith('s')) {
                            squeezeFreq = 0.25 + aggressionBias / 40;
                        }
                        // ═══ LIVE EXPLOIT: Bump squeeze freq if opponent overfolds to 3-bet ═══
                        if (oppFoldTo3BetLive !== null && oppFoldTo3BetLive > 0.65 && preflopLiveConf >= 0.15) {
                            squeezeFreq += 0.12;
                        }
                        squeezeFreq = Math.max(0.10, Math.min(0.85, squeezeFreq));
                        if (Math.random() < squeezeFreq) {
                            return { type: raiseAction.type, amount: clamped };
                        }
                    }
                }
            }

            // ═══ FACING A STANDARD RAISE (2-7 BB) ═══
            const threeBet = get3BetStrategy(position, adjustedStrength, toCall, bb, stackBB);
            let should3Bet = threeBet.should3Bet;

            // ═══ LIVE EXPLOIT: Opponent fold-to-3-bet drives 3-bet bluff frequency ═══
            if (oppFoldTo3BetLive !== null && preflopLiveConf >= 0.15) {
                if (oppFoldTo3BetLive > 0.70 && !should3Bet && adjustedStrength >= 35 && handStr.endsWith('s')) {
                    // They fold >70% to 3-bets → 3-bet bluff wider with suited hands
                    if (Math.random() < 0.30 + aggressionBias / 40) should3Bet = true;
                } else if (oppFoldTo3BetLive > 0.60 && !should3Bet && adjustedStrength >= 45) {
                    // They fold >60% → 3-bet semi-light
                    if (Math.random() < 0.18) should3Bet = true;
                }
            }

            // ═══ LIVE EXPLOIT: Opponent over-3-bets us → we flat more, 3-bet less as bluff ═══
            if (opp3BetPctLive !== null && opp3BetPctLive > 0.12 && preflopLiveConf >= 0.15) {
                // They 3-bet a lot → our 3-bets get 4-bet more → reduce light 3-bets
                if (should3Bet && adjustedStrength < 60 && Math.random() < 0.30) {
                    should3Bet = false; // Trap instead — flat and play postflop
                }
            }

            if (should3Bet) {
                let amount = Math.max(raiseAction?.minAmount || toCall * 2.5, threeBet.size3Bet);

                // ═══ PHASE 17: LIVE-READ DRIVEN 3-BET SIZING ═══
                // Adjust 3-bet size based on opponent's fold-to-3-bet and calling tendencies.
                // Core principle: size for max EV — smaller when they always fold, bigger when they call wide.
                if (preflopLiveRead && preflopLiveConf >= 0.15) {
                    if (oppFoldTo3BetLive !== null) {
                        if (oppFoldTo3BetLive > 0.70) {
                            // They fold 70%+ → use MINIMUM sizing (save chips, same fold equity)
                            amount = Math.max(raiseAction?.minAmount || toCall * 2.5, Math.round(toCall * 2.8));
                        } else if (oppFoldTo3BetLive > 0.55) {
                            // Standard fold rate → standard sizing
                            // No adjustment needed
                        } else if (oppFoldTo3BetLive < 0.40) {
                            // They rarely fold → SIZE UP for max value when we have it
                            if (!threeBet.isBluff3Bet) {
                                amount = Math.round(amount * 1.15); // 15% bigger
                            }
                            // If bluff 3-betting into a caller → save chips with smaller size
                            if (threeBet.isBluff3Bet) {
                                amount = Math.max(raiseAction?.minAmount || toCall * 2.5, Math.round(toCall * 2.7));
                            }
                        }
                    }
                    // Against frequent 4-bettors: smaller 3-bet sizing (reduces loss when they 4-bet)
                    if (opp3BetPctLive !== null && opp3BetPctLive > 0.12) {
                        amount = Math.round(amount * 0.90);
                    }
                }

                const clamped = Math.min(amount, raiseAction?.maxAmount || amount);
                return { type: raiseAction.type, amount: Math.round(clamped) };
            }
            // ═══ UPGRADED: Flat call range with implied odds hands (suited connectors, small pairs) ═══
            let flatFloor = 35;
            // ═══ LIVE EXPLOIT: vs tight raiser → tighter flat range; vs loose → wider flats ═══
            if (preflopLiveRead && preflopLiveConf >= 0.15) {
                if (preflopLiveRead.pfrPct !== null && preflopLiveRead.pfrPct < 0.10) {
                    flatFloor = 42; // Tight raiser → need stronger hand to flat
                } else if (preflopLiveRead.pfrPct !== null && preflopLiveRead.pfrPct > 0.22) {
                    flatFloor = 30; // Loose raiser → flat wider, dominate them postflop
                }
            }
            if (adjustedStrength >= flatFloor && adjustedStrength < openThreshold && stackBB >= 30) {
                const isSpeculative = handStr.endsWith('s') || RANKS.indexOf(handStr[0]) === RANKS.indexOf(handStr[1]);
                if (isSpeculative && canCall) return { type: 'call' };
            }
        }

        // ═══ LIVE EXPLOIT: Blind steal adjustments ═══
        // If opponent in blinds overfolds to steals → widen open range from late position
        if (preflopLiveRead && preflopLiveConf >= 0.15 && (position === 'BTN' || position === 'CO' || position === 'SB')) {
            if (preflopLiveRead.foldToStealPct !== null && preflopLiveRead.foldToStealPct > 0.70) {
                // They overfold blinds → steal wider (lower open threshold by 8)
                if (adjustedStrength >= openThreshold - 8 && adjustedStrength < openThreshold && canRaise && toCall <= bb) {
                    const stealSize = Math.round(bb * (position === 'SB' ? 3.0 : 2.3));
                    const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(stealSize, raiseAction?.maxAmount || stealSize));
                    if (Math.random() < 0.55 + aggressionBias / 40) {
                        return { type: raiseAction.type, amount: clamped };
                    }
                }
            }
            // If opponent defends blinds aggressively (low foldToSteal) → tighten steals
            if (preflopLiveRead.foldToStealPct !== null && preflopLiveRead.foldToStealPct < 0.35) {
                if (adjustedStrength >= openThreshold && adjustedStrength < openThreshold + 5 && canRaise && toCall <= bb) {
                    // Marginal opens become limps or folds vs aggressive blind defender
                    if (Math.random() < 0.35) {
                        if (canCall) return { type: 'call' };
                    }
                }
            }
        }

        // ═══ OPEN RAISE — POSITION + STACK-DEPTH AWARE SIZING ═══
        if (adjustedStrength >= 80 && canRaise) {
            // Premium: raise bigger for value, more from EP (where we have tighter range perception)
            // Also size up with limpers already in the pot
            const numLimpers = Math.max(0, Math.round((potSize / bb - 1.5) / 1)); // Approximate limper count
            const basePremiumSize = position === 'UTG' || position === 'MP' ? 3.0 : 2.5;
            const limperAdjust = numLimpers * 0.5; // +0.5 BB per limper
            const premiumBBs = basePremiumSize + limperAdjust + (Math.random() * 0.5 - 0.25); // Small noise
            const size = Math.round(bb * premiumBBs);
            const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(size, raiseAction?.maxAmount || size));
            return { type: raiseAction.type, amount: clamped };
        }
        if (adjustedStrength >= openThreshold) {
            const openFreq = 0.4 + aggressionBias / 30 + (position === 'BTN' ? 0.25 : position === 'CO' ? 0.15 : 0);
            if (canRaise && (toCall <= bb || Math.random() < openFreq)) {
                // ═══ POSITION-AWARE OPEN SIZING ═══
                // BTN: smaller (2.2x) because we're in position and want calls
                // SB: bigger (3.0x) because we're OOP and want folds or to build pot
                // EP: standard (2.5x) — balanced
                const numLimpers = Math.max(0, Math.round((potSize / bb - 1.5) / 1));
                const positionSize = { BTN: 2.2, CO: 2.3, HJ: 2.5, MP: 2.5, UTG: 2.5, SB: 3.0, BB: 3.0 };
                const openBBs = (positionSize[position] || 2.5) + (numLimpers * 0.5);
                const size = Math.round(bb * openBBs);
                const clamped = Math.max(raiseAction?.minAmount || bb * 2, Math.min(size, raiseAction?.maxAmount || size));
                return { type: raiseAction.type, amount: clamped };
            }
            if (canCall) return { type: 'call' };
            if (canCheck) return { type: 'check' };
        }
        // ═══ UPGRADED: Limp from SB with marginal hands, check BB ═══
        if (adjustedStrength >= 30 && toCall <= bb) {
            if (position === 'BB' && canCheck) return { type: 'check' };
            if (position === 'SB' && canCall && adjustedStrength >= 35) return { type: 'call' };
            if (canCheck) return { type: 'check' };
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
    // BUG #30 FIX: Was calling without opts — defaulted to BTN/flop/medium/non-aggressor
    // for ALL positions and streets. Now passes real position, street, and board wetness.
    const multiway = getMultiwayAdjustment(numPlayers, {
        position: position || 'BTN',
        street: street || 'flop',
        boardWetness: boardWetness, // Already a string: 'dry', 'medium', or 'wet'
        heroIsAggressor: toCall === 0 // If we're not facing a bet, we likely have the initiative
    });

    // Draw equity (#29)
    const drawEquity = getDrawEquity(handEval, street);

    // Adjusted strength = base + personality - multiway penalty
    const effectiveStrength = handEval.strength + aggressionBias - multiway.strengthPenalty;
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    // Is hero in position? (BTN, CO, HJ are generally IP postflop)
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(gameState.position);

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  RIVER DECISION ENGINE — UPGRADED WITH BLUFF-CATCHING, THIN      ║
    // ║  VALUE, BLOCK BETS, AND OPPONENT-AWARE CALL/FOLD LOGIC           ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (street === 'river') {
        // ═══ Phase 39B FIX: add bluffAware adjustment (was relying on inverted callMod=5 for bluffers) ═══
        const foldThreshold = 35 + opponentAdjustment.foldMod - opponentAdjustment.callMod
            - (opponentAdjustment.bluffAware ? 5 : 0); // Call down more vs known bluffers
        const potOddsR = toCall > 0 ? toCall / (potSize + toCall) : 0;

        // ═══ FACING A BET ON THE RIVER ═══
        if (toCall > 0) {
            // ── BLUFF-CATCHING LOGIC ──
            // We need to call at the right frequency to prevent exploitation.
            // MDF (minimum defense frequency) = 1 - bet/(pot+bet) = pot/(pot+bet)
            const mdf = potSize / (potSize + toCall);
            const betToPotRatio = toCall / Math.max(1, potSize);

            // Monster hands: raise for value
            if (effectiveStrength >= 85 && canRaise) {
                const valueSizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                    boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                    oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
                    oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
                    stackBB, isPolarized: true, liveRead: preflopLiveRead
                });
                const raiseAmt = Math.round(toCall + potSize * valueSizeFrac);
                const amt = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseAmt, raiseAction?.maxAmount || raiseAmt));
                return { type: raiseAction.type, amount: amt };
            }

            // Strong hands (top pair good kicker+): call
            if (effectiveStrength >= 55) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // ── BLUFF-CATCH with medium hands (30-55 strength) ──
            // ═══ Phase 39B FIX: callMod > 0 now correctly = station, not bluffer ═══
            // If opponent bluffs a lot (bluffAware), call with wider range
            // If opponent is tight, fold marginal more often
            if (effectiveStrength >= 30) {
                // Determine bluff-catch frequency based on hand strength and pot odds
                const bluffCatchEq = effectiveStrength / 100;
                const neededEquity = potOddsR;
                const oppIsBluffy = opponentAdjustment.bluffAware;

                // Call if equity exceeds pot odds, or if opponent likely bluffing
                if (bluffCatchEq >= neededEquity || (oppIsBluffy && effectiveStrength >= foldThreshold - 5)) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }

                // Overbet shoves = polarized → call with medium+ more often
                if (betToPotRatio >= 1.2 && effectiveStrength >= 40) {
                    // Large overbets are often polarized bluff/nuts — call wider
                    if (Math.random() < 0.40) {
                        return canCall ? { type: 'call' } : { type: 'fold' };
                    }
                }

                // Small bets = thin value or blocker bet → wider calling range
                if (betToPotRatio <= 0.35 && effectiveStrength >= 25) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // Weak hands: fold
            return { type: 'fold' };
        }

        // ═══ NOT FACING A BET ON THE RIVER ═══
        // ── THIN VALUE BETTING ──
        if (effectiveStrength >= 60 && canRaise) {
            // Strong hand: value bet
            const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, multiway.adjustSizing, {
                boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
                oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
                stackBB, liveRead: preflopLiveRead
            });
            const betSize = Math.round(potSize * sizeFrac);
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount: amt };
        }

        // ── BLOCK BETS with showdown-value hands ──
        if (effectiveStrength >= 40 && effectiveStrength < 60 && isIP && canRaise && Math.random() < 0.30) {
            // Block bet 25-33% pot to deny opponent a free showdown or a big bluff
            const blockSize = Math.round(potSize * (0.25 + Math.random() * 0.08));
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(blockSize, raiseAction?.maxAmount || blockSize));
            return { type: raiseAction.type, amount: amt };
        }

        // ── RIVER BLUFFS (skilled horses only, with blockers) ──
        if (effectiveStrength < 20 && canRaise && aggressionBias > 5 && Math.random() < 0.15 * multiway.bluffReduction) {
            // Bluff with air — larger sizing to maximize fold equity
            const bluffSize = Math.round(potSize * (0.60 + Math.random() * 0.20));
            const amt = Math.max(raiseAction?.minAmount || 1, Math.min(bluffSize, raiseAction?.maxAmount || bluffSize));
            return { type: raiseAction.type, amount: amt };
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  FLOP/TURN DECISION ENGINE — UPGRADED WITH BOARD TEXTURE,         ║
    // ║  RIO GUARD, OPPONENT-AWARE C-BET, PROBE BET, DELAYED C-BET,      ║
    // ║  MULTI-STREET PLANNING, AND PROPER BARREL STRATEGY                ║
    // ╚══════════════════════════════════════════════════════════════════════╝

    // ═══ BOARD TEXTURE ANALYSIS (drives bet sizing and frequency) ═══
    const isDryBoard = boardWetness === 'dry';
    const isWetBoard = boardWetness === 'wet';
    // High cards on board reduce range advantage for PFR
    // ═══ Phase 39B FIX: was >= 10 (Q+) but comment said J+ — J is index 9, not 10 ═══
    const boardHighCards = (bCards || []).filter(c => RANKS.indexOf(c[0]) >= 9).length; // J+ = index 9+
    const boardIsPaired = bCards ? (() => {
        const br = bCards.map(c => c[0]);
        return new Set(br).size < br.length;
    })() : false;
    const boardIsMonotone = bCards ? (() => {
        const bs = bCards.map(c => c[1]);
        return new Set(bs).size === 1;
    })() : false;
    // ═══ BOARD CONNECTIVITY (new) ═══
    const boardIsConnected = bCards ? (() => {
        const br = bCards.map(c => RANKS.indexOf(c[0])).sort((a, b) => a - b);
        let connected = 0;
        for (let i = 1; i < br.length; i++) { if (br[i] - br[i - 1] <= 2) connected++; }
        return connected >= 2; // At least 2 close-rank cards = connected
    })() : false;
    // ═══ BOARD RANK PROFILE (new) ═══
    const boardIsLow = bCards ? bCards.every(c => RANKS.indexOf(c[0]) < 8) : false; // All cards below 8
    const boardIsHigh = boardHighCards >= 2; // 2+ broadway cards

    // ═══ MODULE 27: REVERSE IMPLIED ODDS GUARD (for fallback) ═══
    const fbRioGuard = drawEquity.outs > 0
        ? detectReverseImplied(drawEquity.outs, potOdds, stackBB, numPlayers, isWetBoard)
        : { shouldBlock: false };

    // ═══ OPPONENT READS FOR FLOP/TURN (reuse opponentAdjustment) ═══
    const oppOverfolds = opponentAdjustment.foldMod > 0;
    // ═══ Phase 39B FIX: was `callMod > 0 || callMod < -2` — callMod < -2 means TIGHT (doesn't call),
    //     not sticky. This made tight opponents incorrectly "sticky", preventing bluffs against them. ═══
    const oppIsSticky = opponentAdjustment.callMod > 0; // Calls too much (positive = station)
    const oppIsPassive = opponentAdjustment.callMod < 0 && opponentAdjustment.foldMod <= 0;

    // ── FLOP/TURN: NO BET TO FACE ──
    if (canCheck && toCall === 0) {
        // Check-raise strategy (#26) — OOP trapping with full board/opponent context
        const crStrat = getCheckRaiseStrategy(effectiveStrength, isIP, handEval.hasFlushDraw || handEval.hasOESD, aggressionBias, {
            street,
            boardWetness,
            boardIsPaired,
            numPlayers,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy'
                : opponentAdjustment.foldMod > 0 ? 'weak-tight'
                : opponentAdjustment.callMod > 0 ? 'calling-station'
                : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            oppCbetFreq: 0.60,
            handCategory: handEval.category
        });
        if (crStrat.shouldCheckRaise && Math.random() < crStrat.frequency) {
            return { type: 'check' };
        }

        // ═══ C-BET STRATEGY — WORLD-CLASS WITH OPPONENT + BOARD AWARENESS ═══
        const wasPreAggressor = gameState.wasAggressor || false;
        if (wasPreAggressor && street === 'flop') {
            const cbetStrat = getCBetStrategy(true, isIP, boardWetness, numPlayers);

            // ═══ OPPONENT-AWARE C-BET FREQUENCY ═══
            // Against over-folders: c-bet more with any two cards
            // Against calling stations: only c-bet for value
            let cbetFreqMod = 0;
            if (oppOverfolds) cbetFreqMod += 0.20; // Print money vs folders
            if (oppIsSticky) {
                // Against sticky callers, only c-bet with strong hands
                if (effectiveStrength < 50 && !handEval.hasFlushDraw && !handEval.hasOESD) {
                    return { type: 'check' }; // Don't c-bet bluff into a calling station
                }
                cbetFreqMod -= 0.10; // Less frequent, but bigger when we do
            }

            if ((cbetStrat.shouldCbet || cbetFreqMod > 0.15) && canRaise) {
                // ═══ SIZING BY BOARD TEXTURE + OPPONENT TYPE ═══
                let cbetFrac;
                if (isDryBoard) {
                    // Dry boards → small c-bet (25-33% pot) — high frequency, low cost
                    cbetFrac = boardIsPaired ? 0.25 : 0.33;
                    // Against sticky opponents on dry boards → use bigger sizing for value
                    if (oppIsSticky && effectiveStrength >= 55) cbetFrac = 0.50;
                } else if (boardIsMonotone) {
                    // Monotone: only bet strong hands, check back most draws
                    cbetFrac = effectiveStrength >= 60 ? 0.50 : 0;
                    if (cbetFrac === 0) return { type: 'check' };
                } else if (isWetBoard) {
                    // Wet boards → larger c-bet (55-75%) to deny equity
                    cbetFrac = effectiveStrength >= 55 ? 0.66 : 0.55;
                    // With strong draws on wet boards → bet bigger (we have equity even if called)
                    if (handEval.hasFlushDraw || handEval.hasOESD) cbetFrac = 0.60;
                } else {
                    cbetFrac = getOptimalBetSize(handEval.category, street, potSize, effectiveStrength < 30, {
                        boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                        heroIsAggressor: true, stackBB, liveRead: preflopLiveRead
                    });
                }

                // ═══ RANGE ADVANTAGE C-BET (new) ═══
                // On low, unconnected boards → PFR has massive range advantage → c-bet very wide
                if (boardIsLow && !boardIsConnected && !boardIsMonotone) {
                    cbetFrac = 0.25; // Tiny sizing, very high frequency
                    cbetFreqMod += 0.15;
                }
                // On high, connected boards → caller's range has equity → check more
                if (boardIsHigh && boardIsConnected) {
                    if (effectiveStrength < 50) {
                        return { type: 'check' }; // Give up c-bet on bad texture for our hand
                    }
                }

                const betSize = Math.round(potSize * cbetFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ FLOP DONK-BET (BB defense → lead into PFR) ═══
        // When we defended BB and the flop heavily favors our range, donk-bet
        // to seize initiative. This is a modern strategy used on boards like
        // 8-7-6, 5-5-3, 9-8-7 where BB's range connects heavily.
        if (!wasPreAggressor && street === 'flop' && canRaise && !isIP) {
            const shouldDonk = (
                // Strong hands on low/connected boards (our range advantage)
                (effectiveStrength >= 55 && (boardIsLow || boardIsConnected) && !boardIsHigh) ||
                // Two pair or better on any low board
                (effectiveStrength >= 65 && boardIsLow) ||
                // Strong draws on wet boards (semi-bluff donk)
                (drawEquity.outs >= 10 && isWetBoard && effectiveStrength >= 25)
            );
            if (shouldDonk) {
                let donkFreq = 0.30 + aggressionBias / 40;
                // Against frequent c-bettors, donk more (deny them c-bet equity)
                if (!oppIsPassive) donkFreq += 0.08;
                // Against tight players, donk less (they 3-bet preflop with strong hands)
                if (oppOverfolds) donkFreq -= 0.05;
                // Multiway: donk less (more players to get through)
                if (numPlayers >= 3) donkFreq *= 0.60;
                donkFreq = Math.max(0, Math.min(0.50, donkFreq));
                if (Math.random() < donkFreq) {
                    // Size: 33-50% pot depending on hand strength and board
                    let donkFrac = effectiveStrength >= 65 ? 0.50 : 0.33;
                    if (isWetBoard) donkFrac = Math.min(0.60, donkFrac + 0.08);
                    const betSize = Math.round(potSize * donkFrac);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    console.log(`[HorseBrain] 🏋️ FLOP DONK: str=${effectiveStrength} board=${boardIsLow ? 'low' : boardIsConnected ? 'connected' : 'other'} outs=${drawEquity.outs}`);
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // ═══ FLOP BET (non-aggressor): Value bet + probe on checked flop ═══
        // When opponent checks to us on flop and we're not the PFR,
        // bet for value or to deny equity with medium+ hands
        if (!wasPreAggressor && street === 'flop' && canRaise && isIP) {
            if (effectiveStrength >= 55) {
                // Value bet strong hands on checked-to flops
                let valueBetFreq = 0.60;
                if (numPlayers >= 3) valueBetFreq = 0.45;
                if (Math.random() < valueBetFreq) {
                    const sizeFrac = isDryBoard ? 0.45 : 0.55;
                    const betSize = Math.round(potSize * sizeFrac);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
            // Stab at pot with marginal hands on dry boards
            if (effectiveStrength >= 30 && isDryBoard && numPlayers <= 2) {
                let stabFreq = 0.25 + aggressionBias / 40;
                if (oppOverfolds) stabFreq += 0.12;
                if (Math.random() < stabFreq) {
                    const betSize = Math.round(potSize * 0.33);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // ═══ DELAYED C-BET (new) — Bet the turn after checking the flop ═══
        // If we had initiative preflop but checked the flop, bet the turn to represent strength
        if (wasPreAggressor && street === 'turn' && !gameState.betOnFlop && canRaise) {
            // Delayed c-bet is effective because opponent expects us to give up
            // Use it with medium+ hands or when a scare card falls
            if (effectiveStrength >= 45 || (effectiveStrength >= 25 && Math.random() < 0.25 + aggressionBias / 40)) {
                const delayFrac = isDryBoard ? 0.50 : 0.60;
                const betSize = Math.round(potSize * delayFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ PROBE BET (new) — Bet when the preflop raiser checks behind ═══
        // If opponent was the preflop aggressor and checked the flop, probe bet the turn
        if (!wasPreAggressor && street === 'turn' && canRaise) {
            // Opponent checked flop = weakness. Probe bet to take it down.
            // More effective on scare cards and against tight opponents
            let probeFreq = 0.25 + aggressionBias / 40;
            if (oppOverfolds) probeFreq += 0.15;
            if (numPlayers >= 3) probeFreq *= 0.5; // Less probe multiway

            if (effectiveStrength >= 30 && Math.random() < probeFreq) {
                const probeFrac = effectiveStrength >= 55 ? 0.55 : 0.40; // Bigger with value
                const betSize = Math.round(potSize * probeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ TURN BARREL LOGIC — UPGRADED ═══
        // If we c-bet the flop (wasAggressor), consider barreling the turn
        if (wasPreAggressor && street === 'turn' && canRaise) {
            // Turn barrel criteria:
            // 1. Strong hand (>= 65) → always barrel for value
            // 2. Good draws (>= 8 outs) → semi-bluff barrel
            // 3. Scare card that helps our range → barrel as bluff
            if (effectiveStrength >= 65) {
                let sizeFrac = isDryBoard ? 0.55 : 0.70;
                // Against callers → bigger sizing for value extraction
                if (oppIsSticky && effectiveStrength >= 70) sizeFrac = Math.min(0.80, sizeFrac + 0.10);
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
            // Semi-bluff barrel with strong draws
            if (drawEquity.outs >= 8) {
                let barrelFreq = (0.45 + aggressionBias / 30) * multiway.bluffReduction;
                // Against over-folders, barrel more aggressively
                if (oppOverfolds) barrelFreq = Math.min(0.75, barrelFreq + 0.15);
                if (Math.random() < barrelFreq) {
                    const betSize = Math.round(potSize * 0.55);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
            // ═══ BLUFF BARREL (new) — Bet turn with nothing when card favors our range ═══
            if (effectiveStrength < 25 && !oppIsSticky && Math.random() < 0.18 * multiway.bluffReduction) {
                // Only bluff-barrel on good runout cards (overcards, board pairs)
                if (boardIsLow || boardIsPaired) {
                    const betSize = Math.round(potSize * 0.55);
                    const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                    return { type: raiseAction.type, amount };
                }
            }
        }

        // SPR-committed: go all-in with decent hands (#24)
        if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold && canRaise) {
            return { type: 'all_in' };
        }

        // Strong hands: value bet (sizing by board texture)
        if (effectiveStrength >= 70 && canRaise) {
            const sizeFrac = isDryBoard ? 0.50 : getOptimalBetSize(handEval.category, street, potSize, false, {
                boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
                heroIsAggressor: gameState.wasAggressor || false, stackBB, liveRead: preflopLiveRead
            });
            const betSize = Math.round(potSize * sizeFrac);
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount };
        }

        // ═══ UPGRADED: Semi-bluffs with equity + fold equity awareness ═══
        if ((handEval.hasFlushDraw || handEval.hasOESD) && drawEquity.outs >= 8) {
            // Check behind draws on monotone boards (reverse implied odds)
            if (boardIsMonotone && !handEval.hasFlushDraw) {
                return { type: 'check' }; // Don't bluff into monotone without flush draw
            }
            let semiBluffFreq = 0.45 + aggressionBias / 30;
            // Against sticky opponents, semi-bluff less (they call anyway)
            if (oppIsSticky) semiBluffFreq *= 0.70;
            if (canRaise && Math.random() < semiBluffFreq * multiway.bluffReduction) {
                // Larger semi-bluff on wet boards (deny equity), smaller on dry
                const sizeFrac = isWetBoard ? 0.66 : 0.45;
                const betSize = Math.round(potSize * sizeFrac);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // Medium hands: bet on dry boards (range advantage)
        if (effectiveStrength >= 40 && isDryBoard && canRaise) {
            let aggressionChance = 0.35 + aggressionBias / 50;
            if (oppOverfolds) aggressionChance += 0.12; // Print money vs folders
            if (Math.random() < aggressionChance * multiway.bluffReduction) {
                const betSize = Math.round(potSize * 0.33);
                const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
                return { type: raiseAction.type, amount };
            }
        }

        // ═══ UPGRADED: Check behind showdown-value hands IP ═══
        // Hands like middle pair in position should check to realize equity
        if (isIP && effectiveStrength >= 30 && effectiveStrength < 50) {
            return { type: 'check' }; // Pot control with medium hands IP
        }

        return { type: 'check' };
    }

    // ═══ FACING A BET — FLOP/TURN ═══

    // SPR-committed: push all-in with decent hands (#24)
    if (sprInfo.strategy === 'committed' && effectiveStrength >= sprInfo.commitThreshold) {
        if (canRaise) return { type: 'all_in' };
        if (canCall) return { type: 'call' };
    }

    // ═══ OOP DECISION MATRIX — structured check-call/check-raise/fold framework ═══
    // When OOP facing a bet, use the principled matrix for better decision quality.
    // This replaces ad-hoc logic with a calibrated framework. IP still uses the
    // existing aggressive logic below.
    if (!isIP && toCall > 0) {
        const oopDecision = getOOPDecisionMatrix({
            handStrength: effectiveStrength,
            handCategory: handEval.category,
            hasStrongDraw: handEval.hasFlushDraw || handEval.hasOESD,
            hasWeakDraw: handEval.hasGutshot || handEval.hasBackdoorFlush,
            street,
            boardWetness,
            boardIsPaired,
            boardIsMonotone,
            numPlayers,
            aggressionBias,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy'
                : opponentAdjustment.foldMod > 0 ? 'weak-tight'
                : opponentAdjustment.callMod > 0 ? 'calling-station'
                : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            oppCbetFreq: 0.60, // Default, would need tracking for better data
            oppCallFreq: 0.50,
            heroIsAggressor: gameState.wasAggressor || false,
            potSize, toCall, stackBB,
            liveRead: preflopLiveRead || null  // Phase 28: pass live-read to OOP matrix
        });

        // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration (main pipeline) ═══
        const mainCRFreq = oopDecision.action === 'check_raise'
            ? Math.min(0.80, oopDecision.frequency + (aggressionBias > 0 ? 0.04 : 0))
            : oopDecision.frequency;

        if (oopDecision.action === 'check_raise' && canRaise && Math.random() < mainCRFreq) {
            // Check-raise: raise the bet
            const crSize = Math.round(toCall * (oopDecision.sizeFraction || 3.0));
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(crSize, raiseAction?.maxAmount || crSize));
            console.log(`[HorseBrain] 🎲 OOP MATRIX: check-raise (${oopDecision.reason}) freq=${Math.round(mainCRFreq * 100)}%`);
            return { type: raiseAction.type, amount };
        }
        if (oopDecision.action === 'check_call' && canCall) {
            console.log(`[HorseBrain] 🎲 OOP MATRIX: check-call (${oopDecision.reason})`);
            return { type: 'call' };
        }
        if (oopDecision.action === 'lead' && canRaise) {
            const leadSize = Math.round(potSize * (oopDecision.sizeFraction || 0.50));
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(leadSize, raiseAction?.maxAmount || leadSize));
            console.log(`[HorseBrain] 🎲 OOP MATRIX: lead bet (${oopDecision.reason})`);
            return { type: raiseAction.type, amount };
        }
        if (oopDecision.action === 'check_fold') {
            // RIO guard: still check if possible instead of fold
            if (canCheck) return { type: 'check' };
            console.log(`[HorseBrain] 🎲 OOP MATRIX: fold (${oopDecision.reason})`);
            return { type: 'fold' };
        }
        // If matrix didn't make a decision, fall through to existing logic
    }

    // Monster hands: raise
    if (effectiveStrength >= 85 && canRaise) {
        const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false, {
            boardWetness, isInPosition: isIP, numPlayers, handStrength: effectiveStrength,
            oppTendency: opponentAdjustment.bluffAware ? 'bluffy' : opponentAdjustment.foldMod > 0 ? 'weak-tight' : 'balanced',
            oppConfidence: Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.40 : 0,
            stackBB, isPolarized: true, liveRead: preflopLiveRead
        });
        const raiseSize = Math.round(toCall + potSize * sizeFrac);
        const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
        return { type: raiseAction.type, amount };
    }

    // Strong hands: call or raise (personality-driven)
    if (effectiveStrength >= 60) {
        // ═══ UPGRADED: Raise frequency driven by position and personality ═══
        const raiseFreq = isIP ? (0.25 + aggressionBias / 30) : (0.15 + aggressionBias / 40);
        if (canRaise && Math.random() < raiseFreq) {
            const raiseSize = Math.round(toCall * (2.2 + Math.random() * 0.8));
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // ═══ MODULE 27: RIO GUARD IN FALLBACK — block draw calls with bad RIO ═══
    if (fbRioGuard.shouldBlock && drawEquity.outs > 0 && drawEquity.outs < 12) {
        console.log(`[HorseBrain] 🚫 MODULE 27 RIO FALLBACK: folding draw — ${fbRioGuard.reason}`);
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // Drawing hands: use equity math (#29)
    if (drawEquity.outs > 0 && drawEquity.shouldCall(potOdds)) {
        // ═══ UPGRADED: Semi-bluff raise with 12+ outs or nut draws ═══
        if (canRaise && (drawEquity.outs >= 12 || drawEquity.isNutDraw) && Math.random() < 0.35 * multiway.bluffReduction) {
            // Big draws (combo draws) should raise to deny equity + build pot
            const raiseSize = Math.round(toCall * 2.5);
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    // ═══ IMPLIED ODDS DRAWS (new) — Call with strong draws even without direct odds ═══
    if (drawEquity.outs >= 9 && drawEquity.shouldCallWithImplied && drawEquity.shouldCallWithImplied(potOdds, stackBB)) {
        if (canCall) return { type: 'call' };
    }

    // ═══ UPGRADED: Backdoor draws + overcards with good immediate odds ═══
    if (effectiveStrength >= 25 && drawEquity.outs >= 4 && potOdds < 0.20) {
        if (canCall) return { type: 'call' };
    }

    // Medium hands with good odds
    if (effectiveStrength >= 35 && potOdds < 0.25) {
        if (canCall) return { type: 'call' };
    }

    // ═══ UPGRADED: Float in position with marginal equity ═══
    // IP floating is a valid strategy — call flop bets light to take away turn/river
    if (isIP && street === 'flop' && effectiveStrength >= 20 && potOdds < 0.22 && numPlayers <= 3) {
        let floatFreq = 0.25 + aggressionBias / 50;
        // Float more against passive opponents who give up on the turn
        if (oppIsPassive) floatFreq += 0.12;
        if (canCall && Math.random() < floatFreq) {
            return { type: 'call' }; // Float flop IP
        }
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
        return { strength: 20, category: 'unknown', hasFlushDraw: false, hasOESD: false, hasGutshot: false, hasBackdoorFlush: false };
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

    // Board-only rank counts (needed for distinguishing hero-made vs board-made hands)
    const boardRankCounts = {};
    boardRanks.forEach(r => { boardRankCounts[r] = (boardRankCounts[r] || 0) + 1; });

    // --- Made hand detection ---
    let strength = 10;
    let category = 'high_card';

    // ═══ STRAIGHT FLUSH ═══ (new — was completely missing!)
    // Check before quads since straight flush beats quads
    {
        const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
        if (flushSuit && heroSuits.includes(flushSuit)) {
            const flushCards = allCards.filter(c => c[1] === flushSuit).map(c => RANKS.indexOf(c[0]));
            const uniqueFlush = [...new Set(flushCards)].sort((a, b) => a - b);
            // Check for 5 consecutive flush cards
            for (let i = uniqueFlush.length - 1; i >= 4; i--) {
                if (uniqueFlush[i] - uniqueFlush[i - 4] === 4) {
                    const sfRanks = uniqueFlush.slice(i - 4, i + 1);
                    // ═══ Phase 44 FIX: was using heroRanks.indexOf(r) which always returns first index
                // — with pocket pairs of different suits, this checks the wrong suit card. Use (r, i) indexed callback. ═══
                if (heroRanks.some((r, i) => sfRanks.includes(r) && heroSuits[i] === flushSuit)) {
                        strength = 99; category = 'straight_flush';
                        if (sfRanks[4] === 12) { strength = 100; category = 'royal_flush'; } // Royal!
                    }
                    break;
                }
            }
            // Wheel straight flush (A-2-3-4-5 of same suit)
            if (category === 'high_card' && uniqueFlush.includes(12) && uniqueFlush.includes(0) &&
                uniqueFlush.includes(1) && uniqueFlush.includes(2) && uniqueFlush.includes(3)) {
                // ═══ Phase 44 FIX: same indexOf bug as above — use indexed callback ═══
                if (heroRanks.some((r, i) => [12, 0, 1, 2, 3].includes(r) && heroSuits[i] === flushSuit)) {
                    strength = 98; category = 'straight_flush';
                }
            }
        }
    }

    // Quads
    if (category === 'high_card') {
        const quadRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
        if (quadRank && heroRanks.includes(Number(quadRank))) {
            strength = 97; category = 'quads';
            // ═══ KICKER MATTERS FOR QUADS ═══ (e.g., quad 2s with Ace kicker > quad 2s with 5 kicker)
            const kicker = Math.max(...heroRanks.filter(r => r !== Number(quadRank)));
            if (kicker >= 12) strength = 97.5; // Ace kicker on quads
        }
    }

    // Full house (check before flush/straight)
    if (category === 'high_card') {
        const trips = Object.keys(rankCounts).filter(r => rankCounts[r] >= 3).map(Number);
        const pairs = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2).map(Number);
        if (trips.length >= 1 && pairs.length >= 2) {
            if (heroRanks.some(r => rankCounts[r] >= 2)) {
                // ═══ FULL HOUSE RANKING ═══
                // Rank of trips matters most, then rank of pair
                const bestTrip = Math.max(...trips.filter(t => heroRanks.includes(t) || boardRankCounts[t] >= 3));
                const bestPair = Math.max(...pairs.filter(p => p !== bestTrip));
                strength = 88; category = 'full_house';
                // Higher trips = better full house
                if (bestTrip >= 10) strength = 91; // Jacks full or better
                if (bestTrip >= 12) strength = 93; // Kings full or better
                // Hero has pocket pair that makes the trips part → VERY strong
                if (heroRanks[0] === heroRanks[1] && heroRanks.includes(bestTrip)) strength += 2;
            }
        }
    }

    // Flush
    if (category === 'high_card') {
        const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
        if (flushSuit && heroSuits.includes(flushSuit)) {
            const flushCards = allCards.filter(c => c[1] === flushSuit).map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
            const heroFlushCards = heroRanks.filter((r, i) => heroSuits[i] === flushSuit);
            // ═══ FLUSH RANKING ═══
            // How high is our highest flush card? This determines nut-ness.
            strength = 82; category = 'flush';
            if (heroFlushCards.includes(flushCards[0])) {
                strength = 88; // Nut flush (highest flush card is ours)
            } else if (heroFlushCards.includes(flushCards[1])) {
                strength = 86; // Second nut flush
            } else if (heroFlushCards.some(r => r >= 10)) {
                strength = 84; // High flush (Jack+ high)
            }
            // ═══ BOARD FLUSH WARNING ═══
            // If 4+ flush cards are on the board, our flush is less valuable
            const boardFlushCount = boardSuits.filter(s => s === flushSuit).length;
            if (boardFlushCount >= 4) strength -= 5; // Anyone with one card of this suit has a flush
        }
    }

    // Straight
    if (category === 'high_card') {
        const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
        let foundStraight = false;
        for (let i = uniqueRanks.length - 1; i >= 4; i--) {
            if (uniqueRanks[i] - uniqueRanks[i - 4] === 4) {
                const straightRanks = uniqueRanks.slice(i - 4, i + 1);
                if (heroRanks.some(r => straightRanks.includes(r))) {
                    strength = 75; category = 'straight';
                    // ═══ STRAIGHT RANKING ═══
                    if (heroRanks.includes(straightRanks[4])) strength = 80; // Top of straight (nut end)
                    else if (heroRanks.includes(straightRanks[0])) strength = 73; // Bottom of straight (idiot end)
                    // ═══ BOARD STRAIGHT WARNING ═══
                    // If 4 of the 5 straight cards are on the board, our straight is vulnerable
                    const boardStraightCards = straightRanks.filter(r => boardRanks.includes(r));
                    if (boardStraightCards.length >= 4) strength -= 5; // One-card straight
                    foundStraight = true;
                }
                // ═══ Phase 44 FIX: was `break` unconditionally — if hero doesn't contribute to the
                // highest straight, we must keep looking for lower straights hero IS part of ═══
                if (foundStraight) break;
            }
        }
        // Wheel straight (A-2-3-4-5)
        if (!foundStraight && uniqueRanks.includes(12) && uniqueRanks.includes(0) && uniqueRanks.includes(1) && uniqueRanks.includes(2) && uniqueRanks.includes(3)) {
            if (heroRanks.some(r => [12, 0, 1, 2, 3].includes(r))) {
                strength = 72; category = 'straight';
                // Wheel is the lowest straight — vulnerable to higher straights
            }
        }
    }

    // Three of a kind
    if (category === 'high_card') {
        const tripRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
        if (tripRank && heroRanks.includes(Number(tripRank))) {
            const boardHasTrip = boardRanks.filter(r => r === Number(tripRank)).length >= 2;
            if (boardHasTrip) {
                // Trips (board pair + one in hand) — weaker because opponent can also have trips
                strength = 55; category = 'trips';
                // ═══ KICKER MATTERS for trips ═══
                const kicker = Math.max(...heroRanks.filter(r => r !== Number(tripRank)));
                if (kicker >= 12) strength += 4; // Ace kicker
                else if (kicker >= 10) strength += 2; // Jack+ kicker
            } else {
                // Set (pocket pair + one on board) — very disguised and strong
                strength = 80; category = 'set';
                // ═══ SET RANKING ═══ Higher set = better
                if (Number(tripRank) >= 10) strength = 83; // Set of Jacks or better
                if (Number(tripRank) === Math.max(...boardRanks)) strength += 2; // Top set
            }
        }
    }

    // Two pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 2) {
            const heroPairs = pairRanks.filter(r => heroRanks.includes(r));
            if (heroPairs.length >= 2) {
                // ═══ TWO PAIR RANKING ═══
                // Top two pair (both using top board cards) is very different from bottom two pair
                const sortedHeroPairs = heroPairs.sort((a, b) => b - a);
                const topBoardRank = Math.max(...boardRanks);
                const secondBoardRank = boardRanks.sort((a, b) => b - a)[1] ?? 0;
                strength = 58; category = 'two_pair';

                // Top two pair: both pairs use the two highest board cards
                if (sortedHeroPairs[0] >= topBoardRank && sortedHeroPairs[1] >= secondBoardRank) {
                    strength = 62; // Top two pair — strong
                }
                // Bottom two pair: both pairs use lower board cards
                if (sortedHeroPairs[0] < topBoardRank) {
                    strength = 52; // Bottom two — vulnerable to higher two pair
                }
                // ═══ KICKER AWARENESS ═══
                // With two pair, kicker doesn't matter as much, but board texture does
            } else if (heroPairs.length === 1) {
                // One pair from hero, one(+) from board pairing
                // BUG #31 FIX: Was using === which missed overpairs (hero pair > top board card).
                // BUG #32 FIX: Three-pairs scenario — when board has 2 pairs and hero has a pocket pair,
                // there are 3 pairs total. The best 5-card hand uses the TOP 2 pairs.
                // QQ on K-K-5-5-8 = KKQQ8 (drop the 55) = very strong two pair.
                // We need to check if hero's pair ranks among the top 2 of all 3 pairs.
                const allPairsSorted = pairRanks.sort((a, b) => b - a);
                const topTwoPairs = allPairsSorted.slice(0, 2);
                const heroPairRank = heroPairs[0];
                const topBoardForTP = Math.max(...boardRanks);

                if (topTwoPairs.includes(heroPairRank) && pairRanks.length >= 3) {
                    // Hero's pair is one of the top 2 pairs in a 3+ pair scenario.
                    // BUT: when the board has 2 pairs, BOTH of those ranks make full houses
                    // for anyone holding them. That's a huge % of played ranges.
                    // E.g., KK558: any K = KKK55 full house, any 5 = 555KK full house.
                    // So QQ on KK558 = KKQQ two pair = bluff-catcher, NOT a strong hand.
                    //
                    // Count how many board pairs exist — more board pairs = more full houses out there.
                    const numBoardPairs = Object.values(boardRankCounts).filter(c => c >= 2).length;
                    if (numBoardPairs >= 2) {
                        // Board has 2+ pairs — full houses are EVERYWHERE
                        // Hero's pocket pair is just a better bluff-catcher than having high cards
                        category = 'two_pair_weak';
                        if (heroPairRank >= 12) strength = 42; // AA on KK558 = best bluff-catcher but still vulnerable
                        else if (heroPairRank >= 10) strength = 40; // QQ/JJ on KK558
                        else if (heroPairRank >= 8) strength = 38; // TT/99
                        else strength = 35; // Low pair — barely better than board two pair
                    } else {
                        // Only 1 board pair + hero pair + another pair = 3 pairs but only 1 board pair
                        // Less full house risk — hero's two pair is more meaningful
                        category = 'two_pair';
                        strength = 55;
                        if (heroPairRank >= 10) strength = 58;
                    }
                } else {
                    // Hero pair is NOT in the top 2 pairs — weakest position
                    const numBoardPairsGeneric = Object.values(boardRankCounts).filter(c => c >= 2).length;
                    const boardPairRanksArr = Object.keys(boardRankCounts).filter(r => boardRankCounts[r] >= 2).map(Number);
                    const allBoardPairsHigher = boardPairRanksArr.length >= 2 && boardPairRanksArr.every(r => r > heroPairRank);

                    if (numBoardPairsGeneric >= 2 && allBoardPairsHigher) {
                        // COUNTERFEITED: hero's pair is below BOTH board pairs.
                        // 33 on KK558 = playing the board KK558. Hero's 33 contributes nothing.
                        // Treat as board_two_pair (hero doesn't contribute to hand).
                        category = 'board_two_pair';
                        const bestKicker = Math.max(...heroRanks);
                        if (bestKicker >= 12) strength = 35;
                        else if (bestKicker >= 11) strength = 32;
                        else if (bestKicker >= 9) strength = 28;
                        else strength = 20; // Low kicker on counterfeited hand
                    } else if (numBoardPairsGeneric >= 2) {
                        // Board has 2+ pairs, hero's pair is between the board pairs
                        // (e.g., 77 on KK338). Not counterfeited but still weak.
                        category = 'two_pair_weak';
                        strength = 34; // Slightly better than counterfeited but still very weak
                    } else if (heroPairRank > topBoardForTP) {
                        category = 'two_pair_weak';
                        strength = 56; // Overpair + single board pair — strongest two_pair_weak
                    } else if (heroPairRank === topBoardForTP) {
                        category = 'two_pair_weak';
                        strength = 53; // Top pair + single board pair — decent
                    } else {
                        category = 'two_pair_weak';
                        strength = 50; // Under pair + single board pair — standard
                    }
                }
            }
        }
    }

    // One pair
    if (category === 'high_card') {
        const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] >= 2).map(Number);
        if (pairRanks.length >= 1) {
            const heroPair = pairRanks.find(r => heroRanks.includes(r));
            if (heroPair !== undefined) {
                const sortedBoardRanks = [...boardRanks].sort((a, b) => b - a);
                const topBoardRank = sortedBoardRanks[0];
                const secondBoardRank = sortedBoardRanks[1] ?? 0;
                const thirdBoardRank = sortedBoardRanks[2] ?? 0;
                if (heroPair > topBoardRank) {
                    strength = 55; category = 'overpair';
                    // ═══ OVERPAIR RANKING ═══ Much more granular
                    if (heroPair >= 12) strength = 63; // AA overpair
                    else if (heroPair >= 11) strength = 60; // KK overpair
                    else if (heroPair >= 10) strength = 58; // QQ/JJ overpair
                    else if (heroPair >= 8) strength = 55; // TT/99 overpair
                    else strength = 52; // Low overpair (88-77)
                } else if (heroPair === topBoardRank) {
                    strength = 42; category = 'top_pair';
                    // ═══ KICKER GRANULARITY ═══ Much more important than before
                    const kicker = Math.max(...heroRanks.filter(r => r !== heroPair));
                    if (kicker >= 12) strength = 48; // TPAK (top pair ace kicker) — best top pair
                    else if (kicker >= 11) strength = 47; // TPKK (top pair king kicker)
                    else if (kicker >= 10) strength = 46; // Top pair queen/jack kicker
                    else if (kicker >= 8) strength = 44; // Top pair decent kicker
                    else strength = 41; // Top pair weak kicker — very vulnerable
                } else if (heroPair === secondBoardRank) {
                    // ═══ SECOND PAIR (new — was lumped with underpair) ═══
                    strength = 35; category = 'second_pair';
                    const kicker = Math.max(...heroRanks.filter(r => r !== heroPair));
                    if (kicker >= 12) strength = 38; // Second pair ace kicker
                    else if (kicker >= 10) strength = 37; // Second pair good kicker
                } else if (heroPair === thirdBoardRank) {
                    // ═══ THIRD PAIR (new) ═══
                    strength = 28; category = 'third_pair';
                } else if (heroPair < thirdBoardRank) {
                    // ═══ UNDERPAIR ═══
                    strength = 25; category = 'underpair';
                    // Higher underpairs are slightly better
                    if (heroPair >= 8) strength = 28;
                } else {
                    strength = 30; category = 'underpair';
                }
            } else {
                // Board paired, no hero pair
                // BUG #28 FIX: topBoardRank was out of scope here (defined in heroPair branch)
                const topBR = Math.max(...boardRanks);
                strength = 18; category = 'no_pair';
                // But if hero has overcards to the board, slightly better
                if (heroRanks.some(r => r > topBR)) strength = 20;
            }
        }
    }

    // ═══ BUG #28 FIX: BOARD-MADE HANDS — hero doesn't contribute but inherits board hand ═══
    // When board has trips or two-pair and hero doesn't hold any of those ranks,
    // the hero still "has" the board hand — kicker determines relative strength.
    // Previously these fell through to strength 18-20, causing hero to fold.
    //
    // CRITICAL STRENGTH CONTEXT (don't overvalue these hands!):
    //   Board trips (555K2): ANY pocket pair = full house, any 5 = quads.
    //     → In a typical played range, 15-25% of opponents have a pocket pair.
    //     → If they're betting into trip board, full house frequency is even higher.
    //     → Ace kicker = best NON-full-house hand, but that's a bluff-catcher, not a value hand.
    //   Board two-pair (KK552): Anyone with K or 5 = full house. That's a LOT of combos.
    //     → K and 5 are common in played ranges. Full houses are very frequent here.
    //   Board single pair (5582K): Anyone with a 5 has trips. Pairs make two-pair.
    //     → Hero is only better than worse unpaired hands.
    if (category === 'high_card' || category === 'no_pair') {
        const boardTripRanks = Object.keys(boardRankCounts).filter(r => boardRankCounts[r] >= 3).map(Number);
        const boardPairRanks = Object.keys(boardRankCounts).filter(r => boardRankCounts[r] >= 2).map(Number);
        const bestKicker = Math.max(...heroRanks);
        const secondKicker = Math.min(...heroRanks);

        if (boardTripRanks.length >= 1) {
            // Board trips (e.g., 5-5-5-K-2) — everyone has trips, kicker matters but...
            // ANY pocket pair = full house (beats us). Any matching rank = quads.
            // Ace kicker is the best NON-full-house, but it's essentially a bluff-catcher.
            // Against an actual betting range, we're behind a significant % of the time.
            category = 'board_trips';
            if (bestKicker >= 12) strength = 38; // Ace kicker — best bluff-catcher, not a value hand
            else if (bestKicker >= 11) strength = 34; // King kicker
            else if (bestKicker >= 9) strength = 30; // Jack/Ten kicker
            else strength = 22; // Low kicker — nearly any played hand beats us
            // Second kicker is marginal (only matters in chop scenarios like A9 vs A8)
            if (secondKicker >= 10) strength += 1;
        } else if (boardPairRanks.length >= 2) {
            // Board two-pair (e.g., K-K-5-5-2) — everyone has two-pair, kicker decides but...
            // Anyone with K = kings full. Anyone with 5 = fives full.
            // K and 5 are VERY common in played ranges. Full houses dominate.
            category = 'board_two_pair';
            if (bestKicker >= 12) strength = 35; // Ace kicker — best non-boat, still a bluff-catcher
            else if (bestKicker >= 11) strength = 32; // King kicker
            else if (bestKicker >= 9) strength = 28; // Jack/Ten kicker
            else strength = 20; // Low kicker — behind almost everything in a betting range
        } else if (boardPairRanks.length === 1) {
            // Board single pair (e.g., 5-5-K-8-2), hero doesn't pair — kicker-dependent
            // Anyone with a 5 has trips. Anyone with KK, 88, etc has two-pair.
            // Hero only beats other unpaired hands with worse kickers.
            category = 'board_pair';
            if (bestKicker >= 12) strength = 25; // Ace high on paired board — marginal
            else if (bestKicker >= 11) strength = 23; // King high
            else if (bestKicker >= 9) strength = 20; // Decent high card
            else strength = 15; // Low kicker — virtually no showdown value
        }
    }

    // ═══ BUG #39 FIX: BOARD-MADE STRAIGHT — hero doesn't contribute but still has the straight ═══
    // When the board itself forms a straight and hero's cards don't participate,
    // hero still plays the board straight. Without this check, strength stays at ~13
    // (high_card), causing the Brain to fold a guaranteed chop.
    if (category === 'high_card' || category === 'no_pair' || category === 'board_pair' || category === 'board_trips' || category === 'board_two_pair') {
        const boardUnique = [...new Set(boardRanks)].sort((a, b) => a - b);
        let boardHasStraight = false;
        // Check for regular straights on board
        for (let i = boardUnique.length - 1; i >= 4; i--) {
            if (boardUnique[i] - boardUnique[i - 4] === 4) {
                boardHasStraight = true;
                break;
            }
        }
        // Check for wheel straight on board (A-2-3-4-5)
        if (!boardHasStraight && boardUnique.includes(12) && boardUnique.includes(0) &&
            boardUnique.includes(1) && boardUnique.includes(2) && boardUnique.includes(3)) {
            boardHasStraight = true;
        }
        if (boardHasStraight && (category === 'high_card' || category === 'no_pair')) {
            // Board straight — everyone has it, hero chops with anyone who doesn't improve.
            // Anyone with a higher straight, flush, full house, etc. beats us.
            // Treat as a board-made hand: a bluff-catcher that should check/call, not fold.
            category = 'board_straight';
            const bestKicker = Math.max(...heroRanks);
            // Hero can only improve if they extend the straight or have a higher hand.
            // Base strength ~40 — it's a made hand (straight) but shared with everyone.
            if (bestKicker >= 12) strength = 45; // Ace kicker might make higher straight
            else if (bestKicker >= 10) strength = 43;
            else strength = 40; // Pure board straight, no kicker improvement
        }
    }

    // ═══ BUG #39 FIX: BOARD-MADE FLUSH — hero doesn't have the suit ═══
    // When board has 5 of a suit and hero has NO card of that suit,
    // hero plays the board flush (weakest possible flush). Anyone with ANY card of that suit beats us.
    if (category === 'high_card' || category === 'no_pair' || category === 'board_straight') {
        if (board.length === 5) {
            const boardSuitCounts = {};
            boardSuits.forEach(s => { boardSuitCounts[s] = (boardSuitCounts[s] || 0) + 1; });
            const boardFlushSuit = Object.keys(boardSuitCounts).find(s => boardSuitCounts[s] >= 5);
            if (boardFlushSuit && !heroSuits.includes(boardFlushSuit)) {
                // Board has a 5-card flush and hero has no matching suit.
                // Hero plays the board flush but loses to ANYONE with a card of that suit.
                // This is even weaker than board_trips since flush is more easily beaten.
                category = 'board_flush';
                strength = 30; // Very weak — almost any opponent beats this
                const bestKicker = Math.max(...heroRanks);
                if (bestKicker >= 12) strength = 32; // Ace doesn't help suit-wise but tiny edge
            }
        }
    }

    // High card only (no board-made hands either)
    if (category === 'high_card') {
        const highCard = Math.max(...heroRanks);
        const secondCard = Math.min(...heroRanks);
        // ═══ HIGH CARD RANKING ═══ More granular
        strength = 8 + Math.min(12, highCard);
        // Two high cards is better than one
        if (secondCard >= 10) strength += 2;
        // Ace high is notably better than other high cards
        if (highCard >= 12) strength += 2;
    }

    // --- Draw detection ---
    let hasFlushDraw = false;
    let hasOESD = false;
    let hasGutshot = false;
    let hasBackdoorFlush = false; // New

    // Flush draw
    for (const suit of heroSuits) {
        const suitCount = suitCounts[suit] || 0;
        if (suitCount === 4) {
            hasFlushDraw = true;
            // ═══ NUT FLUSH DRAW BONUS ═══
            // ═══ Phase 38A FIX: Use MAX hero rank in flush suit (indexOf got the LOWER card for suited hands) ═══
            const heroFlushRank = Math.max(...heroRanks.filter((r, idx) => heroSuits[idx] === suit));
            if (heroFlushRank >= 12) {
                // Nut flush draw — worth more than non-nut
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 36);
            } else {
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 32);
            }
        }
        // ═══ BACKDOOR FLUSH DRAW ═══ (3 to a flush on flop — adds ~3-4% equity)
        if (suitCount === 3 && board.length === 3) {
            hasBackdoorFlush = true;
            strength += 2; // Small bonus
        }
    }

    // ═══ Phase 38A FIX: Straight draw detection was SWAPPED — spread===3 was gutshot (should be OESD),
    //     spread===4 was OESD (should be gutshot). Also added wheel draw detection. ═══
    const uniqueSorted = [...new Set(ranks)].sort((a, b) => a - b);
    for (let i = 0; i <= uniqueSorted.length - 4; i++) {
        const window = uniqueSorted.slice(i, i + 4);
        const spread = window[3] - window[0];

        if (spread === 3 && heroRanks.some(r => window.includes(r))) {
            // 4 CONSECUTIVE ranks (e.g., 5-6-7-8) — need 1 card on either end to complete straight
            const lowEnd = window[0] - 1;
            const highEnd = window[3] + 1;
            if (lowEnd >= 0 && highEnd <= 12) {
                hasOESD = true; // Both ends open = OESD (8 outs)
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 30);
            } else {
                hasGutshot = true; // At rank boundary (A-high or 2-low) = only 1 end open
                if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
            }
        }
        if (spread === 4 && heroRanks.some(r => window.includes(r))) {
            // 4 ranks spanning 5 with 1 internal gap (e.g., 5-6-8-9) — gutshot (4 outs)
            hasGutshot = true;
            if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
        }
    }

    // ═══ Phase 38A: WHEEL STRAIGHT DRAW detection (A-low wraps missed by numeric sort) ═══
    if (!hasOESD && !hasGutshot) {
        const hasAce = ranks.includes(12);
        if (hasAce) {
            // Check for A-2-3-4 draw (need 5 to complete wheel) — gutshot
            const wheelRanks = [0, 1, 2]; // 2, 3, 4
            const wheelCount = wheelRanks.filter(r => ranks.includes(r)).length;
            const heroInWheel = heroRanks.includes(12) || heroRanks.some(r => wheelRanks.includes(r));
            if (wheelCount >= 3 && heroInWheel) {
                // A-2-3-4 present — need 5 (rank 3) = gutshot
                if (!ranks.includes(3)) {
                    hasGutshot = true;
                    if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
                }
            } else if (wheelCount === 2 && heroInWheel && ranks.includes(3)) {
                // A-x-x-4-5 pattern — check if we have 3 of A,2,3,4,5
                const fullWheelRanks = [12, 0, 1, 2, 3]; // A,2,3,4,5
                const fullWheelCount = fullWheelRanks.filter(r => ranks.includes(r)).length;
                if (fullWheelCount >= 4) {
                    hasGutshot = true;
                    if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 25);
                }
            }
        }
    }

    // ═══ DOUBLE GUTSHOT detection (new) ═══
    // Example: Hero has 79, board is 5-8-T → both 6 and J complete a straight = 8 outs like OESD
    // Count all cards that would complete a straight
    let straightCompletions = 0;
    for (let checkRank = 0; checkRank <= 12; checkRank++) {
        if (ranks.includes(checkRank)) continue; // Card already exists
        const testRanks = [...new Set([...ranks, checkRank])].sort((a, b) => a - b);
        // Check if adding this rank creates a straight involving at least one hero card
        for (let j = testRanks.length - 1; j >= 4; j--) {
            if (testRanks[j] - testRanks[j - 4] === 4) {
                const straightCards = testRanks.slice(j - 4, j + 1);
                if (heroRanks.some(r => straightCards.includes(r))) {
                    straightCompletions++;
                    break;
                }
            }
        }
    }
    // If we have 8+ straight completions and haven't already marked OESD, we have a double gutter
    if (straightCompletions >= 8 && !hasOESD) {
        hasOESD = true; // Double gutter is as good as OESD
        if (category === 'high_card' || category === 'no_pair') strength = Math.max(strength, 30);
    }

    // Combo draw bonus
    if (hasFlushDraw && (hasOESD || hasGutshot)) {
        strength = Math.max(strength, 50); // Combo draws are very strong
    }

    // ═══ PAIR + DRAW BONUS ═══ (new — pair + flush draw is stronger than either alone)
    if (hasFlushDraw && (category === 'top_pair' || category === 'second_pair' || category === 'overpair')) {
        strength += 5; // Pair + flush draw
    }
    if ((hasOESD || hasGutshot) && (category === 'top_pair' || category === 'second_pair')) {
        strength += 3; // Pair + straight draw
    }

    // BUG #17 FIX: Track nut flush draw status for downstream equity calculations
    let isNutFlushDraw = false;
    if (hasFlushDraw) {
        for (const suit of heroSuits) {
            if ((suitCounts[suit] || 0) === 4) {
                const heroFlushRank = Math.max(...heroRanks.filter((r, idx) => heroSuits[idx] === suit));
                // Check if hero has the ace of the flush suit — no higher card possible
                if (heroFlushRank >= 12) isNutFlushDraw = true;
                // Also check if ace of that suit is on the board — then king-high is nut draw
                const aceOnBoard = board.some(c => RANKS.indexOf(c[0]) === 12 && c[1] === suit);
                if (!isNutFlushDraw && aceOnBoard && heroFlushRank >= 11) isNutFlushDraw = true;
            }
        }
    }

    return { strength: Math.min(100, strength), category, hasFlushDraw, hasOESD, hasGutshot, hasBackdoorFlush, isNutFlushDraw };
}

/**
 * Evaluate board wetness (dry/medium/wet) (#3 Board Texture)
 */
// ═══════════════════════════════════════════════════════════════════════════
// TURN/RIVER HEURISTIC ENGINE — WORLD-CLASS FALLBACK
// ═══════════════════════════════════════════════════════════════════════════
// PioSolver data in Supabase is richest for preflop + flop. Turn and river
// solved spots are sparser. This engine fills the gap so horses play turn
// and river at the same level as preflop and flop. It's used by getDecision()
// when the GTO module returns null for turn/river spots.
//
// Core concepts:
//   1. Equity realization: Turn/river equity is more concrete than flop
//   2. Polarization: River bets should be polarized (nuts or bluffs)
//   3. Board runout: New cards dramatically shift equity distributions
//   4. SPR dynamics: Commitment decisions crystallize on turn
//   5. Blocker effects: Key cards that block opponent's value/bluffs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WORLD-CLASS Turn/River Heuristic Decision Engine
 * ═══════════════════════════════════════════════════════════════════
 * Called from getDecision() when PioSolver lacks turn/river data.
 *
 * This engine handles THE most important decisions in poker:
 * - Turn commitment (do we put in the 3rd barrel?)
 * - River value extraction (how thin can we value bet?)
 * - Bluff-catching (calling at the right frequency)
 * - Blocker-based bluffs (turning missed draws into profitable bluffs)
 * - Check-raise traps (OOP trapping on runouts that favor us)
 * - Equity change analysis (did this card help or hurt us?)
 * - Nut advantage awareness (who owns the nuts on this board?)
 * - Polarized sizing (river bets should be big or block)
 * - SPR commitment math (pot-committed = can't fold)
 * - Multiway tightening (fewer bluffs, more value)
 * - Personality integration (LAGs barrel more, nits check more)
 *
 * @param {Object} params
 * @returns {Object|null} { type, amount? } or null
 */
function makeTurnRiverHeuristicDecision(params) {
    if (!params || typeof params !== 'object') return { action: 'check', amount: 0, reason: 'invalid_params' }; // Bug #48: guard null params
    const {
        street, holeCards, board, handStr, position, stackBB, potSize,
        toCall, bb, numPlayers, legalActions, profileId, aggressionBias = 0,
        loosenessBias = 0, opponentAdjustment = { callMod: 0, foldMod: 0 },
        // ═══ ENRICHED DATA (new) ═══
        enrichedOpponentRead = null,     // Full read from HorsePokerAdvanced.getOpponentRead()
        oppStreetAggression = 'unknown', // very_heavy/heavy/moderate/light
        heroIsAggressor = false,         // Was hero the preflop raiser?
        counterStrategyMode = 'standard', // From selectCounterStrategy()
        streetNarrative = null,          // Multi-street action memory
        // ═══ ALWAYS-ON LIVE OBSERVER DATA ═══
        tableId = 'unknown',
        primaryOppId = null,
    } = params;

    if (street !== 'turn' && street !== 'river') return null;
    if (!holeCards || holeCards.length < 2 || !board || board.length < 4) return null;

    // ── Core evaluations ──
    const handEval = evaluatePostflopHand(holeCards, board);
    const drawEq = getDrawEquity(handEval, street);
    const boardWet = evaluateBoardWetness(board);
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const facingBet = toCall > 0;
    const heroStack = stackBB * bb;
    const spr = heroStack / Math.max(1, potSize);
    const betToPot = facingBet ? toCall / Math.max(1, potSize) : 0;

    // Also evaluate the FLOP hand to compute equity delta
    const flopBoard = board.slice(0, 3);
    const flopEval = evaluatePostflopHand(holeCards, flopBoard);
    const equityDelta = handEval.strength - flopEval.strength; // Positive = improved

    // ═══ BOARD TEXTURE EVOLUTION ═══
    // Track how the board changed from flop to current street.
    // This drives range advantage shifts and bluff credibility.
    const boardEvolution = analyzeBoardEvolution(board, street);
    // boardEvolution.pfrImpact: positive = runout favors PFR
    // boardEvolution.callerImpact: positive = runout favors caller
    // boardEvolution.drawsCompleted: ['flush', 'straight'] etc.
    // boardEvolution.drawsBricked: ['flush'] etc.
    // boardEvolution.evolution: 'pfr_favorable' | 'caller_favorable' | 'dynamic' | 'static_brick' | 'neutral'

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const multiway = numPlayers >= 3;

    // ═══ UPGRADED MULTIWAY ADJUSTMENTS ═══
    // Position-aware, street-aware, texture-aware multiway framework
    const mwAdj = multiway ? getMultiwayAdjustment(numPlayers, {
        position, street, boardWetness: boardWet, heroIsAggressor
    }) : { strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 0, cbetFreqMod: 0, callWidthMod: 0, adjustSizing: 0 };

    // ── BOARD RUNOUT ANALYSIS ──
    const newCard = board[board.length - 1];
    const newRank = RANKS.indexOf(newCard[0]);
    const newSuit = newCard[1];
    const boardSuits = board.map(c => c[1]);
    const boardRanks = board.map(c => RANKS.indexOf(c[0]));
    const heroSuits = holeCards.map(c => c[1]);
    const heroRanks = holeCards.map(c => RANKS.indexOf(c[0]));

    // Suit analysis
    const suitCounts = {};
    boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts));
    const flushPossible = maxSuitCount >= 3;
    const flushCompleted = maxSuitCount >= 3 && board.length >= 5;
    const flushDrew = maxSuitCount >= 3 && board.length === 4;
    const flushSuit = Object.entries(suitCounts).find(([s, c]) => c >= 3)?.[0];

    // Straight analysis
    const uniqueRanks = [...new Set(boardRanks)].sort((a, b) => a - b);
    let maxRun = 1, curRun = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
        if (uniqueRanks[i] - uniqueRanks[i - 1] <= 2) { curRun++; maxRun = Math.max(maxRun, curRun); }
        else curRun = 1;
    }
    const straightScary = maxRun >= 4;

    // Board pairing
    const boardPaired = new Set(boardRanks).size < boardRanks.length;
    const newCardPairedBoard = boardRanks.filter(r => r === newRank).length >= 2;
    const overcard = newRank >= 10;

    // ── SCARE CARD CLASSIFICATION ──
    // Level 0 = blank, 1 = minor, 2 = moderate, 3 = critical
    let scareLevel = 0;
    if (flushCompleted && !handEval.category?.includes('flush')) scareLevel = 3;
    else if (straightScary && handEval.strength < 75) scareLevel = 2;
    else if (flushDrew && !heroSuits.includes(flushSuit)) scareLevel = 2;
    else if (overcard && handEval.strength < 55) scareLevel = 1;
    else if (newCardPairedBoard && handEval.strength < 60) scareLevel = 1;

    // ── BLOCKER ANALYSIS ──
    const blocksNutFlush = flushSuit && heroSuits.includes(flushSuit) && heroRanks.includes(12);
    const blocksSecondNutFlush = flushSuit && heroSuits.includes(flushSuit) && heroRanks.includes(11);
    const blocksTopSet = heroRanks.includes(Math.max(...boardRanks));
    const blocksOverpair = heroRanks.some(r => r >= 10 && !boardRanks.includes(r));
    const hasAnyBlocker = blocksNutFlush || blocksSecondNutFlush || blocksTopSet;

    // ── STRAIGHT BLOCKER ANALYSIS (new) ──
    // Check if hero blocks key straight combinations
    const blocksStraight = straightScary && heroRanks.some(r => {
        const withinBoard = uniqueRanks.filter(br => Math.abs(br - r) <= 4);
        return withinBoard.length >= 3; // Hero card is in the middle of a connected board
    });

    // ═══ PHASE 36A: GRANULAR BLOCKER SCORING ═══
    // Beyond binary blocker detection: rank-weighted scoring system.
    // Ace-high flush blocker > King-high (removes more nut combos).
    // Unblock analysis: do we hold cards that DON'T block opponent's bluffing range?
    // Best hero call spot: block their value + unblock their bluffs.
    const blockerScore = (() => {
        let score = 0;
        // Rank-weighted flush blocker: Ace=0.25, King=0.18, Queen=0.12, Jack=0.08
        if (flushSuit) {
            for (const [i, suit] of heroSuits.entries()) {
                if (suit === flushSuit) {
                    const rank = heroRanks[i];
                    if (rank === 12) score += 0.25;       // Ace of flush suit
                    else if (rank === 11) score += 0.18;   // King of flush suit
                    else if (rank === 10) score += 0.12;   // Queen of flush suit
                    else if (rank === 9) score += 0.08;    // Jack of flush suit
                    else score += 0.03;                     // Low flush card
                }
            }
        }
        // Set/top pair blockers
        const maxBoardRank = Math.max(...boardRanks);
        if (heroRanks.includes(maxBoardRank)) score += 0.10;
        // Second-highest board card blocker
        const sortedBoardRanks = [...new Set(boardRanks)].sort((a, b) => b - a);
        if (sortedBoardRanks.length >= 2 && heroRanks.includes(sortedBoardRanks[1])) score += 0.06;
        // Overpair blockers
        if (heroRanks.some(r => r >= 11 && r > maxBoardRank)) score += 0.06;
        // Straight blockers
        if (blocksStraight) score += 0.08;
        return score;
    })();

    // ═══ PHASE 36A: UNBLOCK ANALYSIS ═══
    // For hero calls: we WANT to NOT block opponent's missed draws (their bluffing range).
    const unblocksBluffs = (() => {
        let unblockScore = 0;
        // If flush draw exists but we DON'T hold the flush suit → opponent has all missed flush combos
        if (flushSuit && !heroSuits.includes(flushSuit)) {
            unblockScore += 0.08;
        }
        // If straight draws exist but our ranks don't connect to board
        if (straightScary) {
            const heroConnects = heroRanks.some(r => {
                const nearby = uniqueRanks.filter(br => Math.abs(br - r) <= 2);
                return nearby.length >= 2;
            });
            if (!heroConnects) unblockScore += 0.06;
        }
        // Low disconnected cards = ideal unblock hand
        const heroMaxRank = Math.max(...heroRanks);
        if (heroMaxRank <= 7 && !heroSuits.includes(flushSuit || '')) {
            unblockScore += 0.04;
        }
        return unblockScore;
    })();

    // Combined hero call blocker quality: blocking value + unblocking bluffs
    const heroCallBlockerQuality = blockerScore + unblocksBluffs;

    // ── NUT ADVANTAGE ──
    // Does the board favor the caller's range or the bettor's range?
    // Low, unpaired, rainbow boards favor the PFR (preflop raiser) = nut advantage
    // High, connected, flushy boards favor the caller's range
    const avgBoardRank = boardRanks.reduce((a, b) => a + b, 0) / boardRanks.length;
    const boardFavorsPFR = avgBoardRank <= 6 && !flushPossible && !boardPaired;
    const boardFavorsCaller = avgBoardRank >= 8 || flushPossible || straightScary;

    // ═══ NUT ADVANTAGE REFINED BY AGGRESSOR STATUS + BOARD EVOLUTION ═══
    // If hero raised preflop, hero has the nut advantage on low boards.
    // If hero flat-called, hero's range is capped on many textures.
    // Board evolution shifts range advantage across streets.
    let heroHasNutAdvantage = heroIsAggressor ? boardFavorsPFR : boardFavorsCaller;
    let heroRangeCapped = !heroIsAggressor && boardFavorsPFR;

    // Board evolution can shift nut advantage on turn/river
    if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
        heroHasNutAdvantage = true;  // Runout helped PFR range
        heroRangeCapped = false;
    } else if (boardEvolution.evolution === 'caller_favorable' && !heroIsAggressor) {
        heroHasNutAdvantage = true;  // Runout helped our calling range
        heroRangeCapped = false;
    } else if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
        heroHasNutAdvantage = false; // Runout helped opponent
        heroRangeCapped = true;      // Our range is now weaker relative to board
    } else if (boardEvolution.evolution === 'static_brick') {
        // Bricked runout = status quo maintained, PFR keeps advantage if they had it
        if (heroIsAggressor && boardFavorsPFR) heroHasNutAdvantage = true;
    }

    // ═══ OPPONENT PROFILE SYNTHESIS ═══
    // Merge enrichedOpponentRead (from Advanced module) + opponentAdjustment (from Supabase)
    // into a unified opponent model for this decision.
    let oppBluffFreq = 0.25; // Default: balanced opponent bluffs 25% of the time
    let oppCallFreq = 0.50;  // Default: calls 50% of bets
    let oppFoldFreq = 0.35;  // Default: folds 35%
    let oppTendency = 'balanced';
    let oppConfidence = 0; // How confident we are in our read (0-1)

    if (enrichedOpponentRead && enrichedOpponentRead.handsObserved >= 5) {
        oppBluffFreq = enrichedOpponentRead.bluffFrequency ?? oppBluffFreq;
        oppCallFreq = enrichedOpponentRead.callFrequency ?? oppCallFreq;
        oppFoldFreq = enrichedOpponentRead.foldFrequency ?? oppFoldFreq;
        oppTendency = enrichedOpponentRead.tendency ?? oppTendency;
        // Confidence scales with hands observed: 10 hands = 0.3, 30 = 0.6, 50+ = 0.85
        oppConfidence = Math.min(0.85, enrichedOpponentRead.handsObserved / 60);
    }

    // ═══ SESSION MODEL OVERLAY ═══
    // Real-time session reads can override or refine long-term Supabase reads.
    // Session data is fresher — if someone is tilting or playing differently today,
    // the session model catches it faster than the long-term model.
    // ═══ BUG FIX: Was passing hero's profileId — now passes primaryOppId (the actual opponent) ═══
    const sessionRead = primaryOppId ? getOpponentSessionRead(primaryOppId) : null;
    if (sessionRead && sessionRead.confidence >= 0.15) {
        const sw = Math.min(0.60, sessionRead.confidence);
        const lw = 1.0 - sw;
        oppFoldFreq = lw * oppFoldFreq + sw * sessionRead.foldFreq;
        oppCallFreq = lw * oppCallFreq + sw * sessionRead.callFreq;
        if (sessionRead.bluffRate !== null) {
            oppBluffFreq = lw * oppBluffFreq + sw * sessionRead.bluffRate;
        }
        if (sessionRead.confidence >= 0.30 && sessionRead.sessionTendency !== 'balanced') {
            oppTendency = sessionRead.sessionTendency;
        }
        oppConfidence = Math.min(0.90, oppConfidence + sessionRead.confidence * 0.3);
    }

    // ═══ ALWAYS-ON LIVE OBSERVER OVERLAY ═══
    // The live observer tracks every single action in real-time across all hands.
    // This is the freshest, most detailed data available — includes timing tells,
    // position-aware stats, 3-bet frequencies, c-bet/fold-to-cbet, in-hand actions.
    const liveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    let oppCBetFreqLive = null;
    let oppFoldToCBetLive = null;
    let oppThreeBetPctLive = null;
    let oppTimingTell = null;
    let oppExploits = [];
    let oppInHandActions = null;
    // Phase 46 FIX: moved declarations OUTSIDE the liveRead block so they're accessible
    // throughout the entire function (was causing ReferenceError when no live read)
    let currentActionTimingTell = 'unknown';
    let currentActionTimingMs = null;

    if (liveRead && liveRead.confidence >= 0.10) {
        // ═══ LIVE-READ NaN/INTEGRITY GUARD (Phase 32) ═══
        // Protect against corrupted live data — NaN values would poison all downstream math
        const safeNum = (v, fallback = 0) => (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : fallback;
        const safeFoldFreq = safeNum(liveRead.foldFreq, oppFoldFreq);
        const safeCallFreq = safeNum(liveRead.callFreq, oppCallFreq);
        const safeBluffRate = liveRead.bluffRate !== null ? safeNum(liveRead.bluffRate, null) : null;
        const safeConfidence = safeNum(liveRead.confidence, 0);

        // ═══ CONFIDENCE DECAY: Stale live data degrades over time (Phase 32/34) ═══
        // Time-based: if no new data for 2+ minutes, start decaying. Halved by ~12 min.
        const msSinceUpdate = liveRead.lastSeen ? (Date.now() - liveRead.lastSeen) : 0;
        const freshnessDecay = msSinceUpdate > 120000 ? Math.max(0.50, 1.0 - (msSinceUpdate - 120000) / 600000) : 1.0;
        const adjustedConfidence = Math.min(0.70, safeConfidence * freshnessDecay);

        // Live data gets highest priority — it's the most current
        const livew = adjustedConfidence; // Up to 70% weight, decayed by freshness
        const prevw = 1.0 - livew;

        // Override core frequencies with live data
        oppFoldFreq = prevw * oppFoldFreq + livew * safeFoldFreq;
        oppCallFreq = prevw * oppCallFreq + livew * safeCallFreq;
        oppBluffFreq = safeBluffRate !== null
            ? prevw * oppBluffFreq + livew * safeBluffRate
            : oppBluffFreq;

        // ═══ FREQUENCY SANITY CLAMP (Phase 32) ═══
        // After blending, ensure frequencies stay in valid range [0, 1]
        oppFoldFreq = Math.max(0, Math.min(1, oppFoldFreq));
        oppCallFreq = Math.max(0, Math.min(1, oppCallFreq));
        oppBluffFreq = Math.max(0, Math.min(1, oppBluffFreq));

        // Player type override — live is most accurate for session behavior
        if (safeConfidence >= 0.25 && liveRead.playerType !== 'unknown') {
            oppTendency = liveRead.playerType;
        }

        // Boost confidence with live data
        oppConfidence = Math.min(0.95, oppConfidence + safeConfidence * 0.4);

        // ═══ EXTRACT ADVANCED LIVE STATS ═══
        oppCBetFreqLive = liveRead.cBetPct;
        oppFoldToCBetLive = liveRead.foldToCBetPct;
        oppThreeBetPctLive = liveRead.threeBetPct;
        oppExploits = liveRead.exploits || [];
        oppInHandActions = liveRead.inHandActions;

        // ═══ TIMING TELL INTEGRATION ═══
        // Two layers: (1) overall pattern and (2) THIS specific action's timing.
        if (liveRead.snapFreq !== null && liveRead.longTankFreq !== null) {
            if (liveRead.snapFreq > 0.50) oppTimingTell = 'fast_player';
            else if (liveRead.longTankFreq > 0.25) oppTimingTell = 'slow_player';
        }

        // ═══ PHASE 15: CURRENT ACTION TIMING TELL ═══
        // Compare opponent's decision time on THIS action vs their personal baseline.
        // Deviation from baseline is the real tell:
        //   snap_call on river → very strong (or auto-fold-if-raised)
        //   tank_aggression → marginal value or considering bluff
        //   tank_call → drawing hand or marginal made hand
        //   snap_aggression → polarized (nuts or auto-bluff)
        // Phase 46 FIX: changed from let→assignment (outer let is in function scope now)
        currentActionTimingTell = 'unknown';
        currentActionTimingMs = null;
        if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
            const lastAct = liveRead.inHandActions.lastAction;
            currentActionTimingMs = lastAct.timing || null;

            if (currentActionTimingMs !== null && liveRead.timingProfile) {
                const streetAvg = liveRead.timingProfile[street]?.avgMs || liveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = currentActionTimingMs / streetAvg;
                    if (ratio < 0.40) {
                        currentActionTimingTell = lastAct.action === 'call' ? 'snap_call'
                            : (lastAct.action === 'raise' || lastAct.action === 'bet') ? 'snap_aggression'
                            : 'snap_action';
                    } else if (ratio > 2.0) {
                        currentActionTimingTell = lastAct.action === 'call' ? 'tank_call'
                            : (lastAct.action === 'raise' || lastAct.action === 'bet') ? 'tank_aggression'
                            : 'tank_action';
                    } else if (ratio > 1.5) {
                        currentActionTimingTell = 'deliberate';
                    }
                } else if (currentActionTimingMs < 3000) {
                    currentActionTimingTell = 'snap_action';
                } else if (currentActionTimingMs > 15000) {
                    currentActionTimingTell = 'tank_action';
                }
            }
        }

        // ═══ EXPLOIT PATTERN APPLICATION ═══
        // Auto-adjust strategy based on detected exploitable patterns
        if (oppExploits.includes('overfolds_to_cbet')) {
            // They fold to c-bets too much → c-bet wider, barrel more
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (oppExploits.includes('overcbets')) {
            // They c-bet too much → check-raise more, float wider
            oppCallFreq = Math.min(oppCallFreq, 0.40); // Don't call too much — raise instead
        }
        if (oppExploits.includes('one_and_done')) {
            // They c-bet but give up on turn → call flop c-bet wider, take pot on turn
            oppFoldFreq = Math.max(oppFoldFreq, 0.50);
        }
        if (oppExploits.includes('station_to_showdown')) {
            // They go to showdown too much → value bet thinner, don't bluff
            oppCallFreq = Math.max(oppCallFreq, 0.65);
            oppBluffFreq = Math.min(oppBluffFreq, 0.10);
        }
        if (oppExploits.includes('gives_up_easily')) {
            // They don't go to showdown → bluff more, bet wider
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (oppExploits.includes('frequent_check_raiser')) {
            // They check-raise a lot → bet smaller for protection, check behind more
            oppBluffFreq = Math.max(oppBluffFreq, 0.30);
        }

        console.log(`[HorseBrain] 👁️ LIVE READ: ${primaryOppId?.substring(0, 8)} type=${liveRead.playerType} hands=${liveRead.handsObserved} conf=${Math.round(liveRead.confidence * 100)}% exploits=[${oppExploits.join(',')}]`);
    }

    // ═══ LIVE BET-SIZING TELL ANALYSIS ═══
    // Compare opponent's CURRENT bet size against their HISTORICAL average.
    // Deviations from baseline reveal hand strength:
    //   - BIGGER than usual → polarized (nuts or air)
    //   - SMALLER than usual → thin value or blocking bet
    let liveSizingTell = 'unknown';
    let liveSizingDeviation = 0;
    if (liveRead && facingBet && liveRead.confidence >= 0.20) {
        const avgBetForStreet = street === 'turn' ? liveRead.avgTurnBet
            : street === 'river' ? liveRead.avgRiverBet : liveRead.avgFlopBet;
        if (avgBetForStreet !== null && avgBetForStreet > 0) {
            liveSizingDeviation = (betToPot - avgBetForStreet) / Math.max(0.10, avgBetForStreet);
            liveSizingDeviation = Math.max(-1.0, Math.min(1.0, liveSizingDeviation));
            if (liveSizingDeviation > 0.30) liveSizingTell = 'larger_than_usual';
            else if (liveSizingDeviation < -0.30) liveSizingTell = 'smaller_than_usual';
            else liveSizingTell = 'at_baseline';
        }
        if (betToPot > 1.0 && liveRead.overbetFreq !== null && liveRead.overbetFreq < 0.08) {
            liveSizingTell = 'rare_overbet';
        }
    }

    // ═══ STREET ACTION INFERENCE ═══
    // What does the pot size tell us about opponent's range?
    // A massive pot by the turn = opponent's range is polarized (strong value or big draws)
    // A small pot = lots of checking through, ranges are wide and weak
    let oppRangeStrength = 'unknown'; // weak / medium / strong / polarized
    if (oppStreetAggression === 'very_heavy') {
        oppRangeStrength = 'polarized'; // Opponent either has the nuts or is on a big bluff
    } else if (oppStreetAggression === 'heavy') {
        oppRangeStrength = 'strong'; // Opponent likely has a real hand
    } else if (oppStreetAggression === 'moderate') {
        oppRangeStrength = 'medium'; // Standard play, mixed range
    } else if (oppStreetAggression === 'light') {
        oppRangeStrength = 'weak'; // Lots of checking, ranges are wide
    }

    // ── PERSONALITY-DRIVEN PARAMETERS ──
    const isAggressive = aggressionBias > 5;
    const isPassive = aggressionBias < -5;
    const isTight = loosenessBias < -5;
    const isLoose = loosenessBias > 5;

    // Aggression frequency for betting/raising
    const aggrFreq = Math.max(0.10, Math.min(0.90, 0.50 + aggressionBias / 40));
    // Calling frequency (passive players call more, aggressive players raise more)
    const callFreq = isPassive ? 0.70 : isAggressive ? 0.45 : 0.55;

    // ═══ POSITION-AWARE FREQUENCY MODIFIERS ═══
    // GTO solvers show massive frequency differences between IP and OOP.
    // IP: bets more often, bluffs more, thin values more, checks back less
    // OOP: checks more, check-raises more, block-bets more, folds to bets more
    const posFreqMod = {
        // IP modifiers (applied when isIP is true)
        ipValueBetBoost: isIP ? 0.08 : 0,        // IP values thinner (position guarantees showdown)
        ipBluffBoost: isIP ? 0.06 : 0,            // IP bluffs more (can realize equity on later streets)
        ipThinValueBoost: isIP ? 0.10 : 0,        // IP thin values way more (worst case checks back river)
        ipCallWidth: isIP ? 0.05 : 0,             // IP calls wider (can outplay later streets)
        // OOP modifiers (applied when !isIP)
        oopCheckFreqBoost: !isIP ? 0.10 : 0,      // OOP checks more (trapping + pot control)
        oopBlockBetBoost: !isIP ? 0.08 : 0,       // OOP block-bets more (deny big bets from IP)
        oopCheckRaiseBoost: !isIP ? 0.06 : 0,     // OOP check-raises more (only way to get value vs IP)
        oopFoldMoreVsBig: !isIP ? 0.05 : 0,       // OOP folds more to large bets (can't see free cards)
        // Street adjustments
        riverBluffIPBoost: isIP && street === 'river' ? 0.05 : 0, // River bluffs IP = last chance
        turnBarrelOOPPenalty: !isIP && street === 'turn' ? -0.06 : 0, // OOP barreling turn = risky
    };

    // ── SPR COMMITMENT ──
    const isPotCommitted = spr < 3;
    const isDeep = spr > 8;

    // ═══ SPR-DRIVEN STRATEGY FRAMEWORK ═══
    // Stack-to-pot ratio fundamentally changes correct strategy.
    // Low SPR: commit with top pair+, shove draws, no bluffs
    // Medium SPR: standard sizing, geometric planning, balanced bluffs
    // High SPR: smaller bets, more speculation, set-mining, deep implied odds
    const sprStrategy = {
        // Sizing adjustments (multiply against base sizing)
        sizeMult: spr < 3 ? 1.5 : spr < 6 ? 1.15 : spr < 12 ? 1.0 : 0.85,
        // Value bet threshold (lower SPR = commit with weaker hands)
        valueThreshold: spr < 3 ? 40 : spr < 6 ? 50 : spr < 12 ? 55 : 60,
        // Bluff reduction at low SPR (bluffs are too expensive relative to pot)
        bluffMult: spr < 3 ? 0.20 : spr < 6 ? 0.65 : spr < 12 ? 1.0 : 1.10,
        // Call width (low SPR = call wider, we're committed)
        callWidthBonus: spr < 3 ? 0.15 : spr < 6 ? 0.08 : 0,
        // Draw chase threshold (high SPR = implied odds justify chasing)
        drawOddsBonus: spr > 12 ? 0.08 : spr > 8 ? 0.04 : 0,
        // Thin value willingness (medium SPR is sweet spot)
        thinValueMult: spr < 3 ? 0.50 : spr < 6 ? 0.80 : spr < 12 ? 1.0 : 0.90,
        // Overbet willingness (low-medium SPR: overbet to jam, high SPR: no)
        overbetMult: spr < 3 ? 1.5 : spr < 6 ? 1.2 : spr < 12 ? 1.0 : 0.70,
    };

    // ═══ EDGE CASE: LIMPED POT DETECTION ═══
    // In limped pots: nobody has range advantage, ranges are wide, no c-bet dynamics.
    // Everyone connected somewhere — be more cautious with bluffs, tighter with value.
    const isLimpedPot = !heroIsAggressor && oppStreetAggression === 'light' && potSize / bb <= numPlayers * 2.5;
    if (isLimpedPot) {
        // Limped pot adjustments — applied to sprStrategy and posFreqMod
        sprStrategy.bluffMult *= 0.50;         // Halve bluff frequency (ranges are wide, someone has it)
        sprStrategy.thinValueMult *= 0.75;     // Thin value is riskier (opponents have weird hands)
        sprStrategy.sizeMult *= 0.85;          // Bet smaller (pot is small, don't build it unnecessarily)
    }

    // ═══ 3-BET POT DETECTION (TURN/RIVER) ═══
    // 3-bet pots have SPR ~3-6 on the flop → by the turn SPR is often 1-4.
    // Ranges are narrow: both players have strong holdings from preflop.
    // Key differences from single-raised pots:
    //   - Continuation barrel (turn) should be smaller in sizing (~50-60% vs 66-75%)
    //   - Bluffs should be very selective (opponent has good hands)
    //   - Value bets can be thinner (opponent is more likely to have a pair+)
    //   - Check-raises are MORE polarized (opponent's c-bet range is stronger)
    const expectedSRPSize = numPlayers * 2 * bb;
    const is3BetPot = heroIsAggressor && !isLimpedPot && potSize > expectedSRPSize * 3.5 && spr < 8;
    const is4BetPot = heroIsAggressor && !isLimpedPot && potSize > expectedSRPSize * 8.0 && spr < 4;

    if (is4BetPot) {
        // 4-bet pots on turn/river: commit with any decent hand, no bluffs
        sprStrategy.valueThreshold = Math.max(30, sprStrategy.valueThreshold - 15);
        sprStrategy.bluffMult *= 0.15;         // Almost no bluffs
        sprStrategy.sizeMult = Math.max(1.0, sprStrategy.sizeMult); // Don't undersize when committed
        sprStrategy.thinValueMult *= 1.20;     // Thin value is profitable (their range is capped)
    } else if (is3BetPot) {
        // 3-bet pots: moderate adjustments
        sprStrategy.valueThreshold = Math.max(35, sprStrategy.valueThreshold - 8);
        sprStrategy.bluffMult *= 0.55;         // Cut bluffs nearly in half
        sprStrategy.sizeMult *= 0.90;          // Slightly smaller sizing
        sprStrategy.thinValueMult *= 1.10;     // Thin value is slightly more profitable
        sprStrategy.callWidthBonus += 0.05;    // Call wider (opponent bluffs less but we have a strong range too)
    }

    // ═══ EDGE CASE: VERY SHORT STACK (< 15BB) ═══
    // Push/fold mode: no postflop fancy play, just shove strong hands and fold weak ones.
    if (stackBB < 15 && !facingBet && canRaise && street !== 'river') {
        // Short stack not facing a bet: shove any hand worth playing
        if (handEval.strength >= sprStrategy.valueThreshold - 10) {
            return { type: 'all_in' };
        }
        // Semi-bluff shoves with strong draws
        if (drawEq.outs >= 12 && Math.random() < 0.60) {
            return { type: 'all_in' };
        }
    }
    if (stackBB < 15 && facingBet) {
        // Short stack facing a bet: call/fold only, no raising (unless nuts)
        if (handEval.strength >= 70 && canRaise) {
            return { type: 'all_in' }; // Jam with strong hands
        }
        if (handEval.strength >= sprStrategy.valueThreshold - 5 && canCall) {
            return { type: 'call' }; // Call with decent hands
        }
        // Strong draws facing reasonable bet: call for implied odds
        if (drawEq.outs >= 10 && betToPot <= 0.60 && canCall) {
            return { type: 'call' };
        }
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ═══ EDGE CASE: VERY DEEP STACKS (> 200BB) ═══
    // Deep stack play: speculative hands gain value, avoid bloating pots without nuts.
    // Implied odds are massive — set-mining and draw-chasing become highly profitable.
    if (stackBB > 200) {
        // Deep stack: increase draw chasing willingness
        sprStrategy.drawOddsBonus += 0.06;
        // Deep stack: reduce thin value betting (opponent can outplay us)
        sprStrategy.thinValueMult *= 0.85;
        // Deep stack: reduce overbet willingness (too much at risk)
        sprStrategy.overbetMult *= 0.60;
    }

    // ═══ MULTI-STREET COMMITMENT TRACKER ═══
    // Tracks how committed hero is to the pot based on prior street investments.
    // Prevents illogical plays like folding the river after investing heavily on flop+turn.
    //
    // Commitment level drives: minimum call frequency, fold reluctance, bluff persistence.
    //
    // committedFraction = fraction of starting stack already in the pot
    // The higher this is, the more "priced in" we are to continue.
    const startingStack = stackBB * bb + (potSize - toCall); // Approximate starting stack
    const investedInPot = startingStack - heroStack; // How much hero has put in
    const committedFraction = investedInPot / Math.max(1, startingStack);
    const isHeavilyCommitted = committedFraction >= 0.35; // 35%+ of starting stack in pot
    const isModeratelyCommitted = committedFraction >= 0.20;

    // Commitment adjustments to sprStrategy
    if (isHeavilyCommitted && !isPotCommitted) {
        // We've put in 35%+ of our stack — don't fold easily
        sprStrategy.callWidthBonus = Math.max(sprStrategy.callWidthBonus, 0.10);
        sprStrategy.valueThreshold = Math.max(30, sprStrategy.valueThreshold - 5);
    }
    if (isModeratelyCommitted && facingBet) {
        // 20%+ invested — slight call width boost
        sprStrategy.callWidthBonus = Math.max(sprStrategy.callWidthBonus, 0.05);
    }

    // Helper to clamp bet/raise amounts
    // Phase 46 FIX: Moved BEFORE exploit intensifier (was used before definition → ReferenceError)
    const clampAmt = (amt) => {
        if (isNaN(amt) || !isFinite(amt)) amt = raiseAction?.minAmount || potSize || 1; // NaN guard
        if (!raiseAction) return amt;
        return Math.max(raiseAction.minAmount || 1, Math.min(amt, raiseAction.maxAmount || amt));
    };

    // ═══ EXPLOIT-LOOP INTENSIFIER ═══
    // When high-confidence reads exist, try to exploit BEFORE the standard decision tree.
    // This maximizes EV vs identified weak players.
    if (oppConfidence >= 0.50 && !multiway) {
        const exploitResult = applyExploitIntensifier({
            currentAction: null, currentAmount: null,
            handStrength: handEval.strength, handCategory: handEval.category,
            street, potSize, toCall, bb,
            canRaise, canCall,
            raiseAction,
            oppTendency, oppConfidence, oppBluffFreq, oppCallFreq, oppFoldFreq,
            isIP, heroIsAggressor,
            boardWetness: boardWet,
            drawOuts: drawEq.outs,
            numPlayers,
            liveRead  // Phase 28: pass live-read to exploit intensifier
        });
        if (exploitResult.exploiting && exploitResult.action) {
            console.log(`[HorseBrain] 🎯 EXPLOIT INTENSIFIER: ${exploitResult.exploit} → ${exploitResult.action}`);
            if (exploitResult.action === 'check') return canCheck ? { type: 'check' } : null;
            // BUG #29 FIX: Never fold when check is available — strict dominance
            if (exploitResult.action === 'fold') return canCheck ? { type: 'check' } : { type: 'fold' };
            if (exploitResult.action === 'call') return canCall ? { type: 'call' } : null;
            if (raiseAction && (exploitResult.action === raiseAction.type || exploitResult.action === 'bet' || exploitResult.action === 'raise')) {
                const amt = exploitResult.amount ? clampAmt(exploitResult.amount) : null;
                return { type: raiseAction.type, amount: amt };
            }
        }
    }

    // ═══ ANTI-EXPLOIT INTEGRATION ═══
    // In counter-exploit modes, adjust strategy to be less readable
    const inStealthMode = counterStrategyMode === 'stealth' || counterStrategyMode === 'anti_bot_stealth';
    const inAntiBot = counterStrategyMode === 'anti_bot' || counterStrategyMode === 'anti_bot_stealth';

    // ═══ MULTI-STREET NARRATIVE ADJUSTMENTS ═══
    // Use our prior street actions to keep our betting line believable.
    // A horse that bet flop and checked turn shouldn't barrel the river with air.
    // A horse that checked flop and bet turn IS telling a delayed value story.
    const narrative = streetNarrative || {
        heroBetFlop: false, heroCheckedFlop: false, heroBetTurn: false,
        heroCheckedTurn: false, heroRaisedPreflop: false, barrelsInARow: 0,
        checkBehindCount: 0, storyIsConsistent: true, suggestedLine: 'balanced'
    };

    // Narrative-based aggression modifier
    // +: more likely to barrel  -: less likely to barrel
    let narrativeAggrMod = 0;
    if (narrative.suggestedLine === 'barrel' && narrative.storyIsConsistent) {
        narrativeAggrMod = 5; // Continue the story — barrel is credible
    }
    if (narrative.suggestedLine === 'check-back') {
        narrativeAggrMod = -8; // Haven't shown aggression — bluffs are less credible
    }
    if (narrative.suggestedLine === 'trap' && street === 'river') {
        narrativeAggrMod = 3; // Check-turn, bet-river = credible value/trap line
    }
    if (!narrative.storyIsConsistent && handEval.strength < 50) {
        narrativeAggrMod -= 5; // Our line doesn't make sense — don't bluff
    }
    // Triple barrel = high commitment — only do with strong hands or committed bluffs
    if (narrative.barrelsInARow >= 2 && street === 'river') {
        if (handEval.strength < 30 && !hasAnyBlocker) {
            narrativeAggrMod -= 10; // Don't triple-barrel air without blockers
        } else if (handEval.strength >= 60) {
            narrativeAggrMod += 5; // Strong hand + two prior barrels = go for it
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  T U R N
    // ════════════════════════════════════════════════════════════════
    if (street === 'turn') {

        // ═══ NOT FACING A BET ═══
        if (!facingBet) {

            // ── POT COMMITTED: Jam with decent hands ──
            if (isPotCommitted && handEval.strength >= 45 && canRaise) {
                return { type: 'all_in' };
            }

            // ── DELAYED C-BET: Checked flop as PFR, now bet turn ──
            // This is a powerful line: checking flop shows "weakness" (trapping or giving up),
            // then betting turn represents strength. Works especially well on turn cards that
            // change the board texture (overcards, flush completions, board pairs).
            if (heroIsAggressor && narrative.heroCheckedFlop && canRaise && !multiway) {
                let delayedCbetFreq = 0;

                // With strong hands: delayed c-bet for value (disguised line)
                if (handEval.strength >= 55) {
                    delayedCbetFreq = 0.65; // Strong hands should bet most of the time
                }
                // With medium hands: delayed c-bet to define hand + deny equity
                else if (handEval.strength >= 35) {
                    delayedCbetFreq = 0.35;
                    // Turn overcard hit → we can represent it
                    if (overcard && scareLevel >= 1) delayedCbetFreq += 0.12;
                }
                // With air: delayed c-bet bluff (works well on scare cards)
                else if (handEval.strength < 20) {
                    delayedCbetFreq = 0.20 + aggressionBias / 50;
                    // Turn scare card → more credible bluff
                    if (scareLevel >= 2) delayedCbetFreq += 0.12;
                    if (overcard) delayedCbetFreq += 0.08;
                    // Board paired → we can represent trips/full house
                    if (newCardPairedBoard) delayedCbetFreq += 0.08;
                    // Against over-folders, bluff more
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.25) delayedCbetFreq += 0.10;
                    // Against callers, don't bluff
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) delayedCbetFreq = 0;
                }

                // ═══ BOARD EVOLUTION-DRIVEN DELAYED C-BET ═══
                // Runout that favors our range = more credible delayed c-bet
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    delayedCbetFreq += 0.12; // Turn helped our range — very credible
                } else if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    delayedCbetFreq -= 0.10; // Turn helped their range — less credible
                }
                // Completed draws: represent them if aggressor, fear them if not
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    delayedCbetFreq += 0.08; // We can represent the completed draw
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0 && heroIsAggressor) {
                    delayedCbetFreq += 0.06; // Draws bricked = opponent's semi-bluffs missed
                }
                // Static brick = status quo, good for delayed c-bet
                if (boardEvolution.evolution === 'static_brick') {
                    delayedCbetFreq += 0.05;
                }

                // Narrative boost
                delayedCbetFreq += narrativeAggrMod / 40;

                // ═══ LIVE-READ DELAYED C-BET (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // High fold freq → delayed c-bet bluffs are very profitable
                    if (liveRead.foldFreq > 0.50) delayedCbetFreq += 0.08;
                    // Low WTSD → they give up easily → delayed c-bet prints
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) delayedCbetFreq += 0.06;
                    // Calling station → only delayed c-bet with value hands
                    if (liveRead.callFreq > 0.60 && handEval.strength < 35) delayedCbetFreq -= 0.12;
                    if (liveRead.callFreq > 0.60 && handEval.strength >= 55) delayedCbetFreq += 0.06;
                    // They checked behind on flop too → if they have high c-bet%, range is CAPPED
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) delayedCbetFreq += 0.08;
                }

                delayedCbetFreq = Math.max(0, Math.min(0.80, delayedCbetFreq));

                if (delayedCbetFreq > 0.05 && Math.random() < delayedCbetFreq) {
                    let sizeFrac = handEval.strength >= 55 ? 0.60 : 0.50;
                    if (boardWet === 'wet') sizeFrac += 0.08;
                    // Live sizing: smaller vs folders, bigger vs stations
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.foldFreq > 0.50 && handEval.strength < 35) sizeFrac = Math.max(0.38, sizeFrac - 0.08);
                        if (liveRead.callFreq > 0.55 && handEval.strength >= 45) sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }
                    console.log(`[HorseBrain] 🎯 DELAYED C-BET: str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── MONSTERS (set+, two pair on safe board) → Value bet ──
            if (handEval.strength >= 75 && canRaise) {
                // Slowplay traps: sometimes check monsters OOP to induce bluffs
                let trapFreq = (oppTendency === 'bluffy' && oppConfidence > 0.3) ? 0.40 : 0.25;
                // ═══ LIVE-READ TURN TRAP (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponents: trap MORE (they bet into us)
                    if (liveRead.aggFreq > 0.45) trapFreq += 0.10;
                    if (liveRead.aggFreq > 0.55) trapFreq += 0.06;
                    // Passive opponents: trap LESS (they check behind, no value)
                    if (liveRead.aggFreq < 0.20) trapFreq -= 0.12;
                    // High c-bet: they'll fire again, trap is profitable
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) trapFreq += 0.08;
                    // High second barrel: they'll keep going
                    if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.50) trapFreq += 0.06;
                    // Timing: snap aggression = auto-bet, they'll fire if we check
                    if (currentActionTimingTell === 'snap_aggression') trapFreq += 0.08;
                }
                trapFreq = Math.max(0.05, Math.min(0.60, trapFreq));
                if (!isIP && scareLevel === 0 && Math.random() < trapFreq && !multiway) {
                    return { type: 'check' }; // Check-raise trap
                }

                // ═══ GEOMETRIC SIZING: Plan to get stacks in by river ═══
                // With monsters on the turn, we want to build the pot optimally
                // so that our river bet naturally gets us all-in.
                const streetsLeft = 2; // turn + river
                const geoSizing = getGeometricSizing(potSize, heroStack, streetsLeft, true);

                let sizeFrac;
                if (geoSizing.isJammable && spr >= 3) {
                    // Use geometric sizing to get stacks in by river
                    sizeFrac = geoSizing.sizeFraction;
                } else if (spr < 5) {
                    sizeFrac = 0.75; // Shallow: bigger to set up jam
                } else {
                    sizeFrac = geoSizing.sizeFraction; // Deep: use computed geometric
                }

                // Against calling stations, go bigger (they call anyway)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    sizeFrac = Math.min(1.0, sizeFrac * 1.15);
                }
                // Against nits, go slightly smaller to keep them in
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                    sizeFrac = Math.max(0.45, sizeFrac * 0.85);
                }
                // ═══ LIVE-READ TURN MONSTER SIZING (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live station overrides static reads — go even bigger
                    if (liveRead.callFreq > 0.60) sizeFrac = Math.min(1.05, sizeFrac + 0.10);
                    // Live folder — keep sizing down to prevent folds
                    if (liveRead.foldFreq > 0.55) sizeFrac = Math.max(0.40, sizeFrac - 0.08);
                    // High WTSD: they'll call big — maximize value
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) sizeFrac = Math.min(1.0, sizeFrac + 0.06);
                }

                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
            }

            // ── STRONG HANDS (top pair+, overpair) → Continue betting on safe runouts ──
            if (handEval.strength >= 55 && scareLevel <= 1 && canRaise) {
                // Double barrel: size for protection on wet boards, thinner on dry
                // SPR-adjusted: low SPR = bigger (commit), high SPR = smaller (pot control)
                let sizeFrac = (boardWet === 'dry' ? 0.45 : boardWet === 'wet' ? 0.66 : 0.55) * sprStrategy.sizeMult;
                let betFreq = multiway ? Math.max(0.40, 0.60 + mwAdj.cbetFreqMod) : aggrFreq;

                // ═══ 3-BET POT TURN BARREL ADJUSTMENTS ═══
                // In 3-bet pots, ranges are narrow → barrel MORE for value (opponent has a pair),
                // but use SMALLER sizing (ranges are condensed, 50% pot is standard).
                if (is3BetPot) {
                    betFreq = Math.min(0.85, betFreq + 0.10); // Barrel more often (ranges are strong)
                    sizeFrac = Math.max(0.35, sizeFrac * 0.85); // Smaller sizing in 3-bet pots
                }
                if (is4BetPot && spr <= 3 && handEval.strength >= 55) {
                    return { type: 'all_in' }; // 4-bet pot + low SPR = just jam
                }

                // ═══ POSITION-AWARE BARREL FREQUENCY ═══
                betFreq += posFreqMod.ipValueBetBoost; // IP bets more for thin value
                betFreq += posFreqMod.turnBarrelOOPPenalty; // OOP barrel penalty

                // ═══ BOARD EVOLUTION-DRIVEN BARREL SIZING ═══
                // Dynamic boards = charge more (opponent's range is more uncertain)
                if (boardEvolution.evolution === 'dynamic') {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.10); // Dynamic runout = bigger sizing
                }
                // Draws completed on turn = we need to bet bigger to charge
                if (boardEvolution.drawsCompleted.length > 0) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.08);
                }
                // Board got wetter = increase protection sizing
                if (boardEvolution.boardGotWetter) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.06);
                }
                // Board got drier (brick) = can bet smaller for thin value
                if (boardEvolution.boardGotDrier) {
                    sizeFrac = Math.max(0.35, sizeFrac - 0.08);
                }

                // ═══ NARRATIVE-DRIVEN BARREL ═══
                // If we bet the flop, continue the story (double barrel is credible)
                if (narrative.heroBetFlop) {
                    betFreq += 0.08; // Continuation story bonus
                }
                // If we checked flop, betting turn = delayed c-bet (also credible, but different line)
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    betFreq += 0.05; // Delayed c-bet line is strong
                    sizeFrac = Math.max(sizeFrac, 0.55); // Delayed c-bet should be decent sized
                }
                // Apply narrative aggression modifier
                betFreq += narrativeAggrMod / 30;

                // ═══ NUT ADVANTAGE ADJUSTMENT ═══
                if (heroHasNutAdvantage && heroIsAggressor) {
                    betFreq = Math.min(0.85, betFreq + 0.15);
                }
                if (heroRangeCapped) {
                    betFreq = Math.max(0.30, betFreq - 0.15);
                }

                // ═══ OPPONENT-AWARE BARREL FREQUENCY ═══
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                    betFreq = Math.min(0.80, betFreq + 0.12);
                }
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) {
                    if (handEval.strength < 60) betFreq = Math.max(0.25, betFreq - 0.20);
                }

                // ═══ IN-HAND SEQUENCE → TURN BARREL ADJUSTMENT ═══
                if (oppInHandActions) {
                    const inHandActs = oppInHandActions.actions || [];
                    const oppFlopAct = inHandActs.find(a => a.street === 'flop');
                    const oppPreflopAct = inHandActs.find(a => a.street === 'preflop');
                    // Cold-called preflop + called flop = capped range → barrel wider
                    if (oppPreflopAct && oppPreflopAct.action === 'call' && oppFlopAct && oppFlopAct.action === 'call') {
                        betFreq += 0.08;
                        if (handEval.strength < 30 && scareLevel >= 2) betFreq += 0.06;
                    }
                    // 3-bet preflop + called flop = strong range → careful
                    if (oppPreflopAct && oppPreflopAct.action === 'raise' && (oppPreflopAct.facingRaiseCount || 0) >= 1
                        && oppFlopAct && oppFlopAct.action === 'call') {
                        if (handEval.strength < 55) betFreq -= 0.10;
                        sizeFrac = Math.max(0.35, sizeFrac - 0.05);
                    }
                    // Limped preflop → very wide → barrel aggressively
                    if (oppPreflopAct && oppPreflopAct.action === 'call' && oppPreflopAct.isOpenAction) {
                        betFreq += 0.10;
                    }
                }

                // ═══ PHASE 16: LIVE-READ DRIVEN TURN SIZING ═══
                // Dynamically adjust bet size based on what we know about THIS opponent.
                // Core principle: size for max EV — bigger when they call too wide, smaller when they fold too much.
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Against calling stations: SIZE UP value bets — they call too wide
                    if (liveRead.callFreq > 0.55) {
                        sizeFrac = Math.min(0.85, sizeFrac + 0.08);
                    }
                    // Against folders: SIZE DOWN to keep them in range
                    if (liveRead.foldFreq > 0.50) {
                        sizeFrac = Math.max(0.33, sizeFrac - 0.08);
                    }
                    // Against frequent check-raisers: SIZE DOWN to reduce risk (they punish big bets)
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.10 && !isIP) {
                        sizeFrac = Math.max(0.35, sizeFrac - 0.06);
                    }
                    // Against overbetters: they're polarized → size normally, they'll call or fold either way
                    // Against slow players (long tanks): they think more = can extract more
                    if (currentActionTimingTell === 'tank_call') {
                        sizeFrac = Math.min(0.80, sizeFrac + 0.05); // They tanked and called = marginal → size up next street
                    }
                }

                betFreq = Math.max(0.10, Math.min(0.90, betFreq));
                if (Math.random() < betFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── EQUITY IMPROVED: We picked up equity → barrel ──
            // BUG #25 FIX: Was barreling at strength >= 45 which is marginal and can't stand a raise.
            // A hand that improved from 30→45 is still weak — only barrel when we're genuinely strong (55+)
            // OR when the improvement was massive (25+ delta) and we have some showdown value.
            if (equityDelta >= 15 && canRaise) {
                const shouldBarrelImprovement = handEval.strength >= 55 || (equityDelta >= 25 && handEval.strength >= 45);
                if (shouldBarrelImprovement) {
                    // Board improved us (e.g., hit two pair, set, flush draw completed)
                    const sizeFrac = handEval.strength >= 65 ? 0.66 : 0.50; // Stronger hand = bigger bet
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── STRONG DRAWS: Semi-bluff the turn ──
            if (drawEq.outs >= 9 && canRaise) {
                let semiFreq = Math.min(0.65, 0.40 + aggressionBias / 30);
                // Against opponents who over-fold, semi-bluff more
                if (oppFoldFreq > 0.50 && oppConfidence > 0.25) {
                    semiFreq = Math.min(0.75, semiFreq + 0.12);
                }
                // ═══ LIVE-READ TURN SEMI-BLUFF DRAW (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Folders: semi-bluff aggressively
                    if (liveRead.foldFreq > 0.50) semiFreq += 0.10;
                    // Fold-to-raise: direct semi-bluff profitability
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) semiFreq += 0.08;
                    // Calling stations: check more (realize equity, no fold equity)
                    if (liveRead.callFreq > 0.60) semiFreq -= 0.15;
                    // Low WTSD: they give up — barrel draws for fold equity
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) semiFreq += 0.08;
                }
                // In stealth mode, randomize sizing more to avoid patterns
                if (Math.random() < semiFreq * (multiway ? mwAdj.bluffReduction : 1.0)) {
                    let sizeFrac = drawEq.outs >= 14 ? 0.65 : 0.50; // Bigger with combo draws
                    if (inStealthMode) sizeFrac += (Math.random() * 0.10 - 0.05); // +/- 5% noise
                    // Live-read sizing: smaller vs folders (saves chips when called)
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldFreq > 0.55) {
                        sizeFrac = Math.max(0.38, sizeFrac - 0.08);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── SCARE CARD: Slow down with non-nuts ──
            if (scareLevel >= 2 && handEval.strength < 65) {
                // But if opponent is weak-tight, they're scared too — bet sometimes to steal
                let scareStealFreq = 0.25;
                // ═══ LIVE-READ SCARE CARD EXPLOIT (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live folders: barrel scare cards more
                    if (liveRead.foldFreq > 0.50) scareStealFreq += 0.12;
                    // Live WTSD low: they shut down on scary runouts
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) scareStealFreq += 0.08;
                    // Stations: don't bluff scare cards
                    if (liveRead.callFreq > 0.55) scareStealFreq -= 0.15;
                }
                if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || scareStealFreq > 0.30) {
                    if (canRaise && Math.random() < scareStealFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
                    }
                }
                return { type: 'check' };
            }

            // ── MEDIUM HANDS IP: Showdown Value + Pot Control Framework ──
            if (isIP && handEval.strength >= 30 && handEval.strength < 55) {

                // ═══ SHOWDOWN VALUE ASSESSMENT ═══
                // Medium hands IP have real showdown value — the question is whether
                // betting gains more EV than checking to showdown.
                const hasShowdownValue = handEval.strength >= 35;
                const isVulnerable = boardWet === 'wet' || drawEq.outs >= 4; // Can be outdrawn
                const isProtected = boardWet === 'dry' && scareLevel === 0; // Safe to check

                // ═══ LIVE-READ MEDIUM HAND POT CONTROL (Phase 22) ═══
                let liveCallStationMod = 0;
                let liveFolderMod = 0;
                let liveCheckRaiseThreat = false;
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Stations: bet thinner for value, they call with worse
                    if (liveRead.callFreq > 0.55) liveCallStationMod = 0.12;
                    if (liveRead.callFreq > 0.65) liveCallStationMod = 0.18;
                    // Folders: don't bother betting medium hands
                    if (liveRead.foldFreq > 0.55) liveFolderMod = -0.10;
                    // Check-raise threats: be careful betting medium IP
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) {
                        liveCheckRaiseThreat = true;
                    }
                    // Aggressive opponents: check back more for pot control
                    if (liveRead.aggFreq > 0.45 && handEval.strength < 42) liveFolderMod -= 0.08;
                }

                // ═══ BET vs CHECK DECISION TREE ═══

                // 1. Against weak ranges: thin value bet (they call with worse)
                if (oppRangeStrength === 'weak' && handEval.strength >= 40 && canRaise) {
                    let thinBetFreq = 0.35;
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) thinBetFreq = 0.50;
                    // Narrative: if we bet flop, continued story makes this credible
                    if (narrative.heroBetFlop) thinBetFreq += 0.06;
                    // Live-read: stations = bet more, check-raise threat = bet less
                    thinBetFreq += liveCallStationMod;
                    thinBetFreq += liveFolderMod;
                    if (liveCheckRaiseThreat && handEval.strength < 42) thinBetFreq -= 0.12;
                    let thinBetSizing = 0.40;
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.callFreq > 0.60) thinBetSizing = 0.48;
                    if (Math.random() < thinBetFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * thinBetSizing)) };
                    }
                }

                // 2. Vulnerable medium hands on wet boards: bet for protection
                if (isVulnerable && handEval.strength >= 40 && canRaise && !multiway) {
                    let protectFreq = 0.30;
                    if (boardWet === 'wet' && drawEq.outs >= 6) protectFreq = 0.40;
                    // If we've been barreling, continue (credible)
                    if (narrative.heroBetFlop && narrative.storyIsConsistent) protectFreq += 0.08;
                    // Live-read: bet more for protection vs stations, less vs check-raisers
                    protectFreq += liveCallStationMod * 0.5;
                    if (liveCheckRaiseThreat) protectFreq -= 0.10;
                    let protectSizing = 0.45;
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.callFreq > 0.55) protectSizing = 0.52;
                    if (Math.random() < protectFreq) {
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * protectSizing)) };
                    }
                }

                // 3. Protected medium hands on dry boards: check for pot control
                if (isProtected && hasShowdownValue) {
                    // Live-read override: vs extreme stations, bet even on dry boards
                    if (liveCallStationMod >= 0.18 && handEval.strength >= 42 && canRaise) {
                        if (Math.random() < 0.30) {
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.35)) };
                        }
                    }
                    // Check back is optimal — our hand plays well at showdown
                    // and opponent's calling range beats us
                    return { type: 'check' };
                }

                // 4. Medium-weak hands: always check for pot control
                return { type: 'check' };
            }

            // ═══ TURN PROBE BET FRAMEWORK (Non-Aggressor IP) ═══
            // When we're the caller and IP, opponent checked to us on the turn.
            // A probe bet takes advantage of our position to:
            // 1. Steal the pot with weak hands on favorable cards
            // 2. Extract thin value from opponent's capped checking range
            // 3. Deny free cards to opponent's draws
            if (!heroIsAggressor && isIP && canRaise && !multiway) {
                let probeFreq = 0;
                let probeSizing = 0.50; // Default probe = half pot

                // ═══ SCARE CARD PROBE ═══
                // Turn card that scares opponent (overcard, flush card, board pair)
                // → probe to represent the scare card
                if (scareLevel >= 1 && handEval.strength >= 20) {
                    probeFreq = 0.30 + aggressionBias / 40;
                    if (scareLevel >= 2) probeFreq += 0.10;
                    // Board evolution: if runout favors our perceived range, probe more
                    if (boardEvolution.evolution === 'caller_favorable') probeFreq += 0.08;
                    probeSizing = scareLevel >= 2 ? 0.55 : 0.45;
                }

                // ═══ OPPONENT WEAKNESS PROBE ═══
                // Opponent checked to us after they were the aggressor → sign of weakness
                if (heroIsAggressor === false && oppStreetAggression !== 'very_heavy') {
                    if (handEval.strength >= 30 && handEval.strength < 55) {
                        probeFreq = Math.max(probeFreq, 0.25);
                        // Against weak-tight, probe with anything
                        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                            probeFreq = Math.max(probeFreq, 0.40);
                        }
                        probeSizing = 0.40; // Smaller probe for thin value
                    }
                }

                // ═══ DRAW DENIAL PROBE ═══
                // On wet boards, probe to charge opponent's draws
                if (boardWet === 'wet' && handEval.strength >= 35 && handEval.strength < 65) {
                    probeFreq = Math.max(probeFreq, 0.35);
                    probeSizing = Math.max(probeSizing, 0.55); // Bigger to charge
                }

                // ═══ BOARD EVOLUTION PROBE ═══
                // Bricked draws on turn → opponent's semi-bluffs missed → probe to take pot
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    probeFreq += 0.08;
                }

                // Against callers, probe less (they call everything)
                if (oppCallFreq > 0.65 && oppConfidence > 0.3 && handEval.strength < 45) {
                    probeFreq = 0; // Don't probe into a calling station with air
                }
                // ═══ 3-BET POT: Probe less in 3-bet pots (opponent's checking range is stronger) ═══
                if (is3BetPot) {
                    probeFreq *= 0.65; // 35% reduction (opponent checked with a strong range)
                    probeSizing = Math.max(0.33, probeSizing - 0.08); // Smaller probes
                }

                // ═══ LIVE-READ PROBE BET ADJUSTMENTS (Phase 18) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Opponent's check-behind frequency: if they c-bet a lot but checked → very capped
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) {
                        probeFreq += 0.10; // They usually c-bet → check = weakness → probe more
                    }
                    // Opponent's fold-to-probe/bet: high folders = probe paradise
                    if (liveRead.foldFreq > 0.50) {
                        probeFreq += 0.08;
                        probeSizing = Math.max(0.33, probeSizing - 0.05); // Smaller probe saves chips
                    }
                    // Opponent who calls a lot: probe less with air, more with value
                    if (liveRead.callFreq > 0.55 && handEval.strength < 40) {
                        probeFreq -= 0.10; // Don't probe stations with weak hands
                    } else if (liveRead.callFreq > 0.55 && handEval.strength >= 45) {
                        probeFreq += 0.06; // Probe for value vs stations
                        probeSizing = Math.min(0.65, probeSizing + 0.08); // Bigger for value
                    }
                    // WTSD: low WTSD = they give up easily → probe more aggressively
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                        probeFreq += 0.08;
                    }
                    // Timing tell: if opponent snap-checked to us → weakness tell → probe
                    if (currentActionTimingTell === 'snap_call' || currentActionTimingTell === 'deliberate') {
                        // No adjustment for non-check timing tells
                    }
                    if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
                        const la = liveRead.inHandActions.lastAction;
                        if (la.action === 'check' && la.timing) {
                            const avg = liveRead.timingProfile?.turn?.avgMs || liveRead.avgDecisionMs;
                            if (avg && avg > 0 && la.timing / avg < 0.40) {
                                probeFreq += 0.08; // Snap check = no interest in pot
                                probeSizing = Math.max(0.33, probeSizing - 0.03);
                            } else if (avg && avg > 0 && la.timing / avg > 1.8) {
                                probeFreq -= 0.06; // Tank check = trapping?
                            }
                        }
                    }
                }

                probeFreq = Math.max(0, Math.min(0.55, probeFreq));
                if (probeFreq > 0.05 && Math.random() < probeFreq) {
                    console.log(`[HorseBrain] 🔍 TURN PROBE: str=${handEval.strength} scare=${scareLevel} opp=${oppTendency} size=${Math.round(probeSizing * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * probeSizing)) };
                }
            }

            // ═══ OOP TURN LEAD (Non-Aggressor OOP — Delayed Donk) ═══
            // When we're the caller OOP and the PFR checked back flop (showing weakness),
            // we should lead the turn with a wider range than normal.
            // GTO principle: when PFR gives up c-bet, their range is capped → we can attack.
            if (!heroIsAggressor && !isIP && canRaise && !multiway) {
                const pfrCheckedFlop = narrative.heroCheckedFlop && !narrative.heroBetFlop;
                if (pfrCheckedFlop) {
                    // ── VALUE LEAD: Strong hands that benefit from building pot ──
                    if (handEval.strength >= 55) {
                        let oopLeadFreq = 0.45;
                        let valuLeadSize = boardWet === 'wet' ? 0.60 : 0.50;
                        // Wet board = lead for protection
                        if (boardWet === 'wet') oopLeadFreq += 0.10;
                        // Scare card = credible lead
                        if (scareLevel >= 1) oopLeadFreq += 0.08;
                        // Board evolution: runout favors our range
                        if (boardEvolution.evolution === 'caller_favorable') oopLeadFreq += 0.10;
                        if (boardEvolution.evolution === 'pfr_favorable') oopLeadFreq -= 0.10;

                        // ═══ LIVE-READ OOP VALUE LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // They checked back flop (high c-bet player) → capped → lead more
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) oopLeadFreq += 0.08;
                            // Calling station → lead for value with bigger sizing
                            if (liveRead.callFreq > 0.55) {
                                oopLeadFreq += 0.06;
                                valuLeadSize = Math.min(0.70, valuLeadSize + 0.08);
                            }
                            // High fold freq → smaller lead to save chips when folding to raise
                            if (liveRead.foldFreq > 0.50) valuLeadSize = Math.max(0.40, valuLeadSize - 0.06);
                        }

                        oopLeadFreq = Math.max(0.20, Math.min(0.75, oopLeadFreq));
                        if (Math.random() < oopLeadFreq) {
                            console.log(`[HorseBrain] 🏋 OOP TURN LEAD (value): str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * valuLeadSize)) };
                        }
                    }
                    // ── PROTECTION LEAD: Medium hands on wet boards ──
                    if (handEval.strength >= 35 && handEval.strength < 55 && boardWet === 'wet') {
                        let protectLeadFreq = 0.25;
                        let protectSize = 0.45;
                        if (drawEq.outs >= 4) protectLeadFreq += 0.08; // We're vulnerable
                        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) protectLeadFreq += 0.10;

                        // ═══ LIVE-READ OOP PROTECTION LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // Against players with many draws (check-behind on wet = drawing)
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60) {
                                protectLeadFreq += 0.08; // They checked = weak → protect + charge
                            }
                            // Against stations: lead bigger for value/protection
                            if (liveRead.callFreq > 0.55) protectSize = Math.min(0.55, protectSize + 0.06);
                        }

                        protectLeadFreq = Math.max(0, Math.min(0.45, protectLeadFreq));
                        if (Math.random() < protectLeadFreq) {
                            console.log(`[HorseBrain] 🏋 OOP TURN LEAD (protect): str=${handEval.strength} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * protectSize)) };
                        }
                    }
                    // ── BLUFF LEAD: Air + blockers on favorable runout ──
                    if (handEval.strength < 20 && aggressionBias > 0) {
                        let bluffLeadFreq = 0.12 + aggressionBias / 60;
                        let bluffLeadSize = 0.55;
                        if (scareLevel >= 2) bluffLeadFreq += 0.10;
                        if (boardEvolution.evolution === 'caller_favorable') bluffLeadFreq += 0.06;
                        if (oppFoldFreq > 0.45 && oppConfidence > 0.3) bluffLeadFreq += 0.08;
                        if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffLeadFreq = 0;

                        // ═══ LIVE-READ OOP BLUFF LEAD (Phase 19) ═══
                        if (liveRead && liveRead.confidence >= 0.20) {
                            // They checked back flop → if high c-bet% player, range is VERY weak
                            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) {
                                bluffLeadFreq += 0.10; // They always c-bet → check = nothing
                            }
                            // High fold frequency → bluff lead is very profitable
                            if (liveRead.foldFreq > 0.50) {
                                bluffLeadFreq += 0.06;
                                bluffLeadSize = Math.max(0.40, bluffLeadSize - 0.08); // Smaller saves chips
                            }
                            // Low WTSD → they give up easily
                            if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffLeadFreq += 0.06;
                            // Calling station → NEVER bluff lead
                            if (liveRead.callFreq > 0.60) bluffLeadFreq = 0;
                        }

                        bluffLeadFreq = Math.max(0, Math.min(0.30, bluffLeadFreq));
                        if (Math.random() < bluffLeadFreq) {
                            console.log(`[HorseBrain] 🏋 OOP TURN LEAD (bluff): str=${handEval.strength} scare=${scareLevel} live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                            return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * bluffLeadSize)) };
                        }
                    }
                }
            }

            // ── BLUFF: Bet missed draws on favorable boards to represent improvement ──
            if (handEval.strength < 20 && canRaise && !multiway) {
                let bluffFreq = 0.18 + aggressionBias / 50 + posFreqMod.ipBluffBoost + posFreqMod.turnBarrelOOPPenalty;

                // ═══ BLOCKER-BASED TURN BLUFF WEIGHTING ═══
                // Turn bluffs with blockers are far more profitable — opponent has fewer
                // value combos so they fold at higher frequency and we risk less.
                if (blocksNutFlush) bluffFreq += 0.12;
                if (blocksSecondNutFlush) bluffFreq += 0.08;
                if (blocksTopSet) bluffFreq += 0.06;
                if (blocksOverpair) bluffFreq += 0.05;
                if (blocksStraight) bluffFreq += 0.06;

                // Blocker combo bonus (same as river logic)
                const turnBluffBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (turnBluffBlockerCount >= 2) bluffFreq += 0.06;

                // ═══ NARRATIVE-DRIVEN BLUFF CREDIBILITY ═══
                // If we c-bet flop, turn barrel bluff is a continuation of our story
                if (narrative.heroBetFlop && narrative.storyIsConsistent) {
                    bluffFreq += 0.08; // Our story says "I have it" — keep selling
                }
                // If we checked flop, a turn bet with air is a delayed c-bet bluff
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    bluffFreq += 0.05; // Delayed c-bet bluff — credible but weaker
                }
                // If we haven't shown aggression at all, bluffing now looks suspicious
                if (!narrative.heroBetFlop && !heroIsAggressor) {
                    bluffFreq -= 0.06; // No story to tell
                }
                // No blockers + no story = terrible bluff candidate
                if (turnBluffBlockerCount === 0 && !narrative.storyIsConsistent) {
                    bluffFreq -= 0.08;
                }
                bluffFreq += narrativeAggrMod / 50;

                // ═══ BOARD + AGGRESSOR STATUS ═══
                if (heroIsAggressor && boardFavorsPFR) bluffFreq += 0.10;
                // Scare card on turn = great bluff opportunity
                if (scareLevel >= 1 && turnBluffBlockerCount >= 1) bluffFreq += 0.06;
                // Board paired on turn — represent trips
                if (newCardPairedBoard) bluffFreq += 0.05;

                // ═══ PHASE 36C: BOARD EVOLUTION-DRIVEN TURN BLUFF (merged — was duplicated) ═══
                // The turn card's impact on the board drives bluff credibility.
                // Draw completing = aggressor can rep it. Bricked draws = mixed effect.
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    bluffFreq += 0.10; // Turn completed a draw — we rep having it
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    // Two competing effects:
                    // (1) Opponent's semi-bluffs are now air → their overall range is weaker
                    // (2) Their CALLING range has more showdown value → they're stickier
                    // Net: slight negative unless we have blockers to their value hands
                    if (turnBluffBlockerCount >= 2) {
                        bluffFreq += 0.02; // Blockers + bricked draws = still profitable
                    } else {
                        bluffFreq -= 0.03; // Stickier calling range outweighs weaker overall range
                    }
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    bluffFreq += 0.06; // Runout favors our perceived range → credible barrel
                }
                if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    bluffFreq -= 0.10; // Runout helped their range → bad bluff spot
                }
                if (boardEvolution.evolution === 'static_brick') {
                    if (heroIsAggressor) {
                        bluffFreq += 0.04; // Brick = safe to continue barreling
                    } else {
                        bluffFreq -= 0.06; // Blank card, non-aggressor bluff is uncredible
                    }
                }

                // Against over-folders, bluff more
                if (oppFoldFreq > 0.50 && oppConfidence > 0.25) bluffFreq += 0.08;
                // Against calling stations, don't bluff
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) bluffFreq = 0;

                // ═══ PHASE 15: CURRENT-ACTION TIMING TELL → BLUFF ADJUSTMENT ═══
                // Opponent's timing on THIS action tells us how they feel about their hand.
                if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
                    if (currentActionTimingTell === 'tank_call') {
                        // Tank-call on prior street = marginal hand → barrel them off
                        bluffFreq += 0.08;
                    } else if (currentActionTimingTell === 'snap_call') {
                        // Snap-call = committed/strong → reduce bluffing
                        bluffFreq -= 0.06;
                    } else if (currentActionTimingTell === 'deliberate') {
                        // Took a bit long = not auto-strength → slight barrel boost
                        bluffFreq += 0.03;
                    }
                }

                // ═══ SPR-DRIVEN BLUFF ADJUSTMENT ═══
                // Low SPR = bluffs are too expensive (committing chips with air)
                // High SPR = bluffs have better risk:reward (small bet relative to stacks)
                bluffFreq *= sprStrategy.bluffMult;

                // ═══ COMMITMENT-DRIVEN BLUFF ADJUSTMENT ═══
                // If we're already heavily invested, bluffing the turn is LESS valuable:
                // - We've already spent chips, so folding loses our investment
                // - But bluffing ADDS more investment with no equity
                // - Better to check and see a free river (if IP) or fold to pressure
                // Exception: if our story demands a barrel, bluff to maintain credibility
                if (isHeavilyCommitted && narrative.barrelsInARow < 1) {
                    bluffFreq *= 0.50; // Heavily committed with no story → don't bluff
                }
                if (isModeratelyCommitted && turnBluffBlockerCount === 0) {
                    bluffFreq *= 0.70; // Moderate investment + no blockers → reduce bluffs
                }

                // ═══ 3-BET POT TURN BLUFF ═══
                // 3-bet pots: opponent has a strong range → bluffs succeed less often
                if (is3BetPot) bluffFreq *= 0.45; // Nearly halve bluffs
                if (is4BetPot) bluffFreq = 0; // Never bluff on turn in 4-bet pots

                // ═══ LIVE-READ TURN BLUFF FREQUENCY (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    if (liveRead.foldFreq > 0.55) bluffFreq += 0.06;
                    if (liveRead.foldFreq < 0.30) bluffFreq -= 0.08;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffFreq += 0.06;
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffFreq += 0.05;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffFreq -= 0.06;
                    if (liveRead.callFreq > 0.60) bluffFreq = Math.min(bluffFreq, 0.05);
                }

                // GTO cap: turn bluffs should not exceed ~40% even with max blockers + favorable reads
                bluffFreq = Math.max(0, Math.min(0.40, bluffFreq));

                if (Math.random() < bluffFreq) {
                    // ═══ BLOCKER-AWARE TURN BLUFF SIZING ═══
                    let turnBluffFrac = 0.55 * sprStrategy.sizeMult; // SPR-adjusted
                    // With premium blockers, can go bigger (opponent folds more)
                    if (turnBluffBlockerCount >= 2 && oppFoldFreq > 0.40) {
                        turnBluffFrac = 0.66 + Math.random() * 0.14; // 66-80% pot
                    }
                    // Against weak-tight, overbet to max fold equity
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3 && turnBluffBlockerCount >= 1) {
                        turnBluffFrac = 0.75 + Math.random() * 0.25; // 75-100% pot
                    }
                    // ═══ PHASE 36C: BOARD EVOLUTION-DRIVEN TURN BLUFF SIZING ═══
                    // When repping a completed draw, size bigger (our "value" range would overbet)
                    if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                        turnBluffFrac = Math.min(0.85, turnBluffFrac + 0.10);
                    }
                    // PFR-favorable runout + aggressor = size up for credibility
                    if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                        turnBluffFrac = Math.min(0.80, turnBluffFrac + 0.06);
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN BLUFF SIZING ═══
                    // Size bluffs for MAXIMUM fold equity based on what we know about opponent.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Against folders: size UP → maximize fold equity
                        if (liveRead.foldFreq > 0.50) {
                            turnBluffFrac = Math.min(0.90, turnBluffFrac + 0.12);
                        }
                        // Against stations: size DOWN → minimize loss when caught
                        if (liveRead.callFreq > 0.55) {
                            turnBluffFrac = Math.max(0.40, turnBluffFrac - 0.10);
                        }
                        // Opponent folds to raises a lot → go bigger
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            turnBluffFrac = Math.min(0.95, turnBluffFrac + 0.10);
                        }
                        // Tank-call from opponent on prior street → they're marginal → size up
                        if (currentActionTimingTell === 'tank_call') {
                            turnBluffFrac = Math.min(0.85, turnBluffFrac + 0.08);
                        }
                    }

                    console.log(`[HorseBrain] 🎭 TURN BLUFF: ${handStr} blockers=${turnBluffBlockerCount} story=${narrative.suggestedLine} opp=${oppTendency} — ${Math.round(turnBluffFrac * 100)}% pot`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * turnBluffFrac)) };
                }
            }

            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ═══ FACING A BET ON TURN ═══

        // ═══ FACING A RAISE ON TURN (Hero bet, got raised) ═══
        // When hero already bet this street and opponent raises, the dynamic changes:
        // - Opponent's raising range is very strong (they raised a bet, not just bet into a check)
        // - Our range is ALSO strong (we already bet, showing strength)
        // - Key decision: commit with value, call with draws/sets, fold overvalued hands
        // Detection: narrative shows we bet turn AND we're now facing a call amount
        const heroAlreadyBetTurn = narrative.heroBetTurn && facingBet;
        const facingTurnRaise = heroAlreadyBetTurn && betToPot >= 0.45;
        if (facingTurnRaise) {
            // ═══ LIVE-READ FACING TURN RAISE (Phase 22) ═══
            // Opponent raised our turn bet — their range is polarized (nuts or bluff).
            // Live data tells us HOW OFTEN they raise (check-raise frequency) to calibrate.
            let turnRaiseLiveAdj = 0; // Positive = call wider, negative = fold more
            if (liveRead && liveRead.confidence >= 0.20) {
                // High check-raise % → they raise a lot → range is wider → call wider
                if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) turnRaiseLiveAdj += 6;
                // Low check-raise % → rare raiser → they have it → fold more
                if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct < 0.05) turnRaiseLiveAdj -= 8;
                // High aggression → they raise wide → call wider
                if (liveRead.aggFreq > 0.45) turnRaiseLiveAdj += 4;
                // Low aggression → passive player raising = real → fold more
                if (liveRead.aggFreq < 0.20) turnRaiseLiveAdj -= 6;
                // Timing: snap-raise = polarized (auto-bluff or nuts)
                if (currentActionTimingTell === 'snap_aggression' && blocksNutFlush) turnRaiseLiveAdj += 5;
                if (currentActionTimingTell === 'snap_aggression' && !blocksNutFlush) turnRaiseLiveAdj -= 2;
                // Tank-raise = usually very strong (deliberated then committed)
                if (currentActionTimingTell === 'tank_aggression') turnRaiseLiveAdj -= 5;
            }

            // ── NUTS: Re-raise (4-bet the turn) ──
            if (handEval.strength >= 85 && canRaise) {
                const potAfterCall = potSize + toCall * 2;
                const geoJam = getGeometricSizing(potAfterCall, heroStack - toCall, 1, true);
                if (geoJam.isJammable && spr <= 4) {
                    return { type: 'all_in' };
                }
                let reRaiseMult = 2.5 + Math.random() * 0.5;
                // Live: against stations, size up
                if (liveRead && liveRead.callFreq > 0.55) reRaiseMult = Math.min(3.5, reRaiseMult * 1.10);
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * reRaiseMult)) };
            }
            // ── STRONG HANDS (sets, two pair, overpair): Call and re-evaluate river ──
            if (handEval.strength >= (60 - turnRaiseLiveAdj)) {
                // Against weak-tight raisers: lean fold (they have the nuts)
                if (oppTendency === 'weak-tight' && oppConfidence > 0.4 && handEval.strength < (75 - turnRaiseLiveAdj)) {
                    console.log(`[HorseBrain] 🎯 TURN vs RAISE FOLD: opp=weak-tight raiser, str=${handEval.strength} liveAdj=${turnRaiseLiveAdj}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
                // Draws completed → be cautious
                if (boardEvolution.drawsCompleted.length > 0 && handEval.strength < 70) {
                    const weHaveDraw = handEval.category?.includes('flush') || handEval.category?.includes('straight');
                    if (!weHaveDraw) {
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // ── DRAWS: Call with massive draws (14+ outs), fold the rest ──
            if (drawEq.outs >= 14 && canCall) {
                return { type: 'call' }; // Combo draw vs raise — implied odds massive
            }
            if (drawEq.outs >= 10 && canCall && betToPot <= 0.60) {
                return { type: 'call' }; // Strong draw + reasonable odds
            }
            // ── MEDIUM/WEAK: Fold (raise over our bet = strong range) ──
            if (handEval.strength >= 45 && betToPot <= 0.45 && canCall) {
                return { type: 'call' }; // Min-raise → call wider
            }
            console.log(`[HorseBrain] 🚫 TURN vs RAISE FOLD: str=${handEval.strength} outs=${drawEq.outs} betToPot=${Math.round(betToPot * 100)}%`);
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ── POT COMMITTED: Jam ──
        if (isPotCommitted && handEval.strength >= 45) {
            if (canRaise) return { type: 'all_in' };
            if (canCall) return { type: 'call' };
        }

        // ── OOP MATRIX: structured check-call/check-raise for OOP turn decisions ──
        if (!isIP && oppConfidence >= 0.25) {
            const turnOopDecision = getOOPDecisionMatrix({
                handStrength: handEval.strength,
                handCategory: handEval.category,
                hasStrongDraw: handEval.hasFlushDraw || handEval.hasOESD,
                hasWeakDraw: handEval.hasGutshot || handEval.hasBackdoorFlush,
                street: 'turn',
                boardWetness: boardWet,
                boardIsPaired: boardPaired,
                boardIsMonotone: maxSuitCount >= 3,
                numPlayers,
                aggressionBias: aggressionBias + narrativeAggrMod,
                oppTendency, oppConfidence, oppCallFreq,
                oppCbetFreq: 0.60,
                heroIsAggressor,
                potSize, toCall, stackBB,
                liveRead  // Phase 28: pass live-read to OOP matrix
            });

            // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration ═══
            // OOP check-raises more than IP by design — apply the systematic boost
            const turnCRFreq = turnOopDecision.action === 'check_raise'
                ? Math.min(0.80, turnOopDecision.frequency + posFreqMod.oopCheckRaiseBoost)
                : turnOopDecision.frequency;

            if (turnOopDecision.action === 'check_raise' && canRaise && Math.random() < turnCRFreq) {
                const crSize = Math.round(toCall * (turnOopDecision.sizeFraction || 3.0));
                console.log(`[HorseBrain] 🎲 TR-OOP MATRIX: turn check-raise (${turnOopDecision.reason}) freq=${Math.round(turnCRFreq * 100)}%`);
                return { type: raiseAction.type, amount: clampAmt(crSize) };
            }
            if (turnOopDecision.action === 'check_fold') {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // check_call and lead fall through to the existing turn logic below
        }

        // ── MONSTERS: Raise for value (geometric sizing to set up river jam) ──
        if (handEval.strength >= 80 && canRaise) {
            // Use geometric sizing: calculate raise that sets up a natural river all-in
            const afterCallStack = heroStack - toCall;
            const potAfterCall = potSize + toCall * 2;
            const geoRiver = getGeometricSizing(potAfterCall, afterCallStack, 1, true);

            // The raise should make the pot such that river jam is natural
            let raiseMult = 2.5 + Math.random() * 0.5;

            // If geometric sizing suggests we can jam river after a specific raise
            if (spr >= 3 && spr <= 15) {
                // Calculate: we raise to X, opponent calls, pot = potAfterCall + 2*(X-toCall)
                // Then river: geoRiver.sizeFraction * newPot should ≈ remaining stack
                // Solve backwards: pick raise size that creates right river SPR
                const targetRiverSPR = 1.5; // Want ~1.5 SPR going into river for easy jam
                const idealRaise = (heroStack / (1 + targetRiverSPR * 2) - potSize) / 2 + toCall;
                if (idealRaise > toCall * 2) {
                    raiseMult = idealRaise / toCall;
                }
            }

            // Against calling stations, raise bigger
            if (oppCallFreq > 0.60 && oppConfidence > 0.3) raiseMult = Math.min(4.0, raiseMult * 1.15);
            // Against nits, smaller raise to keep them in
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) raiseMult = Math.max(2.2, raiseMult * 0.85);

            // ═══ LIVE-READ TURN RAISE SIZING (Phase 30) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Station → bigger raise to extract max value
                if (liveRead.callFreq > 0.60) raiseMult = Math.min(4.0, raiseMult * 1.10);
                // Folder → smaller raise to keep them in
                if (liveRead.foldFreq > 0.55) raiseMult = Math.max(2.2, raiseMult * 0.88);
                // High WTSD → they go to showdown, can size up
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) raiseMult = Math.min(3.8, raiseMult * 1.06);
                // Snap-call timing → committed, size up
                if (currentActionTimingTell === 'snap_call') raiseMult = Math.min(4.0, raiseMult * 1.08);
                // Tank-call → marginal, standard sizing fine
                if (currentActionTimingTell === 'tank_call') raiseMult = Math.max(2.3, raiseMult * 0.95);
            }

            // When toCall=0 (we're first to act / betting), use pot-fraction sizing instead
            const raiseSize = toCall > 0
                ? Math.round(toCall * raiseMult)
                : Math.round(potSize * (0.66 + Math.random() * 0.17)); // 66-83% pot bet
            return { type: raiseAction.type, amount: clampAmt(raiseSize) };
        }

        // ── STRONG HANDS: Call (sometimes raise with sets+) ──
        // ═══ 3-BET POT: Lower the strong hand threshold (top pair is premium in 3-bet pots) ═══
        const turnStrongThreshold = is3BetPot ? 48 : is4BetPot ? 40 : 55;
        if (handEval.strength >= turnStrongThreshold) {
            // Raise for protection on wet boards with vulnerable hands
            if (canRaise && boardWet === 'wet' && handEval.strength >= 65 && Math.random() < 0.30) {
                const raiseSize = Math.round(toCall * 2.5);
                return { type: raiseAction.type, amount: clampAmt(raiseSize) };
            }
            // ═══ 3-BET POT: Commit faster with strong hands (low SPR) ═══
            if ((is3BetPot || is4BetPot) && canRaise && handEval.strength >= 60 && spr <= 4) {
                return { type: 'all_in' }; // Low SPR in 3-bet/4-bet pot → jam
            }
            // ═══ OPPONENT-AWARE: Fold strong-ish hands vs very tight opponents in heavy pots ═══
            // If opponent has been building a huge pot and their range is strong, re-evaluate
            const liveNitTurnLaydown = liveRead && liveRead.confidence >= 0.30 &&
                liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
            if (oppRangeStrength === 'polarized' && (oppTendency === 'weak-tight' || liveNitTurnLaydown) && handEval.strength < 65) {
                // Weak-tight player in a massive pot = they have it
                // But in 3-bet pots, their range is already strong so this is less reliable
                // ═══ LIVE-READ TURN LAYDOWN OVERRIDE (Phase 30) ═══
                // If live-read shows they're actually aggressive, DON'T auto-laydown
                const liveAggroOverride = liveRead && liveRead.confidence >= 0.25 && liveRead.aggFreq > 0.35;
                if ((oppConfidence > 0.4 || liveNitTurnLaydown) && betToPot >= 0.60 && !is3BetPot && !liveAggroOverride) {
                    console.log(`[HorseBrain] 🎯 TURN LAYDOWN: strong hand (${handEval.strength}) but opp is weak-tight in polarized pot liveNit=${liveNitTurnLaydown}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }

            // ═══ BOARD EVOLUTION-DRIVEN TURN CALL/FOLD ═══
            // The runout character should heavily influence our call/fold decisions
            if (boardEvolution.drawsCompleted.length > 0 && handEval.strength < 70) {
                // A draw completed on the turn — opponent could have it
                // If we don't have the completed draw ourselves, lean toward folding
                const weHaveCompletedDraw = handEval.category?.includes('flush') || handEval.category?.includes('straight');
                if (!weHaveCompletedDraw && betToPot >= 0.60) {
                    // Big bet on draw-completing turn = fold marginal hands
                    if (handEval.strength < 60 && !blocksNutFlush) {
                        console.log(`[HorseBrain] 🌊 TURN FOLD: draw completed, no blockers, str=${handEval.strength}`);
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
            }
            // Bricked draws = opponent's semi-bluffs missed → be stickier
            if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0 && handEval.strength >= 40) {
                // Opponent bet but draws bricked — their semi-bluffs are now pure bluffs
                // We should call wider here as bluff-catcher
                // (no action needed — just don't fold; the fold logic below handles it)
            }

            // ═══ NARRATIVE-DRIVEN TURN CALL/FOLD ADJUSTMENTS ═══
            // Opponent barrel-barrel = polarized range → use hand strength + blockers
            if (narrative.barrelsInARow >= 2 && handEval.strength < 65) {
                // Opponent has double-barreled, their range is strong or bluff
                // With blockers to their value range, lean toward calling
                const hasBlockers = blocksTopSet || blocksOverpair || blocksNutFlush;
                if (!hasBlockers && oppTendency !== 'bluffy') {
                    // No blockers + opponent isn't known bluffer → fold marginal strong hands
                    if (betToPot >= 0.60 && oppConfidence > 0.3) {
                        console.log(`[HorseBrain] 📖 TURN NARRATIVE FOLD: double-barrel, no blockers, str=${handEval.strength}`);
                        return canCheck ? { type: 'check' } : { type: 'fold' };
                    }
                }
            }
            // Hero was aggressive earlier → calling feels natural (continuing hand defense)
            // No adjustment needed — just call
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── DRAWING HANDS: Equity math + implied odds ──
        if (drawEq.outs >= 6) {
            const drawEquityPct = Math.min(drawEq.outs * 2.2, 45) / 100;
            const rioCheck = detectReverseImplied(drawEq.outs, potOdds, stackBB, numPlayers, boardWet === 'wet');

            // RIO guard: don't chase non-nut draws on scary boards
            if (rioCheck.shouldBlock && !handEval.hasFlushDraw) {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // Direct odds: call if equity exceeds pot odds
            // SPR bonus: deep stacks = implied odds make marginal draws profitable
            const sprDrawBonus = sprStrategy.drawOddsBonus;
            if (drawEquityPct >= potOdds - 0.05 - sprDrawBonus) {
                // Semi-bluff raise with massive combo draws (14+ outs)
                if (canRaise && drawEq.outs >= 14 && Math.random() < 0.40 * (multiway ? mwAdj.bluffReduction : 1.0)) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * 2.5)) };
                }
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // Implied odds: call with strong draws if deep stacked
            // Against calling stations, implied odds are HIGHER (they pay off when we hit)
            let impliedOddsThreshold = 0.50;
            if (oppCallFreq > 0.55 && oppConfidence > 0.25) impliedOddsThreshold = 0.60;
            // ═══ LIVE-READ TURN IMPLIED ODDS (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Stations: better implied odds
                if (liveRead.callFreq > 0.55) impliedOddsThreshold += 0.08;
                // High WTSD: they go to showdown → great implied odds
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) impliedOddsThreshold += 0.06;
                // Folders: worse implied (they fold when board completes)
                if (liveRead.foldFreq > 0.55) impliedOddsThreshold -= 0.08;
            }
            if (isDeep && drawEq.outs >= 9 && (handEval.hasFlushDraw || drawEq.outs >= 12)) {
                if (canCall && betToPot < impliedOddsThreshold) return { type: 'call' };
            }
        }

        // ── CHECK-RAISE on turn (OOP trap — upgraded with narrative + blockers) ──
        // This handles the case where we checked, opponent bet, and we want to raise.
        // Three check-raise types: value (monsters), semi-bluff (draws), and bluff (air + blockers).
        if (!isIP && canRaise) {

            // ═══ PHASE 16: LIVE-READ DRIVEN CHECK-RAISE STRATEGY ═══
            // Pre-compute live exploits for all check-raise types
            let liveCRBoost = 0;   // Additive to check-raise frequency
            let liveCRSizeMod = 1.0; // Multiplicative to check-raise sizing
            if (liveRead && liveRead.confidence >= 0.20) {
                // Opponent c-bets too much → check-raise MORE (they bet wide, so CR prints money)
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.70) {
                    liveCRBoost += 0.10;
                }
                // Opponent c-bets rarely → they only bet strong → CR less
                if (liveRead.cBetPct !== null && liveRead.cBetPct < 0.40) {
                    liveCRBoost -= 0.08;
                }
                // Opponent folds to raises often → CR bluff more
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                    liveCRBoost += 0.08;
                }
                // Opponent double-barrels rarely (one-and-done) → don't CR, just call and take it away on river
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                    liveCRBoost -= 0.06; // Float is better than CR vs one-and-done
                }
                // Sizing: against stations, CR bigger. Against folders, CR standard.
                if (liveRead.callFreq > 0.55) liveCRSizeMod = 1.12;
                if (liveRead.foldFreq > 0.50) liveCRSizeMod = 0.92;
                // Timing: opponent snap-bet → they're on autopilot → CR is very profitable
                if (currentActionTimingTell === 'snap_aggression') {
                    liveCRBoost += 0.08;
                }
                // Timing: opponent tanked and bet → they're considering fold → CR folds them out
                if (currentActionTimingTell === 'tank_aggression') {
                    liveCRBoost += 0.06;
                }
            }

            // VALUE CHECK-RAISE: Monsters (sets+, strong two pair)
            if (handEval.strength >= 70) {
                let crFreq = 0.35;
                // ═══ OOP CHECK-RAISE BOOST: systematic position adjustment ═══
                crFreq += posFreqMod.oopCheckRaiseBoost; // OOP check-raises more by design
                // Against bluffy opponents, check-raise more often (they bet wide, so we trap wide)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) crFreq = 0.50;
                // Against calling stations, check-raise bigger (they call raises too)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) crFreq = 0.45;
                // ═══ LIVE-READ TURN VALUE CR (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggro opponents bet wide — CR traps print
                    if (liveRead.aggFreq > 0.45) crFreq += 0.08;
                    // High c-bet rate: they'll fire, perfect for CR
                    if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60) crFreq += 0.06;
                    // Passive opponents rarely bet — CR is less valuable
                    if (liveRead.aggFreq < 0.20) crFreq -= 0.10;
                    // Timing: snap bet = auto-cbet, easy CR target
                    if (currentActionTimingTell === 'snap_aggression') crFreq += 0.06;
                }
                // Narrative: if we checked flop and now check-raise turn = classic trap line
                if (narrative.heroCheckedFlop) crFreq += 0.08;
                // Narrative: if we've been passive, sudden aggression gets paid
                if (narrative.checkBehindCount >= 1) crFreq += 0.06;
                // Board texture: on wet boards, check-raise for protection + value
                if (boardWet === 'wet') crFreq += 0.05;
                // Dry boards: can slow-play more, less urgency to check-raise
                if (boardWet === 'dry' && scareLevel === 0) crFreq -= 0.05;
                // ═══ 3-BET POT: Check-raise more for value (opponent's range connects often) ═══
                if (is3BetPot) crFreq += 0.08;
                // ═══ COMMITMENT: If heavily invested, check-raise to protect investment ═══
                if (isHeavilyCommitted) crFreq += 0.05;

                crFreq += liveCRBoost; // PHASE 16: Live-read CR boost
                crFreq = Math.max(0.15, Math.min(0.65, crFreq));
                if (Math.random() < crFreq) {
                    // Geometric sizing: check-raise size that sets up river jam
                    const potAfterCR = potSize + toCall * 2; // pot after we call + their bet
                    const geoSize = getGeometricSizing(potAfterCR, heroStack - toCall, 1, true);
                    let crMult = 2.8;
                    if (geoSize.isJammable && spr >= 3 && spr <= 10) {
                        // Size the check-raise so river jam is natural
                        crMult = Math.max(2.2, Math.min(4.0, geoSize.sizeFraction * 5));
                    }
                    // Against calling stations, raise bigger
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) crMult = Math.min(4.0, crMult * 1.10);
                    crMult *= liveCRSizeMod; // PHASE 16: Live-driven size adjustment
                    const crSize = Math.round(toCall * crMult);
                    console.log(`[HorseBrain] 💎 TURN CHECK-RAISE VALUE: str=${handEval.strength} crMult=${crMult.toFixed(1)}x narrative=${narrative.suggestedLine}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
            }

            // SEMI-BLUFF CHECK-RAISE: Strong draws (12+ outs, nut draws)
            if (drawEq.outs >= 12 && handEval.strength < 55) {
                let semiCRFreq = 0.25 + aggressionBias / 40;
                semiCRFreq += posFreqMod.oopCheckRaiseBoost; // OOP systematic boost
                // Nut draws: check-raise more aggressively
                if (handEval.hasFlushDraw && blocksNutFlush) semiCRFreq += 0.10; // We have NFD
                if (handEval.hasOESD && drawEq.outs >= 14) semiCRFreq += 0.08; // Combo draw
                // Against over-folders, semi-bluff CR is very profitable
                if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiCRFreq += 0.10;
                // Against calling stations, don't semi-bluff CR (they call)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) semiCRFreq = 0;
                // ═══ LIVE-READ TURN SEMI-BLUFF CR (Phase 23) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Live fold-to-raise: semi-bluff CR is very profitable
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) semiCRFreq += 0.10;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.25) semiCRFreq -= 0.12;
                    // Live calling station: hard block on semi-bluff CR
                    if (liveRead.callFreq > 0.65) semiCRFreq = Math.min(semiCRFreq, 0.05);
                    // Timing: snap bet = weak auto-cbet, prime target
                    if (currentActionTimingTell === 'snap_aggression') semiCRFreq += 0.06;
                }
                // Narrative: if we've been passive, CR is unexpected = more fold equity
                if (narrative.heroCheckedFlop && !narrative.heroBetFlop) semiCRFreq += 0.06;
                // ═══ 3-BET POT: Less semi-bluff CR (opponent's range is strong, less fold equity) ═══
                if (is3BetPot) semiCRFreq *= 0.60;
                semiCRFreq += liveCRBoost * 0.8; // PHASE 16: Live boost (slightly less than value CR)
                semiCRFreq = Math.max(0, Math.min(0.50, semiCRFreq));

                if (Math.random() < semiCRFreq) {
                    let crSize = Math.round(toCall * (2.5 + Math.random() * 0.5) * liveCRSizeMod);
                    console.log(`[HorseBrain] 🌊 TURN SEMI-BLUFF CR: outs=${drawEq.outs} str=${handEval.strength}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
            }

            // BLUFF CHECK-RAISE: Air with blockers (skilled aggressive horses only)
            if (handEval.strength < 15 && aggressionBias > 3 && !multiway) {
                const crBlockerCount = [blocksNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (crBlockerCount >= 1) {
                    let bluffCRFreq = 0.08 + aggressionBias / 60 + posFreqMod.oopCheckRaiseBoost * 0.5;
                    // Need blockers to value range
                    if (crBlockerCount >= 2) bluffCRFreq += 0.08;
                    // Against over-folders, bluff CR is profitable
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.10;
                    // Against calling stations, never bluff CR
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) bluffCRFreq = 0;
                    // ═══ LIVE-READ TURN BLUFF CR (Phase 23) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Live fold-to-raise is THE stat for bluff CRs
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffCRFreq += 0.10;
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.30) bluffCRFreq = Math.min(bluffCRFreq, 0.02);
                        // Live station auto-block
                        if (liveRead.callFreq > 0.60) bluffCRFreq = 0;
                        // WTSD: low = they fold a lot on later streets
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffCRFreq += 0.06;
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffCRFreq = Math.min(bluffCRFreq, 0.03);
                    }
                    // Narrative: credible line helps
                    if (narrative.heroCheckedFlop && heroIsAggressor) bluffCRFreq += 0.04; // Delayed trap line
                    // Scare card on turn helps
                    if (scareLevel >= 1) bluffCRFreq += 0.05;
                    bluffCRFreq += liveCRBoost; // PHASE 16: Live-driven bluff CR boost
                    bluffCRFreq = Math.max(0, Math.min(0.25, bluffCRFreq));

                    if (Math.random() < bluffCRFreq) {
                        const crSize = Math.round(toCall * (2.8 + Math.random() * 0.4) * liveCRSizeMod);
                        console.log(`[HorseBrain] 🎭 TURN BLUFF CR: blockers=${crBlockerCount} opp=${oppTendency} scare=${scareLevel}`);
                        return { type: raiseAction.type, amount: clampAmt(crSize) };
                    }
                }
            }
        }

        // ── MEDIUM HANDS: Call with good odds ──
        // ═══ 3-BET POT: Medium hands are more valuable (ranges are narrow) ═══
        const turnMediumThreshold = is3BetPot ? 30 : 35;
        if (handEval.strength >= turnMediumThreshold && potOdds < 0.25) {
            // Tighter multiway
            if (multiway && handEval.strength < 45) return canCheck ? { type: 'check' } : { type: 'fold' };

            // ═══ NARRATIVE-DRIVEN MEDIUM HAND ADJUSTMENTS ═══
            // Opponent barrel-barrel with a medium hand and no blockers → lean fold
            if (narrative.barrelsInARow >= 2 && handEval.strength < 45 && oppConfidence > 0.3) {
                const hasBlockers = blocksTopSet || blocksOverpair || blocksNutFlush;
                if (!hasBlockers && oppTendency !== 'bluffy') {
                    // ═══ LIVE-READ TURN MEDIUM HAND FOLD (Phase 23) ═══
                    // Override: if opponent is a known bluffer, don't fold medium hands
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.aggFreq > 0.45 || (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30)) {
                            // Don't auto-fold vs aggro player — peel with medium hands
                            return canCall ? { type: 'call' } : { type: 'fold' };
                        }
                        // Very tight player double-barreling = strong — fold even wider
                        if (liveRead.aggFreq < 0.20 && handEval.strength < 42) {
                            return canCheck ? { type: 'check' } : { type: 'fold' };
                        }
                    }
                    console.log(`[HorseBrain] 📖 TURN MEDIUM FOLD: double-barrel, medium hand (${handEval.strength}), no blockers`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // ═══ LIVE-READ TURN MEDIUM CALL ADJUSTMENT (Phase 23) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // Against one-and-done players: call more (they'll check river)
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                    // Always peel vs one-and-done with any medium hand
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
                // Against aggressive barrelors: tighten up
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.60 && handEval.strength < 42) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // If opponent only bet once (single barrel), medium hands are fine to peel
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── FLOAT in position (skilled aggressive horses) ──
        if (isIP && handEval.strength >= 20 && betToPot <= 0.50 && !multiway && isAggressive) {
            let floatFreq = 0.22;
            // Float more against weak-tight players (they give up on river often)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) floatFreq = 0.35;
            // Float less in heavy pots (opponent more committed)
            if (oppStreetAggression === 'very_heavy') floatFreq = 0.08;

            // ═══ NARRATIVE-DRIVEN FLOAT ═══
            // Opponent bet flop and turn → they're committed, floating is riskier
            if (narrative.barrelsInARow >= 2) floatFreq = Math.max(0.05, floatFreq - 0.12);
            // Opponent only bet turn after checking flop → weaker range, float more
            if (!narrative.heroBetFlop && narrative.checkBehindCount >= 1) floatFreq += 0.08;

            // ═══ PHASE 16: LIVE-READ DRIVEN FLOAT STRATEGY ═══
            // Float is extremely profitable against "one-and-done" players
            // who c-bet flop but check turn. We call their c-bet, then take the pot.
            if (liveRead && liveRead.confidence >= 0.20) {
                // ONE-AND-DONE: c-bets a lot but rarely double-barrels → FLOAT HEAVILY
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
                    liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.35) {
                    floatFreq = Math.min(0.55, floatFreq + 0.18); // Massive float boost
                }
                // Opponent gives up easily (low WTSD) → float more
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                    floatFreq = Math.min(0.50, floatFreq + 0.12);
                }
                // Opponent goes to showdown a lot → don't float (they'll call us down)
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) {
                    floatFreq = Math.max(0.05, floatFreq - 0.10);
                }
                // Tank-bet from opponent → unsure → float more (they'll check next street)
                if (currentActionTimingTell === 'tank_aggression') {
                    floatFreq = Math.min(0.50, floatFreq + 0.10);
                }
                // Snap-bet → confident/auto-play → float less (they might barrel again)
                if (currentActionTimingTell === 'snap_aggression') {
                    floatFreq = Math.max(0.10, floatFreq - 0.06);
                }
            }

            floatFreq = Math.max(0, Math.min(0.55, floatFreq));
            if (Math.random() < floatFreq) return canCall ? { type: 'call' } : { type: 'fold' };
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ════════════════════════════════════════════════════════════════
    //  R I V E R  (where the money is)
    // ════════════════════════════════════════════════════════════════
    if (street === 'river') {
        const oppFoldMod = opponentAdjustment.foldMod || 0;
        const oppCallMod = opponentAdjustment.callMod || 0;
        // ═══ Phase 39B FIX: oppCallMod > 0 now means station (not bluffer), remove from bluffy check ═══
        const oppBluffy = opponentAdjustment.bluffAware || oppTendency === 'bluffy';
        // ═══ Phase 39B FIX: add bluffAware to fold threshold (was relying on inverted callMod) ═══
        const foldThreshold = 30 + oppFoldMod - (opponentAdjustment.bluffAware ? 5 : 0);

        // ═══ COMPUTE TURN-TO-RIVER EQUITY DELTA ═══
        // On river we have both turn and flop evals for comparison
        const turnBoard = board.slice(0, 4);
        const turnEval = evaluatePostflopHand(holeCards, turnBoard);
        const turnToRiverDelta = handEval.strength - turnEval.strength; // Did river help or hurt?

        // ═══ RIVER RANGE POLARIZATION ENGINE ═══
        // GTO principle: on the river, betting ranges should be either POLARIZED or MERGED.
        // POLARIZED: Bet with nuts + bluffs, check everything in between.
        //   → Correct sizing: large (66%+ pot), overbets with nuts.
        //   → When: IP, deep SPR, dry board, opponent has capped range.
        // MERGED: Bet with a wide range of medium+ hands for thin value.
        //   → Correct sizing: small (25-50% pot).
        //   → When: Shallow SPR, opponent weak range, multiway.
        const riverRangeType = (() => {
            // Strong polarization signals
            if (spr <= 3) return 'merged'; // Low SPR: merged (no room for polarized)
            if (isIP && heroHasNutAdvantage && !multiway) return 'polarized';
            if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) return 'polarized';
            if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) return 'polarized';
            // Merged signals
            if (multiway) return 'merged';
            if (isLimpedPot) return 'merged';
            if (!heroIsAggressor && heroRangeCapped) return 'merged';
            if (oppRangeStrength === 'weak') return 'merged';
            // Default: polarized IP, merged OOP
            return isIP ? 'polarized' : 'merged';
        })();

        // Polarization-driven sizing modifier
        const polarSizeMod = riverRangeType === 'polarized' ? 1.15 : 0.80;
        // Polarization-driven bluff frequency (polarized = more bluffs in range)
        const polarBluffMod = riverRangeType === 'polarized' ? 1.15 : 0.60;

        // ═══ NOT FACING A BET ═══
        if (!facingBet) {

            // ── POT COMMITTED: Shove decent hands ──
            if (isPotCommitted && handEval.strength >= 40 && canRaise) {
                return { type: 'all_in' };
            }

            // ── NUTS: OVERBET for maximum value ──
            if (handEval.strength >= 90 && canRaise) {
                // Nut hands should overbet (100-150% pot) to extract max value
                // Against calling stations, overbet BIGGER (they pay off)
                let overbetMax = 0.50 * sprStrategy.overbetMult; // SPR-adjusted: low SPR = bigger overbets
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) overbetMax = 0.80; // Up to 180% pot

                // ═══ NARRATIVE-DRIVEN OVERBET SIZING ═══
                // A consistent aggressive story makes overbets more believable
                if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) {
                    overbetMax += 0.15; // Triple barrel into overbet = polarized + credible
                }
                // Slow-played line (checked earlier streets) → smaller bet, they're suspicious
                if (narrative.checkBehindCount >= 1 && !heroIsAggressor) {
                    overbetMax = Math.max(0.20, overbetMax - 0.20);
                }
                // River improved us (turnToRiverDelta big) → careful not to scare with overbet
                if (turnToRiverDelta > 20) {
                    overbetMax = Math.max(0.30, overbetMax - 0.10); // We hit on river, size down slightly
                }

                // ═══ BOARD EVOLUTION-DRIVEN OVERBET SIZING ═══
                // River completed draws = opponent will pay off if they have second-best
                if (boardEvolution.drawsCompleted.length > 0) {
                    overbetMax += 0.10; // Completed draws = more nutted combos to rep
                }
                // Static brick river = opponent expects value, smaller overbet is correct
                if (boardEvolution.evolution === 'static_brick') {
                    overbetMax = Math.max(0.20, overbetMax - 0.08);
                }
                // PFR-favorable river = aggressor range is strong → overbet with confidence
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    overbetMax += 0.10;
                }

                // ═══ 3-BET POT OVERBET ADJUSTMENT ═══
                // In 3-bet pots, the pot is already large → overbets are less necessary
                // and opponent's range is narrower → they're less likely to have a hand
                // that can call a massive overbet. Use standard value sizing instead.
                if (is3BetPot) {
                    overbetMax = Math.max(0.15, overbetMax * 0.60); // Reduce overbet sizing
                }
                if (is4BetPot) {
                    // In 4-bet pots, just jam (SPR is tiny)
                    if (spr <= 3) return { type: 'all_in' };
                    overbetMax = Math.max(0.10, overbetMax * 0.40);
                }

                // ═══ COMMITMENT-DRIVEN OVERBET ═══
                // If we're heavily committed, an overbet completes the investment.
                // Opponent also reads us as committed → they expect a big bet → overbet is natural.
                if (isHeavilyCommitted && narrative.barrelsInARow >= 1) {
                    overbetMax += 0.08; // Our investment demands follow-through
                }

                // ═══ POLARIZATION OVERBET ═══
                // Polarized range → bigger overbets (we're either nutted or bluffing)
                // Merged range → smaller overbets (our range is condensed)
                overbetMax *= (riverRangeType === 'polarized' ? 1.10 : 0.75);

                // ═══ PHASE 16: LIVE-READ DRIVEN OVERBET SIZING ═══
                // Use live data to fine-tune the overbet — this is where EV lives
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Against calling stations: MAX SIZE overbets — they pay off
                    if (liveRead.callFreq > 0.60) {
                        overbetMax = Math.min(1.0, overbetMax + 0.15);
                    }
                    // Against opponents who fold to overbets (rare overbet scare):
                    // size down to get called, or overbet as bluff only
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                        overbetMax = Math.max(0.10, overbetMax - 0.15); // Don't overbet — they'll fold
                    }
                    // Timing tell: if they snap-called the turn, they're committed → overbet more
                    if (currentActionTimingTell === 'snap_call') {
                        overbetMax = Math.min(1.0, overbetMax + 0.10);
                    }
                    // Timing tell: if they tank-called turn, they're marginal → standard size
                    if (currentActionTimingTell === 'tank_call') {
                        overbetMax = Math.max(0.15, overbetMax - 0.08);
                    }
                }

                const overbetFrac = 1.0 + Math.random() * overbetMax;
                // Against nits, use smaller sizing (they fold to overbets)
                // ═══ LIVE-READ NIT OVERBET SIZING (Phase 29) ═══
                const liveNitOverbet = liveRead && liveRead.confidence >= 0.25 &&
                    liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
                if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || liveNitOverbet) {
                    let nitFrac = 0.66 + Math.random() * 0.14; // 66-80% to get called
                    // ═══ LIVE-READ NIT SIZING REFINEMENT (Phase 29) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Extreme folder → even smaller to get the call
                        if (liveRead.foldFreq > 0.60) nitFrac = Math.max(0.55, nitFrac - 0.10);
                        // If they have high WTSD despite being nitty, they'll call → size up
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.28) nitFrac = Math.min(0.85, nitFrac + 0.06);
                        // Snap-call timing = committed → size up
                        if (currentActionTimingTell === 'snap_call') nitFrac = Math.min(0.90, nitFrac + 0.08);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * nitFrac)) };
                }
                console.log(`[HorseBrain] 💰 RIVER OVERBET: str=${handEval.strength} max=${Math.round(overbetMax * 100)}% polar=${riverRangeType} 3bet=${is3BetPot}`);
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * overbetFrac)) };
            }

            // ── MONSTERS (non-nut): Standard value bet 66-80% pot ──
            if (handEval.strength >= 75 && canRaise) {
                let sizeFrac = (multiway ? Math.max(0.50, 0.60 + mwAdj.adjustSizing * 0.01) : 0.72) * polarSizeMod;
                // Multiway: tighter value range means we can size up more
                if (multiway && mwAdj.valueBetThreshold > 0) {
                    sizeFrac = Math.min(0.80, sizeFrac + 0.08); // Multiway value = bigger sizing
                }
                // Against calling stations, size up
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) sizeFrac = Math.min(0.85, sizeFrac + 0.10);

                // ═══ LIVE-READ MONSTER SIZING (Phase 29) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Calling station → size UP for max value extraction
                    if (liveRead.callFreq > 0.55) sizeFrac = Math.min(0.88, sizeFrac + 0.08);
                    if (liveRead.callFreq > 0.65) sizeFrac = Math.min(0.92, sizeFrac + 0.05);
                    // Folder → size DOWN to get the call
                    if (liveRead.foldFreq > 0.55) sizeFrac = Math.max(0.50, sizeFrac - 0.10);
                    // High WTSD → they go to showdown, size up
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) sizeFrac = Math.min(0.88, sizeFrac + 0.06);
                    // Aggressive opp → check to induce raise, then re-raise
                    if (liveRead.aggFreq > 0.50 && !isIP && handEval.strength >= 80) {
                        // Consider trapping instead of value betting
                        if (Math.random() < 0.35 && canCheck) return { type: 'check' }; // Trap — NEVER fold a monster
                    }
                    // Snap-call timing = committed → bigger sizing
                    if (currentActionTimingTell === 'snap_call') sizeFrac = Math.min(0.90, sizeFrac + 0.06);
                    // Tank-call timing = marginal → standard sizing is fine
                    if (currentActionTimingTell === 'tank_call') sizeFrac = Math.max(0.55, sizeFrac - 0.04);
                }

                // ═══ NARRATIVE-DRIVEN MONSTER SIZING ═══
                // Consistent aggression story → can size up (opponent expects continuation)
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) {
                    sizeFrac = Math.min(0.90, sizeFrac + 0.06);
                }
                // Trapping line (checked earlier) → smaller bet, opponent suspects trap if too big
                if (narrative.checkBehindCount >= 1) {
                    sizeFrac = Math.max(0.55, sizeFrac - 0.08);
                }
                // River card helped us a lot → size down to avoid folding out worse
                if (turnToRiverDelta > 15) {
                    sizeFrac = Math.max(0.55, sizeFrac - 0.05);
                }
                // Use geometric sizing for stack management
                const geoRiver = getGeometricSizing(potSize, heroStack, 1, true);
                if (geoRiver.isJammable && spr <= 3) {
                    return { type: 'all_in' }; // Just jam, SPR is low enough
                }

                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
            }

            // ── THIN VALUE: Bet 50-60% pot with strong top pair / good two pair ──
            if (handEval.strength >= 55 && canRaise) {
                // Don't thin value bet on boards that completed obvious draws
                if (scareLevel >= 3) return canCheck ? { type: 'check' } : { type: 'fold' };
                // Thin value frequency: higher IP, lower multiway
                let thinValueFreq = multiway ? Math.max(0.30, 0.50 + mwAdj.cbetFreqMod) : (isIP ? 0.72 : 0.60);
                thinValueFreq += posFreqMod.ipThinValueBoost; // IP thin values significantly more
                thinValueFreq *= sprStrategy.thinValueMult; // SPR: low = less thin value (committed), high = cautious

                // ═══ OPPONENT-AWARE THIN VALUE ═══
                // Against calling stations, thin value bet MORE (they call too light)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.12);
                }
                // Against aggressive players, check to induce bluff
                if (oppTendency === 'bluffy' && oppConfidence > 0.3 && !isIP) {
                    thinValueFreq = Math.max(0.25, thinValueFreq - 0.20); // Check more, let them bluff
                }

                // ═══ NARRATIVE-DRIVEN THIN VALUE ═══
                // Consistent betting story makes thin value credible
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }
                // Checked earlier streets → opponent may expect weakness, thin value catches them
                if (narrative.heroCheckedFlop && heroIsAggressor) {
                    // Delayed aggression = trap line, thin value is strong here
                    thinValueFreq = Math.min(0.80, thinValueFreq + 0.06);
                }
                // If we checked turn, betting river is suspicious — lower freq with marginal hands
                if (narrative.heroCheckedTurn && !narrative.heroBetFlop) {
                    thinValueFreq = Math.max(0.30, thinValueFreq - 0.10);
                }
                // River hurt us (equity dropped) → check more, our hand got worse
                if (turnToRiverDelta < -10) {
                    thinValueFreq = Math.max(0.25, thinValueFreq - 0.12);
                }
                // River helped us → value bet more aggressively
                if (turnToRiverDelta > 10) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }

                // ═══ BOARD EVOLUTION-DRIVEN THIN VALUE ═══
                // Runout character affects thin value bet safety
                if (boardEvolution.drawsCompleted.length > 0) {
                    thinValueFreq -= 0.12; // Draw completed = risky to thin value
                }
                if (boardEvolution.evolution === 'static_brick') {
                    thinValueFreq += 0.06; // Blank river = safe to thin value
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    thinValueFreq += 0.08; // River helped our range = bet more
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    thinValueFreq += 0.06; // Opponent's draws missed = can thin value safely
                }

                // ═══ 3-BET POT THIN VALUE ═══
                // In 3-bet pots, thin value is MORE profitable:
                // - Opponent's range is narrow → they have a pair more often → they call thin value
                // - SPR is low → smaller bets commit them
                if (is3BetPot) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.10);
                }

                // ═══ COMMITMENT-DRIVEN THIN VALUE ═══
                if (isHeavilyCommitted && narrative.barrelsInARow >= 1) {
                    thinValueFreq = Math.min(0.85, thinValueFreq + 0.08);
                }

                // ═══ LIVE-READ THIN VALUE FREQUENCY (Phase 20) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Calling station → thin value ALL DAY (they pay off everything)
                    if (liveRead.callFreq > 0.55) thinValueFreq = Math.min(0.88, thinValueFreq + 0.10);
                    // Tight folder → thin value less (they fold marginals, only call with better)
                    if (liveRead.foldFreq > 0.55 && handEval.strength < 65) {
                        thinValueFreq = Math.max(0.30, thinValueFreq - 0.10);
                    }
                    // High check-raise % → check instead to induce (risky to thin value into CR)
                    if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12 && !isIP) {
                        thinValueFreq = Math.max(0.25, thinValueFreq - 0.10);
                    }
                    // Low WTSD → they give up without showdown → our thin value gets folds (good)
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) {
                        thinValueFreq += 0.05; // More folds = more profitable thin value
                    }
                    // Timing: snap-call previous street = committed → thin value is risky
                    if (currentActionTimingTell === 'snap_call' && handEval.strength < 62) {
                        thinValueFreq = Math.max(0.30, thinValueFreq - 0.08);
                    }
                }

                thinValueFreq = Math.max(0.10, Math.min(0.88, thinValueFreq));

                if (Math.random() < thinValueFreq) {
                    let sizeFrac = multiway ? Math.max(0.35, 0.45 + mwAdj.adjustSizing * 0.01) : 0.55;
                    // Smaller sizing vs tight opponents to get called
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) sizeFrac = Math.max(0.35, sizeFrac - 0.12);
                    // Narrative: consistent barrels → can size up thin value
                    if (narrative.storyIsConsistent && narrative.barrelsInARow >= 1) {
                        sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }
                    // Board got drier = smaller sizing is fine for thin value
                    if (boardEvolution.boardGotDrier) {
                        sizeFrac = Math.max(0.35, sizeFrac - 0.06);
                    }
                    // Board got wetter = bigger to charge (or check instead)
                    if (boardEvolution.boardGotWetter) {
                        sizeFrac = Math.min(0.70, sizeFrac + 0.06);
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN THIN VALUE SIZING ═══
                    // Thin value is all about extracting that last bet — sizing is EVERYTHING.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Calling stations pay off at any size → go bigger
                        if (liveRead.callFreq > 0.55) {
                            sizeFrac = Math.min(0.75, sizeFrac + 0.10);
                        }
                        // Opponents who fold a lot → smaller to get called by worse
                        if (liveRead.foldFreq > 0.50) {
                            sizeFrac = Math.max(0.30, sizeFrac - 0.10);
                        }
                        // If they have a high fold-to-raise, even small bets get folds
                        // → tiny sizing extracts value from their middle range
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            sizeFrac = Math.max(0.28, sizeFrac - 0.08);
                        }
                        // Tank-called turn = marginal → extract with standard sizing
                        if (currentActionTimingTell === 'tank_call') {
                            sizeFrac = Math.min(0.65, sizeFrac + 0.05);
                        }
                        // Snap-called turn = strong, might raise us → be careful with thin value
                        if (currentActionTimingTell === 'snap_call' && handEval.strength < 65) {
                            sizeFrac = Math.max(0.30, sizeFrac - 0.08);
                        }
                    }

                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ── BLOCK BET: 25-33% pot with showdown value ──
            // Purpose: deny opponent a big bluff opportunity (IP) or probe for information (OOP)
            // GTO: OOP also block-bets to deny IP a free bluff opportunity
            if (handEval.strength >= 35 && handEval.strength < 55 && canRaise && !multiway) {
                let blockFreq = isIP ? 0.28 : (0.20 + posFreqMod.oopBlockBetBoost);
                // Block bet more against aggressive opponents (deny them a big bluff)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) blockFreq = 0.45;

                // ═══ NARRATIVE-DRIVEN BLOCK BET ═══
                // If we've been checking/calling, a small river bet is a credible block line
                if (narrative.checkBehindCount >= 1 || narrative.heroCheckedTurn) {
                    blockFreq += 0.08; // Pot-control line → block bet is natural continuation
                }
                // If we've been barreling, a sudden small bet is suspicious — avoid
                if (narrative.barrelsInARow >= 2) {
                    blockFreq = Math.max(0.10, blockFreq - 0.15); // Triple barrel then block? Doesn't make sense
                }
                // River weakened our hand → block bet to control pot
                if (turnToRiverDelta < -5) {
                    blockFreq += 0.06; // Hand got worse, block for cheap showdown
                }
                // Single barrel then check → block river is natural conclusion
                if (narrative.barrelsInARow === 1 && narrative.heroCheckedTurn) {
                    blockFreq += 0.06; // Bet-check-block is a coherent pot-control line
                }

                // ═══ 3-BET POT BLOCK BET ═══
                // In 3-bet pots, block bets are LESS useful (pot is big, block bet doesn't deny much).
                // Better to check or value bet. Block bets in 3-bet pots look weak.
                if (is3BetPot) blockFreq *= 0.50;
                if (is4BetPot) blockFreq = 0; // Never block bet in 4-bet pots

                // ═══ COMMITMENT-DRIVEN BLOCK BET ═══
                if (isHeavilyCommitted && !is3BetPot) {
                    blockFreq += 0.06;
                }

                // ═══ LIVE-READ BLOCK BET (Phase 20) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponent → block bet MORE to deny their big bluffs
                    if (liveRead.aggFreq > 0.40) blockFreq += 0.10;
                    // Passive opponent → block less (they won't bluff, just check back)
                    if (liveRead.aggFreq < 0.20) blockFreq -= 0.06;
                    // High overbet frequency → block bet denies overbet opportunity
                    if (liveRead.overbetPct !== null && liveRead.overbetPct > 0.10) blockFreq += 0.08;
                    // Calling station → block bet IS a thin value bet → they call anything
                    if (liveRead.callFreq > 0.55) blockFreq += 0.06;
                }

                blockFreq = Math.max(0, Math.min(0.55, blockFreq));
                if (Math.random() < blockFreq) {
                    let blockFrac = 0.25 + Math.random() * 0.08;
                    // Against very aggressive opponents, slightly bigger block to commit them
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) {
                        blockFrac = Math.min(0.40, blockFrac + 0.05);
                    }
                    // ═══ LIVE-READ BLOCK SIZING (Phase 20) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        if (liveRead.callFreq > 0.55) blockFrac = Math.min(0.38, blockFrac + 0.04);
                        if (liveRead.foldFreq > 0.50) blockFrac = Math.max(0.20, blockFrac - 0.04);
                    }
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * blockFrac)) };
                }
            }

            // ── RIVER PROBE BET: OOP initiative when opponent checked back turn ──
            // When OOP and opponent checked turn (showing weakness), probe the river.
            // This exploits opponents who give up on turns with marginal holdings.
            if (!isIP && canRaise && !multiway && narrative.heroCheckedTurn) {
                // If opponent also checked turn (we're now betting into checked pot)
                // This is NOT a bluff per se — it's a thin value / denial bet
                if (handEval.strength >= 35 && handEval.strength < 55) {
                    let probeFreq = 0.30 + aggressionBias / 50 + narrativeAggrMod / 40;
                    // Against passive opponents who check back weak ranges → probe more
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) probeFreq += 0.12;
                    if (oppTendency === 'balanced') probeFreq += 0.05;
                    // Against aggressive opponents, they would have bet if strong → probe valuable
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) probeFreq += 0.08;

                    // ═══ LIVE-READ RIVER PROBE ADJUSTMENTS (Phase 18) ═══
                    let probeFrac = 0.40 + Math.random() * 0.15; // 40-55% pot default
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // They checked back turn → if they're an aggressive player, their range is VERY capped
                        if (liveRead.aggFreq > 0.40) probeFreq += 0.10; // Aggressive player checked = weakness
                        // High fold frequency → probe with wider range
                        if (liveRead.foldFreq > 0.50) {
                            probeFreq += 0.06;
                            probeFrac = Math.max(0.33, probeFrac - 0.05); // Smaller is enough
                        }
                        // Low WTSD → they give up easily on river → probe
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) probeFreq += 0.06;
                        // Calling station → only probe for value
                        if (liveRead.callFreq > 0.60 && handEval.strength < 42) probeFreq -= 0.12;
                        if (liveRead.callFreq > 0.60 && handEval.strength >= 45) {
                            probeFreq += 0.06;
                            probeFrac = Math.min(0.60, probeFrac + 0.05); // Size up for value
                        }
                    }

                    probeFreq = Math.max(0, Math.min(0.55, probeFreq));
                    if (Math.random() < probeFreq) {
                        console.log(`[HorseBrain] 🔍 RIVER PROBE: str=${handEval.strength} OOP after checked turn — ${Math.round(probeFrac * 100)}% pot live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * probeFrac)) };
                    }
                }
            }

            // ── RIVER BLUFF: Polarized bluff with blockers ──
            // This is where the real skill shows — turning missed draws into profitable bluffs
            // GTO PRINCIPLE: Bluff:Value ratio should match bet sizing to make opponent indifferent.
            // For b% pot bet: bluff frequency = b/(1+b) of betting range.
            // 66% pot → ~40% bluffs in betting range. 100% pot → 50%. 150% pot → 60%.
            if (handEval.strength < 15 && canRaise && !multiway) {
                // ═══ POSITION-AWARE RIVER BLUFF BASE ═══
                // IP starts with a slight bluff bonus (information advantage, guaranteed showdown)
                // OOP bluffs are riskier (opponent can raise us off our bluff)
                let bluffProbability = posFreqMod.ipBluffBoost + posFreqMod.riverBluffIPBoost;

                // ═══ BLOCKER-BASED BLUFF WEIGHTING ═══
                // Each blocker type has a different EV impact on bluffing.
                // Nut flush blocker is the best because it removes the most combos of nuts.
                if (blocksNutFlush) bluffProbability += 0.25;
                if (blocksSecondNutFlush) bluffProbability += 0.15;
                if (blocksTopSet) bluffProbability += 0.12;
                if (blocksOverpair) bluffProbability += 0.08;
                if (blocksStraight) bluffProbability += 0.10;

                // ═══ BLOCKER COMBO BONUS ═══
                // Multiple blockers compound in value — opponent's value range is severely reduced
                const blockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (blockerCount >= 2) bluffProbability += 0.08; // Combo blocker bonus
                if (blockerCount >= 3) bluffProbability += 0.05; // Triple blocker — very strong bluff candidate

                // ═══ NARRATIVE-DRIVEN BLUFF CREDIBILITY ═══
                // Only bluff when our prior street actions tell a believable story
                bluffProbability += narrativeAggrMod / 50;
                // Triple barrel bluff: requires blockers + consistent story
                if (narrative.barrelsInARow >= 2) {
                    if (blockerCount >= 1 && narrative.storyIsConsistent) {
                        bluffProbability += 0.06; // Committed bluff with story + blockers
                    } else if (blockerCount === 0) {
                        bluffProbability -= 0.10; // Triple barrel without blockers = bad idea
                    }
                }
                // Delayed barrel bluff: checked flop, bet turn, bet river — credible
                if (narrative.suggestedLine === 'delayed-barrel' && narrative.heroCheckedFlop) {
                    bluffProbability += 0.05;
                }

                // Personality: aggressive horses bluff more
                bluffProbability += aggressionBias / 80;

                // ═══ OPPONENT-AWARE BLUFF FREQUENCY ═══
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffProbability += 0.15;
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) bluffProbability = 0;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffProbability += 0.10;

                // ═══ AGGRESSOR RANGE ADVANTAGE ═══
                if (heroIsAggressor && !boardFavorsCaller) bluffProbability += 0.08;
                if (!heroIsAggressor && boardFavorsPFR) bluffProbability -= 0.08;

                // Board that missed draws → opponent has showdown value
                if (scareLevel === 0 && equityDelta < -10) bluffProbability += 0.08;

                // ═══ BOARD EVOLUTION-DRIVEN RIVER BLUFF ═══
                // The runout character defines bluff credibility on the river
                if (boardEvolution.drawsCompleted.length > 0 && heroIsAggressor) {
                    bluffProbability += 0.10; // Completed draws = we can rep the nuts
                }
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    // Draws bricked = opponent knows we missed → less fold equity for bluffs
                    // UNLESS we barrel representing value (not a draw)
                    if (narrative.barrelsInARow >= 2 && narrative.storyIsConsistent) {
                        bluffProbability += 0.04; // Our barrel story still credible
                    } else {
                        bluffProbability -= 0.08; // We look like a missed draw
                    }
                }
                if (boardEvolution.evolution === 'static_brick' && heroIsAggressor) {
                    bluffProbability += 0.06; // Brick river = good for PFR to triple barrel
                }
                if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                    bluffProbability -= 0.10; // River helped their range — terrible bluff spot
                }
                if (boardEvolution.evolution === 'pfr_favorable' && heroIsAggressor) {
                    bluffProbability += 0.08; // River helped our range — credible
                }

                // ═══ HEAVY POT CAUTION ═══
                if (oppStreetAggression === 'very_heavy') bluffProbability -= 0.10;

                // ═══ PHASE 15: CURRENT-ACTION TIMING TELL → RIVER BLUFF ═══
                if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
                    if (currentActionTimingTell === 'tank_call') {
                        // Tank-called the turn = marginal hand, likely folds to river pressure
                        bluffProbability += 0.10;
                    } else if (currentActionTimingTell === 'snap_call') {
                        // Snap-called = strong hand, not folding to river bluff
                        bluffProbability -= 0.08;
                    } else if (currentActionTimingTell === 'tank_aggression') {
                        // Tank-bet the turn = unsure, might fold to check-raise or river pressure
                        bluffProbability += 0.05;
                    } else if (currentActionTimingTell === 'deliberate') {
                        bluffProbability += 0.03;
                    }
                }

                // ═══ SPR + POLARIZATION BLUFF ADJUSTMENT (RIVER) ═══
                bluffProbability *= sprStrategy.bluffMult * polarBluffMod;

                // ═══ LIVE-READ RIVER BLUFF FREQUENCY (Phase 21) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    if (liveRead.foldFreq > 0.55) bluffProbability += 0.08;
                    if (liveRead.foldFreq < 0.30) bluffProbability -= 0.08;
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffProbability += 0.06;
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) bluffProbability += 0.05;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) bluffProbability -= 0.06;
                    if (liveRead.callFreq > 0.60) bluffProbability = Math.min(bluffProbability, 0.05);
                }

                // GTO cap: river bluffs should not exceed ~38% even with max blockers + reads
                bluffProbability = Math.max(0, Math.min(0.38, bluffProbability));

                if (Math.random() < bluffProbability) {
                    // Polarized range: use larger bluff sizing (mirrors our value bets)
                    // Merged range: smaller bluffs (consistent with thin value sizing)
                    let bluffFrac = riverRangeType === 'polarized'
                        ? (0.70 + Math.random() * 0.20) // 70-90% for polarized
                        : (0.40 + Math.random() * 0.15); // 40-55% for merged
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.35) {
                        bluffFrac = 0.90 + Math.random() * 0.30;
                    }
                    // ═══ BLOCKER-AWARE BLUFF SIZING ═══
                    // With premium blockers, can go bigger (opponent is less likely to have nuts)
                    if (blockerCount >= 2 && oppFoldFreq > 0.40) {
                        bluffFrac = Math.max(bluffFrac, 0.80 + Math.random() * 0.40); // 80-120% pot
                    }
                    // ═══ PHASE 36A: GRANULAR BLOCKER SCORE → BLUFF SIZING ═══
                    // High blockerScore = we remove more of their value range →
                    // bigger bluffs are more profitable (they can't have nuts as often)
                    if (blockerScore >= 0.30) {
                        bluffFrac = Math.max(bluffFrac, 0.75 + Math.random() * 0.35); // 75-110% pot
                    }

                    // ═══ PHASE 16: LIVE-READ DRIVEN RIVER BLUFF SIZING ═══
                    // The river is where sizing MATTERS MOST — wrong size = burning money.
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Against folders: SIZE UP for max fold equity
                        if (liveRead.foldFreq > 0.50) {
                            bluffFrac = Math.min(1.30, bluffFrac + 0.15);
                        }
                        // Against stations: SIZE DOWN to lose less when called
                        if (liveRead.callFreq > 0.55) {
                            bluffFrac = Math.max(0.35, bluffFrac - 0.15);
                        }
                        // Opponent has high fold-to-raise → overbet bluffs are profitable
                        if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) {
                            bluffFrac = Math.min(1.50, bluffFrac + 0.20);
                        }
                        // Tank-called turn = marginal → big river bluff folds them out
                        if (currentActionTimingTell === 'tank_call') {
                            bluffFrac = Math.min(1.20, bluffFrac + 0.15);
                        }
                        // Snap-called turn = strong → smaller bluff (or don't bluff, already freq-capped)
                        if (currentActionTimingTell === 'snap_call') {
                            bluffFrac = Math.max(0.45, bluffFrac - 0.10);
                        }
                        // Live nit detection: passive + foldy → overbet bluff for max fold equity
                        if (liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50) {
                            bluffFrac = Math.min(1.40, bluffFrac + 0.20);
                        }
                    }

                    console.log(`[HorseBrain] 🎭 RIVER BLUFF: ${handStr} blockers=[NFD=${blocksNutFlush},TopSet=${blocksTopSet},Str=${blocksStraight}] count=${blockerCount} story=${narrative.suggestedLine} opp=${oppTendency} — ${Math.round(bluffFrac * 100)}% pot`);
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * bluffFrac)) };
                }
            }

            // ── RIVER SHOWDOWN VALUE CHECK-BACK FRAMEWORK ──
            // If we reach here, we've declined to bet. But there's still a decision:
            // some medium hands OOP should consider leading small vs checking to showdown.

            // OOP medium hands: consider a small donk/lead if checked to us and opponent is passive
            if (!isIP && handEval.strength >= 30 && handEval.strength < 55 && canRaise && !multiway) {
                // Only lead if opponent has been passive (checking through)
                if (narrative.heroCheckedTurn || narrative.checkBehindCount >= 1) {
                    // Opponent showed weakness by checking — lead for thin value/denial
                    let leadFreq = 0.15;
                    let leadFrac = 0.30 + Math.random() * 0.10; // 30-40% pot
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) leadFreq = 0.25;
                    if (turnToRiverDelta > 5) leadFreq += 0.06; // River helped us
                    if (turnToRiverDelta < -5) leadFreq -= 0.06; // River hurt us

                    // ═══ LIVE-READ RIVER OOP LEAD (Phase 29) ═══
                    if (liveRead && liveRead.confidence >= 0.20) {
                        // Passive opp checked back = very weak range → lead more
                        if (liveRead.aggFreq < 0.25) leadFreq += 0.12;
                        // Aggressive opp checked back = EXTREMELY weak → lead even more
                        if (liveRead.aggFreq > 0.40) leadFreq += 0.15;
                        // High fold freq → lead for denial, smaller sizing
                        if (liveRead.foldFreq > 0.50) {
                            leadFreq += 0.08;
                            leadFrac = Math.max(0.25, leadFrac - 0.05);
                        }
                        // Calling station → only lead for value (str >= 42)
                        if (liveRead.callFreq > 0.60 && handEval.strength < 42) {
                            leadFreq = Math.max(0.05, leadFreq - 0.12);
                        }
                        if (liveRead.callFreq > 0.55 && handEval.strength >= 42) {
                            leadFreq += 0.08;
                            leadFrac = Math.min(0.45, leadFrac + 0.05); // Size up for value
                        }
                        // Low WTSD = gives up easily → lead to take the pot
                        if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) leadFreq += 0.08;
                        // High WTSD = sticky → only lead strong medium+
                        if (liveRead.wtsd !== null && liveRead.wtsd > 0.32 && handEval.strength < 42) {
                            leadFreq = Math.max(0.05, leadFreq - 0.08);
                        }
                        // One-and-done detection: high cBet but low secondBarrel → they gave up, take pot
                        if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
                            liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
                            leadFreq += 0.10; // They checked turn = gave up, river lead prints money
                        }
                        // Check-raise threat: if they might CR us, be careful
                        if (liveRead.checkRaisePct !== null && liveRead.checkRaisePct > 0.12) {
                            leadFreq = Math.max(0.08, leadFreq - 0.06);
                            leadFrac = Math.max(0.25, leadFrac - 0.04); // Smaller to lose less if raised
                        }
                    }

                    leadFreq = Math.max(0, Math.min(0.50, leadFreq));
                    if (Math.random() < leadFreq) {
                        console.log(`[HorseBrain] 🎯 RIVER OOP LEAD: str=${handEval.strength} freq=${Math.round(leadFreq * 100)}% size=${Math.round(leadFrac * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                        return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * leadFrac)) };
                    }
                }
            }

            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ═══ FACING A BET ON RIVER ═══
        // This is THE most important decision in poker.

        // ═══ RIVER POLARIZATION-AWARE FACING-BET FRAMEWORK ═══
        // MUST be computed BEFORE facingRiverRaise block which uses polarCallMod.
        const oppRangeIsPolarized = (() => {
            if (betToPot >= 0.80) return true;
            if (betToPot >= 1.2) return true;
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) return true;
            if (boardEvolution.drawsCompleted.length > 0) return true;
            if (oppStreetAggression === 'very_heavy') return true;
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.aggFreq > 0.50 && liveRead.overbetPct !== null && liveRead.overbetPct > 0.10) return true;
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) return true;
            }
            return false;
        })();

        const liveNitMerged = liveRead && liveRead.confidence >= 0.25 &&
            liveRead.aggFreq < 0.20 && liveRead.foldFreq > 0.45;
        const oppRangeIsMerged = !oppRangeIsPolarized && (
            betToPot <= 0.45 ||
            (oppTendency === 'weak-tight' && oppConfidence > 0.3) ||
            liveNitMerged ||
            boardEvolution.evolution === 'static_brick' ||
            oppStreetAggression === 'light'
        );

        const polarCallMod = oppRangeIsPolarized ? 0.08 : oppRangeIsMerged ? -0.06 : 0;
        const polarRaiseMod = oppRangeIsPolarized ? -0.08 : oppRangeIsMerged ? 0.08 : 0;

        // ═══ FACING A RAISE ON RIVER (Hero bet, got raised) ═══
        // The most polarized spot in poker. Opponent raises our river bet = the NUTS or a bluff.
        // Our response depends on: hand strength, blockers, opponent profile, board texture.
        const heroAlreadyBetRiver = narrative.barrelsInARow >= 1 && facingBet && street === 'river';
        const facingRiverRaise = heroAlreadyBetRiver && betToPot >= 0.50;
        if (facingRiverRaise) {
            // ── STONE COLD NUTS: Re-raise for max value ──
            if (handEval.strength >= 90 && canRaise) {
                // On the river, raising a raise with the nuts = all-in
                return { type: 'all_in' };
            }
            // ── VERY STRONG: Call (we're near the top of our range but not the nuts) ──
            if (handEval.strength >= 75) {
                // Against polarized range: call (they're either nutted or bluffing)
                // Only re-raise with actual nuts (handled above)
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // ── BLUFF-CATCHER ZONE (55-74): Blockers + reads matter enormously ──
            if (handEval.strength >= 55) {
                let riverRaiseCallFreq = 0.25; // Base: call ~25% of the time in this range
                // ═══ BLOCKER-BASED CALL vs RIVER RAISE ═══
                const bcBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
                if (bcBlockerCount >= 2) riverRaiseCallFreq += 0.20;
                else if (bcBlockerCount >= 1) riverRaiseCallFreq += 0.10;
                // ═══ OPPONENT READ-BASED ═══
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) riverRaiseCallFreq += 0.15;
                if (oppBluffFreq > 0.40 && oppConfidence > 0.4) riverRaiseCallFreq += 0.10;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.4) riverRaiseCallFreq = 0.05; // They NEVER bluff-raise river
                // ═══ BOARD EVOLUTION ═══
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    riverRaiseCallFreq += 0.08; // Missed draws → more bluff raises
                }
                if (boardEvolution.drawsCompleted.length > 0 && !handEval.category?.includes('flush') && !handEval.category?.includes('straight')) {
                    riverRaiseCallFreq -= 0.12; // Draws got there → they probably have it
                }
                // ═══ POLARIZATION CONTEXT ═══
                riverRaiseCallFreq += polarCallMod * 0.5; // Half the normal polarization effect
                // ═══ SIZE TELLS ═══
                if (betToPot >= 2.0) riverRaiseCallFreq -= 0.05; // Massive overbet raise = usually nuts
                if (betToPot <= 0.70) riverRaiseCallFreq += 0.08; // Small raise = often thin/bluff

                // ═══ LIVE-READ RIVER FACING-RAISE (Phase 22) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Aggressive opponents bluff-raise rivers more
                    if (liveRead.aggFreq > 0.45) riverRaiseCallFreq += 0.08;
                    if (liveRead.aggFreq > 0.55) riverRaiseCallFreq += 0.05;
                    if (liveRead.aggFreq < 0.20) riverRaiseCallFreq -= 0.10;
                    // High bluff rate = call more vs river raise
                    if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30) riverRaiseCallFreq += 0.10;
                    if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.10) riverRaiseCallFreq -= 0.08;
                    // WTSD: low = they only get here with the goods
                    if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) riverRaiseCallFreq -= 0.08;
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.32) riverRaiseCallFreq += 0.06;
                    // Fold-to-raise: if they rarely fold to raises they're value-heavy
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.25) riverRaiseCallFreq -= 0.06;
                    // Timing tells: snap aggression on river = polarized (strong or pure bluff)
                    if (currentActionTimingTell === 'snap_aggression') {
                        if (bcBlockerCount >= 2) riverRaiseCallFreq += 0.10;
                        else riverRaiseCallFreq -= 0.04;
                    }
                    if (currentActionTimingTell === 'tank_aggression') riverRaiseCallFreq += 0.06;
                }

                riverRaiseCallFreq = Math.max(0.02, Math.min(0.55, riverRaiseCallFreq));
                if (Math.random() < riverRaiseCallFreq) {
                    console.log(`[HorseBrain] 🦸 RIVER vs RAISE CALL: str=${handEval.strength} blockers=${bcBlockerCount} freq=${Math.round(riverRaiseCallFreq * 100)}%`);
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
                console.log(`[HorseBrain] 🚫 RIVER vs RAISE FOLD: str=${handEval.strength} blockers=${bcBlockerCount}`);
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // ── DRAWS / WEAK HANDS: Almost always fold to river raise ──
            // River raises are incredibly strong — folding weak hands is correct
            const weakBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
            let weakHeroCallFreq = 0.10;
            if (oppTendency === 'bluffy') weakHeroCallFreq = 0.15;
            // ═══ LIVE-READ WEAK HAND vs RIVER RAISE (Phase 22) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.aggFreq > 0.50) weakHeroCallFreq += 0.06;
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) weakHeroCallFreq += 0.08;
                if (liveRead.aggFreq < 0.20) weakHeroCallFreq = 0.02;
            }
            if (handEval.strength >= 40 && weakBlockerCount >= 2) {
                // Hero-call raise with premium blockers vs known/live-read bluffer
                if (Math.random() < weakHeroCallFreq) return canCall ? { type: 'call' } : { type: 'fold' };
            }
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ── POT COMMITTED: Call or jam ──
        if (isPotCommitted && handEval.strength >= 35) {
            if (canRaise && handEval.strength >= 75) return { type: 'all_in' };
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ── OOP MATRIX: structured river facing-bet decisions ──
        if (!isIP && oppConfidence >= 0.25) {
            const riverOopDecision = getOOPDecisionMatrix({
                handStrength: handEval.strength,
                handCategory: handEval.category,
                hasStrongDraw: false, // River: no more draws
                hasWeakDraw: false,
                street: 'river',
                boardWetness: boardWet,
                boardIsPaired: boardPaired,
                boardIsMonotone: maxSuitCount >= 3,
                numPlayers,
                aggressionBias: aggressionBias + narrativeAggrMod,
                oppTendency, oppConfidence, oppCallFreq,
                oppCbetFreq: 0.60,
                heroIsAggressor,
                potSize, toCall, stackBB,
                liveRead  // Phase 28: pass live-read to OOP matrix
            });

            // ═══ OOP CHECK-RAISE BOOST: posFreqMod integration (river) ═══
            const riverCRFreq = riverOopDecision.action === 'check_raise'
                ? Math.min(0.85, riverOopDecision.frequency + posFreqMod.oopCheckRaiseBoost)
                : riverOopDecision.frequency;

            if (riverOopDecision.action === 'check_raise' && canRaise && Math.random() < riverCRFreq) {
                const crSize = Math.round(toCall * (riverOopDecision.sizeFraction || 3.0));
                console.log(`[HorseBrain] 🎲 TR-OOP MATRIX: river check-raise (${riverOopDecision.reason}) freq=${Math.round(riverCRFreq * 100)}%`);
                return { type: raiseAction.type, amount: clampAmt(crSize) };
            }
            if (riverOopDecision.action === 'check_fold' && handEval.strength < 40) {
                // Only respect check_fold if we're not being offered great pot odds
                if (potOdds > 0.25) {
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // check_call falls through to existing river logic
        }

        // (polarCallMod, polarRaiseMod, oppRangeIsPolarized, oppRangeIsMerged
        //  are defined above the facingRiverRaise block — Phase 35 fix)

        // ── MONSTERS: Raise for value ──
        if (handEval.strength >= 85 && canRaise) {
            // Against calling stations, raise HUGE
            let valueMult = 0.80;
            if (oppCallFreq > 0.60 && oppConfidence > 0.3) valueMult = 1.10;
            // ═══ POLARIZATION: vs merged, raise bigger (they can't fold medium hands) ═══
            if (oppRangeIsMerged) valueMult = Math.min(1.30, valueMult + 0.15);
            // ═══ POLARIZATION: vs polarized, smaller raise (they're snap-folding bluffs anyway) ═══
            if (oppRangeIsPolarized) valueMult = Math.max(0.65, valueMult - 0.10);
            // ═══ LIVE-READ RIVER MONSTER SIZING (Phase 24) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                if (liveRead.callFreq > 0.60) valueMult = Math.min(1.40, valueMult + 0.15);
                if (liveRead.foldFreq > 0.55) valueMult = Math.max(0.55, valueMult - 0.12);
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) valueMult = Math.min(1.35, valueMult + 0.10);
            }
            const raiseSize = Math.round(toCall + potSize * valueMult);
            return { type: raiseAction.type, amount: clampAmt(raiseSize) };
        }

        // ── STRONG HANDS: Raise small bets for value OR call ──
        // ═══ 3-BET POT: Top pair is premium on the river in 3-bet pots ═══
        const riverStrongThreshold = is3BetPot ? 48 : is4BetPot ? 40 : 55;
        if (handEval.strength >= riverStrongThreshold) {
            // ═══ OPPONENT-AWARE STRONG HAND LAYDOWN ═══
            // If a known weak-tight player is betting big on the river in a heavy pot, RESPECT IT
            if (oppTendency === 'weak-tight' && oppConfidence > 0.4 &&
                betToPot >= 0.75 && oppRangeStrength === 'polarized' && handEval.strength < 70 && !is3BetPot) {
                // ═══ LIVE-READ RIVER LAYDOWN OVERRIDE (Phase 24) ═══
                // If live data says they're actually aggressive, don't auto-fold
                if (liveRead && liveRead.confidence >= 0.25 && liveRead.aggFreq > 0.40) {
                    // Override: aggro player, don't fold strong hands
                } else {
                    console.log(`[HorseBrain] 🎯 RIVER LAYDOWN: opp=weak-tight, big bet in heavy pot, strength=${handEval.strength}`);
                    return canCheck ? { type: 'check' } : { type: 'fold' };
                }
            }
            // ═══ LIVE-READ RIVER TIGHT PLAYER LAYDOWN (Phase 24) ═══
            // New: live data can INDEPENDENTLY trigger a laydown even without static weak-tight tag
            if (liveRead && liveRead.confidence >= 0.30 && liveRead.aggFreq < 0.15 &&
                betToPot >= 0.80 && handEval.strength < 68 && !is3BetPot) {
                console.log(`[HorseBrain] 🎯 RIVER LIVE LAYDOWN: opp aggFreq=${liveRead.aggFreq.toFixed(2)}, big bet, str=${handEval.strength}`);
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }

            // ═══ RAISE-FOR-VALUE vs SMALL BETS (geometric sizing) ═══
            // When opponent makes a small bet (block/probe) with strong hands (65+),
            // we should raise for value — their bet looks weak/blocking.
            // Use geometric sizing to plan optimal raise for stack-off.
            if (canRaise && handEval.strength >= 65 && betToPot <= 0.45 && !multiway) {
                let raiseFreq = 0.35;
                // Against calling stations, raise for value more (they call raises too)
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseFreq = 0.50;
                // Against aggressive opponents, raise less (they might be trapping)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) raiseFreq = 0.25;
                // Narrative: we've been passive → raise is unexpected = gets paid
                if (narrative.checkBehindCount >= 1) raiseFreq += 0.08;
                // Narrative: we've been barreling → raise is credible continuation
                if (narrative.barrelsInARow >= 1 && narrative.storyIsConsistent) raiseFreq += 0.06;
                // ═══ LIVE-READ RIVER VALUE RAISE (Phase 24) ═══
                if (liveRead && liveRead.confidence >= 0.20) {
                    // Stations = raise more (they call raises with worse)
                    if (liveRead.callFreq > 0.55) raiseFreq += 0.10;
                    // High WTSD = they go to showdown → raise for value
                    if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) raiseFreq += 0.06;
                    // Aggressive opponents may 3-bet — be cautious
                    if (liveRead.aggFreq > 0.50) raiseFreq -= 0.08;
                    // Fold-to-raise: low = they call a lot of raises
                    if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct < 0.30) raiseFreq += 0.08;
                }
                // ═══ POLARIZATION: raise more vs merged (they fold too much to raises) ═══
                raiseFreq += polarRaiseMod;
                raiseFreq = Math.max(0.10, Math.min(0.55, raiseFreq));

                if (Math.random() < raiseFreq) {
                    // Geometric sizing: what raise gets us to a natural stack-off?
                    const potAfterCall = potSize + toCall * 2;
                    const geoRaise = getGeometricSizing(potAfterCall, heroStack - toCall, 1, true);

                    let raiseMult;
                    if (geoRaise.isJammable && spr <= 3) {
                        // Low SPR: just jam
                        return { type: 'all_in' };
                    } else if (spr <= 6) {
                        // Medium SPR: raise big for max value
                        raiseMult = 3.0 + Math.random() * 0.5;
                    } else {
                        // Deep: standard value raise
                        raiseMult = 2.5 + Math.random() * 0.5;
                    }
                    // Against calling stations, go bigger
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseMult = Math.min(4.0, raiseMult * 1.15);
                    const raiseSize = Math.round(toCall * raiseMult);
                    console.log(`[HorseBrain] 💰 RIVER VALUE RAISE: str=${handEval.strength} betToPot=${Math.round(betToPot * 100)}% raise=${raiseMult.toFixed(1)}x`);
                    return { type: raiseAction.type, amount: clampAmt(raiseSize) };
                }
            }

            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // ════════════════════════════════════════
        //  BLUFF-CATCHING ENGINE (UPGRADED)
        //  The science of calling at the right frequency
        // ════════════════════════════════════════

        // MDF = Minimum Defense Frequency = pot / (pot + bet)
        // If we fold more than (1-MDF), opponent profits from bluffing any two cards
        const mdf = potSize / (potSize + toCall);
        const handEquityFrac = handEval.strength / 100;

        // ═══ DYNAMIC FOLD THRESHOLD ═══
        // Adjust fold threshold based on enriched opponent data
        let dynFoldThreshold = foldThreshold;
        // If we KNOW opponent bluffs a lot (from Advanced module), lower threshold
        if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
            dynFoldThreshold = Math.max(18, dynFoldThreshold - Math.round(oppConfidence * 10));
        }
        // If opponent rarely bluffs, raise threshold (fold more marginal hands)
        if (oppBluffFreq < 0.15 && oppConfidence > 0.3) {
            dynFoldThreshold = Math.min(45, dynFoldThreshold + Math.round(oppConfidence * 8));
        }
        // ═══ LIVE-READ DYNAMIC FOLD THRESHOLD (Phase 24) ═══
        if (liveRead && liveRead.confidence >= 0.20) {
            // Live bluff rate overrides static — direct fold threshold adjustment
            if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.35) {
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 6);
            }
            if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.12) {
                dynFoldThreshold = Math.min(48, dynFoldThreshold + 6);
            }
            // Live aggFreq: very aggressive = lower threshold (they barrel too much)
            if (liveRead.aggFreq > 0.50) dynFoldThreshold = Math.max(15, dynFoldThreshold - 4);
            // Live passivity: very passive river bet = strong → raise threshold
            if (liveRead.aggFreq < 0.18) dynFoldThreshold = Math.min(50, dynFoldThreshold + 5);
            // WTSD: low = they rarely bluff river → fold more
            if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) dynFoldThreshold = Math.min(48, dynFoldThreshold + 4);
            if (liveRead.wtsd !== null && liveRead.wtsd > 0.35) dynFoldThreshold = Math.max(18, dynFoldThreshold - 4);
        }
        // ═══ SPR-DRIVEN FOLD THRESHOLD ═══
        // Low SPR: call wider (we're pot-committed, folding loses too much equity)
        // High SPR: fold threshold stays normal (plenty of room to maneuver)
        dynFoldThreshold = Math.max(15, dynFoldThreshold - Math.round(sprStrategy.callWidthBonus * 30));

        // ═══ POLARIZATION-DRIVEN FOLD THRESHOLD ═══
        // Vs polarized opponent: call wider (their range includes bluffs → our bluff-catchers are profitable)
        // Vs merged opponent: fold tighter (they rarely bluff → our marginals are behind)
        if (oppRangeIsPolarized) {
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 4); // Call wider
        }
        if (oppRangeIsMerged) {
            dynFoldThreshold = Math.min(50, dynFoldThreshold + 3); // Fold tighter
        }

        // ═══ COMMITMENT-DRIVEN FOLD THRESHOLD ═══
        // If we've invested heavily in the pot, don't fold easily on the river.
        // The math: if we've put in 40% of our stack, folding loses that investment.
        if (isHeavilyCommitted) {
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 5); // Much wider calling
        } else if (isModeratelyCommitted) {
            dynFoldThreshold = Math.max(18, dynFoldThreshold - 2); // Slightly wider
        }

        // ═══ TIMING TELL — FOLD THRESHOLD ADJUSTMENT ═══
        // Live observer tracks how fast opponents make decisions.
        // SNAP-BET: When opponent bets/raises very quickly (<3s), it often means:
        //   - Auto-pilot (weak recreational) → call wider
        //   - Pre-planned bluff (programmed action) → call wider
        //   - Very strong hand (instajam) → context-dependent
        // LONG-TANK then BET: Took 15+ seconds → often means:
        //   - Marginal decision → thin value or thin bluff → slightly wider calling
        //   - BUT long-tank then RAISE = usually very strong (deliberated then committed)
        if (oppTimingTell === 'fast_player' && oppConfidence > 0.2) {
            // Fast players tend to play less optimally → call slightly wider
            dynFoldThreshold = Math.max(15, dynFoldThreshold - 2);
        }

        // ═══ PHASE 15: CURRENT ACTION TIMING TELL — FOLD THRESHOLD ═══
        // This is the timing of THIS SPECIFIC action, compared to their baseline.
        // Much more powerful than overall player speed — reveals hand-specific tells.
        if (currentActionTimingTell !== 'unknown' && oppConfidence >= 0.20) {
            if (currentActionTimingTell === 'snap_call') {
                // Snap-call on turn/river = strong made hand or committed draw
                // Don't try to bluff them off → raise threshold for value-only
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 1);
            } else if (currentActionTimingTell === 'snap_aggression') {
                // Snap-bet or snap-raise = polarized (auto-bluff or nut hand)
                // With blockers → call wider. Without → fold tighter.
                if (hasAnyBlocker) {
                    dynFoldThreshold = Math.max(15, dynFoldThreshold - 4);
                } else {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 1);
                }
            } else if (currentActionTimingTell === 'tank_aggression') {
                // Long tank then bet/raise = marginal value or thin bluff
                // They were UNSURE → call wider, their range is weak
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 3);
            } else if (currentActionTimingTell === 'tank_call') {
                // Long tank then call = drawing or marginal
                // If we can barrel again, their range is capped
                dynFoldThreshold = Math.max(18, dynFoldThreshold - 1);
            } else if (currentActionTimingTell === 'deliberate') {
                // Slightly longer than average = genuine decision
                // Slight fold threshold reduction (they're not super strong)
                dynFoldThreshold = Math.max(18, dynFoldThreshold - 1);
            }
        }

        // ═══ IN-HAND ACTION SEQUENCE — FOLD THRESHOLD ═══
        // Use the current hand's action history to adjust fold threshold.
        // Opponent's prior street actions tell us a LOT about their range.
        if (oppInHandActions) {
            const inHandActs = oppInHandActions.actions || [];
            const oppFlopAction = inHandActs.find(a => a.street === 'flop');
            const oppTurnAction = inHandActs.find(a => a.street === 'turn');

            if (street === 'river') {
                // Check-check flop → bet turn → bet river = often thin value or draw that got there
                if (oppFlopAction && oppFlopAction.action === 'check' && oppTurnAction && oppTurnAction.action === 'bet') {
                    dynFoldThreshold = Math.max(18, dynFoldThreshold - 3); // Delayed aggression = wider range
                }
                // Bet-bet-bet (triple barrel) from a one_and_done player = VERY strong (they never do this)
                if (oppExploits.includes('one_and_done') && inHandActs.filter(a => ['bet', 'raise'].includes(a.action)).length >= 3) {
                    dynFoldThreshold = Math.min(55, dynFoldThreshold + 8); // Massive fold adjustment
                }
                // Check-raise on earlier street then bets river = polarized strength
                const hadCheckRaise = inHandActs.some(a => a.action === 'raise' && a.street !== 'preflop');
                if (hadCheckRaise && oppInHandActions.streetAggression[street]) {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 3);
                }
            }
            if (street === 'turn') {
                // Opponent c-bet flop then bets turn = continuation, check live barrel rate
                if (oppFlopAction && ['bet', 'raise'].includes(oppFlopAction.action) && oppInHandActions.isAggressor) {
                    // Live second barrel% tells us how often they actually follow through
                    if (liveRead && liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.35) {
                        // They rarely double-barrel — this is strong → fold tighter
                        dynFoldThreshold = Math.min(50, dynFoldThreshold + 4);
                    } else if (liveRead && liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.70) {
                        // They always barrel — this is often air → call wider
                        dynFoldThreshold = Math.max(18, dynFoldThreshold - 3);
                    }
                }
            }
        }

        // ═══ LIVE BET-SIZING TELL — FOLD THRESHOLD ═══
        if (liveSizingTell !== 'unknown' && oppConfidence >= 0.20) {
            if (liveSizingTell === 'larger_than_usual') {
                if (street === 'river' && hasAnyBlocker) {
                    dynFoldThreshold = Math.max(18, dynFoldThreshold - 3);
                } else {
                    dynFoldThreshold = Math.min(50, dynFoldThreshold + 2);
                }
            } else if (liveSizingTell === 'smaller_than_usual') {
                dynFoldThreshold = Math.max(15, dynFoldThreshold - 3);
            } else if (liveSizingTell === 'rare_overbet') {
                if (hasAnyBlocker || blocksOverpair) {
                    dynFoldThreshold = Math.max(20, dynFoldThreshold - 2);
                } else {
                    dynFoldThreshold = Math.min(55, dynFoldThreshold + 5);
                }
            }
        }

        if (handEval.strength >= dynFoldThreshold) {
            // FACTOR 1: Direct equity vs pot odds
            if (handEquityFrac >= potOdds) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 2: Known bluffer → widen calling range
            if (oppBluffy && handEval.strength >= dynFoldThreshold - 8) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 3: Small bet sizing → very wide calling range
            // 25-33% pot bets need to be called with almost any pair
            if (betToPot <= 0.35 && handEval.strength >= 25) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 4: Overbet (>pot) → POLARIZED → call wider with medium hands
            // Overbets are either the nuts or a bluff — our medium hands are bluff-catchers
            if (betToPot >= 1.0 && handEval.strength >= 38) {
                // Against known bluffers, call overbets MORE
                let overbetCallFreq = 0.40;
                if (oppBluffy && oppConfidence > 0.3) overbetCallFreq = 0.55;
                // ═══ POLARIZATION: overbets confirm polarized range → call wider ═══
                overbetCallFreq += polarCallMod;
                if (Math.random() < overbetCallFreq) {
                    console.log(`[HorseBrain] 🕵️ BLUFF-CATCH: overbet (${Math.round(betToPot * 100)}% pot) str=${handEval.strength} opp=${oppTendency}`);
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // FACTOR 5: Board missed draws → opponent more likely bluffing
            // If flush/straight draws bricked and opponent bets big = likely bluff
            if (scareLevel === 0 && betToPot >= 0.60 && handEval.strength >= 30) {
                // ═══ DRAW BRICKED DETECTION (BOARD EVOLUTION ENHANCED) ═══
                // River completed nothing — opponent's turn draws missed
                let brickCallFreq = 0.35;
                if (turnToRiverDelta <= -5) brickCallFreq += 0.10; // River hurt our hand too = both have air
                if (oppBluffFreq > 0.30 && oppConfidence > 0.25) brickCallFreq += 0.10;
                // ═══ BOARD EVOLUTION: Bricked draws = more bluffs in opponent range ═══
                if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                    brickCallFreq += 0.08 * boardEvolution.drawsBricked.length; // Each bricked draw = more air
                }
                if (boardEvolution.evolution === 'static_brick') {
                    brickCallFreq += 0.06; // Total brick = high bluff frequency
                }
                // But if draws completed, opponent is less likely bluffing
                if (boardEvolution.drawsCompleted.length > 0) {
                    brickCallFreq -= 0.10; // They could have it
                }
                brickCallFreq = Math.max(0.10, Math.min(0.60, brickCallFreq));
                if (Math.random() < brickCallFreq) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }

            // FACTOR 6: Personality-driven call frequency
            // Loose players call more, tight players fold more
            if (isLoose && handEval.strength >= dynFoldThreshold - 5 && Math.random() < callFreq) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // FACTOR 7 (NEW): Light pot = wide ranges = call lighter
            // If the pot was built with little aggression, opponent's range is wide
            if (oppRangeStrength === 'weak' && handEval.strength >= 25 && betToPot <= 0.60) {
                if (Math.random() < 0.40) {
                    return canCall ? { type: 'call' } : { type: 'fold' };
                }
            }
        }

        // ════════════════════════════════════════════════════
        //  HERO CALL ENGINE (WORLD-CLASS)
        //  The hardest decision in poker — calling with marginal
        //  hands when you think opponent is bluffing.
        //  Uses: MDF math, blockers, reads, narrative, board texture
        // ════════════════════════════════════════════════════

        // Hero calls happen BELOW the dynamic fold threshold — these are hands
        // that "shouldn't" call by default but have strong reasons to.
        if (handEval.strength >= 18 && handEval.strength < dynFoldThreshold && canCall) {

            // ── BASE HERO CALL PROBABILITY ──
            // Start from MDF: we NEED to call some % to prevent exploitation
            // MDF tells us how often we need to defend to make opponent's bluffs breakeven
            let heroCallProb = 0;

            // ═══ POSITION-AWARE HERO CALL BASE ═══
            // IP hero calls wider (already closed action, no position disadvantage)
            // OOP hero calls tighter (especially vs large bets — can't see free cards)
            heroCallProb += posFreqMod.ipCallWidth;
            if (!isIP && betToPot >= 0.75) heroCallProb -= posFreqMod.oopFoldMoreVsBig;

            // ═══ POLARIZATION-DRIVEN HERO CALL ═══
            // Vs polarized: their range includes bluffs → hero calls are more profitable
            // Vs merged: they have value → hero calls burn money
            heroCallProb += polarCallMod;

            // If we're under-defending (folding more than 1-MDF), bump up calling
            const targetDefenseFreq = mdf; // e.g., 0.60 for 66% pot bet
            // We want ~targetDefenseFreq of our range to call. But we're at the bottom.
            // Give these bottom-of-range hands a base call freq proportional to MDF.
            heroCallProb = targetDefenseFreq * 0.25; // Start at 25% of MDF

            // ── BLOCKER-BASED HERO CALL ──
            // If we block opponent's value range, their bet is more likely a bluff
            if (blocksNutFlush) heroCallProb += 0.12; // We block their nut flush → more bluffs
            if (blocksSecondNutFlush) heroCallProb += 0.08;
            if (blocksTopSet) heroCallProb += 0.08; // We block their top set
            if (blocksOverpair) heroCallProb += 0.05; // We block AA/KK
            if (blocksStraight) heroCallProb += 0.06;

            // Combo blocker bonus
            const heroBlockerCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;
            if (heroBlockerCount >= 2) heroCallProb += 0.10; // Multiple blockers = strong call candidate

            // ═══ PHASE 36A: GRANULAR BLOCKER QUALITY → HERO CALL ═══
            // heroCallBlockerQuality combines rank-weighted value blocking + unblock analysis.
            // Captures: Ace-high blocker > King-high, and unblocking opponent's missed draws.
            if (heroCallBlockerQuality >= 0.25) {
                heroCallProb += 0.12; // Premium: blocks value + unblocks bluffs
            } else if (heroCallBlockerQuality >= 0.15) {
                heroCallProb += 0.06; // Good: meaningful blocker impact
            } else if (heroCallBlockerQuality < 0.05) {
                heroCallProb -= 0.04; // Poor: no blocker value, bad hero call candidate
            }

            // ── READ-BASED HERO CALL ──
            if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
                heroCallProb += 0.12; // Known bluffer: call wider
            }
            if (oppBluffFreq > 0.50 && oppConfidence > 0.4) {
                heroCallProb += 0.08; // Prolific bluffer: call even wider
            }
            if (oppTendency === 'bluffy') {
                heroCallProb += 0.06;
            }
            // Against known value-heavy players, fold more
            if (oppBluffFreq < 0.15 && oppConfidence > 0.4) {
                heroCallProb -= 0.15; // They rarely bluff → respect the bet
            }

            // ── TIMING TELL HERO CALL ADJUSTMENT ──
            // Opponent's decision speed on THIS bet gives real-time information
            if (oppInHandActions && oppInHandActions.lastAction) {
                const lastTiming = oppInHandActions.lastAction.timing || 0;
                if (lastTiming > 0 && lastTiming < 3000) {
                    // SNAP-BET: Quick decision → less deliberation → more likely auto-pilot or bluff
                    heroCallProb += 0.06;
                } else if (lastTiming > 15000) {
                    // LONG TANK then BET: Deliberated → more likely thin value (had to think about it)
                    // BUT: long tank then RAISE = usually strong (they tank-called their decision)
                    if (oppInHandActions.lastAction.action === 'bet') {
                        heroCallProb += 0.03; // Thin value → marginal call is OK
                    } else if (oppInHandActions.lastAction.action === 'raise') {
                        heroCallProb -= 0.06; // Tank-raise = usually real strength
                    }
                }
            }

            // ── IN-HAND SEQUENCE HERO CALL ──
            // Use the opponent's prior street actions in THIS hand to refine hero call
            if (oppInHandActions) {
                const inActs = oppInHandActions.actions || [];
                const wasPassiveEarlier = inActs.some(a => a.street !== street && a.action === 'check');
                const wasAggressiveEarlier = inActs.filter(a => a.street !== street && ['bet', 'raise'].includes(a.action)).length;

                // Passive earlier → now betting = could be trap or sudden strength
                if (wasPassiveEarlier && wasAggressiveEarlier === 0) {
                    heroCallProb -= 0.04; // Checked earlier, now betting = more likely value
                }
                // Consistently aggressive = wider range → hero call more
                if (wasAggressiveEarlier >= 2) {
                    heroCallProb += 0.05; // Triple barrel = polarized, bluff catchers are profitable
                }
            }

            // ── LIVE EXPLOIT HERO CALL ──
            // Specific exploit patterns directly impact hero calling profitability
            if (oppExploits.includes('frequent_overbetter') && betToPot >= 0.90) {
                heroCallProb += 0.10; // Known overbetter → their overbets include bluffs
            }
            if (oppExploits.includes('gives_up_easily') && street === 'river') {
                heroCallProb -= 0.06; // If they usually give up but bet river, it's more real
            }
            if (oppExploits.includes('one_and_done') && street === 'river') {
                heroCallProb -= 0.10; // They never barrel river unless it's value
            }

            // ── NARRATIVE-BASED HERO CALL ──
            // If opponent has been passive all hand but suddenly bets river → suspicious
            if (oppStreetAggression === 'light' && betToPot >= 0.60) {
                heroCallProb += 0.08; // Sudden aggression after passive line = often bluff
            }
            // If opponent bet every street (triple barrel) with a big final bet
            if (oppStreetAggression === 'very_heavy' && betToPot >= 0.75) {
                // Could be value OR committed bluff — use blockers to decide
                if (heroBlockerCount >= 1) heroCallProb += 0.06;
                else heroCallProb -= 0.05;
            }

            // ── BOARD TEXTURE HERO CALL ──
            // Board that bricked all draws → opponent's draws missed → more bluffs
            if (scareLevel === 0 && turnToRiverDelta <= -5) {
                heroCallProb += 0.08; // Draws missed: opponent more likely bluffing
            }
            // Board completed obvious draws but we still have showdown value
            if (scareLevel >= 2 && handEval.strength >= 30) {
                heroCallProb -= 0.06; // Draw completed → opponent more likely to have it
            }

            // ═══ BOARD EVOLUTION-DRIVEN HERO CALL ═══
            // The runout story tells us how likely opponent is bluffing
            if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) {
                // Draws bricked on river = opponent's semi-bluffs are now air
                // This is the #1 hero call scenario — their draws missed
                heroCallProb += 0.10 * boardEvolution.drawsBricked.length; // More bricked draws = more bluffs
                heroCallProb = Math.min(heroCallProb, 0.70); // Soft cap
            }
            if (boardEvolution.drawsCompleted.length > 0 && !handEval.category?.includes('flush') && !handEval.category?.includes('straight')) {
                // Draws completed and we don't have the draw = fold more
                heroCallProb -= 0.08 * boardEvolution.drawsCompleted.length;
                // But if we block the completed draw, still hero call
                if (blocksNutFlush && boardEvolution.drawsCompleted.includes('flush')) {
                    heroCallProb += 0.12; // We block their flush = more likely bluff
                }
            }
            if (boardEvolution.evolution === 'static_brick') {
                // River was a complete blank — opponent is more likely to be bluffing
                heroCallProb += 0.06;
            }
            if (boardEvolution.evolution === 'caller_favorable' && heroIsAggressor) {
                // River helped their range — their bets are more credible
                heroCallProb -= 0.06;
            }

            // ── BET SIZE ADJUSTMENT ──
            // Small bets = more likely thin value or blocker → can call wider
            if (betToPot <= 0.40) heroCallProb += 0.10;
            // Medium bets = standard — use base probability
            // Large bets = polarized → blockers matter more
            if (betToPot >= 0.80) {
                // Large bet is polarized: either nuts or bluff
                // Without blockers, fold more. With blockers, call more.
                if (heroBlockerCount === 0) heroCallProb -= 0.10;
                if (heroBlockerCount >= 2) heroCallProb += 0.05;
            }
            // Overbets are extremely polarized
            if (betToPot >= 1.2) {
                if (heroBlockerCount >= 1) heroCallProb += 0.05;
                else heroCallProb -= 0.08;
            }

            // ── PERSONALITY ADJUSTMENT ──
            heroCallProb += aggressionBias / 80; // Aggressive horses hero call more

            // ═══ EXPLOIT INTENSIFIER INTEGRATION ═══
            // When we have high-confidence reads, the exploit engine can override
            // the base hero call math with exploit-specific adjustments.
            if (oppConfidence >= 0.50) {
                // EXPLOIT: Prolific bluffer → dramatically widen hero calling range
                if (oppBluffFreq > 0.40) {
                    const blufferBoost = 0.15 + (oppBluffFreq - 0.40) * 1.5; // 15-30%+ boost
                    heroCallProb += Math.min(0.30, blufferBoost);
                    // With blockers + known bluffer = snap call
                    if (heroBlockerCount >= 2) heroCallProb += 0.10;
                }
                // EXPLOIT: Nit betting big → auto-fold (they have it)
                if (oppTendency === 'weak-tight' && betToPot >= 0.60 && oppConfidence >= 0.55) {
                    heroCallProb = Math.max(0, heroCallProb - 0.25);
                    // Only hero call nits with premium blockers
                    if (heroBlockerCount < 2) heroCallProb = 0;
                }
                // EXPLOIT: Calling station suddenly betting big → respect (they finally have it)
                if (oppCallFreq > 0.60 && oppBluffFreq < 0.20 && betToPot >= 0.75) {
                    heroCallProb = Math.max(0, heroCallProb - 0.15);
                }
            }

            // ═══ LIVE-READ HERO CALL ADJUSTMENTS (Phase 21) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High aggression frequency → they bet a LOT → more bluffs in range → call wider
                if (liveRead.aggFreq > 0.45) heroCallProb += 0.08;
                if (liveRead.aggFreq > 0.55) heroCallProb += 0.05; // Ultra aggressive
                // Low aggression → they rarely bet → when they do, it's real → fold more
                if (liveRead.aggFreq < 0.20) heroCallProb -= 0.08;
                // High WTSD → they go to showdown with wide range → our bluff catcher is better
                if (liveRead.wtsd !== null && liveRead.wtsd > 0.30) heroCallProb += 0.06;
                // Low WTSD → they give up without showdown → if they bet river, it's real
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22 && street === 'river') heroCallProb -= 0.06;
                // Live bluff rate (showdown bluffs) → direct hero call indicator
                if (liveRead.bluffRate !== null && liveRead.bluffRate > 0.30) {
                    heroCallProb += 0.10; // Known live bluffer → call wider
                }
                if (liveRead.bluffRate !== null && liveRead.bluffRate < 0.10) {
                    heroCallProb -= 0.08; // Never bluffs → fold marginals
                }
                // Timing tell on THIS action
                if (currentActionTimingTell === 'snap_aggression') {
                    // Snap bet/raise = polarized (auto-bluff or nuts)
                    if (heroBlockerCount >= 1) heroCallProb += 0.08;
                    else heroCallProb -= 0.03;
                }
                if (currentActionTimingTell === 'tank_aggression') {
                    // Long tank then bet = marginal/thin value → hero call is profitable
                    heroCallProb += 0.06;
                }
                if (currentActionTimingTell === 'deliberate') {
                    heroCallProb += 0.03; // Standard decision → slight call
                }
                // One-and-done live detection: low second barrel + betting now = real
                if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30 && street === 'river') {
                    heroCallProb -= 0.08; // They rarely barrel → river bet is value
                }
            }

            // Clamp
            heroCallProb = Math.max(0, Math.min(0.65, heroCallProb));

            if (heroCallProb > 0.05 && Math.random() < heroCallProb) {
                console.log(`[HorseBrain] 🦸 HERO CALL: str=${handEval.strength} blockers=${heroBlockerCount} bq=${heroCallBlockerQuality.toFixed(2)} oppBluff=${(oppBluffFreq * 100).toFixed(0)}% bet=${Math.round(betToPot * 100)}%pot prob=${Math.round(heroCallProb * 100)}% live=${liveRead?.confidence?.toFixed(2) ?? '?'}`);
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }

        // ════════════════════════════════════════════════════
        //  RIVER CHECK-RAISE (OOP) — WORLD-CLASS
        //  The most polarized action in poker: check-raise river
        //  = absolute nuts or pure bluff with blockers.
        //  This section covers BOTH value and bluff check-raises.
        // ════════════════════════════════════════════════════
        if (!isIP && canRaise) {

            // ── VALUE CHECK-RAISE: Nuts (80+) ──
            // The classic trap: check, let opponent bet, then raise huge
            if (handEval.strength >= 80) {
                let valueCRFreq = 0.55;
                // Against bluffy opponents: ALWAYS check-raise (they bet wide)
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) valueCRFreq = 0.75;
                // Against callers: check-raise bigger (they call raises too)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) valueCRFreq = 0.65;
                // Against passive opponents who bet rare → they have it too, check-raise smaller
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3 && betToPot >= 0.60) {
                    valueCRFreq = 0.80; // They bet = they have value → we have MORE value
                }
                // Narrative: if we've been passive all hand, check-raise is very unexpected
                if (narrative.checkBehindCount >= 2 || (narrative.heroCheckedFlop && narrative.heroCheckedTurn)) {
                    valueCRFreq += 0.10; // Passive line → surprise check-raise gets max value
                }
                // Polarization: check-raise bigger with polarized range
                const crPolarMod = riverRangeType === 'polarized' ? 1.15 : 0.90;

                // ═══ LIVE-READ RIVER VALUE CR ADJUSTMENTS ═══
                valueCRFreq += liveCRBoost; // Pre-computed from c-bet %, fold-to-raise, timing tells
                // River-specific: snap-call on river = they auto-called turn = may be on autopilot
                if (currentActionTimingTell === 'snap_call') valueCRFreq += 0.06;
                // Tank-call on river = they're agonizing = strong hand or hero call → be careful
                if (currentActionTimingTell === 'tank_call') valueCRFreq -= 0.04;
                // Live fold-to-raise data: high folders get check-raised more
                if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null) {
                    if (liveRead.foldToRaisePct > 0.55) valueCRFreq += 0.06;
                    if (liveRead.foldToRaisePct < 0.25) valueCRFreq -= 0.05;
                }

                valueCRFreq = Math.max(0.30, Math.min(0.85, valueCRFreq));

                if (Math.random() < valueCRFreq) {
                    // Sizing: want to set up an all-in if possible
                    let crMult = 2.8;
                    if (spr <= 3) return { type: 'all_in' }; // Low SPR: just jam
                    if (spr <= 6) crMult = 3.2 * crPolarMod; // Medium: bigger to commit
                    else crMult = 2.5 * crPolarMod; // Deep: standard
                    // Against callers, size up
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) crMult = Math.min(4.0, crMult * 1.15);
                    // Live-read sizing: adjust based on opponent tendencies
                    crMult *= liveCRSizeMod; // Pre-computed: 1.12 vs callers, 0.92 vs folders
                    crMult = Math.max(2.0, Math.min(4.5, crMult));
                    const crSize = Math.round(toCall * crMult);
                    console.log(`[HorseBrain] 💎 RIVER VALUE CR: str=${handEval.strength} mult=${crMult.toFixed(1)}x polar=${riverRangeType} liveCR=${liveCRBoost.toFixed(2)}`);
                    return { type: raiseAction.type, amount: clampAmt(crSize) };
                }
                // If not check-raising, just call (we have the nuts)
                return canCall ? { type: 'call' } : { type: 'fold' };
            }

            // ── BLUFF CHECK-RAISE: Air with premium blockers ──
            // The highest-level bluff in poker: check-raise river as a bluff.
            // Requirements: (1) premium blockers to value range, (2) opponent bets wide,
            // (3) credible story (or at least opponent can't know our story).
            // GTO: ~10-20% of river check-raises should be bluffs for balance.
            if (handEval.strength < 20 && !multiway) {
                const crBlkCount = [blocksNutFlush, blocksSecondNutFlush, blocksTopSet, blocksOverpair, blocksStraight].filter(Boolean).length;

                if (crBlkCount >= 1) {
                    let bluffCRFreq = 0.05 + aggressionBias / 80;

                    // ═══ BLOCKER QUALITY ═══
                    if (blocksNutFlush) bluffCRFreq += 0.10; // Best blocker for bluff c/r
                    if (crBlkCount >= 2) bluffCRFreq += 0.08; // Multiple blockers
                    if (crBlkCount >= 3) bluffCRFreq += 0.05; // Elite blocker hand

                    // ═══ OPPONENT PROFILE ═══
                    if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.08;
                    if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffCRFreq += 0.06;
                    // NEVER bluff check-raise calling stations
                    if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffCRFreq = 0;
                    // Against known bluffers: they'll bet with air, but also call raises → careful
                    if (oppTendency === 'bluffy' && oppConfidence > 0.3) bluffCRFreq *= 0.50;

                    // ═══ BOARD EVOLUTION ═══
                    // Completed draws on river = very credible bluff check-raise (rep the draw)
                    if (boardEvolution.drawsCompleted.length > 0) bluffCRFreq += 0.06;
                    // Bricked draws = less credible (opponent knows draws missed)
                    if (boardEvolution.drawsBricked && boardEvolution.drawsBricked.length > 0) bluffCRFreq -= 0.04;
                    // PFR-favorable river = credible for aggressor
                    if (boardEvolution.evolution === 'pfr_favorable' && !heroIsAggressor) bluffCRFreq += 0.04;

                    // ═══ NARRATIVE ═══
                    // Passive line → sudden check-raise = polarized = credible
                    if (narrative.heroCheckedFlop || narrative.checkBehindCount >= 1) bluffCRFreq += 0.04;
                    // Triple check → bet-raise is unexpected but very polarized
                    if (narrative.checkBehindCount >= 2) bluffCRFreq += 0.03;

                    // ═══ BET SIZE TELLS ═══
                    // Small bet from opponent = they have thin value → bluff c/r is very effective
                    if (betToPot <= 0.40) bluffCRFreq += 0.06;
                    // Large bet = they're committed → bluff c/r is risky
                    if (betToPot >= 0.75) bluffCRFreq -= 0.04;

                    // ═══ LIVE-READ RIVER BLUFF CR ADJUSTMENTS ═══
                    bluffCRFreq += liveCRBoost * 0.60; // Bluff CR uses dampened boost (60% of value)
                    // Timing tells: snap-aggression from opp = they're confident → don't bluff
                    if (currentActionTimingTell === 'snap_aggression') bluffCRFreq -= 0.06;
                    // Tank bet from opponent = they agonized over betting → often thin value → bluff CR works
                    if (currentActionTimingTell === 'deliberate') bluffCRFreq += 0.05;
                    // Live fold-to-raise: high folders are prime bluff CR targets
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null) {
                        if (liveRead.foldToRaisePct > 0.60) bluffCRFreq += 0.08;
                        if (liveRead.foldToRaisePct < 0.30) bluffCRFreq -= 0.06;
                    }
                    // Live WTSD: players who rarely go to showdown fold to big river action
                    if (liveRead && liveRead.confidence >= 0.20 && liveRead.wtsd !== null) {
                        if (liveRead.wtsd < 0.22) bluffCRFreq += 0.05;
                        if (liveRead.wtsd > 0.38) bluffCRFreq -= 0.06;
                    }

                    // ═══ 3-BET POT: No bluff check-raises (ranges too strong) ═══
                    if (is3BetPot) bluffCRFreq *= 0.30;
                    if (is4BetPot) bluffCRFreq = 0;

                    bluffCRFreq = Math.max(0, Math.min(0.22, bluffCRFreq)); // Hard cap at 22%

                    if (Math.random() < bluffCRFreq) {
                        // Bluff c/r sizing should mirror value c/r sizing (opponent can't distinguish)
                        let crMult = spr <= 5 ? 3.2 : 2.8;
                        // With nut flush blocker, can go bigger (opponent is less likely to have it)
                        if (blocksNutFlush) crMult = Math.min(4.0, crMult + 0.5);
                        // Live-read bluff sizing: mirror value sizing for balance
                        crMult *= liveCRSizeMod;
                        // Against high fold-to-raise: smaller bluff CR saves chips (they fold anyway)
                        if (liveRead && liveRead.confidence >= 0.20 && liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.60) {
                            crMult = Math.max(2.2, crMult * 0.90); // Efficient bluff
                        }
                        crMult = Math.max(2.0, Math.min(4.5, crMult));
                        const crSize = Math.round(toCall * crMult);
                        console.log(`[HorseBrain] 🎭 RIVER BLUFF CR: blockers=${crBlkCount} oppFold=${Math.round(oppFoldFreq * 100)}% freq=${Math.round(bluffCRFreq * 100)}% liveCR=${liveCRBoost.toFixed(2)}`);
                        return { type: raiseAction.type, amount: clampAmt(crSize) };
                    }
                }
            }
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOP HEURISTIC ENGINE — DEDICATED WORLD-CLASS FLOP DECISION MAKER
// ═══════════════════════════════════════════════════════════════════════════
//
// Called from getDecision() when PioSolver lacks flop data.
// The flop is the foundation — every decision here shapes the turn and river.
//
// Key principles:
// 1. C-BET: frequency and sizing driven by board texture, position, and opponent type
// 2. DONK DEFENSE: when BB connects with board, lead into PFR
// 3. CHECK-RAISE: trapping and semi-bluffing OOP with board awareness
// 4. RANGE ADVANTAGE: who benefits most from this board texture?
// 5. DRAW MANAGEMENT: semi-bluff, protect, or realize equity
// 6. POT CONTROL: showdown-value hands don't need to build the pot
//
function makeFlopHeuristicDecision(params) {
    if (!params || typeof params !== 'object') return { action: 'check', amount: 0, reason: 'invalid_params' }; // Bug #47: guard null params
    const {
        holeCards, board, handStr, position, stackBB, potSize,
        toCall, bb, numPlayers, legalActions, profileId,
        aggressionBias = 0, loosenessBias = 0,
        opponentAdjustment = { callMod: 0, foldMod: 0 },
        enrichedOpponentRead = null,
        heroIsAggressor = false,
        counterStrategyMode = 'standard',
        // ═══ ALWAYS-ON LIVE OBSERVER DATA ═══
        tableId = 'unknown',
        primaryOppId = null,
    } = params;

    if (!holeCards || holeCards.length < 2 || !board || board.length < 3) return null;

    // ── Core evaluations ──
    const handEval = evaluatePostflopHand(holeCards, board);
    const drawEq = getDrawEquity(handEval, 'flop');
    const boardWet = evaluateBoardWetness(board);
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const facingBet = toCall > 0;
    const heroStack = stackBB * bb;
    const spr = heroStack / Math.max(1, potSize);
    const betToPot = facingBet ? toCall / Math.max(1, potSize) : 0;

    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const multiway = numPlayers >= 3;

    // Clamp helper
    const clampAmt = (amt) => {
        if (!raiseAction) return amt;
        return Math.max(raiseAction.minAmount || amt, Math.min(amt, raiseAction.maxAmount || amt));
    };

    // ── BOARD TEXTURE ANALYSIS ──
    const boardRanks = board.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a);
    const boardSuits = board.map(c => c[1]);
    const suitCounts = {};
    boardSuits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts));
    const boardIsMonotone = maxSuitCount === 3;
    const boardHasFlushDraw = maxSuitCount >= 2;

    // ═══ UPGRADED MULTIWAY ADJUSTMENTS (FLOP) ═══
    // Phase 48e FIX #7: was 'semi_wet' — not a recognized value anywhere in the system.
    // Standard vocabulary: 'dry', 'medium', 'wet'. Flush-draw boards are 'medium' (consistent with evaluateBoardWetness).
    const boardWetness = boardIsMonotone ? 'wet' : boardHasFlushDraw ? 'medium' : 'dry';
    const mwAdj = multiway ? getMultiwayAdjustment(numPlayers, {
        position, street: 'flop', boardWetness, heroIsAggressor
    }) : { strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 0, cbetFreqMod: 0, callWidthMod: 0, adjustSizing: 0 };
    const boardIsPaired = new Set(board.map(c => c[0])).size < 3;
    const boardIsTrips = new Set(board.map(c => c[0])).size === 1;
    const boardHighCards = board.filter(c => RANKS.indexOf(c[0]) >= 9).length; // J+ = index 9 (T is index 8)
    const boardIsHigh = boardHighCards >= 2; // Broadway-heavy
    const boardIsLow = board.every(c => RANKS.indexOf(c[0]) < 8); // All below 9
    const boardIsMedium = !boardIsHigh && !boardIsLow;

    // Connectivity
    const sortedRanks = [...boardRanks].sort((a, b) => a - b);
    let connectivity = 0;
    for (let i = 1; i < sortedRanks.length; i++) {
        if (sortedRanks[i] - sortedRanks[i - 1] <= 2) connectivity++;
    }
    const boardIsConnected = connectivity >= 2;
    const boardHasStraightDraw = connectivity >= 1;

    // ── OPPONENT READS ──
    let oppTendency = 'balanced', oppConfidence = 0, oppCallFreq = 0.50;
    let oppFoldFreq = 0.50, oppBluffFreq = 0.30, oppCbetFreq = 0.60;
    if (enrichedOpponentRead) {
        oppTendency = enrichedOpponentRead.tendency || 'balanced';
        oppConfidence = enrichedOpponentRead.confidence || 0;
        oppCallFreq = enrichedOpponentRead.callFrequency ?? 0.50;
        oppFoldFreq = enrichedOpponentRead.foldFrequency ?? 0.50;
        oppBluffFreq = enrichedOpponentRead.bluffFrequency ?? 0.30;
    } else {
        if (opponentAdjustment.foldMod > 0) { oppTendency = 'weak-tight'; oppFoldFreq = 0.55 + opponentAdjustment.foldMod / 20; }
        if (opponentAdjustment.callMod > 0) { oppCallFreq = 0.55 + opponentAdjustment.callMod / 20; }
        oppConfidence = Math.abs(opponentAdjustment.callMod + opponentAdjustment.foldMod) > 0 ? 0.35 : 0;
    }

    // ═══ SESSION MODEL OVERLAY (FLOP) ═══
    // Blend real-time session reads into flop opponent profile
    // ═══ BUG FIX: Was passing hero's profileId — now passes primaryOppId ═══
    const flopSessionRead = primaryOppId ? getOpponentSessionRead(primaryOppId) : null;
    if (flopSessionRead && flopSessionRead.confidence >= 0.15) {
        const sw = Math.min(0.60, flopSessionRead.confidence);
        const lw = 1.0 - sw;
        oppFoldFreq = lw * oppFoldFreq + sw * flopSessionRead.foldFreq;
        oppCallFreq = lw * oppCallFreq + sw * flopSessionRead.callFreq;
        if (flopSessionRead.bluffRate !== null) {
            oppBluffFreq = lw * oppBluffFreq + sw * flopSessionRead.bluffRate;
        }
        if (flopSessionRead.cbetRate !== null) {
            oppCbetFreq = lw * oppCbetFreq + sw * flopSessionRead.cbetRate;
        }
        if (flopSessionRead.confidence >= 0.30 && flopSessionRead.sessionTendency !== 'balanced') {
            oppTendency = flopSessionRead.sessionTendency;
        }
        oppConfidence = Math.min(0.90, oppConfidence + flopSessionRead.confidence * 0.3);
    }

    // ═══ ALWAYS-ON LIVE OBSERVER OVERLAY (FLOP) ═══
    // The live observer has real-time data from every action this opponent has taken.
    // Higher priority than session model because it includes timing tells + in-hand actions.
    const flopLiveRead = primaryOppId ? getLiveRead(profileId, tableId, primaryOppId) : null;
    if (flopLiveRead && flopLiveRead.confidence >= 0.10) {
        const livew = Math.min(0.70, flopLiveRead.confidence);
        const prevw = 1.0 - livew;

        // ═══ NaN/INTEGRITY GUARD FOR FLOP LIVE DATA (Phase 32) ═══
        const fSafe = (v, fb) => (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : fb;
        oppFoldFreq = prevw * oppFoldFreq + livew * fSafe(flopLiveRead.foldFreq, oppFoldFreq);
        oppCallFreq = prevw * oppCallFreq + livew * fSafe(flopLiveRead.callFreq, oppCallFreq);
        if (flopLiveRead.bluffRate !== null && !isNaN(flopLiveRead.bluffRate)) {
            oppBluffFreq = prevw * oppBluffFreq + livew * flopLiveRead.bluffRate;
        }
        if (flopLiveRead.cBetPct !== null && !isNaN(flopLiveRead.cBetPct)) {
            oppCbetFreq = prevw * oppCbetFreq + livew * flopLiveRead.cBetPct;
        }

        // ═══ FREQUENCY SANITY CLAMP (Phase 32) ═══
        oppFoldFreq = Math.max(0, Math.min(1, oppFoldFreq));
        oppCallFreq = Math.max(0, Math.min(1, oppCallFreq));
        oppBluffFreq = Math.max(0, Math.min(1, oppBluffFreq));
        oppCbetFreq = Math.max(0, Math.min(1, oppCbetFreq));

        // Player type from live observation
        if (flopLiveRead.confidence >= 0.25 && flopLiveRead.playerType !== 'unknown') {
            oppTendency = flopLiveRead.playerType;
        }
        oppConfidence = Math.min(0.95, oppConfidence + flopLiveRead.confidence * 0.4);

        // ═══ LIVE EXPLOIT DETECTION (FLOP) ═══
        const flopExploits = flopLiveRead.exploits || [];
        if (flopExploits.includes('overfolds_to_cbet')) {
            oppFoldFreq = Math.max(oppFoldFreq, 0.55);
        }
        if (flopExploits.includes('overcbets')) {
            oppCbetFreq = Math.max(oppCbetFreq, 0.72);
        }
        if (flopExploits.includes('one_and_done')) {
            // They c-bet but give up on turn → call flop wider, plan to take over on turn
            oppFoldFreq = Math.max(oppFoldFreq, 0.50);
        }
        if (flopExploits.includes('station_to_showdown')) {
            oppCallFreq = Math.max(oppCallFreq, 0.65);
            oppBluffFreq = Math.min(oppBluffFreq, 0.10);
        }
        if (flopExploits.includes('frequent_check_raiser')) {
            // Be careful about small c-bets — they'll check-raise us
            oppBluffFreq = Math.max(oppBluffFreq, 0.28);
        }
        if (flopExploits.includes('overfolds_to_3bet')) {
            // Useful context — they fold too much to 3-bets preflop
            // (May carry over into postflop: passive tendencies)
            oppFoldFreq = Math.max(oppFoldFreq, 0.48);
        }

        console.log(`[HorseBrain] 👁️ FLOP LIVE: ${primaryOppId?.substring(0, 8)} type=${flopLiveRead.playerType} cbet=${flopLiveRead.cBetPct !== null ? Math.round(flopLiveRead.cBetPct * 100) + '%' : '?'} foldCB=${flopLiveRead.foldToCBetPct !== null ? Math.round(flopLiveRead.foldToCBetPct * 100) + '%' : '?'} exploits=[${flopExploits.join(',')}]`);
    }

    // ═══ IN-HAND ACTION SEQUENCE → C-BET MODIFIERS ═══
    // Opponent's PREFLOP action in THIS hand narrows their range → adjust c-bet.
    // Limper: very wide, passive → c-bet aggressively
    // Cold caller: suited connectors, small pairs → c-bet more
    // 3-bettor: strong range → c-bet less, smaller sizing
    let inHandCBetMod = 0;
    let inHandCBetSizeMod = 0;
    if (flopLiveRead && flopLiveRead.inHandActions) {
        const inHandActs = flopLiveRead.inHandActions.actions || [];
        const oppPreflopAct = inHandActs.find(a => a.street === 'preflop');
        if (oppPreflopAct) {
            if (oppPreflopAct.action === 'call' && oppPreflopAct.isOpenAction) {
                inHandCBetMod = 0.12; inHandCBetSizeMod = -0.04; // Limper = very wide
            } else if (oppPreflopAct.action === 'call') {
                inHandCBetMod = 0.06; // Cold caller = capped range
            } else if (oppPreflopAct.action === 'raise' && oppPreflopAct.facingRaiseCount >= 2) {
                inHandCBetMod = -0.20; inHandCBetSizeMod = -0.10; // 4-bet caller = monsters
            } else if (oppPreflopAct.action === 'raise' && oppPreflopAct.facingRaiseCount >= 1) {
                inHandCBetMod = -0.10; inHandCBetSizeMod = -0.06; // 3-bettor = strong
            }
        }
    }

    // ── RANGE ADVANTAGE ASSESSMENT ──
    // PFR has range advantage on high boards (broadway cards favor premium hands)
    // Caller has range advantage on low, connected boards (suited connectors, small pairs)
    let rangeAdvantage = 'neutral'; // 'pfr', 'caller', or 'neutral'
    if (heroIsAggressor) {
        if (boardIsHigh && !boardIsConnected) rangeAdvantage = 'pfr';
        else if (boardIsLow && boardIsConnected) rangeAdvantage = 'caller';
        else if (boardIsPaired && boardIsHigh) rangeAdvantage = 'pfr';
        else if (boardIsMonotone) rangeAdvantage = 'caller'; // Flushes favor wide calling ranges
    } else {
        // We're the caller — flip the assessment
        if (boardIsHigh && !boardIsConnected) rangeAdvantage = 'caller'; // PFR has it, bad for us
        else if (boardIsLow && boardIsConnected) rangeAdvantage = 'pfr'; // We connect, good
        else if (boardIsMonotone) rangeAdvantage = 'pfr'; // We have suited hands more often
    }

    const isPotCommitted = spr <= 2;

    // ═══ LIMPED POT DETECTION (FLOP) ═══
    // If nobody raised preflop and pot is small, ranges are wide — adjust strategy.
    const flopIsLimpedPot = !heroIsAggressor && potSize / bb <= numPlayers * 2.5;

    // ═══ 3-BET POT DETECTION (FLOP) ═══
    // 3-bet pots have fundamentally different dynamics:
    // - SPR is typically 3-6 (vs 8-15 in single-raised pots)
    // - Ranges are much narrower (both players have strong holdings)
    // - C-bet frequencies should be LOWER (opponent's range is stronger)
    // - Sizing should be SMALLER (ranges are condensed, small bets are effective)
    // - Board coverage: high boards favor both ranges, low boards still favor PFR
    // Detection heuristic: hero raised preflop AND pot is large relative to blinds for heads-up
    const expectedSRPSize = numPlayers * 2 * bb; // Single-raised pot size estimate
    const is3BetPot = heroIsAggressor && !flopIsLimpedPot && potSize > expectedSRPSize * 2.2 && numPlayers <= 3;
    const is4BetPot = heroIsAggressor && !flopIsLimpedPot && potSize > expectedSRPSize * 5.0 && numPlayers <= 2;

    // 3-bet pot strategy adjustments
    let threeBetCbetMod = 0;      // Frequency modifier for c-bets in 3-bet pots
    let threeBetSizeMod = 0;      // Sizing modifier (negative = smaller)
    let threeBetValueThreshold = 0; // Lower value threshold (ranges are narrower)
    if (is4BetPot) {
        // 4-bet pots: SPR is tiny (~2-3), just jam with any equity
        threeBetCbetMod = 0.20;          // C-bet very frequently (we have massive range advantage)
        threeBetSizeMod = -0.15;         // Small sizing (33% is standard in 4-bet pots)
        threeBetValueThreshold = -15;    // Much lower value threshold
    } else if (is3BetPot) {
        // 3-bet pots: c-bet less often but with purpose
        if (rangeAdvantage === 'pfr') {
            threeBetCbetMod = 0.05;      // Slight boost on PFR-favorable boards
            threeBetSizeMod = -0.12;     // 33% pot standard
        } else if (rangeAdvantage === 'caller') {
            threeBetCbetMod = -0.15;     // Much less c-betting on caller-favorable boards
            threeBetSizeMod = -0.08;     // Slightly smaller
        } else {
            threeBetCbetMod = -0.05;     // Slight reduction on neutral boards
            threeBetSizeMod = -0.10;     // Standard small sizing
        }
        threeBetValueThreshold = -8;     // Ranges are stronger → commit with slightly less
    }

    // ═══ RANGE ADVANTAGE → C-BET MODIFIER ═══
    // rangeAdvantage is computed but was never wired into decisions — fix that now.
    let rangeAdvCbetMod = 0;
    let rangeAdvSizeMod = 0;
    if (heroIsAggressor) {
        if (rangeAdvantage === 'pfr') {
            rangeAdvCbetMod = 0.10;      // PFR range advantage → c-bet more freely
            rangeAdvSizeMod = -0.05;     // Can use smaller sizing (range advantage does the work)
        } else if (rangeAdvantage === 'caller') {
            rangeAdvCbetMod = -0.12;     // Caller range advantage → c-bet less
            rangeAdvSizeMod = 0.05;      // When we do bet, go bigger (need protection)
        }
    }

    // ═══ LIVE FOLD-TO-CBET MODIFIER ═══
    // The live observer tells us EXACTLY how often this opponent folds to c-bets.
    // This is arguably the single most exploitable stat in poker.
    // High fold-to-cbet → print money by c-betting wider
    // Low fold-to-cbet → only c-bet for value (they're calling/raising everything)
    let liveCBetMod = 0;
    let liveCBetSizeMod = 0;
    if (flopLiveRead) {
        if (flopLiveRead.foldToCBetPct !== null && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.foldToCBetPct > 0.65) {
                // They fold to c-bets way too much → c-bet everything, go small
                liveCBetMod = 0.15;
                liveCBetSizeMod = -0.08; // Smaller — they'll fold to any size
            } else if (flopLiveRead.foldToCBetPct > 0.55) {
                // Above average fold rate → c-bet a bit wider
                liveCBetMod = 0.08;
                liveCBetSizeMod = -0.04;
            } else if (flopLiveRead.foldToCBetPct < 0.35) {
                // They almost never fold to c-bets → only bet for value
                liveCBetMod = -0.15;
                liveCBetSizeMod = 0.06; // Bigger when we do bet (for value)
            } else if (flopLiveRead.foldToCBetPct < 0.42) {
                // Below average fold rate → tighten c-bet range
                liveCBetMod = -0.08;
                liveCBetSizeMod = 0.03;
            }
        }

        // ═══ LIVE SECOND BARREL TENDENCY ═══
        // If opponent folds to barrels (turn after calling flop c-bet), c-bet more
        // because even if they call flop, we can take it on turn
        if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.confidence >= 0.25) {
            // Their barrel rate tells us how THEY play turn — but we care about fold-to-barrel
            // Proxy: if they rarely barrel themselves, they often give up → we can barrel more
        }

        // ═══ PHASE 17: CHECK-RAISE AWARE C-BET SIZING ═══
        // If opponent check-raises frequently, we need to SIZE DOWN our c-bets
        // to reduce our loss when they pop us. This is a critical exploit-defense.
        if (flopLiveRead.checkRaisePct !== null && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.checkRaisePct > 0.12) {
                // Frequent check-raiser → size down c-bets significantly
                liveCBetSizeMod -= 0.06;
                // Also c-bet less with air (they punish light c-bets)
                if (handEval.strength < 30) liveCBetMod -= 0.10;
            } else if (flopLiveRead.checkRaisePct < 0.04) {
                // Rarely check-raises → we can c-bet fearlessly, even size up
                liveCBetSizeMod += 0.04;
                liveCBetMod += 0.05;
            }
        }

        // ═══ PHASE 17: FLOP CURRENT-ACTION TIMING TELL ═══
        // If opponent checked slowly (long-tanked before checking), they considered betting
        // → they have something but are trying to trap. Be cautious with light c-bets.
        let flopTimingTell = 'unknown';
        if (flopLiveRead.inHandActions && flopLiveRead.inHandActions.lastAction) {
            const lastAct = flopLiveRead.inHandActions.lastAction;
            if (lastAct.timing && lastAct.street === 'flop') {
                const streetAvg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = lastAct.timing / streetAvg;
                    if (ratio < 0.40 && lastAct.action === 'check') {
                        flopTimingTell = 'snap_check'; // Quick check = weak, c-bet freely
                        liveCBetMod += 0.06;
                    } else if (ratio > 1.8 && lastAct.action === 'check') {
                        flopTimingTell = 'tank_check'; // Slow check = trapping or strong draw
                        liveCBetMod -= 0.08;
                        liveCBetSizeMod -= 0.04; // Smaller if we do bet
                    }
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  NOT FACING A BET
    // ══════════════════════════════════════════════════════════
    if (!facingBet) {

        // ── POT COMMITTED: Jam with decent+ hands ──
        if (isPotCommitted && handEval.strength >= 40 && canRaise) {
            return { type: 'all_in' };
        }

        // ═══ LIMPED POT FLOP STRATEGY ═══
        // In limped pots, nobody has range advantage. Bet for value with strong hands,
        // check medium hands (showdown value in a small pot), and rarely bluff.
        if (flopIsLimpedPot && !isPotCommitted) {
            // Strong hands: bet for value (others limped wide, they'll pay off)
            if (handEval.strength >= 65 && canRaise) {
                const limpValueFrac = boardWetness === 'wet' ? 0.60 : 0.45;
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * limpValueFrac)) };
            }
            // Medium hands: mostly check (pot is small, showdown value is fine)
            if (handEval.strength >= 35 && handEval.strength < 65) {
                // Only bet on wet boards for protection
                if (boardWetness === 'wet' && handEval.strength >= 50 && canRaise && Math.random() < 0.30) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
                }
                return { type: 'check' };
            }
            // Strong draws: semi-bluff at reduced frequency
            if (drawEq.outs >= 10 && canRaise && Math.random() < 0.25) {
                return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.50)) };
            }
            // Weak hands: check (don't bluff into a multi-way limped pot)
            return canCheck ? { type: 'check' } : { type: 'fold' };
        }

        // ════════════════════════════════════════
        //  C-BET STRATEGY (when hero was PFR)
        // ════════════════════════════════════════
        if (heroIsAggressor && canRaise) {

            // ═══ BOARD-TEXTURE-DRIVEN C-BET STRATEGY ═══

            // STRATEGY 1: HIGH DRY BOARDS → Small c-bet, very high frequency
            // PFR has massive range advantage (Ax, broadway). Bet small, bet often.
            if (boardIsHigh && !boardIsConnected && !boardIsMonotone && boardWet === 'dry') {
                let cbetFreq = 0.80; // Near-100% c-bet range
                let cbetFrac = boardIsPaired ? 0.25 : 0.33; // Tiny sizing

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod;
                cbetFrac = Math.max(0.20, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod);

                if (multiway) cbetFreq = Math.max(0.30, 0.55 + mwAdj.cbetFreqMod); // Tighten multiway (position/texture aware)
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    // Against callers: only c-bet with equity
                    if (handEval.strength < 35 && drawEq.outs < 6) cbetFreq = 0.30;
                    else cbetFrac = 0.50; // Bigger for value
                }
                if (oppFoldFreq > 0.55 && oppConfidence > 0.3) cbetFreq = 0.90; // Print money

                // ═══ LIVE-READ HIGH DRY C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Extreme folder on dry boards = print money with any two
                    if (flopLiveRead.foldFreq > 0.60) cbetFreq = Math.min(0.95, cbetFreq + 0.10);
                    // Station on dry board = only value c-bet, size up
                    if (flopLiveRead.callFreq > 0.60) {
                        if (handEval.strength < 30 && drawEq.outs < 6) cbetFreq = Math.max(0.15, cbetFreq - 0.20);
                        else cbetFrac = Math.min(0.55, cbetFrac + 0.10);
                    }
                    // Check-raise threat on dry board = reduce with air
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength < 35) {
                        cbetFreq = Math.max(0.25, cbetFreq - 0.15);
                    }
                }

                cbetFreq = Math.max(0.10, Math.min(0.95, cbetFreq));
                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 2: LOW CONNECTED BOARDS → Polarized c-bet (strong or nothing)
            // Caller's range connects heavily. Only c-bet with strong hands or nut draws.
            if (boardIsLow && boardIsConnected) {
                let cbetFreq = 0;
                let cbetFrac = 0.50;

                if (handEval.strength >= 65) { cbetFreq = 0.75; cbetFrac = 0.55; } // Value
                else if (handEval.strength >= 50) { cbetFreq = 0.45; cbetFrac = 0.45; } // Thin value
                else if (drawEq.outs >= 10) { cbetFreq = 0.50; cbetFrac = 0.50; } // Strong draw semi-bluff
                else if (handEval.strength < 20) { cbetFreq = 0.15; cbetFrac = 0.33; } // Rare bluff
                // Nut advantage: if PFR has overpairs → can still c-bet
                if (handEval.category === 'overpair') { cbetFreq = 0.70; cbetFrac = 0.55; }

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod;
                cbetFrac = Math.max(0.25, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod);

                if (multiway) cbetFreq = Math.max(0.15, cbetFreq * (0.60 + mwAdj.cbetFreqMod));
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq += 0.10;

                // ═══ LIVE-READ LOW CONNECTED C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder → can c-bet wider on connected boards (they give up sets/two-pair)
                    if (flopLiveRead.foldFreq > 0.55) cbetFreq += 0.08;
                    // Station → only value bet, never bluff connected boards vs callers
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 45 && drawEq.outs < 9) {
                        cbetFreq = Math.max(0.05, cbetFreq - 0.15);
                    }
                    // Aggressive opp on connected board = check-raise risk → tighten bluffs
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 40) {
                        cbetFreq = Math.max(0.10, cbetFreq - 0.10);
                    }
                    // High WTSD → they're sticky, size up for value, down for bluffs
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30 && handEval.strength >= 50) {
                        cbetFrac = Math.min(0.65, cbetFrac + 0.06);
                    }
                }

                cbetFreq = Math.max(0, Math.min(0.80, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 3: MONOTONE BOARDS → Check most, bet only nut flush draws or monsters
            if (boardIsMonotone) {
                const heroHasFlushDraw = holeCards.some(c => c[1] === boardSuits[0]);
                const heroHasNutFD = heroHasFlushDraw && holeCards.some(c => c[1] === boardSuits[0] && RANKS.indexOf(c[0]) >= 12);

                let monoSizeFrac = handEval.strength >= 75 ? 0.50 : 0.40;
                let monoBetGate = handEval.strength >= 75 || (heroHasNutFD && handEval.strength >= 30);

                // ═══ LIVE-READ MONOTONE C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Extreme folder on monotone = can c-bet wider (they don't have flush)
                    if (flopLiveRead.foldFreq > 0.55 && handEval.strength >= 40) {
                        monoBetGate = true; // Open the gate for medium+ hands vs folders
                        monoSizeFrac = 0.33; // Small probe bet
                    }
                    // Station on monotone = DON'T bluff, size up value bets
                    if (flopLiveRead.callFreq > 0.55) {
                        if (handEval.strength >= 75) monoSizeFrac = Math.min(0.60, monoSizeFrac + 0.08);
                        if (handEval.strength < 75 && !heroHasNutFD) monoBetGate = false; // Close gate for non-monsters vs stations
                    }
                    // Aggressive opponent on monotone = they'll raise → only bet the nuts
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 75 && !heroHasNutFD) {
                        monoBetGate = false;
                    }
                    // If opp doesn't have flush themselves (low WTSD + high fold) → exploit with stab
                    if (flopLiveRead.foldFreq > 0.50 && flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.25) {
                        if (handEval.strength >= 35 && Math.random() < 0.30) {
                            monoBetGate = true;
                            monoSizeFrac = 0.30; // Small probe
                        }
                    }
                }

                if (monoBetGate) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * monoSizeFrac)) };
                }
                // Everything else: check (reverse implied odds, opponent has flush too often)
                return { type: 'check' };
            }

            // STRATEGY 4: PAIRED BOARDS → Small c-bet, high frequency (we represent trips)
            if (boardIsPaired && !boardIsConnected) {
                let cbetFreq = 0.70;
                let cbetFrac = 0.25; // Very small — we "always have it" on paired boards

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod;
                cbetFrac = Math.max(0.20, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod);

                if (handEval.strength >= 75) { cbetFrac = 0.40; } // Bigger with actual trips+
                if (multiway) cbetFreq = Math.max(0.25, 0.45 + mwAdj.cbetFreqMod);
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq = 0.85;

                // ═══ LIVE-READ PAIRED BOARD C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder on paired board = we always "have it", c-bet near 100%
                    if (flopLiveRead.foldFreq > 0.55) cbetFreq = Math.min(0.92, cbetFreq + 0.08);
                    // Station on paired board = they call with any pair, tighten range
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 40) {
                        cbetFreq = Math.max(0.20, cbetFreq - 0.15);
                    }
                    // Station with trips+ = size up for value
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength >= 65) {
                        cbetFrac = Math.min(0.50, cbetFrac + 0.10);
                    }
                    // Check-raise risk on paired boards (tricky opponents)
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.15 && handEval.strength < 50) {
                        cbetFreq = Math.max(0.20, cbetFreq - 0.12);
                    }
                }

                cbetFreq = Math.max(0.10, Math.min(0.90, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 5: WET BOARDS (flush draw + connected) → Larger c-bet, protect equity
            if (boardWet === 'wet') {
                let cbetFreq = 0.55;
                let cbetFrac = 0.60; // Bigger to charge draws

                if (handEval.strength >= 65) { cbetFreq = 0.80; cbetFrac = 0.66; } // Value + protection
                else if (handEval.strength >= 45) { cbetFreq = 0.55; cbetFrac = 0.55; } // Medium — bet to deny equity
                else if (drawEq.outs >= 9) { cbetFreq = 0.55; cbetFrac = 0.55; } // Semi-bluff
                else if (handEval.strength < 20) { cbetFreq = 0.20; cbetFrac = 0.50; } // Bluff
                else { cbetFreq = 0.30; cbetFrac = 0.45; } // Marginal — sometimes bet to take down

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod;
                cbetFrac = Math.max(0.30, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod);

                // Against callers on wet boards: tighter c-bet range but bigger sizing
                if (oppCallFreq > 0.60 && oppConfidence > 0.3) {
                    if (handEval.strength < 45 && drawEq.outs < 8) cbetFreq = 0.10; // Don't bluff callers
                    else cbetFrac = Math.min(0.75, cbetFrac + 0.08);
                }

                // ═══ LIVE-READ WET BOARD C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Station on wet board = NEVER bluff, only value + semi-bluff
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength < 40 && drawEq.outs < 8) {
                        cbetFreq = Math.max(0.05, cbetFreq - 0.20);
                    }
                    // Station + strong hand = size up to charge draws
                    if (flopLiveRead.callFreq > 0.55 && handEval.strength >= 55) {
                        cbetFrac = Math.min(0.75, cbetFrac + 0.06);
                    }
                    // Folder on wet board = bigger size (they fold even good draws)
                    if (flopLiveRead.foldFreq > 0.50) {
                        cbetFreq += 0.08;
                        cbetFrac = Math.min(0.72, cbetFrac + 0.04); // Slightly bigger to maximize fold eq
                    }
                    // Aggressive opp on wet board = check-raise city → be careful with mediocre hands
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength >= 35 && handEval.strength < 55) {
                        cbetFreq = Math.max(0.15, cbetFreq - 0.10);
                    }
                    // High WTSD on wet board = they're chasing draws → size up for protection
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30 && handEval.strength >= 50) {
                        cbetFrac = Math.min(0.75, cbetFrac + 0.06);
                    }
                }

                if (multiway) { cbetFreq = Math.max(0.10, cbetFreq * (0.55 + mwAdj.cbetFreqMod)); cbetFrac = Math.min(0.75, cbetFrac + 0.05); }
                cbetFreq = Math.max(0.05, Math.min(0.85, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }

            // STRATEGY 6: DEFAULT (medium texture) → Standard c-bet
            {
                let cbetFreq = isIP ? 0.65 : 0.50; // IP c-bets more
                let cbetFrac = 0.50;

                if (handEval.strength >= 65) cbetFreq = 0.80;
                else if (handEval.strength >= 40) cbetFreq = isIP ? 0.60 : 0.45;
                else if (drawEq.outs >= 8) cbetFreq = 0.50;
                else if (handEval.strength < 20) cbetFreq = 0.22;
                else cbetFreq = 0.30;

                // ═══ RANGE ADVANTAGE + 3-BET POT WIRING ═══
                cbetFreq += rangeAdvCbetMod + threeBetCbetMod + liveCBetMod + inHandCBetMod;
                cbetFrac = Math.max(0.25, cbetFrac + rangeAdvSizeMod + threeBetSizeMod + liveCBetSizeMod + inHandCBetSizeMod);

                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) cbetFreq += 0.12;
                if (oppCallFreq > 0.60 && oppConfidence > 0.3 && handEval.strength < 40) cbetFreq -= 0.15;

                // ═══ LIVE-READ DEFAULT C-BET (Phase 29) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Folder → c-bet wider, slightly smaller sizing
                    if (flopLiveRead.foldFreq > 0.55) {
                        cbetFreq += 0.08;
                        cbetFrac = Math.max(0.33, cbetFrac - 0.06);
                    }
                    // Station → tighten bluffs, size up value
                    if (flopLiveRead.callFreq > 0.55) {
                        if (handEval.strength < 35 && drawEq.outs < 8) cbetFreq = Math.max(0.10, cbetFreq - 0.15);
                        if (handEval.strength >= 50) cbetFrac = Math.min(0.65, cbetFrac + 0.06);
                    }
                    // Aggro opp → check-raise threat with weak hands
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength < 35 && drawEq.outs < 6) {
                        cbetFreq = Math.max(0.08, cbetFreq - 0.10);
                    }
                    // Check-raise threat → reduce bluff c-bets, keep value
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength < 45) {
                        cbetFreq = Math.max(0.10, cbetFreq - 0.10);
                    }
                }

                if (multiway) cbetFreq = Math.max(0.10, cbetFreq * (0.60 + mwAdj.cbetFreqMod));
                cbetFreq = Math.max(0.05, Math.min(0.80, cbetFreq));

                if (Math.random() < cbetFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * cbetFrac)) };
                }
                return { type: 'check' };
            }
        }

        // ════════════════════════════════════════
        //  NON-AGGRESSOR (caller) NOT FACING BET
        //  Checked to us, or we're first to act
        // ════════════════════════════════════════

        // ── POT COMMITTED ──
        if (isPotCommitted && handEval.strength >= 40 && canRaise) {
            return { type: 'all_in' };
        }

        // ── BB DONK-BET: Lead into PFR on range-favoring boards ──
        // ═══ 3-BET POT AWARENESS: Donk less in 3-bet pots (PFR's range is much stronger)
        // ═══ RANGE ADVANTAGE: Donk more when board favors caller's range
        if (!isIP && canRaise && !multiway) {

            // ── 3-bet/4-bet pot donk modifiers ──
            // In 3-bet pots, PFR has a capped but strong range — donk less frequently
            // In 4-bet pots, never donk (PFR has premiums, just check-raise or check-call)
            let donkPotMod = 0;
            let donkSizeMod = 0;
            if (is4BetPot) {
                donkPotMod = -1.0; // Effectively kills all donking
            } else if (is3BetPot) {
                donkPotMod = -0.15; // Reduce donk frequency
                donkSizeMod = -0.08; // Smaller sizes (SPR is lower)
            }

            // ── Range advantage donk modifiers ──
            // When board favors caller's range (low, connected), donk MORE
            // When board favors PFR's range (high, broadway-heavy), donk LESS
            let donkRangeMod = 0;
            if (rangeAdvantage === 'caller') {
                donkRangeMod = 0.12; // Board hits our range — lead out
            } else if (rangeAdvantage === 'pfr') {
                donkRangeMod = -0.10; // Board hits their range — check to them
            }

            // Two pair+ on low/connected boards → donk for value
            if (handEval.strength >= 65 && (boardIsLow || boardIsConnected) && !boardIsHigh) {
                let donkFreq = 0.40 + donkPotMod + donkRangeMod;
                if (oppCbetFreq > 0.70 && oppConfidence > 0.3) donkFreq += 0.15; // Deny their c-bet equity
                // ═══ LIVE-READ FLOP VALUE DONK (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // High c-bet: donk to deny (they'll bet anyway, but we control sizing)
                    if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.65) donkFreq += 0.10;
                    // Passive: donk more (they won't bet if we check)
                    if (flopLiveRead.aggFreq < 0.25) donkFreq += 0.08;
                    // Stations: donk bigger for value
                    if (flopLiveRead.callFreq > 0.55) donkFreq += 0.06;
                }
                // In 3-bet pots with caller range advantage, still donk strong hands
                if (is3BetPot && rangeAdvantage === 'caller' && handEval.strength >= 75) {
                    donkFreq = Math.max(donkFreq, 0.35); // Floor: don't let modifiers kill value donks
                }
                donkFreq = Math.max(0, Math.min(0.70, donkFreq));
                if (Math.random() < donkFreq) {
                    let sizeFrac = 0.50 + (boardWet === 'wet' ? 0.08 : 0) + donkSizeMod;
                    // Range advantage caller → slightly larger (they'll discount our range)
                    if (rangeAdvantage === 'caller') sizeFrac += 0.05;
                    sizeFrac = Math.max(0.33, Math.min(0.65, sizeFrac));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }
            // Strong draws on wet boards → donk as semi-bluff
            if (drawEq.outs >= 10 && boardWet === 'wet' && handEval.strength >= 20) {
                let semiDonkFreq = 0.25 + aggressionBias / 40 + donkPotMod + donkRangeMod;
                if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiDonkFreq += 0.10;
                // ═══ LIVE-READ FLOP SEMI-BLUFF DONK (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    if (flopLiveRead.foldFreq > 0.45) semiDonkFreq += 0.08;
                    if (flopLiveRead.callFreq > 0.60) semiDonkFreq -= 0.10;
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.50) semiDonkFreq += 0.06;
                }
                // In 3-bet pots with big draws (14+ outs), still semi-donk occasionally
                if (is3BetPot && drawEq.outs >= 14) {
                    semiDonkFreq = Math.max(semiDonkFreq, 0.18);
                }
                semiDonkFreq = Math.max(0, Math.min(0.50, semiDonkFreq));
                if (Math.random() < semiDonkFreq) {
                    let semiDonkSize = 0.55 + donkSizeMod;
                    // Range advantage caller with draws → bigger to deny equity + fold equity
                    if (rangeAdvantage === 'caller' && drawEq.outs >= 12) semiDonkSize += 0.05;
                    semiDonkSize = Math.max(0.35, Math.min(0.65, semiDonkSize));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * semiDonkSize)) };
                }
            }
            // ── Protection donk: medium hands on scary boards (NEW) ──
            // When we have top pair on a board that favors our range, lead to protect
            // Only in single-raised pots or 3-bet pots where we have range advantage
            if (handEval.strength >= 45 && handEval.strength < 65 && boardWet === 'wet' && rangeAdvantage === 'caller' && !is3BetPot) {
                let protDonkFreq = 0.15 + aggressionBias / 60;
                if (oppCbetFreq > 0.65 && oppConfidence > 0.3) protDonkFreq += 0.08;
                protDonkFreq = Math.max(0, Math.min(0.35, protDonkFreq));
                if (Math.random() < protDonkFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * 0.40)) };
                }
            }
        }

        // ── IP VALUE BET: Bet strong hands when checked to ──
        // ═══ UPGRADED: 3-bet pot, range advantage, opponent reads, geometric sizing ═══
        if (isIP && canRaise) {
            if (handEval.strength >= 60) {
                let valueBetFreq = 0.65;
                if (multiway) valueBetFreq = 0.50;

                // ── Opponent reads ──
                if (oppCallFreq > 0.55 && oppConfidence > 0.3) valueBetFreq = 0.75; // They call light → bet more
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) valueBetFreq = 0.80; // They fold to aggression
                if (oppTendency === 'bluffy' && oppConfidence > 0.3 && handEval.strength >= 75) {
                    valueBetFreq = 0.55; // Against aggro, consider checking to induce
                }
                // ═══ LIVE-READ FLOP IP VALUE BET (Phase 25) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Stations: bet more (they call with worse)
                    if (flopLiveRead.callFreq > 0.55) valueBetFreq = Math.min(0.85, valueBetFreq + 0.08);
                    // Aggressive: check monsters to induce
                    if (flopLiveRead.aggFreq > 0.45 && handEval.strength >= 75) valueBetFreq -= 0.12;
                    // Check-raise threats: bet smaller or check strong hands to trap
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12 && handEval.strength >= 75) {
                        valueBetFreq -= 0.10; // Check to induce CR
                    }
                    // Folders: bet wide (they give up)
                    if (flopLiveRead.foldFreq > 0.50) valueBetFreq = Math.min(0.88, valueBetFreq + 0.06);
                }

                // ── 3-bet pot IP value bet: higher freq (ranges are narrow, top pair is premium) ──
                if (is3BetPot) {
                    valueBetFreq = Math.min(0.85, valueBetFreq + 0.10);
                    if (is4BetPot && spr <= 3 && handEval.strength >= 65) {
                        return { type: 'all_in' }; // 4-bet pot, low SPR, strong hand → jam
                    }
                }

                // ── Range advantage: bet more when board favors PFR's range (we're PFR IP) ──
                if (rangeAdvantage === 'pfr') valueBetFreq += 0.06;
                if (rangeAdvantage === 'caller') valueBetFreq -= 0.06;

                valueBetFreq = Math.max(0.30, Math.min(0.90, valueBetFreq));
                if (Math.random() < valueBetFreq) {
                    // ── Dynamic sizing based on board texture + SPR + range ──
                    let sizeFrac;
                    if (boardWet === 'wet') {
                        sizeFrac = 0.60 + (handEval.strength >= 80 ? 0.08 : 0); // Bigger with monsters on wet
                    } else if (boardWet === 'dry') {
                        sizeFrac = 0.40 + (handEval.strength >= 80 ? 0.05 : 0); // Smaller on dry
                    } else {
                        sizeFrac = 0.50;
                    }
                    // 3-bet pot sizing: smaller (SPR is lower, build geometrically)
                    if (is3BetPot) sizeFrac = Math.max(0.33, sizeFrac - 0.08);
                    // Range advantage: can go bigger when board favors us (less likely to get raised)
                    if (rangeAdvantage === 'pfr') sizeFrac += 0.04;
                    if (rangeAdvantage === 'caller') sizeFrac -= 0.04;
                    // Against callers, size up for value
                    if (oppCallFreq > 0.55 && oppConfidence > 0.3) sizeFrac = Math.min(0.75, sizeFrac + 0.08);
                    // ═══ LIVE-READ FLOP IP VALUE SIZING (Phase 25) ═══
                    if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                        if (flopLiveRead.callFreq > 0.60) sizeFrac = Math.min(0.80, sizeFrac + 0.08);
                        if (flopLiveRead.foldFreq > 0.55 && handEval.strength < 70) sizeFrac = Math.max(0.30, sizeFrac - 0.08);
                    }
                    // Geometric sizing: plan multi-street value
                    // Phase 46 FIX: 'street' was undeclared — this function is always flop, so streetsLeft=2
                    const geoIP = getGeometricSizing(potSize, heroStack, 2, true);
                    if (geoIP.isJammable && handEval.strength >= 75 && spr >= 3) {
                        sizeFrac = Math.max(sizeFrac, geoIP.sizeFraction);
                    }
                    sizeFrac = Math.max(0.25, Math.min(0.80, sizeFrac));
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * sizeFrac)) };
                }
            }

            // ── IP STAB: Marginal hands on boards where opponent likely missed ──
            // ═══ UPGRADED: Board texture, 3-bet pot, range advantage, opponent session reads ═══
            if (handEval.strength >= 20 && handEval.strength < 55 && !multiway) {
                let stabFreq = 0;
                let stabSize = 0.33;

                if (boardWet === 'dry') {
                    // Dry board: standard stab — opponent missed most of the time
                    stabFreq = 0.28 + aggressionBias / 40;
                    stabSize = 0.33;
                } else if (boardWet === 'medium') {
                    // Medium texture: stab less, but still profitable with some equity
                    stabFreq = handEval.strength >= 35 ? (0.20 + aggressionBias / 50) : 0.10;
                    stabSize = 0.40;
                } else {
                    // Wet board: only stab with some equity (draws, pairs)
                    stabFreq = handEval.strength >= 40 ? (0.15 + aggressionBias / 60) : 0;
                    stabSize = 0.45;
                }

                // ── Opponent reads for stabbing ──
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) stabFreq += 0.12;
                if (oppTendency === 'weak-tight' && oppConfidence > 0.3) stabFreq += 0.08;
                if (oppCallFreq > 0.65 && oppConfidence > 0.3) stabFreq -= 0.10; // Don't stab into calling stations
                if (oppTendency === 'bluffy' && oppConfidence > 0.3) stabFreq -= 0.06; // They'll check-raise
                // ── Range advantage stab modifier ──
                if (rangeAdvantage === 'pfr') stabFreq += 0.08; // Board favors us → stab wider
                if (rangeAdvantage === 'caller') stabFreq -= 0.06; // Board favors them → don't stab air

                // ── 3-bet pot: stab less (opponent has stronger range, but we have range advantage) ──
                if (is3BetPot) {
                    stabFreq *= 0.65;
                    stabSize = Math.max(0.28, stabSize - 0.05);
                    if (rangeAdvantage === 'pfr' && handEval.strength >= 35) {
                        stabFreq = Math.max(stabFreq, 0.20);
                    }
                }
                if (is4BetPot) stabFreq = 0;

                // ═══ LIVE-READ IP FLOP STAB (Phase 20) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent folds a lot → stab wider + smaller (efficient)
                    if (flopLiveRead.foldFreq > 0.50) {
                        stabFreq += 0.10;
                        stabSize = Math.max(0.25, stabSize - 0.05);
                    }
                    // Opponent calls a lot → only stab with equity
                    if (flopLiveRead.callFreq > 0.60) {
                        stabFreq -= 0.08;
                        if (handEval.strength < 35) stabFreq -= 0.10; // Definitely don't stab air
                    }
                    // Opponent check-raises a lot → stab less with air, more with value
                    if (flopLiveRead.checkRaisePct !== null && flopLiveRead.checkRaisePct > 0.12) {
                        if (handEval.strength < 30) stabFreq -= 0.10; // Air gets punished
                        if (handEval.strength >= 45) stabFreq += 0.05; // They CR into our value
                        stabSize = Math.max(0.25, stabSize - 0.04); // Smaller to control loss if CR'd
                    }
                    // Low WTSD → they give up → stab more
                    if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.22) stabFreq += 0.06;
                    // Timing: opponent snap-checked to us → weakness → stab more
                    if (flopLiveRead.inHandActions?.lastAction?.action === 'check') {
                        const la = flopLiveRead.inHandActions.lastAction;
                        if (la.timing && la.street === 'flop') {
                            const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                            if (avg && avg > 0 && la.timing / avg < 0.40) stabFreq += 0.08;
                            if (avg && avg > 0 && la.timing / avg > 1.8) stabFreq -= 0.06;
                        }
                    }
                }

                stabFreq = Math.max(0, Math.min(0.50, stabFreq));
                if (Math.random() < stabFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(potSize * stabSize)) };
                }
            }
        }

        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ══════════════════════════════════════════════════════════
    //  FACING A BET ON THE FLOP
    // ══════════════════════════════════════════════════════════

    // ── POT COMMITTED ──
    if (isPotCommitted && handEval.strength >= 35) {
        if (canRaise && handEval.strength >= 70) return { type: 'all_in' };
        return canCall ? { type: 'call' } : { type: 'fold' };
    }

    // ═══ LIMPED POT FACING BET (FLOP) ═══
    // In limped pots, a bet means someone hit something. Ranges are wide,
    // so the bettor could have anything from bottom pair to a monster.
    // Defense strategy: tighter (no c-bet dynamics to exploit), value-heavy.
    if (flopIsLimpedPot && facingBet) {
        // Strong hands: raise for value (their range is wide, they'll pay off)
        if (handEval.strength >= 70 && canRaise) {
            return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * 2.5)) };
        }
        // Medium-strong: call (pot is small, don't inflate without the nuts)
        if (handEval.strength >= 45 && canCall) {
            return { type: 'call' };
        }
        // Draws: call if cheap
        if (drawEq.outs >= 8 && betToPot <= 0.50 && canCall) {
            return { type: 'call' };
        }
        // Weak: fold (don't fight for a small limped pot with nothing)
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // ── MONSTERS: Raise for value (slow-play option) ──
    if (handEval.strength >= 80 && canRaise) {
        // Slow-play on dry boards (opponent will keep bluffing)
        // ═══ 3-BET POT: Never slow-play in 3-bet pots (SPR is low, need to build pot NOW) ═══
        let flopTrapFreq = 0.40;
        // ═══ LIVE-READ FLOP MONSTER TRAP (Phase 26) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // Aggressive: trap more (they barrel wide)
            if (flopLiveRead.aggFreq > 0.45) flopTrapFreq += 0.12;
            // High c-bet + second barrel: they'll keep firing
            if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.65 &&
                flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct > 0.45) flopTrapFreq += 0.10;
            // Passive: don't trap (they check behind)
            if (flopLiveRead.aggFreq < 0.20) flopTrapFreq -= 0.20;
        }
        flopTrapFreq = Math.max(0.10, Math.min(0.60, flopTrapFreq));
        if (boardWet === 'dry' && !multiway && (oppTendency === 'bluffy' || (flopLiveRead?.aggFreq > 0.40)) && !is3BetPot) {
            if (Math.random() < flopTrapFreq) {
                return canCall ? { type: 'call' } : { type: 'fold' }; // Trap
            }
        }
        // Raise for value — size to build pot for turn/river
        let raiseMult = 2.8 + Math.random() * 0.4;
        // ═══ 3-BET POT: Smaller raises work (ranges are narrow, opponent is committed) ═══
        if (is3BetPot) raiseMult = Math.max(2.2, raiseMult * 0.85);
        if (is4BetPot && spr <= 3) return { type: 'all_in' }; // 4-bet pot → just jam
        // Against callers, raise bigger
        if (oppCallFreq > 0.55 && oppConfidence > 0.3) raiseMult = Math.min(3.5, raiseMult * 1.10);
        // ═══ LIVE-READ FLOP MONSTER SIZING (Phase 26) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            if (flopLiveRead.callFreq > 0.55) raiseMult = Math.min(3.8, raiseMult * 1.12);
            if (flopLiveRead.foldFreq > 0.50) raiseMult = Math.max(2.2, raiseMult * 0.88);
        }
        // Geometric: plan for 3 streets of value
        const geoFlop = getGeometricSizing(potSize + toCall * 2, heroStack - toCall, 2, true);
        if (geoFlop.isJammable && spr >= 3) {
            raiseMult = Math.max(raiseMult, geoFlop.sizeFraction * 4);
        }
        return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * raiseMult)) };
    }

    // ── STRONG HANDS: Call or raise for protection ──
    if (handEval.strength >= 55) {
        // ═══ 3-BET POT: Top pair+ is a premium hand in 3-bet pots — raise for value more ═══
        if (is3BetPot && canRaise && handEval.strength >= 60 && !multiway) {
            let threeBetRaiseFreq = 0.35;
            if (spr <= 4) threeBetRaiseFreq = 0.50; // Low SPR = commit with strong hands
            if (oppCallFreq > 0.55 && oppConfidence > 0.3) threeBetRaiseFreq += 0.10;
            if (Math.random() < threeBetRaiseFreq) {
                const threeBetRaiseMult = spr <= 3 ? -1 : 2.5; // -1 = all-in
                if (threeBetRaiseMult === -1) return { type: 'all_in' };
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * threeBetRaiseMult)) };
            }
        }
        // On wet boards, consider raising for protection
        if (canRaise && boardWet === 'wet' && handEval.strength >= 65 && !multiway) {
            let protectRaiseFreq = 0.30;
            if (drawEq.outs >= 4) protectRaiseFreq += 0.10; // We're vulnerable
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) protectRaiseFreq += 0.10;
            // ═══ LIVE-READ FLOP PROTECTION RAISE (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // Stations: raise bigger for protection (they call with draws)
                if (flopLiveRead.callFreq > 0.55) protectRaiseFreq += 0.08;
                // Aggressive: raise to deny free cards they'd take
                if (flopLiveRead.aggFreq > 0.40) protectRaiseFreq += 0.06;
                // Passive nit: don't raise, they might fold (lost value)
                if (flopLiveRead.aggFreq < 0.20 && handEval.strength >= 70) protectRaiseFreq -= 0.08;
            }
            if (Math.random() < protectRaiseFreq) {
                let protRaiseMult = 2.8;
                if (flopLiveRead && flopLiveRead.confidence >= 0.20 && flopLiveRead.callFreq > 0.60) protRaiseMult = 3.2;
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * protRaiseMult)) };
            }
        }
        // Against known nits betting big on the flop → respect
        if (oppTendency === 'weak-tight' && oppConfidence > 0.4 && betToPot >= 0.75 && handEval.strength < 70) {
            // ═══ LIVE-READ FLOP NIT LAYDOWN OVERRIDE (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.25 && flopLiveRead.aggFreq > 0.35) {
                // Live data says not actually a nit — don't fold
            } else {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
        }
        return canCall ? { type: 'call' } : { type: 'fold' };
    }

    // ── CHECK-RAISE: OOP trapping or semi-bluffing ──
    if (!isIP && canRaise && !multiway) {
        // Semi-bluff check-raise with strong draws
        if (drawEq.outs >= 10 && handEval.strength >= 15) {
            let semiCRFreq = 0.25 + aggressionBias / 40;
            let flopCRMult = is3BetPot ? (2.2 + Math.random() * 0.3) : (2.5 + Math.random() * 0.5);
            if (oppCbetFreq > 0.65 && oppConfidence > 0.3) semiCRFreq += 0.10; // They c-bet wide
            if (oppFoldFreq > 0.45 && oppConfidence > 0.3) semiCRFreq += 0.08;
            // ═══ RANGE ADVANTAGE: check-raise more on boards that favor our range ═══
            if (rangeAdvantage === 'pfr' && !heroIsAggressor) semiCRFreq += 0.06;
            // ═══ 3-BET POT CHECK-RAISE: narrower ranges → check-raise less as a bluff ═══
            if (is3BetPot) semiCRFreq -= 0.08;
            if (is4BetPot) semiCRFreq -= 0.15;

            // ═══ LIVE-READ FLOP SEMI-BLUFF CHECK-RAISE (Phase 19) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // High c-bet% → their range is wide → check-raise more
                if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.70) semiCRFreq += 0.08;
                // Low c-bet% → they have it when they bet → check-raise less
                if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct < 0.40) semiCRFreq -= 0.08;
                // High fold-to-raise → check-raise more as semi-bluff (fold equity)
                if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                    semiCRFreq += 0.10;
                    flopCRMult = Math.max(2.0, flopCRMult * 0.92); // Smaller → efficient
                }
                // Low fold-to-raise → they call/re-raise → check-raise only with equity
                if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct < 0.30) {
                    semiCRFreq -= 0.08;
                }
                // Timing: snap c-bet = auto-pilot = weaker range → check-raise more
                if (flopLiveRead.inHandActions?.lastAction?.timing && flopLiveRead.inHandActions.lastAction.street === 'flop') {
                    const la = flopLiveRead.inHandActions.lastAction;
                    const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                    if (avg && avg > 0) {
                        if (la.timing / avg < 0.40) semiCRFreq += 0.06; // Snap c-bet = weak
                        if (la.timing / avg > 2.0) semiCRFreq -= 0.06; // Tank c-bet = strong
                    }
                }
            }

            semiCRFreq = Math.max(0, Math.min(0.50, semiCRFreq));
            if (Math.random() < semiCRFreq) {
                return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * flopCRMult)) };
            }
        }
        // Bluff check-raise on dry boards when opponent c-bets wide
        if (handEval.strength < 15 && boardWet === 'dry') {
            // Use live data for c-bet frequency if available, fall back to static reads
            const effectiveCBetFreq = (flopLiveRead && flopLiveRead.confidence >= 0.20 && flopLiveRead.cBetPct !== null)
                ? flopLiveRead.cBetPct
                : (oppCbetFreq > 0 && oppConfidence > 0.3 ? oppCbetFreq : 0);

            if (effectiveCBetFreq > 0.55) {
                let bluffCRFreq = 0.10 + aggressionBias / 50;
                if (oppFoldFreq > 0.50 && oppConfidence > 0.3) bluffCRFreq += 0.08;
                // ═══ LIVE-READ FLOP BLUFF CHECK-RAISE (Phase 19) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.60) {
                        bluffCRFreq += 0.10; // They fold to raises a lot → bluff CR is printing
                    }
                    if (flopLiveRead.callFreq > 0.60) bluffCRFreq = 0; // Never bluff stations
                }
                // No bluff check-raises in 3-bet/4-bet pots
                if (is3BetPot) bluffCRFreq *= 0.40;
                if (is4BetPot) bluffCRFreq = 0;
                bluffCRFreq = Math.max(0, Math.min(0.25, bluffCRFreq));
                if (Math.random() < bluffCRFreq) {
                    // Sizing: smaller vs folders, standard otherwise
                    const bluffCRMult = (flopLiveRead?.foldToRaisePct > 0.55) ? 2.5 : 3.0;
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * bluffCRMult)) };
                }
            }
        }
    }

    // ═══ OOP FLOAT DEFENSE SYSTEM ═══
    // When OOP facing a c-bet, we need to defend enough to prevent exploitation.
    // GTO says we should defend ~60-65% of our range vs a 66% pot c-bet.
    // Our defense range = check-calls + check-raises.
    // Key principle: defend with (1) made hands, (2) draws, (3) some backdoor equity.
    if (!isIP && !multiway) {
        const flopMDF = potSize / (potSize + toCall); // Minimum defense frequency
        const flopDefenseTarget = flopMDF * 0.75; // We aim to defend ~75% of MDF

        // ═══ FLOAT DEFENSE: Peel with backdoor equity + overcards ═══
        // ═══ UPGRADED: 3-bet pot, range advantage, scare card awareness ═══
        // These hands have no immediate equity but can improve on turn/river.
        // GTO defends with: BDFD + overcard, gutshot + overcard, low pair + BDFD
        if (handEval.strength >= 15 && handEval.strength < 30) {
            const hasBackdoorEquity = handEval.hasBackdoorFlush || handEval.hasGutshot;
            const hasOvercards = holeCards.some(c => RANKS.indexOf(c[0]) > Math.max(...board.map(b => RANKS.indexOf(b[0]))));

            if (hasBackdoorEquity || hasOvercards) {
                let floatDefenseFreq = 0.30;
                // Small c-bet = defend wider
                if (betToPot <= 0.33) floatDefenseFreq += 0.15;
                else if (betToPot <= 0.50) floatDefenseFreq += 0.08;
                // Large c-bet = defend tighter
                if (betToPot >= 0.75) floatDefenseFreq -= 0.12;
                // Against heavy c-bettors = defend wider (they're bluffing more)
                if (oppCbetFreq > 0.70 && oppConfidence > 0.3) floatDefenseFreq += 0.10;
                // Board texture: wet = more profitable to defend (draws available)
                if (boardWet === 'wet') floatDefenseFreq += 0.06;

                // ── 3-bet pot OOP float defense ──
                // In 3-bet pots, opponent's c-bet range is stronger → defend tighter
                // But: we still need to defend some to prevent exploitation
                if (is3BetPot) {
                    floatDefenseFreq *= 0.60; // Significant reduction — their range crushes backdoors
                    // Exception: if board favors our range, defend more
                    if (rangeAdvantage === 'caller') floatDefenseFreq += 0.08;
                }
                if (is4BetPot) {
                    floatDefenseFreq = 0; // Never float with backdoors in 4-bet pots
                }

                // ── Range advantage defense modifier ──
                // When board favors our calling range, defend wider (we have equity advantage)
                if (rangeAdvantage === 'caller' && !is3BetPot) floatDefenseFreq += 0.06;
                if (rangeAdvantage === 'pfr' && !heroIsAggressor) floatDefenseFreq -= 0.05;

                // ── Board scare factor ──
                // Connected boards give backdoor draws more value → defend wider
                if (boardIsConnected && hasBackdoorEquity) floatDefenseFreq += 0.04;

                // ═══ LIVE-READ FLOP DEFENSE ADJUSTMENTS (Phase 18) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent c-bets too much → they're bluffing → defend wider
                    if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.70) {
                        floatDefenseFreq += 0.10; // High c-bet freq = wide range = defend more
                    } else if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct < 0.40) {
                        floatDefenseFreq -= 0.08; // Low c-bet freq = they have it when they bet
                    }
                    // Opponent gives up on turn a lot (low second barrel) → float = very profitable
                    if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.35) {
                        floatDefenseFreq += 0.10; // ONE-AND-DONE pattern → float profitably
                    }
                    // Opponent folds to check-raise → we can raise with our defense range
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                        floatDefenseFreq += 0.05; // Can always escalate if they fold
                    }
                    // Timing tell: snap c-bet = auto-pilot = wider range = defend more
                    if (flopTimingTell === 'snap_check') {
                        // snap_check doesn't apply here (they bet, not checked)
                    }
                    if (flopLiveRead.inHandActions && flopLiveRead.inHandActions.lastAction) {
                        const la = flopLiveRead.inHandActions.lastAction;
                        if (la.action === 'bet' && la.timing && la.street === 'flop') {
                            const avg = flopLiveRead.timingProfile?.flop?.avgMs || flopLiveRead.avgDecisionMs;
                            if (avg && avg > 0) {
                                if (la.timing / avg < 0.40) floatDefenseFreq += 0.06; // Snap c-bet = weak
                                if (la.timing / avg > 2.0) floatDefenseFreq -= 0.06; // Tank c-bet = strong
                            }
                        }
                    }
                }

                floatDefenseFreq = Math.max(0, Math.min(0.55, floatDefenseFreq));
                if (Math.random() < floatDefenseFreq && canCall) {
                    return { type: 'call' }; // Float defense with backdoor equity
                }
            }
        }
    }

    // ── DRAWING HANDS: Equity math + implied odds ──
    // ═══ UPGRADED: 3-bet pot implied odds reduction, range advantage draw calls ═══
    if (drawEq.outs >= 6) {
        const drawEquityPct = Math.min(drawEq.outs * 2.2, 45) / 100;

        // Direct odds: call if equity exceeds pot odds
        if (drawEquityPct >= potOdds - 0.03) {
            // Semi-bluff raise with massive combo draws
            if (canRaise && drawEq.outs >= 13 && !multiway) {
                let semiBluffRaiseFreq = 0.35;
                let semiRaiseMult = is3BetPot ? 2.2 : 2.5;
                // ── 3-bet pot: semi-bluff raise less (opponent won't fold strong range) ──
                if (is3BetPot) semiBluffRaiseFreq *= 0.55;
                if (is4BetPot) semiBluffRaiseFreq = 0; // Never semi-bluff raise in 4-bet pots
                // Range advantage: raise more when board favors us
                if (rangeAdvantage === 'caller' && !heroIsAggressor) semiBluffRaiseFreq += 0.08;

                // ═══ LIVE-READ SEMI-BLUFF RAISE ADJUSTMENTS (Phase 18) ═══
                if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                    // Opponent folds to raises → semi-bluff more (fold equity is massive)
                    if (flopLiveRead.foldToRaisePct !== null && flopLiveRead.foldToRaisePct > 0.55) {
                        semiBluffRaiseFreq += 0.12;
                        semiRaiseMult = Math.max(2.0, semiRaiseMult * 0.90); // Smaller raise = efficient
                    }
                    // Opponent calls raises frequently → semi-bluff less (need equity realization)
                    if (flopLiveRead.callFreq > 0.60) {
                        semiBluffRaiseFreq -= 0.08;
                        semiRaiseMult = Math.min(3.0, semiRaiseMult * 1.10); // Bigger when we do raise
                    }
                    // Opponent is ONE-AND-DONE c-bettor → just flat and stab turn instead
                    if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.30) {
                        semiBluffRaiseFreq -= 0.10; // Don't raise — just call and take turn
                    }
                }
                semiBluffRaiseFreq = Math.max(0, Math.min(0.60, semiBluffRaiseFreq));

                if (Math.random() < semiBluffRaiseFreq) {
                    return { type: raiseAction.type, amount: clampAmt(Math.round(toCall * semiRaiseMult)) };
                }
            }
            return canCall ? { type: 'call' } : { type: 'fold' };
        }

        // Implied odds: call with strong draws when deep
        // ── 3-bet pot implied odds: worse (shallower stacks, less to win) ──
        if (drawEq.outs >= 9 && (handEval.hasFlushDraw || handEval.hasOESD)) {
            let impliedThreshold = 0.50;
            if (oppCallFreq > 0.55 && oppConfidence > 0.3) impliedThreshold = 0.60; // Better implied odds vs callers
            // ═══ LIVE-READ FLOP IMPLIED ODDS (Phase 26) ═══
            if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
                // Stations: better implied odds (they pay off when we hit)
                if (flopLiveRead.callFreq > 0.55) impliedThreshold += 0.08;
                // High WTSD: they go to showdown → great implied odds
                if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.30) impliedThreshold += 0.06;
                // Folders: worse implied (they fold when board completes)
                if (flopLiveRead.foldFreq > 0.55) impliedThreshold -= 0.08;
            }
            // 3-bet pot: need better odds (stacks are shallower, implied odds worse)
            if (is3BetPot) impliedThreshold -= 0.08; // Tighter threshold
            if (is4BetPot) impliedThreshold -= 0.15; // Much tighter
            // Deep stacks improve implied odds
            if (stackBB >= 80) impliedThreshold += 0.08;
            else if (stackBB >= 50) impliedThreshold += 0.04;
            // Must be deep enough for implied odds to matter
            if (spr >= 2 && betToPot < impliedThreshold) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }

        // Backdoor draws: very cheap calls only (never in 3-bet+ pots)
        if (drawEq.outs >= 4 && drawEq.outs < 6 && betToPot <= 0.33 && !is3BetPot && !is4BetPot) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    // ── MEDIUM HANDS: Call or fold based on pot odds + opponent ──
    // ═══ UPGRADED: 3-bet pot threshold adjustment, range advantage, opponent reads ═══
    if (handEval.strength >= 30) {
        // ── 3-bet pot medium hand thresholds ──
        // In 3-bet pots, medium hands are actually decent (ranges are narrow)
        // Second pair in a 3-bet pot = roughly like top pair in a SRP
        const medCallThreshold = is3BetPot ? 25 : is4BetPot ? 20 : 30;
        const medSmallBetThreshold = is3BetPot ? 28 : 35;

        // Good pot odds → call
        if (potOdds < 0.25) {
            if (multiway && handEval.strength < 40) return canCheck ? { type: 'check' } : { type: 'fold' };
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // Small bet → call with most medium hands
        if (betToPot <= 0.40 && handEval.strength >= medSmallBetThreshold) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // Against known bluffers, call wider
        if (oppBluffFreq > 0.35 && oppConfidence > 0.3) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // ═══ LIVE-READ FLOP MEDIUM HAND CALL (Phase 27) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // Live bluffer: call with medium hands
            if (flopLiveRead.bluffRate !== null && flopLiveRead.bluffRate > 0.30) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
            // Live passive player big betting: fold more medium hands
            if (flopLiveRead.aggFreq < 0.18 && betToPot >= 0.60 && handEval.strength < 40) {
                return canCheck ? { type: 'check' } : { type: 'fold' };
            }
            // One-and-done: call to steal turn
            if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.30 && handEval.strength >= 25) {
                return canCall ? { type: 'call' } : { type: 'fold' };
            }
        }
        // ── Range advantage call modifier ──
        // When board favors our range, medium hands have more showdown value
        if (rangeAdvantage === 'caller' && !heroIsAggressor && handEval.strength >= 32 && betToPot <= 0.55) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
        // ── 3-bet pot: call slightly wider with medium hands (opponent c-bets range) ──
        if (is3BetPot && handEval.strength >= medCallThreshold && betToPot <= 0.50) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    // ── FLOAT in position (call with nothing, plan to take away later) ──
    // ═══ UPGRADED: 3-bet pot, board texture, opponent session reads, range advantage ═══
    // IP float = calling with weak hands planning to steal on later streets.
    // Only profitable with position + reads + appropriate board textures.
    if (isIP && handEval.strength >= 12 && betToPot <= 0.55 && !multiway && aggressionBias > 0) {
        let floatFreq = 0.18 + aggressionBias / 40;

        // ── Opponent reads for floating ──
        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) floatFreq = 0.30; // They give up easily
        if (oppCbetFreq > 0.65 && oppConfidence > 0.3) floatFreq += 0.08; // Wide c-bets = float more
        if (oppTendency === 'bluffy' && oppConfidence > 0.3) floatFreq -= 0.06; // They'll double barrel
        if (oppCallFreq > 0.60 && oppConfidence > 0.3) floatFreq -= 0.04; // Sticky opponents
        // ═══ LIVE-READ FLOP FLOAT (Phase 27) ═══
        if (flopLiveRead && flopLiveRead.confidence >= 0.20) {
            // ONE-AND-DONE: c-bets lot but rarely double barrels → FLOAT HEAVEN
            if (flopLiveRead.cBetPct !== null && flopLiveRead.cBetPct > 0.60 &&
                flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct < 0.35) {
                floatFreq += 0.15;
            }
            // Low WTSD: they give up easily → float profitably
            if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd < 0.22) floatFreq += 0.08;
            // High WTSD: they don't fold → don't float
            if (flopLiveRead.wtsd !== null && flopLiveRead.wtsd > 0.35) floatFreq -= 0.08;
            // High second barrel: they keep firing → float less
            if (flopLiveRead.secondBarrelPct !== null && flopLiveRead.secondBarrelPct > 0.55) floatFreq -= 0.08;
        }

        // ── Board texture for floating ──
        // Dry boards: float more (turn cards are more likely to be scare cards we can bluff)
        if (boardWet === 'dry') floatFreq += 0.05;
        // Wet boards with backdoor equity: slightly better float (we have outs)
        if (boardWet === 'wet' && (handEval.hasBackdoorFlush || handEval.hasGutshot)) floatFreq += 0.04;
        // High boards favor PFR → good float spot if we're not the aggressor (scare cards help us less)
        if (boardIsHigh && heroIsAggressor) floatFreq += 0.04;

        // ── Range advantage float modifier ──
        if (rangeAdvantage === 'pfr' && heroIsAggressor) floatFreq += 0.04; // Board favors us
        if (rangeAdvantage === 'caller' && heroIsAggressor) floatFreq -= 0.04; // Board favors them

        // ── 3-bet pot: float much less (opponent's range is strong, we need real hands) ──
        if (is3BetPot) {
            floatFreq *= 0.35; // Severe reduction — their range is narrow and strong
            // Only float with some equity in 3-bet pots
            if (handEval.strength < 20 && !handEval.hasBackdoorFlush && !handEval.hasGutshot) {
                floatFreq = 0; // No floating pure air in 3-bet pots
            }
        }
        if (is4BetPot) floatFreq = 0; // Never float in 4-bet pots

        // ── Bet size tells ──
        if (betToPot <= 0.33) floatFreq += 0.06; // Tiny bet = weaker range → float more
        if (betToPot >= 0.50) floatFreq -= 0.04; // Larger bet = more committed

        floatFreq = Math.max(0, Math.min(0.40, floatFreq));
        if (Math.random() < floatFreq) {
            return canCall ? { type: 'call' } : { type: 'fold' };
        }
    }

    return canCheck ? { type: 'check' } : { type: 'fold' };
}

function evaluateBoardWetness(board) {
    if (!Array.isArray(board) || board.length < 3) return 'medium'; // Bug #49: guard non-array board

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
function getMultiwayAdjustment(numPlayers, opts = {}) {
    const safeOpts = (opts && typeof opts === 'object') ? opts : {}; // Bug #52: guard null/non-object opts
    const {
        position = 'BTN',
        street = 'flop',
        boardWetness = 'medium',
        heroIsAggressor = false
    } = safeOpts;

    if (numPlayers <= 2) return {
        strengthPenalty: 0, bluffReduction: 1.0, valueBetThreshold: 55,
        cbetFreqMod: 0, callWidthMod: 0, adjustSizing: false
    };

    const isIP = new Set(['BTN', 'CO', 'HJ']).has(position);

    // ═══ BASE MULTIWAY ADJUSTMENTS ═══
    let strengthPenalty, bluffReduction, valueBetThreshold, cbetFreqMod, callWidthMod;

    if (numPlayers === 3) {
        strengthPenalty = 8;
        bluffReduction = 0.55;
        valueBetThreshold = 60;
        cbetFreqMod = -0.15;    // c-bet 15% less often 3-way
        callWidthMod = -5;       // Need 5 more strength to call
    } else if (numPlayers === 4) {
        strengthPenalty = 15;
        bluffReduction = 0.25;
        valueBetThreshold = 65;
        cbetFreqMod = -0.30;
        callWidthMod = -10;
    } else {
        strengthPenalty = 22;
        bluffReduction = 0.10;
        valueBetThreshold = 72;
        cbetFreqMod = -0.45;    // Almost never c-bet 5-way
        callWidthMod = -15;
    }

    // ═══ POSITION ADJUSTMENTS ═══
    // IP in multiway: can still bluff more than OOP (last to act = information advantage)
    if (isIP) {
        bluffReduction = Math.min(1.0, bluffReduction * 1.25);
        strengthPenalty = Math.max(0, strengthPenalty - 2);
    }
    // OOP in multiway: play even tighter (sandwich risk)
    if (!isIP && numPlayers >= 3) {
        strengthPenalty += 3;
        bluffReduction *= 0.80;
    }

    // ═══ STREET ADJUSTMENTS ═══
    // Turn/river multiway: if still multiway, ranges are VERY strong → tighten more
    if (street === 'turn') {
        strengthPenalty += 2;
        bluffReduction *= 0.85;
    }
    if (street === 'river') {
        strengthPenalty += 3;
        bluffReduction *= 0.75;
    }

    // ═══ BOARD TEXTURE ═══
    // Wet boards multiway: even less bluffing (someone has it)
    if (boardWetness === 'wet' && numPlayers >= 3) {
        bluffReduction *= 0.75;
        cbetFreqMod -= 0.10;
    }
    // Dry boards multiway: can still c-bet small at decent frequency
    if (boardWetness === 'dry' && heroIsAggressor) {
        cbetFreqMod += 0.08;
    }

    // ═══ SIZING ADJUSTMENT ═══
    // Multiway pots need BIGGER sizing (more players to charge, more equity to deny)
    const adjustSizing = numPlayers >= 3;

    return {
        strengthPenalty: Math.round(strengthPenalty),
        bluffReduction: Math.max(0.05, Math.min(1.0, bluffReduction)),
        valueBetThreshold,
        cbetFreqMod,
        callWidthMod,
        adjustSizing
    };
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
function getCheckRaiseStrategy(handStrength, isInPosition, hasStrongDraw, aggressionBias, opts = {}) {
    const {
        street = 'flop',
        boardWetness = 'medium',   // 'dry', 'medium', 'wet'
        boardIsPaired = false,
        numPlayers = 2,
        oppTendency = 'balanced',  // 'bluffy', 'weak-tight', 'balanced', 'calling-station'
        oppConfidence = 0,
        oppCbetFreq = 0.60,        // How often opponent c-bets (higher = more check-raise value)
        handCategory = 'unknown'
    } = opts;

    const multiway = numPlayers >= 3;
    const result = { shouldCheckRaise: false, frequency: 0, sizeFraction: 3.0 }; // Default 3x raise

    // ═══ OOP CHECK-RAISE (where most check-raises happen) ═══
    if (!isInPosition) {
        // --- VALUE CHECK-RAISES ---
        // Monsters: sets, two pair+, straights, flushes
        if (handStrength >= 65) {
            let freq = 0.55 + aggressionBias / 50;

            // Board texture adjustments
            if (boardWetness === 'wet') {
                // Wet boards: check-raise MORE for protection (don't let draws see free cards)
                freq += 0.10;
                result.sizeFraction = 3.5; // Bigger to price out draws
            } else if (boardWetness === 'dry') {
                // Dry boards: can afford to slowplay more (less draw risk)
                freq -= 0.10;
                result.sizeFraction = 2.5; // Smaller — they have less to call with
            }

            // Paired boards with trips/full house: slowplay more (disguise strength)
            if (boardIsPaired && handStrength >= 80) freq -= 0.15;

            // Street adjustments
            if (street === 'turn') freq += 0.05; // Turn check-raises are more credible
            if (street === 'river') freq += 0.10; // River check-raises are premium value

            // Opponent adjustments
            if (oppTendency === 'bluffy' && oppConfidence > 0.3) {
                // Let bluffers bluff — slowplay more, then raise
                freq -= 0.10;
            }
            if (oppCbetFreq > 0.70 && oppConfidence > 0.3) {
                // Heavy c-bettor: check-raise more (they're betting wide)
                freq += 0.10;
            }
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) {
                // Weak-tight will fold to check-raise — bluff more but value less
                freq -= 0.05; // They fold too much for value
            }

            // Multiway: check-raise less (more risk of big hands behind)
            if (multiway) freq *= 0.60;

            result.shouldCheckRaise = true;
            result.frequency = Math.max(0.10, Math.min(0.85, freq));
            return result;
        }

        // --- SEMI-BLUFF CHECK-RAISES ---
        // Strong draws: flush draws, OESDs, combo draws
        if (hasStrongDraw && handStrength >= 25) {
            let freq = 0.30 + aggressionBias / 40;

            // Wet boards: more semi-bluff value (more draws complete)
            if (boardWetness === 'wet') freq += 0.08;
            // Dry boards: semi-bluffs look more suspicious
            if (boardWetness === 'dry') freq -= 0.10;

            // Only semi-bluff on flop/turn (river draws are dead)
            if (street === 'river') return result;

            // Against callers: don't semi-bluff as much (they call too wide)
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) freq -= 0.15;
            // Against weak-tight: semi-bluff MORE (they fold)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) freq += 0.12;

            // Heavy c-bettor: check-raise bluff their wide range
            if (oppCbetFreq > 0.70 && oppConfidence > 0.3) freq += 0.08;

            // Multiway: don't semi-bluff check-raise (too risky)
            if (multiway) freq *= 0.30;

            result.shouldCheckRaise = true;
            result.frequency = Math.max(0.05, Math.min(0.55, freq));
            result.sizeFraction = boardWetness === 'wet' ? 3.5 : 3.0;
            return result;
        }

        // --- PURE BLUFF CHECK-RAISES ---
        // With nothing, check-raise bluff at low frequency on specific boards
        if (handStrength < 20 && !multiway && street !== 'river') {
            let bluffFreq = 0.08 + aggressionBias / 60;

            // Only bluff on good boards for it
            if (boardWetness === 'dry' && !boardIsPaired) bluffFreq += 0.06; // Credible on dry boards
            // Against heavy c-bettors: bluff check-raise their air
            if (oppCbetFreq > 0.75 && oppConfidence > 0.3) bluffFreq += 0.08;
            // Against weak-tight: they fold to aggression
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffFreq += 0.06;
            // Against callers: never bluff check-raise
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) bluffFreq = 0;

            if (bluffFreq > 0.05) {
                result.shouldCheckRaise = true;
                result.frequency = Math.min(0.25, bluffFreq);
                result.sizeFraction = 3.0;
                return result;
            }
        }

        return result; // No check-raise
    }

    // ═══ IP CHECK-RAISE (rare — usually trapping) ═══
    // IP check-raises are unconventional and only done with near-nuts to trap
    if (handStrength >= 85) {
        let freq = 0.20;
        // Paired board with full house: trap more
        if (boardIsPaired && handStrength >= 90) freq = 0.30;
        // Against bluffy opponents: let them bet again
        if (oppTendency === 'bluffy' && oppConfidence > 0.3) freq += 0.10;
        result.shouldCheckRaise = true;
        result.frequency = freq;
        result.sizeFraction = 2.5; // Smaller IP (they think we're trapping)
        return result;
    }

    return result;
}

// --- #26b: OOP Check-Call vs Check-Raise vs Lead Decision Matrix ---
// ═══════════════════════════════════════════════════════════════════
// When OOP and facing a bet, this structured matrix determines
// whether to check-call, check-raise, or lead (donk/probe).
// Replaces ad-hoc OOP decisions with a principled framework.
// ═══════════════════════════════════════════════════════════════════

/**
 * OOP action matrix: given we're OOP and facing (or anticipating) a bet,
 * decide check-call, check-raise, lead bet, or check-fold.
 *
 * @param {Object} params
 * @returns {{ action: string, frequency: number, sizeFraction: number, reason: string }}
 *   action: 'check_call', 'check_raise', 'lead', 'check_fold'
 */
function getOOPDecisionMatrix(params) {
    const {
        handStrength = 50,
        handCategory = 'unknown',
        hasStrongDraw = false,
        hasWeakDraw = false,
        street = 'flop',
        boardWetness = 'medium',
        boardIsPaired = false,
        boardIsMonotone = false,
        numPlayers = 2,
        aggressionBias = 0,
        oppTendency = 'balanced',
        oppConfidence = 0,
        oppCbetFreq = 0.60,
        oppCallFreq = 0.50,
        heroIsAggressor = false,
        potSize = 0,
        toCall = 0,
        stackBB = 100,
        liveRead = null  // Phase 28: direct live-read access
    } = params;

    const multiway = numPlayers >= 3;
    const facingSmallBet = toCall > 0 && (toCall / Math.max(1, potSize)) < 0.40;
    const facingBigBet = toCall > 0 && (toCall / Math.max(1, potSize)) >= 0.75;
    const isDeep = stackBB >= 80;

    // ═══ TIER 1: NUTTED HANDS (strength >= 75) ═══
    // Check-raise for max value, or slowplay vs aggressive opponents
    if (handStrength >= 75) {
        // ═══ LIVE-READ OOP NUTTED HANDS (Phase 28) ═══
        let liveSlowplayBoost = 0;
        let liveCRBoost = 0;
        let liveSizeMod = 1.0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // Aggressive: slowplay more (they'll bet into us)
            if (liveRead.aggFreq > 0.45) liveSlowplayBoost += 0.12;
            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) liveSlowplayBoost += 0.08;
            // Second barrel high: they keep firing → trap is profitable
            if (liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct > 0.50) liveSlowplayBoost += 0.08;
            // Passive: don't slowplay (they check behind)
            if (liveRead.aggFreq < 0.20) { liveSlowplayBoost -= 0.15; liveCRBoost += 0.10; }
            // Stations: CR bigger
            if (liveRead.callFreq > 0.55) liveSizeMod = 1.15;
            // Folders: CR smaller
            if (liveRead.foldFreq > 0.55) liveSizeMod = 0.88;
        }

        // Against bluffy/aggro opponents: check-call to let them barrel
        let slowplayFreq = 0.60 + liveSlowplayBoost;
        if (oppTendency === 'bluffy' && oppConfidence > 0.3 && street !== 'river') {
            if (Math.random() < Math.min(0.80, slowplayFreq)) {
                return {
                    action: 'check_call', frequency: slowplayFreq,
                    sizeFraction: 0, reason: 'slowplay_vs_bluffy'
                };
            }
        }
        // River with nuts: check-raise always
        if (street === 'river') {
            let crFreq = 0.70 + aggressionBias / 50 + liveCRBoost;
            return {
                action: 'check_raise', frequency: Math.min(0.90, crFreq),
                sizeFraction: 3.0 * liveSizeMod, reason: 'river_value_checkraise'
            };
        }
        // Wet board: check-raise for protection
        if (boardWetness === 'wet') {
            return {
                action: 'check_raise', frequency: 0.65 + liveCRBoost,
                sizeFraction: 3.5 * liveSizeMod, reason: 'protect_nuts_on_wet'
            };
        }
        // Dry board: mix check-call and check-raise (deception)
        let dryCRFreq = 0.45 + liveCRBoost;
        return {
            action: Math.random() < dryCRFreq ? 'check_raise' : 'check_call',
            frequency: 0.55 + liveCRBoost,
            sizeFraction: 2.8 * liveSizeMod, reason: 'mix_nutted_on_dry'
        };
    }

    // ═══ TIER 2: STRONG HANDS (55-74) — two pair, overpair, top pair good kicker ═══
    if (handStrength >= 55) {
        // ═══ LIVE-READ OOP STRONG HANDS (Phase 28) ═══
        let liveStrongCRMod = 0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // High c-bet: CR more to deny bluffs
            if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.65) liveStrongCRMod += 0.08;
            // High fold-to-raise: CR more (fold equity + value)
            if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) liveStrongCRMod += 0.06;
            // Station: don't CR with just strong (they call, we might be behind)
            if (liveRead.callFreq > 0.60 && handStrength < 65) liveStrongCRMod -= 0.08;
        }
        // Against heavy c-bettors: check-raise to deny their bluffs
        if ((oppCbetFreq > 0.70 && oppConfidence > 0.3) ||
            (liveRead && liveRead.confidence >= 0.20 && liveRead.cBetPct !== null && liveRead.cBetPct > 0.70)) {
            if (!multiway) {
                return {
                    action: 'check_raise', frequency: Math.min(0.65, 0.40 + aggressionBias / 50 + liveStrongCRMod),
                    sizeFraction: 3.0, reason: 'checkraise_heavy_cbettor'
                };
            }
        }
        // Multiway: just check-call (too many hands behind)
        if (multiway) {
            return {
                action: 'check_call', frequency: 0.85,
                sizeFraction: 0, reason: 'checkcall_multiway_strong'
            };
        }
        // Facing big bet with strong hand: check-call (don't bloat pot unless nuts)
        if (facingBigBet) {
            return {
                action: 'check_call', frequency: 0.80,
                sizeFraction: 0, reason: 'checkcall_big_bet'
            };
        }
        // Default: mostly check-call, sometimes check-raise
        const crFreq = 0.25 + aggressionBias / 40;
        return {
            action: Math.random() < crFreq ? 'check_raise' : 'check_call',
            frequency: 0.75,
            sizeFraction: 3.0, reason: 'strong_default_mix'
        };
    }

    // ═══ TIER 3: MEDIUM HANDS (35-54) — second pair, weak top pair ═══
    if (handStrength >= 35) {
        // Draws + pair: check-call comfortably
        if (hasStrongDraw || hasWeakDraw) {
            return {
                action: 'check_call', frequency: 0.80,
                sizeFraction: 0, reason: 'medium_plus_draw'
            };
        }
        // Facing small bet: check-call (getting good odds with showdown value)
        if (facingSmallBet) {
            return {
                action: 'check_call', frequency: 0.75,
                sizeFraction: 0, reason: 'checkcall_small_bet'
            };
        }
        // Facing big bet with just a medium hand: lean fold unless pot odds are great
        if (facingBigBet && handStrength < 45) {
            return {
                action: 'check_fold', frequency: 0.55,
                sizeFraction: 0, reason: 'fold_medium_vs_big_bet'
            };
        }
        // Against weak-tight: lead bet (they check back too much)
        // ═══ LIVE-READ OOP MEDIUM LEAD (Phase 28) ═══
        let leadFreqBoost = 0;
        if (liveRead && liveRead.confidence >= 0.20) {
            // Passive: they check back → lead to build pot
            if (liveRead.aggFreq < 0.25) leadFreqBoost += 0.10;
            // Low c-bet: they won't bet → we must lead for value
            if (liveRead.cBetPct !== null && liveRead.cBetPct < 0.40) leadFreqBoost += 0.08;
        }
        if ((oppTendency === 'weak-tight' && oppConfidence > 0.3) || leadFreqBoost >= 0.10) {
            if (!multiway && toCall === 0) {
                return {
                    action: 'lead', frequency: Math.min(0.55, 0.35 + aggressionBias / 50 + leadFreqBoost),
                    sizeFraction: 0.50, reason: 'lead_vs_passive'
                };
            }
        }
        // Default: check-call
        return {
            action: 'check_call', frequency: 0.65,
            sizeFraction: 0, reason: 'medium_default_checkcall'
        };
    }

    // ═══ TIER 4: DRAWS WITHOUT MADE HAND (15-34 strength) ═══
    if (hasStrongDraw) {
        // Strong draw (flush draw, OESD): check-raise semi-bluff or check-call
        if (!multiway && street !== 'river') {
            let crFreq = 0.30 + aggressionBias / 40;
            // Against weak-tight: check-raise more (they fold)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) crFreq += 0.12;
            // ═══ LIVE-READ OOP DRAW CR (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High fold-to-raise: semi-bluff CR is printing
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.50) crFreq += 0.10;
                // Station: don't semi-bluff CR (no fold equity)
                if (liveRead.callFreq > 0.60) crFreq = Math.min(crFreq, 0.08);
                // Low WTSD: they fold later streets → prefer flat to realize equity
                if (liveRead.wtsd !== null && liveRead.wtsd < 0.22) crFreq -= 0.06;
            }
            crFreq = Math.max(0, Math.min(0.55, crFreq));
            if (Math.random() < crFreq) {
                let sizeFrac = 3.2;
                // Live fold-to-raise: smaller CR (efficient)
                if (liveRead && liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) sizeFrac = 2.6;
                return {
                    action: 'check_raise', frequency: crFreq,
                    sizeFraction: sizeFrac, reason: 'semi_bluff_checkraise'
                };
            }
        }
        // Check-call with draw equity
        return {
            action: 'check_call', frequency: 0.75,
            sizeFraction: 0, reason: 'checkcall_strong_draw'
        };
    }

    if (hasWeakDraw) {
        // Weak draws (gutshot, backdoor): check-call only if pot odds work
        if (facingSmallBet) {
            return {
                action: 'check_call', frequency: 0.55,
                sizeFraction: 0, reason: 'checkcall_weak_draw_small'
            };
        }
        return {
            action: 'check_fold', frequency: 0.60,
            sizeFraction: 0, reason: 'fold_weak_draw_big_bet'
        };
    }

    // ═══ TIER 5: AIR / GARBAGE (< 15 strength, no draws) ═══
    // Check-fold most of the time, occasionally check-raise bluff
    if (handStrength < 15) {
        // Check-raise bluff at low frequency on good boards
        if (!multiway && street !== 'river' && boardWetness === 'dry') {
            let bluffCRFreq = 0.08 + aggressionBias / 60;
            if (oppCbetFreq > 0.75 && oppConfidence > 0.3) bluffCRFreq += 0.06;
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffCRFreq += 0.05;
            // ═══ LIVE-READ OOP BLUFF CR (Phase 28) ═══
            if (liveRead && liveRead.confidence >= 0.20) {
                // High fold-to-raise: bluff CR is profitable
                if (liveRead.foldToRaisePct !== null && liveRead.foldToRaisePct > 0.55) bluffCRFreq += 0.08;
                // High c-bet: their range is wide → bluff CR more
                if (liveRead.cBetPct !== null && liveRead.cBetPct > 0.70) bluffCRFreq += 0.05;
                // Station: never bluff CR
                if (liveRead.callFreq > 0.55) bluffCRFreq = 0;
            }
            if (bluffCRFreq > 0.05 && Math.random() < bluffCRFreq) {
                return {
                    action: 'check_raise', frequency: bluffCRFreq,
                    sizeFraction: 3.0, reason: 'pure_bluff_checkraise'
                };
            }
        }
        return {
            action: 'check_fold', frequency: 0.85,
            sizeFraction: 0, reason: 'air_default_fold'
        };
    }

    // Default fallthrough
    return {
        action: 'check_call', frequency: 0.50,
        sizeFraction: 0, reason: 'default_fallthrough'
    };
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
    // 3-bet value range (premium hands) — tighter in EP, wider in LP
    const value3BetThreshold = { BTN: 78, CO: 80, HJ: 84, MP: 87, UTG: 90, SB: 76, BB: 74 };
    const bluff3BetThreshold = { BTN: 35, CO: 40, HJ: 45, MP: 50, UTG: 55, SB: 38, BB: 35 };

    const valueThreshold = value3BetThreshold[position] || 85;
    const bluffFloor = bluff3BetThreshold[position] || 45;

    // ═══ 3-BET SIZING — IP vs OOP ═══
    // In position: 3-bet to ~3x the raise (smaller, keeps pot manageable)
    // Out of position: 3-bet to ~3.5x-4x (larger, compensate for OOP disadvantage)
    const ipPositions = new Set(['BTN', 'CO', 'HJ']);
    const isIP = ipPositions.has(position);
    const baseMult = isIP ? 3.0 : 3.5;

    // ═══ SHORT-STACK 3-BET JAM ═══
    // With <25 BB, 3-bet should be all-in (no point making it small)
    if (stackBB <= 25 && handStrength >= valueThreshold) {
        return { should3Bet: true, size3Bet: stackBB * bb, isBluff3Bet: false, isJam: true };
    }

    // Value 3-bet
    if (handStrength >= valueThreshold) {
        const size = Math.round(facingRaise * (baseMult + Math.random() * 0.3)); // +/- 0.3x noise
        return { should3Bet: true, size3Bet: size, isBluff3Bet: false };
    }

    // ═══ LIGHT 3-BET (bluff) — fold equity play ═══
    // Hands just below calling range that have good blocker/equity properties
    if (handStrength >= bluffFloor - 10 && handStrength < bluffFloor) {
        // Only bluff 3-bet with enough stack and not too deep (keeps SPR manageable)
        if (stackBB >= 35 && stackBB <= 120) {
            // Higher frequency from BTN/SB (these positions face wider opens)
            const bluff3BetFreq = isIP ? 0.20 : (position === 'SB' ? 0.28 : 0.15);
            if (Math.random() < bluff3BetFreq) {
                const size = Math.round(facingRaise * baseMult);
                return { should3Bet: true, size3Bet: size, isBluff3Bet: true };
            }
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
    if (!handEval || typeof handEval !== 'object') return { equity: 0, outs: 0, shouldCall: () => false }; // Bug #53: guard null handEval
    let outs = 0;

    if (handEval.hasFlushDraw) outs += 9;  // 9 outs for flush draw
    if (handEval.hasOESD) outs += 8;        // 8 outs for OESD
    if (handEval.hasGutshot && !handEval.hasOESD) outs += 4;  // 4 outs for gutshot (only if not already OESD)
    // Reduce for overlap (flush draw + OESD share some outs — ~2 cards can complete both)
    if (handEval.hasFlushDraw && handEval.hasOESD) outs -= 2;
    if (handEval.hasFlushDraw && handEval.hasGutshot && !handEval.hasOESD) outs -= 1;

    // ═══ BACKDOOR DRAW OUTS (new) ═══
    // Backdoor flush draw on flop = ~1.5 effective outs (3 runner-runner combos)
    // Only count on flop since backdoors need 2 cards
    if (handEval.hasBackdoorFlush && street === 'flop' && !handEval.hasFlushDraw) {
        outs += 1.5; // ~4.2% additional equity
    }

    // ═══ MADE HAND + DRAW: Add improvement outs ═══
    // Top pair can improve to two pair (3 outs) or trips (2 outs)
    if (handEval.category === 'top_pair' || handEval.category === 'overpair') {
        outs += 2; // Improvement outs (set or better)
    }
    // Second/third pair can improve to two pair or trips
    if (handEval.category === 'second_pair' || handEval.category === 'third_pair') {
        outs += 2;
    }

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

    // ═══ NUT DRAW PREMIUM ═══
    // Nut flush draws and nut straight draws are worth more because they win bigger pots
    // BUG #17 FIX: Was treating ALL flush draws as nut draws. Must check for ace-high flush draw
    // specifically — a 7-high flush draw is NOT a nut draw and has reverse implied odds.
    const isNutDraw = handEval.hasFlushDraw && handEval.category !== 'flush' && handEval.isNutFlushDraw === true;
    const nutPremium = isNutDraw ? 0.03 : 0; // ~3% implied odds premium for nut draws
    // Reverse implied odds penalty for non-nut flush draws (they make 2nd best flushes)
    const reverseImpliedPenalty = (handEval.hasFlushDraw && !isNutDraw && handEval.category !== 'flush') ? -0.02 : 0;

    return {
        equity: Math.min(0.65, Math.max(0, equity / 100 + nutPremium + reverseImpliedPenalty)),
        outs: Math.round(outs * 10) / 10, // Round to 1 decimal
        isNutDraw,
        shouldCall: (potOdds) => (equity / 100 + nutPremium + reverseImpliedPenalty) >= potOdds,
        // ═══ IMPLIED ODDS ADJUSTED CALL (new) ═══
        // For nut draws and big draws, calling is profitable even when direct odds are short
        shouldCallWithImplied: (potOdds, stackBB) => {
            const directOK = (equity / 100 + nutPremium) >= potOdds;
            if (directOK) return true;
            // Implied odds: if we're deep enough and the draw is strong, we get paid on later streets
            if (stackBB >= 40 && outs >= 9) {
                const impliedMultiplier = isNutDraw ? 1.35 : 1.20; // Nut draws get bigger implied odds
                return (equity / 100 * impliedMultiplier + nutPremium) >= potOdds;
            }
            return false;
        }
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
function getRiverStrategy(handStrength, potOdds, canBet, facingBet, aggressionBias, opts = {}) {
    const {
        boardWetness = 'medium',
        oppTendency = 'balanced',
        oppConfidence = 0,
        hasBlockers = false,
        drawsCompleted = false,
        drawsBricked = false,
        isIP = true,
        betToPot = 0.66
    } = opts;

    // ═══ PHASE 36B: OPPONENT-AWARE ADJUSTMENTS ═══
    const oppIsPassive = oppTendency === 'weak-tight' && oppConfidence > 0.3;
    const oppIsBluffy = oppTendency === 'bluffy' && oppConfidence > 0.3;
    const oppIsStation = oppTendency === 'calling-station' && oppConfidence > 0.3;

    if (!facingBet && canBet) {
        // ── NUTS: Overbet for max value ──
        if (handStrength >= 90) {
            let sizeFrac = 0.85;
            if (oppIsStation) sizeFrac = 1.10;
            if (drawsCompleted) sizeFrac = Math.min(1.30, sizeFrac + 0.15);
            if (oppIsPassive && boardWetness === 'dry') sizeFrac = 0.65;
            return { action: 'bet', sizeFraction: sizeFrac };
        }
        // ── Strong value (75-90) ──
        if (handStrength >= 75) {
            let sizeFrac = 0.66;
            if (oppIsStation) sizeFrac = 0.80;
            if (boardWetness === 'wet' && drawsCompleted) sizeFrac = 0.75;
            return { action: 'bet', sizeFraction: sizeFrac };
        }
        // ── Thin value (50-75): context-dependent ──
        if (handStrength >= 50 && handStrength < 75) {
            const strengthBonus = (handStrength - 50) / 100;
            let betFreq = 0.65 + strengthBonus + aggressionBias / 40;
            let sizeFrac = 0.33;
            if (boardWetness === 'dry') { betFreq += 0.08; sizeFrac = 0.28; }
            if (boardWetness === 'wet' && drawsCompleted) betFreq -= 0.10;
            if (oppIsStation) { betFreq += 0.10; sizeFrac = 0.40; }
            if (oppIsPassive) betFreq += 0.06;
            if (oppIsBluffy) betFreq -= 0.08;
            if (isIP) betFreq += 0.05;
            if (Math.random() < betFreq) return { action: 'bet', sizeFraction: sizeFrac };
            return { action: 'check', sizeFraction: 0 };
        }
        // ── Bluff with nothing ──
        if (handStrength < 20) {
            let bluffFreq = 0.12 + aggressionBias / 60;
            let bluffSize = 0.66;
            if (hasBlockers) { bluffFreq += 0.12; bluffSize = 0.75; }
            if (drawsBricked) bluffFreq -= 0.06;
            if (drawsCompleted) bluffFreq += 0.08;
            if (oppIsPassive) bluffFreq += 0.10;
            if (oppIsStation) bluffFreq = Math.max(0, bluffFreq - 0.10);
            bluffFreq = Math.max(0, Math.min(0.35, bluffFreq));
            if (Math.random() < bluffFreq) return { action: 'bet', sizeFraction: bluffSize };
        }
        return { action: 'check', sizeFraction: 0 };
    }

    if (facingBet) {
        // ── Monsters: Raise for value ──
        if (handStrength >= 85) {
            let raiseMult = 2.5;
            if (oppIsStation) raiseMult = 3.0;
            if (oppIsPassive) raiseMult = 2.2;
            return { action: 'raise', sizeFraction: raiseMult };
        }
        // ── Strong: call (or raise small bets) ──
        if (handStrength >= 65) {
            if (betToPot <= 0.40 && Math.random() < 0.30) {
                return { action: 'raise', sizeFraction: 2.8 };
            }
            return { action: 'call', sizeFraction: 0 };
        }
        // ── Bluff-catching (45-65): opponent-aware ──
        if (handStrength >= 45) {
            let callFreq = 0.60;
            if (potOdds < 0.35) callFreq += 0.10;
            if (oppIsBluffy) callFreq += 0.15;
            if (oppIsPassive && betToPot >= 0.60) callFreq -= 0.20;
            if (hasBlockers) callFreq += 0.08;
            if (drawsBricked) callFreq += 0.08;
            callFreq = Math.max(0.15, Math.min(0.85, callFreq));
            if (Math.random() < callFreq) return { action: 'call', sizeFraction: 0 };
            return { action: 'fold', sizeFraction: 0 };
        }
        // ── Marginal (30-45): tight calling ──
        if (handStrength >= 30 && potOdds < 0.25) {
            let margCallFreq = 0.30;
            if (oppIsBluffy) margCallFreq = 0.45;
            if (oppIsPassive) margCallFreq = 0.10;
            if (hasBlockers && drawsBricked) margCallFreq += 0.12;
            if (betToPot >= 0.80) margCallFreq -= 0.10;
            margCallFreq = Math.max(0.05, Math.min(0.55, margCallFreq));
            return Math.random() < margCallFreq
                ? { action: 'call', sizeFraction: 0 }
                : { action: 'fold', sizeFraction: 0 };
        }
        return { action: 'fold', sizeFraction: 0 };
    }

    return { action: 'check', sizeFraction: 0 };
}

// --- #31: Deep Stack Adjustments ---
/**
 * Adjust preflop strategy for deep stacks (200BB+).
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
function getOptimalBetSize(handCategory, street, potSize, isBluff, opts = {}) {
    if (!opts || typeof opts !== 'object') opts = {}; // Bug #75: null opts crashes destructuring
    const {
        boardWetness = 'medium',     // 'dry', 'medium', 'wet'
        isInPosition = true,
        numPlayers = 2,
        oppTendency = 'balanced',    // 'bluffy', 'weak-tight', 'balanced', 'calling-station'
        oppConfidence = 0,
        oppCallFreq = 0.50,
        handStrength = 50,           // 0-100 for polarization decisions
        heroIsAggressor = false,
        stackBB = 100,
        isPolarized = false          // Force polarized sizing
    } = opts;

    const multiway = numPlayers >= 3;

    // ═══ SIZING STRATEGY: POLARIZED vs MERGED ═══
    // Polarized: bet big with nutted hands AND bluffs (no medium)
    // Merged: bet small-medium with a wide range including medium hands
    //
    // Polarized is better: deep-stacked, IP, dry boards, river, heads-up
    // Merged is better: shallow, OOP, wet boards, multiway, flop

    let usePolarized = isPolarized;
    if (!usePolarized) {
        // Auto-detect polarization from context
        if (street === 'river') usePolarized = true; // River is almost always polarized
        if (handStrength >= 70 || handStrength <= 20) usePolarized = true; // Nut or air = polarized
        if (boardWetness === 'dry' && isInPosition && !multiway) usePolarized = true;
    }

    // ═══ BLUFF SIZING ═══
    if (isBluff) {
        if (usePolarized) {
            // Polarized bluffs: same size as value (opponent indifferent)
            const bluffSizes = { flop: 0.66, turn: 0.75, river: 0.75 };
            let sz = bluffSizes[street] || 0.50;

            // Overbet bluff on river when polarized (1.0-1.5x pot)
            if (street === 'river' && stackBB >= 60) sz = 1.0 + Math.random() * 0.25;

            // Against weak-tight: bigger bluffs (they fold more)
            if (oppTendency === 'weak-tight' && oppConfidence > 0.3) sz *= 1.20;
            // Against callers: smaller bluffs (better risk/reward since they call)
            if (oppTendency === 'calling-station' && oppConfidence > 0.3) sz *= 0.70;
            // Multiway: don't bluff big
            if (multiway) sz *= 0.70;

            // ═══ LIVE-READ BLUFF SIZING (Phase 31) ═══
            const lr2 = opts.liveRead;
            if (lr2 && lr2.confidence >= 0.25) {
                if (lr2.foldFreq > 0.55) sz *= 1.15; // Folder → bigger bluffs for max fold eq
                if (lr2.callFreq > 0.55) sz *= 0.75; // Station → minimize loss
                if (lr2.foldToRaisePct !== null && lr2.foldToRaisePct > 0.55) sz *= 1.12;
            }

            return Math.min(2.0, sz);
        } else {
            // Merged bluffs: small sizing (risk less with air in a merged range)
            return street === 'river' ? 0.40 : 0.25;
        }
    }

    // ═══ VALUE SIZING ═══
    // Base sizing by hand category
    const sizingMap = {
        // Nutted hands: overbet territory
        royal_flush: 1.50, straight_flush: 1.50,
        quads: 1.50, full_house: 1.25, flush: 0.90,
        // Strong: big bet
        straight: 0.80, set: 0.80, trips: 0.75,
        // Medium-strong: standard
        two_pair: 0.66, overpair: 0.60, top_pair: 0.50,
        // Medium: block/thin value
        second_pair: 0.33, third_pair: 0.30, underpair: 0.33,
        // Thin value
        two_pair_weak: 0.45, bottom_pair: 0.25,
        // Board-made hands (BUG #28): hero doesn't contribute — these are bluff-catchers
        board_trips: 0.30, board_two_pair: 0.28, board_pair: 0.25,
        // Draws (semi-bluff sizing)
        no_pair: 0.33, high_card: 0.33, unknown: 0.40
    };

    let baseSizing = sizingMap[handCategory] || 0.50;

    // ═══ BOARD TEXTURE ADJUSTMENTS ═══
    if (boardWetness === 'wet') {
        // Wet boards: bet bigger for protection (don't let draws see cheap cards)
        if (handStrength >= 40) baseSizing *= 1.15; // Value hands size up
        // Nutted hands on wet boards: they have draws → get max value
        if (handStrength >= 70) baseSizing *= 1.10;
    } else if (boardWetness === 'dry') {
        // Dry boards: bet smaller (merged strategy, high c-bet frequency)
        baseSizing *= 0.80;
        // But nutted hands can still go big on dry boards (trapping won't work as well)
        if (handStrength >= 75) baseSizing *= 1.15;
    }

    // ═══ DOUBLE-PAIRED BOARD: SMALL BALL OVERRIDE ═══
    // When board has 2+ pairs (e.g., KK558), full houses are everywhere.
    // Anyone matching a board pair rank has a full house. Non-full-house hands
    // should use small ball sizing — bet small to control the pot and minimize losses
    // when called by better hands. This applies to ALL non-nutted categories.
    const boardMadeCategories = new Set(['board_trips', 'board_two_pair', 'board_pair', 'two_pair_weak']);
    if (boardMadeCategories.has(handCategory) && handStrength < 70) {
        baseSizing = Math.min(baseSizing, 0.30); // Cap at 30% pot — small ball
    }

    // ═══ POSITION ADJUSTMENTS ═══
    if (!isInPosition) {
        // OOP: bet slightly bigger (we need to charge draws more since we act first)
        baseSizing *= 1.08;
    }

    // ═══ MULTIWAY ADJUSTMENTS ═══
    if (multiway) {
        // Multiway: bet bigger with strong hands (more callers = more value)
        if (handStrength >= 55) baseSizing *= 1.10;
        // But thin value: bet smaller (more chance someone has us beat)
        if (handStrength < 50 && handStrength >= 30) baseSizing *= 0.80;
    }

    // ═══ POLARIZED VS MERGED SIZING ═══
    if (usePolarized) {
        // Polarized: size up to build the pot (opponent has to call or fold with bluff catcher)
        if (handStrength >= 65) baseSizing = Math.max(baseSizing, 0.75);
        // River polarized: go big or go home
        if (street === 'river' && handStrength >= 70) baseSizing = Math.max(baseSizing, 0.85);
        // Overbet with absolute nuts
        if (handStrength >= 85 && stackBB >= 60) baseSizing = Math.max(baseSizing, 1.20);
    } else {
        // Merged: keep sizing smaller to use wider range
        baseSizing = Math.min(baseSizing, 0.66);
    }

    // ═══ OPPONENT-AWARE SIZING ═══
    if (oppConfidence > 0.25) {
        // Against calling stations: size UP for value (they call everything)
        if (oppTendency === 'calling-station' || oppCallFreq > 0.60) {
            if (handStrength >= 45) baseSizing *= 1.15; // More value from callers
        }
        // Against weak-tight: size DOWN (keep them in the pot, they fold to big bets)
        if (oppTendency === 'weak-tight') {
            if (handStrength >= 45 && handStrength < 80) baseSizing *= 0.80; // Thin value: bet small
            // But nutted hands vs nits: go normal/big (they pay off top of range)
        }
        // Against bluffy opponents: don't overbet (they might re-bluff raise us)
        if (oppTendency === 'bluffy' && handStrength >= 60 && handStrength < 80) {
            baseSizing *= 0.90; // Induce the re-bluff by betting smaller
        }
    }

    // ═══ LIVE-READ BET SIZING OVERRIDE (Phase 30) ═══
    // Direct live-read data takes priority for sizing when available
    const lr = opts.liveRead;
    if (lr && lr.confidence >= 0.25) {
        // Station: size up value bets
        if (lr.callFreq > 0.55 && handStrength >= 45) baseSizing *= 1.10;
        if (lr.callFreq > 0.65 && handStrength >= 55) baseSizing *= 1.06;
        // Folder: size down to get the call
        if (lr.foldFreq > 0.55 && handStrength >= 45 && handStrength < 80) baseSizing *= 0.85;
        // Aggro: smaller sizing to induce re-raise
        if (lr.aggFreq > 0.45 && handStrength >= 65) baseSizing *= 0.92;
        // High WTSD: they go to showdown, size up
        if (lr.wtsd !== null && lr.wtsd > 0.30 && handStrength >= 50) baseSizing *= 1.06;
    }

    // ═══ STREET ESCALATION ═══
    // Later streets = bigger sizing (pot is bigger, stacks are shorter relative to pot)
    if (street === 'turn') baseSizing *= 1.10;
    if (street === 'river') baseSizing *= 1.20;

    // ═══ STACK DEPTH ═══
    // Short-stacked: size down to keep pot manageable (or jam)
    if (stackBB <= 30 && baseSizing > 0.66) {
        baseSizing = Math.min(baseSizing, 0.66); // Don't overbet when short
    }

    // Clamp to reasonable range: 20% to 200% pot
    return Math.max(0.20, Math.min(2.00, baseSizing));
}

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRIC BET SIZING PLANNER
// ═══════════════════════════════════════════════════════════════════════════
// Plans bet sizing across remaining streets to get all the money in by river.
// Given: current pot, hero stack, streets remaining, and target (jam or not).
// Returns: optimal sizing fraction for THIS street that sets up future streets.
//
// Example: 100bb stack, 10bb pot on flop.
// Geometric growth: bet 75% pot each street → pot grows ~3x each street.
// Flop: 10bb pot → bet 7.5 → pot becomes 25bb. Turn: 25bb → bet 18.75 → pot 62.5bb.
// River: 62.5bb → bet 47 → pot 157bb. Stack used: ~73bb of 100bb.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE EVOLUTION TRACKER
// ═══════════════════════════════════════════════════════════════════════════
// Tracks how the board changes from flop→turn→river and who benefits.
// This is critical for understanding range advantage shifts.

/**
 * Analyze how the board evolved from the flop to the current street.
 * @param {Array} board - Current board cards (3-5 cards)
 * @param {string} street - 'flop', 'turn', or 'river'
 * @returns {Object} Board evolution analysis
 */
function analyzeBoardEvolution(board, street) {
    if (!Array.isArray(board) || board.length < 3) { // Bug #50: guard non-array board
        return { evolution: 'unknown', pfrImpact: 0, callerImpact: 0, scareCards: [], drawsCompleted: [] };
    }

    const flopBoard = board.slice(0, 3);
    const flopRanks = flopBoard.map(c => RANKS.indexOf(c[0]));
    const flopSuits = flopBoard.map(c => c[1]);
    const flopSuitCounts = {};
    flopSuits.forEach(s => { flopSuitCounts[s] = (flopSuitCounts[s] || 0) + 1; });
    const flopMaxSuit = Math.max(...Object.values(flopSuitCounts));
    const flopFlushDrawSuit = Object.entries(flopSuitCounts).find(([s, c]) => c >= 2)?.[0];

    const result = {
        evolution: 'neutral',
        pfrImpact: 0,         // Positive = good for PFR, negative = bad
        callerImpact: 0,      // Positive = good for caller, negative = bad
        scareCards: [],        // Cards that changed the dynamic
        drawsCompleted: [],    // What draws got there
        drawsBricked: [],      // What draws missed
        boardPaired: false,    // Did the board pair on a later street?
        overcard: false,       // Did an overcard fall?
        flushCompleted: false,
        straightCompleted: false,
        boardGotWetter: false,
        boardGotDrier: false
    };

    if (street === 'flop') return result; // No evolution on flop

    // ═══ TURN CARD ANALYSIS ═══
    if (board.length >= 4) {
        const turnCard = board[3];
        const turnRank = RANKS.indexOf(turnCard[0]);
        const turnSuit = turnCard[1];

        // Overcard detection: turn card higher than all flop cards
        if (turnRank > Math.max(...flopRanks)) {
            result.overcard = true;
            result.scareCards.push(turnCard);
            result.pfrImpact += 3; // Overcards favor PFR (AK, AQ hit)
            result.callerImpact -= 2;
        }

        // Board pairing
        if (flopRanks.includes(turnRank)) {
            result.boardPaired = true;
            result.scareCards.push(turnCard);
            result.pfrImpact += 1; // Paired board slightly favors PFR (full houses)
        }

        // Flush draw created or completed
        const turnSuitCounts = { ...flopSuitCounts };
        turnSuitCounts[turnSuit] = (turnSuitCounts[turnSuit] || 0) + 1;
        const turnMaxSuit = Math.max(...Object.values(turnSuitCounts));
        if (flopMaxSuit < 3 && turnMaxSuit >= 3) {
            result.drawsCompleted.push('flush');
            result.flushCompleted = true;
            result.callerImpact += 4; // Flush completions favor caller (suited hands)
            result.pfrImpact -= 3;
            result.scareCards.push(turnCard);
        } else if (flopMaxSuit < 2 && turnMaxSuit >= 2) {
            result.boardGotWetter = true;
            result.callerImpact += 1;
        }

        // Straight completion check (simplified)
        const allRanks = [...flopRanks, turnRank].sort((a, b) => a - b);
        let maxRun = 1, curRun = 1;
        for (let i = 1; i < allRanks.length; i++) {
            if (allRanks[i] - allRanks[i - 1] === 1) { curRun++; maxRun = Math.max(maxRun, curRun); }
            else if (allRanks[i] !== allRanks[i - 1]) curRun = 1;
        }
        // Check for A-low straight (A2345)
        if (allRanks.includes(12) && allRanks.includes(0) && allRanks.includes(1)) maxRun = Math.max(maxRun, 3);
        if (maxRun >= 4) {
            result.drawsCompleted.push('straight');
            result.straightCompleted = true;
            result.callerImpact += 3;
            result.pfrImpact -= 2;
            result.scareCards.push(turnCard);
        }

        // Low card on high flop = blank (good for PFR)
        if (turnRank < 6 && Math.min(...flopRanks) >= 8) {
            result.boardGotDrier = true;
            result.pfrImpact += 2;
            result.callerImpact -= 1;
        }
    }

    // ═══ RIVER CARD ANALYSIS ═══
    if (board.length >= 5) {
        const riverCard = board[4];
        const riverRank = RANKS.indexOf(riverCard[0]);
        const riverSuit = riverCard[1];
        const turnBoard = board.slice(0, 4);
        const turnRanks = turnBoard.map(c => RANKS.indexOf(c[0]));
        const turnSuits = turnBoard.map(c => c[1]);
        const turnSuitCounts2 = {};
        turnSuits.forEach(s => { turnSuitCounts2[s] = (turnSuitCounts2[s] || 0) + 1; });
        const turnMaxSuit2 = Math.max(...Object.values(turnSuitCounts2));

        // River overcard
        if (riverRank > Math.max(...turnRanks)) {
            result.overcard = true;
            result.scareCards.push(riverCard);
            result.pfrImpact += 2;
        }

        // Board pairing on river
        if (turnRanks.includes(riverRank)) {
            result.boardPaired = true;
            result.pfrImpact += 1;
        }

        // Flush completed on river
        const riverSuitCounts = { ...turnSuitCounts2 };
        riverSuitCounts[riverSuit] = (riverSuitCounts[riverSuit] || 0) + 1;
        const riverMaxSuit = Math.max(...Object.values(riverSuitCounts));
        if (turnMaxSuit2 < 3 && riverMaxSuit >= 3) {
            result.drawsCompleted.push('flush');
            result.flushCompleted = true;
            result.callerImpact += 4;
            result.pfrImpact -= 3;
        }
        // Flush draw BRICKED on river
        if (turnMaxSuit2 >= 2 && turnMaxSuit2 < 3 && riverMaxSuit < 3) {
            result.drawsBricked.push('flush');
            result.pfrImpact += 2; // Bricked draws favor PFR (bluff-catchers win)
            result.callerImpact -= 2;
        }

        // Straight completed on river
        const allRanksR = [...turnRanks, riverRank].sort((a, b) => a - b);
        let maxRunR = 1, curRunR = 1;
        for (let i = 1; i < allRanksR.length; i++) {
            if (allRanksR[i] - allRanksR[i - 1] === 1) { curRunR++; maxRunR = Math.max(maxRunR, curRunR); }
            else if (allRanksR[i] !== allRanksR[i - 1]) curRunR = 1;
        }
        if (allRanksR.includes(12) && allRanksR.includes(0) && allRanksR.includes(1)) maxRunR = Math.max(maxRunR, 3);
        if (maxRunR >= 4) {
            result.drawsCompleted.push('straight_completed');
            result.straightCompleted = true;
            result.callerImpact += 3;
            result.pfrImpact -= 2;
        }
        // Straight draw BRICKED
        if (maxRunR < 4 && board.length === 5) {
            // Check if turn had 3-in-a-row (open-ended) that didn't get there
            const turnAllRanks = turnRanks.sort((a, b) => a - b);
            let turnMaxRun = 1, turnCurRun = 1;
            for (let i = 1; i < turnAllRanks.length; i++) {
                if (turnAllRanks[i] - turnAllRanks[i - 1] === 1) { turnCurRun++; turnMaxRun = Math.max(turnMaxRun, turnCurRun); }
                else if (turnAllRanks[i] !== turnAllRanks[i - 1]) turnCurRun = 1;
            }
            if (turnMaxRun >= 3 && maxRunR < 4) {
                result.drawsBricked.push('straight');
                result.pfrImpact += 1;
            }
        }

        // Blank river (low card, no draws complete)
        if (riverRank < 6 && result.drawsCompleted.length === 0 && !result.boardPaired) {
            result.boardGotDrier = true;
            result.pfrImpact += 1;
        }
    }

    // ═══ OVERALL EVOLUTION CLASSIFICATION ═══
    if (result.pfrImpact >= 3) result.evolution = 'pfr_favorable';
    else if (result.pfrImpact <= -3) result.evolution = 'caller_favorable';
    else if (result.drawsCompleted.length > 0) result.evolution = 'dynamic';
    else if (result.drawsBricked.length > 0) result.evolution = 'static_brick';
    else result.evolution = 'neutral';

    return result;
}

/**
 * Calculate the geometric bet sizing fraction that gets stacks in by a target street.
 * @param {number} potSize - Current pot in chips
 * @param {number} heroStack - Hero's remaining stack in chips
 * @param {number} streetsRemaining - Number of betting streets left (including current)
 * @param {boolean} targetAllIn - Whether we want to be all-in by the last street
 * @returns {{ sizeFraction: number, projectedPotByStreet: number[], isJammable: boolean }}
 */
function getGeometricSizing(potSize, heroStack, streetsRemaining, targetAllIn = true) {
    if (streetsRemaining <= 0 || potSize <= 0) {
        return { sizeFraction: 0.66, projectedPotByStreet: [], isJammable: false };
    }

    // SPR = Stack-to-Pot Ratio
    const spr = heroStack / Math.max(1, potSize);

    // If already pot committed (SPR < 2), just jam
    if (spr < 2) {
        return { sizeFraction: 999, projectedPotByStreet: [heroStack + potSize], isJammable: true };
    }

    // If we DON'T want to get all-in (pot control), return standard sizing
    if (!targetAllIn) {
        return {
            sizeFraction: streetsRemaining === 1 ? 0.66 : 0.50,
            projectedPotByStreet: [],
            isJammable: false
        };
    }

    // ═══ GEOMETRIC SIZING CALCULATION ═══
    // We want: after N streets of betting fraction f, the pot = 2 * heroStack
    // (i.e., hero puts in all remaining chips across N streets).
    //
    // At each street: newPot = pot * (1 + 2*f) [we bet f*pot, opponent calls f*pot]
    // After N streets: finalPot = pot * (1+2f)^N
    // We want: sum of our bets ≈ heroStack
    // Our total bet = f*pot + f*pot*(1+2f) + f*pot*(1+2f)^2 + ...
    // = f*pot * [(1+2f)^N - 1] / (2f)
    // Set equal to heroStack and solve for f.
    //
    // Simpler approach: binary search for f that gets us approximately all-in.

    let lo = 0.20, hi = 2.00;
    for (let iter = 0; iter < 20; iter++) {
        const mid = (lo + hi) / 2;
        let totalBet = 0;
        let currentPot = potSize;
        for (let s = 0; s < streetsRemaining; s++) {
            const betAmt = currentPot * mid;
            totalBet += betAmt;
            currentPot = currentPot + betAmt * 2; // both players put in betAmt
        }
        if (totalBet < heroStack) lo = mid;
        else hi = mid;
    }

    const optimalFrac = (lo + hi) / 2;

    // Project pot sizes for each street
    const projectedPotByStreet = [];
    let currentPot = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        const betAmt = currentPot * optimalFrac;
        currentPot = currentPot + betAmt * 2;
        projectedPotByStreet.push(Math.round(currentPot));
    }

    // Check if this actually gets us close to all-in
    let totalBet = 0;
    let cp = potSize;
    for (let s = 0; s < streetsRemaining; s++) {
        totalBet += cp * optimalFrac;
        cp = cp + cp * optimalFrac * 2;
    }
    const isJammable = totalBet >= heroStack * 0.85; // Within 85% of stack = will jam

    return {
        sizeFraction: Math.max(0.25, Math.min(1.50, optimalFrac)),
        projectedPotByStreet,
        isJammable
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT-LOOP INTENSIFIER
// ═══════════════════════════════════════════════════════════════════════════
// When we have high-confidence reads on a specific opponent's leak,
// amplify the exploit. This is the "maximize EV vs known fish" module.
// With enough observed hands and clear tendencies, shift from GTO
// adjustments to pure exploitation mode.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Intensify exploitative adjustments when confidence is high.
 * @param {Object} params
 * @returns {{ action: string|null, amount: number|null, exploiting: boolean, exploit: string }}
 */
function applyExploitIntensifier(params) {
    const {
        currentAction, currentAmount, handStrength, handCategory,
        street, potSize, toCall, bb, canRaise, canCall, raiseAction,
        oppTendency, oppConfidence, oppBluffFreq, oppCallFreq, oppFoldFreq,
        isIP, heroIsAggressor, boardWetness, drawOuts, numPlayers,
        liveRead = null  // Phase 28: direct live-read access
    } = params;

    // Only engage when we have HIGH confidence reads (40+ hands observed)
    // ═══ LIVE-READ EXPLOIT GATE (Phase 28) ═══
    // With live-read, we can exploit EARLIER (lower confidence threshold)
    const liveConfident = liveRead && liveRead.confidence >= 0.30;
    const effectiveConfidence = liveConfident ? Math.max(oppConfidence, 0.50) : oppConfidence;
    if (effectiveConfidence < 0.50) return { action: null, exploiting: false, exploit: 'none' };

    const facingBet = toCall > 0;
    const multiway = numPlayers >= 3;

    // ═══ EXPLOIT 1: OVER-FOLDER ═══
    // Opponent folds > 55% → print money by betting any two cards
    // ═══ LIVE-READ OVER-FOLDER (Phase 28) ═══
    const effectiveFoldFreq = (liveConfident && liveRead.foldFreq > oppFoldFreq) ? liveRead.foldFreq : oppFoldFreq;
    if (effectiveFoldFreq > 0.55 && effectiveConfidence >= 0.55) {
        // Bluff more on every street when not facing a bet
        if (!facingBet && handStrength < 25 && canRaise && !multiway) {
            const exploitBluffFreq = 0.40 + (effectiveFoldFreq - 0.55) * 2.0; // Scales up to ~70%
            if (Math.random() < Math.min(0.70, exploitBluffFreq)) {
                // Live-read sizing: SMALLER vs folders (save chips, same fold equity)
                let sizeFrac = 0.50 + Math.random() * 0.15; // 50-65% pot
                if (liveConfident && liveRead.foldFreq > 0.60) sizeFrac = 0.38 + Math.random() * 0.10; // 38-48% pot
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: over-folder bluff (foldFreq=${(oppFoldFreq * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'over_folder_bluff'
                };
            }
        }
        // Facing a bet: opponent is betting into us but usually folds → raise to test
        if (facingBet && handStrength >= 25 && handStrength < 50 && canRaise && !multiway) {
            if (Math.random() < 0.30) {
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: raise vs over-folder`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(toCall * 2.5),
                    exploiting: true, exploit: 'over_folder_raise'
                };
            }
        }
    }

    // ═══ EXPLOIT 2: CALLING STATION ═══
    // Opponent calls > 60% → maximize value, never bluff
    // ═══ LIVE-READ CALLING STATION (Phase 28) ═══
    const effectiveCallFreq = (liveConfident && liveRead.callFreq > oppCallFreq) ? liveRead.callFreq : oppCallFreq;
    if (effectiveCallFreq > 0.60 && effectiveConfidence >= 0.50) {
        // Value bet thinner — they call with garbage
        if (!facingBet && handStrength >= 35 && handStrength < 55 && canRaise && !multiway) {
            // ═══ Phase 42 FIX: was using raw oppCallFreq — use effectiveCallFreq so live-read data intensifies the exploit ═══
            const thinValueFreq = 0.55 + (effectiveCallFreq - 0.60) * 1.5;
            if (Math.random() < Math.min(0.80, thinValueFreq)) {
                // Size UP — they're calling anyway
                const sizeFrac = 0.65 + Math.random() * 0.20; // 65-85% pot
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: thin value vs calling station (callFreq=${(oppCallFreq * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'calling_station_value'
                };
            }
        }
        // Strong hands: overbet for value
        if (!facingBet && handStrength >= 70 && canRaise) {
            const overbetFrac = 1.0 + Math.random() * 0.50; // 100-150% pot
            console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: overbet value vs calling station`);
            return {
                action: raiseAction.type,
                amount: Math.round(potSize * overbetFrac),
                exploiting: true, exploit: 'calling_station_overbet'
            };
        }
        // NEVER bluff calling stations — check instead of betting weak hands
        // ═══ Phase 42 FIX: was checking `currentAction === 'bet' || 'raise'` but currentAction is ALWAYS null ═══
        // The exploit runs BEFORE the main decision, so we proactively return check for weak hands
        if (!facingBet && handStrength < 20 && canRaise) {
            return {
                action: 'check', amount: null,
                exploiting: true, exploit: 'calling_station_no_bluff'
            };
        }
    }

    // ═══ EXPLOIT 3: PROLIFIC BLUFFER ═══
    // Opponent bluffs > 40% → call them down light, let them hang themselves
    // ═══ LIVE-READ BLUFFER (Phase 28) ═══
    const effectiveBluffFreq = (liveConfident && liveRead.bluffRate !== null && liveRead.bluffRate > oppBluffFreq)
        ? liveRead.bluffRate : oppBluffFreq;
    if (effectiveBluffFreq > 0.40 && effectiveConfidence >= 0.50) {
        // Widen calling range dramatically
        if (facingBet && handStrength >= 20 && handStrength < 50 && canCall) {
            // ═══ Phase 42 FIX: was using raw oppBluffFreq — use effectiveBluffFreq so live-read data intensifies the exploit ═══
            const exploitCallFreq = 0.50 + (effectiveBluffFreq - 0.40) * 2.0;
            if (Math.random() < Math.min(0.75, exploitCallFreq)) {
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: call down bluffer (bluffFreq=${(oppBluffFreq * 100).toFixed(0)}%)`);
                return {
                    action: 'call', amount: null,
                    exploiting: true, exploit: 'bluffer_calldown'
                };
            }
        }
        // Check-raise their bluffs with strong hands (trap)
        if (!facingBet && handStrength >= 65 && !isIP && !multiway) {
            if (Math.random() < 0.50) {
                return {
                    action: 'check', amount: null,
                    exploiting: true, exploit: 'bluffer_trap'
                };
            }
        }
    }

    // ═══ EXPLOIT 4: WEAK-TIGHT / NIT ═══
    // Opponent is weak-tight → steal everything, respect their bets
    // ═══ LIVE-READ NIT DETECTION (Phase 28) ═══
    const liveNit = liveConfident && liveRead.aggFreq < 0.18 && liveRead.foldFreq > 0.50;
    if ((oppTendency === 'weak-tight' && oppConfidence >= 0.55) || liveNit) {
        // Steal pots relentlessly
        if (!facingBet && handStrength < 30 && canRaise && !multiway) {
            let nitStealFreq = 0.45;
            // Live-read: smaller sizing vs extreme folders
            let sizeFrac = 0.55 + Math.random() * 0.15;
            if (liveConfident && liveRead.foldFreq > 0.60) {
                nitStealFreq = 0.55; // Steal even more
                sizeFrac = 0.40 + Math.random() * 0.10; // Cheaper steals
            }
            if (Math.random() < nitStealFreq) {
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: steal vs nit`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'nit_steal'
                };
            }
        }
        // When they bet, RESPECT it (nits only bet with strong hands)
        const nitBetToPot = toCall / Math.max(1, potSize);
        // ═══ Phase 42 FIX: removed redundant inner if (was identical to outer condition) ═══
        if (facingBet && handStrength < 60 && nitBetToPot >= 0.50) {
            return {
                action: 'fold', amount: null,
                exploiting: true, exploit: 'nit_respect'
            };
        }
    }

    // ═══ EXPLOIT 5: ONE-AND-DONE (Live-Read Exclusive) ═══
    // Opponent c-bets high but rarely double-barrels → call flop, steal turn
    if (liveConfident && liveRead.cBetPct !== null && liveRead.cBetPct > 0.60 &&
        liveRead.secondBarrelPct !== null && liveRead.secondBarrelPct < 0.30) {
        // On the flop facing a c-bet: always call with anything (they'll give up on turn)
        if (facingBet && street === 'flop' && handStrength >= 10 && canCall && !multiway) {
            if (Math.random() < 0.65) {
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: one-and-done float (cbet=${(liveRead.cBetPct * 100).toFixed(0)}% barrel=${(liveRead.secondBarrelPct * 100).toFixed(0)}%)`);
                return {
                    action: 'call', amount: null,
                    exploiting: true, exploit: 'one_and_done_float'
                };
            }
        }
        // On the turn when they checked: stab to take the pot
        if (!facingBet && street === 'turn' && canRaise && !multiway && handStrength < 40) {
            if (Math.random() < 0.55) {
                const sizeFrac = 0.45 + Math.random() * 0.10;
                console.log(`[HorseBrain] 🎯 EXPLOIT-INTENSIFIER: one-and-done stab (cbet=${(liveRead.cBetPct * 100).toFixed(0)}% barrel=${(liveRead.secondBarrelPct * 100).toFixed(0)}%)`);
                return {
                    action: raiseAction.type,
                    amount: Math.round(potSize * sizeFrac),
                    exploiting: true, exploit: 'one_and_done_stab'
                };
            }
        }
    }

    return { action: null, exploiting: false, exploit: 'none' };
}

// ═══════════════════════════════════════════════════════════════════════════
// DONK BET DETECTION & EXPLOITATION
// ═══════════════════════════════════════════════════════════════════════════
// A "donk bet" is when a player bets into the preflop aggressor (PFA) on
// the flop. This is typically a weak/unbalanced play by recreational players.
// The PFA should exploit this by:
//   1. Raising with strong hands (punish the imbalanced range)
//   2. Calling with draws + medium hands (they're usually weak)
//   3. Folding garbage (donk bets still have some equity)
// At higher levels, donk bets can be balanced — calibrate by opponent reads.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect and respond to a donk bet scenario.
 * @param {Object} params
 * @returns {Object|null} { type, amount? } or null if not a donk bet
 */
function handleDonkBet(params) {
    if (!params || typeof params !== 'object') return null; // Bug #76: null params crashes destructuring
    const {
        heroIsAggressor, street, facingBet, handStrength, handCategory,
        drawOuts, position, potSize, toCall, bb, canRaise, canCall,
        raiseAction, aggressionBias, oppTendency, oppConfidence,
        oppCallFreq, boardWetness, numPlayers,
        // ═══ LIVE-READ DATA (Phase 17) ═══
        liveRead, tableId, primaryOppId
    } = params;

    // Only applies when: hero was PFA, we're on flop/turn, and opponent bet into us
    if (!heroIsAggressor || !facingBet || street === 'preflop' || street === 'river') return null;

    const betToPot = toCall / Math.max(1, potSize);
    const isIP = new Set(['BTN', 'CO', 'HJ']).has(position);
    const multiway = numPlayers >= 3;

    // ═══ LIVE-READ DONK BET PROFILING ═══
    // Extract live donk-bet frequency and opponent tendencies
    let liveDonkFreq = null;    // How often this opponent donk bets (null = unknown)
    let liveFoldToRaise = null; // How often they fold when raised
    let liveCallFreq = null;    // Live call frequency
    let liveDonkConf = 0;       // Confidence in live data
    let donkTimingTell = 'unknown';

    if (liveRead && liveRead.confidence >= 0.15) {
        liveDonkConf = liveRead.confidence;
        liveDonkFreq = liveRead.donkBetPct ?? null;
        liveFoldToRaise = liveRead.foldToRaisePct ?? null;
        liveCallFreq = liveRead.callFreq ?? null;

        // Timing tell on the donk bet itself
        if (liveRead.inHandActions && liveRead.inHandActions.lastAction) {
            const lastAct = liveRead.inHandActions.lastAction;
            if (lastAct.timing && lastAct.action === 'bet') {
                const streetAvg = liveRead.timingProfile?.[street]?.avgMs || liveRead.avgDecisionMs;
                if (streetAvg && streetAvg > 0) {
                    const ratio = lastAct.timing / streetAvg;
                    if (ratio < 0.40) donkTimingTell = 'snap_donk';       // Snap donk = usually weak/automatic
                    else if (ratio > 2.0) donkTimingTell = 'tank_donk';   // Tank donk = strong or tough spot
                    else if (ratio > 1.3) donkTimingTell = 'deliberate_donk'; // Thought about it = balanced
                }
            }
        }
    }

    // ═══ DONK FREQUENCY EXPLOITATION ═══
    // Players who donk frequently have weak, unbalanced ranges → raise more
    // Players who donk rarely have strong, value-heavy ranges → respect it more
    let liveRaiseBoost = 0;
    let liveSizeMod = 1.0;

    if (liveDonkFreq !== null && liveDonkConf >= 0.20) {
        if (liveDonkFreq > 0.30) {
            liveRaiseBoost += 0.12;  // Frequent donk bettor = weak range → raise more
            liveSizeMod = 1.10;      // Size up slightly
        } else if (liveDonkFreq > 0.20) {
            liveRaiseBoost += 0.06;  // Moderate donk frequency
        } else if (liveDonkFreq < 0.08) {
            liveRaiseBoost -= 0.10;  // Rare donk bettor = they have it → respect
            liveSizeMod = 0.90;
        }
    }

    // Fold-to-raise exploitation
    if (liveFoldToRaise !== null && liveDonkConf >= 0.20) {
        if (liveFoldToRaise > 0.60) liveRaiseBoost += 0.10;  // They donk-fold often → bluff raise more
        if (liveFoldToRaise < 0.25) liveRaiseBoost -= 0.08;  // They donk-call/raise → respect
    }

    // Timing tell exploitation
    if (donkTimingTell === 'snap_donk') {
        liveRaiseBoost += 0.08;  // Snap donk = weak/automatic → raise more
        liveSizeMod *= 1.05;
    } else if (donkTimingTell === 'tank_donk') {
        liveRaiseBoost -= 0.06;  // Tank donk = they thought hard → may be strong
    }

    // ═══ VS DONK BET STRATEGY ═══

    // RAISE: Strong hands — punish the donk bet range (they're usually weak)
    if (handStrength >= 70 && canRaise) {
        let raiseFreq = 0.65;
        // Raise more in position (we have info advantage)
        if (isIP) raiseFreq += 0.10;
        // Live-read frequency boost
        raiseFreq += liveRaiseBoost;
        raiseFreq = Math.max(0.40, Math.min(0.90, raiseFreq));
        // Against weak-tight opponents, raise bigger (they fold)
        let raiseMult = (oppTendency === 'weak-tight' && oppConfidence > 0.3) ? 3.0 : 2.5;
        raiseMult *= liveSizeMod;
        // Live call freq: size up vs stations
        if (liveCallFreq !== null && liveCallFreq > 0.55) raiseMult = Math.min(3.5, raiseMult * 1.10);
        raiseMult = Math.max(2.0, Math.min(4.0, raiseMult));
        if (Math.random() < raiseFreq) {
            const raiseSize = Math.round(toCall * raiseMult);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.log(`[HorseBrain] 🎯 DONK BET RAISE: str=${handStrength} liveBoost=${liveRaiseBoost.toFixed(2)} timing=${donkTimingTell}`);
            return { type: raiseAction.type, amount: clamped };
        }
        // Slowplay some monsters by just calling
        return { type: 'call' };
    }

    // RAISE: Strong draws — semi-bluff raise the donk (fold equity + equity)
    if (drawOuts >= 9 && canRaise && !multiway) {
        let semiFreq = 0.35 + aggressionBias / 40;
        semiFreq += liveRaiseBoost * 0.70; // Dampened for semi-bluffs
        semiFreq = Math.max(0.10, Math.min(0.65, semiFreq));
        if (Math.random() < semiFreq) {
            let raiseSize = Math.round(toCall * 2.5 * liveSizeMod);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.log(`[HorseBrain] 🎯 DONK BET SEMI-BLUFF RAISE: ${drawOuts} outs liveBoost=${liveRaiseBoost.toFixed(2)}`);
            return { type: raiseAction.type, amount: clamped };
        }
    }

    // RAISE: Bluff raise small donk bets (< 35% pot) — they're often weak probes
    if (betToPot <= 0.35 && handStrength >= 25 && canRaise && !multiway) {
        let bluffRaiseFreq = 0.22 + aggressionBias / 50;
        // Bluff raise more against known weak donk bettors
        if (oppTendency === 'weak-tight' && oppConfidence > 0.3) bluffRaiseFreq += 0.12;
        if (oppCallFreq > 0.60 && oppConfidence > 0.3) bluffRaiseFreq = 0; // Don't bluff callers
        // Live-read bluff raise adjustments
        bluffRaiseFreq += liveRaiseBoost * 0.80; // Dampened for bluffs
        // Live data override: if they donk-fold a lot, bluff raise even medium donks
        if (liveFoldToRaise !== null && liveFoldToRaise > 0.60 && liveDonkConf >= 0.25) {
            bluffRaiseFreq += 0.10; // They donk-fold = free money
        }
        // Snap donk + high fold-to-raise = prime bluff raise spot
        if (donkTimingTell === 'snap_donk' && liveFoldToRaise !== null && liveFoldToRaise > 0.50) {
            bluffRaiseFreq += 0.08;
        }
        // But NEVER bluff callers even with live data
        if (liveCallFreq !== null && liveCallFreq > 0.60) bluffRaiseFreq = 0;
        bluffRaiseFreq = Math.max(0, Math.min(0.45, bluffRaiseFreq));
        if (Math.random() < bluffRaiseFreq) {
            const raiseSize = Math.round(toCall * 2.8 * liveSizeMod);
            const clamped = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            console.log(`[HorseBrain] 🎯 DONK BET BLUFF RAISE: ${Math.round(betToPot * 100)}%pot liveFTR=${liveFoldToRaise?.toFixed(2) ?? '?'} timing=${donkTimingTell}`);
            return { type: raiseAction.type, amount: clamped };
        }
    }

    // CALL: Medium hands — donk bets are usually weak, our medium hands have showdown value
    if (handStrength >= 30 && canCall) {
        // ═══ Phase 39C FIX: both branches returned null (dead code). Now differentiated: ═══
        // Against large donk bets (>75% pot), only call with stronger hands
        if (betToPot >= 0.75 && handStrength < 50) {
            // Live data: rare donk bettor using large sizing → they REALLY have it → defer (likely fold)
            if (liveDonkFreq !== null && liveDonkFreq < 0.10 && liveDonkConf >= 0.20) return null;
            // Non-rare donk bettor: large donks are often weak stabs → still call with 40+
            if (handStrength >= 40) return { type: 'call' };
            return null; // Below 40 with large donk → defer to main logic
        }
        // Tank donk + rare donk bettor = strong → be cautious with marginal hands
        if (donkTimingTell === 'tank_donk' && handStrength < 45 && liveDonkFreq !== null && liveDonkFreq < 0.15) {
            return null; // Let normal logic handle (may fold)
        }
        return { type: 'call' };
    }

    // Draws with pot odds
    if (drawOuts >= 5 && canCall) {
        const drawEquity = drawOuts * (street === 'flop' ? 4 : 2) / 100;
        const potOdds = toCall / (potSize + toCall);
        // Live data: if they donk-fold often, implied odds increase (we can raise later)
        const impliedOddsBonus = (liveFoldToRaise !== null && liveFoldToRaise > 0.50) ? 0.03 : 0;
        if (drawEquity >= potOdds - 0.05 - impliedOddsBonus) return { type: 'call' };
    }

    return null; // Fall through to normal logic
}

// ═══════════════════════════════════════════════════════════════════════════
// TILT-DRIVEN DECISION QUALITY DEGRADATION
// ═══════════════════════════════════════════════════════════════════════════
// Tilted horses should make measurable mistakes proportional to their tilt
// level. This makes them more realistic and exploitable by skilled humans.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply tilt-induced decision errors.
 * @param {string} action - Current best action
 * @param {number|null} amount - Current bet/raise amount
 * @param {number} tiltLevel - 0-10 scale (0=calm, 10=max tilt)
 * @param {number} handStrength - 0-100
 * @param {Object} legalActions - Available actions
 * @param {number} potSize - Current pot
 * @param {number} aggressionBias - Personality aggression
 * @returns {{ action: string, amount: number|null, wasTilted: boolean }}
 */
function applyTiltDegradation(action, amount, tiltLevel, handStrength, legalActions, potSize, aggressionBias) {
    if (!Array.isArray(legalActions)) legalActions = []; // Bug #54: guard non-array legalActions
    if (tiltLevel < 2) return { action, amount, wasTilted: false }; // Calm — no errors

    const tiltFrac = Math.min(1.0, tiltLevel / 10); // 0-1 scale
    const errorChance = tiltFrac * 0.40; // Max 40% chance of error at max tilt

    if (Math.random() > errorChance) return { action, amount, wasTilted: false }; // No error this hand

    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const canCall = legalActions.some(a => a.type === 'call');
    const canCheck = legalActions.some(a => a.type === 'check');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    // ═══ TILT ERROR TYPES (weighted by tilt level) ═══

    // ERROR 1: Overcalling — call when should fold (most common tilt mistake)
    // "I'm not folding, I'm getting my money back"
    if (action === 'fold' && tiltLevel >= 3) {
        if (canCall && Math.random() < 0.50) {
            console.log(`[HorseBrain] 🔥 TILT OVERCALL: should fold but calling (tilt=${tiltLevel.toFixed(1)})`);
            return { action: 'call', amount: null, wasTilted: true };
        }
    }

    // ERROR 2: Spew raise — raise when should call or check (aggression leak)
    // "I'll just raise and take it down"
    if ((action === 'call' || action === 'check') && tiltLevel >= 4 && canRaise && raiseAction) {
        if (Math.random() < 0.35) {
            const spewSize = Math.round(potSize * (0.60 + Math.random() * 0.40)); // 60-100% pot
            const clamped = Math.max(raiseAction.minAmount || 1, Math.min(spewSize, raiseAction.maxAmount || spewSize));
            console.log(`[HorseBrain] 🔥 TILT SPEW: raising ${clamped} instead of ${action} (tilt=${tiltLevel.toFixed(1)})`);
            return { action: raiseAction.type, amount: clamped, wasTilted: true };
        }
    }

    // ERROR 3: Overbet jam — go all-in with mediocre hands (desperation)
    // "Screw it, all in"
    if (tiltLevel >= 7 && handStrength >= 30 && handStrength < 60 && canRaise) {
        if (Math.random() < 0.20) {
            console.log(`[HorseBrain] 🔥 TILT JAM: all-in with str=${handStrength} (tilt=${tiltLevel.toFixed(1)})`);
            return { action: 'all_in', amount: null, wasTilted: true };
        }
    }

    // ERROR 4: Oversizing — bet too big for the situation
    // "I want to punish them"
    if ((action === 'raise' || action === 'bet') && amount && tiltLevel >= 3) {
        const tiltSizeMultiplier = 1.0 + tiltFrac * 0.60; // Up to 1.6x the normal size
        const tiltedAmount = Math.round(amount * tiltSizeMultiplier);
        if (raiseAction) {
            const clamped = Math.min(tiltedAmount, raiseAction.maxAmount || tiltedAmount);
            console.log(`[HorseBrain] 🔥 TILT OVERSIZE: ${amount}→${clamped} (tilt=${tiltLevel.toFixed(1)})`);
            return { action, amount: clamped, wasTilted: true };
        }
    }

    // ERROR 5: Give up too easily — fold when should fight (after big loss)
    // "I can't win anything today"
    if (action === 'call' && tiltLevel >= 5 && handStrength < 40 && aggressionBias < 0) {
        if (Math.random() < 0.25) {
            console.log(`[HorseBrain] 🔥 TILT GIVE-UP: folding marginal (tilt=${tiltLevel.toFixed(1)})`);
            return { action: canCheck ? 'check' : 'fold', amount: null, wasTilted: true };
        }
    }

    return { action, amount, wasTilted: false };
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
    if (!tableConfig || typeof tableConfig !== 'object') tableConfig = {}; // Bug #77: null tableConfig crashes on .bigBlind access
    if (!engineState || typeof engineState !== 'object') return { action: { type: 'fold' }, delayMs: 500 }; // Bug #57: guard null engineState
    if (!Array.isArray(legalActions) || legalActions.length === 0) {
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
    // ═══ FIX: Previously fire-and-forget (.then) — counterStrategy was mutated AFTER
    // the decision was already made. Now we await with a 200ms timeout so intel is
    // available for the CURRENT decision, not just future ones. ═══
    if (primaryOppId) {
        try {
            const intelPromise = _loadThreatIntel(primaryOppId);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 200));
            const intel = await Promise.race([intelPromise, timeoutPromise]);
            if (intel && intel.totalScore >= 65 && counterStrategy.mode === 'standard') {
                counterStrategy.mode = intel.totalScore >= 80 ? 'anti_bot_stealth' : 'anti_bot';
                console.warn(`[HorseBrain] 📥 MODULE 9 PRE-ARM: ${primaryOppId.substring(0, 8)} known threat=${intel.totalScore} → mode=${counterStrategy.mode}`);
            }
        } catch (err) { console.error('[HorseBrain] Threat intel load failed:', err); }

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

    // ─── MODULE 25: MIN-RAISE HARASSMENT DETECTOR ───
    const minRaiseTell = primaryOppId ? isMinRaiser(primaryOppId) : { isMinRaiser: false, rate: 0 };
    if (minRaiseTell.isMinRaiser) {
        console.log(`[HorseBrain] 🔩 MODULE 25 MIN-RAISE: ${primaryOppId?.substring(0, 8)} min-raises ${(minRaiseTell.rate * 100).toFixed(0)}% — 3-betting wider, not folding to min-raises.`);
    }

    // ─── MODULE 26: SQUEEZE OVERKILL DETECTOR ───
    const squeezeTell = primaryOppId ? isSqueezeOverkill(primaryOppId) : { isOverkill: false, avgMult: 0 };
    if (squeezeTell.isOverkill) {
        console.log(`[HorseBrain] 💥 MODULE 26 SQUEEZE: ${primaryOppId?.substring(0, 8)} over-squeezes (avg ${squeezeTell.avgMult.toFixed(1)}×pot) — folding wider vs 3rd-player squeeze.`);
    }

    // ─── MODULE 29: STRADDLE / BOMB-POT EQUITY ADJUSTER ───
    const hasStraddle = engineState.hasStraddle || false;
    const bombPotInfo = detectBombPotOrStraddle(potSize, bb, hasStraddle);
    if (bombPotInfo.equityThresholdBoost > 0) {
        console.log(`[HorseBrain] 💣 MODULE 29 ${bombPotInfo.label.toUpperCase()}: equity threshold +${bombPotInfo.equityThresholdBoost}% — tightening commit threshold.`);
    }

    // ─── MODULE 30: ANGLE-SHOOT TIMING DETECTOR ───
    const angleTell = primaryOppId ? detectAngleShoot(primaryOppId) : { isAngleShooting: false, extraEntropyMs: 0 };
    if (angleTell.isAngleShooting) {
        console.log(`[HorseBrain] 🎭 MODULE 30 ANGLE-SHOOT: ${primaryOppId?.substring(0, 8)} pre-selecting actions — adding ${angleTell.extraEntropyMs}ms entropy to this decision.`);
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
            // ─── Phase 37: Pass live-read data to PLO engine ───
            tableId: tableId || 'unknown',
            primaryOppId: primaryOppId || null,
            // ─── Phase 3 & 4 signals ───
            imageExposed,          // Module 20
            isLimpTrap: limpTrap.isLimpTrap, // Module 21
            isoTellActive: isoTell.isMechanical, // Module 22
            probeFarmScore: primaryOppId ? getProbeFarmScore(primaryOppId) : 0, // Module 19
            isMinRaiser: minRaiseTell.isMinRaiser, // Module 25
            isSqueezeOverkill: squeezeTell.isOverkill, // Module 26
            bombPotBoost: bombPotInfo.equityThresholdBoost, // Module 29
            isColdCallTrap: primaryOppId ? isColdCallTrap(primaryOppId).isTrap : false, // Module 28
            isRITRefuser: primaryOppId ? isRITRefuser(primaryOppId).isRITRefuser : false, // Module 31
            chipLeakBoosts: getChipLeakBoosts(profileId, tableId || 'default'), // Module 32
        }, legalActions);
        const validPLO = validateAndClamp(ploDecision.type, ploDecision.amount, legalActions);
        const delayPLO = getActionDelay(profileId, validPLO.type, street === 'preflop') + angleTell.extraEntropyMs;
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
        mode: 'ChipEV',
        // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
        tableId,
        primaryOppId,
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
                // BUG #18 FIX: Use resilient query (this is in the hot decision path)
                const { resilientQuery: rq } = require('./SupabaseResilience');
                const { data: readData } = await rq(sb, () => sb
                    .from('horse_opponent_reads')
                    .select('bluff_frequency, call_frequency, tendency')
                    .eq('horse_id', profileId)
                    .eq('opponent_id', oppId)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                );
                if (readData) {
                    // ═══ Phase 39B FIX: callMod sign convention was INVERTED ═══
                    // Old code set callMod=5 for bluffers and callMod=-3 for stations,
                    // but ALL downstream code uses callMod>0 to mean "opponent is a station".
                    // This caused bluffers to be treated as stations (no c-bet bluffs)
                    // and stations to be treated as tight (engine bluffed them MORE).
                    // Fix: bluffAware handles bluff detection, callMod only tracks station tendency.

                    // If opponent bluffs a lot → set bluffAware flag (callMod stays 0)
                    if (readData.bluff_frequency > 0.35) {
                        opponentAdjustment.bluffAware = true;
                    }
                    // If opponent rarely bluffs → fold more marginal spots
                    if (readData.bluff_frequency < 0.15) {
                        opponentAdjustment.foldMod = 5;
                    }
                    // If opponent is a calling station → positive callMod (matches downstream sign convention)
                    if (readData.call_frequency > 0.55) {
                        opponentAdjustment.callMod = 5;
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

        // --- PREFLOP MODULE WIRING ---
        // ═══ Apply anti-exploit modules to GTO preflop decisions ═══
        if (street === 'preflop') {
            const preflopStr = getPreflopStrength(handStr);

            // MODULE 5: Sandwich — tighten calling range when sandwiched multiway
            if (finalAction === 'call' && sandwichedFoldMod > 0 && preflopStr < (55 + sandwichedFoldMod)) {
                console.log(`[HorseBrain] 🥊 MODULE 5 PREFLOP SANDWICH: folding ${handStr} (strength=${preflopStr} < ${55 + sandwichedFoldMod})`);
                finalAction = 'fold';
                finalAmount = null;
            }

            // MODULE 22: Iso Tell — widen 3-bet range vs mechanical isolators
            if (finalAction === 'call' && isoTell.isMechanical && preflopStr >= 45 && toCall > bb * 2) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction && Math.random() < 0.40) {
                    console.log(`[HorseBrain] 📐 MODULE 22 ISO EXPLOIT: 3-betting ${handStr} vs mechanical isolator`);
                    finalAction = raiseAction.type;
                    finalAmount = Math.round(toCall * 3);
                    finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(finalAmount, raiseAction.maxAmount || finalAmount));
                }
            }

            // MODULE 25: Min-Raise Defense — don't fold to min-raises, re-raise wider
            if (finalAction === 'fold' && minRaiseTell.isMinRaiser && preflopStr >= 35 && toCall <= bb * 3) {
                console.log(`[HorseBrain] 🔩 MODULE 25 PREFLOP MIN-RAISE DEFENSE: calling with ${handStr} instead of folding`);
                finalAction = 'call';
                finalAmount = null;
            }

            // MODULE 29: Bomb Pot awareness — tighten commit threshold preflop
            if ((finalAction === 'raise' || finalAction === 'bet') && bombPotInfo.equityThresholdBoost > 0 && preflopStr < 60) {
                console.log(`[HorseBrain] 💣 MODULE 29 PREFLOP: suppressing raise in bomb-pot format (strength=${preflopStr})`);
                finalAction = toCall > 0 ? 'call' : 'check';
                finalAmount = null;
            }

            // MODULE 20: Image Exposed — tighten open range when opponents have reads
            if (imageExposed && (finalAction === 'raise' || finalAction === 'bet') && preflopStr < 55) {
                console.log(`[HorseBrain] 📸 MODULE 20 PREFLOP: tightening opens while image exposed (strength=${preflopStr})`);
                finalAction = toCall > 0 ? 'call' : 'check';
                finalAmount = null;
            }
        }

        // --- POSTFLOP HAND STRENGTH GUARDRAILS ---
        // GTO solver sometimes returns suboptimal actions for edge cases.
        // Apply sanity checks using the hand evaluator to override obvious mistakes.
        if (street !== 'preflop') {
            const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
            const drawEq = getDrawEquity(handEval, street);
            const facingBet = toCall > 0;

            // GUARDRAIL 1: Don't call with garbage hands facing a bet
            // Override GTO 'call' with 'fold' if hand is too weak for the price
            // BUG #21 FIX: Was only folding strength < 15. Hands with strength 15-25
            // facing a large bet (75%+ pot) are also clear folds. Threshold scales with bet size.
            if (finalAction === 'call' && facingBet && drawEq.outs === 0) {
                const potOdds = toCall / (potSize + toCall);
                const betRelPot = toCall / Math.max(1, potSize);
                // Fold threshold scales: small bet → only fold garbage, big bet → fold more
                const foldThreshold = betRelPot >= 0.75 ? 25 : betRelPot >= 0.50 ? 20 : 15;
                if (handEval.strength < foldThreshold && potOdds >= 0.20) {
                    finalAction = 'fold';
                    finalAmount = null;
                }
            }

            // GUARDRAIL 2: Bet strong hands when not facing action
            // Override GTO 'check' with 'bet' if hand strength >= 60 (strong made hand)
            // BUG #19 FIX: Also semi-bluff with strong draws (flush draws, OESDs, combo draws)
            // BUG #23 FIX: OOP semi-bluffs need more outs (10+) because we face raises
            // and must fold equity. IP can semi-bluff with 8+ outs since we close the action.
            const isIPGuardCheck = new Set(['BTN', 'CO', 'HJ']).has(position);
            const semiBluffOutsThreshold = isIPGuardCheck ? 8 : 10; // IP = 8 outs, OOP = 10 outs
            const hasStrongDraw = (drawEq.outs >= semiBluffOutsThreshold);
            const shouldBetHand = handEval.strength >= 60 || (hasStrongDraw && street !== 'river');
            if (finalAction === 'check' && !facingBet && shouldBetHand) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                if (raiseAction) {
                    const isIPGuard = new Set(['BTN', 'CO', 'HJ']).has(position);
                    const isSemiBluff = handEval.strength < 60 && hasStrongDraw;
                    const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, isSemiBluff, {
                        isInPosition: isIPGuard, numPlayers, handStrength: handEval.strength, stackBB
                    });
                    const betSize = Math.round(potSize * sizeFrac);
                    finalAction = raiseAction.type;
                    finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
                }
            }

            // GUARDRAIL 3: Value bet strong hands on the river
            // BUG #20 FIX: Was using fixed 65% frequency. Adjust based on opponent tendency:
            // - vs calling station: bet more often (they call light)
            // - vs nit/folder: bet less often (they only call with better)
            // - vs unknown: default 65%
            // BUG #22 FIX: Was firing at strength >= 50 which is bluff-catcher territory.
            // Hands with 50-59 strength are marginal — betting them on the river turns them into
            // a bluff (worse hands fold, better hands call). Raised threshold to 60 for default,
            // but vs known calling stations we CAN thin-value at 55+ (they call with worse).
            const g3StrengthThreshold = (opponentAdjustment.callMod > 0) ? 55 : 60;
            if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= g3StrengthThreshold) {
                const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                let riverVBetFreq = 0.65;
                if (opponentAdjustment.callMod > 0) riverVBetFreq = 0.85; // Station → bet more
                if (opponentAdjustment.foldMod > 0 && handEval.strength < 70) riverVBetFreq = 0.40; // Nit → thin value less
                if (opponentAdjustment.bluffAware) riverVBetFreq = Math.min(riverVBetFreq, 0.55); // Bluffy opp → they might check-raise bluff
                if (raiseAction && Math.random() < riverVBetFreq) {
                    const isIPGuard3 = new Set(['BTN', 'CO', 'HJ']).has(position);
                    const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                        isInPosition: isIPGuard3, numPlayers, handStrength: handEval.strength, stackBB
                    });
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

        // Apply TABLE IMAGE overlay (Phase 3A #1)
        // BUG #35 FIX: Was gated by tiltLevel >= 3 (table image only worked when tilted) and
        // used preflopStrength on postflop streets (72o that flops full house → strength 0.15 →
        // image tighten_up converts value raise to FOLD). Now uses actual postflop hand strength
        // and runs independently of tilt (non-tilted horses should also adjust for image).
        try {
            const adv = await getAdvancedModule();
            if (adv?.getImageAdjustedAction) {
                let imageHandStrength;
                if (street === 'preflop') {
                    imageHandStrength = preflopStrength / 100; // 0-1 scale
                } else {
                    try {
                        const imgEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                        imageHandStrength = imgEval.strength / 100; // 0-1 scale
                    } catch (_) {
                        imageHandStrength = preflopStrength / 100; // Fallback
                    }
                }
                const adjusted = adv.getImageAdjustedAction(profileId, finalAction, imageHandStrength);
                if (adjusted && adjusted !== finalAction) {
                    console.log(`[HorseBrain] 📸 Image overlay: ${finalAction} → ${adjusted} (str=${(imageHandStrength * 100).toFixed(0)})`);
                    finalAction = adjusted;
                }
            }
        } catch (err) {
            // Image overlay is non-critical
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

    // ═══ DEDICATED FLOP HEURISTIC ENGINE ═══
    // When Supabase lacks flop data, use the specialized flop engine
    // with board texture, c-bet strategy, range advantage, and opponent reads.
    if (!finalAction && street === 'flop') {
        const hash = getHash(profileId);
        let flopLooseness = (hash % 20) - 10;
        let flopAggression = ((hash >> 4) % 20) - 10;
        try {
            if (_personalityModule) {
                const style = _personalityModule.getPlayStyle?.(profileId);
                if (style?.key) {
                    const sl = { TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10 };
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    flopLooseness = sl[style.key] ?? flopLooseness;
                    flopAggression = sa[style.key] ?? flopAggression;
                }
            }
        } catch (_) { }

        let flopEnrichedRead = null;
        try {
            const adv = await getAdvancedModule();
            if (adv?.getOpponentRead && primaryOppId) {
                flopEnrichedRead = adv.getOpponentRead(profileId, primaryOppId);
            }
        } catch (_) { }

        // ═══ PHASE 15: JOURNAL → ENRICHED FALLBACK (Flop) ═══
        if (!flopEnrichedRead && primaryOppId) {
            const flopJournalRead = getLiveRead(profileId, tableId, primaryOppId);
            if (flopJournalRead && flopJournalRead.confidence >= 0.15) {
                const jl = flopJournalRead;
                let tendency = 'balanced';
                if (jl.playerType === 'nit' || jl.playerType === 'weak-tight') tendency = 'weak-tight';
                else if (jl.playerType === 'LAG' || jl.playerType === 'maniac') tendency = 'bluffy';
                else if (jl.playerType === 'calling_station') tendency = 'calling-station';
                flopEnrichedRead = {
                    bluffFrequency: jl.bluffRate ?? (jl.aggFreq > 0.45 ? 0.35 : jl.aggFreq > 0.30 ? 0.25 : 0.15),
                    callFrequency: jl.callFreq ?? 0.50,
                    foldFrequency: jl.foldFreq ?? 0.35,
                    tendency,
                    handsObserved: jl.confidence * 100,
                    confidence: jl.confidence,
                    _source: 'journal_fallback',
                };
            }
        }

        const flopHeroIsAggressor = engineState.lastRaiser === profileId;

        const flopDecision = makeFlopHeuristicDecision({
            holeCards: holeCardStrings, board: boardStrings,
            handStr, position, stackBB, potSize, toCall, bb,
            numPlayers, legalActions, profileId,
            aggressionBias: flopAggression, loosenessBias: flopLooseness,
            opponentAdjustment,
            enrichedOpponentRead: flopEnrichedRead,
            heroIsAggressor: flopHeroIsAggressor,
            counterStrategyMode: counterStrategy.mode,
            // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
            tableId,
            primaryOppId,
        });
        if (flopDecision) {
            finalAction = flopDecision.type;
            finalAmount = flopDecision.amount;
            // ═══ Phase 38B FIX: wrap evaluatePostflopHand in try-catch to prevent crash in log ═══
            let flopLogStr = '?';
            try { flopLogStr = evaluatePostflopHand(holeCardStrings, boardStrings).strength; } catch (_) { }
            console.log(`[HorseBrain] 🎴 Flop heuristic: ${finalAction}${finalAmount ? ` (${finalAmount})` : ''} [str=${flopLogStr}]`);
        }
    }

    // ═══ DEDICATED TURN/RIVER HEURISTIC ENGINE ═══
    // PioSolver data in Supabase is richest for preflop + flop. Turn/river
    // spots are sparser, so this dedicated engine fills the gap with
    // board runout analysis, polarization, blocker effects, and RIO guards.
    if (!finalAction && (street === 'turn' || street === 'river')) {
        const hash = getHash(profileId);
        let fbLoosenessBias = (hash % 20) - 10;
        let fbAggressionBias = ((hash >> 4) % 20) - 10;
        try {
            if (_personalityModule) {
                const style = _personalityModule.getPlayStyle?.(profileId);
                if (style?.key) {
                    const sl = { TAG: -3, nit: -15, LAG: 8, maniac: 15, calling_station: 10 };
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    fbLoosenessBias = sl[style.key] ?? fbLoosenessBias;
                    fbAggressionBias = sa[style.key] ?? fbAggressionBias;
                }
            }
        } catch (_) { }

        // ═══ ENRICHED OPPONENT READ ═══
        // Pull full opponent read from Advanced module for richer turn/river decisions.
        // This gives us bluffFrequency, valueFrequency, foldFrequency, callFrequency,
        // tendency (bluffy/weak-tight/balanced), and handsObserved.
        let enrichedOpponentRead = null;
        try {
            const adv = await getAdvancedModule();
            if (adv?.getOpponentRead && primaryOppId) {
                enrichedOpponentRead = adv.getOpponentRead(profileId, primaryOppId);
            }
        } catch (_) { }

        // ═══ PHASE 15: JOURNAL → ENRICHED FALLBACK ═══
        // When the Advanced module has NO data for this opponent, synthesize
        // an enrichedOpponentRead from the live observer (which may include journal data).
        // This means turn/river decisions ALWAYS have opponent profiling available,
        // even for opponents we've never played before this session (but played in prior sessions).
        if (!enrichedOpponentRead && primaryOppId) {
            const journalLiveRead = getLiveRead(profileId, tableId, primaryOppId);
            if (journalLiveRead && journalLiveRead.confidence >= 0.15) {
                // Synthesize an enrichedOpponentRead from live/journal data
                const jl = journalLiveRead;
                let tendency = 'balanced';
                if (jl.playerType === 'nit' || jl.playerType === 'weak-tight') tendency = 'weak-tight';
                else if (jl.playerType === 'LAG' || jl.playerType === 'maniac') tendency = 'bluffy';
                else if (jl.playerType === 'calling_station') tendency = 'calling-station';
                else if (jl.playerType === 'TAG') tendency = 'balanced';

                enrichedOpponentRead = {
                    bluffFrequency: jl.bluffRate ?? (jl.aggFreq > 0.45 ? 0.35 : jl.aggFreq > 0.30 ? 0.25 : 0.15),
                    callFrequency: jl.callFreq ?? 0.50,
                    foldFrequency: jl.foldFreq ?? 0.35,
                    valueFrequency: jl.aggFreq ?? 0.33,
                    tendency,
                    handsObserved: jl.confidence * 100, // Approximate — confidence=0.60 → 60 "equivalent" hands
                    confidence: jl.confidence,
                    _source: 'journal_fallback',
                };
                console.log(`[HorseBrain] 📓 JOURNAL→ENRICHED FALLBACK: ${primaryOppId.substring(0, 8)} type=${jl.playerType} tendency=${tendency} conf=${Math.round(jl.confidence * 100)}%`);
            }
        }

        // ═══ MULTI-STREET ACTION INFERENCE ═══
        // Infer opponent strength from how the pot was built across streets.
        // A large pot going into turn/river = someone has been betting hard.
        // Use pot-to-starting-stack ratio as a proxy for action intensity.
        let oppStreetAggression = 'unknown';
        const potBBs = potSize / Math.max(1, bb);
        const streetNum = street === 'turn' ? 3 : 4; // preflop=1, flop=2, turn=3, river=4
        const avgPotPerStreet = potBBs / streetNum;
        // Large pots = aggressive action has occurred on prior streets
        if (avgPotPerStreet >= 12) oppStreetAggression = 'very_heavy'; // 3-bet pot + big bets
        else if (avgPotPerStreet >= 6) oppStreetAggression = 'heavy'; // raised pot + c-bet
        else if (avgPotPerStreet >= 3) oppStreetAggression = 'moderate'; // limped or small raise
        else oppStreetAggression = 'light'; // checked through mostly

        // Also check if WE are the aggressor (preflop raiser) for nut advantage
        const heroIsAggressor = engineState.lastRaiser === profileId;

        // ═══ MULTI-STREET NARRATIVE ═══
        // Read what we did on prior streets to ensure our line tells a believable story.
        const trHandId = engineState.handId || engineState.handNumber || `${tableId}_recent`;
        const trMemory = getStreetMemory(profileId, trHandId);
        const trNarrative = analyzeStreetNarrative(trMemory, street);

        const trDecision = makeTurnRiverHeuristicDecision({
            street, holeCards: holeCardStrings, board: boardStrings,
            handStr, position, stackBB, potSize, toCall, bb,
            numPlayers, legalActions, profileId,
            aggressionBias: fbAggressionBias, loosenessBias: fbLoosenessBias,
            opponentAdjustment,
            // New enriched data for turn/river decisions
            enrichedOpponentRead,
            oppStreetAggression,
            heroIsAggressor,
            counterStrategyMode: counterStrategy.mode,
            // Multi-street narrative for line consistency
            streetNarrative: trNarrative,
            // ═══ ALWAYS-ON: Pass table + opponent IDs for live observation data ═══
            tableId,
            primaryOppId,
        });
        if (trDecision) {
            finalAction = trDecision.type;
            finalAmount = trDecision.amount;
            console.log(`[HorseBrain] 🃏 Turn/River heuristic: ${street} → ${finalAction}${finalAmount ? ` (${finalAmount})` : ''} [oppAgg=${oppStreetAggression}]`);
        }
    }

    // --- 3b. DONK BET HANDLER ---
    // When hero was the preflop aggressor and opponent donk bets into us on flop/turn,
    // use specialized donk bet response logic BEFORE falling through to generic fallback.
    if (!finalAction && toCall > 0 && (street === 'flop' || street === 'turn')) {
        const heroWasPFA = engineState.lastRaiser === profileId;
        if (heroWasPFA) {
            // Gather hand eval + opponent data for donk bet handler
            const donkHandEval = evaluatePostflopHand(holeCardStrings, boardStrings);
            const donkDrawEq = getDrawEquity(donkHandEval, street);
            const donkRaiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            const donkCanRaise = !!donkRaiseAction;
            const donkCanCall = legalActions.some(a => a.type === 'call');

            // Pull opponent tendency if we have enriched reads
            let donkOppTendency = 'balanced', donkOppConfidence = 0, donkOppCallFreq = 0.50;
            try {
                const adv = await getAdvancedModule();
                if (adv?.getOpponentRead && primaryOppId) {
                    const oppRead = adv.getOpponentRead(profileId, primaryOppId);
                    if (oppRead && oppRead.handsObserved >= 5) {
                        donkOppTendency = oppRead.tendency || 'balanced';
                        donkOppConfidence = Math.min(0.85, oppRead.handsObserved / 60);
                        donkOppCallFreq = oppRead.callFrequency ?? 0.50;
                    }
                }
            } catch (_) { }

            // Estimate board wetness quickly
            const bCards = boardStrings || [];
            let donkBoardWetness = 0;
            if (bCards.length >= 3) {
                const suits = bCards.map(c => c[c.length - 1]);
                const flushDrawPossible = suits.filter(s => suits.filter(x => x === s).length >= 2).length > 0;
                if (flushDrawPossible) donkBoardWetness += 2;
                const ranks = bCards.map(c => 'A23456789TJQKA'.indexOf(c[0]));
                ranks.sort((a, b) => a - b);
                for (let i = 0; i < ranks.length - 1; i++) {
                    if (ranks[i + 1] - ranks[i] <= 2) donkBoardWetness += 1;
                }
            }

            // Get personality aggression bias
            let donkAggrBias = 0;
            try {
                if (_personalityModule?.getPlayStyle) {
                    const style = _personalityModule.getPlayStyle(profileId);
                    const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                    donkAggrBias = sa[style?.key] ?? 0;
                }
            } catch (_) { }

            // ═══ LIVE-READ for donk bet response (Phase 17) ═══
            let donkLiveRead = null;
            if (primaryOppId && tableId) {
                try {
                    donkLiveRead = getLiveRead(profileId, tableId, primaryOppId);
                } catch (_) { }
            }

            const donkResult = handleDonkBet({
                heroIsAggressor: true,
                street,
                facingBet: true,
                handStrength: donkHandEval.strength,
                handCategory: donkHandEval.category,
                drawOuts: donkDrawEq.outs,
                position,
                potSize, toCall, bb,
                canRaise: donkCanRaise,
                canCall: donkCanCall,
                raiseAction: donkRaiseAction,
                aggressionBias: donkAggrBias,
                oppTendency: donkOppTendency,
                oppConfidence: donkOppConfidence,
                oppCallFreq: donkOppCallFreq,
                boardWetness: donkBoardWetness,
                numPlayers,
                // ═══ LIVE-READ DATA (Phase 17) ═══
                liveRead: donkLiveRead,
                tableId,
                primaryOppId,
            });

            if (donkResult) {
                finalAction = donkResult.type;
                finalAmount = donkResult.amount || null;
                console.log(`[HorseBrain] 🎯 DONK BET response: ${street} → ${finalAction}${finalAmount ? ` (${finalAmount})` : ''}`);
            }
        }
    }

    // Generic fallback for preflop + any street the heuristic didn't handle
    if (!finalAction) {
        const fallback = makeFallbackDecision(profileId, adaptedState, legalActions, opponentAdjustment);
        finalAction = fallback.type;
        finalAmount = fallback.amount;
    }

    // --- 4a. MODULE 18: SPR TRAP DETECTOR ---
    // Detect when an opponent's bet sizing is designed to pot-commit us with a weak hand.
    // If we're being trapped into a large pot with mediocre equity, override to fold.
    if (finalAction === 'call' && toCall > 0 && street !== 'preflop') {
        const sprTrap = detectSPRTrap(toCall, potSize, heroPlayer.stack, numPlayers, getPreflopStrength(handStr));
        if (sprTrap.isTrap) {
            const handEvalTrap = evaluatePostflopHand(holeCardStrings, boardStrings);
            if (handEvalTrap.strength < 55) {
                console.log(`[HorseBrain] 🪤 MODULE 18 SPR TRAP: ${sprTrap.reason} — folding marginal hand (strength=${handEvalTrap.strength})`);
                finalAction = 'fold';
                finalAmount = null;
            }
        }
    }

    // --- 4b. UNIVERSAL HAND STRENGTH GUARDRAILS ---
    // These apply to BOTH GTO and fallback decisions to prevent egregious mistakes
    // ═══ WIRED: All anti-exploit module signals now feed into NL Hold'em thresholds ═══
    if (street !== 'preflop' && finalAction) {
        const handEval = evaluatePostflopHand(holeCardStrings, boardStrings);
        const drawEq = getDrawEquity(handEval, street);
        const facingBet = toCall > 0;

        // Fold garbage facing a bet (unless pot odds are amazing)
        // ═══ MODULE 5 (Sandwich) + MODULE 11 (Range Rotation) + MODULE 20 (Image Exposed) ═══
        // + MODULE 29 (Bomb Pot) all feed into the fold threshold
        const imageExposedFoldMod = imageExposed ? 5 : 0;  // Module 20: tighter when exposed
        const bombPotFoldMod = bombPotInfo.equityThresholdBoost || 0; // Module 29: tighter in bomb pots
        // ═══ Phase 39B FIX: add bluffAware (was relying on inverted callMod for bluff detection) ═══
        const foldThreshold = 15
            + opponentAdjustment.foldMod - opponentAdjustment.callMod
            - (opponentAdjustment.bluffAware ? 5 : 0)  // Call down more vs known bluffers
            + sandwichedFoldMod        // Module 5: +10 when sandwiched
            + gearFoldMod              // Module 11: range rotation fold adjustment
            + imageExposedFoldMod      // Module 20: +5 when image is exposed
            + bombPotFoldMod;          // Module 29: tighter commit in straddle/bomb pots

        if (finalAction === 'call' && facingBet && handEval.strength < foldThreshold && drawEq.outs === 0) {
            const potOdds = toCall / (potSize + toCall);
            if (potOdds >= 0.20) {
                finalAction = 'fold';
                finalAmount = null;
            }
        }

        // ═══ GUARDRAIL: NEVER FOLD THE NUTS ═══
        // Safety check: if we have a very strong hand (set+, flush+, straight+) never fold
        if (finalAction === 'fold' && handEval.strength >= 75) {
            console.log(`[HorseBrain] 🛡️ GUARDRAIL: Preventing fold with strength=${handEval.strength} (${handEval.category})`);
            finalAction = 'call';
            finalAmount = null;
        }

        // ═══ GUARDRAIL: DON'T RAISE WITH GARBAGE ═══
        // Safety check: if we have nothing and the decision says raise, don't unless it's a valid bluff
        if ((finalAction === 'raise' || finalAction === 'bet') && handEval.strength < 15 && drawEq.outs < 6) {
            // Only allow bluffs at a capped frequency — never raise junk by accident
            if (Math.random() > 0.25) { // 75% of the time, convert garbage raises to checks
                finalAction = facingBet ? 'fold' : 'check';
                finalAmount = null;
            }
        }

        // ═══ GUARDRAIL: STREET-AWARE SIZING BOUNDS ═══
        // Ensure bet/raise amounts are sane relative to the pot
        if (finalAmount && (finalAction === 'raise' || finalAction === 'bet')) {
            const guardRaiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            const minSensible = Math.round(potSize * 0.20); // Never bet less than 20% pot
            const maxSensible = Math.round(potSize * 2.50); // Never bet more than 250% pot (overbet limit)
            if (finalAmount < minSensible && guardRaiseAction) {
                finalAmount = Math.max(guardRaiseAction.minAmount || 1, minSensible);
            }
            if (finalAmount > maxSensible && guardRaiseAction) {
                finalAmount = Math.min(guardRaiseAction.maxAmount || maxSensible, maxSensible);
            }
        }

        // ═══ MODULE 5: SANDWICH DRAW THRESHOLD ═══
        // When sandwiched multiway, fold draws with fewer outs than the threshold
        if (finalAction === 'call' && facingBet && sandwichedDrawThreshold > 0 && drawEq.outs > 0 && drawEq.outs < sandwichedDrawThreshold) {
            console.log(`[HorseBrain] 🥊 MODULE 5 SANDWICH: folding weak draw (${drawEq.outs} outs < ${sandwichedDrawThreshold} threshold)`);
            finalAction = 'fold';
            finalAmount = null;
        }

        // ═══ MODULE 22: ISO TELL → WIDEN 3-BET/RAISE THRESHOLD ═══
        // When opponent has mechanical isolation sizing, be more aggressive (lower raise threshold)
        const isoRaiseBonus = isoTell.isMechanical ? -8 : 0;
        // ═══ MODULE 25: MIN-RAISE → DON'T FOLD, RE-RAISE ═══
        const minRaiseDefense = minRaiseTell.isMinRaiser ? -5 : 0;
        // ═══ MODULE 26: SQUEEZE OVERKILL → FOLD MORE vs SQUEEZE ═══
        const squeezeFoldMod = squeezeTell.isOverkill ? 8 : 0;
        // ═══ MODULE 11: RANGE ROTATION RAISE MOD ═══
        const effectiveRaiseMod = gearRaiseMod + isoRaiseBonus + minRaiseDefense;

        // Bet strong hands when not facing action
        // Raise threshold adjusted by all module signals
        const betThreshold = 60 + effectiveRaiseMod;
        if ((finalAction === 'check') && !facingBet && handEval.strength >= betThreshold) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.70) {
                const isIPUniv = new Set(['BTN', 'CO', 'HJ']).has(position);
                const sizeFrac = getOptimalBetSize(handEval.category, street, potSize, false, {
                    isInPosition: isIPUniv, numPlayers, handStrength: handEval.strength, stackBB
                });
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }

        // ═══ MODULE 26: SQUEEZE DEFENSE — fold more marginal calls facing squeeze ═══
        if (finalAction === 'call' && facingBet && squeezeFoldMod > 0 && handEval.strength < (foldThreshold + squeezeFoldMod)) {
            console.log(`[HorseBrain] 💥 MODULE 26 SQUEEZE FOLD: folding marginal (strength=${handEval.strength} < ${foldThreshold + squeezeFoldMod})`);
            finalAction = 'fold';
            finalAmount = null;
        }

        // Value bet the river with medium-strong+ hands
        // BUG #34 FIX: Was using >= 50 which is bluff-catcher territory (same bug as BUG #22
        // in GUARDRAIL 3). Strength 50-59 hands lose EV when bet — worse hands fold, better call.
        // Use 55 vs calling stations (they call with worse), 60 otherwise.
        const univRiverThreshold = (opponentAdjustment.callMod > 0) ? 55 : 60;
        if (finalAction === 'check' && !facingBet && street === 'river' && handEval.strength >= univRiverThreshold) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            let univRiverVBetFreq = 0.65;
            if (opponentAdjustment.callMod > 0) univRiverVBetFreq = 0.80;  // Station → bet more
            if (opponentAdjustment.foldMod > 0 && handEval.strength < 70) univRiverVBetFreq = 0.40; // Nit → thin value less
            if (raiseAction && Math.random() < univRiverVBetFreq) {
                const isIPRiver = new Set(['BTN', 'CO', 'HJ']).has(position);
                const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, false, {
                    isInPosition: isIPRiver, numPlayers, handStrength: handEval.strength, stackBB
                });
                const betSize = Math.round(potSize * sizeFrac);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(betSize, raiseAction.maxAmount || betSize));
            }
        }

        // ═══ MODULE 25: MIN-RAISE DEFENSE — re-raise instead of just calling ═══
        if (finalAction === 'call' && minRaiseTell.isMinRaiser && handEval.strength >= 40) {
            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
            if (raiseAction && Math.random() < 0.45) {
                console.log(`[HorseBrain] 🔩 MODULE 25 MIN-RAISE DEFENSE: re-raising vs min-raiser (strength=${handEval.strength})`);
                const reraiseSize = Math.round(potSize * 0.75);
                finalAction = raiseAction.type;
                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(reraiseSize, raiseAction.maxAmount || reraiseSize));
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

    // --- 5b. APPLY RIVALRY / GRUDGE / SOFTPLAY DYNAMICS (#11) ---
    // BUG #40 FIX: Previously only used areRivals/areFriends boolean checks with flat
    // coin-flip overrides. Now wires in getRivalryAggression (scaled sizing boost),
    // getGrudgeTargeting (targeted aggression from big pot losses), and
    // getSoftplayModifier (nuanced bluff/value reduction vs friends).
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.areRivals || adv?.areFriends || adv?.getGrudgeTargeting) {
                const opponents = engineState.players?.filter(p =>
                    String(p.id) !== String(profileId) && !p.folded
                ) || [];
                const oppIds = opponents.map(o => String(o.id));

                // ═══ GRUDGE TARGETING: Find if any opponent triggers grudge aggression ═══
                let grudgeTarget = null;
                let grudgeAggrMod = 1.0;
                if (adv.getGrudgeTargeting && oppIds.length > 0) {
                    const targeting = adv.getGrudgeTargeting(profileId, oppIds);
                    for (const oppId of oppIds) {
                        const t = targeting[oppId];
                        if (t && t.grudgeLevel > 1 && t.aggressionMod > grudgeAggrMod) {
                            grudgeTarget = oppId;
                            grudgeAggrMod = t.aggressionMod;
                        }
                    }
                }

                // Apply grudge aggression: boost sizing against grudge targets
                if (grudgeTarget && grudgeAggrMod > 1.0 && (finalAction === 'raise' || finalAction === 'bet') && finalAmount) {
                    const boostedAmount = Math.round(finalAmount * grudgeAggrMod);
                    const raiseAction = legalActions.find(a => a.type === finalAction);
                    if (raiseAction) {
                        finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(boostedAmount, raiseAction.maxAmount || boostedAmount));
                        console.log(`[HorseBrain] 😤 Grudge sizing boost ×${grudgeAggrMod.toFixed(2)} vs ${grudgeTarget.substring(0, 8)}`);
                    }
                }
                // Grudge can also convert call→raise (revenge play)
                if (grudgeTarget && grudgeAggrMod > 1.3 && finalAction === 'call' && Math.random() < 0.30) {
                    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                    if (raiseAction) {
                        finalAction = raiseAction.type;
                        // Grudge-fueled raise: pot-sized
                        const grudgeSize = Math.round(potSize * grudgeAggrMod * 0.75);
                        finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(grudgeSize, raiseAction.maxAmount || grudgeSize));
                        console.log(`[HorseBrain] 😤 Grudge revenge raise vs ${grudgeTarget.substring(0, 8)}`);
                    }
                }

                // ═══ RIVALRY: Scaled aggression (not just a coin flip) ═══
                for (const opp of opponents) {
                    const oppId = String(opp.id);
                    if (adv.areRivals && adv.areRivals(profileId, oppId)) {
                        // Use getRivalryAggression for scaled boost if available
                        let rivalryMod = 1.5; // default: 50% boost
                        if (adv.getRivalryAggression) {
                            rivalryMod = adv.getRivalryAggression(profileId, oppId, 1.0);
                        }
                        // Convert call→raise at rate proportional to rivalry (25-45%)
                        const convertRate = 0.25 + Math.min(0.20, (rivalryMod - 1.0) * 0.4);
                        if (finalAction === 'call' && legalActions.some(a => a.type === 'raise' || a.type === 'bet') && Math.random() < convertRate) {
                            const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');
                            if (raiseAction) {
                                finalAction = raiseAction.type;
                                const rivalSize = Math.round((potSize * 0.75) * rivalryMod);
                                finalAmount = Math.max(raiseAction.minAmount || 1, Math.min(rivalSize, raiseAction.maxAmount || rivalSize));
                                console.log(`[HorseBrain] ⚔️ Rivalry aggression ×${rivalryMod.toFixed(2)} vs ${oppId.substring(0, 8)}`);
                            }
                        }
                        // Also boost existing raise sizing against rivals
                        if ((finalAction === 'raise' || finalAction === 'bet') && finalAmount && rivalryMod > 1.0) {
                            const boosted = Math.round(finalAmount * (1 + (rivalryMod - 1.0) * 0.5)); // Half the rivalry mod as sizing boost
                            const raiseAction = legalActions.find(a => a.type === finalAction);
                            if (raiseAction) {
                                finalAmount = Math.max(raiseAction.minAmount || finalAmount, Math.min(boosted, raiseAction.maxAmount || boosted));
                            }
                        }
                        break;
                    }
                    if (adv.areFriends && adv.areFriends(profileId, oppId)) {
                        // ═══ SOFTPLAY: Use getSoftplayModifier for nuanced reduction ═══
                        let softMod = { bluffReduction: 0.5, valueReduction: 0.85, isSoftplaying: true };
                        if (adv.getSoftplayModifier) {
                            softMod = adv.getSoftplayModifier(profileId, oppId);
                        }
                        if (softMod.isSoftplaying && isSoftPlayAllowed(profileId, oppId)) {
                            if (finalAction === 'raise' || finalAction === 'bet') {
                                // Check if this is likely a bluff (weak hand) vs value (strong hand)
                                let handStrengthForSoft = 50;
                                if (street !== 'preflop') {
                                    try {
                                        const softEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                                        handStrengthForSoft = softEval.strength;
                                    } catch (_) { }
                                } else {
                                    handStrengthForSoft = getPreflopStrength(handStr);
                                }

                                if (handStrengthForSoft < 40) {
                                    // Bluff territory: apply bluffReduction
                                    if (Math.random() < (1 - softMod.bluffReduction)) {
                                        // Convert bluff raise/bet → check or call
                                        if (legalActions.some(a => a.type === 'check')) {
                                            finalAction = 'check';
                                            finalAmount = null;
                                        } else if (legalActions.some(a => a.type === 'call')) {
                                            finalAction = 'call';
                                            finalAmount = null;
                                        }
                                        recordSoftPlay(profileId, oppId);
                                        console.log(`[HorseBrain] 🤝 Softplay: bluff suppressed vs friend ${oppId.substring(0, 8)}`);
                                    }
                                } else {
                                    // Value territory: reduce sizing slightly
                                    if (finalAmount && softMod.valueReduction < 1.0) {
                                        finalAmount = Math.round(finalAmount * softMod.valueReduction);
                                        const raiseAction = legalActions.find(a => a.type === finalAction);
                                        if (raiseAction && finalAmount < (raiseAction.minAmount || 0)) {
                                            finalAmount = raiseAction.minAmount;
                                        }
                                        console.log(`[HorseBrain] 🤝 Softplay: value bet reduced ×${softMod.valueReduction} vs friend ${oppId.substring(0, 8)}`);
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }
        } catch (_) { }
    }

    // ─── 5c. APPLY TILT DEGRADATION ───
    // Phase 47 FIX: Moved OUTSIDE the raise/bet/call gate so tilt affects ALL actions
    // including check→spew-bet and fold→overcall. Previously gated behind
    // if(finalAction === raise|bet|call), meaning tilted horses played perfectly on check/fold.
    // After all overlays have refined the decision, tilt degrades it.
    // This models realistic mistakes tilted players make: overcalling, spew raises,
    // overbet jams, oversizing, and giving up. Uses the Advanced module's tilt level.
    if (finalAction) {
        try {
            const adv = await getAdvancedModule();
            if (adv?.getTiltLevel) {
                const tiltLevel = adv.getTiltLevel(profileId);
                if (tiltLevel >= 2) {
                    // Get hand eval for tilt function (needs hand strength)
                    let tiltHandStrength = 50; // Default if eval fails
                    if (street !== 'preflop') {
                        try {
                            const tiltEval = evaluatePostflopHand(holeCardStrings, boardStrings);
                            tiltHandStrength = tiltEval.strength;
                        } catch (_) { }
                    } else {
                        tiltHandStrength = getPreflopStrength(handStr);
                    }

                    // Get aggression bias from personality
                    let tiltAggrBias = 0;
                    try {
                        if (_personalityModule?.getPlayStyle) {
                            const style = _personalityModule.getPlayStyle(profileId);
                            const sa = { TAG: 5, nit: -10, LAG: 12, maniac: 18, calling_station: -8 };
                            tiltAggrBias = sa[style?.key] ?? 0;
                        }
                    } catch (_) { }

                    const tiltResult = applyTiltDegradation(
                        finalAction, finalAmount, tiltLevel,
                        tiltHandStrength, legalActions, potSize, tiltAggrBias
                    );
                    if (tiltResult.wasTilted) {
                        finalAction = tiltResult.action;
                        finalAmount = tiltResult.amount;
                    }
                }
            }
        } catch (_) { /* Tilt degradation is non-critical */ }

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

    // --- Record multi-street action for narrative tracking ---
    const handIdForMemory = engineState.handId || engineState.handNumber || `${tableId}_${Date.now()}`;
    {
        let memStrength = 50;
        try {
            if (street !== 'preflop') {
                memStrength = evaluatePostflopHand(holeCardStrings, boardStrings).strength;
            } else {
                memStrength = getPreflopStrength(handStr);
            }
        } catch (_) { }
        recordStreetAction(profileId, handIdForMemory, street, validAction.type, validAction.amount || null, memStrength);
    }

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
    if (!Array.isArray(legalActions) || legalActions.length === 0) return { type: 'fold', amount: 0 }; // Bug #45: guard null/empty legalActions
    const actionTypes = new Set(legalActions.map(a => a.type));

    // Map 'bet' to 'raise' or vice versa if needed
    if (actionType === 'bet' && !actionTypes.has('bet') && actionTypes.has('raise')) {
        actionType = 'raise';
    }
    if (actionType === 'raise' && !actionTypes.has('raise') && actionTypes.has('bet')) {
        actionType = 'bet';
    }

    // Check/fold substitution
    // BUG #26 FIX: When the brain chose 'check', it means "don't commit chips" or "pot control".
    // If check isn't available (facing a bet), the safe default is FOLD, not call.
    // The brain should have handled the facing-bet case properly upstream — if we're here
    // it means something went wrong, and calling blind is worse than folding.
    if (actionType === 'check' && !actionTypes.has('check')) {
        actionType = 'fold';
    }
    if (actionType === 'call' && !actionTypes.has('call')) {
        actionType = actionTypes.has('check') ? 'check' : 'fold';
    }
    // BUG #29 FIX: NEVER fold when check is available. Folding for free is a strict
    // dominance violation — checking is always >= folding in EV. If the brain said 'fold'
    // but check is legal, something went wrong upstream. Safe default: check.
    if (actionType === 'fold' && actionTypes.has('check')) {
        actionType = 'check';
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
    // BUG #41 FIX: When brain wanted raise/bet but it's not available, fall back to CALL
    // before fold. The brain wanted aggression — folding is the worst fallback.
    // Old code: check → fold (skipped call entirely when raise was unavailable).
    if (!actionTypes.has(actionType)) {
        // If brain wanted aggression (raise/bet), try call first
        if ((actionType === 'raise' || actionType === 'bet') && actionTypes.has('call')) {
            return { type: 'call' };
        }
        if (actionTypes.has('check')) return { type: 'check' };
        if (actionTypes.has('call')) return { type: 'call' };
        if (actionTypes.has('fold')) return { type: 'fold' };
        // Last resort: first legal action
        return { type: legalActions[0]?.type || 'fold' };
    }

    // Clamp amount for bet/raise
    // ═══ Phase 38B FIX: NaN guard — NaN bypasses < min and > max checks, reaching the engine as NaN ═══
    if (actionType === 'raise' || actionType === 'bet') {
        const raiseAction = legalActions.find(a => a.type === actionType);
        if (raiseAction) {
            const min = raiseAction.minAmount || 0;
            const max = raiseAction.maxAmount || Infinity;

            if (amount == null || isNaN(amount) || amount < min) {
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

// --- PHASE 4: DEEP-SESSION FINANCIAL EXPLOITATION DEFENSE ---
// Mod 25: Map<oppId, { count, total, rate }>
const minRaiseMap = new Map();
// Mod 26: Map<oppId, { squeezes, avgMult }>
const squeezeMap = new Map();
// Mod 28: Map<oppId, { coldCalls, barrels, folds, winRate }>
const coldCallMap = new Map();
// Mod 30: Map<oppId, { instantActions, totalActions, consecutive }>
const angleShootMap = new Map();
// Mod 31: Map<oppId, { refused, offered, rate }>
const ritRefusalMap = new Map();
// Mod 32: Map<horseId+tableId, { leaks: Map<pattern, bbLost> }>
const chipLeakMap = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STREET ACTION MEMORY
// ─────────────────────────────────────────────────────────────────────────────
// Tracks what each horse did on each street within the current hand.
// Key: `${profileId}_${handId}` → { preflop, flop, turn, river } action records.
// This allows turn/river decisions to factor in prior street actions
// (e.g., "I bet flop, checked turn → river barrel tells a weird story").
// ─────────────────────────────────────────────────────────────────────────────
const streetMemoryMap = new Map();

// ═══════════════════════════════════════════════════════════════════════════
//  OPPONENT SESSION MODEL — In-session tracking of opponent behavior
//  Complements HorsePokerAdvanced's long-term reads with real-time session data.
//  Key: opponentId → { actions[], showdowns[], stats }
//  This decays and resets per session. Gives faster adaptation than Supabase reads.
// ═══════════════════════════════════════════════════════════════════════════
const opponentSessionModel = new Map();

/**
 * Record an opponent's action in the current session for pattern detection.
 * Called after each hand completes (or at showdown) with the opponent's behavior.
 * @param {string} opponentId - Unique opponent identifier
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {string} action - 'fold', 'check', 'call', 'raise', 'bet', 'all_in'
 * @param {Object} context - { betToPot, handStrength, boardTexture, position }
 */
function recordOpponentAction(opponentId, street, action, context = {}) {
    if (!opponentSessionModel.has(opponentId)) {
        opponentSessionModel.set(opponentId, {
            actions: [],
            showdowns: [],
            stats: {
                handsPlayed: 0,
                vpip: 0,           // Voluntarily Put In Pot
                pfr: 0,            // Preflop Raise
                cbet: 0,           // C-bet attempts
                cbetFold: 0,       // Folded to c-bet raise
                foldToBarrel: 0,   // Folded on turn/river to barrel
                barrelCount: 0,    // Number of double/triple barrels
                checkRaise: 0,     // Check-raise count
                showdownWin: 0,    // Showdown wins
                showdownLoss: 0,   // Showdown losses
                bluffCaught: 0,    // Caught bluffing at showdown
                overbet: 0,        // Overbet count
                totalBets: 0,      // Total bets/raises
                totalCalls: 0,     // Total calls
                totalFolds: 0,     // Total folds
            }
        });
    }

    const model = opponentSessionModel.get(opponentId);

    // Record action with timestamp and context
    model.actions.push({
        street, action, ...context, timestamp: Date.now()
    });

    // Update stats
    if (action === 'fold') model.stats.totalFolds++;
    else if (action === 'call') model.stats.totalCalls++;
    else if (action === 'raise' || action === 'bet' || action === 'all_in') model.stats.totalBets++;

    if (street === 'preflop') {
        if (action !== 'fold') model.stats.vpip++;
        if (action === 'raise') model.stats.pfr++;
    }
    if (street === 'flop' && (action === 'bet' || action === 'raise')) {
        model.stats.cbet++;
    }
    if ((street === 'turn' || street === 'river') && (action === 'bet' || action === 'raise')) {
        model.stats.barrelCount++;
    }
    if (context.betToPot && context.betToPot >= 1.0) {
        model.stats.overbet++;
    }

    // Auto-cleanup: keep only last 200 actions per opponent
    if (model.actions.length > 200) {
        model.actions = model.actions.slice(-150);
    }

    // Cleanup stale opponents (not seen in 30 minutes)
    if (opponentSessionModel.size > 100) {
        const cutoff = Date.now() - 1800000;
        for (const [id, m] of opponentSessionModel) {
            const lastAction = m.actions[m.actions.length - 1];
            if (lastAction && lastAction.timestamp < cutoff) opponentSessionModel.delete(id);
        }
    }
}

/**
 * Record showdown result for an opponent.
 * @param {string} opponentId
 * @param {boolean} won - Did opponent win the showdown?
 * @param {number} handStrength - Opponent's hand strength at showdown (0-100)
 * @param {boolean} wasBluff - Was opponent's final action a bluff? (strength < 30 and bet/raise)
 */
function recordOpponentShowdown(opponentId, won, handStrength, wasBluff) {
    if (!opponentSessionModel.has(opponentId)) return;
    const model = opponentSessionModel.get(opponentId);
    model.stats.handsPlayed++;
    model.showdowns.push({ won, handStrength, wasBluff, timestamp: Date.now() });
    if (won) model.stats.showdownWin++;
    else model.stats.showdownLoss++;
    if (wasBluff) model.stats.bluffCaught++;

    // Keep showdown history manageable
    if (model.showdowns.length > 50) {
        model.showdowns = model.showdowns.slice(-30);
    }
}

/**
 * Get real-time session read on opponent. Complements HorsePokerAdvanced reads
 * with within-session behavioral patterns.
 * @param {string} opponentId
 * @returns {Object|null} Session-based opponent profile or null if insufficient data
 */
function getOpponentSessionRead(opponentId) {
    if (!opponentSessionModel.has(opponentId)) return null;
    const model = opponentSessionModel.get(opponentId);
    const s = model.stats;
    const totalActions = s.totalBets + s.totalCalls + s.totalFolds;
    if (totalActions < 8) return null; // Need at least 8 actions for meaningful read

    const aggFreq = totalActions > 0 ? s.totalBets / totalActions : 0.33;
    const foldFreq = totalActions > 0 ? s.totalFolds / totalActions : 0.33;
    const callFreq = totalActions > 0 ? s.totalCalls / totalActions : 0.33;

    // VPIP and PFR for preflop style
    const preflopActions = model.actions.filter(a => a.street === 'preflop').length;
    const vpipPct = preflopActions > 0 ? s.vpip / preflopActions : 0.30;
    const pfrPct = preflopActions > 0 ? s.pfr / preflopActions : 0.15;

    // Bluff frequency from showdowns
    const showdownCount = model.showdowns.length;
    const bluffRate = showdownCount >= 3 ? s.bluffCaught / showdownCount : null;

    // Session tendency: TAG, LAG, nit, calling_station, maniac
    let sessionTendency = 'balanced';
    if (vpipPct < 0.18 && aggFreq < 0.35) sessionTendency = 'nit';
    else if (vpipPct < 0.25 && aggFreq >= 0.40) sessionTendency = 'TAG';
    else if (vpipPct >= 0.30 && aggFreq >= 0.45) sessionTendency = 'LAG';
    else if (vpipPct >= 0.35 && aggFreq < 0.30) sessionTendency = 'calling_station';
    else if (vpipPct >= 0.40 && aggFreq >= 0.50) sessionTendency = 'maniac';
    else if (foldFreq >= 0.50) sessionTendency = 'weak-tight';

    // C-bet style
    const cbetRate = s.cbet > 0 ? s.cbet / Math.max(1, preflopActions * 0.5) : null;

    // Barrel persistence
    const barrelRate = s.barrelCount > 0 ? s.barrelCount / Math.max(1, s.cbet) : null;

    // Overbet frequency
    const overbetRate = s.totalBets > 0 ? s.overbet / s.totalBets : 0;

    return {
        totalActions,
        aggFreq,
        foldFreq,
        callFreq,
        vpipPct,
        pfrPct,
        bluffRate,           // null if insufficient showdown data
        sessionTendency,
        cbetRate,            // null if insufficient data
        barrelRate,          // null if insufficient data
        overbetRate,
        showdownCount,
        confidence: Math.min(0.80, totalActions / 80), // Confidence scales with sample size
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ██  ALWAYS-ON LIVE OBSERVER SYSTEM  ██
// ═══════════════════════════════════════════════════════════════════════════
// Every horse at every table is "always watching" — observing every single
// action by every player in real-time, not just when it's their turn.
//
// ARCHITECTURE:
//   liveObserver: Map<horseId, Map<tableId, TableObserver>>
//   TableObserver: {
//     opponents: Map<opponentId, LiveProfile>,  // Persistent stats across hands
//     currentHand: InHandModel | null,          // Current hand tracking
//   }
//
// FLOW:
//   1. GameController emits observeAction() on EVERY player action
//   2. ALL horses at the table receive the observation
//   3. Each horse updates its own LiveProfile for that opponent
//   4. When getDecision() fires, it calls getLiveRead(horseId, tableId, opponentId)
//      to get the freshest, most detailed opponent profile available
//
// TRACKED DATA:
//   - VPIP, PFR, 3-bet%, 4-bet%, fold-to-3bet
//   - C-bet%, fold-to-cbet%, 2-barrel%, 3-barrel%
//   - Check-raise%, donk-bet%, probe-bet%
//   - Aggression factor (AF), aggression frequency
//   - WTSD% (went to showdown), W$SD% (won money at showdown)
//   - Average bet sizing per street
//   - Timing tells: snap-action count, long-tank count, avg decision time
//   - In-hand action sequence for current hand
//   - Position-aware stats (EP/MP/CO/BTN/SB/BB)
// ═══════════════════════════════════════════════════════════════════════════

const liveObserver = new Map(); // horseId → Map<tableId, TableObserver>

/**
 * Initialize or get a TableObserver for a horse at a table.
 */
function _getTableObserver(horseId, tableId) {
    if (!liveObserver.has(horseId)) liveObserver.set(horseId, new Map());
    const horseTables = liveObserver.get(horseId);
    if (!horseTables.has(tableId)) {
        horseTables.set(tableId, {
            opponents: new Map(),
            currentHand: null,
        });
        // LRU: cap tables per horse to prevent unbounded growth
        _evictLRUTables(horseTables);
    }
    return horseTables.get(tableId);
}

/**
 * Create a fresh LiveProfile for a new opponent.
 */
function _createLiveProfile() {
    return {
        // ── Core preflop stats ──
        handsObserved: 0,
        vpipCount: 0,
        pfrCount: 0,
        threeBetCount: 0,
        threeBetOpportunity: 0,
        fourBetCount: 0,
        fourBetOpportunity: 0,
        foldToThreeBet: 0,
        facedThreeBet: 0,
        coldCallCount: 0,
        coldCallOpportunity: 0,
        limpCount: 0,
        stealAttemptCount: 0,    // Open-raise from CO/BTN/SB
        stealOpportunity: 0,
        foldToSteal: 0,
        facedSteal: 0,

        // ── Postflop stats ──
        cBetCount: 0,
        cBetOpportunity: 0,
        foldToCBet: 0,
        facedCBet: 0,
        secondBarrelCount: 0,
        secondBarrelOpportunity: 0,
        thirdBarrelCount: 0,
        thirdBarrelOpportunity: 0,
        checkRaiseCount: 0,
        checkRaiseOpportunity: 0,
        donkBetCount: 0,
        donkBetOpportunity: 0,
        probeBetCount: 0,
        probeBetOpportunity: 0,
        foldToRaise: 0,       // Folded when raised postflop
        facedRaise: 0,        // Faced a raise postflop

        // ── Aggression tracking ──
        totalBets: 0,          // bet + raise actions
        totalCalls: 0,
        totalChecks: 0,
        totalFolds: 0,

        // ── Showdown data ──
        wentToShowdown: 0,
        wonAtShowdown: 0,
        showdownBluffs: 0,     // Showed weak hand after aggression
        showdownHands: [],     // Recent showdown results (capped)

        // ── Sizing tracking ──
        preflopRaiseSizes: [],  // Recent preflop raise sizes (BB multiples)
        flopBetSizes: [],       // Recent bet sizes (fraction of pot)
        turnBetSizes: [],
        riverBetSizes: [],
        overbetCount: 0,

        // ── Timing tells ──
        totalDecisionTimeMs: 0,
        decisionCount: 0,
        snapActionCount: 0,     // Decided in < 3 seconds
        longTankCount: 0,       // Decided in > 15 seconds
        timingByStreet: {
            preflop: { totalMs: 0, count: 0 },
            flop: { totalMs: 0, count: 0 },
            turn: { totalMs: 0, count: 0 },
            river: { totalMs: 0, count: 0 },
        },

        // ── Position stats ──
        actionsByPosition: {}, // { 'BTN': { vpip: 0, pfr: 0, hands: 0 }, ... }

        // ── Meta ──
        firstSeen: Date.now(),
        lastSeen: Date.now(),
    };
}

/**
 * Create a fresh InHandModel for tracking the current hand.
 */
function _createInHandModel(handId, players) {
    const model = {
        handId,
        street: 'preflop',
        potSize: 0,
        playerActions: new Map(), // playerId → [{ street, action, amount, timing, betToPot }]
        preflopAggressor: null,    // Who was the last PFR?
        lastAggressor: null,       // Who was the last aggressor on current street?
        streetAggressors: { preflop: null, flop: null, turn: null, river: null },
        raiseCount: { preflop: 0, flop: 0, turn: 0, river: 0 },
        positions: new Map(),      // playerId → position string
        isMultiway: players.length > 2,
        actionTimestamps: new Map(), // playerId → last action timestamp (for timing tells)
    };
    for (const p of players) {
        model.playerActions.set(String(p.id || p.playerId || p), []);
        if (p.position) model.positions.set(String(p.id || p.playerId || p), p.position);
    }
    return model;
}

/**
 * ██ OBSERVE NEW HAND — Called when a new hand starts at a table. ██
 * Resets current-hand tracking for all horses watching this table.
 *
 * @param {string} tableId - Table identifier
 * @param {string} handId - Unique hand identifier
 * @param {Array} players - [{ id, position, stack }] — all players in the hand
 * @param {Array} horseIds - Horse IDs seated at this table
 * @param {number} bb - Big blind amount
 */
function observeNewHand(tableId, handId, players, horseIds, bb = 2) {
    for (const horseId of horseIds) {
        const observer = _getTableObserver(horseId, tableId);
        observer.currentHand = _createInHandModel(handId, players);
        observer.currentHand.bb = bb;

        // Increment handsObserved for all opponents at the table
        for (const p of players) {
            const pid = String(p.id || p.playerId || p);
            if (pid === horseId) continue; // Skip self
            if (!observer.opponents.has(pid)) {
                observer.opponents.set(pid, _createLiveProfile());
            }
            const profile = observer.opponents.get(pid);
            profile.handsObserved++;
            profile.lastSeen = Date.now();

            // Track position stats
            if (p.position) {
                if (!profile.actionsByPosition[p.position]) {
                    profile.actionsByPosition[p.position] = { vpip: 0, pfr: 0, hands: 0, threeBet: 0 };
                }
                profile.actionsByPosition[p.position].hands++;
            }
        }
    }

    // ═══ PERSISTENT JOURNAL: Fire-and-forget load of historical opponent data ═══
    // On the FIRST hand at a table, load journals for all opponents.
    // This gives horses an instant head-start with historical reads.
    const allPlayerIds = players.map(p => String(p.id || p.playerId || p));
    loadTableJournals(tableId, allPlayerIds, horseIds).catch(() => {});
}

/**
 * ██ OBSERVE ACTION — Called on EVERY player action at the table. ██
 * This is the core "always watching" function. Every horse at this table
 * receives every action and updates its opponent profiles in real-time.
 *
 * @param {string} tableId - Table identifier
 * @param {string} actorId - Player who took the action
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {string} action - 'fold', 'check', 'call', 'raise', 'bet', 'all_in'
 * @param {Object} context - {
 *   amount: number,           // Bet/raise amount in chips
 *   potSize: number,          // Pot size before this action
 *   toCall: number,           // Amount needed to call
 *   decisionTimeMs: number,   // How long the player took to decide
 *   position: string,         // Actor's position (BTN, SB, BB, etc.)
 *   isOpenAction: boolean,    // First voluntary action preflop?
 *   facingRaiseCount: number, // How many raises before this action?
 * }
 * @param {Array} horseIds - All horse IDs watching this table
 */
function observeAction(tableId, actorId, street, action, context = {}, horseIds = []) {
    const actorStr = String(actorId);
    const {
        amount = 0, potSize = 0, toCall = 0, decisionTimeMs = 0,
        position = '', isOpenAction = false, facingRaiseCount = 0,
    } = context;
    const betToPot = potSize > 0 ? amount / potSize : 0;

    for (const horseId of horseIds) {
        if (horseId === actorStr) continue; // Don't observe self

        const observer = _getTableObserver(horseId, tableId);
        if (!observer.opponents.has(actorStr)) {
            observer.opponents.set(actorStr, _createLiveProfile());
            // LRU eviction: cap opponent profiles per table to prevent memory bloat
            _evictLRUProfiles(observer);
        }
        const profile = observer.opponents.get(actorStr);
        profile.lastSeen = Date.now();

        // ═══ Phase 45 FIX: capture pre-action streetAgg BEFORE bet/raise sets it.
        // probeBetOpportunity and donkBetOpportunity checks need to know if this
        // is the FIRST aggressive action on the street, but the aggressor tracking
        // below sets hand.streetAggressors[street] before those checks run. ═══
        const hand = observer.currentHand || null;
        const preActionStreetAgg = hand ? (hand.streetAggressors[street] || null) : null;

        // ── Record in current-hand model ──
        if (hand) {
            hand.street = street;

            if (!hand.playerActions.has(actorStr)) {
                hand.playerActions.set(actorStr, []);
            }
            hand.playerActions.get(actorStr).push({
                street, action, amount, betToPot, timing: decisionTimeMs, position,
                timestamp: Date.now()
            });

            // Track raise counts per street
            if (action === 'raise' || action === 'all_in') {
                hand.raiseCount[street] = (hand.raiseCount[street] || 0) + 1;
                hand.lastAggressor = actorStr;
                hand.streetAggressors[street] = actorStr;
                if (street === 'preflop') hand.preflopAggressor = actorStr;
            }
            if (action === 'bet') {
                hand.lastAggressor = actorStr;
                hand.streetAggressors[street] = actorStr;
            }

            // Track action timestamps for timing
            hand.actionTimestamps.set(actorStr, Date.now());
        }

        // ═══════════════════════════════════════
        // ██ PREFLOP STAT TRACKING ██
        // ═══════════════════════════════════════
        if (street === 'preflop') {
            // VPIP: any voluntary action except posting blinds or folding
            if (action !== 'fold' && action !== 'check') {
                profile.vpipCount++;
                if (position && profile.actionsByPosition[position]) {
                    profile.actionsByPosition[position].vpip++;
                }
            }

            // PFR: any raise or all-in preflop
            if (action === 'raise' || action === 'all_in') {
                profile.pfrCount++;
                if (position && profile.actionsByPosition[position]) {
                    profile.actionsByPosition[position].pfr++;
                }

                // Steal attempt tracking (open-raise from CO/BTN/SB)
                if (isOpenAction && ['CO', 'BTN', 'SB', 'D'].includes(position)) {
                    profile.stealAttemptCount++;
                }

                // 3-bet detection: raising when already facing a raise
                if (facingRaiseCount === 1) {
                    profile.threeBetCount++;
                    if (position && profile.actionsByPosition[position]) {
                        profile.actionsByPosition[position].threeBet++;
                    }
                }
                // 4-bet detection
                if (facingRaiseCount >= 2) {
                    profile.fourBetCount++;
                }

                // Track preflop sizing
                if (amount > 0 && observer.currentHand) {
                    const bbAmt = observer.currentHand.bb || 2;
                    profile.preflopRaiseSizes.push(amount / bbAmt);
                    if (profile.preflopRaiseSizes.length > 30) {
                        profile.preflopRaiseSizes = profile.preflopRaiseSizes.slice(-20);
                    }
                }
            }

            // Limp detection (just calling the big blind)
            if (action === 'call' && facingRaiseCount === 0) {
                profile.limpCount++;
            }

            // Cold call (calling a raise without having put money in yet)
            if (action === 'call' && facingRaiseCount >= 1 && isOpenAction) {
                profile.coldCallCount++;
            }

            // Fold to 3-bet
            if (action === 'fold' && facingRaiseCount >= 2) {
                profile.foldToThreeBet++;
            }

            // Facing 3-bet (had raised, now faces a re-raise)
            if (facingRaiseCount >= 2) {
                profile.facedThreeBet++;
                // ═══ Phase 43 FIX: was incrementing threeBetOpportunity here too, but facing 2+ raises
                // is a 4-bet opportunity, NOT a 3-bet opportunity. Line below already handles 3-bet opp. ═══
            }

            // 3-bet opportunity (someone raised before us)
            if (facingRaiseCount === 1) {
                profile.threeBetOpportunity++;
            }

            // 4-bet opportunity
            if (facingRaiseCount >= 2) {
                profile.fourBetOpportunity++;
            }

            // Fold to steal
            if (action === 'fold' && position && ['BB', 'SB'].includes(position)) {
                const hand = observer.currentHand;
                if (hand && hand.raiseCount.preflop === 1) {
                    // Single raise from late position = steal attempt
                    const raiserPos = hand.positions.get(hand.preflopAggressor);
                    if (['CO', 'BTN', 'SB', 'D'].includes(raiserPos)) {
                        profile.foldToSteal++;
                    }
                }
            }
            if (position && ['BB', 'SB'].includes(position)) {
                const hand = observer.currentHand;
                if (hand && hand.raiseCount.preflop === 1) {
                    const raiserPos = hand.positions.get(hand.preflopAggressor);
                    if (['CO', 'BTN', 'SB', 'D'].includes(raiserPos)) {
                        profile.facedSteal++;
                        // ═══ Phase 43 FIX: was outside this block — stealOpportunity only applies
                        // when actually facing a steal attempt (single late-position open) ═══
                        profile.stealOpportunity++;
                    }
                }
            }

            // Cold call opportunity
            if (facingRaiseCount >= 1) {
                profile.coldCallOpportunity++;
            }
        }

        // ═══════════════════════════════════════
        // ██ POSTFLOP STAT TRACKING ██
        // ═══════════════════════════════════════
        if (street !== 'preflop') {
            const hand = observer.currentHand;
            const isPFR = hand && hand.preflopAggressor === actorStr;
            const prevStreetAgg = hand ? hand.streetAggressors[
                street === 'flop' ? 'preflop' : street === 'turn' ? 'flop' : 'turn'
            ] : null;
            const wasLastStreetAggressor = prevStreetAgg === actorStr;

            // ── C-bet tracking ──
            if (street === 'flop' && isPFR) {
                profile.cBetOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.cBetCount++;
                }
            }

            // ── Fold to C-bet ──
            if (street === 'flop' && !isPFR && action === 'fold') {
                const flopAggressor = hand ? hand.streetAggressors.flop : null;
                if (flopAggressor && flopAggressor === hand.preflopAggressor) {
                    profile.foldToCBet++;
                }
            }
            if (street === 'flop' && !isPFR) {
                const flopAggressor = hand ? hand.streetAggressors.flop : null;
                if (flopAggressor && flopAggressor === hand.preflopAggressor) {
                    profile.facedCBet++;
                }
            }

            // ── Second barrel (turn bet after flop c-bet) ──
            if (street === 'turn' && wasLastStreetAggressor) {
                profile.secondBarrelOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.secondBarrelCount++;
                }
            }

            // ── Third barrel (river bet after turn barrel) ──
            if (street === 'river' && wasLastStreetAggressor) {
                profile.thirdBarrelOpportunity++;
                if (action === 'bet' || action === 'raise') {
                    profile.thirdBarrelCount++;
                }
            }

            // ── Check-raise detection ──
            if (action === 'raise' && hand) {
                const myActions = hand.playerActions.get(actorStr) || [];
                const streetActions = myActions.filter(a => a.street === street);
                if (streetActions.length >= 2 && streetActions[streetActions.length - 2].action === 'check') {
                    profile.checkRaiseCount++;
                }
            }
            // Check-raise opportunity: checked and someone bet after
            if (action === 'check') {
                profile.checkRaiseOpportunity++; // Approximate — refined at street end
            }

            // ── Donk bet detection (non-aggressor leading out) ──
            if ((action === 'bet') && !isPFR && !wasLastStreetAggressor) {
                profile.donkBetCount++;
            }
            // ═══ Phase 43 FIX: was counting ALL non-aggressor actions as donk opportunities.
            // A donk opportunity only exists when acting FIRST on a street (bet or check, no prior bet). ═══
            // ═══ Phase 45 FIX: use preActionStreetAgg instead of hand.streetAggressors[street]
            // because a 'bet' action sets the aggressor BEFORE this check runs. ═══
            if (!isPFR && !wasLastStreetAggressor && (action === 'bet' || action === 'check')) {
                // Only count if no one has bet on this street yet (i.e., this is a leading action)
                if (!preActionStreetAgg) {
                    profile.donkBetOpportunity++;
                }
            }

            // ── Probe bet (betting when previous street checked through) ──
            if (action === 'bet' && hand) {
                const prevStreet = street === 'turn' ? 'flop' : street === 'river' ? 'turn' : null;
                if (prevStreet && !hand.streetAggressors[prevStreet]) {
                    profile.probeBetCount++;
                }
            }
            // ═══ Phase 43+45 FIX: was counting ALL actions as probe opportunities — only count when
            // acting first on the street (bet or check) with no prior street aggression.
            // Phase 45: use preActionStreetAgg to avoid race condition where bet sets aggressor first. ═══
            if (hand && (action === 'bet' || action === 'check')) {
                const prevStreet = street === 'turn' ? 'flop' : street === 'river' ? 'turn' : null;
                if (prevStreet && !hand.streetAggressors[prevStreet] && !preActionStreetAgg) {
                    profile.probeBetOpportunity++;
                }
            }

            // ── Fold to raise (postflop) ──
            if (action === 'fold' && facingRaiseCount >= 1) {
                profile.foldToRaise++;
            }
            if (facingRaiseCount >= 1) {
                profile.facedRaise++;
            }

            // ── Bet sizing tracking ──
            if ((action === 'bet' || action === 'raise' || action === 'all_in') && betToPot > 0) {
                const sizeArr = street === 'flop' ? profile.flopBetSizes
                    : street === 'turn' ? profile.turnBetSizes
                    : profile.riverBetSizes;
                sizeArr.push(betToPot);
                if (sizeArr.length > 25) sizeArr.splice(0, sizeArr.length - 20);
                if (betToPot >= 1.0) profile.overbetCount++;
            }
        }

        // ═══════════════════════════════════════
        // ██ UNIVERSAL ACTION TRACKING ██
        // ═══════════════════════════════════════
        if (action === 'fold') profile.totalFolds++;
        else if (action === 'call') profile.totalCalls++;
        else if (action === 'check') profile.totalChecks++;
        else if (action === 'bet' || action === 'raise' || action === 'all_in') profile.totalBets++;

        // ═══════════════════════════════════════
        // ██ TIMING TELL TRACKING ██
        // ═══════════════════════════════════════
        if (decisionTimeMs > 0) {
            profile.totalDecisionTimeMs += decisionTimeMs;
            profile.decisionCount++;
            if (decisionTimeMs < 3000) profile.snapActionCount++; // < 3s = snap
            if (decisionTimeMs > 15000) profile.longTankCount++;  // > 15s = long tank

            // Per-street timing
            if (profile.timingByStreet[street]) {
                profile.timingByStreet[street].totalMs += decisionTimeMs;
                profile.timingByStreet[street].count++;
            }
        }

        // ═══ PERIODIC JOURNAL PERSISTENCE ═══
        // Every JOURNAL_PERSIST_INTERVAL hands, persist opponent data to Supabase.
        // Fire-and-forget — non-blocking, won't slow down the game.
        if (profile.handsObserved > 0 && profile.handsObserved % JOURNAL_PERSIST_INTERVAL === 0) {
            persistOpponentJournal(horseId, actorStr, profile).catch(() => {});
        }
    }
}

/**
 * ██ OBSERVE SHOWDOWN — Called when cards are revealed at showdown. ██
 *
 * @param {string} tableId
 * @param {string} playerId - Player who showed cards
 * @param {boolean} won - Did they win the pot?
 * @param {number} handStrength - Hand strength 0-100
 * @param {boolean} wasBluff - Was their final action aggressive with a weak hand?
 * @param {Array} horseIds - All horse IDs watching this table
 */
function observeShowdown(tableId, playerId, won, handStrength, wasBluff, horseIds = []) {
    const pid = String(playerId);
    for (const horseId of horseIds) {
        if (horseId === pid) continue;
        const observer = _getTableObserver(horseId, tableId);
        if (!observer.opponents.has(pid)) continue;
        const profile = observer.opponents.get(pid);

        profile.wentToShowdown++;
        if (won) profile.wonAtShowdown++;
        if (wasBluff) profile.showdownBluffs++;

        profile.showdownHands.push({ won, handStrength, wasBluff, timestamp: Date.now() });
        if (profile.showdownHands.length > 40) {
            profile.showdownHands = profile.showdownHands.slice(-25);
        }
    }
}

/**
 * ██ GET LIVE READ — The master query function for live opponent data. ██
 *
 * Returns a comprehensive, real-time opponent profile that combines:
 * - Cross-hand stats (VPIP, PFR, 3-bet, c-bet, etc.)
 * - Timing tells (snap-actions, long-tanks)
 * - In-hand action sequences for the current hand
 * - Position-aware stats
 * - Sizing tendencies
 *
 * @param {string} horseId - The horse requesting the read
 * @param {string} tableId - Table they're at
 * @param {string} opponentId - Opponent to read
 * @returns {Object|null} Live opponent profile or null if insufficient data
 */
function getLiveRead(horseId, tableId, opponentId) {
    if (!liveObserver.has(horseId)) return null;
    const horseTables = liveObserver.get(horseId);
    if (!horseTables.has(tableId)) return null;
    const observer = horseTables.get(tableId);

    const oppStr = String(opponentId);
    if (!observer.opponents.has(oppStr)) return null;
    const p = observer.opponents.get(oppStr);

    // Need minimum observations for any meaningful read
    if (p.handsObserved < 5) return null;

    const totalActions = p.totalBets + p.totalCalls + p.totalChecks + p.totalFolds;
    if (totalActions < 6) return null;

    // ═══ CORE FREQUENCIES ═══
    const vpipPct = p.handsObserved > 0 ? p.vpipCount / p.handsObserved : 0.30;
    const pfrPct = p.handsObserved > 0 ? p.pfrCount / p.handsObserved : 0.15;
    const threeBetPct = p.threeBetOpportunity > 3 ? p.threeBetCount / p.threeBetOpportunity : null;
    const fourBetPct = p.fourBetOpportunity > 2 ? p.fourBetCount / p.fourBetOpportunity : null;
    const foldToThreeBetPct = p.facedThreeBet > 3 ? p.foldToThreeBet / p.facedThreeBet : null;
    const coldCallPct = p.coldCallOpportunity > 3 ? p.coldCallCount / p.coldCallOpportunity : null;
    const limpPct = p.handsObserved > 5 ? p.limpCount / p.handsObserved : null;
    const stealPct = p.stealOpportunity > 3 ? p.stealAttemptCount / p.stealOpportunity : null;
    const foldToStealPct = p.facedSteal > 3 ? p.foldToSteal / p.facedSteal : null;

    // ═══ POSTFLOP FREQUENCIES ═══
    const cBetPct = p.cBetOpportunity > 3 ? p.cBetCount / p.cBetOpportunity : null;
    const foldToCBetPct = p.facedCBet > 3 ? p.foldToCBet / p.facedCBet : null;
    const secondBarrelPct = p.secondBarrelOpportunity > 2 ? p.secondBarrelCount / p.secondBarrelOpportunity : null;
    const thirdBarrelPct = p.thirdBarrelOpportunity > 2 ? p.thirdBarrelCount / p.thirdBarrelOpportunity : null;
    const checkRaisePct = p.checkRaiseOpportunity > 3 ? p.checkRaiseCount / p.checkRaiseOpportunity : null;
    const donkBetPct = p.donkBetOpportunity > 3 ? p.donkBetCount / p.donkBetOpportunity : null;
    const probeBetPct = p.probeBetOpportunity > 3 ? p.probeBetCount / p.probeBetOpportunity : null;
    const foldToRaisePct = p.facedRaise > 3 ? p.foldToRaise / p.facedRaise : null;

    // ═══ AGGRESSION ═══
    const aggFreq = totalActions > 0 ? p.totalBets / totalActions : 0.33;
    const foldFreq = totalActions > 0 ? p.totalFolds / totalActions : 0.33;
    const callFreq = totalActions > 0 ? p.totalCalls / totalActions : 0.33;
    // AF = (bets + raises) / calls. Standard poker aggression factor.
    const aggressionFactor = p.totalCalls > 0 ? p.totalBets / p.totalCalls : p.totalBets > 0 ? 99 : 1;

    // ═══ SHOWDOWN ═══
    const wtsd = p.handsObserved > 5 ? p.wentToShowdown / p.handsObserved : null;
    const wsd = p.wentToShowdown > 3 ? p.wonAtShowdown / p.wentToShowdown : null;
    const bluffRate = p.wentToShowdown >= 3 ? p.showdownBluffs / p.wentToShowdown : null;

    // ═══ SIZING TENDENCIES ═══
    const avgFlopBet = p.flopBetSizes.length >= 3
        ? p.flopBetSizes.reduce((a, b) => a + b, 0) / p.flopBetSizes.length : null;
    const avgTurnBet = p.turnBetSizes.length >= 3
        ? p.turnBetSizes.reduce((a, b) => a + b, 0) / p.turnBetSizes.length : null;
    const avgRiverBet = p.riverBetSizes.length >= 3
        ? p.riverBetSizes.reduce((a, b) => a + b, 0) / p.riverBetSizes.length : null;
    const avgPreflopRaise = p.preflopRaiseSizes.length >= 3
        ? p.preflopRaiseSizes.reduce((a, b) => a + b, 0) / p.preflopRaiseSizes.length : null;
    const overbetFreq = p.totalBets > 5 ? p.overbetCount / p.totalBets : null;

    // ═══ TIMING TELLS ═══
    const avgDecisionMs = p.decisionCount > 0 ? p.totalDecisionTimeMs / p.decisionCount : null;
    const snapFreq = p.decisionCount > 5 ? p.snapActionCount / p.decisionCount : null;
    const longTankFreq = p.decisionCount > 5 ? p.longTankCount / p.decisionCount : null;
    const timingProfile = {};
    for (const [st, data] of Object.entries(p.timingByStreet)) {
        timingProfile[st] = data.count > 0 ? { avgMs: data.totalMs / data.count, count: data.count } : null;
    }

    // ═══ PLAYER TYPE CLASSIFICATION ═══
    let playerType = 'unknown';
    if (p.handsObserved >= 10) {
        if (vpipPct < 0.18 && pfrPct < 0.12) playerType = 'nit';
        else if (vpipPct < 0.24 && pfrPct >= 0.16 && aggFreq >= 0.38) playerType = 'TAG';
        else if (vpipPct >= 0.28 && pfrPct >= 0.20 && aggFreq >= 0.42) playerType = 'LAG';
        else if (vpipPct >= 0.35 && aggFreq < 0.28) playerType = 'calling_station';
        else if (vpipPct >= 0.45 && aggFreq >= 0.48) playerType = 'maniac';
        else if (foldFreq >= 0.52) playerType = 'weak-tight';
        else if (vpipPct >= 0.28 && vpipPct < 0.38 && aggFreq >= 0.30 && aggFreq < 0.42) playerType = 'loose-passive';
        else playerType = 'balanced';
    }

    // ═══ EXPLOIT PATTERNS ═══
    // Detect specific exploitable patterns from the data
    const exploits = [];
    if (foldToCBetPct !== null && foldToCBetPct > 0.65) exploits.push('overfolds_to_cbet');
    if (cBetPct !== null && cBetPct > 0.75) exploits.push('overcbets');
    if (foldToThreeBetPct !== null && foldToThreeBetPct > 0.70) exploits.push('overfolds_to_3bet');
    if (threeBetPct !== null && threeBetPct > 0.12) exploits.push('over3bets');
    if (wtsd !== null && wtsd > 0.35) exploits.push('station_to_showdown');
    if (wtsd !== null && wtsd < 0.18) exploits.push('gives_up_easily');
    if (checkRaisePct !== null && checkRaisePct > 0.12) exploits.push('frequent_check_raiser');
    if (donkBetPct !== null && donkBetPct > 0.15) exploits.push('frequent_donker');
    if (snapFreq !== null && snapFreq > 0.50) exploits.push('plays_too_fast');
    if (longTankFreq !== null && longTankFreq > 0.25) exploits.push('slow_player');
    if (overbetFreq !== null && overbetFreq > 0.15) exploits.push('frequent_overbetter');
    if (limpPct !== null && limpPct > 0.10) exploits.push('limper');
    if (foldToStealPct !== null && foldToStealPct > 0.70) exploits.push('overfolds_blinds');
    if (secondBarrelPct !== null && secondBarrelPct < 0.30 && cBetPct !== null && cBetPct > 0.60) {
        exploits.push('one_and_done'); // C-bets a lot but gives up on turn
    }
    if (foldToRaisePct !== null && foldToRaisePct > 0.60) exploits.push('overfolds_to_raise');

    // ═══ IN-HAND CONTEXT ═══
    let inHandActions = null;
    if (observer.currentHand) {
        const hand = observer.currentHand;
        const actions = hand.playerActions.get(oppStr);
        if (actions && actions.length > 0) {
            inHandActions = {
                actions: actions.map(a => ({ street: a.street, action: a.action, amount: a.amount, betToPot: a.betToPot, timing: a.timing })),
                isAggressor: hand.preflopAggressor === oppStr,
                lastAction: actions[actions.length - 1],
                streetAggression: {
                    preflop: hand.streetAggressors.preflop === oppStr,
                    flop: hand.streetAggressors.flop === oppStr,
                    turn: hand.streetAggressors.turn === oppStr,
                    river: hand.streetAggressors.river === oppStr,
                },
            };
        }
    }

    // ═══ CONFIDENCE ═══
    // Scales with data quality: more hands + more showdowns = higher confidence
    const handConfidence = Math.min(0.60, p.handsObserved / 100);
    const showdownConfidence = p.wentToShowdown >= 3 ? Math.min(0.20, p.wentToShowdown / 30) : 0;
    const timingConfidence = p.decisionCount > 10 ? 0.10 : 0;
    // ═══ JOURNAL BONUS: Historical data from prior sessions boosts confidence ═══
    // PHASE 15: Applies data decay — older journal data contributes less.
    // Multi-session data is more reliable: bonus scales with session_count.
    let journalBonus = 0;
    if (p._journalSeeded && p._journalHands > 20) {
        const baseBonus = Math.min(0.15, p._journalHands / 500);
        const freshness = p._journalFreshness ?? 1.0; // 1.0 = fresh, 0.15 = very stale
        const sessionMultiplier = Math.min(1.5, 1.0 + ((p._journalSessionCount || 1) - 1) * 0.10); // More sessions = more reliable
        journalBonus = baseBonus * freshness * sessionMultiplier;
    }
    const confidence = Math.min(0.95, handConfidence + showdownConfidence + timingConfidence + journalBonus);

    return {
        // Core frequencies
        vpipPct, pfrPct, threeBetPct, fourBetPct, foldToThreeBetPct,
        coldCallPct, limpPct, stealPct, foldToStealPct,
        // Postflop
        cBetPct, foldToCBetPct, secondBarrelPct, thirdBarrelPct,
        checkRaisePct, donkBetPct, probeBetPct, foldToRaisePct,
        // Aggression
        aggFreq, foldFreq, callFreq, aggressionFactor,
        // Showdown
        wtsd, wsd, bluffRate,
        // Sizing
        avgFlopBet, avgTurnBet, avgRiverBet, avgPreflopRaise, overbetFreq,
        overbetPct: overbetFreq, // Alias: some consumers use overbetPct
        // Timing
        avgDecisionMs, snapFreq, longTankFreq, timingProfile,
        // Classification
        playerType, exploits,
        // In-hand
        inHandActions,
        // Position stats
        positionStats: p.actionsByPosition,
        // Meta
        handsObserved: p.handsObserved,
        lastSeen: p.lastSeen || Date.now(),
        confidence,
    };
}

/**
 * Clean up stale live observer data for tables a horse has left.
 * @param {string} horseId
 * @param {string} tableId
 */
function clearLiveObserver(horseId, tableId) {
    if (liveObserver.has(horseId)) {
        const horseTables = liveObserver.get(horseId);
        horseTables.delete(tableId);
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

/**
 * Clean up all live observer data for a table (when table closes).
 * @param {string} tableId
 */
function clearTableLiveObservers(tableId) {
    // ═══ PERSISTENT JOURNAL: Save all opponent data before clearing ═══
    for (const [horseId, horseTables] of liveObserver) {
        if (horseTables.has(tableId)) {
            persistTableJournals(horseId, tableId).catch(() => {});
        }
    }
    // Now clear the observers
    for (const [horseId, horseTables] of liveObserver) {
        horseTables.delete(tableId);
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

/**
 * Auto-cleanup stale data across all observers.
 * Call periodically (e.g., every 5 minutes) to prevent memory bloat.
 */
function cleanupLiveObservers() {
    const staleThreshold = 45 * 60 * 1000; // 45 minutes
    const now = Date.now();
    for (const [horseId, horseTables] of liveObserver) {
        for (const [tableId, observer] of horseTables) {
            for (const [oppId, profile] of observer.opponents) {
                if (now - profile.lastSeen > staleThreshold) {
                    observer.opponents.delete(oppId);
                }
            }
            if (observer.opponents.size === 0) horseTables.delete(tableId);
        }
        if (horseTables.size === 0) liveObserver.delete(horseId);
    }
}

// Auto-cleanup every 5 minutes
setInterval(cleanupLiveObservers, 5 * 60 * 1000);

/**
 * LRU eviction: cap opponent profiles per table observer.
 * Prevents unbounded memory growth on long-running servers.
 */
const MAX_OPPONENTS_PER_TABLE = 50;
const MAX_TABLES_PER_HORSE = 8;

function _evictLRUProfiles(observer) {
    if (observer.opponents.size <= MAX_OPPONENTS_PER_TABLE) return;
    const sorted = [...observer.opponents.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const toEvict = sorted.length - MAX_OPPONENTS_PER_TABLE;
    for (let i = 0; i < toEvict; i++) {
        observer.opponents.delete(sorted[i][0]);
    }
}

function _evictLRUTables(horseTables) {
    if (horseTables.size <= MAX_TABLES_PER_HORSE) return;
    const entries = [...horseTables.entries()];
    const withLastSeen = entries.map(([tid, obs]) => {
        let newest = 0;
        for (const p of obs.opponents.values()) {
            if (p.lastSeen > newest) newest = p.lastSeen;
        }
        return { tid, newest };
    }).sort((a, b) => a.newest - b.newest);
    const toEvict = withLastSeen.length - MAX_TABLES_PER_HORSE;
    for (let i = 0; i < toEvict; i++) {
        horseTables.delete(withLastSeen[i].tid);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// END ALWAYS-ON LIVE OBSERVER SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record hero's action on this street for multi-street planning.
 * @param {string} profileId
 * @param {string} handId - Unique hand identifier (or table+hand combo)
 * @param {string} street - 'preflop', 'flop', 'turn', 'river'
 * @param {string} action - 'fold', 'check', 'call', 'raise', 'bet', 'all_in'
 * @param {number|null} amount
 * @param {number} handStrength - 0-100 at time of action
 */
function recordStreetAction(profileId, handId, street, action, amount, handStrength) {
    const key = `${profileId}_${handId}`;
    if (!streetMemoryMap.has(key)) {
        streetMemoryMap.set(key, { preflop: null, flop: null, turn: null, river: null });
    }
    const mem = streetMemoryMap.get(key);
    mem[street] = { action, amount, handStrength, timestamp: Date.now() };

    // Auto-cleanup: remove entries older than 2 minutes (hand should be over)
    if (streetMemoryMap.size > 500) {
        const cutoff = Date.now() - 120000;
        for (const [k, v] of streetMemoryMap) {
            const latest = v.river || v.turn || v.flop || v.preflop;
            if (latest && latest.timestamp < cutoff) streetMemoryMap.delete(k);
        }
    }
}

/**
 * Get prior street actions for multi-street planning.
 * @param {string} profileId
 * @param {string} handId
 * @returns {Object} { preflop, flop, turn, river } each null or { action, amount, handStrength }
 */
function getStreetMemory(profileId, handId) {
    const key = `${profileId}_${handId}`;
    return streetMemoryMap.get(key) || { preflop: null, flop: null, turn: null, river: null };
}

/**
 * Analyze multi-street narrative for decision context.
 * @returns {Object} Multi-street context signals
 */
function analyzeStreetNarrative(memory, currentStreet) {
    const result = {
        heroBetFlop: false,
        heroCheckedFlop: false,
        heroBetTurn: false,
        heroCheckedTurn: false,
        heroRaisedPreflop: false,
        barrelsInARow: 0,          // How many streets we've been betting
        checkBehindCount: 0,       // How many streets we checked
        storyIsConsistent: true,   // Does our line tell a believable story?
        suggestedLine: 'balanced'  // 'barrel', 'check-back', 'delayed-barrel', 'trap'
    };

    if (memory.preflop?.action === 'raise' || memory.preflop?.action === 'bet') {
        result.heroRaisedPreflop = true;
    }
    if (memory.flop) {
        if (memory.flop.action === 'bet' || memory.flop.action === 'raise') {
            result.heroBetFlop = true;
            result.barrelsInARow++;
        } else if (memory.flop.action === 'check') {
            result.heroCheckedFlop = true;
            result.checkBehindCount++;
        }
    }
    if (memory.turn) {
        if (memory.turn.action === 'bet' || memory.turn.action === 'raise') {
            result.heroBetTurn = true;
            result.barrelsInARow++;
        } else if (memory.turn.action === 'check') {
            result.heroCheckedTurn = true;
            result.checkBehindCount++;
            // If we bet flop but checked turn, our story is inconsistent
            if (result.heroBetFlop) result.storyIsConsistent = false;
        }
    }

    // Suggest line based on narrative
    if (currentStreet === 'turn') {
        if (result.heroBetFlop) {
            result.suggestedLine = 'barrel'; // Continue the story
        } else {
            result.suggestedLine = 'delayed-barrel'; // Checked flop, bet turn = strength
        }
    } else if (currentStreet === 'river') {
        if (result.heroBetFlop && result.heroBetTurn) {
            result.suggestedLine = 'barrel'; // Triple barrel = strong or committed bluff
        } else if (result.heroBetFlop && result.heroCheckedTurn) {
            result.suggestedLine = 'trap'; // Check turn, bet river = delayed value or trap
        } else if (result.heroCheckedFlop && result.heroBetTurn) {
            result.suggestedLine = 'delayed-barrel'; // Flop check, turn bet, river = strong line
        } else {
            result.suggestedLine = 'check-back'; // Haven't shown aggression
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 25: MIN-RAISE HARASSMENT DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function recordRaiseSize(oppId, raiseAmt, prevBet, oppWon) {
    if (!oppId) return;
    const isMin = raiseAmt <= prevBet * 2.2 && raiseAmt > 0;
    if (!minRaiseMap.has(oppId)) minRaiseMap.set(oppId, { count: 0, total: 0, rate: 0 });
    const m = minRaiseMap.get(oppId);
    m.total++;
    if (isMin) m.count++;
    m.rate = m.count / m.total;
}
function isMinRaiser(oppId) {
    const m = minRaiseMap.get(oppId);
    if (!m || m.total < 4) return { isMinRaiser: false, rate: 0 };
    return { isMinRaiser: m.rate > 0.40, rate: m.rate };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 26: SQUEEZE OVERKILL DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function recordSqueeze(oppId, raiseAmt, potSize) {
    if (!oppId || potSize <= 0) return;
    const mult = raiseAmt / potSize;
    if (!squeezeMap.has(oppId)) squeezeMap.set(oppId, { squeezes: 0, avgMult: 0 });
    const m = squeezeMap.get(oppId);
    m.squeezes++;
    m.avgMult = m.avgMult === 0 ? mult : (m.avgMult * 0.7) + (mult * 0.3);
}
function isSqueezeOverkill(oppId) {
    const m = squeezeMap.get(oppId);
    if (!m || m.squeezes < 3) return { isOverkill: false, avgMult: 0 };
    return { isOverkill: m.avgMult >= 4.0, avgMult: m.avgMult };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 27: REVERSE IMPLIED ODDS GUARD
// ─────────────────────────────────────────────────────────────────────────────
function detectReverseImplied(outs, potOdds, effectiveStack, numOpponents, boardIsWet) {
    if (outs <= 0) return { shouldBlock: false, rioFactor: 0, reason: 'no draw outs — made hand' };
    const drawEquity = Math.min(outs * 2.0, 45) / 100;
    const forwardImplied = drawEquity * effectiveStack * 0.6;
    const rioMultiplier = boardIsWet ? (1 + numOpponents * 0.3) : (1 + numOpponents * 0.15);
    const reverseImplied = potOdds * effectiveStack * rioMultiplier;
    const rioFactor = reverseImplied / Math.max(forwardImplied, 0.01);
    const shouldBlock = rioFactor > 1.5 && drawEquity < potOdds;
    return {
        shouldBlock,
        rioFactor: Math.round(rioFactor * 100) / 100,
        reason: shouldBlock ? `RIO×${rioFactor.toFixed(1)} — draw equity ${(drawEquity * 100).toFixed(0)}% < pot odds ${(potOdds * 100).toFixed(0)}%` : 'draw call acceptable'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 28: COLD-CALL TRAP DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function recordColdCall(oppId) {
    if (!oppId) return;
    if (!coldCallMap.has(oppId)) coldCallMap.set(oppId, { coldCalls: 0, barrels: 0, folds: 0, winRate: 0 });
    coldCallMap.get(oppId).coldCalls++;
}
function recordBarrelVsColdCall(oppId, oppFolded) {
    if (!oppId || !coldCallMap.has(oppId)) return;
    const m = coldCallMap.get(oppId);
    m.barrels++;
    if (oppFolded) m.folds++;
    m.winRate = m.folds / m.barrels;
}
function isColdCallTrap(oppId) {
    const m = coldCallMap.get(oppId);
    if (!m || m.barrels < 4) return { isTrap: false, winRate: 0 };
    return { isTrap: m.winRate < 0.35, winRate: m.winRate };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 29: STRADDLE & BOMB-POT EQUITY ADJUSTER
// ─────────────────────────────────────────────────────────────────────────────
function detectBombPotOrStraddle(potTotal, bb, hasStraddle) {
    const isBombPot = !hasStraddle && (potTotal >= bb * 8);
    const isStraddle = !!hasStraddle;
    return {
        isBombPot,
        isStraddle,
        label: isBombPot ? 'bomb-pot' : (isStraddle ? 'straddle' : 'standard'),
        equityThresholdBoost: isBombPot ? 15 : (isStraddle ? 10 : 0)
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 30: ANGLE-SHOOT TIMING DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function recordActionTiming(oppId, actionMs) {
    if (!oppId) return;
    if (!angleShootMap.has(oppId)) angleShootMap.set(oppId, { instantActions: 0, totalActions: 0, consecutive: 0 });
    const m = angleShootMap.get(oppId);
    m.totalActions++;
    if (actionMs < 700) {
        m.instantActions++;
        m.consecutive++;
    } else {
        m.consecutive = 0;
    }
}
function detectAngleShoot(oppId) {
    const m = angleShootMap.get(oppId);
    if (!m) return { isAngleShooting: false, extraEntropyMs: 0 };
    const rate = m.totalActions > 4 ? m.instantActions / m.totalActions : 0;
    const isAngleShooting = rate > 0.60 || m.consecutive >= 4;
    return {
        isAngleShooting,
        extraEntropyMs: isAngleShooting ? (2000 + Math.random() * 3000) : 0
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 31: RUN-IT-TWICE REFUSAL TRACKER
// ─────────────────────────────────────────────────────────────────────────────
function recordRITResponse(oppId, accepted) {
    if (!oppId) return;
    if (!ritRefusalMap.has(oppId)) ritRefusalMap.set(oppId, { refused: 0, offered: 0, rate: 0 });
    const m = ritRefusalMap.get(oppId);
    m.offered++;
    if (!accepted) m.refused++;
    m.rate = m.refused / m.offered;
}
function isRITRefuser(oppId) {
    const m = ritRefusalMap.get(oppId);
    if (!m || m.offered < 2) return { isRITRefuser: false, refusalRate: 0 };
    return { isRITRefuser: m.rate >= 0.8, refusalRate: m.rate };
}

// ── Bug #81: HORSE RUN-IT-TWICE PREFERENCE ──
// Dan's rule: "Horses should always want to run it twice. They should offer
// and/or agree to run twice if it's an option."
// Horses ALWAYS accept and offer RIT — it reduces variance, which is optimal
// bankroll management. The only exception: if we have absolute nuts on the river
// with no possible redraws, running once maximizes EV (but even then, we accept
// because the EV difference is tiny and variance reduction matters more).
/**
 * Returns the horse's run-it-twice preference.
 * @param {string} [situation] - 'offer' (we're asked) | 'decide' (we choose to offer) | undefined
 * @returns {{ wantsRunItTwice: boolean, reason: string }}
 */
function getRunItTwicePreference(situation) {
    // Horses ALWAYS want to run it twice — both offering and accepting
    return {
        wantsRunItTwice: true,
        reason: 'Variance reduction is always +EV for bankroll management. Always run it twice.'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 32: PER-SESSION CHIP-LEAK FORENSICS
// ─────────────────────────────────────────────────────────────────────────────
function recordChipLeak(horseId, tableId, pattern, absLossBB) {
    if (!horseId || !tableId || absLossBB <= 0) return;
    const key = `${horseId}:${tableId}`;
    if (!chipLeakMap.has(key)) chipLeakMap.set(key, { leaks: new Map() });
    const m = chipLeakMap.get(key).leaks;
    const cur = m.get(pattern) || 0;
    m.set(pattern, cur + absLossBB);
}
function getChipLeakBoosts(horseId, tableId) {
    const key = `${horseId}:${tableId}`;
    const m = chipLeakMap.get(key);
    const leaks = m?.leaks;
    if (!leaks) return { oopBoost: 0, multiwayBoost: 0, drawBoost: 0, donkBoost: 0 };
    return {
        oopBoost: (leaks.get('oop_check_call') || 0) > 20 ? 8 : 0,
        multiwayBoost: (leaks.get('multiway_topset') || 0) > 20 ? 8 : 0,
        drawBoost: (leaks.get('missed_draw_overbet') || 0) > 20 ? 8 : 0,
        donkBoost: (leaks.get('donk_overcall') || 0) > 20 ? 8 : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

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
    if (typeof equity !== 'number' || isNaN(equity)) equity = 0; // Bug #56: guard non-numeric equity
    if (typeof toCall !== 'number' || isNaN(toCall)) toCall = 0;
    if (typeof potSize !== 'number' || isNaN(potSize)) potSize = 0;
    if (toCall <= 0 || !isIP) return { action: 'none', reason: 'not_a_donk' };
    if (potSize <= 0) return { action: 'none', reason: 'no_pot' };
    const donkFraction = toCall / potSize;
    // Only applies to genuine donk-bets (< 80% pot, opponent leading OOP)
    if (donkFraction > 0.8) return { action: 'none', reason: 'not_a_probe_donk' };
    if (equity >= 65) {
        return { action: 'raise', reason: `Donk into strong equity (${equity.toFixed(0)}) — raise to deny blocker bluffs` };
    }
    // BUG #27 FIX: Fold threshold must scale with donk bet size.
    // Small donks (< 35% pot) give excellent pot odds (~0.26) — need only ~26% equity.
    // Medium donks (35-60% pot) need ~0.35 equity.
    // Large donks (60-80% pot) need ~0.43 equity.
    // Old code used fixed equity < 38, folding profitable calls vs small donks.
    const foldEquityThreshold = donkFraction >= 0.60 ? 45
        : donkFraction >= 0.35 ? 38
        : 28; // Small donk = call very wide
    if (equity < foldEquityThreshold) {
        return { action: 'fold', reason: `Thin-value donk likely ahead (equity=${equity.toFixed(0)} < ${foldEquityThreshold} for ${Math.round(donkFraction * 100)}%pot donk)` };
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
            .maybeSingle();
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
        // If the horse lost a huge pot (>40BB), track who won it.
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

        if (adv) {
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

            // --- BUG #37 FIX: Record hand history for Advanced opponent reads ---
            // recordHandHistory was NEVER called, so getOpponentRead always returned null.
            // This made the entire exploit pipeline (identifyLeak, getExploitAdjustedAction)
            // and opponent-aware bet sizing dead code. Now each hand records what each opponent
            // did (bluff, value bet, or fold) so opponent profiles build over time.
            if (adv.recordHandHistory) {
                const opponentsForHistory = (handData.players || []).filter(op =>
                    String(op.id || op.playerId) !== pid
                );
                for (const opp of opponentsForHistory) {
                    const oppId = String(opp.id || opp.playerId);
                    const oppWasBetting = opp.lastAction === 'raise' || opp.lastAction === 'bet';
                    const oppWon = winners.some(w => String(w.playerId) === oppId);
                    adv.recordHandHistory(pid, oppId, {
                        wasBluff: oppWasBetting && !oppWon,
                        wasValue: oppWasBetting && oppWon,
                        folded: opp.folded === true
                    });
                }
            }
        }

        // --- BUG #37b FIX: Record grudges for rivalry dynamics ---
        // recordGrudge was never called, so grudge-based targeting was dead code.
        // When a horse loses a big pot (20+ BB), record a grudge against the winner.
        if (!won && chipDelta < 0 && adv?.recordGrudge) {
            const bbLostForGrudge = Math.abs(chipDelta) / bb;
            for (const w of winners) {
                adv.recordGrudge(pid, String(w.playerId), bbLostForGrudge);
            }
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
        if (adv && adv.getOpponentRead) {
            const opponents = (handData.players || []).filter(op => String(op.id) !== pid && !op.folded);
            for (const opp of opponents.slice(0, 2)) {
                const read = adv.getOpponentRead(pid, String(opp.id));
                if (read && read.handsObserved >= 10) {
                    saveOpponentRead(pid, String(opp.id), read).catch(() => { });
                }
            }
        }

        // ═══ OPPONENT SESSION MODEL — Record all opponent actions from this hand ═══
        // This feeds the real-time session reads used in turn/river heuristic decisions.
        const allOpponents = (handData.players || []).filter(op => String(op.id || op.playerId) !== pid);
        for (const opp of allOpponents) {
            const oppId = String(opp.id || opp.playerId);

            // Record their last known action on each street
            if (opp.actions && Array.isArray(opp.actions)) {
                for (const act of opp.actions) {
                    recordOpponentAction(oppId, act.street || 'unknown', act.type || act.action || 'unknown', {
                        betToPot: act.amount && act.potSize ? act.amount / Math.max(1, act.potSize) : undefined,
                        handStrength: act.handStrength || undefined,
                        position: opp.position || undefined,
                    });
                }
            } else if (opp.lastAction) {
                // Fallback: record at least the final action
                recordOpponentAction(oppId, handData.lastStreet || 'river', opp.lastAction, {
                    betToPot: opp.lastBetSize && handData.potSize ? opp.lastBetSize / Math.max(1, handData.potSize) : undefined,
                    position: opp.position || undefined,
                });
            }

            // Record showdown if opponent showed cards
            if (opp.showedCards || opp.handStrength !== undefined) {
                const oppWon = winners.some(w => String(w.playerId) === oppId);
                const oppStr = opp.handStrength || 0;
                const wasBluff = oppStr < 30 && (opp.lastAction === 'raise' || opp.lastAction === 'bet' || opp.lastAction === 'all_in');
                recordOpponentShowdown(oppId, oppWon, oppStr, wasBluff);
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

            // ─── MODULE 25: MIN-RAISE HARASSMENT DETECTOR ───
            if (opp.lastAction === 'raise') {
                const isWinner = (handData.result?.winners || []).some(w => String(w.playerId) === oppId);
                recordRaiseSize(oppId, oppBet, handData.prevBet || 0, isWinner);
            }

            // ─── MODULE 26: SQUEEZE OVERKILL DETECTOR ───
            if (opp.lastAction === 'raise' && (handData.actionCount || 0) >= 3) {
                recordSqueeze(oppId, oppBet, handData.potSize || 0);
            }

            // ─── MODULE 28: COLD-CALL TRAP DETECTOR — preflop cold-calls ───
            if (opp.lastAction === 'call' && (handData.street === 'preflop' || !handData.street)) {
                recordColdCall(oppId);
            }
            // ─── MODULE 28: COLD-CALL TRAP DETECTOR — postflop barrels ───
            // Phase 47 FIX: Was checking opp.lastAction === 'bet' (opponent's bets) but should
            // track when the HORSE barrels against a cold-caller and whether the cold-caller folded.
            // Old code made every active cold-caller always flagged as a trap (oppFolded always false
            // because the opponent just bet, so winRate=0 < 0.35 → isTrap always true).
            if (handData.street && handData.street !== 'preflop') {
                const heroBet = player.lastAction === 'bet' || player.lastAction === 'raise';
                if (heroBet) {
                    recordBarrelVsColdCall(oppId, opp.folded || false);
                }
            }

            // ─── MODULE 30: ANGLE-SHOOT TIMING DETECTOR ───
            if (opp.actionTimeMs) {
                recordActionTiming(oppId, opp.actionTimeMs);
            }

            // ─── MODULE 31: RIT REFUSAL TRACKER ───
            if (handData.ritOffered && opp.ritResponse !== undefined) {
                recordRITResponse(oppId, opp.ritResponse);
            }
        }
    }

    // ─── MODULE 20: TABLE IMAGE EXPOSURE MONITOR ───
    // Track showdown counts for every horse at this table
    for (const p of (handData.players || handData.result?.players || [])) {
        const pid = String(p.id || p.playerId || '');
        if (!pid || !(await isHorse(pid))) continue;
        const showedCards = p.showedCards === true || p.showdown === true;
        recordTableImageHand(pid, handData.tableId, showedCards);

        // ─── MODULE 32: PER-SESSION CHIP-LEAK FORENSICS ───
        if (p.chipDelta < 0 && handData.tableId) {
            const absLossBB = Math.abs(p.chipDelta) / (handData.bigBlind || 2);
            // Classify leak pattern
            let pattern = 'general_loss';
            if ((handData.numPlayers || 2) >= 4 && p.invested > 0) pattern = 'multiway_topset';
            else if (handData.street === 'flop' && !p.hasInitiative && p.invested > 0) pattern = 'oop_check_call';
            else if (handData.street === 'river' && p.invested > 0) pattern = 'river_call_loss';

            recordChipLeak(pid, handData.tableId, pattern, absLossBB);
        }
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
                .maybeSingle();

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

    // Running very hot (> 10BB/100): tighten up, protect winnings
    if (winRate > 0.10) {
        return { rangeAdjust: -5, aggressionAdjust: -3, reason: 'protecting_profit' };
    }
    // Running warm (5-10BB/100): slightly tighter
    if (winRate > 0.05) {
        return { rangeAdjust: -2, aggressionAdjust: -1, reason: 'slight_lock_up' };
    }
    // Running cold (-5 to -10BB/100): loosen slightly to find spots
    if (winRate < -0.05 && winRate >= -0.10) {
        return { rangeAdjust: 3, aggressionAdjust: 2, reason: 'finding_spots' };
    }
    // Running very cold (< -10BB/100): getting exploited, adjust
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

    // Cash game: 25 buy-in rule (100BB per buy-in)
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
    if (!bb || bb <= 0) bb = 2; // Guard against zero/missing bb
    const stackBB = currentStack / bb;

    // Hard limit: never rebuy more than 3 times
    if (buyInsUsed >= 3) {
        return { shouldRebuy: false, reason: 'max_buyins_reached', amount: 0 };
    }

    // Short stacked (< 30BB): rebuy to max
    if (stackBB < 30) {
        // Rebuy amount: top up to 100BB or table average, whichever is higher
        const targetStack = Math.max(100 * bb, tableAvgStack);
        const rebuyAmount = targetStack - currentStack;
        return { shouldRebuy: true, reason: 'short_stacked', amount: Math.round(rebuyAmount) };
    }

    // Medium stack (30-60BB): rebuy if table average is much higher
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

        // Only save hands with significant action (>10BB pot)
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
        const depths = ['100BB'];

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
// PERSISTENT OPPONENT JOURNAL SYSTEM (Phase 14)
// ═══════════════════════════════════════════════════════════════════════════
// Every horse maintains a persistent "dossier" on each opponent across sessions.
// When a horse encounters a familiar opponent at a new table, it instantly
// pre-seeds the liveObserver with historical data — giving a massive head start
// instead of observing from zero.
//
// Supabase table schema (run once):
// CREATE TABLE horse_opponent_journals (
//   horse_id UUID NOT NULL,
//   opponent_id TEXT NOT NULL,
//   vpip_count INT DEFAULT 0,
//   pfr_count INT DEFAULT 0,
//   three_bet_count INT DEFAULT 0,
//   three_bet_opportunity INT DEFAULT 0,
//   four_bet_count INT DEFAULT 0,
//   fold_to_three_bet INT DEFAULT 0,
//   faced_three_bet INT DEFAULT 0,
//   cold_call_count INT DEFAULT 0,
//   limp_count INT DEFAULT 0,
//   steal_attempt_count INT DEFAULT 0,
//   steal_opportunity INT DEFAULT 0,
//   fold_to_steal INT DEFAULT 0,
//   cbet_count INT DEFAULT 0,
//   cbet_opportunity INT DEFAULT 0,
//   fold_to_cbet INT DEFAULT 0,
//   faced_cbet INT DEFAULT 0,
//   second_barrel_count INT DEFAULT 0,
//   second_barrel_opportunity INT DEFAULT 0,
//   third_barrel_count INT DEFAULT 0,
//   third_barrel_opportunity INT DEFAULT 0,
//   check_raise_count INT DEFAULT 0,
//   donk_bet_count INT DEFAULT 0,
//   probe_bet_count INT DEFAULT 0,
//   fold_to_raise INT DEFAULT 0,
//   faced_raise INT DEFAULT 0,
//   total_bets INT DEFAULT 0,
//   total_calls INT DEFAULT 0,
//   total_checks INT DEFAULT 0,
//   total_folds INT DEFAULT 0,
//   went_to_showdown INT DEFAULT 0,
//   won_at_showdown INT DEFAULT 0,
//   showdown_bluffs INT DEFAULT 0,
//   overbet_count INT DEFAULT 0,
//   total_decision_time_ms BIGINT DEFAULT 0,
//   decision_count INT DEFAULT 0,
//   snap_action_count INT DEFAULT 0,
//   long_tank_count INT DEFAULT 0,
//   hands_observed INT DEFAULT 0,
//   actions_by_position JSONB DEFAULT '{}',
//   avg_flop_bet FLOAT DEFAULT 0,
//   avg_turn_bet FLOAT DEFAULT 0,
//   avg_river_bet FLOAT DEFAULT 0,
//   avg_preflop_raise FLOAT DEFAULT 0,
//   updated_at TIMESTAMPTZ DEFAULT now(),
//   PRIMARY KEY (horse_id, opponent_id)
// );
// CREATE INDEX idx_hoj_opponent ON horse_opponent_journals(opponent_id);
// CREATE INDEX idx_hoj_updated ON horse_opponent_journals(updated_at);
// ═══════════════════════════════════════════════════════════════════════════

// In-memory cache: horseId:oppId → { loaded: true, timestamp }
// Prevents redundant Supabase fetches for the same opponent within a session.
const _journalCache = new Map();
const JOURNAL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const JOURNAL_PERSIST_INTERVAL = 15; // Persist every 15 hands observed

/**
 * Persist a LiveProfile to Supabase as an opponent journal entry.
 * Called on table leave and periodically during play.
 * Uses upsert with additive merging — new observations ADD to existing counts.
 * @param {string} horseId
 * @param {string} opponentId
 * @param {Object} profile - LiveProfile from liveObserver
 * @returns {Promise<boolean>}
 */
async function persistOpponentJournal(horseId, opponentId, profile) {
    try {
        if (!profile || profile.handsObserved < 5) return false; // Don't save tiny samples

        const sb = getSupabase();
        if (!sb) return false;

        // Compute average bet sizes from arrays
        const avgFlop = profile.flopBetSizes.length > 0
            ? profile.flopBetSizes.reduce((a, b) => a + b, 0) / profile.flopBetSizes.length : 0;
        const avgTurn = profile.turnBetSizes.length > 0
            ? profile.turnBetSizes.reduce((a, b) => a + b, 0) / profile.turnBetSizes.length : 0;
        const avgRiver = profile.riverBetSizes.length > 0
            ? profile.riverBetSizes.reduce((a, b) => a + b, 0) / profile.riverBetSizes.length : 0;
        const avgPFR = profile.preflopRaiseSizes.length > 0
            ? profile.preflopRaiseSizes.reduce((a, b) => a + b, 0) / profile.preflopRaiseSizes.length : 0;

        // First, fetch existing journal to merge additively
        const { data: existing } = await sb
            .from('horse_opponent_journals')
            .select('hands_observed, session_count')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .maybeSingle();

        // If existing, we ADD our new observations to the existing counts.
        // If not, we insert fresh.
        const payload = {
            horse_id: horseId,
            opponent_id: opponentId,
            vpip_count: profile.vpipCount,
            pfr_count: profile.pfrCount,
            three_bet_count: profile.threeBetCount,
            three_bet_opportunity: profile.threeBetOpportunity,
            four_bet_count: profile.fourBetCount,
            fold_to_three_bet: profile.foldToThreeBet,
            faced_three_bet: profile.facedThreeBet,
            cold_call_count: profile.coldCallCount,
            limp_count: profile.limpCount,
            steal_attempt_count: profile.stealAttemptCount,
            steal_opportunity: profile.stealOpportunity || 0,
            fold_to_steal: profile.foldToSteal,
            cbet_count: profile.cBetCount,
            cbet_opportunity: profile.cBetOpportunity,
            fold_to_cbet: profile.foldToCBet,
            faced_cbet: profile.facedCBet,
            second_barrel_count: profile.secondBarrelCount,
            second_barrel_opportunity: profile.secondBarrelOpportunity,
            third_barrel_count: profile.thirdBarrelCount,
            third_barrel_opportunity: profile.thirdBarrelOpportunity,
            check_raise_count: profile.checkRaiseCount,
            donk_bet_count: profile.donkBetCount,
            probe_bet_count: profile.probeBetCount,
            fold_to_raise: profile.foldToRaise,
            faced_raise: profile.facedRaise,
            total_bets: profile.totalBets,
            total_calls: profile.totalCalls,
            total_checks: profile.totalChecks,
            total_folds: profile.totalFolds,
            went_to_showdown: profile.wentToShowdown,
            won_at_showdown: profile.wonAtShowdown,
            showdown_bluffs: profile.showdownBluffs,
            overbet_count: profile.overbetCount,
            total_decision_time_ms: profile.totalDecisionTimeMs,
            decision_count: profile.decisionCount,
            snap_action_count: profile.snapActionCount,
            long_tank_count: profile.longTankCount,
            hands_observed: profile.handsObserved,
            actions_by_position: profile.actionsByPosition || {},
            avg_flop_bet: avgFlop,
            avg_turn_bet: avgTurn,
            avg_river_bet: avgRiver,
            avg_preflop_raise: avgPFR,
            updated_at: new Date().toISOString(),
        };

        // PHASE 15: Compute player type from current data for persistence
        const totalActions = profile.totalBets + profile.totalCalls + profile.totalChecks + profile.totalFolds;
        let detectedType = 'unknown';
        if (profile.handsObserved >= 10 && totalActions > 0) {
            const v = profile.vpipCount / profile.handsObserved;
            const p_ = profile.pfrCount / profile.handsObserved;
            const af = totalActions > 0 ? profile.totalBets / totalActions : 0.33;
            if (v < 0.18 && p_ < 0.12) detectedType = 'nit';
            else if (v < 0.24 && p_ >= 0.16 && af >= 0.38) detectedType = 'TAG';
            else if (v >= 0.28 && p_ >= 0.20 && af >= 0.42) detectedType = 'LAG';
            else if (v >= 0.35 && af < 0.28) detectedType = 'calling_station';
            else if (v >= 0.45 && af >= 0.48) detectedType = 'maniac';
            else detectedType = 'balanced';
        }
        payload.last_known_player_type = detectedType;

        // PHASE 15: Increment session_count on conflict (existing row = new session seeing same opponent)
        const { error } = await sb.from('horse_opponent_journals').upsert(payload, {
            onConflict: 'horse_id,opponent_id'
        });

        // After upsert, increment session_count if this is an existing record
        if (!error && existing && existing.hands_observed > 0) {
            await sb.from('horse_opponent_journals')
                .update({ session_count: (existing.session_count || 1) + 1 })
                .eq('horse_id', horseId)
                .eq('opponent_id', opponentId)
                .catch(() => {}); // Fire-and-forget session count bump
        }

        if (!error) {
            console.log(`[HorseBrain] 📓 JOURNAL SAVED: ${horseId.substring(0, 8)} → ${opponentId.substring(0, 8)} (${profile.handsObserved} hands, type=${detectedType})`);
            // Mark in cache as recently persisted
            _journalCache.set(`${horseId}:${opponentId}`, { loaded: true, persisted: Date.now(), timestamp: Date.now() });
        }
        return !error;
    } catch (err) {
        console.warn(`[HorseBrain] 📓 Journal persist error: ${err.message}`);
        return false;
    }
}

/**
 * Load an opponent journal from Supabase and pre-seed the liveObserver.
 * Called when a horse encounters an opponent it has history with.
 * @param {string} horseId
 * @param {string} tableId
 * @param {string} opponentId
 * @returns {Promise<boolean>} true if journal was loaded and applied
 */
async function loadOpponentJournal(horseId, tableId, opponentId) {
    try {
        // Check cache first — don't re-fetch within TTL
        const cacheKey = `${horseId}:${opponentId}`;
        const cached = _journalCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < JOURNAL_CACHE_TTL) {
            return cached.loaded;
        }

        const sb = getSupabase();
        if (!sb) {
            _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
            return false;
        }

        const { data } = await sb
            .from('horse_opponent_journals')
            .select('*')
            .eq('horse_id', horseId)
            .eq('opponent_id', opponentId)
            .maybeSingle();

        if (!data || data.hands_observed < 5) {
            _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
            return false;
        }

        // Pre-seed the liveObserver with historical data
        const observer = _getTableObserver(horseId, tableId);
        if (!observer.opponents.has(opponentId)) {
            observer.opponents.set(opponentId, _createLiveProfile());
        }
        const profile = observer.opponents.get(opponentId);

        // Only seed if the live profile has fewer observations than the journal
        // (don't overwrite fresh live data with stale historical data)
        if (profile.handsObserved < data.hands_observed) {
            _applyJournalToProfile(profile, data);
            console.log(`[HorseBrain] 📓 JOURNAL LOADED: ${horseId.substring(0, 8)} recognized ${opponentId.substring(0, 8)} (${data.hands_observed} historical hands)`);
        }

        _journalCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
        return true;
    } catch (err) {
        console.warn(`[HorseBrain] 📓 Journal load error: ${err.message}`);
        _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
        return false;
    }
}

/**
 * Persist ALL opponent profiles for a horse leaving a table.
 * Called by clearTableLiveObservers when a table closes.
 * @param {string} horseId
 * @param {string} tableId
 */
async function persistTableJournals(horseId, tableId) {
    try {
        if (!liveObserver.has(horseId)) return;
        const horseTables = liveObserver.get(horseId);
        if (!horseTables.has(tableId)) return;

        const observer = horseTables.get(tableId);
        const promises = [];
        for (const [oppId, profile] of observer.opponents) {
            if (profile.handsObserved >= 5) {
                promises.push(persistOpponentJournal(horseId, oppId, profile));
            }
        }
        if (promises.length > 0) {
            await Promise.allSettled(promises);
            console.log(`[HorseBrain] 📓 JOURNALS BATCH SAVED: ${horseId.substring(0, 8)} table=${tableId.substring(0, 8)} (${promises.length} opponents)`);
        }
    } catch (err) {
        console.warn(`[HorseBrain] 📓 Batch journal error: ${err.message}`);
    }
}

/**
 * Load journals for ALL non-horse players at a table.
 * Called during observeNewHand when a new hand starts.
 * Runs async (fire-and-forget) to avoid blocking the game.
 *
 * PHASE 15: Uses BATCH SELECT — one query per horse instead of N queries per opponent.
 * This reduces Supabase round-trips from (H × O) to H queries.
 *
 * @param {string} tableId
 * @param {Array<string>} playerIds - All player IDs at the table
 * @param {Array<string>} horseIds - Horse IDs at the table
 */
async function loadTableJournals(tableId, playerIds, horseIds) {
    try {
        const horseSet = new Set(horseIds);
        const opponents = playerIds.filter(id => !horseSet.has(String(id))).map(String);
        if (opponents.length === 0) return;

        const sb = getSupabase();
        if (!sb) return;

        // For each horse, batch-fetch ALL opponent journals in one query
        const batchPromises = horseIds.map(async (horseId) => {
            // Filter to only opponents not already in cache
            const uncachedOpps = opponents.filter(oppId => {
                const cacheKey = `${horseId}:${oppId}`;
                const cached = _journalCache.get(cacheKey);
                return !cached || (Date.now() - cached.timestamp) >= JOURNAL_CACHE_TTL;
            });
            if (uncachedOpps.length === 0) return;

            try {
                // BATCH SELECT: one query for all opponents of this horse
                const { data: journals, error } = await sb
                    .from('horse_opponent_journals')
                    .select('*')
                    .eq('horse_id', horseId)
                    .in('opponent_id', uncachedOpps);

                if (error) {
                    console.warn(`[HorseBrain] 📓 Batch journal query error: ${error.message}`);
                    return;
                }

                // Index results by opponent_id for fast lookup
                const journalMap = new Map();
                if (journals) {
                    for (const j of journals) journalMap.set(j.opponent_id, j);
                }

                // Apply each journal to the live observer
                for (const oppId of uncachedOpps) {
                    const cacheKey = `${horseId}:${oppId}`;
                    const data = journalMap.get(oppId);

                    if (!data || data.hands_observed < 5) {
                        _journalCache.set(cacheKey, { loaded: false, timestamp: Date.now() });
                        continue;
                    }

                    // Pre-seed the liveObserver with historical data
                    const observer = _getTableObserver(horseId, tableId);
                    if (!observer.opponents.has(oppId)) {
                        observer.opponents.set(oppId, _createLiveProfile());
                    }
                    const profile = observer.opponents.get(oppId);

                    // Only seed if live profile has fewer observations
                    if (profile.handsObserved < data.hands_observed) {
                        _applyJournalToProfile(profile, data);
                    }

                    _journalCache.set(cacheKey, { loaded: true, timestamp: Date.now() });
                }

                if (journalMap.size > 0) {
                    console.log(`[HorseBrain] 📓 BATCH JOURNAL LOAD: ${horseId.substring(0, 8)} loaded ${journalMap.size}/${uncachedOpps.length} opponents at table ${tableId.substring(0, 8)}`);
                }
            } catch (err) {
                console.warn(`[HorseBrain] 📓 Batch journal error for horse ${horseId.substring(0, 8)}: ${err.message}`);
            }
        });

        await Promise.allSettled(batchPromises);
    } catch (err) {
        console.warn(`[HorseBrain] 📓 Table journal load error: ${err.message}`);
    }
}

/**
 * PHASE 15: Shared helper — applies journal data to a LiveProfile.
 * Used by both loadOpponentJournal (single) and loadTableJournals (batch).
 * Also applies data decay: older journals get reduced confidence.
 */
function _applyJournalToProfile(profile, data) {
    if (!profile || typeof profile !== 'object') return; // Bug #55: guard null profile
    if (!data || typeof data !== 'object') return; // Bug #55: guard null data
    profile.handsObserved = data.hands_observed;
    profile.vpipCount = data.vpip_count;
    profile.pfrCount = data.pfr_count;
    profile.threeBetCount = data.three_bet_count;
    profile.threeBetOpportunity = data.three_bet_opportunity;
    profile.fourBetCount = data.four_bet_count || 0;
    profile.foldToThreeBet = data.fold_to_three_bet;
    profile.facedThreeBet = data.faced_three_bet;
    profile.coldCallCount = data.cold_call_count;
    profile.limpCount = data.limp_count;
    profile.stealAttemptCount = data.steal_attempt_count;
    profile.stealOpportunity = data.steal_opportunity || 0;
    profile.foldToSteal = data.fold_to_steal;
    profile.cBetCount = data.cbet_count;
    profile.cBetOpportunity = data.cbet_opportunity;
    profile.foldToCBet = data.fold_to_cbet;
    profile.facedCBet = data.faced_cbet;
    profile.secondBarrelCount = data.second_barrel_count;
    profile.secondBarrelOpportunity = data.second_barrel_opportunity;
    profile.thirdBarrelCount = data.third_barrel_count;
    profile.thirdBarrelOpportunity = data.third_barrel_opportunity;
    profile.checkRaiseCount = data.check_raise_count;
    profile.donkBetCount = data.donk_bet_count;
    profile.probeBetCount = data.probe_bet_count;
    profile.foldToRaise = data.fold_to_raise;
    profile.facedRaise = data.faced_raise;
    profile.totalBets = data.total_bets;
    profile.totalCalls = data.total_calls;
    profile.totalChecks = data.total_checks;
    profile.totalFolds = data.total_folds;
    profile.wentToShowdown = data.went_to_showdown;
    profile.wonAtShowdown = data.won_at_showdown;
    profile.showdownBluffs = data.showdown_bluffs;
    profile.overbetCount = data.overbet_count;
    profile.totalDecisionTimeMs = data.total_decision_time_ms;
    profile.decisionCount = data.decision_count;
    profile.snapActionCount = data.snap_action_count;
    profile.longTankCount = data.long_tank_count;
    profile.actionsByPosition = data.actions_by_position || {};

    // Reconstruct synthetic sizing arrays from journal averages
    if (data.avg_flop_bet > 0) profile.flopBetSizes = [data.avg_flop_bet, data.avg_flop_bet, data.avg_flop_bet];
    if (data.avg_turn_bet > 0) profile.turnBetSizes = [data.avg_turn_bet, data.avg_turn_bet, data.avg_turn_bet];
    if (data.avg_river_bet > 0) profile.riverBetSizes = [data.avg_river_bet, data.avg_river_bet, data.avg_river_bet];
    if (data.avg_preflop_raise > 0) profile.preflopRaiseSizes = [data.avg_preflop_raise, data.avg_preflop_raise, data.avg_preflop_raise];

    // Mark as journal-seeded for confidence calculation
    profile._journalSeeded = true;
    profile._journalHands = data.hands_observed;
    profile._journalSessionCount = data.session_count || 1;

    // PHASE 15: Data decay — older journals get a staleness penalty
    // Fresh data (updated within 24h) = full weight. 7+ days old = decayed.
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
    const ageHours = (Date.now() - updatedAt) / (1000 * 60 * 60);
    // Decay curve: 1.0 at 0h, ~0.85 at 24h, ~0.60 at 72h, ~0.30 at 168h (1 week)
    profile._journalFreshness = Math.max(0.15, Math.exp(-ageHours / 120));

    console.log(`[HorseBrain] 📓 JOURNAL APPLIED: ${data.opponent_id?.substring(0, 8)} (${data.hands_observed}h, ${data.session_count || 1} sessions, freshness=${Math.round(profile._journalFreshness * 100)}%)`);
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
    makeFlopHeuristicDecision,
    makeTurnRiverHeuristicDecision,
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
    getGeometricSizing,
    handleDonkBet,
    applyTiltDegradation,
    analyzeBoardEvolution,
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

    // ─── PHASE 4: DEEP-SESSION FINANCIAL EXPLOITATION DEFENSE ───
    minRaiseMap, recordRaiseSize, isMinRaiser, // Module 25
    squeezeMap, recordSqueeze, isSqueezeOverkill, // Module 26
    detectReverseImplied, // Module 27
    coldCallMap, recordColdCall, recordBarrelVsColdCall, isColdCallTrap, // Module 28
    detectBombPotOrStraddle, // Module 29
    angleShootMap, recordActionTiming, detectAngleShoot, // Module 30
    ritRefusalMap, recordRITResponse, isRITRefuser, // Module 31
    getRunItTwicePreference, // Bug #81: Horse always runs it twice
    chipLeakMap, recordChipLeak, getChipLeakBoosts, // Module 32

    // Opponent Session Model (Phase 3: Real-time adaptation)
    recordOpponentAction,
    recordOpponentShowdown,
    getOpponentSessionRead,
    opponentSessionModel,  // Exposed for testing/debugging

    // ═══ ALWAYS-ON LIVE OBSERVER SYSTEM ═══
    observeNewHand,
    observeAction,
    observeShowdown,
    getLiveRead,
    clearLiveObserver,
    clearTableLiveObservers,
    cleanupLiveObservers,
    liveObserver,  // Exposed for testing/debugging
    isHorseSync,
    getHorseIdsAtTable,

    // ═══ PERSISTENT OPPONENT JOURNAL SYSTEM ═══
    persistOpponentJournal,
    loadOpponentJournal,
    persistTableJournals,
    loadTableJournals,
    _journalCache,  // Exposed for testing/debugging
    _applyJournalToProfile, // Shared journal → profile seeder

    // Exposed for testing (Phase 47g)
    getOOPDecisionMatrix,
    makePLOFallbackDecision,

    // Exposed for testing (Phase 48) — PLO internals
    evaluatePLOMadeHand,
    classifyPLOPreflop,
    enhancePLOPreflopScore,
    getPLOPreflopAction,
    countStraightOuts,
    countFlushOuts,
    getPLOSPRZone,
    analyzePLOBoardTexture,
    evaluatePLO8Low,
    // Exposed for testing (Phase 100) — PLO postflop internals
    getPLOReverseImpliedOdds,
    getPLOBlockers,
    getPLOEquityRealization,
    detectScareCard,

    // Exposed for testing (Phase 101) — PLO deep dive fixes
    getPLOMultiStreetPlan,
    countBackdoorOuts,
    getPLOTurnBarrel,
    getPLOImpliedOdds,
    getPLOCBetStrategy,
    getPLOShowdownValue,
    getPLOBlindDefense,

    // Exposed for testing (Phase 48c) — wrap draw detector
    detectPLOWrapDraw,

    // Exposed for testing (Phase 69-77)
    applyExploitIntensifier,
    recordStreetAction,
    getStreetMemory,
};

