/**
 * CHART QUESTION NODE GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * memory_charts_gold holds TWO node types, distinguishable by hand_matrix
 * keys: open-shove charts store { push|shove, fold }, and BB-defence charts
 * (villain_action 'sb_push') store { call, fold }.
 *
 * The March-2026 cache generation read ONLY push/shove: every hand in a
 * call-node chart fell through `|| 0` and graded as a 100% fold — including
 * AA — while the question text still said "Push or Fold?". 316 provably
 * defective rows had to be purged from training_question_cache
 * (migration 20260806). This test pins the fixed generator so the bug class
 * cannot ship again:
 *
 *   • push-node charts grade from the push frequency;
 *   • call-node charts grade from the call frequency, render Call All-In
 *     options and "Call or Fold?" text, and never say "Push";
 *   • villain_action codes render as human text, never raw ('sb_push');
 *   • a hand whose frequency the code cannot read produces NULL, not "fold" —
 *     refusing beats fabricating an answer.
 *
 * The engine imports webpack-resolved modules, so the two methods under test
 * are extracted from source and evaluated standalone (same technique as
 * equity-worker-parity.test.mjs). If extraction breaks because the code
 * moved, that is a real signal this guard needs re-pointing — fail loudly.
 *
 * Run: node --test __tests__/chart-question-node.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(ROOT, 'src/engines/DeterministicGTOEngine.js');

function loadChartBuilder() {
    const src = fs.readFileSync(ENGINE, 'utf8');
    const slice = (startPat, endPat) => {
        const s = src.indexOf(startPat);
        assert.ok(s >= 0, `extraction anchor missing from DeterministicGTOEngine.js: ${startPat.slice(0, 60)}`);
        const e = src.indexOf(endPat, s);
        assert.ok(e >= 0, 'extraction end anchor missing');
        return src.slice(s, e);
    };
    const parseFn = slice('function parseHandToCards', '\n}') + '\n}';
    const buildQ = 'function buildChartQuestion'
        + slice('buildChartQuestion(chart, level) {', '\n    }').slice('buildChartQuestion'.length) + '\n}';
    const buildE = 'function buildChartExplanation'
        + slice('buildChartExplanation(heroHand, chart, yesFreq, correctAction, isCallNode = false) {', '\n    }').slice('buildChartExplanation'.length) + '\n}';
    const factory = new Function(
        parseFn + '\n' + buildE + '\n'
        + buildQ.replace('this.buildChartExplanation', 'buildChartExplanation')
        + '\nreturn { buildChartQuestion };'
    );
    return factory().buildChartQuestion;
}

const PUSH_CHART = {
    chart_id: 'c1', hero_position: 'UTG', stack_depth: 10, villain_action: 'fold_to_hero',
    hand_matrix: { AA: { push: 1.0, fold: 0.0 }, '72o': { push: 0.0, fold: 1.0 } },
};
const CALL_CHART = {
    chart_id: 'c2', hero_position: 'BB', stack_depth: 10, villain_action: 'sb_push',
    hand_matrix: { AA: { call: 1.0, fold: 0.0 }, '83o': { call: 0.0, fold: 1.0 } },
};

/** Deterministic hand pick: pin Math.random for the duration of one build. */
function build(buildChartQuestion, chart, hand) {
    const hands = Object.keys(chart.hand_matrix);
    const orig = Math.random;
    Math.random = () => hands.indexOf(hand) / hands.length;
    try { return buildChartQuestion(chart, 1); } finally { Math.random = orig; }
}

test('push-node charts grade from the push frequency', () => {
    const b = loadChartBuilder();
    const aa = build(b, PUSH_CHART, 'AA');
    assert.equal(aa.correctAnswer, 'push', 'AA must be a push in an open-shove chart');
    assert.match(aa.question, /Push or Fold\?$/);
    assert.match(aa.question, /Folded to you/);
    assert.equal(build(b, PUSH_CHART, '72o').correctAnswer, 'fold');
});

test('call-node charts grade from the call frequency and render a call decision', () => {
    const b = loadChartBuilder();
    const aa = build(b, CALL_CHART, 'AA');
    assert.equal(aa.correctAnswer, 'call', 'AA facing a shove is a call, NEVER a fold — this exact bug shipped once');
    assert.equal(aa.correctAnswerText, 'Call All-In');
    assert.match(aa.question, /Call or Fold\?$/);
    assert.match(aa.question, /SB shoves/);
    assert.ok(!aa.question.includes('sb_push'), 'raw villain_action codes must never reach the question text');
    assert.deepEqual(aa.options.map(o => o.id), ['call', 'fold']);
    assert.equal(aa.gtoFrequencies.call, 100);

    const trash = build(b, CALL_CHART, '83o');
    assert.equal(trash.correctAnswer, 'fold');
    assert.ok(!/push/i.test(trash.explanation), 'call-node explanations must not use shove language');
});

test('an unreadable hand entry yields null, never a fabricated fold', () => {
    const b = loadChartBuilder();
    const q = build(b, { ...PUSH_CHART, hand_matrix: { AA: { weird: 1 } } }, 'AA');
    assert.equal(q, null);
});

test('mixed-frequency hands stay answerable and self-consistent', () => {
    const b = loadChartBuilder();
    const chart = {
        ...PUSH_CHART,
        hand_matrix: { A5s: { push: 0.62, fold: 0.38 }, KTo: { push: 0.31, fold: 0.69 } },
    };
    const a5 = build(b, chart, 'A5s');
    assert.equal(a5.correctAnswer, 'push');
    assert.equal(a5.gtoFrequencies.push, 62);
    assert.equal(a5.options.find(o => o.id === 'push').frequency, 62);
    assert.equal(a5.scenario.isMixedStrategy, true);
    const kt = build(b, chart, 'KTo');
    assert.equal(kt.correctAnswer, 'fold');
});
