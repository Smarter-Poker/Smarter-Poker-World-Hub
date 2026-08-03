/**
 * EquityEngine — Client-Side Poker Equity Calculator
 * ═══════════════════════════════════════════════════════════════
 * Fast combinatorial equity estimation for hero hand vs villain range.
 * Runs entirely in the browser — no API call needed.
 *
 * Hand evaluation is an exact best-5-of-7 evaluator: the score encodes the
 * hand category plus the category-specific tiebreak ranks in base-16 digits,
 * so comparing two scores gives the exact poker ordering (no more "top 3
 * board cards" pseudo-kicker that let a pair of 2s tie a pair of kings).
 *
 * ── Threading ──────────────────────────────────────────────────────────────
 * `calculateEquity` / `simulateRunouts` stay SYNCHRONOUS. They are the
 * fallback and the reference implementation. `calculateEquityAsync` /
 * `simulateRunoutsAsync` run the exact same maths inside a Web Worker built
 * from a Blob URL (see ./equityWorkerSource.js) and resolve to the identical
 * result shape. If a Worker cannot be created (SSR, CSP, old browser) the
 * async calls transparently run the synchronous path instead.
 *
 * !! Everything between the `@equity-core` sentinels below is MIRRORED into
 * !! ./equityWorkerSource.js. That file is generated from this block — if you
 * !! change the maths here, regenerate it (see the header of that file).
 */

// The worker body, as a string. Pure data — importing it costs nothing at
// runtime and it is never touched during SSR. See the worker section below.
import { EQUITY_WORKER_SOURCE } from './equityWorkerSource';

/* @equity-core:start */

// Card rank values
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_INDEX = { s: 0, h: 1, d: 2, c: 3 };

// Hand categories (higher = stronger)
const CAT_HIGH_CARD = 0;
const CAT_PAIR = 1;
const CAT_TWO_PAIR = 2;
const CAT_TRIPS = 3;
const CAT_STRAIGHT = 4;
const CAT_FLUSH = 5;
const CAT_FULL_HOUSE = 6;
const CAT_QUADS = 7;
const CAT_STRAIGHT_FLUSH = 8;

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

/**
 * Highest straight top-card contained in a rank bitmask (bit n = rank n).
 * Handles the wheel by aliasing the ace down to rank 1.
 */
function straightHighFromMask(mask) {
    let m = mask;
    if (m & (1 << 14)) m |= (1 << 1); // ace plays low
    for (let high = 14; high >= 5; high--) {
        const need = (1 << high) | (1 << (high - 1)) | (1 << (high - 2)) | (1 << (high - 3)) | (1 << (high - 4));
        if ((m & need) === need) return high;
    }
    return 0;
}

// score = category * 16^5 + t0 * 16^4 + ... + t4  (all tiebreak ranks are < 16)
function encodeScore(category, tiebreaks) {
    let s = category;
    for (let i = 0; i < 5; i++) {
        s = s * 16 + (tiebreaks[i] || 0);
    }
    return s;
}

/**
 * Exact best-5-of-7 hand evaluation.
 * @param {string[]} cards - 5..7 card strings, e.g. ['Ah','Kd','Ts','7h','2c']
 * @returns {number} comparable strength score (higher = better)
 */
