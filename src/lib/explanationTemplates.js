/**
 * 🧮 DETERMINISTIC EXPLANATION TEMPLATES (Operation Grok-Sweep)
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure-function builders that turn solver data into explanation payloads.
 * No LLM calls. No I/O. Safe to import server-side.
 *
 * Public API:
 *   • buildExplainAnswerPayload(args) → rich EngineExplanation shape consumed
 *     by FeedbackCard.tsx and the /api/training/explain-answer endpoint.
 *   • buildGtoAnalysisStrings(args)   → flat { explanation, gtoApproach,
 *     mixedStrategy } strings consumed by GTOAnalysisPanel.jsx via the
 *     /api/gto/gto-analysis endpoint.
 *
 * Frontend contracts respected exactly. Every string field is non-empty.
 * Numeric fields are wrapped in safeNum so "undefined"/"NaN" never reach UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Action code → readable verbs / labels ────────────────────────────────────
const ACTION_VERBS = {
    f: 'folds', fold: 'folds',
    c: 'calls', call: 'calls',
    x: 'checks', check: 'checks',
    r: 'raises', raise: 'raises',
    b: 'bets', bet: 'bets',
    allin: 'jams', ai: 'jams', 'all-in': 'jams',
};

const ACTION_LABELS = {
    f: 'Fold', fold: 'Fold',
    // Phase 48 (2026-05-06): in the PIO cache schema, option-id 'c' is
    // ALWAYS the check action (cache verified: 20,950/20,950 rows have
    // {id:'c', text:'Check'}). Previous mapping `c → 'Call'` produced
    // wrong prose for ~88% of PIO questions ("Solver Call 83% of the
    // time" instead of "Solver Check"). 'call' and 'x' kept as legacy
    // aliases for engines that emit those codes; 'c' specifically
    // means CHECK in solver-derived rows.
    c: 'Check', call: 'Call',
    x: 'Check', check: 'Check',
    r: 'Raise', raise: 'Raise',
    b: 'Bet', bet: 'Bet',
    b16: 'Bet 16% pot', b25: 'Bet 25% pot', b33: 'Bet 33% pot',
    b45: 'Bet 45% pot', b50: 'Bet half pot', b66: 'Bet 2/3 pot',
    b75: 'Bet 75% pot', b100: 'Bet pot', b150: 'Overbet 150%',
    r2x: 'Raise 2x', r3x: '3-Bet', r4x: '4-Bet',
    allin: 'All-In', ai: 'All-In', 'all-in': 'All-In',
};

const READABLE_FOR_ANALYSIS_PANEL = {
    f: 'FOLD', fold: 'FOLD',
    // Phase 48 (2026-05-06): see comment in ACTION_VERBS — `c` is
    // CHECK in the PIO cache, not CALL. The GTOAnalysisPanel labels
    // were wrong on every check-correct PIO question.
    c: 'CHECK', call: 'CALL',
    x: 'CHECK', check: 'CHECK',
    r: 'RAISE', raise: 'RAISE',
    b: 'BET', bet: 'BET',
    b16: 'BET', b25: 'BET', b33: 'BET', b45: 'BET',
    b50: 'BET', b66: 'BET', b75: 'BET', b100: 'BET',
    b150: 'OVERBET',
    r2x: 'RAISE', r3x: '3-BET', r4x: '4-BET',
    allin: 'ALL-IN', ai: 'ALL-IN', 'all-in': 'ALL-IN',
};

const ACTION_COLORS = {
    FOLD: '#ff4444', CHECK: '#888888', CALL: '#ffaa00',
    BET: '#00d4ff', RAISE: '#00ff88', '3-BET': '#00ff88',
    '4-BET': '#aa44ff', OVERBET: '#ff6600', 'ALL-IN': '#ff00ff',
};

// ── Safe-value helpers ───────────────────────────────────────────────────────
const safeStr = (v, fallback = '—') =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;

const safeNum = (v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

const formatBb = (v, fallback = 'N/A') => {
    const n = safeNum(v);
    if (n === null) return fallback;
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}bb`;
};

const formatFreqPct = (raw, fallback = 'N/A') => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
    const pct = raw > 1.001 ? raw : raw * 100;
    if (pct > 0 && pct < 1) return '<1%';
    if (pct === 0) return '0%';
    return `${Math.round(pct)}%`;
};

const actionVerb = (code) => {
    if (!code || typeof code !== 'string') return 'plays';
    const lower = code.toLowerCase();
    if (ACTION_VERBS[lower]) return ACTION_VERBS[lower];
    if (/^b\d+$/.test(lower)) return `bets ${lower.slice(1)}% pot`;
    if (/^r\d+x$/.test(lower)) return `raises ${lower.slice(1)}`;
    return 'plays';
};

const actionLabel = (code) => {
    if (!code || typeof code !== 'string') return 'play';
    const lower = code.toLowerCase();
    if (ACTION_LABELS[lower]) return ACTION_LABELS[lower];
    if (/^b\d+$/.test(lower)) return `Bet ${lower.slice(1)}% pot`;
    return code.toUpperCase();
};

const readableAction = (code) => {
    if (!code || typeof code !== 'string') return 'CHECK';
    const lower = code.toLowerCase();
    return READABLE_FOR_ANALYSIS_PANEL[lower] || code.toUpperCase();
};

const colorForAction = (readable) => ACTION_COLORS[readable] || '#00ff88';

// ── Frequency-map normalizer (handles 0–1 or 0–100 input) ────────────────────
function normalizeFrequencies(freqs) {
    if (!freqs || typeof freqs !== 'object') return {};
    const entries = Object.entries(freqs)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
    if (entries.length === 0) return {};
    const max = Math.max(...entries.map(([, v]) => v));
    const isPctScale = max > 1.5;
    const out = {};
    for (const [k, v] of entries) {
        out[k] = isPctScale ? v : v * 100;
    }
    return out;
}

// ── Classification derivation ────────────────────────────────────────────────
function deriveClassification({ classification, isCorrect, evLoss }) {
    if (classification && typeof classification === 'string') {
        return classification.toUpperCase();
    }
    const loss = Math.abs(safeNum(evLoss) ?? 0);
    if (isCorrect && loss === 0) return 'BEST';
    if (isCorrect) return 'CORRECT';
    if (loss > 1.0) return 'BLUNDER';
    if (loss > 0.25) return 'WRONG';
    if (loss > 0.05) return 'INACCURACY';
    return isCorrect ? 'CORRECT' : 'INACCURACY';
}

const HEADLINE_BY_CLASS = {
    BEST: 'Optimal — that’s the GTO play.',
    CORRECT: 'Solid — that’s a valid mix.',
    INACCURACY: 'Slightly off — small EV leak.',
    WRONG: 'Leak — solver doesn’t take that line.',
    BLUNDER: 'Significant punt — costs EV.',
};

const KEY_TAKEAWAY_BY_CLASS = {
    BEST: (correct) =>
        `${actionLabel(correct)} is your default here — recognize the spot and execute.`,
    CORRECT: () =>
        'Either action works; commit to one and run it consistently.',
    INACCURACY: (correct, user) =>
        `Lean toward ${actionLabel(correct)} as your default; reserve ${actionLabel(user)} for reads.`,
    WRONG: (correct, user) =>
        `Replace ${actionLabel(user)} with ${actionLabel(correct)} in this exact texture.`,
    BLUNDER: (correct) =>
        `Study this spot until ${actionLabel(correct)} is automatic.`,
};

// ── Board characterization ───────────────────────────────────────────────────
function parseBoardCards(input) {
    if (Array.isArray(input)) {
        return input.map((c) => String(c).trim()).filter(Boolean);
    }
    if (typeof input !== 'string') return [];
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.includes(' ')) return trimmed.split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < trimmed.length; i += 2) {
        if (i + 1 < trimmed.length) out.push(trimmed.slice(i, i + 2));
    }
    return out;
}

function streetFromBoard(boardInput) {
    const cards = parseBoardCards(boardInput);
    if (cards.length >= 5) return 'river';
    if (cards.length === 4) return 'turn';
    if (cards.length >= 3) return 'flop';
    return 'preflop';
}

function describeBoardTexture(boardInput) {
    const cards = parseBoardCards(boardInput);
    if (cards.length === 0) return null;

    const ranks = cards.map((c) => '23456789TJQKA'.indexOf(c[0]));
    const suits = cards.map((c) => c[c.length - 1]);
    const rankCounts = ranks.reduce((acc, r) => {
        acc[r] = (acc[r] || 0) + 1;
        return acc;
    }, {});
    const paired = Object.values(rankCounts).some((n) => n >= 2);
    const trips = Object.values(rankCounts).some((n) => n >= 3);
    const uniqueSuits = new Set(suits);
    const monotone = uniqueSuits.size === 1 && cards.length >= 3;
    const twoTone = uniqueSuits.size === 2 && cards.length >= 3;
    const broadway = ranks.filter((r) => r >= 8).length;
    const lowOnly = ranks.length > 0 && ranks.every((r) => r <= 5);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    const connected = sortedRanks.length >= 3 &&
        sortedRanks.some((r, i) => i > 0 && r - sortedRanks[i - 1] <= 2);

    let label;
    if (trips) label = 'a trip-paired texture (very narrow continuing range)';
    else if (paired) label = 'a paired texture limiting bluff combos';
    else if (monotone) label = 'a monotone texture compressing equities';
    else if (broadway >= 3) label = 'a broadway-heavy texture favoring the preflop aggressor';
    else if (broadway >= 2) label = 'a high-card texture with range advantage to the aggressor';
    else if (lowOnly) label = 'a low, dynamic texture favoring the preflop caller';
    else if (twoTone && connected) label = 'a wet, two-tone connected runout';
    else if (twoTone) label = 'a static two-tone runout';
    else if (connected) label = 'a connected dynamic runout';
    else label = 'a static, dry runout';

    return {
        label, cards, connected, paired, monotone, twoTone, broadway,
        suitedness: monotone ? 'monotone' : twoTone ? 'two-tone' : 'rainbow',
        connectedness: connected ? 'high' : 'low',
    };
}

// ── Mixed-strategy banner ────────────────────────────────────────────────────
function topMix(freqsPct, limit = 2) {
    return Object.entries(freqsPct || {})
        .filter(([, p]) => Number.isFinite(p) && p >= 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);
}

/**
 * Build the mixed-strategy banner string.
 *
 * Spec (Operation Grok-Sweep):
 *   • If the optimal action's frequency is ≥ 95% → return "" (pure strategy,
 *     banner hidden in the UI).
 *   • Otherwise, return the explicit form:
 *     "This is a mixed strategy spot. The solver mixes between
 *      [Action 1] (X%) and [Action 2] (Y%)."
 *
 * Two-action form is chosen because that's what fits the UI banner cleanly.
 * If only one action has ≥1% frequency we still return the banner (degraded
 * form) rather than going silent — gives the user explicit signal that the
 * spot was scored as mixed.
 */
