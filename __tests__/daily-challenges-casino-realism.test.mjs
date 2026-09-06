import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const trainingPage = read('pages/hub/training/daily-challenge.js');
const trainingCss = read('src/styles/training/daily-challenge-casino.module.css');
const goalsPage = read('pages/hub/training/daily-goals.js');
const goalsCss = read('src/styles/training/daily-goals-casino.module.css');
const triviaPage = read('pages/hub/trivia/[mode].js');
const memoryPage = read('pages/hub/memory-games.js');
const memoryCard = read('src/components/memory-games/DailyChallengeCard.jsx');
const memoryCss = read('src/styles/worlds/memory-games.css');
const personalQuiz = read('src/components/training/DailyPersonalQuiz.jsx');
const personalQuizCss = read('src/styles/training/daily-personal-quiz-casino.module.css');
const costPopup = read('src/components/gates/GameCostPopup.jsx');
const prizeWheel = read('src/components/trivia/PrizeWheel.jsx');
const universalHeader = read('src/components/ui/UniversalHeader.js');

test('every Daily Challenges surface adopts the casino realism visual system', () => {
  assert.match(trainingPage, /daily-challenge-casino\.module\.css/);
  assert.match(goalsPage, /daily-goals-casino\.module\.css/);
  assert.match(triviaPage, /trivia-daily-casino/);
  assert.match(memoryPage, /is-daily-casino/);
  assert.match(memoryCard, /preflop-daily-card-art/);
  assert.match(personalQuiz, /daily-personal-quiz-casino\.module\.css/);

  for (const css of [trainingCss, goalsCss, personalQuizCss, memoryCss, triviaPage]) {
    assert.match(css, /#25c8ff/i, 'Electric cyan token is required');
    assert.match(css, /#f2b84b|#f4c44e/i, 'Vault gold token is required');
    assert.match(css, /border-radius:\s*2px/i, 'Physical straight-edged controls are required');
  }
});

test('Daily Challenges preserve their real data and action wiring', () => {
  assert.match(trainingPage, /authedFetch\('\/api\/training\/hand-of-the-day'/);
  assert.match(trainingPage, /onClick=\{\(\) => handleAnswer\(action\)\}/);
  assert.match(trainingPage, /authedFetch\('\/api\/training\/share'/);
  assert.match(goalsPage, /authedFetch\(`\/api\/training\/get-sessions\?limit=50`\)/);
  assert.match(goalsPage, /authedFetch\('\/api\/training\/daily-bonus'/);
  assert.match(triviaPage, /serverGrader=\{serverGraded \? \(args\) => serverRun\.answer\(args\) : null\}/);
  assert.match(triviaPage, /onClick=\{startGame\}/);
  assert.match(memoryPage, /onClick=\{startDailyChallenge\}/);
  assert.match(memoryPage, /dailyChallengeService\.completeChallenge/);
});

test('Daily GTO result persistence has a real retry path', () => {
  assert.match(trainingPage, /serverSaved:\s*false/);
  assert.match(trainingPage, /parsed\.serverSaved === false/);
  assert.match(trainingPage, /setPendingSave\(\{ action, isCorrect, today \}\)/);
  assert.match(trainingPage, /await saveAnswer\(pendingSave\)/);
  assert.match(trainingPage, /savingAnswer \? 'Saving Result' : 'Retry Save'/);
});

test('Daily layouts are mobile first, accessible, and motion safe', () => {
  for (const css of [trainingCss, goalsCss, personalQuizCss]) {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
  }
  assert.match(trainingCss, /min-height:\s*44px/);
  assert.match(goalsCss, /min-height:\s*50px/);
  assert.match(personalQuizCss, /min-height:\s*46px/);
  assert.match(triviaPage, /role="dialog" aria-modal="true"/);
  assert.match(costPopup, /role="dialog" aria-modal="true"/);
  assert.match(costPopup, /button:focus-visible/);
});

test('Daily Trivia popups and rewards share the upgraded physical controls', () => {
  assert.match(triviaPage, /diamond-modal-card/);
  assert.match(triviaPage, /prize-wheel-overlay/);
  assert.match(prizeWheel, />\s*Daily Spin\s*</);
  assert.match(prizeWheel, /'Spin The Wheel'/);
  assert.match(prizeWheel, /'Claim Reward'/);
  assert.doesNotMatch(triviaPage, /#7B2FFF/);
});

test('new Daily Challenges presentation copy contains no em dash characters', () => {
  for (const source of [trainingPage, trainingCss, goalsCss, personalQuiz, personalQuizCss, memoryCard]) {
    assert.equal(source.includes('\u2014'), false);
  }
});

test('shared header VIP state is hydration safe on Daily Training pages', () => {
  assert.match(universalHeader, /const safeIsVip = isMounted \? isVip : false/);
  assert.match(universalHeader, /safeIsVip \? ' approved-global-header__vip--active'/);
  assert.match(universalHeader, /data-vip-active=\{safeIsVip \? 'true' : 'false'\}/);
});
