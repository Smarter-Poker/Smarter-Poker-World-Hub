#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 DETERMINISTIC CACHE RE-SEEDER
 * ═══════════════════════════════════════════════════════════════════════════
 * Replaces all Grok-generated questions in training_question_cache with
 * 100% solver-backed questions from DeterministicGTOEngine.
 *
 * Usage:
 *   node scripts/reseed-deterministic-cache.js --dry-run              # Validate only, no DB writes
 *   node scripts/reseed-deterministic-cache.js --live                 # Full re-seed (all 79 games)
 *   node scripts/reseed-deterministic-cache.js --live --game=cash-001 # Single game test
 *   node scripts/reseed-deterministic-cache.js --verify --game=cash-001 # Verify a game in DB
 *
 * Coverage:
 *   79 PioSOLVER/CHART games → DETERMINISTIC_SOLVER questions
 *   21 SCENARIO/psychology games → SKIPPED (no solver equivalent)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── ENVIRONMENT SETUP ─────────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_LIVE = args.includes('--live');
const IS_VERIFY = args.includes('--verify');
const SINGLE_GAME = args.find(a => a.startsWith('--game='))?.split('=')[1];
const VERBOSE = args.includes('--verbose');

if (!IS_DRY_RUN && !IS_LIVE && !IS_VERIFY) {
    console.error('Usage: node reseed-deterministic-cache.js [--dry-run|--live|--verify] [--game=cash-001]');
    process.exit(1);
}

// ─── SUPABASE HTTP CLIENT ──────────────────────────────────────────────────
const HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
};

async function supabaseQuery(table, params = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
}

async function supabaseUpsert(table, rows) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=question_id`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upsert failed ${res.status}: ${text.substring(0, 200)}`);
    }
    return true;
}

async function supabaseDelete(table, filter) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: HEADERS,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete failed ${res.status}: ${text.substring(0, 200)}`);
    }
    return true;
}

async function supabaseCount(table, filter = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${filter}&limit=1`;
    const res = await fetch(url, {
        headers: { ...HEADERS, 'Prefer': 'count=exact' },
    });
    const range = res.headers.get('content-range');
    return range ? parseInt(range.split('/')[1]) || 0 : 0;
}

// ─── CARD / HAND UTILITIES ────────────────────────────────────────────────
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i]));

const ACTION_LABELS = {
    'c': 'Check', 'x': 'Check', 'f': 'Fold',
    'b16': 'Bet 16%', 'b20': 'Bet 20%', 'b25': 'Bet 25%',
    'b33': 'Bet 33%', 'b40': 'Bet 40%', 'b45': 'Bet 45%',
    'b50': 'Bet 50%', 'b55': 'Bet 55%', 'b60': 'Bet 60%',
    'b66': 'Bet 67%', 'b75': 'Bet 75%', 'b80': 'Bet 80%',
    'b100': 'Bet Pot', 'b125': 'Bet 125%', 'b150': 'Overbet 150%',
    'b200': 'Overbet 200%', 'b300': 'Overbet 300%',
    'allin': 'All-In', 'r': 'Raise',
    'push': 'Push All-In', 'fold': 'Fold',
};

const VILLAIN_MAP = {
    'BTN': 'BB', 'SB': 'BB', 'BB': 'BTN', 'UTG': 'BB',
    'MP': 'BB', 'CO': 'BTN', 'HJ': 'CO', 'UTG+1': 'BB', 'MP+1': 'BB',
};

const POT_BY_STREET = { 'preflop': 2.5, 'flop': 6, 'turn': 14, 'river': 30 };

function getActionLabel(code, pot = 6) {
    if (ACTION_LABELS[code]) return ACTION_LABELS[code];
    const bm = code.match(/^b(\d+)$/);
    if (bm) return `Bet ${bm[1]}% pot`;
    const rm = code.match(/^r(\d+)$/);
    if (rm) return `Raise ${rm[1]}%`;
    return code.toUpperCase();
}

function parseHandToCards(hand) {
    if (!hand || hand.length < 2) return ['As', 'Ks'];
    const r1 = hand[0], r2 = hand[1];
    const suffix = hand.length >= 3 ? hand[2] : '';
    if (r1 === r2) return [`${r1}h`, `${r2}s`];
    if (suffix === 's') return [`${r1}s`, `${r2}s`];
    return [`${r1}s`, `${r2}h`];
}