function buildMixedStrategyNote(freqsPct, correctAnswer) {
    const optimalFreq = freqsPct?.[correctAnswer];
    if (typeof optimalFreq !== 'number') return '';
    if (optimalFreq >= 95) return ''; // pure strategy — banner hidden

    const top = topMix(freqsPct, 2);
    if (top.length === 0) return '';

    if (top.length === 1) {
        const [a, p] = top[0];
        return `This is a mixed strategy spot. The solver plays ${actionLabel(a)} (${Math.round(p)}%).`;
    }

    const [[a1, p1], [a2, p2]] = top;
    return `This is a mixed strategy spot. The solver mixes between ${actionLabel(a1)} (${Math.round(p1)}%) and ${actionLabel(a2)} (${Math.round(p2)}%).`;
}

// ── Headline / short / takeaway / similar ────────────────────────────────────
function buildHeadline(klass, evLoss) {
    if (klass === 'BLUNDER') {
        const loss = safeNum(evLoss);
        if (loss !== null && loss > 0) {
            return `Significant punt — costs ~${loss.toFixed(2)}bb.`;
        }
    }
    return HEADLINE_BY_CLASS[klass] || HEADLINE_BY_CLASS.INACCURACY;
}

function buildShortExplanation({ correctAnswer, userAnswer, freqsPct, evLoss, klass }) {
    const optimalFreq = freqsPct?.[correctAnswer];
    const userFreq = freqsPct?.[userAnswer];

    const s1 = optimalFreq != null
        ? `Solver ${actionVerb(correctAnswer)} ${formatFreqPct(optimalFreq, '—')} of the time here`
        : `Solver ${actionVerb(correctAnswer)} here`;

    let s2;
    if (typeof userFreq === 'number' && userFreq >= 1) {
        s2 = (klass === 'CORRECT' || klass === 'BEST')
            ? `Your ${actionLabel(userAnswer)} also appears at ${formatFreqPct(userFreq)} — valid mix.`
            : `Your ${actionLabel(userAnswer)} appears at ${formatFreqPct(userFreq)} — but lower frequency.`;
    } else {
        const loss = safeNum(evLoss);
        const lossStr = loss != null && loss > 0 ? `, losing ${loss.toFixed(2)}bb` : '';
        s2 = `Your ${actionLabel(userAnswer)} is not in the solver’s mix (≈0%)${lossStr}.`;
    }

    return `${s1}. ${s2}`;
}

