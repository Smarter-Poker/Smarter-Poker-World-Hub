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
 *   84 PioSOLVER + 2 CHART games → DETERMINISTIC_SOLVER questions
 *   21 SCENARIO games + 2 local-range preflop games → SKIPPED
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── ENVIRONMENT SETUP ─────────────────────────────────────────────────────
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment (e.g. .env or .env.local).');
    process.exit(1);
}

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_LIVE = args.includes('--live');
const IS_VERIFY = args.includes('--verify');
const SINGLE_GAME = args.find(a => a.startsWith('--game='))?.split('=')[1];
const VERBOSE = args.includes('--verbose');
let enforceTrainingQuestionContract;
let enforceSolverClaimHonesty;
let selectTrustedLegacySolverMatrix;
let selectTrustedSolverMatrix;

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

function getActionLabel(code, pot = 6, solverChipUnits = false) {
    const bm = code.match(/^b(\d+)$/);
    if (bm) {
        const amount = Number(bm[1]);
        const pct = solverChipUnits ? Math.round((amount / pot) * 100) : amount;
        if (pct === 100) return 'Bet Pot';
        return pct > 100 ? `Overbet ${pct}%` : `Bet ${pct}%`;
    }
    const rm = code.match(/^r(\d+)$/);
    if (rm) {
        const amount = Number(rm[1]);
        if (solverChipUnits) {
            const bb = amount / 100;
            return `Raise To ${Number.isInteger(bb) ? bb : bb.toFixed(1)} BB`;
        }
        return `Raise ${amount}%`;
    }
    if (ACTION_LABELS[code]) return ACTION_LABELS[code];
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
    'cash-001': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100, pioStreet: 'preflop' },
    'cash-002': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-003': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-004': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-005': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-006': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-007': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-008': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100, pioStreet: 'preflop', pioSpotTypes: ['4bet'] },
    'cash-009': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 200 },
    'cash-010': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 40 },
    'cash-011': { sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100 },
    'cash-012': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100, pioStreet: 'river' },
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
    // Special games are part of the canonical 107-game catalog too. Keeping
    // them out of this map made the reseeder silently incapable of producing
    // cache rows for every secondary Training surface.
    'tournament-prep': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 40 },
    'final-table-sim': { sourceOfTruth: 'PioSOLVER', pioGameType: 'mtt_9max_icm', pioStackDepth: 60 },
    'quiz-gauntlet': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'hand-lab': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'bluff-catcher': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'mixed-strategy-lab': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
    'study-group': { sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100 },
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
 * Fail-closed copy of the live runtime's legacy sanitizer. A hand survives
 * only when all observed values are in range and form either a normalized or
 * genuinely pure distribution. The fetched database object is cloned before
 * mutation so repeated question generation is deterministic.
 */
function sanitizeLegacyMatrix(matrix) {
    matrix = selectTrustedLegacySolverMatrix(matrix);
    if (!matrix) return null;
    const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
    const frequencies = matrix.frequencies;
    if (actions.length < 2 || !frequencies || typeof frequencies !== 'object') return null;
    const hands = new Set();
    actions.forEach(action => {
        const values = frequencies[action];
        if (values && typeof values === 'object' && !Array.isArray(values)) {
            Object.keys(values).forEach(hand => hands.add(hand));
        }
    });
    hands.forEach(hand => {
        const values = {};
        let sum = 0;
        let corrupted = false;
        actions.forEach(action => {
            const value = frequencies[action]?.[hand];
            if (typeof value === 'number' && value >= 0) {
                if (value <= 1.02) {
                    values[action] = Math.min(1, value);
                    sum += values[action];
                } else {
                    corrupted = true;
                }
            }
        });
        const kept = Object.values(values);
        const maximum = kept.length ? Math.max(...kept) : 0;
        const normalized = !corrupted && kept.length > 0 && Math.abs(sum - 1) <= 0.05;
        const pure = !corrupted && maximum >= 0.98 && (sum - maximum) <= 0.02;
        actions.forEach(action => {
            if (normalized || pure) {
                if (values[action] !== undefined) frequencies[action][hand] = values[action] / sum;
                else if (frequencies[action]?.[hand] !== undefined) delete frequencies[action][hand];
            } else if (frequencies[action]?.[hand] !== undefined) {
                delete frequencies[action][hand];
            }
        });
    });
    return matrix;
}

function toTrainingMatrix(scenario) {
    // Never fall back to v1 when an authoritative v2 export exists but fails
    // validation. That would conceal a damaged rebuilt solve during reseeding.
    const selected = selectTrustedSolverMatrix(scenario);
    if (!selected) return null;
    if (scenario?.strategy_matrix_v2) return selected;
    return sanitizeLegacyMatrix(structuredClone(selected));
}

/**
 * Build a training question from a solved_spots_gold row.
 * This is the core deterministic logic — mirrors DeterministicGTOEngine.buildQuestionFromScenario
 */
