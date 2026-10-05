import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
    buildStrategyQuestionContext,
    readStrategySolverMetadata,
    strategyQuestionIntegrity,
    strategyResumeProgress,
} from '../src/components/trivia/strategyExperienceModel.mjs';
import {
    canRenderStrategyVisualCard,
    isStrategyVisualCardMode,
} from '../src/lib/trivia/strategyVisualCardPolicy.mjs';

const ROOT = process.cwd();
const read = relativePath => readFileSync(join(ROOT, relativePath), 'utf8');
const valueFor = (context, label) => context.items.find(item => item.label === label)?.value;
const verifiedEv = (value = 1.25) => ({
    contract: 'trivia-solver-ev/1',
    value,
    unit: 'bb',
    source: 'solved_spots_gold.strategy_matrix_v2.hand_evs_bb',
    aggregation: 'live_combo_class_mean',
    provenance: {
        authority: 'training_solver_provenance_authority',
        catalog: 'training_solver_artifact_catalog',
        artifact_id: '11111111-1111-4111-8111-111111111111',
        scenario_hash: 'cash_flop_btn_bb_AsKs',
        solver: 'PioSOLVER',
        solver_version: 'PioSOLVER-pro 3.8.0',
        solver_binary_checksum: 'a'.repeat(64),
        pipeline_commit: 'b'.repeat(40),
        manifest_version: 'solver-manifest-v1',
        manifest_checksum: 'c'.repeat(64),
        source_artifact_checksum: 'd'.repeat(64),
        source_combo_order_sha256: 'e'.repeat(64),
        training_game_contracts_sha256: 'f'.repeat(64),
        audited_at: '2026-10-05T17:00:00.000Z',
    },
});

test('strategy decision rails prefer server-sanitized context and preserve exact poker facts', () => {
    const mtt = buildStrategyQuestionContext('mtt', {
        question: 'Generic tournament decision.',
        context: {
            heroPosition: 'BTN',
            villainPosition: 'BB',
            stackDepthBb: 22.5,
            blinds: '1,000/2,000/2,000',
            street: 'preflop',
            payoutStage: 'Final Table',
            heroHand: ['As', 'Kh'],
        },
    });
    assert.equal(valueFor(mtt, 'Blinds'), '1,000/2,000/2,000');
    assert.equal(valueFor(mtt, 'Position'), 'BTN Vs BB');
    assert.equal(valueFor(mtt, 'Effective Stack'), '22.5 BB Effective');
    assert.equal(valueFor(mtt, 'Hero Hand'), 'As Kh');
    assert.equal(valueFor(mtt, 'Payout Stage'), 'Final Table');

    const cash = buildStrategyQuestionContext('cash', {
        question: 'At $5/$10 cash on the BTN with 100 BB effective, the flop pot is 18 BB. What is your line?',
    });
    assert.equal(valueFor(cash, 'Stakes'), '$5/$10');
    assert.equal(valueFor(cash, 'Position'), 'BTN');
    assert.equal(valueFor(cash, 'Effective Stack'), '100 BB Effective');
    assert.equal(valueFor(cash, 'Street'), 'Flop');
    assert.equal(valueFor(cash, 'Pot'), '18 BB');
});

test('strategy rails never manufacture missing blinds, payouts, stacks or stakes', () => {
    const context = buildStrategyQuestionContext('mtt', { question: 'Choose the best tournament action.' });
    assert.equal(valueFor(context, 'Blinds'), 'Not Stated In This Spot');
    assert.equal(valueFor(context, 'Effective Stack'), 'Not Stated In This Spot');
    assert.equal(valueFor(context, 'Payout Stage'), 'Not Stated In This Spot');
    assert.notEqual(valueFor(context, 'Position'), 'BB', 'the BB unit must not be mistaken for a table position');
});

test('ICM context explicitly separates chip EV from money EV without claiming values', () => {
    const context = buildStrategyQuestionContext('icm', {
        question: 'On the money bubble, compare this ICM decision from the CO at 14 BB effective.',
    });
    assert.equal(valueFor(context, 'Decision Model'), 'Money EV / ICM');
    assert.equal(valueFor(context, 'Payout Context'), 'Money Bubble');
    assert.equal(valueFor(context, 'Chip EV'), 'Chips Gained Or Lost');
    assert.equal(valueFor(context, 'Money EV'), 'Payout Equity Gained Or Lost');
});

