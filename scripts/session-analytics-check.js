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

// -- 8. the engine analytics the review screen now surfaces ------------------
// The Mistakes / Positions & Streets / Concepts review tabs (added 2026-08-08
// in the 278-tab consolidation) render getMistakeClusters,
// getCriticalHandHighlights, getStreakAnalysis, getEVLossHeatmap,
// getPositionLeaderboard, getNodeTypeBreakdown and getConceptMasteryReport.
// Lift each method verbatim and assert exact hand-computed numbers over the
// same synthetic session. The stub mirrors the hook's write order —
// updateSessionDifficulty(isCorrect) then recordSessionHand(...) per graded
// hand (useGTOTrainer submitAnswer) — because getConceptMasteryReport gates
// on _sessionStats.total, which only updateSessionDifficulty increments.
const analyticsStub = {};
const updateSessionDifficulty = new Function('return function ' + extractMethod(engineSource, 'updateSessionDifficulty'))();
[
    '_normalizeActionCategory', '_identifyHandConcepts',
    'getMistakeClusters', 'getConceptMasteryReport', 'getStreakAnalysis',
    'getCriticalHandHighlights', 'getNodeTypeBreakdown', 'getEVLossHeatmap',
    'getPositionLeaderboard',
].forEach((name) => {
    // eslint-disable-next-line no-new-func
    analyticsStub[name] = new Function('return function ' + extractMethod(engineSource, name))();
});
handHistory.forEach(h => {
    const isCorrect = h.classification === 'best' || h.classification === 'correct';
    updateSessionDifficulty.call(analyticsStub, isCorrect);
    recordSessionHand.call(analyticsStub, {
        correct: isCorrect,
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

// getMistakeClusters — the Mistakes tab's cluster list
const mc = analyticsStub.getMistakeClusters();
check('clusters: all 9 mistakes counted', () => eq(mc.totalMistakes, 9));
check('clusters: 8 patterns, counts re-sum to every mistake', () =>
    eq([mc.clusters.length, mc.clusters.reduce((s, c) => s + c.count, 0)], [8, 9]));
check('clusters: top cluster is turn Check-instead-of-Bet, 2x, -2.4 BB, high', () => {
    const c = mc.clusters[0];
    return eq(
        [c.street, c.userAction, c.solverAction, c.count, c.evLoss, c.severity],
        ['turn', 'Check', 'Bet', 2, 2.4, 'high']
    );
});
check('clusters: description renders verbatim for the UI', () =>
    eq(mc.clusters[0].description, 'turn: You check instead of bet (2x, -2.40 BB)'));

// getCriticalHandHighlights — the Mistakes tab's decisive-hand cards
const ch = analyticsStub.getCriticalHandHighlights();
check('critical: biggest mistakes are hands 5, 11, 7 (EV desc, 1.6-tie keeps order)', () =>
    eq(ch.biggestMistakes.map(m => m.handNumber), [5, 11, 7]));
check('critical: worst spot carries -3.5 BB; top-3 sum to 7.3', () =>
    eq([ch.biggestMistakes[0].evLoss, ch.summaryEVLost], [3.5, 7.3]));
check('critical: best decisions are hands 1 and 2, typed great_play', () =>
    eq(ch.bestDecisions.map(b => [b.handNumber, b.type]), [[1, 'great_play'], [2, 'great_play']]));

// getStreakAnalysis — the Mistakes tab's mental-game panel
const sa = analyticsStub.getStreakAnalysis();
check('streaks: alternating tail — best run 1, worst run 0, current 1 win', () =>
    eq([sa.longestWinStreak, sa.longestLossStreak, sa.currentStreak, sa.currentStreakType],
       [1, 0, 1, 'win']));
check('streaks: perfect recovery — 9 rebounds, 0 repeats, tilt resistance 100', () =>
    eq([sa.recoveryAfterMistake, sa.tiltAfterMistake, sa.tiltResistance], [9, 0, 100]));

// getEVLossHeatmap — the Positions & Streets tab's grid
const hm = analyticsStub.getEVLossHeatmap();
check('heatmap: 6x4 grid, maxLoss 3.5, UTG flop is the only full-intensity cell', () => {
    const hot = hm.cells.filter(c => c.intensity === 1);
    return eq(
        [hm.cells.length, hm.maxLoss, hot.length, hot[0].position, hot[0].street, hot[0].avgEVLoss],
        [24, 3.5, 1, 'UTG', 'flop', 3.5]
    );
});
check('heatmap: SB river pools 2 hands at avg 1.1', () => {
    const c = hm.cells.find(x => x.position === 'SB' && x.street === 'river');
    return eq([c.hands, c.totalEVLoss, c.avgEVLoss], [2, 2.2, 1.1]);
});
check('heatmap: cell hands and EV re-sum to the session totals (one story)', () => {
    const hands = hm.cells.reduce((s, c) => s + c.hands, 0);
    const evSum = Math.round(hm.cells.reduce((s, c) => s + c.totalEVLoss, 0) * 100) / 100;
    return eq([hands, evSum], [20, ev.totalEVLoss]);
});

// getPositionLeaderboard — the Positions & Streets tab's ranked bars
const lb = analyticsStub.getPositionLeaderboard();
check('leaderboard: MP,BTN,UTG,CO,SB,BB graded A,B,B,C,D,D', () =>
    eq(lb.leaderboard.map(r => [r.position, r.accuracy, r.grade]),
       [['MP', 100, 'A'], ['BTN', 75, 'B'], ['UTG', 67, 'B'], ['CO', 50, 'C'], ['SB', 33, 'D'], ['BB', 0, 'D']]));
check('leaderboard: best MP (leaked 0.07 BB), worst BB', () =>
    eq([lb.bestPosition.position, lb.bestPosition.evLoss, lb.worstPosition.position],
       ['MP', 0.07, 'BB']));

// getNodeTypeBreakdown — the Positions & Streets tab's decision-type bars
const nb = analyticsStub.getNodeTypeBreakdown();
check('nodetype: single Srp node at 11/20 = 55%, avg -0.61 BB/hand', () =>
    eq(nb.breakdown, [{ nodeType: 'Srp', total: 20, correct: 11, accuracy: 55, avgEVLoss: 0.61 }]));
check('nodetype: the only node is also the weakest', () =>
    eq(nb.weakestNodeType && nb.weakestNodeType.nodeType, 'Srp'));

// getConceptMasteryReport — the Concepts tab's bars
const cm = analyticsStub.getConceptMasteryReport();
check('concepts: 5 concepts sorted weakest-first with exact accuracies', () =>
    eq(cm.concepts.map(c => [c.name, c.accuracy]),
       [['Aggression', 33], ['Strong Made Hands', 55], ['Preflop Strategy', 60], ['River Calling', 100], ['River Value', 100]]));
check('concepts: Aggression is flagged struggling (1/3 with 3+ samples)', () => {
    const a = cm.concepts[0];
    return eq([a.correct, a.total, a.struggling, a.mastered], [1, 3, true, false]);
});
check('concepts: Strong Made Hands counts every hand — 11/20', () => {
    const s = cm.concepts.find(c => c.name === 'Strong Made Hands');
    return eq([s.correct, s.total], [11, 20]);
});
check('concepts: nothing mastered (no concept at 75%+ with 3+ samples)', () =>
    eq([cm.masteredCount, cm.overallMastery, cm.weakestConcept.name, cm.strongestConcept.name],
       [0, 0, 'Aggression', 'River Value']));
check('concepts: top pair does NOT tag Bluffing (air is a substring of pair)', () => {
    const tags = analyticsStub._identifyHandConcepts({ handCategory: 'top pair', street: 'flop', nodeType: 'srp', correctAction: 'Check' });
    if (tags.indexOf('Bluffing') !== -1) return 'Bluffing leaked from the pair category';
    return eq(tags.indexOf('Strong Made Hands') !== -1, true);
});
check('concepts: genuine air still tags Bluffing', () => {
    const tags = analyticsStub._identifyHandConcepts({ handCategory: 'air', street: 'flop', nodeType: 'srp', correctAction: 'Check' });
    return eq(tags.indexOf('Bluffing') !== -1, true);
});
check('concepts: report is gated on updateSessionDifficulty total, not history', () => {
    const bare = { _sessionStats: { total: 2, correct: 1, history: analyticsStub._sessionStats.history } };
    bare.getConceptMasteryReport = analyticsStub.getConceptMasteryReport;
    bare._identifyHandConcepts = analyticsStub._identifyHandConcepts;
    const r = bare.getConceptMasteryReport();
    return eq([r.concepts.length, typeof r.message], [0, 'string']);
});

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