function buildQuestionFromScenario(scenario, config, level, questionIndex) {
    // The Windows farm writes the accuracy-gated v2 payload. Legacy rows are
    // still readable, but never prefer them over a verified v2 export.
    const sm = toTrainingMatrix(scenario) || {};
    const actions = sm.actions || [];
    const frequencies = sm.frequencies || {};
    const handEVs = sm.hand_evs || {};

    if (actions.length === 0) return null;
    // Keep cache generation identical to the live engine: frequency-only
    // legacy rows are incomplete solver artifacts and must not receive
    // fabricated zero EVs.
    if (!handEVs || typeof handEVs !== 'object' || Object.keys(handEVs).length === 0) return null;
    const solverPotChips = Number(sm.pot);
    const displayPotBb = Number(sm.pot_bb);
    const heroSeat = String(sm.hero || '').toUpperCase();
    if (heroSeat !== 'OOP' && heroSeat !== 'IP') return null;
    const expectedActor = heroSeat === 'OOP' ? 0 : 1;
    if (
        sm.node_state_exact !== true
        || sm.node_actor !== expectedActor
        || !Number.isFinite(solverPotChips) || solverPotChips <= 0
        || !Number.isFinite(displayPotBb) || displayPotBb <= 0
    ) return null;

    // Pick a hero hand from the frequency matrix that has at least one non-zero frequency
    const sampleAction = actions.find(a => frequencies[a]) || actions[0];
    const handFreqs = frequencies[sampleAction] || {};
    // CRITICAL: Only use hands that have at least one non-zero frequency in any action
    // Some hands are not in the solver's range for a specific spot (e.g., Q8o on 3h7c7s)
    // and will have 0% frequency for ALL actions — skip those hands entirely
    let allHands = Object.keys(handFreqs).filter(h => {
        if (!h || h.length < 2) return false;
        if (!Number.isFinite(handEVs[h])) return false;
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
    const heroHandEV = handEVs[heroHand];
    // Board and position
    const board = parseBoardFromHash(scenario.scenario_hash);
    const heroPosition = sm.position || extractPositionFromHash(scenario.scenario_hash);
    const villainPosition = heroPosition === sm.oop_player
        ? sm.ip_player
        : heroPosition === sm.ip_player ? sm.oop_player : VILLAIN_MAP[heroPosition] || 'BB';

    // Build up to 4 options from valid actions
    const options = validActions.slice(0, 4).map(action => ({
        id: action,
        text: getActionLabel(action, solverPotChips, true),
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
    const continuationBet = heroSeat === 'IP' && Number(sm.facing_bet_bb || 0) === 0
        ? validActions
            .filter(action => /^b\d+$/.test(String(action)))
            .map(action => ({
                action,
                distance: Math.abs((Number(String(action).slice(1)) / solverPotChips) - 0.75),
            }))
            .filter(candidate => candidate.distance <= 0.03)
            .sort((a, b) => a.distance - b.distance)[0]?.action || null
        : null;

    // Build explanation (deterministic, no AI)
    const freqPct = (maxFreq * 100).toFixed(0);
    let explanation;
    if (maxFreq >= 0.95) {
        explanation = `GTO solver: Pure ${getActionLabel(optimalAction, solverPotChips, true)} (${freqPct}%). ${heroHand} has a clear optimal line on ${scenario.street}.`;
    } else {
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .map(a => `${getActionLabel(a, solverPotChips, true)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');
        explanation = `GTO solver mixes: ${mixedParts}. Primary line is ${getActionLabel(optimalAction, solverPotChips, true)} at ${freqPct}%.${maxFreq < 0.6 ? ' This is a close GTO spot.' : ''}`;
    }

    const provenanceVerified = Boolean(
        scenario.strategy_matrix_v2
        && scenario.quality_status === 'validated'
        && scenario.solver_version
        && /^[0-9a-f]{64}$/i.test(String(scenario.solver_binary_checksum || ''))
        && ['M1', 'M2'].includes(String(scenario.machine_id || ''))
        && /^[0-9a-f]{40}$/i.test(String(scenario.pipeline_commit || ''))
        && scenario.manifest_version
        && /^[0-9a-f]{64}$/i.test(String(scenario.manifest_checksum || ''))
        && /^[0-9a-f]{64}$/i.test(String(scenario.source_artifact_checksum || ''))
        && scenario.audited_at
    );

    return {
        id: `pio_${scenario.id}_${heroHand}_${questionIndex}`,
        type: 'PIO',
        source: 'DETERMINISTIC_SOLVER',
        dataQuality: provenanceVerified ? 'SOLVER_EXACT' : 'LEGACY_UNVERIFIED',
        solverProvenance: {
            verified: provenanceVerified,
            source: provenanceVerified ? 'PioSOLVER' : 'solved_spots_gold_legacy',
            scenarioHash: scenario.scenario_hash || null,
            solverVersion: scenario.solver_version || null,
            solverBinaryChecksum: scenario.solver_binary_checksum || null,
            machineId: scenario.machine_id || null,
            pipelineCommit: scenario.pipeline_commit || null,
            manifestVersion: scenario.manifest_version || null,
            manifestChecksum: scenario.manifest_checksum || null,
            sourceArtifactChecksum: scenario.source_artifact_checksum || null,
            qualityStatus: scenario.quality_status || null,
            auditedAt: scenario.audited_at || null,
        },
        scenario: {
            board: board.join(' '),
            street: scenario.street,
            stackDepth: scenario.stack_depth,
            gameType: scenario.game_type,
            scenarioHash: scenario.scenario_hash,
            heroHand,
            heroPosition,
            heroStack: scenario.stack_depth || 100,
            pot: displayPotBb,
            villainPosition,
            villainStack: scenario.stack_depth || 100,
            action: Number(sm.facing_bet_bb) > 0
                ? `${villainPosition} bets ${Number(sm.facing_bet_bb)} BB`
                : sm.node_actor === 0 ? 'You are first to act' : `${villainPosition} checks to you`,
            solverNode: sm.node,
            solverActionUnits: 'chips',
            nextStreetContinuationAction: continuationBet,
            isMixedStrategy,
        },
        heroCards: parseHandToCards(heroHand),
        boardCards: board,
        question: `You hold ${heroHand} on the ${scenario.street}. Board: ${board.join(' ')}. What is the GTO play?`,
        options,
        correctAnswer: optimalAction,
        correctAnswerText: getActionLabel(optimalAction, solverPotChips, true),
        frequencies: handActions,
        gtoFrequencies,
        rawFrequencies: frequencies,
        evData: {
            heroHandEV,
            handEVs,
            heroHand,
            quality: 'SOLVER_NODE_HAND_EV_ONLY',
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
    const street = config.pioStreet || getStreetForLevel(level);

    // Fetch a pool of scenarios
    const poolSize = Math.min(count * 4, 100);
    let scenarios;
    try {
        const base = `?game_type=eq.${config.pioGameType}&stack_depth=eq.${config.pioStackDepth}&street=eq.${street}`;
        try {
            scenarios = await supabaseQuery('solved_spots_gold',
                `${base}&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix,strategy_matrix_v2,solver_version,solver_binary_checksum,machine_id,pipeline_commit,manifest_version,manifest_checksum,source_artifact_checksum,quality_status,audited_at&limit=${poolSize}`
            );
        } catch (provenanceError) {
            if (!/column|schema cache|PGRST204|42703/i.test(provenanceError.message || '')) throw provenanceError;
            // Additive migration has not landed yet: rows may be inspected as
            // legacy/unverified, never promoted to solver-exact.
            scenarios = await supabaseQuery('solved_spots_gold',
                `${base}&select=id,scenario_hash,street,stack_depth,game_type,strategy_matrix,strategy_matrix_v2&limit=${poolSize}`
            );
        }
    } catch (error) {
        return { questions: [], error: error.message };
    }

    if (!scenarios || scenarios.length === 0) {
        return { questions: [], error: `No scenarios for ${config.pioGameType} ${street} ${config.pioStackDepth}bb` };
    }

    const questions = [];
    const usedIds = new Set();

    for (let i = 0; i < count && i < scenarios.length * 6; i++) {
        const scenario = scenarios[i % scenarios.length];
        const q = enforceSolverClaimHonesty(buildQuestionFromScenario(scenario, config, level, i));
        // Unsealed legacy rows remain available through the live sanitizer,
        // but caching them would let a later request bypass that validation.
        // Only provenance-sealed warehouse output is eligible for reseeding.
        if (q && q.dataQuality !== 'LEGACY_UNVERIFIED' && !usedIds.has(q.id)) {
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
            source: 'CHART',
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
    if (!['DETERMINISTIC_SOLVER', 'CHART'].includes(q.source)) errors.push(`Wrong source: ${q.source}`);
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
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

async function seedGame(gameId, config, options = {}) {
    const { dryRun = true } = options;
    const engineType = config.sourceOfTruth;

    if (engineType === 'SCENARIO') {
        return { gameId, skipped: true, reason: 'SCENARIO game (psychology) — no solver data' };
    }
    if (config.pioStreet === 'preflop') {
        return { gameId, skipped: true, reason: 'Preflop game — served by the audited local range engine, not the postflop PioSOLVER warehouse' };
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

        for (const rawQuestion of batchResult.questions) {
            const q = enforceTrainingQuestionContract(rawQuestion);
            const validationErrors = validateQuestion(q, gameId, level);
            if (q?.questionContract?.valid === false) {
                validationErrors.push(...q.questionContract.issues);
            }
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
        const marker = ['DETERMINISTIC_SOLVER', 'CHART'].includes(src) ? '✅' : '⚠️';
        console.log(`  L${level}: ${count} questions | source: ${marker} ${src}`);
    }
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────

async function main() {
    ({
        selectTrustedLegacySolverMatrix,
        selectTrustedSolverMatrix,
    } = await import(pathToFileURL(
        path.join(__dirname, '../src/lib/training/solverMatrixTrust.js'),
    ).href));
    const startTime = Date.now();
    ({ enforceTrainingQuestionContract } = await import('../src/lib/training/questionContract.mjs'));
    ({ enforceSolverClaimHonesty } = await import('../src/lib/training/solverDecisionEvidence.js'));

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
    console.log(`   Games skipped:     ${summary.skipped} (SCENARIO or local-range preflop)`);
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
