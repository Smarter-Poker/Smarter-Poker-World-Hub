/**
 * CROSS-SESSION ANALYTICS CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: a correctness sweep over the lifetime-aggregation code behind
 * GET /api/training/analytics and GET /api/training/get-sessions -- the read
 * side of cross-session progress (review Analytics tab + dashboard Progress
 * block). Following the lift-and-evaluate pattern of avatar-library-check.js,
 * it lifts the REAL functions out of pages/api/training/analytics.js and
 * pages/api/training/get-sessions.js verbatim (they are plain JS, no JSX) and
 * runs them against synthetic rows shaped EXACTLY like the production tables:
 *
 *   training_sessions: id, user_id, game_id, game_name, gtow_score,
 *     total_ev_loss, hands_played, mistake_count, accuracy, correct_count,
 *     best_streak, level_passed, level, hand_history, position_stats,
 *     classification_counts, trainer_config, avg_ev_loss_per_hand,
 *     avg_frequency_diff, created_at, score_scale, avg_ev_loss_per_mistake
 *   training_answers: user_id, game_id, question_id, answer_id, is_correct,
 *     level, answered_at, hero_position, villain_position, street,
 *     classification, ev_loss, spot_type
 *
 * WHAT IT ASSERTS:
 *   - score_scale normalization: scale-1 legacy rows (unsigned 0..100) map to
 *     the signed scale via signed = value*2-100; scale-2 rows pass through;
 *     a null gtow_score falls back to accuracy treated as scale 1
 *   - scoreTrend is ascending, carries id/gameId, and every score is signed
 *   - dailyTrend buckets answers + sessions by UTC day with exact accuracy,
 *     EV-loss and signed-score-average values (a day with sessions but no
 *     answers reports accuracy null, never a fake 0)
 *   - positionAccuracy / streetAccuracy / spotAccuracy /
 *     classificationBreakdown aggregates from training_answers are exact
 *   - milestones (totals, bestScore, currentStreak, last5Avg) are exact and
 *     signed
 *   - actionAccuracy derives the action from answer_id correctly
 *   - mistakePatterns ranks by severity (count x avg EV) and excludes
 *     best/correct answers
 *   - get-sessions signedGtowScore agrees with analytics normalization
 *
 * WHY IT EXISTS: the review Analytics tab shipped rendering sample data with
 * sessionHistory={[]}; nothing exercised the aggregation path end to end, and
 * mixed score_scale rows would silently corrupt every trend the moment the
 * real data flowed. No network access is needed -- the shapes above were
 * verified against the production DB and are frozen here.
 *
 *   node scripts/cross-session-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANALYTICS_FILE = path.join(ROOT, 'pages/api/training/analytics.js');
const GET_SESSIONS_FILE = path.join(ROOT, 'pages/api/training/get-sessions.js');

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

// -- lift the shipped functions verbatim -------------------------------------
function extractFunction(source, name, fileLabel) {
    const marker = 'function ' + name + '(';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('could not find function ' + name + ' in ' + fileLabel);
    const open = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unterminated function ' + name + ' in ' + fileLabel);
}

const analyticsSource = fs.readFileSync(ANALYTICS_FILE, 'utf8');
const LIFTED = [
    'normalizeGtowScore', 'sessionSignedScore', 'buildDailyTrend',
    'aggregateByField', 'buildScoreTrend', 'buildClassificationTrend',
    'extractMistakePatterns', 'computeMilestones', 'buildActionAccuracy',
];
const liftedBody = LIFTED.map(n => extractFunction(analyticsSource, n, 'analytics.js')).join('\n\n');
// eslint-disable-next-line no-new-func
const A = new Function(liftedBody + '\nreturn { ' + LIFTED.join(', ') + ' };')();

const getSessionsSource = fs.readFileSync(GET_SESSIONS_FILE, 'utf8');
// eslint-disable-next-line no-new-func
const signedGtowScore = new Function(
    extractFunction(getSessionsSource, 'signedGtowScore', 'get-sessions.js') + '\nreturn signedGtowScore;'
)();

// -- synthetic rows, production-shaped ---------------------------------------
const U = 'user-0001';
function sessionRow(over) {
    return Object.assign({
        id: 'sess-x', user_id: U, game_id: 'mtt-cbet-defense', game_name: 'C-Bet Defense',
        gtow_score: 0, total_ev_loss: 0, hands_played: 0, mistake_count: 0,
        accuracy: 0, correct_count: 0, best_streak: 0, level_passed: false, level: 1,
        hand_history: [], position_stats: {}, classification_counts: {},
        trainer_config: null, avg_ev_loss_per_hand: 0, avg_frequency_diff: 0,
        created_at: '2026-08-01T10:00:00.000Z', score_scale: 2, avg_ev_loss_per_mistake: 0,
    }, over);
}

const SESSIONS = [
    // current writer: score_scale 2, signed score
    sessionRow({ id: 'sess-1', gtow_score: 40, score_scale: 2, total_ev_loss: 3.5, hands_played: 20, mistake_count: 3, accuracy: 85, correct_count: 17, best_streak: 9, level_passed: true, created_at: '2026-08-01T10:00:00.000Z' }),
    // LEGACY row: score_scale 1, unsigned 75 -> signed 50. Proves normalization.
    sessionRow({ id: 'sess-2', gtow_score: 75, score_scale: 1, total_ev_loss: 2.0, hands_played: 10, mistake_count: 2, accuracy: 75, correct_count: 8, best_streak: 4, level_passed: false, created_at: '2026-08-01T20:00:00.000Z' }),
    // negative signed score
    sessionRow({ id: 'sess-3', gtow_score: -20, score_scale: 2, total_ev_loss: 6.25, hands_played: 15, mistake_count: 7, accuracy: 55, correct_count: 8, best_streak: 2, level_passed: false, created_at: '2026-08-03T12:00:00.000Z' }),
    // gtow_score never written -> accuracy (0..100) treated as scale 1 -> 20
    sessionRow({ id: 'sess-4', gtow_score: null, score_scale: null, total_ev_loss: 1.0, hands_played: 5, mistake_count: 2, accuracy: 60, correct_count: 3, best_streak: 3, level_passed: true, created_at: '2026-08-04T09:00:00.000Z' }),
];

function answerRow(over) {
    return Object.assign({
        user_id: U, game_id: 'mtt-cbet-defense', question_id: 'q-x', answer_id: 'call',
        is_correct: true, level: 1, answered_at: '2026-08-01T10:05:00.000Z',
        hero_position: 'BTN', villain_position: 'BB', street: 'flop',
        classification: 'correct', ev_loss: 0, spot_type: 'general',
    }, over);
}

const ANSWERS = [
    answerRow({ question_id: 'q-1', answer_id: 'raise_75', hero_position: 'BTN', villain_position: 'BB', street: 'preflop', classification: 'best', is_correct: true, ev_loss: 0, spot_type: 'general', answered_at: '2026-08-01T10:05:00.000Z' }),
    answerRow({ question_id: 'q-2', answer_id: 'bet_33', hero_position: 'BTN', villain_position: 'SB', street: 'flop', classification: 'correct', is_correct: true, ev_loss: 0, spot_type: 'cbet', answered_at: '2026-08-01T10:06:00.000Z' }),
    answerRow({ question_id: 'q-3', answer_id: 'call', hero_position: 'SB', villain_position: 'BTN', street: 'preflop', classification: 'correct', is_correct: true, ev_loss: 0.5, spot_type: 'general', answered_at: '2026-08-01T10:07:00.000Z' }),
    answerRow({ question_id: 'q-4', answer_id: 'call', hero_position: 'BB', villain_position: 'CO', street: 'turn', classification: 'wrong', is_correct: false, ev_loss: 1.5, spot_type: 'facing_bet', answered_at: '2026-08-01T20:10:00.000Z' }),
    answerRow({ question_id: 'q-5', answer_id: 'check', hero_position: 'CO', villain_position: 'BB', street: 'flop', classification: 'best', is_correct: true, ev_loss: 0.25, spot_type: 'cbet', answered_at: '2026-08-03T12:05:00.000Z' }),
    answerRow({ question_id: 'q-6', answer_id: 'allin_jam', hero_position: 'BTN', villain_position: 'BB', street: 'river', classification: 'blunder', is_correct: false, ev_loss: 2.75, spot_type: 'cbet', answered_at: '2026-08-03T12:10:00.000Z' }),
];

console.log('CROSS-SESSION ANALYTICS CHECK');
console.log('---------------------------------------------');

// -- score_scale normalization ----------------------------------------------
check('normalizeGtowScore: scale-2 passes through signed', () => A.normalizeGtowScore(40, 2) === 40);
check('normalizeGtowScore: scale-1 legacy 75 -> +50', () => A.normalizeGtowScore(75, 1) === 50);
check('normalizeGtowScore: scale-null treated as legacy (60 -> +20)', () => A.normalizeGtowScore(60, null) === 20);
check('normalizeGtowScore: scale-1 zero -> -100', () => A.normalizeGtowScore(0, 1) === -100);
check('normalizeGtowScore: null score stays null (no fabrication)', () => A.normalizeGtowScore(null, 2) === null);
check('sessionSignedScore: scale-2 row', () => A.sessionSignedScore(SESSIONS[0]) === 40);
check('sessionSignedScore: LEGACY scale-1 row normalized to +50', () => A.sessionSignedScore(SESSIONS[1]) === 50);
check('sessionSignedScore: negative signed score preserved', () => A.sessionSignedScore(SESSIONS[2]) === -20);
check('sessionSignedScore: null gtow_score falls back to accuracy-as-scale-1', () => A.sessionSignedScore(SESSIONS[3]) === 20);
check('get-sessions signedGtowScore agrees on scale-2', () => signedGtowScore(40, 2) === 40);
check('get-sessions signedGtowScore agrees on legacy scale-1', () => signedGtowScore(75, 1) === 50);
check('get-sessions signedGtowScore: null in, null out', () => signedGtowScore(null, 2) === null);

// -- scoreTrend ---------------------------------------------------------------
const trend = A.buildScoreTrend([...SESSIONS]);
check('scoreTrend: one entry per session', () => trend.length === 4);
check('scoreTrend: ascending by date', () => trend[0].id === 'sess-1' && trend[3].id === 'sess-4');
check('scoreTrend: carries id and gameId for the sessions list', () =>
    trend.every(t => typeof t.id === 'string' && t.gameId === 'mtt-cbet-defense'));
check('scoreTrend: legacy row emitted signed (+50, not 75)', () => trend[1].gtowScore === 50);
check('scoreTrend: signed scores [40,50,-20,20]', () =>
    JSON.stringify(trend.map(t => t.gtowScore)) === JSON.stringify([40, 50, -20, 20]));
check('scoreTrend: per-session accuracy carried through', () =>
    JSON.stringify(trend.map(t => t.accuracy)) === JSON.stringify([85, 75, 55, 60]));
check('scoreTrend: avgEvPerHand derived (3.5/20 = 0.175)', () => trend[0].avgEvPerHand === 0.175);

// -- dailyTrend ---------------------------------------------------------------
const daily = A.buildDailyTrend([...SESSIONS], [...ANSWERS]);
check('dailyTrend: three UTC day buckets, ascending', () =>
    JSON.stringify(daily.map(d => d.date)) === JSON.stringify(['2026-08-01', '2026-08-03', '2026-08-04']));
check('dailyTrend day1: 4 hands, 75% accuracy', () => daily[0].hands === 4 && daily[0].accuracy === 75);
check('dailyTrend day1: evLoss 2.0, avgEvLoss 0.5', () => daily[0].evLoss === 2 && daily[0].avgEvLoss === 0.5);
check('dailyTrend day1: 2 sessions, signed score avg (40+50)/2 = 45', () =>
    daily[0].sessions === 2 && daily[0].gtowScoreAvg === 45);
check('dailyTrend day2: accuracy 50, evLoss 3.0, score avg -20', () =>
    daily[1].accuracy === 50 && daily[1].evLoss === 3 && daily[1].gtowScoreAvg === -20);
check('dailyTrend day3: session without answers -> accuracy null, never 0', () =>
    daily[2].hands === 0 && daily[2].accuracy === null && daily[2].avgEvLoss === null);
check('dailyTrend day3: fallback-scored session averages +20', () =>
    daily[2].sessions === 1 && daily[2].gtowScoreAvg === 20);

// -- answers aggregates -------------------------------------------------------
const pos = A.aggregateByField(ANSWERS, 'hero_position');
check('positionAccuracy BTN: 2/3 correct, 67%, evLoss 2.75', () =>
    pos.BTN.total === 3 && pos.BTN.correct === 2 && pos.BTN.accuracy === 67 && pos.BTN.evLoss === 2.75);
check('positionAccuracy SB: 1/1, 100%', () => pos.SB.total === 1 && pos.SB.accuracy === 100);
check('positionAccuracy BB: 0/1, 0%, evLoss 1.5', () => pos.BB.accuracy === 0 && pos.BB.evLoss === 1.5);
check('positionAccuracy: avgEvLoss per bucket (BTN 2.75/3)', () => pos.BTN.avgEvLoss === 0.917);

const streets = A.aggregateByField(ANSWERS, 'street');
check('streetAccuracy PREFLOP: 2/2, 100%', () => streets.PREFLOP.total === 2 && streets.PREFLOP.accuracy === 100);
check('streetAccuracy TURN and RIVER: 0%', () => streets.TURN.accuracy === 0 && streets.RIVER.accuracy === 0);

const spots = A.aggregateByField(ANSWERS, 'spot_type');
check('spotAccuracy CBET: 2/3, evLoss 3.0', () => spots.CBET.total === 3 && spots.CBET.correct === 2 && spots.CBET.evLoss === 3);
check('spotAccuracy FACING_BET: 0/1', () => spots.FACING_BET.total === 1 && spots.FACING_BET.correct === 0);

const cls = A.aggregateByField(ANSWERS, 'classification');
check('classificationBreakdown: BEST 2 / CORRECT 2 / WRONG 1 / BLUNDER 1', () =>
    cls.BEST.total === 2 && cls.CORRECT.total === 2 && cls.WRONG.total === 1 && cls.BLUNDER.total === 1);
check('classificationBreakdown: blunder carries its EV loss (2.75)', () => cls.BLUNDER.evLoss === 2.75);

// -- action accuracy from answer_id ------------------------------------------
const actions = A.buildActionAccuracy(ANSWERS);
check('actionAccuracy: raise_75 -> RAISE, bet_33 -> BET', () =>
    actions.RAISE.total === 1 && actions.BET.total === 1);
check('actionAccuracy: CALL 1/2 correct', () => actions.CALL.total === 2 && actions.CALL.correct === 1);
check('actionAccuracy: allin_jam -> ALL-IN, 0/1', () => actions['ALL-IN'].total === 1 && actions['ALL-IN'].correct === 0);

// -- mistake patterns ---------------------------------------------------------
const mistakes = A.extractMistakePatterns(ANSWERS);
check('mistakePatterns: only the 2 non-best/correct answers', () => mistakes.length === 2);
check('mistakePatterns: ranked by severity (blunder cbet|BTN|river first)', () =>
    mistakes[0].spotType === 'cbet' && mistakes[0].position === 'BTN' && mistakes[0].street === 'river');
check('mistakePatterns: avgEvLoss exact (2.75 then 1.5)', () =>
    mistakes[0].avgEvLoss === 2.75 && mistakes[1].avgEvLoss === 1.5);

// -- milestones ---------------------------------------------------------------
const ms = A.computeMilestones([...SESSIONS], [...ANSWERS]);
check('milestones: totals (4 sessions, 6 hands, 4 correct, 67%)', () =>
    ms.totalSessions === 4 && ms.totalHands === 6 && ms.totalCorrect === 4 && ms.overallAccuracy === 67);
check('milestones: bestScore is the SIGNED max (+50 from the legacy row)', () => ms.bestScore === 50);
check('milestones: totalEvLoss 5.0, avgEvPerHand 0.833', () => ms.totalEvLoss === 5 && ms.avgEvPerHand === 0.833);
check('milestones: currentStreak 1 (latest passed, previous failed)', () => ms.currentStreak === 1);
check('milestones: longestStreak from best_streak columns (9)', () => ms.longestStreak === 9);
check('milestones: last5Avg signed round((20-20+50+40)/4) = 23', () => ms.last5Avg === 23);
check('milestones: prev5Avg null with under 6 sessions -> trending null', () =>
    ms.prev5Avg === null && ms.trending === null);
check('milestones: classificationTotals exact', () =>
    ms.classificationTotals.best === 2 && ms.classificationTotals.correct === 2 &&
    ms.classificationTotals.wrong === 1 && ms.classificationTotals.blunder === 1);

// -- classification trend (per session) --------------------------------------
const clsTrend = A.buildClassificationTrend([
    sessionRow({ id: 'sess-5', classification_counts: { best: 3, correct: 9, inaccuracy: 2, wrong: 1, blunder: 1 }, created_at: '2026-08-05T10:00:00.000Z' }),
]);
check('classificationTrend: reads classification_counts jsonb verbatim', () =>
    clsTrend[0].best === 3 && clsTrend[0].correct === 9 && clsTrend[0].inaccuracy === 2 &&
    clsTrend[0].wrong === 1 && clsTrend[0].blunder === 1);

// -- honest empty state -------------------------------------------------------
check('empty inputs: no invented sessions, days, or milestones', () => {
    const t = A.buildScoreTrend([]);
    const d = A.buildDailyTrend([], []);
    const m = A.computeMilestones([], []);
    return t.length === 0 && d.length === 0 && m.totalSessions === 0 &&
        m.totalHands === 0 && m.overallAccuracy === 0 && m.bestScore === 0;
});

console.log('---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