function parseBoardFromHash(hash) {
    if (!hash) return [];
    const parts = hash.split('_');
    const boardStr = parts[parts.length - 1];
    if (!boardStr || boardStr.length < 4) return [];
    const cards = [];
    for (let i = 0; i < boardStr.length; i += 2) {
        if (i + 1 < boardStr.length) {
            const card = boardStr.substring(i, i + 2);
            if (/^[2-9TJQKA][shdc]$/i.test(card)) cards.push(card);
        }
    }
    return cards;
}

function extractPositionFromHash(hash) {
    if (!hash) return 'BTN';
    const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ'];
    for (const part of hash.split('_')) {
        if (POSITIONS.includes(part.toUpperCase())) return part.toUpperCase();
    }
    return 'BTN';
}

function hashSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function matchesHandClass(hand, handClass) {
    if (!handClass || handClass === 'all') return true;
    if (!hand || hand.length < 2) return false;
    const r1 = hand[0], r2 = hand[1];
    const isSuited = hand.length >= 3 && hand[2] === 's';
    const v1 = RANK_VAL[r1] ?? 0, v2 = RANK_VAL[r2] ?? 0;
    switch (handClass) {
        case 'pocket_pairs': return r1 === r2;
        case 'suited_connectors': return isSuited && Math.abs(v1 - v2) === 1;
        case 'broadways': return v1 >= 8 && v2 >= 8 && r1 !== r2;
        case 'suited_aces': return isSuited && (r1 === 'A' || r2 === 'A') && r1 !== r2;
        default: return true;
    }
}

// ─── GAME CONFIG (from PIOQueryService) ──────────────────────────────────
const GAME_CONFIGS = {
    'cash-001': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-002': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-003': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-004': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-005': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-006': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-007': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-008': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-009': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 200 },
    'cash-010': { sourceOfTruth: 'ICMIZER', pioStackDepth: 40 },
    'cash-011': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-012': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'cash-013': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-014': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-015': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-016': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-017': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-018': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-019': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-020': { sourceOfTruth: 'SCENARIO' }, // SKIP
    'cash-021': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-022': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-023': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-024': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-025': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'mtt-001': { sourceOfTruth: 'ICMIZER', pioStackDepth: 10 },
    'mtt-002': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 20 },
    'mtt-003': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 },
    'mtt-004': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 },
    'mtt-005': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 },
    'mtt-006': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 20 },
    'mtt-007': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 100 },
    'mtt-008': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 10 },
    'mtt-009': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 20 },
    'mtt-010': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 40 },
    'mtt-011': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 },
    'mtt-012': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 },
    'mtt-013': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 },
    'mtt-014': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_3max_chipev', pioStackDepth: 20 },
    'mtt-015': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_hu_chipev', pioStackDepth: 40 },
    'mtt-016': { sourceOfTruth: 'ICMIZER', pioStackDepth: 10 },
    'mtt-017': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 20 },
    'mtt-018': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 40 },
    'mtt-019': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 },
    'mtt-020': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 },
    'mtt-021': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 100 },
    'mtt-022': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_icm', pioStackDepth: 40 },
    'mtt-023': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 },
    'mtt-024': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_chipev', pioStackDepth: 80 },
    'mtt-025': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_6max_chipev', pioStackDepth: 100 },
    'spins-001': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    'spins-002': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 20 },
    'spins-003': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    'spins-004': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_chipev', pioStackDepth: 10 },
    'spins-005': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 25 },
    'spins-006': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 20 },
    'spins-007': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_icm', pioStackDepth: 10 },
    'spins-008': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_hu_chipev', pioStackDepth: 20 },
    'spins-009': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_icm', pioStackDepth: 25 },
    'spins-010': { sourceOfTruth: 'PioSOLVER', pioGameType: 'spin_3max_chipev', pioStackDepth: 25 },
    // Psychology — SKIP (20 games)
    'psy-001': { sourceOfTruth: 'SCENARIO' }, 'psy-002': { sourceOfTruth: 'SCENARIO' },
    'psy-003': { sourceOfTruth: 'SCENARIO' }, 'psy-004': { sourceOfTruth: 'SCENARIO' },
    'psy-005': { sourceOfTruth: 'SCENARIO' }, 'psy-006': { sourceOfTruth: 'SCENARIO' },
    'psy-007': { sourceOfTruth: 'SCENARIO' }, 'psy-008': { sourceOfTruth: 'SCENARIO' },
    'psy-009': { sourceOfTruth: 'SCENARIO' }, 'psy-010': { sourceOfTruth: 'SCENARIO' },
    'psy-011': { sourceOfTruth: 'SCENARIO' }, 'psy-012': { sourceOfTruth: 'SCENARIO' },
    'psy-013': { sourceOfTruth: 'SCENARIO' }, 'psy-014': { sourceOfTruth: 'SCENARIO' },
    'psy-015': { sourceOfTruth: 'SCENARIO' }, 'psy-016': { sourceOfTruth: 'SCENARIO' },
    'psy-017': { sourceOfTruth: 'SCENARIO' }, 'psy-018': { sourceOfTruth: 'SCENARIO' },
    'psy-019': { sourceOfTruth: 'SCENARIO' }, 'psy-020': { sourceOfTruth: 'SCENARIO' },
    // Advanced
    'adv-001': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-002': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-003': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-004': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-005': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-006': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-007': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-008': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-009': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-010': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-011': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-012': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-013': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-014': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-015': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-016': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-017': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-018': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-019': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'adv-020': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
};