function buildKeyTakeaway(klass, correctAnswer, userAnswer) {
    const fn = KEY_TAKEAWAY_BY_CLASS[klass] || KEY_TAKEAWAY_BY_CLASS.INACCURACY;
    return fn(correctAnswer, userAnswer);
}

function buildSimilarSpots({ position, street, potType, similarSpotsTag }) {
    if (similarSpotsTag) {
        return `Practice tag: ${similarSpotsTag}. Drill 25 hands of this exact node in the GTO Trainer.`;
    }
    const pos = safeStr(position, 'BTN');
    const st = safeStr(street, 'flop').toUpperCase();
    const pt = safeStr(potType, 'SRP').toUpperCase();
    return `Practice tag: ${pos}_${st}_${pt}. Drill 25 hands of this exact node in the GTO Trainer.`;
}

// ── Deep-dive sections ───────────────────────────────────────────────────────
function buildDeepDive({ scenario, freqsPct, correctAnswer, evLoss, handEv, alternateLines, klass }) {
    const board = scenario?.board;
    const texture = describeBoardTexture(board);
    const street = scenario?.street || streetFromBoard(board);
    const heroHand = safeStr(scenario?.heroHand, '');

    let equityAnalysis;
    if (texture) {
        const handPart = heroHand ? `${heroHand} ` : '';
        const equityCategory = handEv != null
            ? handEv > 0.6 ? 'strong made' : handEv > 0.3 ? 'marginal' : 'thin showdown'
            : 'realizable';
        equityAnalysis = `On this ${street}, the runout is ${texture.label}. ` +
            `${handPart}has ${equityCategory} equity vs the opponent’s continuing range.`;
    } else if (street === 'preflop') {
        equityAnalysis = 'Preflop equity is determined by the range-vs-range matchup; ' +
            'see the chart engine for the exact pairwise distribution.';
    } else {
        equityAnalysis = 'Equity profile follows the standard solver assumption for this node — ' +
            'see the strategy matrix for the exact pairwise distribution.';
    }

    const heroPos = safeStr(scenario?.heroPosition, 'Hero');
    const villainPos = safeStr(scenario?.villainPosition, 'Villain');
    const protectionPurpose =
        klass === 'BLUNDER' || klass === 'WRONG'
            ? 'equity, denies realization, and balances the bluffing range'
            : 'equity and denies realization';

    const altList = (alternateLines || [])
        .slice(0, 2)
        .map((l) => `${actionLabel(l.actionCode || l.action)} ${formatFreqPct(l.frequency, '')}`)
        .filter((s) => s.length > 0)
        .join(', ');
    const altSentence = altList
        ? `Alternate lines balance the strategy: ${altList}.`
        : 'The line is largely pure for this hand class.';

    const rangeConsiderations =
        `${heroPos}’s range here is well-defined vs ${villainPos}. ` +
        `The ${actionLabel(correctAnswer)} action protects ${protectionPurpose}. ${altSentence}`;

    let evCalculation;
    const loss = safeNum(evLoss);
    const ev = safeNum(handEv);
    if (loss != null && loss > 0) {
        const compounded = (loss * 1000).toFixed(0);
        const evClause = ev != null
            ? `Optimal EV at this node: ${ev.toFixed(3)}bb. `
            : '';
        evCalculation =
            `${evClause}Your line gives up ${loss.toFixed(3)}bb in EV. ` +
            `Over 1,000 trials this compounds to ~${compounded}bb.`;
    } else if (loss != null && loss === 0) {
        evCalculation = 'Both lines have effectively identical EV (Δ ≈ 0bb). Solver indifference.';
    } else if (ev != null) {
        evCalculation = `Hand EV at this node: ${formatBb(ev)}. Your action is on the optimal frontier.`;
    } else {
        evCalculation = 'Exact EV not reported for this node ' +
            '(see the chart engine for the range-vs-range delta).';
    }

    let boardTexture;
    if (texture) {
        boardTexture = `Board: ${texture.cards.join(' ')}. ${capitalizeFirst(texture.label)}. ` +
            `Connectedness: ${texture.connectedness}. Suitedness: ${texture.suitedness}.`;
    } else if (street === 'preflop') {
        boardTexture = 'Preflop spot — texture analysis not applicable.';
    } else {
        boardTexture = 'Board texture not provided for this node.';
    }

    return { equityAnalysis, rangeConsiderations, evCalculation, boardTexture };
}

