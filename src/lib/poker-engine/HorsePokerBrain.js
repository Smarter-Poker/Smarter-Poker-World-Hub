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
 * Varies by action type and horse personality.
 * @param {string} profileId - Horse profile UUID
 * @param {string} actionType - 'fold', 'check', 'call', 'raise', 'all_in'
 * @param {boolean} isPreflop - Whether it's preflop
 * @returns {number} Delay in ms (1500-6000)
 */
function getActionDelay(profileId, actionType, isPreflop = false) {
    const hash = getHash(profileId);

    // Base delay by action type
    const baseDelays = {
        'fold': [1000, 2500],
        'check': [800, 2000],
        'call': [1500, 3500],
        'raise': [2000, 5000],
        'bet': [2000, 4500],
        'all_in': [3000, 6000],
    };

    const [min, max] = baseDelays[actionType] || [1500, 3500];

    // Personality variation (fast player, slow player)
    const speedFactor = 0.7 + (hash % 60) / 100; // 0.7 to 1.3

    // Preflop is generally faster
    const streetFactor = isPreflop ? 0.7 : 1.0;

    // Random jitter ±30%
    const jitter = 0.7 + Math.random() * 0.6;

    const delay = (min + Math.random() * (max - min)) * speedFactor * streetFactor * jitter;
    return Math.round(Math.max(800, Math.min(7000, delay)));
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
// FALLBACK DECISION ENGINE
// Used when GTO solver data is unavailable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Make a heuristic-based decision when solver data is unavailable.
 * Uses preflop hand strength + position to make reasonable plays.
 * @param {string} profileId - Horse UUID
 * @param {Object} gameState - Adapted game state
 * @param {Array} legalActions - Legal actions from engine
 * @returns {Object} Decision { type, amount? }
 */
function makeFallbackDecision(profileId, gameState, legalActions) {
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
    if (street === 'river') {
        const riverStrat = getRiverStrategy(effectiveStrength, potOdds, canRaise, toCall > 0, aggressionBias);

        if (riverStrat.action === 'bet' && canRaise) {
            const sizeFrac = getOptimalBetSize(handEval.category, 'river', potSize, effectiveStrength < 20);
            const betSize = Math.round(potSize * sizeFrac);
            const amount = Math.max(raiseAction?.minAmount || 1, Math.min(betSize, raiseAction?.maxAmount || betSize));
            return { type: raiseAction.type, amount };
        }
        if (riverStrat.action === 'raise' && canRaise) {
            const raiseSize = Math.round(toCall * 2.5);
            const amount = Math.max(raiseAction?.minAmount || toCall * 2, Math.min(raiseSize, raiseAction?.maxAmount || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (riverStrat.action === 'call' && canCall) return { type: 'call' };
        if (riverStrat.action === 'fold') return canCheck ? { type: 'check' } : { type: 'fold' };
        return canCheck ? { type: 'check' } : { type: 'fold' };
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
            strength = boardHasTrip ? 55 : 65; // Set vs. trips
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
            if (Math.random() < 0.55 + aggressionBias / 40) {
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
        const fallback = makeFallbackDecision(profileId, adaptedState, legalActions);
        finalAction = fallback.type;
        finalAmount = fallback.amount;
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
    }

    // --- 6. VALIDATE AGAINST LEGAL ACTIONS ---
    const validAction = validateAndClamp(finalAction, finalAmount, legalActions);

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
    if (!adv) return;

    const winners = handData.result.winners || [];
    const players = handData.result.players || handData.players || [];

    for (const player of players) {
        const pid = String(player.id || player.playerId);
        const isAI = await isHorse(pid);
        if (!isAI) continue;

        const won = winners.some(w => String(w.playerId) === pid);
        const chipDelta = player.chipDelta || 0;

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

        // --- Emit table chat (#10) ---
        try {
            const personality = await getPersonalityModule();
            if (personality?.getTableChat) {
                const situation = won ? (chipDelta > bb * 20 ? 'bigpot' : 'win') : 'lose';
                const msg = personality.getTableChat(pid, situation);
                if (msg) {
                    // Emit chat message to the table (picked up by RealtimeSync)
                    chatMessages.push({ playerId: pid, message: msg, timestamp: Date.now() });
                    // Prune old chat messages
                    if (chatMessages.length > 50) chatMessages.splice(0, chatMessages.length - 50);
                }
            }
        } catch (_) { }
    }
}

/**
 * Check if a horse is allowed to rebuy based on maxBuyins stop-loss
 * @param {string} tableId 
 * @param {string} playerId 
 * @returns {Promise<boolean>}
 */
async function canRebuy(tableId, playerId) {
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
                const rebuyInfo = getDynamicRebuyStrategy(playerId, currentStack, bb, session.buyinsUsed, avgStack);

                if (rebuyInfo.shouldRebuy && await canRebuy(tableId, playerId)) {
                    console.log(`[HorseBrain] 🔄 Dynamic rebuy for ${playerId.substring(0, 8)}: ${rebuyInfo.reason}, amount: ${rebuyInfo.amount}`);
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
};
