/**
 * TRAINER DIFFICULTY / ACTION-SET CHECK
 * ---------------------------------------------------------------------------
 * GTO Wizard parity #20, #21, #22 and the hand-history flat-spread law.
 *
 * The defects these assertions pin were all live in production on 2026-08-15,
 * all invisible to the existing suites, and two of them made hands literally
 * unwinnable:
 *
 *  1. TWO remappers ran on every question. useGTOTrainer.applyDifficultyToQuestion
 *     collapsed the action set (rewriting `b75` to the token `bet`), and then
 *     UniversalDynamicTable ran actionGrouper over that OUTPUT. The grouper
 *     knew only the raw solver vocabulary (`f`, `x`, `b33`), so the hook's
 *     spelled-out tokens fell into an `other` bucket that the emitter did not
 *     emit -- deleting the Fold and Check buttons entirely. A spot whose
 *     correct answer was Check had no button for it. The hook's own fail-safe
 *     ("serve unsimplified rather than unwinnable") could not help, because
 *     the damage happened after it returned.
 *
 *  2. GROUPED mode never produced its four sizing buckets. The four-bucket
 *     logic existed and was correct, but by the time it ran the sizings had
 *     already been erased, so `parseSizingPercent('bet')` returned null and
 *     every action skipped the bucketer. Measured on an `x/b33/b75/b125` node:
 *     the felt rendered `Check | Bet`.
 *
 *  3. `b101`..`b150` -- bets LARGER than the pot -- were labelled "Large Bet".
 *     An overbet is the strategic object the bucket exists to teach.
 *
 *  4. `c` (call) was categorised as 'check', so a button reading "Check"
 *     appeared facing a bet.
 *
 *  5. recordMove spreads handData FLAT; seven separate consumers read
 *     `h.handData.x` and silently rendered defaults forever.
 *
 * Run:  node scripts/trainer-difficulty-check.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    if (filename.includes('node_modules')) return origJs(mod, filename);
    const code = fs.readFileSync(filename, 'utf8');
    if (!/\b(import|export)\b/.test(code)) return origJs(mod, filename);
    const out = babel.transformSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
        parserOpts: {
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
        },
    });
    mod._compile(out.code, filename);
};

const {
    groupActions, resolveGroupedAction, getSimpleCategory,
    parseSizingPercent, getSizingGroup, DIFFICULTY_MODES,
} = require(path.join(ROOT, 'src/utils/actionGrouper.js'));
const { simplifyActions, DIFFICULTY, toEngineDifficulty } = require(path.join(ROOT, 'src/engines/DifficultyEngine.js'));
const {
    handFieldOf, handDataOf, heroPositionOf, streetOf, playerActionOf, compactHandHistoryEntry,
} = require(path.join(ROOT, 'src/lib/training/handHistoryEntry.js'));
const { deterministicEngine } = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));

let PASS = 0;
let FAIL = 0;
function check(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'threw: ' + e.message; }
    if (r === true) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  -- ' + r); }
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

console.log('\n=== #21 Simple mode: both action vocabularies survive ===');

check('the spelled-out tokens the hook emits are all classified', () => {
    const got = ['fold', 'check', 'call', 'bet', 'raise'].map(getSimpleCategory);
    const want = ['fold', 'check', 'call', 'bet_raise', 'bet_raise'];
    return JSON.stringify(got) === JSON.stringify(want) || JSON.stringify(got);
});

check('the raw solver ids are all classified', () => {
    const got = ['f', 'x', 'c', 'b33', 'r75', 'allin'].map(getSimpleCategory);
    const want = ['fold', 'check', 'call', 'bet_raise', 'bet_raise', 'bet_raise'];
    return JSON.stringify(got) === JSON.stringify(want) || JSON.stringify(got);
});

check("`c` is CALL, not check -- a Check button facing a bet is an illegal action", () => {
    return getSimpleCategory('c') === 'call' || 'got ' + getSimpleCategory('c');
});

check('a Check-best spot keeps its Check button in Simple mode (was unwinnable)', () => {
    // Exactly the shape the hook hands the table: spelled-out ids.
    const options = [{ id: 'check', text: 'Check' }, { id: 'bet', text: 'Bet' }];
    const freqs = { check: 60, bet: 40 };
    const { groupedOptions } = groupActions(options, freqs, DIFFICULTY_MODES.SIMPLE);
    const ids = groupedOptions.map((o) => o.id);
    return ids.includes('simple_check') || JSON.stringify(ids);
});

check('a Fold-best spot keeps its Fold button in Simple mode (was unwinnable)', () => {
    const options = [{ id: 'fold', text: 'Fold' }, { id: 'call', text: 'Call' }, { id: 'raise', text: 'Raise' }];
    const freqs = { fold: 40, call: 45, raise: 15 };
    const { groupedOptions, frequencyMap } = groupActions(options, freqs, DIFFICULTY_MODES.SIMPLE);
    const ids = groupedOptions.map((o) => o.id);
    if (!ids.includes('simple_fold')) return 'no fold button: ' + JSON.stringify(ids);
    return Math.abs(sum(frequencyMap) - 100) < 0.001 || 'freqs sum to ' + sum(frequencyMap);
});

check('Simple-mode frequencies always sum to 100 -- no bucket is silently dropped', () => {
    const cases = [
        [[{ id: 'check' }, { id: 'bet' }], { check: 60, bet: 40 }],
        [[{ id: 'fold' }, { id: 'call' }, { id: 'raise' }], { fold: 40, call: 45, raise: 15 }],
        [[{ id: 'x' }, { id: 'b33' }, { id: 'b75' }], { x: 60, b33: 15, b75: 25 }],
        // An id no classifier recognises must still reach the felt.
        [[{ id: 'weird_action', text: 'Straddle' }, { id: 'f' }], { weird_action: 30, f: 70 }],
    ];
    for (const [opts, freqs] of cases) {
        const { frequencyMap } = groupActions(opts, freqs, DIFFICULTY_MODES.SIMPLE);
        const s = sum(frequencyMap);
        if (Math.abs(s - 100) > 0.001) return `${JSON.stringify(Object.keys(freqs))} -> ${s}`;
    }
    return true;
});

check('an unclassifiable action keeps its own label rather than reading "Other"', () => {
    const { groupedOptions } = groupActions(
        [{ id: 'weird_action', text: 'Straddle' }, { id: 'f', text: 'Fold' }],
        { weird_action: 30, f: 70 },
        DIFFICULTY_MODES.SIMPLE
    );
    const other = groupedOptions.find((o) => o.id === 'simple_other');
    return (other && other.text === 'Straddle') || JSON.stringify(groupedOptions);
});

console.log('\n=== #21 Grouped mode: four real sizing buckets ===');

check('an overbet is an Overbet, not a Large Bet -- the boundary is the pot', () => {
    const got = [40, 41, 80, 81, 100, 101, 150, 200].map(getSizingGroup);
    const want = ['SMALL', 'MEDIUM', 'MEDIUM', 'LARGE', 'LARGE', 'OVERBET', 'OVERBET', 'OVERBET'];
    return JSON.stringify(got) === JSON.stringify(want) || JSON.stringify(got);
});

check('the sizing parser accepts every id shape the pipeline produces', () => {
    const cases = [['b33', 33], ['r75', 75], ['b33.5', 33.5], ['bet_66', 66], ['raise-75', 75]];
    for (const [id, want] of cases) {
        const got = parseSizingPercent(id);
        if (got !== want) return `${id} -> ${got}, want ${want}`;
    }
    if (parseSizingPercent('opt_2', 'Bet 45%') !== 45) return 'text fallback failed';
    if (parseSizingPercent('bet', '', 5, 10) !== 50) return 'amount/pot fallback failed';
    if (parseSizingPercent('check') !== null) return 'check parsed as a sizing';
    return true;
});

check('GROUPED simplification produces sizing buckets, not one flat "Bet"', () => {
    // The exact node the audit measured rendering as `Check | Bet`.
    const actions = [
        { id: 'x', text: 'Check', action: 'check', frequency: 40 },
        { id: 'b33', text: 'Bet 33%', action: 'bet', frequency: 20 },
        { id: 'b75', text: 'Bet 75%', action: 'bet', frequency: 25 },
        { id: 'b125', text: 'Bet 125%', action: 'bet', frequency: 15 },
    ];
    const out = simplifyActions(actions, DIFFICULTY.GROUPED, 10);
    const labels = out.map((a) => a.label || a.text);
    const hasSmall = labels.some((l) => /Small/.test(l));
    const hasMedium = labels.some((l) => /Medium/.test(l));
    const hasOver = labels.some((l) => /Overbet/.test(l));
    if (!(hasSmall && hasMedium && hasOver)) return JSON.stringify(labels);
    // b75 is Medium (41-80), b125 is Overbet, b33 is Small -- three distinct
    // buckets, so the mode teaches three distinct sizing decisions.
    return out.length === 4 || 'got ' + out.length + ' buttons: ' + JSON.stringify(labels);
});

check('each bucket reports the members it collapsed, so frequencies can aggregate', () => {
    const actions = [
        { id: 'b50', text: 'Bet 50%', action: 'bet', frequency: 30 },
        { id: 'b66', text: 'Bet 66%', action: 'bet', frequency: 25 },
    ];
    const out = simplifyActions(actions, DIFFICULTY.GROUPED, 10);
    if (out.length !== 1) return 'expected one Medium bucket, got ' + out.length;
    const ids = (out[0].mappedFrom || []).map((m) => m.id);
    return JSON.stringify(ids) === JSON.stringify(['b50', 'b66']) || JSON.stringify(ids);
});

check('a raise-only bucket says Raise -- you cannot bet when facing a bet', () => {
    const actions = [
        { id: 'r50', text: 'Raise 50%', action: 'raise', frequency: 30 },
        { id: 'r66', text: 'Raise 66%', action: 'raise', frequency: 25 },
    ];
    const out = simplifyActions(actions, DIFFICULTY.GROUPED, 10);
    return /Raise/.test(out[0].label) || 'label ' + out[0].label;
});

check('an aggressive action with no discoverable sizing keeps its own button', () => {
    // Rather than being merged into a bucket it may not belong in.
    const actions = [
        { id: 'bet', text: 'Bet', action: 'bet', frequency: 50 },
        { id: 'x', text: 'Check', action: 'check', frequency: 50 },
    ];
    const out = simplifyActions(actions, DIFFICULTY.GROUPED, null);
    return out.length === 2 || JSON.stringify(out.map((a) => a.label || a.id));
});

console.log('\n=== #21 grading: the bucket you picked contains the answer ===');

check('resolving a bucket prefers the solver answer over the popular member', () => {
    // b50 is played more often, but b75 is the key. Picking "Medium Bet" is a
    // correct choice of CATEGORY and must not be graded as b50.
    const mapping = { grouped_medium: ['b50', 'b75'] };
    const freqs = { b50: 30, b75: 25 };
    const got = resolveGroupedAction('grouped_medium', mapping, freqs, 'b75');
    return got === 'b75' || 'got ' + got;
});

check('with no answer key supplied it still falls back to the popular member', () => {
    const mapping = { grouped_medium: ['b50', 'b75'] };
    const got = resolveGroupedAction('grouped_medium', mapping, { b50: 30, b75: 25 });
    return got === 'b50' || 'got ' + got;
});

check("an answer key outside the bucket does not hijack the resolution", () => {
    const mapping = { grouped_small: ['b25', 'b33'] };
    const got = resolveGroupedAction('grouped_small', mapping, { b25: 10, b33: 40 }, 'b75');
    return got === 'b33' || 'got ' + got;
});

console.log('\n=== #21 vocabulary: the difficulty labels tell the truth ===');

check("TrainerConfigModal's 'Exact Sizings' card no longer resolves to GROUPED", () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/components/training/TrainerConfigModal.jsx'), 'utf8');
    if (/id:\s*'standard',\s*label:\s*'Standard'/.test(src)) return "still emits id 'standard'";
    if (!/id:\s*'exact'/.test(src)) return "no 'exact' id found";
    return toEngineDifficulty('exact') === DIFFICULTY.STANDARD
        || 'exact -> ' + toEngineDifficulty('exact');
});

check("the three UI tiers still map onto three DISTINCT engine tiers", () => {
    const got = ['beginner', 'standard', 'expert'].map(toEngineDifficulty);
    return new Set(got).size === 3 || JSON.stringify(got);
});

console.log('\n=== #20 no invented sizings on a check-only node ===');

check('a solver node with one action gains a generic Bet, not three fake sizings', () => {
    const fillers = deterministicEngine.getContextualFillers('hero_bets_or_checks', new Set(['x']), 10);
    const ids = fillers.map((f) => f.id);
    if (ids.some((id) => /^b\d+$/.test(id))) return 'still fabricates sizings: ' + JSON.stringify(ids);
    return ids.length <= 1 || JSON.stringify(ids);
});

console.log('\n=== the flat-spread law (handHistoryEntry) ===');

// The shape recordMove actually pushes.
const FLAT = {
    handNumber: 3, classification: 'blunder', evLoss: -0.8,
    heroPosition: 'btn', street: 'Turn', action: 'Check',
    rawFrequencies: { b33: { AA: 1 } }, evData: { handEVs: { AA: 2 }, actionEVs: { b33: 1 } },
};
// The shape an older build wrote into training_sessions.hand_history.
const NESTED = {
    handNumber: 3, classification: 'blunder', evLoss: -0.8,
    handData: { heroPosition: 'BB', street: 'river', action: 'Bet', rawFrequencies: { x: 1 } },
};

check('a flat entry reads correctly (this is the shape recordMove writes)', () => {
    return (heroPositionOf(FLAT) === 'BTN' && streetOf(FLAT) === 'turn' && playerActionOf(FLAT) === 'Check')
        || `${heroPositionOf(FLAT)} / ${streetOf(FLAT)} / ${playerActionOf(FLAT)}`;
});

check('a nested entry reads correctly too -- both shapes must work', () => {
    return (heroPositionOf(NESTED) === 'BB' && streetOf(NESTED) === 'river' && playerActionOf(NESTED) === 'Bet')
        || `${heroPositionOf(NESTED)} / ${streetOf(NESTED)}`;
});

check('a missing position reads UNK rather than throwing', () => {
    return heroPositionOf({ classification: 'best' }) === 'UNK' || 'got ' + heroPositionOf({});
});

check('a missing street reads null -- NOT flop', () => {
    // Four call sites defaulted to 'flop', which charged every unattributable
    // decision to the flop bucket and made the chart look plausible.
    return streetOf({ classification: 'best' }) === null || 'got ' + streetOf({});
});

check('an unrecognised street is rejected rather than passed through', () => {
    return streetOf({ street: 'showdown' }) === null || 'got ' + streetOf({ street: 'showdown' });
});

check('handDataOf on a flat entry exposes the scalar fields too', () => {
    const d = handDataOf(FLAT);
    return (d.heroPosition === 'btn' && d.evLoss === -0.8) || JSON.stringify(Object.keys(d));
});

check('handDataOf merges a nested entry over its own scalars', () => {
    const d = handDataOf(NESTED);
    return (d.heroPosition === 'BB' && d.classification === 'blunder') || JSON.stringify(d);
});

check('compaction actually strips the solver matrices off a FLAT entry', () => {
    const out = compactHandHistoryEntry(FLAT);
    if ('rawFrequencies' in out) return 'rawFrequencies survived';
    if (out.evData && 'handEVs' in out.evData) return 'handEVs survived';
    // and keeps what the review consumers read
    return (out.evData.actionEVs.b33 === 1 && out.heroPosition === 'btn') || JSON.stringify(out);
});

check('compaction still strips a nested entry', () => {
    const out = compactHandHistoryEntry(NESTED);
    return !('rawFrequencies' in out.handData) || 'nested rawFrequencies survived';
});

check('compaction does not mutate its input', () => {
    const before = JSON.stringify(FLAT);
    compactHandHistoryEntry(FLAT);
    return JSON.stringify(FLAT) === before || 'input was mutated';
});

console.log('\n=== #33 the deep coaching methods exist and return content ===');

const COACH = [
    ['getTeachingPrinciple', ['flop', 'hero_bets_or_checks', 'Bet 33%', 'top pair, top kicker', 'dry rainbow'], 'principle'],
    ['getPositionReminder', ['BTN', 'flop', 'hero_bets_or_checks'], 'tip'],
    ['getTextureStrategyGuide', ['two-tone', 'flop', 'CO', 'BB'], 'strategy'],
    ['getSPRStrategyGuide', [10, 100], 'guidance'],
    ['getVillainRangeNarration', ['turn', 'hero_faces_bet', ['bet']], 'narration'],
    ['getMultiStreetPlanningGuide', ['flop', 'a set', 'Bet 75%', 10, 100], 'plan'],
];

check('all six spot-level coaching methods exist on the engine', () => {
    const missing = COACH.map(([m]) => m).filter((m) => typeof deterministicEngine[m] !== 'function');
    return missing.length === 0 || 'missing: ' + missing.join(', ');
});

check('each returns the exact key its panel guards on', () => {
    for (const [method, args, key] of COACH) {
        const out = deterministicEngine[method](...args);
        if (!out || typeof out[key] !== 'string' || out[key].length < 20) {
            return `${method} -> ${JSON.stringify(out)}`;
        }
    }
    return true;
});

check('the coaching is deterministic -- same spot, same words', () => {
    for (const [method, args, key] of COACH) {
        const a = deterministicEngine[method](...args)[key];
        const b = deterministicEngine[method](...args)[key];
        if (a !== b) return method + ' varied between calls';
    }
    return true;
});

check('SPR is the real quotient, and the band matches it', () => {
    const low = deterministicEngine.getSPRStrategyGuide(50, 100);   // spr 2
    const high = deterministicEngine.getSPRStrategyGuide(5, 100);   // spr 20
    if (Math.abs(low.spr - 2) > 1e-9) return 'spr ' + low.spr;
    if (Math.abs(high.spr - 20) > 1e-9) return 'spr ' + high.spr;
    return (low.guidance !== high.guidance) || 'both bands gave the same advice';
});

check('a river spot has no next-street plan to give', () => {
    return deterministicEngine.getMultiStreetPlanningGuide('river', 'a set', 'Bet', 10, 100) === null
        || 'river returned a plan';
});

check('an unknown position returns null rather than a blank panel', () => {
    return deterministicEngine.getPositionReminder('', 'flop', '') === null || 'empty position returned a tip';
});

console.log('\n=== #33 the three session-level panels ===');

check('they stay silent on a session too short to judge', () => {
    deterministicEngine._sessionStats = { correct: 0, total: 0, recentWindow: [], history: [], evLoss: 0 };
    if (deterministicEngine.getFrequencyCorrectionPrompt() !== null) return 'freq prompt fired on empty history';
    if (deterministicEngine.getTiltRecoveryAdvice().severity !== 'none') return 'tilt fired on empty history';
    if (deterministicEngine.getSessionPacingAnalysis() !== null) return 'pacing fired on empty history';
    return true;
});

check('a player who folds far more than the solver is told so', () => {
    const hist = [];
    for (let i = 0; i < 20; i++) {
        // Solver says call every time; the player folds 14 of 20.
        hist.push({
            correct: false, classification: 'wrong', evLoss: -0.5,
            selectedAction: i < 14 ? 'Fold' : 'Call', correctAction: 'Call',
            timestamp: 1000 + i * 8000, answerTimeSeconds: 6,
        });
    }
    deterministicEngine._sessionStats = { correct: 0, total: 20, recentWindow: [], history: hist, evLoss: -10 };
    const p = deterministicEngine.getFrequencyCorrectionPrompt();
    if (!p) return 'no prompt';
    return (p.action === 'fold' && p.deviation > 0 && /more often/.test(p.message))
        || JSON.stringify(p);
});

check('a mix that matches the solver produces NO nag', () => {
    const hist = [];
    for (let i = 0; i < 20; i++) {
        hist.push({
            correct: true, classification: 'best', evLoss: 0,
            selectedAction: i % 2 ? 'Fold' : 'Call', correctAction: i % 2 ? 'Fold' : 'Call',
            timestamp: 1000 + i * 8000, answerTimeSeconds: 6,
        });
    }
    deterministicEngine._sessionStats = { correct: 20, total: 20, recentWindow: [], history: hist, evLoss: 0 };
    return deterministicEngine.getFrequencyCorrectionPrompt() === null || 'nagged a solver-perfect mix';
});

check('four blunders in a row escalates to critical', () => {
    const hist = [];
    for (let i = 0; i < 10; i++) {
        const bad = i >= 6;
        hist.push({
            correct: !bad, classification: bad ? 'blunder' : 'best', evLoss: bad ? -1 : 0,
            selectedAction: 'Bet', correctAction: bad ? 'Check' : 'Bet',
            timestamp: 1000 + i * 8000, answerTimeSeconds: 5,
        });
    }
    deterministicEngine._sessionStats = { correct: 6, total: 10, recentWindow: [], history: hist, evLoss: -4 };
    const t = deterministicEngine.getTiltRecoveryAdvice();
    return (t.severity === 'critical' && typeof t.advice === 'string' && t.advice.length > 20)
        || JSON.stringify(t);
});

check('a clean session gets no tilt warning', () => {
    const hist = [];
    for (let i = 0; i < 10; i++) {
        hist.push({
            correct: true, classification: 'best', evLoss: 0,
            selectedAction: 'Bet', correctAction: 'Bet',
            timestamp: 1000 + i * 8000, answerTimeSeconds: 5,
        });
    }
    deterministicEngine._sessionStats = { correct: 10, total: 10, recentWindow: [], history: hist, evLoss: 0 };
    return deterministicEngine.getTiltRecoveryAdvice().severity === 'none'
        || JSON.stringify(deterministicEngine.getTiltRecoveryAdvice());
});

check('pacing measures the decision time, not the reading time', () => {
    const hist = [];
    for (let i = 0; i < 10; i++) {
        hist.push({
            correct: true, classification: 'best', evLoss: 0,
            selectedAction: 'Bet', correctAction: 'Bet',
            // 4s to decide, but 30s between recorded hands (feedback reading).
            timestamp: 1000 + i * 30000, answerTimeSeconds: 4,
        });
    }
    deterministicEngine._sessionStats = { correct: 10, total: 10, recentWindow: [], history: hist, evLoss: 0 };
    const p = deterministicEngine.getSessionPacingAnalysis();
    if (!p) return 'no pacing';
    return Math.abs(p.avgTimePerHand - 4) < 1e-9 || 'avg ' + p.avgTimePerHand;
});

check('snap decisions that are LESS accurate trigger slow_down', () => {
    const hist = [];
    // 6 fast + wrong, 6 slow + right.
    for (let i = 0; i < 6; i++) {
        hist.push({ correct: false, classification: 'blunder', evLoss: -1, selectedAction: 'Bet', correctAction: 'Check', timestamp: 1000 + i * 5000, answerTimeSeconds: 1.5 });
    }
    for (let i = 6; i < 12; i++) {
        hist.push({ correct: true, classification: 'best', evLoss: 0, selectedAction: 'Bet', correctAction: 'Bet', timestamp: 1000 + i * 5000, answerTimeSeconds: 15 });
    }
    deterministicEngine._sessionStats = { correct: 6, total: 12, recentWindow: [], history: hist, evLoss: -6 };
    const p = deterministicEngine.getSessionPacingAnalysis();
    return (p && p.recommendation === 'slow_down') || JSON.stringify(p && p.recommendation);
});

check('fast AND accurate is praised, not corrected', () => {
    const hist = [];
    for (let i = 0; i < 12; i++) {
        hist.push({ correct: true, classification: 'best', evLoss: 0, selectedAction: 'Bet', correctAction: 'Bet', timestamp: 1000 + i * 3000, answerTimeSeconds: 2 });
    }
    deterministicEngine._sessionStats = { correct: 12, total: 12, recentWindow: [], history: hist, evLoss: 0 };
    const p = deterministicEngine.getSessionPacingAnalysis();
    return (p && p.recommendation === 'steady') || JSON.stringify(p && p.recommendation);
});

console.log('\n=== spot difficulty reads the solver\'s own strategy ===');

check('a 95/5 node is easier than a 40/35/25 node', () => {
    const easy = deterministicEngine.estimateSpotDifficultyEnhanced({ b33: 95, x: 5 }, 'flop', 100, '', 'BTN', 'BB', 'air', 'dry rainbow');
    const hard = deterministicEngine.estimateSpotDifficultyEnhanced({ b33: 40, b75: 35, x: 25 }, 'river', 100, '', 'BB', 'BTN', 'middle pair', 'two-tone');
    return hard.difficulty > easy.difficulty || `easy ${easy.difficulty} hard ${hard.difficulty}`;
});

check('difficulty stays inside 1..5 with a label for every value', () => {
    const inputs = [
        [{ x: 100 }, 'preflop', 20, '', 'BTN', 'BB', 'quads', ''],
        [{ a: 20, b: 20, c: 20, d: 20, e: 20 }, 'river', 200, '3bet', 'SB', 'BTN', 'second pair', 'monotone'],
        [null, 'flop', 100, '', '', '', '', ''],
    ];
    for (const args of inputs) {
        const r = deterministicEngine.estimateSpotDifficultyEnhanced(...args);
        if (!(r.difficulty >= 1 && r.difficulty <= 5)) return 'out of range: ' + r.difficulty;
        if (!r.label) return 'no label for ' + r.difficulty;
    }
    return true;
});

console.log('\n=== #36 hand-class strategy (Strategy tab range breakdown) ===');

const {
    classifyHandClass, aggregateByHandClass, buildClassificationData,
    HAND_CLASS_LABELS,
} = require(path.join(ROOT, 'src/lib/training/handClassStrategy.js'));

check('made hands classify exactly against the board', () => {
    const B = ['Ah', '7d', '2s'];
    const cases = [
        ['AKo', 'top_pair'], ['A5s', 'top_pair'],
        ['77', 'monster'], ['22', 'monster'],           // sets
        ['A7o', 'two_pair_plus'],
        // KK on an ACE-high board is NOT an overpair -- it is a pocket pair
        // under the top card, which plays like second pair. Getting this
        // backwards is the classic way a "hand strength" panel flatters the
        // player into stacking off.
        ['KK', 'middle_pair'], ['QQ', 'middle_pair'],
        ['87s', 'middle_pair'], ['32s', 'weak_pair'],
        ['KQo', 'air'],                                  // both below the ace
    ];
    for (const [hand, want] of cases) {
        const got = classifyHandClass(hand, B);
        if (got !== want) return `${hand} -> ${got}, want ${want}`;
    }
    return true;
});

check('a pocket pair over the top card is an overpair, under it is not', () => {
    const B = ['Qh', '7d', '2s'];
    return (classifyHandClass('KK', B) === 'overpair' && classifyHandClass('JJ', B) !== 'overpair')
        || `KK ${classifyHandClass('KK', B)} JJ ${classifyHandClass('JJ', B)}`;
});

check('straight draws are rank-exact: open-ender vs gutshot vs neither', () => {
    const B = ['9h', '8d', '2s'];
    const cases = [['JTo', 'oesd'], ['76s', 'oesd'], ['J7o', 'gutshot'], ['K4o', 'air']];
    for (const [hand, want] of cases) {
        const got = classifyHandClass(hand, B);
        if (got !== want) return `${hand} -> ${got}, want ${want}`;
    }
    return true;
});

check('a made straight outranks the draw buckets', () => {
    return classifyHandClass('JTo', ['9h', '8d', '7s']) === 'monster'
        || 'got ' + classifyHandClass('JTo', ['9h', '8d', '7s']);
});

check('trips need a paired board, and are found there', () => {
    return classifyHandClass('K2o', ['Kh', 'Kd', '4s']) === 'monster'
        || 'got ' + classifyHandClass('K2o', ['Kh', 'Kd', '4s']);
});

check('preflop uses starting-hand buckets, not board-relative ones', () => {
    const cases = [['AA', 'premium'], ['AKo', 'premium'], ['77', 'pairs'],
                   ['KQs', 'broadway_suited'], ['KQo', 'broadway_offsuit'],
                   ['76s', 'suited_connectors'], ['72o', 'offsuit_other']];
    for (const [hand, want] of cases) {
        const got = classifyHandClass(hand, []);
        if (got !== want) return `${hand} -> ${got}, want ${want}`;
    }
    return true;
});

check('aggregation is COMBO-weighted, not per-class averaged', () => {
    // One pocket pair (6 combos, always bets) and one offsuit class (12
    // combos, always checks). A per-class average would report 50/50; the
    // truth is 33/67, because there are twice as many of the checking hands.
    const grid = { QQ: { b: 100, x: 0 }, KJo: { b: 0, x: 100 } };
    const out = aggregateByHandClass(grid, [{ id: 'b' }, { id: 'x' }], ['Th', '5d', '2s']);
    if (!out) return 'no output';
    if (out.totalCombos !== 18) return 'combos ' + out.totalCombos;
    const overpair = out.rows.find((r) => r.key === 'overpair');
    const air = out.rows.find((r) => r.key === 'overcards' || r.key === 'air');
    if (!overpair || !air) return JSON.stringify(out.rows.map((r) => r.key));
    return (overpair.share === 33.3 && air.share === 66.7)
        || `${overpair.share} / ${air.share}`;
});

check('each class mix sums to 100 regardless of the input scale', () => {
    // fractions, percentages and basis-points all normalise the same way
    for (const scale of [1, 100, 1000]) {
        const grid = { AKo: { b: 0.75 * scale, x: 0.25 * scale } };
        const out = aggregateByHandClass(grid, [{ id: 'b' }, { id: 'x' }], ['Ah', '7d', '2s']);
        if (!out) return 'no output at scale ' + scale;
        const mix = out.rows[0].mix;
        if (Math.abs(mix.b + mix.x - 100) > 0.2) return `scale ${scale} -> ${mix.b}+${mix.x}`;
        if (Math.abs(mix.b - 75) > 0.2) return `scale ${scale} bet ${mix.b}`;
    }
    return true;
});

check('classes with zero frequency are excluded from the range entirely', () => {
    const grid = { AKo: { b: 50, x: 50 }, '72o': { b: 0, x: 0 } };
    const out = aggregateByHandClass(grid, [{ id: 'b' }, { id: 'x' }], ['Ah', '7d', '2s']);
    // 72o is not in the range, so it must not dilute the combo total.
    return out.totalCombos === 12 || 'combos ' + out.totalCombos;
});

check('a flush-draw bucket is never invented from suit-blind data', () => {
    // The classifier must not claim a flush draw for a suited class on a
    // two-tone board -- it holds one in 1 combo of 4 and the notation cannot
    // say which. Reporting it would be wrong three times in four.
    const keys = new Set(Object.keys(HAND_CLASS_LABELS));
    return !keys.has('flush_draw') || 'a flush_draw bucket exists';
});

check('the suited caveat is stated on a board, and absent preflop', () => {
    const grid = { AKs: { b: 100, x: 0 } };
    const post = aggregateByHandClass(grid, [{ id: 'b' }, { id: 'x' }], ['Ah', '7d', '2s']);
    const pre = aggregateByHandClass(grid, [{ id: 'b' }, { id: 'x' }], []);
    return (typeof post.suitedNote === 'string' && pre.suitedNote === null)
        || `post ${post.suitedNote} / pre ${pre.suitedNote}`;
});

check('classification data covers every class in the grid, with a colour', () => {
    const grid = { AA: {}, AKs: {}, '72o': {} };
    const cd = buildClassificationData(grid, ['Ah', '7d', '2s']);
    if (!cd) return 'null';
    for (const h of Object.keys(grid)) {
        if (!cd[h] || !cd[h].color || !cd[h].label) return 'missing for ' + h;
    }
    return true;
});

check('unparseable notation is skipped rather than bucketed as air', () => {
    return classifyHandClass('ZZ', ['Ah', '7d', '2s']) === null
        && classifyHandClass('', []) === null
        || 'garbage notation was classified';
});

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
