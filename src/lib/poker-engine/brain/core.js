/**
 * brain/core.js — Shared utilities used by all variant brains
 * Card parsing, position mapping, hash, timing, Supabase, horse identity
 */

const { createClient } = require('@supabase/supabase-js');

// ═══════════════════════════════════════════════════════════════════════════
// CARD FORMAT BRIDGE
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];
const RANK_ORDER = '23456789TJQKA';
const RANK_NAMES = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

function cardIntToString(card) {
    if (typeof card === 'string') return card;
    if (typeof card === 'object' && card !== null) {
        let rankChar, suitChar;
        if (typeof card.rank === 'number') {
            rankChar = RANKS[card.rank - 2] || RANKS[card.rank];
        } else if (typeof card.rank === 'string') {
            rankChar = card.rank.length === 1 ? card.rank : card.rank[0];
        }
        if (typeof card.suit === 'number') {
            suitChar = SUITS[card.suit] || 'c';
        } else if (typeof card.suit === 'string') {
            suitChar = card.suit.length === 1 ? card.suit : card.suit[0];
        }
        if (rankChar && suitChar) return rankChar + suitChar;
    }
    if (typeof card === 'number') {
        const rank = Math.floor(card / 4);
        const suit = card % 4;
        if (RANKS[rank] && SUITS[suit]) return RANKS[rank] + SUITS[suit];
    }
    return '2c';
}

function cardsToStrings(cardInts) {
    if (!cardInts || !Array.isArray(cardInts)) return [];
    return cardInts.map(cardIntToString);
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION LABEL MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const POSITION_MAP = {
    'btn': 'BTN', 'sb': 'SB', 'bb': 'BB',
    'utg': 'UTG', 'utg+1': 'UTG+1', 'utg+2': 'UTG+1',
    'mp': 'MP', 'lj': 'LJ', 'hj': 'HJ', 'co': 'CO'
};

function mapPosition(enginePosition) {
    if (!enginePosition) return 'MP';
    const lower = String(enginePosition).toLowerCase();
    return POSITION_MAP[lower] || 'MP';
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND STRENGTH EVALUATOR (Holdem preflop)
// ═══════════════════════════════════════════════════════════════════════════

const PREFLOP_STRENGTH = {};
const PREMIUM_HANDS = ['AA', 'KK', 'QQ', 'AKs', 'JJ', 'AKo', 'AQs', 'TT', 'AQo', 'AJs'];
const STRONG_HANDS = ['99', 'ATs', 'AJo', 'KQs', '88', 'KJs', 'ATo', 'KQo', 'A9s', 'KTs', 'QJs', '77'];
const PLAYABLE_HANDS = ['A8s', 'KJo', 'QTs', 'A9o', 'JTs', '66', 'K9s', 'A7s', 'QJo', 'A5s', 'A8o', 'Q9s', 'A6s', 'KTo', '55', 'T9s', 'A4s', 'J9s'];
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
    if (highR === lowR) return `${highRank}${lowRank}`;
    const suited = s1 === s2 ? 's' : 'o';
    return `${highRank}${lowRank}${suited}`;
}

function getPreflopStrength(handStr) {
    return PREFLOP_STRENGTH[handStr] || 20;
}

// ═══════════════════════════════════════════════════════════════════════════
// HORSE IDENTITY CACHE
// ═══════════════════════════════════════════════════════════════════════════

let _horseIds = null;
let _horseCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

// evolutionTracker is shared state — imported by session-analytics
const evolutionTracker = new Map();

async function loadHorseIds() {
    const now = Date.now();
    if (_horseIds && now - _horseCacheTime < CACHE_TTL_MS) {
        return _horseIds;
    }
    const sb = getSupabase();
    if (!sb) {
        console.warn('[HorseBrain] No Supabase client - cannot load horse IDs');
        return new Set();
    }
    try {
        const { data, error } = await sb.from('profiles').select('id').eq('is_horse', true);
        if (error) {
            console.warn('[HorseBrain] Error loading horse IDs:', error.message);
            return _horseIds || new Set();
        }
        _horseIds = new Set((data || []).map(p => p.id));
        _horseCacheTime = now;
        console.debug(`[HorseBrain] Cached ${_horseIds.size} horse profile IDs`);
        // Load skill evolution
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
            console.debug(`[HorseBrain] Loaded previous skill evolution for ${loaded} horses`);
        }
        return _horseIds;
    } catch (err) {
        console.warn('[HorseBrain] Cache load failed:', err.message);
        return _horseIds || new Set();
    }
}