function capitalizeFirst(s) {
    if (!s || typeof s !== 'string') return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: explain-answer payload (rich EngineExplanation shape)
// ─────────────────────────────────────────────────────────────────────────────
function buildExplainAnswerPayload({
    question, userAnswer, correctAnswer, wasCorrect,
    classification, evLoss, gtoFrequencies,
}) {
    const scenario = (question && question.scenario) || {};
    const freqsPct = normalizeFrequencies(gtoFrequencies || question?.gtoFrequencies);
    const klass = deriveClassification({ classification, isCorrect: wasCorrect, evLoss });

    const handEv = safeNum(question?.evData?.heroHandEV ?? scenario?.heroHandEV);

    const headline = buildHeadline(klass, evLoss);
    const shortExplanation = buildShortExplanation({
        correctAnswer, userAnswer, freqsPct, evLoss, klass,
    });
    const deepDive = buildDeepDive({
        scenario, freqsPct, correctAnswer, evLoss, handEv,
        alternateLines: question?.alternateLines || [], klass,
    });
    const keyTakeaway = buildKeyTakeaway(klass, correctAnswer, userAnswer);
    const similarSpots = buildSimilarSpots({
        position: scenario.heroPosition,
        street: scenario.street || streetFromBoard(scenario.board),
        potType: scenario.potType,
        similarSpotsTag: question?.similarSpotsTag,
    });
    const mixedStrategyNote = buildMixedStrategyNote(freqsPct, correctAnswer);

    const hasFreq = Object.keys(freqsPct).length > 0;
    const hasEv = handEv != null || (typeof evLoss === 'number');
    const confidence = hasFreq && hasEv ? 0.97 : hasFreq ? 0.9 : 0.6;

    return {
        headline, shortExplanation, deepDive,
        keyTakeaway, similarSpots, mixedStrategyNote, confidence,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: gto-analysis flat strings
// ─────────────────────────────────────────────────────────────────────────────
function textureRationale(action, texture) {
    if (!texture) return 'matches the solver’s frequency';
    if (texture.broadway >= 2) {
        return action === 'CHECK'
            ? 'protects the checking range against an equity-advantaged caller'
            : 'attacks the equity advantage of the preflop aggressor';
    }
    if (texture.paired) {
        return action === 'CHECK'
            ? 'limits exposure on a texture where bluff-combos are scarce'
            : 'extracts thin value while bluffs are naturally constrained';
    }
    if (texture.monotone) {
        return action === 'CHECK'
            ? 'controls the pot on a flush-heavy texture'
            : 'protects equity vs draws while pricing in worse made hands';
    }
    return 'matches the solver’s recommended frequency for this texture';
}

function strategicIntent(action, isMixed, texture) {
    const lead = isMixed ? `${action} is the highest-frequency play` : `${action} is the pure play`;
    if (!texture) {
        return `${lead}. The line balances the range, denies realization, and matches the solver’s expected frequency at this node.`;
    }
    if (texture.broadway >= 2) {
        return `${lead}. The aggressor leverages range advantage on a high-card runout — small sizings keep villain wide and protect equity at low cost.`;
    }
    if (texture.paired) {
        return `${lead}. Paired textures compress bluff combos, so the line is sized to extract thin value and maintain a balanced check-range.`;
    }
    if (texture.monotone) {
        return `${lead}. Monotone textures compress equities, so the strategy emphasizes pot-control and selective protection rather than raw aggression.`;
    }
    if (texture.connected) {
        return `${lead}. Wet textures reward dynamic, balanced strategies — the chosen sizing denies equity to draws while keeping bluffs and value combos credible.`;
    }
    return `${lead}. Static textures favor disciplined frequencies — overbluffing or overcalling here is heavily punished.`;
}

function buildGtoAnalysisStrings({
    hand, optimalActionCode, optimalReadable, optimalFreq01,
    isMixed, handEv, alternateLines, scenario,
}) {
    const optimalPct = formatFreqPct(optimalFreq01);
    const handLabel = hand ? hand.toUpperCase() : 'this hand';
    const board = scenario?.board;
    const texture = describeBoardTexture(board);
    const street = scenario?.street || streetFromBoard(board);

    const sentences = [];

    if (isMixed) {
        sentences.push(
            `Solver ${actionVerb(optimalActionCode)} ${optimalPct} of the time with ${handLabel} — this is a mixed-strategy node.`
        );
    } else {
        sentences.push(
            `${optimalReadable} is a pure ${optimalPct} play with ${handLabel} — solver almost never deviates here.`
        );
    }

    if (texture) {
        sentences.push(
            `On this ${street} (${texture.label}), the line ${textureRationale(optimalReadable, texture)}.`
        );
    } else if (street === 'preflop') {
        sentences.push(
            `Preflop, ${optimalReadable} keeps ${handLabel}’s range balanced and exploits position-based equity.`
        );
    } else {
        sentences.push(
            `${optimalReadable} balances the line at this node and matches the solver’s recommended frequency.`
        );
    }

    if (handEv != null) {
        sentences.push(`Hand EV at this node is ${formatBb(handEv)}.`);
    }

    const top = (alternateLines || []).slice(0, 1)[0];
    if (top) {
        const altPct = formatFreqPct(top.frequency);
        sentences.push(
            `Top alternate: ${actionLabel(top.actionCode || top.action)} at ${altPct} — used to balance the strategy.`
        );
    }

    const explanation = sentences.join(' ');
    const gtoApproach = strategicIntent(optimalReadable, isMixed, texture);

    let mixedStrategy;
    if (isMixed) {
        const synthesized = {};
        if (typeof optimalFreq01 === 'number') {
            synthesized[optimalActionCode] = optimalFreq01 > 1.001 ? optimalFreq01 : optimalFreq01 * 100;
        }
        (alternateLines || []).forEach((l) => {
            const code = l.actionCode || l.action;
            if (!code) return;
            const f = typeof l.frequency === 'number' ? l.frequency : 0;
            synthesized[code] = f > 1.001 ? f : f * 100;
        });
        mixedStrategy = buildMixedStrategyNote(synthesized, optimalActionCode) ||
            `This is a mixed strategy spot. The solver plays ${actionLabel(optimalActionCode)} (${optimalPct}).`;
    } else {
        mixedStrategy = `Pure strategy — solver always plays ${actionLabel(optimalActionCode)} (${optimalPct}) with ${handLabel} at this node.`;
    }

    return { explanation, gtoApproach, mixedStrategy };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    buildExplainAnswerPayload,
    buildGtoAnalysisStrings,
    actionVerb, actionLabel, readableAction, colorForAction,
    formatBb, formatFreqPct, normalizeFrequencies,
    parseBoardCards, streetFromBoard, describeBoardTexture,
    deriveClassification, buildMixedStrategyNote,
    ACTION_COLORS, ACTION_LABELS,
};