test('solver reveal normalizes fractions, decodes action tokens and retains the complete mix', () => {
    const solver = readStrategySolverMetadata({
        gto_frequencies: { b525: 0.6, c: 0.3, f: 0.1 },
        ev_data: verifiedEv(),
    }, 'Bet 52.5% Pot', ['Bet 52.5% Pot', 'Call', 'Fold']);

    assert.equal(solver.preferredFrequency, 60);
    assert.equal(solver.preferredAction, 'Bet 52.5% Pot');
    assert.deepEqual(solver.frequencyRows.map(row => [row.action, row.frequency]), [
        ['Bet 52.5% Pot', 60],
        ['Call', 30],
        ['Fold', 10],
    ]);
    assert.equal(solver.rangeSummary, 'Bet 52.5% Pot 60%, Call 30%, Fold 10%');
    assert.equal(solver.evAnalysis.value, 1.25);
    assert.equal(solver.evAnalysis.unitLabel, 'Big Blinds');
    assert.equal(solver.evAnalysis.sourceLabel, 'Verified PioSOLVER V2');
    assert.match(solver.evAnalysis.provenanceLabel, /Active Solver Catalog/);
});

test('solver frequency scale is vector-wide and canonical pot tokens are not divided by ten', () => {
    const percentages = readStrategySolverMetadata({
        gto_frequencies: { b100: 99, c: 1 },
    }, 'Bet 100% Pot', ['Bet 100% Pot', 'Call']);
    assert.deepEqual(percentages.frequencyRows.map(row => [row.action, row.frequency]), [
        ['Bet 100% Pot', 99],
        ['Call', 1],
    ]);

    const overbet = readStrategySolverMetadata({
        gto_frequencies: { b125: 60, f: 40 },
    }, 'Bet 125% Pot', ['Bet 125% Pot', 'Fold']);
    assert.equal(overbet.frequencyRows[0].action, 'Bet 125% Pot');
    assert.deepEqual(readStrategySolverMetadata({
        gto_frequencies: { b50: 0.5, c: 50 },
    }).frequencyRows, []);
});

test('solver reveal stays empty when the server released no solver values', () => {
    const solver = readStrategySolverMetadata(null, 'Call', ['Call', 'Fold']);
    assert.equal(solver.preferredFrequency, null);
    assert.equal(solver.evAnalysis, null);
    assert.deepEqual(solver.frequencyRows, []);
    assert.equal(solver.rangeSummary, '');
    assert.equal(readStrategySolverMetadata({ evData: { value: 12, unit: 'chips' } }).evAnalysis, null);
    assert.equal(readStrategySolverMetadata({ evData: { value: 1.25, unit: 'bb' } }).evAnalysis, null);
    assert.equal(readStrategySolverMetadata({ evData: { value: 12, unit: 'dollars' } }).evAnalysis, null);
});

test('question integrity and resume progress reject malformed content and restore bound answers', () => {
    assert.deepEqual(strategyQuestionIntegrity(null), { ok: false, error: 'question_missing' });
    assert.equal(strategyQuestionIntegrity({ id: 'q', question: 'Spot?', options: ['Call', 'Call'] }).ok, false);
    assert.equal(strategyQuestionIntegrity({ id: 'q', question: 'Spot?', options: ['Call', 'Fold'] }).ok, true);

    const progress = strategyResumeProgress([
        { id: 'one', answerState: { storedDisplayIndex: 0 } },
        { id: 'two', state: 'timeout' },
        { id: 'three', state: 'active' },
    ]);
    assert.deepEqual(progress, { answered: 2, firstUnanswered: 2, allAnswered: false });
});