function evaluateHand(cards) {
    if (!cards || cards.length < 5) return 0;

    const rankCount = new Array(15).fill(0);
    const suitCount = [0, 0, 0, 0];
    const suitRankMask = [0, 0, 0, 0];
    let rankMask = 0;
    let n = 0;

    for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || c.length < 2) continue;
        const v = RANK_VALUES[c[0]];
        const s = SUIT_INDEX[c[1]];
        if (!v || s === undefined) continue;
        rankCount[v] += 1;
        suitCount[s] += 1;
        suitRankMask[s] |= (1 << v);
        rankMask |= (1 << v);
        n += 1;
    }
    if (n < 5) return 0;

    // Flush suit (at most one suit can hold 5+ of 7 cards)
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) {
        if (suitCount[s] >= 5) { flushSuit = s; break; }
    }

    // Straight flush must live INSIDE the flush suit — a mixed-suit straight
    // alongside an unrelated flush is NOT a straight flush.
    const sfHigh = flushSuit >= 0 ? straightHighFromMask(suitRankMask[flushSuit]) : 0;
    if (sfHigh) return encodeScore(CAT_STRAIGHT_FLUSH, [sfHigh]);

    // Rank groupings (descending within each group size)
    const quads = [], trips = [], pairs = [];
    for (let v = 14; v >= 2; v--) {
        const c = rankCount[v];
        if (c === 4) quads.push(v);
        else if (c === 3) trips.push(v);
        else if (c === 2) pairs.push(v);
    }

    // Kickers: distinct ranks (descending) excluding the given ranks
    const kickers = (exclude, count) => {
        const out = [];
        for (let v = 14; v >= 2 && out.length < count; v--) {
            if (rankCount[v] > 0 && exclude.indexOf(v) === -1) out.push(v);
        }
        return out;
    };

    if (quads.length > 0) {
        const q = quads[0];
        return encodeScore(CAT_QUADS, [q, ...kickers([q], 1)]);
    }

    if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
        const tripRank = trips[0];
        const pairRank = trips.length > 1 ? Math.max(trips[1], pairs[0] || 0) : pairs[0];
        return encodeScore(CAT_FULL_HOUSE, [tripRank, pairRank]);
    }

    if (flushSuit >= 0) {
        const top = [];
        for (let v = 14; v >= 2 && top.length < 5; v--) {
            if (suitRankMask[flushSuit] & (1 << v)) top.push(v);
        }
        return encodeScore(CAT_FLUSH, top);
    }

    const stHigh = straightHighFromMask(rankMask);
    if (stHigh) return encodeScore(CAT_STRAIGHT, [stHigh]);

    if (trips.length > 0) {
        const t = trips[0];
        return encodeScore(CAT_TRIPS, [t, ...kickers([t], 2)]);
    }

    if (pairs.length >= 2) {
        const hi = pairs[0], lo = pairs[1];
        return encodeScore(CAT_TWO_PAIR, [hi, lo, ...kickers([hi, lo], 1)]);
    }

    if (pairs.length === 1) {
        const p = pairs[0];
        return encodeScore(CAT_PAIR, [p, ...kickers([p], 3)]);
    }

    return encodeScore(CAT_HIGH_CARD, kickers([], 5));
}

// ─── Villain range expansion ───────────────────────────────────────────────

/**
 * Expand a single hand notation ('AA', 'AKs', 'AKo', 'AK') into concrete
 * 2-card combos: pairs = 6, suited = 4, offsuit = 12, unspecified = 16.
 */
function expandNotation(hand) {
    const combos = [];
    if (!hand || hand.length < 2) return combos;
    const r1 = hand[0].toUpperCase();
    const r2 = hand[1].toUpperCase();
    if (!RANK_VALUES[r1] || !RANK_VALUES[r2]) return combos;
    const suffix = (hand[2] || '').toLowerCase();

    if (r1 === r2) {
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) combos.push([`${r1}${SUITS[i]}`, `${r2}${SUITS[j]}`]);
        }
        return combos;
    }

    if (suffix !== 'o') { // suited (or unspecified => both)
        for (let i = 0; i < 4; i++) combos.push([`${r1}${SUITS[i]}`, `${r2}${SUITS[i]}`]);
    }
    if (suffix !== 's') { // offsuit (or unspecified => both)
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (i !== j) combos.push([`${r1}${SUITS[i]}`, `${r2}${SUITS[j]}`]);
            }
        }
    }
    return combos;
}

/**
 * Expand a '+' shorthand ('77+', 'A2s+', 'KTo+') into explicit notations.
 */
