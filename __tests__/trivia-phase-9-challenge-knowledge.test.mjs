import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    orderDealerChoiceQuestions,
    PHASE9_KNOWLEDGE_CONTEXT,
    projectPhase9Recovery,
} from '../src/components/trivia/phase9/phase9RunModel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('knowledge rooms expose distinct archive, ruling, editorial and inventory contracts', () => {
    assert.deepEqual(Object.keys(PHASE9_KNOWLEDGE_CONTEXT).sort(), ['arcade', 'history', 'pro', 'rules']);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.arcade.summary, /wheel.*Diamonds.*streak shield.*free Arcade entry/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.history.summary, /Date or event context/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.rules.summary, /Tournament rules, cash-game procedure, and house rules can differ/i);
    assert.match(PHASE9_KNOWLEDGE_CONTEXT.pro.summary, /do not imply affiliation, sponsorship, or endorsement/i);
});

test('account recovery adopts only server-recorded answers and verdicts', () => {
    const projection = projectPhase9Recovery([
        { id: 'q1', state: 'answered', answerState: { storedDisplayIndex: 2, wasCorrect: true, outcome: 'correct' } },
        { id: 'q2', state: 'answered', answerState: { storedDisplayIndex: 0, wasCorrect: false, outcome: 'wrong' } },
        { id: 'q3', state: 'pending' },
    ]);
    assert.equal(projection.complete, false);
    assert.equal(projection.questionIndex, 2);
    assert.equal(projection.correctCount, 1);
    assert.equal(projection.wrongCount, 1);
    assert.deepEqual(projection.recordedAnswers, [
        { questionId: 'q1', displayIndex: 2 },
        { questionId: 'q2', displayIndex: 0 },
    ]);
    assert.equal(projection.verdicts[0].wasCorrect, true);
    assert.equal(projection.verdicts[1].wasCorrect, false);
});

test('Dealer Choice uses a stable accessible round-robin without changing question identity', () => {
    const input = [
        { id: 'h1', displayCategory: 'history' },
        { id: 'h2', displayCategory: 'history' },
        { id: 'r1', displayCategory: 'rules' },
        { id: 'p1', displayCategory: 'pro' },
        { id: 'r2', displayCategory: 'rules' },
    ];
    const ordered = orderDealerChoiceQuestions(input, ['history', 'rules', 'pro']);
    assert.deepEqual(ordered.map(question => question.id), ['h1', 'r1', 'p1', 'h2', 'r2']);
    assert.deepEqual(new Set(ordered.map(question => question.id)), new Set(input.map(question => question.id)));
});

test('survival compatibility route is a server redirect with no client initialization surface', () => {
    const source = read('pages/hub/trivia/survival.js');
    assert.match(source, /getServerSideProps/);
    assert.match(source, /destination: LIVE_SURVIVAL_ROUTE/);
    assert.match(source, /return null/);
    assert.doesNotMatch(source, /useEffect|useRouter|useServerGradedRun|DiamondEngine|session-start/);
});

test('all Phase 9 game surfaces wire recovery, receipt or canonical redirect contracts', () => {
    const knowledge = read('pages/hub/trivia/[mode].js');
    for (const mode of ['arcade', 'history', 'rules', 'pro']) assert.match(knowledge, new RegExp(`['\"]${mode}['\"]`));
    assert.match(knowledge, /PHASE9_KNOWLEDGE_MODES/);
    assert.match(knowledge, /serverRun\.hasRecoverableSession/);
    assert.match(knowledge, /Phase9SettlementReceipt/);
    assert.doesNotMatch(knowledge, /className="mode-art-button"/);

    for (const page of ['endless', 'mixed', 'survival-game', 'time-attack']) {
        const source = read(`pages/hub/trivia/${page}.js`);
        assert.match(source, /serverRun\.hasRecoverableSession/);
        assert.match(source, /serverRun\.resume/);
        assert.match(source, /Phase9SettlementReceipt/);
        assert.match(source, /phase9-intro-layout/);
    }
});

test('challenge specifics remain explicit and truthful', () => {
    const endless = read('pages/hub/trivia/endless.js');
    assert.match(endless, /Pause Game/);
    assert.match(endless, /Resume Game/);
    assert.match(endless, /Phase9RunReview/);
    assert.match(endless, /Share Result/);

    const mixed = read('pages/hub/trivia/mixed.js');
    assert.match(mixed, /Dealer's Choice Rotation Order/);
    assert.match(mixed, /Category Breakdown/);

    const survival = read('pages/hub/trivia/survival-game.js');
    assert.match(survival, /Lives Remaining/);
    assert.match(survival, /Checkpoint/);
    assert.match(survival, /trivia:survival-level:v1/);

    const timePage = read('pages/hub/trivia/time-attack.js');
    const timeGame = read('src/components/trivia/TimeAttackGame.jsx');
    assert.equal((timePage.match(/Time Is Up/g) || []).length, 1);
    assert.equal((timeGame.match(/Time Is Up/g) || []).length, 1, 'component mentions terminal copy only in its explanatory comment');
    assert.match(timePage, /The Clock Will Not Be Restarted/);
    assert.match(timePage, /Personal Best/);
    assert.match(timePage, /Daily Cap/);
});

test('reduced motion removes Phase 9 shake, haptics, loops and celebrations at the effect source', () => {
    const hook = read('src/components/trivia/phase9/usePhase9ReducedMotion.js');
    assert.match(hook, /prefers-reduced-motion: reduce/);
    for (const file of ['pages/hub/trivia/endless.js', 'pages/hub/trivia/survival-game.js']) {
        const source = read(file);
        assert.match(source, /!reduceMotion && settings\.haptics/);
        assert.match(source, /!reduceMotion && settings\.screenShake/);
        assert.match(source, /!reduceMotion && settings\.audio/);
    }
    assert.match(read('src/components/trivia/TimeAttackGame.jsx'), /if \(!reduceMotion\) busEmit\.screenShake/);
});

test('mobile survival bays and desktop Phase 9 composition have explicit breakpoints', () => {
    const css = read('src/styles/worlds/trivia-console-challenge.css');
    assert.match(css, /\.trivia-challenge-levels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
    assert.match(css, /@media \(min-width: 720px\)[\s\S]*?\.trivia-challenge-levels\s*\{[\s\S]*?repeat\(5,/);
    assert.match(css, /@media \(min-width: 860px\)[\s\S]*?\.phase9-intro-layout\s*\{[\s\S]*?grid-template-columns:/);
});
