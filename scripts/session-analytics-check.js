/**
 * SESSION ANALYTICS CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: an end-to-end assertion over the session analytics pipeline
 * that feeds the post-session review screen. It lifts the REAL code:
 *
 *   - src/lib/sessionAnalytics.js — the derivation functions the review
 *     screen and useGTOWScore both call (evaluated verbatim, exports
 *     stripped, avatar-library-check style: a drift between what this
 *     harness runs and what ships would have to be a drift in the file
 *     itself), and
 *   - DeterministicGTOEngine.recordSessionHand — the grade-time writer that
 *     populates _sessionStats.history for the ~20 engine analysis methods
 *     that read it (lifted by brace-matching the method out of the class).
 *
 * It then plays a synthetic 20-decision session with hand-computed
 * classifications, positions, streets and EV losses, and asserts the numbers
 * the review screen derives EXACTLY: distribution counts, per-position
 * accuracy, per-street accuracy, leak ordering (including the tie rule),
 * and EV totals.
 *
 * WHY IT EXISTS: _sessionStats.history shipped unpopulated for its entire
 * life — every consumer returned null and nobody noticed, because nothing
 * asserted the pipeline end to end. This does.
 *
 *   node scripts/session-analytics-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_FILE = path.join(ROOT, 'src/lib/sessionAnalytics.js');
const ENGINE_FILE = path.join(ROOT, 'src/engines/DeterministicGTOEngine.js');

let PASS = 0, FAIL = 0;
function check(name, fn) {
    let ok = false, detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r);
    } catch (e) { detail = 'threw: ' + (e && e.message); }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}
function eq(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    return ja === jb ? true : 'expected ' + jb + ' got ' + ja;
}

// -- lift the shipping derivation module verbatim ---------------------------
// The lib is deliberately dependency-free plain JS; strip the export keywords
// and evaluate the file itself. Nothing below re-implements the math.
const libSource = fs.readFileSync(LIB_FILE, 'utf8');
check('lib is liftable: no imports, no JSX', () => {
    if (/^\s*import\s/m.test(libSource)) return 'found an import statement';
    if (/<[A-Za-z]+[\s>]/.test(libSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))) return 'found JSX-like markup';
    return true;
});

// eslint-disable-next-line no-new-func
const lib = new Function(
    libSource.replace(/^export /gm, '') +
    '\nreturn { CLASSIFICATION_KEYS, MISTAKE_CLASSIFICATIONS, deriveClassificationCounts, derivePositionAccuracy, deriveStreetAccuracy, deriveEVSummary, deriveTopLeaks };'
)();

const {
    deriveClassificationCounts,
    derivePositionAccuracy,
    deriveStreetAccuracy,
    deriveEVSummary,
    deriveTopLeaks,
} = lib;

// -- lift the engine's grade-time writer ------------------------------------
const engineSource = fs.readFileSync(ENGINE_FILE, 'utf8');
function extractMethod(source, name) {
    const marker = '    ' + name + '(';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('could not find method ' + name);
    const open = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1).trim();
    }
    }
    throw new Error('unterminated method ' + name);
}
// eslint-disable-next-line no-new-func
const recordSessionHand = new Function('return function ' + extractMethod(engineSource, 'recordSessionHand'))();

// -- the synthetic session ---------------------------------------------------
// 20 graded decisions with hand-computed expectations. Classifications use
// the rail vocabulary; EV losses include small losses on 'correct' moves
// (real solver grading does this) which must count toward totals but NEVER
// appear as leaks.
const S = [
    //  cls           evLoss  pos    street     action     correctAction
    ['best',        0,     'BTN', 'preflop', 'Raise 2.5x', 'Raise 2.5x'],
    ['correct',     0.12,  'CO',  'flop',    'Bet 50%',    'Bet 33%'],
    ['inaccuracy',  0.8,   'BB',  'turn',    'Check',      'Bet 50%'],
    ['best',        0,     'SB',  'river',   'Fold',       'Fold'],
    ['blunder',     3.5,   'UTG', 'flop',    'Call',       'Fold'],
    ['correct',     0.05,  'MP',  'preflop', 'Call',       'Call'],
    ['wrong',       1.6,   'BTN', 'turn',    'Bet 75%',    'Check'],
    ['best',        0,     'CO',  'river',   'Call',       'Call'],
    ['inaccuracy',  0.45,  'BB',  'flop',    'Call',       'Raise'],
    ['correct',     0.1,   'UTG', 'preflop', 'Fold',       'Fold'],
    ['blunder',     2.2,   'SB',  'river',   'Call',       'Fold'],
    ['best',        0,     'MP',  'flop',    'Bet 33%',    'Bet 33%'],
    ['wrong',       1.6,   'CO',  'turn',    'Check',      'Bet 50%'],
    ['correct',     0.07,  'BTN', 'flop',    'Check',      'Check'],
    ['inaccuracy',  0.3,   'BB',  'preflop', 'Call',       'Raise'],
    ['best',        0,     'UTG', 'turn',    'Check',      'Check'],
    ['wrong',       0.9,   'SB',  'flop',    'Bet 50%',    'Fold'],
    ['correct',     0.02,  'MP',  'river',   'Fold',       'Fold'],
    ['inaccuracy',  0.55,  'CO',  'preflop', 'Raise 3x',   'Call'],
    ['best',        0,     'BTN', 'river',   'Bet 75%',    'Bet 75%'],
];
// The exact shape useGTOWScore.recordMove appends to handHistory.
const handHistory = S.map(([classification, evLoss, heroPosition, street, action, correctAction], i) => ({
    handNumber: i + 1,
    classification, evLoss, heroPosition, street, action, correctAction,
    frequencyDiff: 0, timestamp: 1700000000000 + i,
}));

// -- 1. classification distribution (the segmented bar) ----------------------
const counts = deriveClassificationCounts(handHistory);
check('distribution: best=6',       () => eq(counts.best, 6));
check('distribution: correct=5',    () => eq(counts.correct, 5));
check('distribution: inaccuracy=4', () => eq(counts.inaccuracy, 4));
check('distribution: wrong=3',      () => eq(counts.wrong, 3));
check('distribution: blunder=2',    () => eq(counts.blunder, 2));
check('distribution: segments sum to every graded move (rail fill = review bar)', () =>
    eq(counts.best + counts.correct + counts.inaccuracy + counts.wrong + counts.blunder, handHistory.length));
check('distribution: unknown classification is not silently bucketed', () => {
    const c = deriveClassificationCounts([{ classification: 'meh', evLoss: 0 }]);
    return eq(c.best + c.correct + c.inaccuracy + c.wrong + c.blunder, 0);
});

// -- 2. per-position accuracy with hand counts -------------------------------
const posAcc = derivePositionAccuracy(handHistory);
check('position: BTN 3/4 = 75%',  () => eq(posAcc.BTN, { total: 4, correct: 3, accuracy: 75 }));
check('position: CO 2/4 = 50%',   () => eq(posAcc.CO,  { total: 4, correct: 2, accuracy: 50 }));
check('position: BB 0/3 = 0%',    () => eq(posAcc.BB,  { total: 3, correct: 0, accuracy: 0 }));
check('position: SB 1/3 = 33%',   () => eq(posAcc.SB,  { total: 3, correct: 1, accuracy: 33 }));
check('position: UTG 2/3 = 67%',  () => eq(posAcc.UTG, { total: 3, correct: 2, accuracy: 67 }));
check('position: MP 3/3 = 100%',  () => eq(posAcc.MP,  { total: 3, correct: 3, accuracy: 100 }));
check('position: totals cover all 20 moves', () =>
    eq(Object.values(posAcc).reduce((s, p) => s + p.total, 0), 20));
check('position: normalizes case and punctuation ("btn+" -> BTN)', () => {
    const a = derivePositionAccuracy([{ heroPosition: 'btn+', classification: 'best' }]);
    return eq(a.BTN, { total: 1, correct: 1, accuracy: 100 });
});

// -- 3. per-street accuracy --------------------------------------------------
const stAcc = deriveStreetAccuracy(handHistory);
check('street: preflop 3/5 = 60%', () => eq(stAcc.preflop, { total: 5, correct: 3, accuracy: 60 }));
check('street: flop 3/6 = 50%',    () => eq(stAcc.flop,    { total: 6, correct: 3, accuracy: 50 }));
check('street: turn 1/4 = 25%',    () => eq(stAcc.turn,    { total: 4, correct: 1, accuracy: 25 }));
check('street: river 4/5 = 80%',   () => eq(stAcc.river,   { total: 5, correct: 4, accuracy: 80 }));

// -- 4. EV totals (summary row + costly-spots header) ------------------------
const ev = deriveEVSummary(handHistory);
check('ev: total 12.26 BB (per-step cent rounding)', () => eq(ev.totalEVLoss, 12.26));
check('ev: movesMade 20',            () => eq(ev.movesMade, 20));
check('ev: mistakeCount 9 (inaccuracy+wrong+blunder only)', () => eq(ev.mistakeCount, 9));
check('ev: avg per mistake 1.36',    () => eq(ev.avgEVLossPerMistake, 1.36));
check('ev: avg per move 0.61',       () => eq(ev.avgEVLossPerMove, 0.61));
check('ev: clean session has zero mistakes and zero averages', () => {
    const clean = deriveEVSummary([{ classification: 'best', evLoss: 0 }]);
    return eq([clean.totalEVLoss, clean.mistakeCount, clean.avgEVLossPerMistake], [0, 0, 0]);
});

// -- 5. most costly spots (leak list) ----------------------------------------
const leaks = deriveTopLeaks(handHistory, 5);
check('leaks: exactly 5 returned', () => eq(leaks.length, 5));
check('leaks: ordered by EV lost desc — hands 5, 11, 7, 13, 17', () =>
    eq(leaks.map(l => l.handNumber), [5, 11, 7, 13, 17]));
check('leaks: 1.6-BB tie keeps session order (hand 7 before 13)', () => {
    const a = leaks.findIndex(l => l.handNumber === 7);
    const b = leaks.findIndex(l => l.handNumber === 13);
    return a >= 0 && b >= 0 && a < b ? true : 'order was ' + JSON.stringify(leaks.map(l => l.handNumber));
});
check('leaks: worst spot carries position/street/actions/EV verbatim', () =>
    eq(leaks[0], { handNumber: 5, heroPosition: 'UTG', street: 'flop', action: 'Call', correctAction: 'Fold', evLoss: 3.5, classification: 'blunder' }));
check('leaks: correct-graded moves with small EV loss are NOT leaks', () =>
    leaks.every(l => l.classification !== 'correct' && l.classification !== 'best') ||
    'a best/correct move leaked into the list');
check('leaks: full list is every EV-losing mistake (9)', () =>
    eq(deriveTopLeaks(handHistory, 99).length, 9));
check('leaks: perfect session yields an empty list', () =>
    eq(deriveTopLeaks([{ classification: 'best', evLoss: 0, handNumber: 1 }], 5), []));

// -- 6. engine writer: _sessionStats.history finally gets written ------------
const engineStub = {};
handHistory.forEach(h => {
    recordSessionHand.call(engineStub, {
        correct: h.classification === 'best' || h.classification === 'correct',
        classification: h.classification,
        evLoss: h.evLoss,
        street: h.street,
        nodeType: 'srp',
        action: h.action,
        selectedAction: h.action,
        correctAction: h.correctAction,
        handCategory: 'top pair',
        frequencies: { [h.correctAction]: 60 },
        heroPosition: h.heroPosition,
        texture: null,
    });
});
check('engine: 20 records land in _sessionStats.history', () =>
    eq(engineStub._sessionStats.history.length, 20));
check('engine: history entry carries the consumer contract fields', () => {
    const h = engineStub._sessionStats.history[4]; // the UTG blunder
    const want = { correct: false, classification: 'blunder', evLoss: 3.5, street: 'flop', heroPosition: 'UTG', position: 'UTG', selectedAction: 'Call', correctAction: 'Fold', handCategory: 'top pair' };
    for (const [k, v] of Object.entries(want)) {
        if (JSON.stringify(h[k]) !== JSON.stringify(v)) return k + ': expected ' + JSON.stringify(v) + ' got ' + JSON.stringify(h[k]);
    }
    if (!h.frequencies || h.frequencies.Fold !== 60) return 'frequencies not preserved';
    return true;
});
check('engine: _sessionStats.evLoss scalar matches the derived total', () =>
    eq(engineStub._sessionStats.evLoss, ev.totalEVLoss));
check('engine: correct flag matches best/correct classifications (11 true)', () =>
    eq(engineStub._sessionStats.history.filter(h => h.correct).length, 11));

// -- 7. the derived numbers agree with the engine history (one story) --------
check('cross-check: engine history and hook history derive identical distributions', () =>
    eq(deriveClassificationCounts(engineStub._sessionStats.history), counts));

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