function expandPlus(token) {
    const base = token.slice(0, -1);
    if (base.length < 2) return [];
    const hi = base[0].toUpperCase();
    const lo = base[1].toUpperCase();
    const suffix = base.slice(2).toLowerCase();
    const hiV = RANK_VALUES[hi], loV = RANK_VALUES[lo];
    if (!hiV || !loV) return [];

    const out = [];
    if (hi === lo) {
        for (let v = loV; v <= 14; v++) {
            const r = RANKS[v - 2];
            out.push(`${r}${r}`);
        }
        return out;
    }
    for (let v = loV; v < hiV; v++) {
        out.push(`${hi}${RANKS[v - 2]}${suffix}`);
    }
    return out;
}

/**
 * Turn a villain range (array of notations or comma string) into concrete
 * 2-card combos, dropping any combo that collides with a dead card.
 * @param {string[]|string} range
 * @param {Set<string>} deadCards
 * @returns {Array<[string,string]>}
 */
export function expandRangeToCombos(range, deadCards = new Set()) {
    if (!range) return [];
    const tokens = Array.isArray(range)
        ? range
        : String(range).split(/[,\s]+/);

    const seen = new Set();
    const combos = [];
    tokens.forEach(rawToken => {
        const token = String(rawToken || '').trim();
        if (!token) return;
        const notations = token.endsWith('+') ? expandPlus(token) : [token];
        notations.forEach(notation => {
            expandNotation(notation).forEach(([a, b]) => {
                if (deadCards.has(a) || deadCards.has(b)) return;
                const key = a < b ? `${a}${b}` : `${b}${a}`;
                if (seen.has(key)) return;
                seen.add(key);
                combos.push([a, b]);
            });
        });
    });
    return combos;
}

// ─── Deck state helpers (allocation-free sampling) ─────────────────────────

function makeDeckState(cards) {
    const arr = cards.slice();
    const pos = Object.create(null);
    for (let i = 0; i < arr.length; i++) pos[arr[i]] = i;
    return { arr, pos };
}

function swapIdx(state, i, j) {
    if (i === j) return;
    const a = state.arr[i], b = state.arr[j];
    state.arr[i] = b; state.arr[j] = a;
    state.pos[b] = i; state.pos[a] = j;
}

function moveCardTo(state, card, target) {
    const i = state.pos[card];
    if (i === undefined || i === target) return;
    swapIdx(state, i, target);
}

/**
 * Random source. `seed == null` (the default everywhere in the app) returns
 * Math.random itself, so the shipped behaviour is byte-for-byte what it always
 * was. A numeric seed returns a deterministic mulberry32 stream, which is what
 * lets the worker and the main thread be proved identical on the same inputs.
 */