async function isHorse(playerId) {
    const horses = await loadHorseIds();
    return horses.has(String(playerId));
}

function isHorseSync(playerId) {
    return _horseIds ? _horseIds.has(String(playerId)) : false;
}

function getHorseIdsAtTable(players) {
    if (!_horseIds || !players) return [];
    return players.map(p => String(p.id || p.playerId || p)).filter(id => _horseIds.has(id));
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING & HASH
// ═══════════════════════════════════════════════════════════════════════════

function getHash(profileId) {
    if (!profileId) return 0;
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function getActionDelay(profileId, actionType, isPreflop = false) {
    const hash = getHash(profileId);
    const baseMin = 1500;
    const baseMax = 4500;
    const speedFactor = 0.8 + (hash % 40) / 100;
    const streetFactor = isPreflop ? 0.6 : 1.1;
    const rng = Math.random();
    let finalDelay;
    if (rng > 0.95) {
        finalDelay = 5000 + (Math.random() * 3000);
    } else if (rng < 0.10) {
        finalDelay = 500 + (Math.random() * 700);
    } else {
        finalDelay = (baseMin + Math.random() * (baseMax - baseMin)) * speedFactor * streetFactor;
    }
    return Math.round(Math.max(800, Math.min(8000, finalDelay)));
}

// ═══════════════════════════════════════════════════════════════════════════
// ESM MODULE BRIDGE (GTO, Personality, Advanced)
// ═══════════════════════════════════════════════════════════════════════════

let _gtoModule = null;
let _personalityModule = null;
let _advancedModule = null;

function resolveESM(mod) {
    if (!mod) return null;
    if (mod.default && typeof mod.default === 'object') return mod.default;
    return mod;
}

async function getGTOModule() {
    if (!_gtoModule) {
        try {
            const raw = await import('../../../content-engine/services/HorsePokerGTO.js');
            _gtoModule = resolveESM(raw);
        } catch (err) {
            console.warn('[HorseBrain] Failed to load HorsePokerGTO:', err.message);
        }
    }
    return _gtoModule;
}

async function getPersonalityModule() {
    if (!_personalityModule) {
        try {
            const raw = await import('../../../content-engine/services/HorsePokerPersonality.js');
            _personalityModule = resolveESM(raw);
        } catch (err) {
            console.warn('[HorseBrain] Failed to load HorsePokerPersonality:', err.message);
        }
    }
    return _personalityModule;
}

async function getAdvancedModule() {
    if (!_advancedModule) {
        try {
            const raw = await import('../../../content-engine/services/HorsePokerAdvanced.js');
            _advancedModule = resolveESM(raw);
        } catch (err) {
            console.warn('[HorseBrain] Failed to load HorsePokerAdvanced:', err.message);
        }
    }
    return _advancedModule;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLO CARD PARSING
// ═══════════════════════════════════════════════════════════════════════════

function parseCard(c) {
    if (!c || c.length < 2) return null;
    const rStr = c[0].toUpperCase();
    const suit = c[1].toLowerCase();
    const rank = RANK_ORDER.indexOf(rStr);
    return rank === -1 ? null : { rank, suit, str: c };
}

function parseCards(cards) {
    return (cards || []).map(parseCard).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STATE (Chat, Multi-table)
// ═══════════════════════════════════════════════════════════════════════════

const chatMessages = [];
const multiTableTracker = new Map();

module.exports = {
    // Constants
    RANKS, SUITS, RANK_ORDER, RANK_NAMES, PREFLOP_STRENGTH,

    // Card utilities
    cardIntToString, cardsToStrings, parseCard, parseCards,

    // Position
    mapPosition, POSITION_MAP,

    // Hand strength
    formatHandString, getPreflopStrength,

    // Horse identity
    getSupabase, loadHorseIds, isHorse, isHorseSync, getHorseIdsAtTable,

    // Hash & Timing
    getHash, getActionDelay,

    // ESM bridge
    resolveESM, getGTOModule, getPersonalityModule, getAdvancedModule,

    // Shared state
    chatMessages, multiTableTracker, evolutionTracker,
};
