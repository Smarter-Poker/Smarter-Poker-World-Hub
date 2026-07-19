/**
 * Training API Shared Utilities
 * ═══════════════════════════════════════════════════════════════════════════
 * Common functions used across multiple training API routes.
 * Extracted to eliminate code duplication (DRY principle).
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Standard 13×13 hand matrix ──────────────────────────────────────────
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Generate all 169 unique hand notations (AA, AKs, AKo, etc.)
 * Used by browse-solutions, grade-range, preflop-ranges
 */
export function getAllHands() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(`${RANKS[r]}${RANKS[c]}`);
            else if (r < c) hands.push(`${RANKS[r]}${RANKS[c]}s`);
            else hands.push(`${RANKS[c]}${RANKS[r]}o`);
        }
    }
    return hands;
}

/**
 * Parse board cards from a scenario hash string.
 * Example: 'hu_cash_BTN_100bb_7h8h2c' → ['7h', '8h', '2c']
 * Used by aggregate-report, browse-solutions, runout-report, tree-navigate
 */
export function parseBoardFromHash(hash) {
    if (!hash) return [];
    const parts = hash.split('_');
    const lastPart = parts[parts.length - 1];
    if (!lastPart || lastPart.length < 4) return [];
    const cards = [];
    for (let i = 0; i < lastPart.length - 1; i += 2) {
        const rank = lastPart[i];
        const suit = lastPart[i + 1];
        if (/[2-9TJQKAtjqka]/.test(rank) && /[shdc]/.test(suit)) {
            cards.push(`${rank.toUpperCase()}${suit}`);
        }
    }
    return cards;
}

/**
 * Extract hero position from a scenario hash string.
 * Example: 'hu_cash_BTN_100bb_7h8h2c' → 'BTN'
 * Used by aggregate-report, browse-solutions
 */
export function extractPositionFromHash(hash) {
    if (!hash) return 'UNK';
    const parts = hash.split('_');
    const positions = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    for (const part of parts) {
        if (positions.includes(part.toUpperCase())) return part.toUpperCase();
    }
    return 'UNK';
}

/**
 * Get the number of combos for a hand notation.
 * Pairs = 6, Suited = 4, Offsuit = 12
 * Used by grade-range, preflop-ranges
 */
export function getCombos(hand) {
    if (hand.length === 2) return 6;       // Pair
    if (hand.endsWith('s')) return 4;       // Suited
    return 12;                              // Offsuit
}

/**
 * Rank values for card comparison (2=2, A=14)
 * Used by aggregate-report flop texture classification
 */
export const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// ── Input validation constants ──────────────────────────────────────────

/** Valid poker positions for 6-max and heads-up */
export const VALID_POSITIONS = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Valid scenario types for range queries */
export const VALID_SCENARIOS = ['rfi', 'vs3bet', 'bb_defense', 'push_fold', '4bet', 'squeeze', 'cold_call'];

/** Valid game type prefixes */
export const VALID_GAME_TYPES = ['hu_cash', 'cash_6max', 'cash_9max', 'mtt', 'sng'];

/** Valid street names */
export const VALID_STREETS = ['preflop', 'flop', 'turn', 'river'];

/**
 * Sanitize a string query parameter — strips non-alphanumeric chars (except _ + -)
 * Prevents injection via query params used in Supabase .ilike() or .eq() calls.
 */
export function sanitizeParam(value, maxLength = 200) {
    if (!value || typeof value !== 'string') return '';
    return value.replace(/[^a-zA-Z0-9_+\-.]/g, '').slice(0, maxLength);
}

// ── Pagination constants ────────────────────────────────────────────────
export const PAGINATION = {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
    DEFAULT_PAGE: 1,
};

/**
 * Clamp pagination parameters to safe bounds.
 * Prevents excessively large queries and invalid page numbers.
 *
 * @param {string|number} limit - Requested limit
 * @param {string|number} page - Requested page (1-indexed)
 * @returns {{ limit: number, page: number, offset: number }}
 */
export function clampPagination(limit, page) {
    const l = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT));
    const p = Math.max(1, parseInt(page, 10) || PAGINATION.DEFAULT_PAGE);
    return { limit: l, page: p, offset: (p - 1) * l };
}

// ── Response timing ─────────────────────────────────────────────────────
/**
 * Attach a high-resolution timer to the response.
 * Call at the very top of a handler — it hooks into `res.end()` to set
 * the `X-Response-Time` header automatically (no changes to response body).
 *
 * @param {object} res - Node.js HTTP response
 */
export function withTiming(res) {
    const start = Date.now();
    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
        if (!res.headersSent) {
            res.setHeader('X-Response-Time', `${Date.now() - start}ms`);
        }
        return originalEnd(...args);
    };
}