function makeRng(seed) {
    if (seed === null || seed === undefined) return Math.random;
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function nextRandom() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Calculate equity of hero hand vs a villain hand on a given board.
 * Uses Monte Carlo sampling for speed. When `villainRange` is supplied the
 * villain hand is sampled uniformly from that range instead of at random.
 *
 * @param {string[]} heroCards - e.g. ['Ah', 'Kd']
 * @param {string[]} boardCards - e.g. ['Ts', '7h', '2c'] (0-5 cards)
 * @param {number} simulations - number of Monte Carlo iterations (default 2000)
 * @param {string[]|string} [villainRange] - e.g. ['AA','AKs'] or 'AA,AKs,AKo'
 * @param {number|null} [seed] - optional deterministic seed; omit for Math.random
 * @returns {{ heroEquity: number, villainEquity: number, ties: number, sampleSize: number, rangeCombos: number }}
 */
export function calculateEquity(heroCards, boardCards = [], simulations = 2000, villainRange = null, seed = null) {
    if (!heroCards || heroCards.length < 2) {
        return { heroEquity: 50, villainEquity: 50, ties: 0, sampleSize: 0, rangeCombos: 0 };
    }

    const board = (boardCards || []).slice(0, 5);
    const usedCards = new Set([...heroCards, ...board]);
    const deck = makeDeckState(buildDeck().filter(c => !usedCards.has(c)));
    const cardsNeeded = Math.max(0, 5 - board.length);

    const combos = expandRangeToCombos(villainRange, usedCards);
    const useRange = combos.length > 0;

    const rnd = makeRng(seed);
    let heroWins = 0, villainWins = 0, tieCount = 0;
    const actualSims = Math.max(1, Math.min(simulations || 2000, 3000)); // Cap for performance

    // Preallocate the working 7-card buffers — no per-iteration array churn.
    const heroHand = new Array(heroCards.length + board.length + cardsNeeded);
    const villainHand = new Array(2 + board.length + cardsNeeded);
    for (let i = 0; i < heroCards.length; i++) heroHand[i] = heroCards[i];
    for (let i = 0; i < board.length; i++) {
        heroHand[heroCards.length + i] = board[i];
        villainHand[2 + i] = board[i];
    }

    for (let i = 0; i < actualSims; i++) {
        let limit = deck.arr.length;

        if (useRange) {
            const combo = combos[(rnd() * combos.length) | 0];
            // Park the villain's two cards at the end so the runout can't reuse them.
            moveCardTo(deck, combo[0], limit - 1);
            moveCardTo(deck, combo[1], limit - 2);
            villainHand[0] = combo[0];
            villainHand[1] = combo[1];
            limit -= 2;
        }

        const need = cardsNeeded + (useRange ? 0 : 2);
        if (limit < need) break;

        // Partial Fisher-Yates from the top of the live window.
        for (let k = 0; k < need; k++) {
            const top = limit - 1 - k;
            const r = (rnd() * (top + 1)) | 0;
            swapIdx(deck, top, r);
        }

        let drawn = 0;
        if (!useRange) {
            villainHand[0] = deck.arr[limit - 1];
            villainHand[1] = deck.arr[limit - 2];
            drawn = 2;
        }
        for (let k = 0; k < cardsNeeded; k++) {
            const card = deck.arr[limit - 1 - drawn - k];
            heroHand[heroCards.length + board.length + k] = card;
            villainHand[2 + board.length + k] = card;
        }

        const heroScore = evaluateHand(heroHand);
        const villainScore = evaluateHand(villainHand);

        if (heroScore > villainScore) heroWins++;
        else if (villainScore > heroScore) villainWins++;
        else tieCount++;
    }

    const total = heroWins + villainWins + tieCount;
    if (total === 0) {
        return { heroEquity: 50, villainEquity: 50, ties: 0, sampleSize: 0, rangeCombos: combos.length };
    }

    return {
        heroEquity: Math.round((heroWins + tieCount * 0.5) / total * 1000) / 10,
        villainEquity: Math.round((villainWins + tieCount * 0.5) / total * 1000) / 10,
        ties: Math.round(tieCount / total * 1000) / 10,
        sampleSize: total,
        rangeCombos: combos.length,
    };
}

// ─── Runout simulation (memoized) ──────────────────────────────────────────

const RUNOUT_CACHE = new Map();
const RUNOUT_CACHE_MAX = 24;

function runoutCacheKey(heroCards, boardCards, trials, villainRange, seed) {
    const rangeKey = Array.isArray(villainRange) ? villainRange.join(',') : (villainRange || '');
    const seedKey = (seed === null || seed === undefined) ? '' : String(seed);
    return heroCards.join('') + '|' + boardCards.join('') + '|' + trials + '|' + rangeKey + '|' + seedKey;
}

/**
 * Get best/worst runout cards for hero hand on current board.
 * @param {string[]} heroCards
 * @param {string[]} boardCards - must have 3-4 cards (a 5-card board has no runout)
 * @param {number} trials - simulations per card
 * @param {string[]|string} [villainRange]
 * @param {number|null} [seed] - optional deterministic seed; omit for Math.random.
 *   When set, every candidate card is sampled from the same stream (common
 *   random numbers), which is both reproducible and lower-variance for ranking.
 * @returns {{ bestCards: Object[], worstCards: Object[], baseline: number, improveRate: number, worsenRate: number, avgEquity: number, distribution: Object[] }}
 */
export function simulateRunouts(heroCards, boardCards, trials = 300, villainRange = null, seed = null) {
    const empty = { bestCards: [], worstCards: [], baseline: null, improveRate: 0, worsenRate: 0, avgEquity: 0, distribution: [] };
    if (!heroCards || heroCards.length < 2 || !boardCards || boardCards.length < 3) return empty;
    // A complete board has no next card to simulate.
    if (boardCards.length > 4) return empty;

    const key = runoutCacheKey(heroCards, boardCards, trials, villainRange, seed);
    if (RUNOUT_CACHE.has(key)) return RUNOUT_CACHE.get(key);

    const usedCards = new Set([...heroCards, ...boardCards]);
    const possibleCards = buildDeck().filter(c => !usedCards.has(c));

    // Hero's equity as the board stands — the yardstick for "improve"/"worsen".
    const baseline = calculateEquity(heroCards, boardCards, trials, villainRange, seed).heroEquity;

    // Reuse one board buffer; only the last slot changes per candidate card.
    const newBoard = [...boardCards, null];
    const cardEquities = possibleCards.map(card => {
        newBoard[newBoard.length - 1] = card;
        const eq = calculateEquity(heroCards, newBoard, trials, villainRange, seed);
        return { card, equity: eq.heroEquity };
    });

    cardEquities.sort((a, b) => b.equity - a.equity);

    const total = cardEquities.length || 1;
    const result = {
        bestCards: cardEquities.slice(0, 5).map(c => ({ card: c.card, equity: c.equity })),
        worstCards: cardEquities.slice(-5).reverse().map(c => ({ card: c.card, equity: c.equity })),
        baseline,
        improveRate: Math.round(cardEquities.filter(c => c.equity >= baseline + 3).length / total * 100),
        worsenRate: Math.round(cardEquities.filter(c => c.equity <= baseline - 3).length / total * 100),
        avgEquity: Math.round(cardEquities.reduce((s, c) => s + c.equity, 0) / total * 10) / 10,
        distribution: cardEquities,
    };

    if (RUNOUT_CACHE.size >= RUNOUT_CACHE_MAX) {
        const oldest = RUNOUT_CACHE.keys().next().value;
        RUNOUT_CACHE.delete(oldest);
    }
    RUNOUT_CACHE.set(key, result);
    return result;
}

/* @equity-core:end */

// Exported for tests/debug tooling — the evaluator is the core of every number
// the sandbox shows, so keep it inspectable.
export { evaluateHand };

// ─── Off-main-thread path (Web Worker over a Blob URL) ─────────────────────
//
// Why a Blob URL and not a file in /public or a `new Worker(new URL(...))`:
//   • `new URL('./worker.js', import.meta.url)` needs webpack 5 worker support
//     wired through next.config.js — we are not allowed to touch that.
//   • /public/equityWorker.js would be fetched over the network at a path that
//     breaks under basePath / assetPrefix / a CDN rewrite, and would 404 into a
//     silent no-op.
//   • A Blob URL is dependency-free, needs zero build config, is same-origin,
//     and survives `next build` untouched because it is just a string.
//
// Everything below is client-only and defensive: on ANY failure the async
// helpers fall through to the synchronous functions above, so the page behaves
// exactly as it did before this file grew a worker.
//
// EQUITY_WORKER_SOURCE is imported at the top of the file (ESM imports hoist,
// but keeping them together stops import/first from tripping).

const WORKER_JOB_TIMEOUT_MS = 20000;

let workerRef = null;
let workerUrl = null;
let workerBroken = false; // set once we know a Worker can never be built here
let nextRequestId = 1;

// id -> { message, resolve, timer }  (insertion-ordered: the head is the job
// the worker is currently chewing on, because it processes serially)
const pending = new Map();

// ─── Main-thread runout memo ───────────────────────────────────────────────
//
// simulateRunouts memoizes internally, but on the worker path that cache lives
// inside the worker — and the worker can be recycled (see recycleWorker), which
// throws it away. This mirror keeps the "revisiting a spot is free" behaviour
// the synchronous build had, independent of the worker's lifetime. Runouts only
// (~46 candidate cards x N sims); a single equity run is too cheap to be worth
// caching twice.
const ASYNC_RUNOUT_CACHE = new Map();
const ASYNC_RUNOUT_CACHE_MAX = 24;

function asyncRunoutKey(message) {
    if (!message || message.op !== 'runouts') return null;
    const hero = Array.isArray(message.hero) ? message.hero.join('') : String(message.hero || '');
    const board = Array.isArray(message.board) ? message.board.join('') : String(message.board || '');
    const range = Array.isArray(message.range) ? message.range.join(',') : (message.range || '');
    const seed = (message.seed === null || message.seed === undefined) ? '' : String(message.seed);
    return `${hero}|${board}|${message.sims}|${range}|${seed}`;
}

function rememberRunout(message, result) {
    if (!result) return;
    const key = asyncRunoutKey(message);
    if (!key) return;
    if (ASYNC_RUNOUT_CACHE.has(key)) ASYNC_RUNOUT_CACHE.delete(key);
    else if (ASYNC_RUNOUT_CACHE.size >= ASYNC_RUNOUT_CACHE_MAX) {
        const oldest = ASYNC_RUNOUT_CACHE.keys().next().value;
        ASYNC_RUNOUT_CACHE.delete(oldest);
    }
    ASYNC_RUNOUT_CACHE.set(key, result);
}

/**
 * True when an off-main-thread run is actually possible right now.
 * False during SSR, in browsers without Worker/Blob/URL, and after any failure.
 */
export function isEquityWorkerAvailable() {
    if (workerBroken) return false;
    if (typeof window === 'undefined') return false;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return false;
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
    return true;
}

function destroyWorker() {
    if (workerRef) {
        try { workerRef.terminate(); } catch (e) { /* already gone */ }
    }
    workerRef = null;
}

function releaseWorkerUrl() {
    if (workerUrl) {
        try { URL.revokeObjectURL(workerUrl); } catch (e) { /* already revoked */ }
    }
    workerUrl = null;
}

function settle(id, value) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (job.timer) clearTimeout(job.timer);
    job.resolve(value);
}

