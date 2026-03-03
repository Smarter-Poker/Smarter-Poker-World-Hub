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

function cardIntToString(cardInt) {
    const rank = Math.floor(cardInt / 4);
    const suit = cardInt % 4;
    return RANKS[rank] + SUITS[suit];
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
    const { handStr, position, street, potSize, toCall, stackBB } = gameState;
    const hash = getHash(profileId);

    // Get personality bias (tight/loose, passive/aggressive)
    const loosenessBias = (hash % 20) - 10; // -10 to +9
    const aggressionBias = ((hash >> 4) % 20) - 10;

    // Legal action types
    const canCheck = legalActions.some(a => a.type === 'check');
    const canCall = legalActions.some(a => a.type === 'call');
    const canRaise = legalActions.some(a => a.type === 'raise' || a.type === 'bet');
    const raiseAction = legalActions.find(a => a.type === 'raise' || a.type === 'bet');

    if (street === 'preflop') {
        const strength = getPreflopStrength(handStr) + loosenessBias;
        const positionBonus = { BTN: 15, CO: 10, HJ: 5, SB: 5, BB: 8, UTG: 0, MP: 3 };
        const adjustedStrength = strength + (positionBonus[position] || 0);

        // Push/fold mode for short stacks
        if (stackBB <= 12 && canRaise) {
            if (adjustedStrength >= 55) {
                return { type: 'all_in' };
            }
            return { type: 'fold' };
        }

        // Standard preflop
        if (adjustedStrength >= 80 && canRaise) {
            // Premium: raise
            const minRaise = raiseAction?.min || (toCall * 2);
            const size = Math.min(minRaise * (2.5 + Math.random()), raiseAction?.max || minRaise * 3);
            return { type: raiseAction.type, amount: Math.round(size) };
        }
        if (adjustedStrength >= 55) {
            // Playable: raise sometimes, call sometimes
            if (canRaise && Math.random() < 0.4 + aggressionBias / 30) {
                const minRaise = raiseAction?.min || (toCall * 2);
                return { type: raiseAction.type, amount: Math.round(minRaise * (2 + Math.random())) };
            }
            if (canCall) return { type: 'call' };
            if (canCheck) return { type: 'check' };
        }
        if (adjustedStrength >= 35 && toCall <= 2 && canCall) {
            // Marginal: limp/call small raises
            return canCheck ? { type: 'check' } : { type: 'call' };
        }
        // Trash: fold (or check if in BB)
        return canCheck ? { type: 'check' } : { type: 'fold' };
    }

    // --- POSTFLOP FALLBACK ---
    // Without hand evaluation, use pot odds and random aggression
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;
    const aggressionChance = 0.35 + aggressionBias / 50;

    if (canCheck && toCall === 0) {
        // No bet to face — bet or check
        if (canRaise && Math.random() < aggressionChance) {
            const betSize = Math.round(potSize * (0.33 + Math.random() * 0.67));
            const amount = Math.max(raiseAction?.min || 1, Math.min(betSize, raiseAction?.max || betSize));
            return { type: raiseAction.type, amount };
        }
        return { type: 'check' };
    }

    // Facing a bet
    if (potOdds < 0.25) {
        // Good odds — call or raise
        if (canRaise && Math.random() < aggressionChance * 0.5) {
            const raiseSize = Math.round(toCall * (2.2 + Math.random() * 1.5));
            const amount = Math.max(raiseAction?.min || toCall * 2, Math.min(raiseSize, raiseAction?.max || raiseSize));
            return { type: raiseAction.type, amount };
        }
        if (canCall) return { type: 'call' };
    }

    if (potOdds < 0.4 && canCall) {
        return Math.random() < 0.6 ? { type: 'call' } : { type: 'fold' };
    }

    // Bad odds — fold most of the time
    return canCheck ? { type: 'check' } : { type: 'fold' };
}

// ═══════════════════════════════════════════════════════════════════════════
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
        street: street.charAt(0).toUpperCase() + street.slice(1), // Capitalize for GTO
        position,
        stackBB,
        potSize,
        toCall,
        gameType: 'Cash',
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

    if (gtoDecision?.action) {
        // Map GTO action names to engine format
        const actionMap = { 'Raise': 'raise', 'Call': 'call', 'Fold': 'fold', 'Check': 'check', 'Bet': 'bet' };
        finalAction = actionMap[gtoDecision.action] || gtoDecision.action.toLowerCase();

        // Calculate sizing from GTO (sizing is a pot fraction)
        if ((finalAction === 'raise' || finalAction === 'bet') && gtoDecision.sizing) {
            finalAmount = Math.round(potSize * gtoDecision.sizing);
        }

        // Apply tilt overlay
        try {
            const adv = await getAdvancedModule();
            if (adv?.getTiltLevel) {
                const tiltLevel = adv.getTiltLevel(profileId);

                // Tilted horses make suboptimal plays
                if (tiltLevel >= 5 && adv.getImageAdjustedAction) {
                    const adjusted = adv.getImageAdjustedAction(profileId, finalAction, 0.5);
                    if (adjusted && adjusted !== finalAction) {
                        finalAction = adjusted;
                    }
                }
            }
        } catch (err) {
            // Tilt overlay is non-critical
        }
    }

    // --- 4. FALLBACK IF NO GTO ---
    if (!finalAction) {
        const fallback = makeFallbackDecision(profileId, adaptedState, legalActions);
        finalAction = fallback.type;
        finalAmount = fallback.amount;
    }

    // --- 5. VALIDATE AGAINST LEGAL ACTIONS ---
    const validAction = validateAndClamp(finalAction, finalAmount, legalActions);

    // --- 6. COMPUTE TIMING DELAY ---
    const delayMs = getActionDelay(profileId, validAction.type, street === 'preflop');

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
            const min = raiseAction.min || 0;
            const max = raiseAction.max || Infinity;

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
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Core
    isHorse,
    getDecision,
    loadHorseIds,

    // Helpers (exposed for testing)
    cardIntToString,
    cardsToStrings,
    mapPosition,
    formatHandString,
    getPreflopStrength,
    getActionDelay,
    validateAndClamp,
    makeFallbackDecision,
};