test('strategy surface parses and pins recovery, reporting, receipts and scoped keyboard controls', () => {
    const source = read('src/components/trivia/StrategyTrivia.jsx');
    assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }));
    assert.match(source, /useServerGradedRun\(mode, \{[\s\S]*?accountId: userId/);
    assert.match(source, /serverRun\.hasRecoverableSession/);
    assert.match(source, /serverRun\.resume\(\)/);
    assert.match(source, /resumedSettlement/);
    assert.match(source, /Retry Same Answer/);
    assert.match(source, /gradeAnswer\(-1, \{ invalidQuestion: true \}\)/);
    assert.match(source, /question_still_valid/);
    assert.match(source, /Question Voided/);
    assert.match(source, /Does Not Affect Your Score/);
    assert.match(source, /sessionId=\{serverRun\.sessionId\}/);
    assert.match(source, /Pending Authoritative Settlement/);
    assert.match(source, /Run Receipt/);
    assert.match(source, /setSettlementReceipt\(settled\?\.receipt/);
    assert.match(source, /Diamond Transaction Record/);
    assert.match(source, /settlementReceipt\.transactions\.map/);
    assert.match(source, /settled\?\.replayed !== true && awarded > 0/);
    assert.match(source, /onKeyDown=\{handleGameKeyDown\}/);
    assert.doesNotMatch(source, /window\.addEventListener\(['"]keydown/);
    assert.doesNotMatch(source, /GameCostPopup/);
    assert.doesNotMatch(source, /generateGTOApproach|readSolverMetadata/);
    assert.doesNotMatch(source, /60 Seconds|SECONDS_PER_QUESTION/);
});

test('strategy pages remain thin route delegates and layout has separate mobile and desktop compositions', () => {
    for (const mode of ['mtt', 'cash', 'icm', 'gto']) {
        const route = read(`pages/hub/trivia/${mode}.js`);
        assert.match(route, new RegExp(`<StrategyTrivia mode=["']${mode}["']`));
    }

    const css = read('src/styles/worlds/trivia-console-strategy.css');
    assert.match(css, /\.strategy-lobby__art[\s\S]*\.strategy-lobby__brief/);
    assert.match(css, /@media \(min-width: 900px\)[\s\S]*grid-template-columns:/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /:hover/);
});

test('GTO booth exposes full frequency, range and explicit EV-unit semantics', () => {
    const source = read('src/components/trivia/GTOScenarioDisplay.jsx');
    assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }));
    assert.match(source, /Range And Frequency Mix/);
    assert.match(source, /Of Solver Mix/);
    assert.match(source, /Big Blinds/);
    assert.match(source, /EV Evidence/);
    assert.match(source, /Preferred Line Frequency/);
    assert.match(source, /Illustrative Numbers, So The Card Was Not Shown/);
    assert.match(source, /status === 422/);
    assert.doesNotMatch(source, /<span className="tc-row__label">Solver Confidence<\/span>/);
});

test('GTO visual cards are wired only inside the current account session reveal', () => {
    const strategy = read('src/components/trivia/StrategyTrivia.jsx');
    const booth = read('src/components/trivia/GTOScenarioDisplay.jsx');
    assert.doesNotThrow(() => parse(booth, { sourceType: 'module', plugins: ['jsx'] }));

    const revealIndex = strategy.indexOf('{showResult && verdict');
    const panelIndex = strategy.indexOf('<GTOScenarioDisplay');
    assert.ok(revealIndex >= 0 && panelIndex > revealIndex, 'the solver panel must stay inside the post-answer reveal');
    assert.equal((strategy.match(/<GTOScenarioDisplay/g) || []).length, 1);
    const panelCall = strategy.slice(panelIndex, panelIndex + 1_200);
    assert.match(panelCall, /questionId=\{currentQuestion\.id\}/);
    assert.match(panelCall, /sessionId=\{serverRun\.sessionId\}/);
    assert.match(panelCall, /accountId=\{userId\}/);
    assert.match(panelCall, /mode=\{mode\}/);
    assert.match(panelCall, /category=\{currentQuestion\.category\}/);
    assert.match(panelCall, /accessToken=\{getAccessToken\(\)\}/);
    assert.match(strategy, /v\?\.questionId !== q\.id \|\| v\?\.sessionId !== serverRun\.sessionId/);
    assert.match(strategy, /answer_receipt_mismatch/);

    assert.match(booth, /new AbortController\(\)/);
    assert.match(booth, /signal: controller\.signal/);
    assert.match(booth, /activeScopeKeyRef\.current === requestScope/);
    assert.match(booth, /renderedScopeKeyRef\.current === requestScopeKey/);
    assert.match(booth, /\[resolvedAccountId, resolvedQuestionId, resolvedSessionId, imageUrl\]/);
    assert.match(booth, /response\.status === 409 && data\?\.error === 'render_in_progress'/);
    assert.match(booth, /data\?\.retryAfterMs/);
    assert.match(booth, /Retry Is Available In \$\{scopedRenderRetry\.waitSeconds\} Seconds/);
    assert.match(booth, /window\.setTimeout/);
    assert.doesNotMatch(booth, /window\.setInterval|setInterval\(/, 'render coordination must not poll');
});

test('visual-card policy is one exact client/server mode-category matrix', () => {
    const categories = [
        'gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev',
    ];
    assert.ok(categories.every(category => canRenderStrategyVisualCard('gto', category)));
    assert.equal(canRenderStrategyVisualCard('mtt', 'mtt_situations'), true);
    assert.equal(canRenderStrategyVisualCard('cash', 'cash_game_situations'), true);
    assert.equal(canRenderStrategyVisualCard('icm', 'icm_chip_ev'), true);
    assert.equal(canRenderStrategyVisualCard('mtt', 'cash_game_situations'), false);
    assert.equal(canRenderStrategyVisualCard('cash', 'icm_chip_ev'), false);
    assert.equal(canRenderStrategyVisualCard('daily', 'gto_theory'), false);
    assert.equal(canRenderStrategyVisualCard('gto', null), false);
    assert.equal(isStrategyVisualCardMode('daily'), false);

    const route = read('pages/api/trivia/render-gto-panel.js');
    const booth = read('src/components/trivia/GTOScenarioDisplay.jsx');
    assert.match(route, /canRenderStrategyVisualCard\(review\.mode, review\.category\)/);
    assert.match(booth, /canRenderStrategyVisualCard\(mode, resolvedCategory\)/);
});