function handleMessage(event) {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ready') return;
    if (typeof data.id !== 'number') return;
    const job = pending.get(data.id);
    if (!job) return; // cancelled or already settled — never let it overwrite
    if (data.ok) settle(data.id, data.result);
    else settle(data.id, runJobSync(job.message)); // worker-side error: still answer
}

// A worker-level failure (bad script, CSP, OOM) kills every job it was holding.
// Answer them all on the main thread so callers never hang.
function handleWorkerFailure() {
    workerBroken = true;
    destroyWorker();
    releaseWorkerUrl();
    const jobs = Array.from(pending.values());
    pending.clear();
    jobs.forEach(job => {
        if (job.timer) clearTimeout(job.timer);
        job.resolve(runJobSync(job.message));
    });
}

function getWorker() {
    if (workerRef) return workerRef;
    if (!isEquityWorkerAvailable()) return null;
    try {
        if (!workerUrl) {
            workerUrl = URL.createObjectURL(new Blob([EQUITY_WORKER_SOURCE], { type: 'text/javascript' }));
        }
        const w = new Worker(workerUrl);
        w.onmessage = handleMessage;
        w.onerror = handleWorkerFailure;
        w.onmessageerror = handleWorkerFailure;
        workerRef = w;
        return w;
    } catch (e) {
        workerBroken = true;
        releaseWorkerUrl();
        return null;
    }
}