// ── Structured Logger ───────────────────────────────────────────────────
/**
 * Lightweight structured logger for training API endpoints.
 * Outputs JSON lines for Vercel log search and alerting.
 *
 * Usage:
 *   const log = apiLog('SaveSession');
 *   log.info('saved', { userId, gameId });
 *   log.warn('fallback used', { reason: 'table missing' });
 *   log.error('query failed', err, { userId });
 *
 * @param {string} endpoint - Short endpoint name (e.g. 'SaveSession', 'Streak')
 * @returns {{ info, warn, error }}
 */
export function apiLog(endpoint) {
    const _emit = (level, message, extra = {}) => {
        const entry = { ts: Date.now(), endpoint, level, message, ...extra };
        // Strip undefined values for cleaner output
        Object.keys(entry || {}).forEach(k => entry[k] === undefined && delete entry[k]);
        if (level === 'error') {
            console.warn(JSON.stringify(entry));
        } else if (level === 'warn') {
            console.warn(JSON.stringify(entry));
        } else {
            console.debug(JSON.stringify(entry));
        }
    };
    return {
        info: (msg, extra) => _emit('info', msg, extra),
        warn: (msg, extra) => _emit('warn', msg, extra),
        error: (msg, err, extra) => _emit('error', msg, {
            err: err?.message || String(err || ''),
            stack: err?.stack?.split('\n').slice(0, 3).join(' | ') || undefined,
            ...extra,
        }),
    };
}

/**
 * ANSWER-KEY RECONCILIATION (2026-07-19 training-engine audit)
 * ─────────────────────────────────────────────────────────────
 * Production `training_question_cache` rows were found internally
 * inconsistent: 1,572 / 21,700 rows have a `correctAnswer` code that is NOT
 * the highest-frequency action in the row's own solver `frequencies`, and
 * many rows carry a `correctAnswerText` label or `gtoFrequencies` bars that
 * contradict the answer code (e.g. AA on Qc3h5c: frequencies {c:0.49,b16:0.51},
 * correctAnswer 'c', correctAnswerText 'Bet 16% pot', gtoFrequencies {c:75,b16:25}).
 * A trainee could pick the objectively highest-frequency action and be marked
 * wrong, or be shown a label contradicting the grading key.
 *
 * This helper makes the served question self-consistent at read time:
 *   - correctAnswer      := argmax of solver `frequencies` (GTO Wizard rule)
 *   - correctAnswerText  := the matching option's display text
 *   - gtoFrequencies     := `frequencies` scaled to whole percentages
 * Rows without usable `frequencies`, or whose frequency keys don't map onto
 * the option ids, are returned untouched (never guess).
 */
export function reconcileAnswerKey(q) {
    if (!q || typeof q !== 'object') return q;
    const freqs = q.frequencies;
    if (!freqs || typeof freqs !== 'object' || Array.isArray(freqs)) return q;

    const entries = Object.entries(freqs)
        .filter(([, v]) => typeof v === 'number' && isFinite(v) && v >= 0);
    if (entries.length < 2) return q; // Nothing to reconcile on 0/1-action rows

    // Frequencies must look like a sane 0-1 (or 0-100) distribution
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total <= 0) return q;
    const scale = total > 1.5 && total <= 105 ? 100 : total <= 1.5 ? 1 : null;
    if (scale === null) return q; // Raw combo weights or corrupt — don't touch

    // Every frequency key must map onto a served option id
    const options = Array.isArray(q.options) ? q.options : [];
    const optionIds = new Set(options.map((o, i) => (o && o.id) || String.fromCharCode(97 + i)));
    if (!entries.every(([k]) => optionIds.has(k))) return q;

    // Argmax = the GTO-correct grading key
    const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const bestId = best[0];
    const bestOption = options.find((o, i) => ((o && o.id) || String.fromCharCode(97 + i)) === bestId);

    q.correctAnswer = bestId;
    if (bestOption && bestOption.text) q.correctAnswerText = bestOption.text;

    // Rebuild the displayed frequency bars from the solver distribution.
    // Normalize by the summed mass so bars always total exactly 100.
    const pct = {};
    let acc = 0;
    entries.forEach(([k, v], i) => {
        if (i === entries.length - 1) {
            pct[k] = Math.max(0, 100 - acc);
        } else {
            const p = Math.max(0, Math.min(Math.round((v / total) * 100), 100 - acc));
            pct[k] = p;
            acc += p;
        }
    });
    q.gtoFrequencies = pct;
    q.answerKeyReconciled = true;
    return q;
}
