import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const trainingPage = read('pages/hub/training/daily-challenge.js');
const trainingApi = read('pages/api/training/hand-of-the-day.js');
const trainingCss = read('src/styles/training/daily-challenge-casino.module.css');
const goalsPage = read('pages/hub/training/daily-goals.js');
const goalsCss = read('src/styles/training/daily-goals-casino.module.css');
const triviaPage = read('pages/hub/trivia/[mode].js');
const memoryPage = read('pages/hub/memory-games.js');
const memoryCss = read('src/styles/worlds/memory-games.css');
const personalQuiz = read('src/components/training/DailyPersonalQuiz.jsx');
const personalQuizCss = read('src/styles/training/daily-personal-quiz-casino.module.css');
const costPopup = read('src/components/gates/GameCostPopup.jsx');
const prizeWheel = read('src/components/trivia/PrizeWheel.jsx');
const universalHeader = read('src/components/ui/UniversalHeader.js');

test('every Daily Challenges surface adopts the casino realism visual system', () => {
  assert.match(trainingPage, /daily-challenge-casino\.module\.css/);
  assert.match(trainingPage, /styles\.marquee/);
  assert.match(trainingPage, /styles\.feltTable/);
  assert.match(trainingPage, /styles\.resultDrawer/);
  assert.match(goalsPage, /daily-goals-casino\.module\.css/);
  assert.match(triviaPage, /trivia-daily-casino/);
  assert.match(memoryPage, /function DailyLocalPracticeCard/);
  assert.match(memoryPage, /className="preflop-daily-card/);
  assert.match(memoryPage, /DAILY LOCAL PRACTICE/);
  assert.match(memoryCss, /body\.world-preflop-charts \.preflop-daily-card/);
  assert.match(personalQuiz, /daily-personal-quiz-casino\.module\.css/);

  for (const css of [trainingCss, goalsCss, personalQuizCss, memoryCss, triviaPage]) {
    assert.match(css, /#25c8ff/i, 'Electric cyan token is required');
    assert.match(css, /#f2b84b|#f4c44e/i, 'Vault gold token is required');
    assert.match(css, /border-radius:\s*2px/i, 'Physical straight-edged controls are required');
  }
});

test('Daily Challenges preserve their real data and action wiring', () => {
  assert.match(trainingPage, /authedFetch\('\/api\/training\/hand-of-the-day'/);
  assert.match(trainingPage, /onClick=\{\(\) => handleAnswer\(action\.id\)\}/);
  assert.match(trainingPage, /authedFetch\('\/api\/training\/record-question'/);
  assert.match(trainingPage, /answerId:\s*actionId/);
  assert.match(trainingPage, /gradingReceipt:\s*context\.receipt/);
  assert.match(trainingPage, /authedFetch\('\/api\/training\/save-progress'/);
  assert.match(goalsPage, /authedFetch\(`\/api\/training\/get-sessions\?limit=50`\)/);
  assert.match(goalsPage, /authedFetch\('\/api\/training\/daily-bonus'/);
  assert.match(triviaPage, /serverGrader=\{serverGraded \? \(args\) => serverRun\.answer\(args\) : null\}/);
  assert.match(triviaPage, /onClick=\{startGame\}/);
  assert.match(memoryPage, /dailyChallengeService\.getTodaysChallenge\(\)/);
  assert.match(memoryPage, /onPlay=\{startDailyPractice\}/);
  assert.match(memoryPage, /onClick=\{startDailyPractice\}/);
  assert.doesNotMatch(memoryPage, /dailyChallengeService\.completeChallenge/);
});

test('Daily Challenge persistence uses a sealed answer and an idempotent completion retry', () => {
  assert.match(trainingPage, /const context = challenge\._gradingContext/);
  assert.match(trainingPage, /receipt[\s\S]*attemptId[\s\S]*snapshotKey[\s\S]*submissionId/);
  assert.match(trainingPage, /recorded\?\.evidence\?\.isCorrect/);
  assert.match(trainingPage, /JSON\.stringify\(\{ attemptId \}\)/);
  assert.match(trainingPage, /completionPending && !completing/);
  assert.match(trainingPage, /completeDailyAttempt\([\s\S]*activeAttemptId/);
  assert.match(trainingPage, /Retry Completion/);
  assert.match(trainingPage, /Continue To Training Hub/);
  assert.doesNotMatch(trainingPage, /localStorage|serverSaved|setPendingSave|saveAnswer\(/);
});

test('Daily Challenge grading, solver evidence, EV, and rewards remain server authoritative', () => {
  assert.doesNotMatch(trainingPage, /score:\s*isCorrect/);
  assert.doesNotMatch(trainingPage, /evLoss:\s*isCorrect/);
  assert.doesNotMatch(trainingPage, /challenge\.(?:correct_answer|gto_action)/);
  assert.doesNotMatch(trainingPage, /isCorrect\s*=\s*action/);
  assert.match(trainingPage, /solverAction=\{feedback\?\.solverVerified === true \? correctAnswerText : undefined\}/);
  assert.match(trainingPage, /evLoss=\{feedback\?\.evLossMeasured === true/);
  assert.match(trainingPage, /frequencies && feedback\?\.solverVerified === true/);
  assert.match(trainingPage, /awardedDiamonds = Number\(completion\?\.diamondsEarned \?\? completion\?\.diamondsAwarded\)/);
  assert.doesNotMatch(trainingPage, /DAILY_CHALLENGE_DIAMOND_REWARD|Perfect Read\s*·\s*\+|Earn Up To\s+\{/i);
  assert.doesNotMatch(trainingPage, /\/api\/training\/share|Share Result/);

  assert.match(trainingApi, /if \(req\.method !== 'GET'\)/);
  assert.match(trainingApi, /prepareTrainingAttemptDelivery/);
  assert.match(trainingApi, /toPublicTrainingQuestion/);
  assert.match(trainingApi, /private, no-store/);
  assert.doesNotMatch(trainingApi, /req\.body|safeAward|req\.method === 'POST'/);
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
  for (const source of [trainingPage, trainingCss, goalsCss, personalQuiz, personalQuizCss]) {
    assert.equal(source.includes('\u2014'), false);
  }
});

test('shared header VIP state is hydration safe on Daily Training pages', () => {
  assert.match(universalHeader, /const safeIsVip = isMounted \? isVip : false/);
  assert.match(universalHeader, /safeIsVip \? ' approved-global-header__vip--active'/);
  assert.match(universalHeader, /data-vip-active=\{safeIsVip \? 'true' : 'false'\}/);
});