// Kill the worker and re-queue whatever it still owed us. Used when the job at
// the head of the queue (i.e. the running one) is cancelled — terminate() is
// the only way to actually interrupt a synchronous Monte Carlo loop.
function recycleWorker() {
    destroyWorker();
    if (pending.size === 0) return;
    const w = getWorker();
    if (!w) { handleWorkerFailure(); return; }
    pending.forEach(job => {
        try { w.postMessage(job.message); } catch (e) { /* handled by onerror */ }
    });
}

function runJobSync(message) {
    try {
        if (message.op === 'runouts') {
            return simulateRunouts(message.hero, message.board, message.sims, message.range, message.seed);
        }
        return calculateEquity(message.hero, message.board, message.sims, message.range, message.seed);
    } catch (e) {
        return null;
    }
}

/**
 * Dispatch one job. Resolves with the result, or with `null` if the caller
 * aborted. Never rejects — callers treat `null` as "keep what you had".
 */
function dispatch(message, signal) {
    if (signal && signal.aborted) return Promise.resolve(null);

    // Repeat spot (undo a card, toggle back to the same range) — answer from the
    // memo instead of paying for the worker round trip again.
    const memoKey = asyncRunoutKey(message);
    if (memoKey && ASYNC_RUNOUT_CACHE.has(memoKey)) {
        return Promise.resolve(ASYNC_RUNOUT_CACHE.get(memoKey));
    }

    const w = getWorker();
    if (!w) {
        const syncResult = runJobSync(message); // no worker here: same as today
        rememberRunout(message, syncResult);
        return Promise.resolve(syncResult);
    }

    return new Promise(resolve => {
        const id = message.id;
        const cancel = () => {
            if (!pending.has(id)) return;
            const isRunning = pending.keys().next().value === id;
            const job = pending.get(id);
            if (job && job.timer) clearTimeout(job.timer);
            pending.delete(id);
            // Only tear the worker down when the abandoned job is actually worth
            // interrupting. An equity run is ~2000 sims: terminating for it costs
            // a respawn (and the worker-local runout memo) to save a few ms of
            // background CPU, so we just drop its result the way a non-head
            // cancel already does. A runout is ~46x that, so it still gets killed.
            if (isRunning && job && job.message && job.message.op === 'runouts') {
                recycleWorker(); // interrupt the in-flight loop
            }
            resolve(null);
        };

        // Belt and braces: if the worker never answers, do the work here rather
        // than leaving the UI stuck in its "refining" state forever.
        const timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            if (signal && signal.removeEventListener) signal.removeEventListener('abort', cancel);
            const syncResult = runJobSync(message);
            rememberRunout(message, syncResult);
            resolve(syncResult);
        }, WORKER_JOB_TIMEOUT_MS);

        pending.set(id, {
            message,
            timer,
            resolve: (value) => {
                if (signal && signal.removeEventListener) signal.removeEventListener('abort', cancel);
                rememberRunout(message, value);
                resolve(value);
            },
        });

        if (signal && signal.addEventListener) signal.addEventListener('abort', cancel, { once: true });

        try {
            w.postMessage(message);
        } catch (e) {
            handleWorkerFailure();
        }
    });
}