// ─── QUESTION GENERATORS ──────────────────────────────────────────────────

/** Get the target street for a given training level */
function getStreetForLevel(level) {
    if (level <= 3) return 'flop';
    if (level <= 7) return 'turn';
    return 'river';
}

/** Determine engine_type for a game based on its source */
function getEngineType(gameId, config) {
    if (config.sourceOfTruth === 'ICMIZER') return 'CHART';
    if (config.sourceOfTruth === 'SCENARIO') return 'SCENARIO';
    return 'PIO';
}

/**
 * Build a training question from a solved_spots_gold row.
 * This is the core deterministic logic — mirrors DeterministicGTOEngine.buildQuestionFromScenario
 */
function buildQuestionFromScenario(scenario, config, level, questionIndex) {
    const sm = scenario.strategy_matrix || {};
    const actions = sm.actions || [];
    const frequencies = sm.frequencies || {};
    const handEVs = sm.hand_evs || {};

    if (actions.length === 0) return null;

    // Pick a hero hand from the frequency matrix that has at least one non-zero frequency
    const sampleAction = actions.find(a => frequencies[a]) || actions[0];
    const handFreqs = frequencies[sampleAction] || {};
    // CRITICAL: Only use hands that have at least one non-zero frequency in any action
    // Some hands are not in the solver's range for a specific spot (e.g., Q8o on 3h7c7s)
    // and will have 0% frequency for ALL actions — skip those hands entirely
    let allHands = Object.keys(handFreqs).filter(h => {
        if (!h || h.length < 2) return false;
        // Check that this hand has a non-zero frequency in at least one action
        const hasNonZero = actions.some(a => {
            const freq = frequencies[a]?.[h];
            return typeof freq === 'number' && freq > 0;
        });
        return hasNonZero;
    });
    if (allHands.length === 0) return null;

    // Deterministic hand selection via hash
    const seed = hashSeed(`${scenario.scenario_hash || scenario.id}_${questionIndex}`);
    const heroHand = allHands[seed % allHands.length];

    // Compute per-action frequencies for this hand
    const handActions = {};
    const validActions = [];
    let optimalAction = null;
    let maxFreq = -1;

    actions.forEach(action => {
        const freq = frequencies[action]?.[heroHand];
        if (freq !== undefined && freq >= 0 && freq <= 1) {
            handActions[action] = freq;
            validActions.push(action);
            if (freq > maxFreq) { maxFreq = freq; optimalAction = action; }
        }
    });

    if (!optimalAction || validActions.length === 0) return null;

    // Build GTO frequencies (0-100 scale)
    const gtoFrequencies = {};
    validActions.forEach(a => {
        gtoFrequencies[a] = Math.round((handActions[a] || 0) * 100);
    });

    // Normalize to 100
    const total = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
    if (total > 0 && total !== 100) {
        const keys = Object.keys(gtoFrequencies);
        keys.forEach(k => { gtoFrequencies[k] = Math.round(gtoFrequencies[k] * 100 / total); });
        // Fix rounding drift
        const newTotal = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
        if (newTotal !== 100) gtoFrequencies[optimalAction] = (gtoFrequencies[optimalAction] || 0) + (100 - newTotal);
    }

    // EV data
    const heroHandEV = handEVs[heroHand] || 0;
    const allEVs = Object.values(handEVs).filter(v => typeof v === 'number');
    const maxHandEV = allEVs.length > 0 ? Math.max(...allEVs) : heroHandEV;
    const actionEVs = {};
    validActions.forEach(a => { actionEVs[a] = heroHandEV * (handActions[a] || 0); });

    // Board and position
    const board = parseBoardFromHash(scenario.scenario_hash);
    const heroPosition = extractPositionFromHash(scenario.scenario_hash);
    const villainPosition = VILLAIN_MAP[heroPosition] || 'BB';
    const estimatedPot = POT_BY_STREET[scenario.street] || 6;

    // Build up to 4 options from valid actions
    const options = validActions.slice(0, 4).map(action => ({
        id: action,
        text: getActionLabel(action, estimatedPot),
        frequency: gtoFrequencies[action],
    }));

    // Ensure at least 2 options
    if (options.length < 2) {
        const fillers = ['f', 'c', 'b33', 'allin'].filter(a => !validActions.includes(a));
        while (options.length < 2 && fillers.length > 0) {
            const filler = fillers.shift();
            options.push({ id: filler, text: ACTION_LABELS[filler] || filler, frequency: 0 });
            gtoFrequencies[filler] = 0;
        }
    }

    const isMixedStrategy = maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1;

    // Build explanation (deterministic, no AI)
    const freqPct = (maxFreq * 100).toFixed(0);
    let explanation;
    if (maxFreq >= 0.95) {
        explanation = `GTO solver: Pure ${getActionLabel(optimalAction)} (${freqPct}%). ${heroHand} has a clear optimal line on ${scenario.street}.`;
    } else {
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .map(a => `${getActionLabel(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');
        explanation = `GTO solver mixes: ${mixedParts}. Primary line is ${getActionLabel(optimalAction)} at ${freqPct}%.${maxFreq < 0.6 ? ' This is a close GTO spot.' : ''}`;
    }

    return {
        id: `pio_${scenario.id}_${heroHand}_${questionIndex}`,
        type: 'PIO',
        source: 'DETERMINISTIC_SOLVER',
        scenario: {
            board: board.join(' '),
            street: scenario.street,
            stackDepth: scenario.stack_depth,
            gameType: scenario.game_type,
            scenarioHash: scenario.scenario_hash,
            heroHand,
            heroPosition,
            heroStack: scenario.stack_depth || 100,
            pot: estimatedPot,
            villainPosition,
            villainStack: scenario.stack_depth || 100,
            action: scenario.street !== 'preflop' ? 'Villain checks' : '',
            isMixedStrategy,
        },
        heroCards: parseHandToCards(heroHand),
        boardCards: board,
        question: `You hold ${heroHand} on the ${scenario.street}. Board: ${board.join(' ')}. What is the GTO play?`,
        options,
        correctAnswer: optimalAction,
        correctAnswerText: getActionLabel(optimalAction, estimatedPot),
        frequencies: handActions,
        gtoFrequencies,
        rawFrequencies: frequencies,
        evData: {
            heroHandEV,
            optimalEV: maxHandEV,
            handEVs,
            heroHand,
            actionEVs,
        },
        explanation,
        difficulty: level,
        heroHand,
    };
}

/**
 * Generate questions from solved_spots_gold for a PIO game at a given level
 */
async function generatePIOBatch(gameId, config, level, count = 25) {
    const street = getStreetForLevel(level);
    const isRiver = street === 'river';

    // Fetch a pool of scenarios
    const poolSize = Math.min(count * 4, 100);
    let scenarios;

    // River data is sparse for some game_types — use flexible stack depth fallback
    const tryFetch = async (extraFilter = '') => {
        return supabaseQuery('solved_spots_gold',
            `?game_type=eq.${config.pioGameType}&stack_depth=eq.${config.pioStackDepth}&street=eq.${street}&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix${extraFilter}&limit=${poolSize}`
        );
    };

    try {
        const data = await tryFetch();
        if (!data || data.length === 0) throw new Error('empty');
        scenarios = data;
    } catch {
        // Fallback 1: try without stack depth constraint (especially needed for river)
        try {
            const data = await supabaseQuery('solved_spots_gold',
                `?game_type=eq.${config.pioGameType}&street=eq.${street}&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix&limit=${poolSize}`
            );
            if (!data || data.length === 0) throw new Error('empty');
            scenarios = data;
        } catch {
            // Fallback 2: for river-level games, use turn data (still postflop, still valid GTO training)
            // River data may not exist for all game_types
            if (isRiver) {
                try {
                    const data = await supabaseQuery('solved_spots_gold',
                        `?game_type=eq.${config.pioGameType}&street=eq.turn&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix&limit=${poolSize}`
                    );
                    if (!data || data.length === 0) throw new Error('empty');
                    scenarios = data;
                } catch (e3) {
                    // Final fallback: try postflop_complete for any street
                    try {
                        const data = await supabaseQuery('solved_spots_gold',
                            `?game_type=eq.postflop_complete&street=eq.river&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix&limit=${poolSize}`
                        );
                        if (!data || data.length === 0) return { questions: [], error: `No river data for ${config.pioGameType}` };
                        scenarios = data;
                    } catch (e4) {
                        return { questions: [], error: e4.message };
                    }
                }
            } else {
                return { questions: [], error: `No scenarios for ${config.pioGameType} ${street}` };
            }
        }
    }

    if (!scenarios || scenarios.length === 0) {
        return { questions: [], error: `No scenarios for ${config.pioGameType} ${street} ${config.pioStackDepth}bb` };
    }

    const questions = [];
    const usedIds = new Set();

    for (let i = 0; i < count && i < scenarios.length * 6; i++) {
        const scenario = scenarios[i % scenarios.length];
        const q = buildQuestionFromScenario(scenario, config, level, i);
        if (q && !usedIds.has(q.id)) {
            questions.push(q);
            usedIds.add(q.id);
        }
    }

    return { questions, error: null };
}

/**
 * Generate questions from memory_charts_gold for ICMIZER/CHART games
 */
async function generateChartBatch(gameId, config, level, count = 25) {
    let charts;
    try {
        // Try to get charts at or near the configured stack depth first
        const targetDepth = config.pioStackDepth || 10;
        const data = await supabaseQuery('memory_charts_gold',
            `?stack_depth=eq.${targetDepth}&limit=50`
        );
        if (data && data.length > 0) {
            charts = data;
        } else {
            throw new Error('specific depth empty');
        }
    } catch {
        try {
            // Fallback: use all available charts (memory_charts_gold has limited stack depths)
            charts = await supabaseQuery('memory_charts_gold', '?limit=50');
        } catch (e2) {
            return { questions: [], error: e2.message };
        }
    }

    if (!charts || charts.length === 0) {
        return { questions: [], error: 'No chart data available' };
    }

    const questions = [];
    for (let i = 0; i < count; i++) {
        const chart = charts[i % charts.length];
        const handMatrix = chart.hand_matrix || {};
        const hands = Object.keys(handMatrix);
        if (hands.length === 0) continue;

        const seed = hashSeed(`${chart.chart_id || chart.id}_${i}_${level}`);
        const heroHand = hands[seed % hands.length];
        const handData = handMatrix[heroHand];
        const pushFreq = handData?.push || 0;
        const correctAction = pushFreq > 0.5 ? 'push' : 'fold';

        const gtoFrequencies = {
            push: Math.round(pushFreq * 100),
            fold: Math.round((1 - pushFreq) * 100),
        };
        // Normalize
        const fsum = gtoFrequencies.push + gtoFrequencies.fold;
        if (fsum !== 100) gtoFrequencies[correctAction] += (100 - fsum);

        const stackDepth = chart.stack_depth || config.pioStackDepth || 10;
        const heroPos = chart.hero_position || 'BTN';

        questions.push({
            id: `chart_${chart.chart_id || chart.id}_${heroHand}_${i}`,
            type: 'CHART',
            source: 'DETERMINISTIC_SOLVER',
            scenario: {
                stackDepth,
                heroPosition: heroPos,
                heroStack: stackDepth,
                villainPosition: 'BB',
                villainStack: stackDepth,
                pot: 1.5,
                board: '',
                street: 'preflop',
                action: chart.villain_action || 'Folded to you',
                heroHand,
            },
            heroCards: parseHandToCards(heroHand),
            boardCards: [],
            question: `${heroPos} with ${heroHand} at ${stackDepth}BB. ${chart.villain_action || 'Folded to you'}. Push or Fold?`,
            options: [
                { id: 'push', text: 'Push All-In', frequency: gtoFrequencies.push },
                { id: 'fold', text: 'Fold', frequency: gtoFrequencies.fold },
            ],
            correctAnswer: correctAction,
            correctAnswerText: correctAction === 'push' ? 'Push All-In' : 'Fold',
            frequencies: { push: pushFreq, fold: 1 - pushFreq },
            gtoFrequencies,
            evData: {
                heroHandEV: pushFreq,
                optimalEV: Math.max(pushFreq, 1 - pushFreq),
                handEVs: {},
                heroHand,
            },
            explanation: correctAction === 'push'
                ? `ICM chart: ${heroHand} is a ${(pushFreq * 100).toFixed(0)}% push from ${heroPos} at ${stackDepth}BB. Push. The hand has sufficient equity and fold equity.`
                : `ICM chart: ${heroHand} only pushes ${(pushFreq * 100).toFixed(0)}% from ${heroPos} at ${stackDepth}BB. This is a fold.`,
            difficulty: level,
            heroHand,
        });
    }

    return { questions, error: null };
}

// ─── QUALITY GATE ─────────────────────────────────────────────────────────

function validateQuestion(q, gameId, level) {
    const errors = [];

    if (!q || typeof q !== 'object') return ['Question is null/invalid'];
    if (!q.id) errors.push('Missing id');
    if (!q.source) errors.push('Missing source');
    if (q.source !== 'DETERMINISTIC_SOLVER') errors.push(`Wrong source: ${q.source}`);
    if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`Not enough options: ${q.options?.length}`);
    if (!q.correctAnswer) errors.push('Missing correctAnswer');

    const optionIds = (q.options || []).map(o => o.id);
    if (!optionIds.includes(q.correctAnswer)) errors.push(`correctAnswer '${q.correctAnswer}' not in options [${optionIds.join(', ')}]`);

    if (!q.gtoFrequencies || Object.keys(q.gtoFrequencies).length < 2) {
        errors.push('Missing or sparse gtoFrequencies');
    } else {
        const freqSum = Object.values(q.gtoFrequencies).reduce((s, v) => s + v, 0);
        if (freqSum < 95 || freqSum > 105) errors.push(`gtoFrequencies sum is ${freqSum} (expected ~100)`);
    }

    if (!Array.isArray(q.heroCards) || q.heroCards.length < 2) errors.push('Missing/invalid heroCards');

    // For postflop questions, board is required
    const isPostflop = ['flop', 'turn', 'river'].includes(q.scenario?.street);
    if (isPostflop && (!Array.isArray(q.boardCards) || q.boardCards.length < 3)) {
        errors.push(`Postflop question missing boardCards (${JSON.stringify(q.boardCards)})`);
    }

    if (!q.explanation || q.explanation.length < 10) errors.push('Missing/short explanation');

    // Verify correctAnswer has highest frequency
    const correctFreq = q.gtoFrequencies?.[q.correctAnswer] || 0;
    const maxFreq = Math.max(...Object.values(q.gtoFrequencies || {}));
    if (correctFreq < maxFreq * 0.5) {
        errors.push(`correctAnswer '${q.correctAnswer}' has freq ${correctFreq}% but max is ${maxFreq}%`);
    }

    return errors;
}

// ─── CACHE ROW BUILDER ────────────────────────────────────────────────────

/** Map any game_id/game_type to the DB-allowed enum values ('cash' | 'tournament') */
function getDbGameType(gameId) {
    if (gameId.startsWith('cash-')) return 'cash';
    // All other game types (mtt, spins, adv, psy) map to 'tournament' per DB check constraint
    return 'tournament';
}

function buildCacheRow(gameId, config, level, question) {
    return {
        // CRITICAL: question_id MUST be globally unique across all games+levels
        // Include gameId and level to prevent constraint conflicts when same scenario pool is reused
        question_id: `${gameId}_L${level}_${question.id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80)}`,
        game_id: gameId,
        engine_type: getEngineType(gameId, config),
        // DB CHECK constraint only allows 'cash' or 'tournament'
        game_type: getDbGameType(gameId),
        level,
        question_data: {
            ...question,
            // Ensure question_data.id also contains game+level for batch-preload lookups
            id: `${gameId}_L${level}_${question.id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80)}`,
        },
        generated_at: new Date().toISOString(),
        times_used: 0,
    };
}

// ─── MAIN SEEDER LOGIC ────────────────────────────────────────────────────

const QUESTIONS_PER_LEVEL = 25;
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

async function seedGame(gameId, config, options = {}) {
    const { dryRun = true } = options;
    const engineType = config.sourceOfTruth;

    if (engineType === 'SCENARIO') {
        return { gameId, skipped: true, reason: 'SCENARIO game (psychology) — no solver data' };
    }

    const gameResult = { gameId, engineType, levelResults: [], totalGenerated: 0, totalFailed: 0, errors: [] };

    for (const level of LEVELS) {
        let batchResult;
        if (engineType === 'PioSOLVER') {
            batchResult = await generatePIOBatch(gameId, config, level, QUESTIONS_PER_LEVEL);
        } else if (engineType === 'ICMIZER') {
            batchResult = await generateChartBatch(gameId, config, level, QUESTIONS_PER_LEVEL);
        } else {
            batchResult = { questions: [], error: `Unknown engine: ${engineType}` };
        }

        if (batchResult.error) {
            gameResult.errors.push(`L${level}: ${batchResult.error}`);
            gameResult.levelResults.push({ level, generated: 0, passed: 0, failed: 0, error: batchResult.error });
            continue;
        }

        const passedQuestions = [];
        const levelErrors = [];

        for (const q of batchResult.questions) {
            const validationErrors = validateQuestion(q, gameId, level);
            if (validationErrors.length === 0) {
                passedQuestions.push(q);
            } else {
                levelErrors.push({ questionId: q.id, errors: validationErrors });
                if (VERBOSE) console.warn(`    ⚠️ Q ${q.id} FAILED: ${validationErrors.join('; ')}`);
            }
        }

        if (passedQuestions.length === 0) {
            gameResult.errors.push(`L${level}: 0 questions passed quality gate`);
            gameResult.levelResults.push({ level, generated: batchResult.questions.length, passed: 0, failed: batchResult.questions.length, error: 'All failed quality gate' });
            continue;
        }

        // Upsert to DB if not dry-run
        if (!dryRun && passedQuestions.length > 0) {
            const rows = passedQuestions.map(q => buildCacheRow(gameId, config, level, q));
            try {
                await supabaseUpsert('training_question_cache', rows);
            } catch (e) {
                gameResult.errors.push(`L${level}: DB upsert failed: ${e.message}`);
                gameResult.levelResults.push({ level, generated: batchResult.questions.length, passed: passedQuestions.length, failed: levelErrors.length, error: `DB: ${e.message}` });
                continue;
            }
        }

        gameResult.totalGenerated += passedQuestions.length;
        gameResult.totalFailed += levelErrors.length;
        gameResult.levelResults.push({
            level,
            generated: batchResult.questions.length,
            passed: passedQuestions.length,
            failed: levelErrors.length,
            sampleQ: VERBOSE ? passedQuestions[0] : null,
        });
    }

    return gameResult;
}

// ─── VERIFY MODE ──────────────────────────────────────────────────────────

async function verifyGame(gameId) {
    console.log(`\n🔍 Verifying ${gameId} in training_question_cache...`);
    for (const level of LEVELS) {
        const count = await supabaseCount('training_question_cache', `&game_id=eq.${gameId}&level=eq.${level}`);

        // Check source of questions
        const sample = await supabaseQuery('training_question_cache',
            `?game_id=eq.${gameId}&level=eq.${level}&limit=1`
        );
        const src = sample[0]?.question_data?.source || '?';
        const marker = src === 'DETERMINISTIC_SOLVER' ? '✅' : '⚠️';
        console.log(`  L${level}: ${count} questions | source: ${marker} ${src}`);
    }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────

async function main() {
    const startTime = Date.now();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🎯 DETERMINISTIC CACHE RE-SEEDER`);
    console.log(`   Mode: ${IS_DRY_RUN ? '🔍 DRY RUN (no DB writes)' : IS_VERIFY ? '✅ VERIFY' : '🚀 LIVE'}`);
    if (SINGLE_GAME) console.log(`   Game: ${SINGLE_GAME}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (IS_VERIFY) {
        const gameId = SINGLE_GAME;
        if (!gameId) { console.error('--verify requires --game=<gameId>'); process.exit(1); }
        await verifyGame(gameId);
        return;
    }

    const gameIds = SINGLE_GAME
        ? [SINGLE_GAME]
        : Object.keys(GAME_CONFIGS);

    const summary = {
        totalGames: 0,
        skipped: 0,
        success: 0,
        failed: 0,
        totalQuestions: 0,
        failedGames: [],
        gamesWithErrors: [],
    };

    for (const gameId of gameIds) {
        const config = GAME_CONFIGS[gameId];
        if (!config) { console.warn(`⚠️  Unknown game: ${gameId}`); continue; }

        const prefix = config.sourceOfTruth === 'SCENARIO' ? '⏭' : '🎮';
        process.stdout.write(`${prefix} ${gameId.padEnd(12)} `);

        const result = await seedGame(gameId, config, { dryRun: IS_DRY_RUN });

        if (result.skipped) {
            console.log(`SKIP (${result.reason})`);
            summary.skipped++;
            continue;
        }

        summary.totalGames++;
        const hasErrors = result.errors.length > 0;

        if (result.totalGenerated === 0 && !SINGLE_GAME) {
            console.log(`❌ FAILED — ${result.errors.join('; ')}`);
            summary.failed++;
            summary.failedGames.push(gameId);
        } else {
            const qmark = IS_DRY_RUN ? '(dry)' : '→ DB';
            console.log(`✅ ${result.totalGenerated} questions ${qmark} | ${result.totalFailed} failed QG${hasErrors ? ' | ⚠️ ' + result.errors[0] : ''}`);
            summary.success++;
            summary.totalQuestions += result.totalGenerated;
            if (hasErrors) summary.gamesWithErrors.push({ gameId, errors: result.errors });
        }

        // Verbose: print sample question from first level for single game mode
        if (SINGLE_GAME && result.levelResults.length > 0) {
            const firstLevel = result.levelResults.find(lr => lr.passed > 0);
            if (firstLevel) {
                console.log(`\n📋 SAMPLE QUESTION (Level ${firstLevel.level}):`);
                // Re-generate for display
                let batchResult;
                if (config.sourceOfTruth === 'PioSOLVER') {
                    batchResult = await generatePIOBatch(gameId, config, firstLevel.level, 1);
                } else {
                    batchResult = await generateChartBatch(gameId, config, firstLevel.level, 1);
                }
                if (batchResult.questions.length > 0) {
                    const q = batchResult.questions[0];
                    console.log(`  ID:          ${q.id}`);
                    console.log(`  Source:      ${q.source}`);
                    console.log(`  Hero:        ${q.heroHand} (${q.heroCards?.join(', ')})`);
                    console.log(`  Board:       ${q.boardCards?.join(' ') || '(preflop)'}`);
                    console.log(`  Street:      ${q.scenario?.street}`);
                    console.log(`  Question:    ${q.question}`);
                    console.log(`  Options:     ${q.options?.map(o => `${o.id}:${o.text}`).join(' | ')}`);
                    console.log(`  ✅ Answer:   ${q.correctAnswer} (${q.correctAnswerText})`);
                    console.log(`  Frequencies: ${JSON.stringify(q.gtoFrequencies)}`);
                    console.log(`  EV data:     heroEV=${q.evData?.heroHandEV?.toFixed(3)}, optEV=${q.evData?.optimalEV?.toFixed(3)}`);
                    console.log(`  Explanation: ${q.explanation}`);

                    const vErrors = validateQuestion(q, gameId, firstLevel.level);
                    console.log(`\n  Quality Gate: ${vErrors.length === 0 ? '✅ ALL PASSED' : '❌ ' + vErrors.join('; ')}`);
                }
            }

            // Print all level results
            console.log('\n📊 Level Breakdown:');
            result.levelResults.forEach(lr => {
                const status = lr.error ? `❌ ${lr.error}` : `✅ ${lr.passed}/${lr.generated} passed`;
                console.log(`  L${lr.level} (${getStreetForLevel(lr.level).padEnd(5)}): ${status}`);
            });
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`📊 SUMMARY (${elapsed}s)`);
    console.log(`   Games processed:   ${summary.totalGames}`);
    console.log(`   Games skipped:     ${summary.skipped} (SCENARIO/psychology)`);
    console.log(`   Games succeeded:   ${summary.success}`);
    console.log(`   Games failed:      ${summary.failed}`);
    console.log(`   Total questions:   ${summary.totalQuestions} ${IS_DRY_RUN ? '(would be written)' : 'written to DB'}`);

    if (summary.failedGames.length > 0) {
        console.log(`\n❌ Failed games: ${summary.failedGames.join(', ')}`);
    }
    if (summary.gamesWithErrors.length > 0) {
        console.log(`\n⚠️  Games with partial errors:`);
        summary.gamesWithErrors.forEach(g => {
            console.log(`   ${g.gameId}: ${g.errors.join('; ')}`);
        });
    }

    if (IS_DRY_RUN) {
        console.log('\n💡 This was a DRY RUN. No changes were made to the database.');
        console.log('   To run live: node scripts/reseed-deterministic-cache.js --live');
    } else {
        console.log('\n✅ Cache re-seeding complete!');
        console.log('   Run --verify --game=<gameId> to inspect results in DB.');
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('\n💥 FATAL ERROR:', err);
    process.exit(1);
});