/**
 * Worker-backed `calculateEquity`. Same arguments, same result object.
 * @param {object} [opts] - { signal?: AbortSignal, seed?: number|null }
 * @returns {Promise<object|null>} null only when aborted via opts.signal
 */
export function calculateEquityAsync(heroCards, boardCards = [], simulations = 2000, villainRange = null, opts = {}) {
    const seed = (opts && opts.seed !== undefined) ? opts.seed : null;
    return dispatch({
        id: nextRequestId++,
        op: 'equity',
        hero: heroCards,
        board: boardCards,
        sims: simulations,
        range: villainRange,
        seed,
    }, opts && opts.signal);
}

/**
 * Worker-backed `simulateRunouts`. Same arguments, same result object.
 * @param {object} [opts] - { signal?: AbortSignal, seed?: number|null }
 * @returns {Promise<object|null>} null only when aborted via opts.signal
 */
export function simulateRunoutsAsync(heroCards, boardCards, trials = 300, villainRange = null, opts = {}) {
    const seed = (opts && opts.seed !== undefined) ? opts.seed : null;
    return dispatch({
        id: nextRequestId++,
        op: 'runouts',
        hero: heroCards,
        board: boardCards,
        sims: trials,
        range: villainRange,
        seed,
    }, opts && opts.signal);
}

/**
 * Tear the worker down (component unmount). Any job still outstanding resolves
 * with `null`; nothing is left running and the Blob URL is revoked.
 */
export function terminateEquityWorker() {
    destroyWorker();
    releaseWorkerUrl();
    const jobs = Array.from(pending.values());
    pending.clear();
    jobs.forEach(job => {
        if (job.timer) clearTimeout(job.timer);
        job.resolve(null);
    });
}
