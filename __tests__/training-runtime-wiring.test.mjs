import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { filterCachedRowsForGame } from '../src/lib/training/cacheContract.mjs';
import { isCustomTrainerConfig } from '../src/lib/training/trainerConfigMode.mjs';
import { buildQuestionConfusion } from '../src/lib/training/questionAnalytics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('session preferences do not replace catalog drills with custom cash spots', () => {
  assert.equal(isCustomTrainerConfig({
    difficulty: 'standard',
    timer: 'relaxed',
    mode: 'trainer',
    scope: 'all',
    tables: '1',
    feedbackRule: 'every',
    handSelection: 'all',
  }), false);

  assert.equal(isCustomTrainerConfig({
    gameType: 'mtt',
    stackDepth: 20,
    position: 'BTN',
  }), true);
});

test('chart games reject postflop cache pollution', () => {
  const rows = [
    {
      id: 'wrong',
      engine_type: 'PIO',
      question_data: {
        type: 'PIO',
        scenario: { street: 'flop' },
        boardCards: ['2d', '3c', '7d'],
        options: [{ id: 'x', text: 'Check' }, { id: 'b', text: 'Bet' }],
      },
    },
    {
      id: 'right',
      engine_type: 'CHART',
      question_data: {
        type: 'CHART',
        scenario: { street: 'preflop' },
        boardCards: [],
        options: [{ id: 'push', text: 'Push All-In' }, { id: 'fold', text: 'Fold' }],
      },
    },
  ];

  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'ICMIZER' }).map((row) => row.id),
    ['right']
  );
});

test('psychology games reject poker-solver cache rows', () => {
  const rows = [
    { id: 'pio', engine_type: 'PIO', question_data: { scenario: { street: 'river' } } },
    {
      id: 'mental',
      engine_type: 'SCENARIO',
      question_data: { scenario: { isPsychology: true } },
    },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'SCENARIO' }).map((row) => row.id),
    ['mental']
  );
});

test('runtime uses canonical auth and fails closed on progress API errors', () => {
  const levelSelector = fs.readFileSync(
    path.join(ROOT, 'src/components/training/LevelSelector.tsx'),
    'utf8'
  );
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');

  assert.match(levelSelector, /authToken = getSessionToken\(\)/);
  assert.doesNotMatch(levelSelector, /sb-kuklfnapbkmacvwxktbh-auth-token/);
  assert.match(trainer, /import \{ authedFetch, getAuthUser \} from '\.\.\/lib\/authUtils'/);
  assert.doesNotMatch(trainer, /\bfetch\(/);
  assert.match(trainer, /authedFetch\(`\/api\/training\/batch-preload\?\$\{params\}`\)/);
  assert.match(trainer, /if \(!response\.ok \|\| data\?\.success === false\)/);
  assert.match(trainer, /isCustomTrainerConfig\(trainerConfig\)/);
  assert.match(trainer, /level: selectedLevel/);
});

test('training hub keeps its signed-out primary action live and uses canonical login routing', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');

  assert.match(hub, /pathname: '\/auth\/login'/);
  assert.match(hub, /query: \{ redirect: '\/hub\/training' \}/);
  assert.doesNotMatch(hub, /pathname: '\/login'|query: \{ next: '\/hub\/training' \}/);
  assert.match(hub, /startDrill\(jarvisPick \|\| TRAINING_LIBRARY\[0\]\)/);
  assert.doesNotMatch(hub, /disabled=\{!jarvisPick\}/);
  assert.match(hub, /Build Better Decisions, One Hand At A Time\./);
  assert.match(hub, /label: 'Cash Games'/);
  assert.match(hub, /label: 'Mental Game'/);
});

test('per-question confusion analytics identify repeated wrong choices', () => {
  const result = buildQuestionConfusion([
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 1.2, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T10:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 0.8, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T11:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'push', is_correct: true, ev_loss: 0, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T12:00:00Z' },
  ]);
  assert.equal(result[0].attempts, 3);
  assert.equal(result[0].wrong, 2);
  assert.equal(result[0].confusionRate, 67);
  assert.deepEqual(result[0].mostCommonWrongAnswer, { answerId: 'fold', count: 2 });
  assert.equal(result[0].optimalAction, 'push');
});

test('both poker and psychology feedback expose canonical question reporting', () => {
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );
  const psychology = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/PsychologyTiltControlUI.jsx'),
    'utf8'
  );
  const questionCard = fs.readFileSync(
    path.join(ROOT, 'src/components/training/GTOQuestionCard.jsx'),
    'utf8'
  );
  const reportApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/report-question.js'),
    'utf8'
  );

  assert.match(router, /<PsychologyTiltControlUI[\s\S]*gameId=\{gameId\}/);
  assert.match(psychology, /<GTOQuestionCard[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /<TrainingQuestionReport[\s\S]*gameId=\{gameId\}/);
  assert.match(questionCard, /<TrainingQuestionReport gameId=\{gameId\} question=\{question\}/);
  assert.match(reportApi, /canonicalQuestionExists/);
  assert.match(reportApi, /user_id,game_id,question_id,reason/);
});

test('every poker game reaches the shared Club Arena table surface', () => {
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  assert.doesNotMatch(arena, /gameId === 'adv-011'|gameId === 'quiz-gauntlet'/);
  assert.match(router, /<UniversalDynamicTable[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /data-training-ui="club-arena-table"/);
});

test('runtime matrix workers claim a game before yielding to page creation', () => {
  const audit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-runtime-surface-audit.mjs'),
    'utf8'
  );
  const claimIndex = audit.indexOf('const game = queue.shift()');
  const pageIndex = audit.indexOf('const page = await context.newPage()', claimIndex);

  assert.ok(claimIndex >= 0, 'runtime matrix must claim a queued game');
  assert.ok(pageIndex > claimIndex, 'game ownership must be claimed before an awaited page creation');
  assert.doesNotMatch(audit, /auditGame\(page, queue\.shift\(\)/);
});

test('mobile arena launch remains tappable above global overlays', () => {
  const trainingCss = fs.readFileSync(path.join(ROOT, 'src/styles/worlds/training.css'), 'utf8');
  const notificationPrompt = fs.readFileSync(
    path.join(ROOT, 'src/components/notifications/FirstRunNotificationPrompt.jsx'),
    'utf8'
  );

  assert.match(
    trainingCss,
    /sp-arena-lobby__launch[\s\S]*bottom:\s*calc\(56px \+ 10px \+ env\(safe-area-inset-bottom, 0px\)\)/
  );
  assert.match(notificationPrompt, /'\/hub\/training\/arena'/);
  assert.match(notificationPrompt, /'\/hub\/club-arena'/);
});

test('offline packs cache real questions and are consumed by the arena', () => {
  const preloader = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-preloader.js'), 'utf8');
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');

  assert.match(preloader, /batch-preload\?gameId=/);
  assert.match(preloader, /setOfflineQuestions\(tree\.gameId, level, payload\.questions\)/);
  assert.doesNotMatch(preloader, /Float32Array|binaryStub|Math\.random/);
  assert.match(trainer, /getOfflineQuestions\(gameId, effectiveLevel\)/);
  assert.match(trainer, /setOfflineQuestions\(gameId, effectiveLevel, data\.questions\)/);
});

test('reports and custom solve do not manufacture successful activity', () => {
  const reports = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-reports.js'), 'utf8');
  const customSolve = fs.readFileSync(path.join(ROOT, 'pages/hub/training/custom-solve.js'), 'utf8');
  const solverApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/solver-api.js'), 'utf8');

  assert.match(reports, /No GTO Report Data Yet/);
  assert.doesNotMatch(reports, /Demo data for illustration|Sample data is being displayed/);
  assert.match(customSolve, /data\?\.solution\?\.actions/);
  assert.doesNotMatch(customSolve, /gameId: 'custom-solve'|accuracy: 100/);
  assert.match(solverApi, /source: 'solved_spots_gold'/);
  assert.match(solverApi, /source: 'modeled_baseline'/);
  assert.doesNotMatch(solverApi, /from\('solver_queue'\)|status: 'queued'|queued for precise solving/);
});

test('Phase 11 progress reads the canonical session and daily result stores', () => {
  const challenges = fs.readFileSync(path.join(ROOT, 'pages/api/training/challenges.js'), 'utf8');
  const dailyApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/hand-of-the-day.js'), 'utf8');
  const dailyPage = fs.readFileSync(path.join(ROOT, 'pages/hub/training/daily-challenge.js'), 'utf8');

  assert.match(challenges, /from\('training_sessions'\)/);
  assert.doesNotMatch(challenges, /from\('jarvis_training_sessions'\)/);
  assert.match(dailyApi, /selected_action/);
  assert.match(dailyApi, /completedDays/);
  assert.match(dailyPage, /data\.completion\.selected_action/);
  assert.match(dailyPage, /await authedFetch\('\/api\/training\/hand-of-the-day'/);
});

test('secondary analytics and community rooms never invent player results', () => {
  const positionMastery = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/position-mastery.js'),
    'utf8'
  );
  const studyGroup = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/study-group.js'),
    'utf8'
  );

  assert.match(positionMastery, /No position-tagged decisions have been recorded yet/);
  assert.doesNotMatch(positionMastery, /Distribute overall accuracy|realistic position variance/);
  assert.match(studyGroup, /Open Hand History Upload/);
  assert.doesNotMatch(studyGroup, /loadDemoHand|local-demo|Solver says: CALL is \+1\.2 EV/);
});

test('non-graded tools cannot manufacture perfect training sessions', () => {
  const nonGradedRoutes = [
    'focus-timer',
    'gto-news',
    'hand-comparison',
    'qre-explorer',
    'rake-solutions',
    'risk-analyzer',
    'session-warmup',
  ];

  for (const route of nonGradedRoutes) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/, `${route} writes false graded activity`);
  }

  const sessionApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/save-session.js'), 'utf8');
  assert.match(sessionApi, /req\.body\.questionsAnswered/);
  assert.match(sessionApi, /req\.body\.questionsCorrect/);
  assert.match(sessionApi, /parsedHandsPlayed < 1/);
  assert.doesNotMatch(sessionApi, /req\.body\.gtowScore \?\? req\.body\.accuracy \?\? 100/);
});

test('the retired XP compatibility stub is absent from the active arena contract', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  for (const source of [trainer, arena, table]) assert.doesNotMatch(source, /\btotalXP\b/);
});

test('training components do not export fabricated solver-result fixtures', () => {
  const feedback = fs.readFileSync(
    path.join(ROOT, 'src/components/training/FeedbackCard.tsx'),
    'utf8'
  );

  assert.doesNotMatch(feedback, /generateDemoSolverResult|DEMO DATA GENERATOR/);
});

test('journal, playbook, and tournament planner use isolated durable tool records', () => {
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/tool-records.js'), 'utf8');
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260829121500_training_tool_records.sql'), 'utf8');
  const journal = fs.readFileSync(path.join(ROOT, 'pages/hub/training/mental-journal.js'), 'utf8');
  const playbook = fs.readFileSync(path.join(ROOT, 'pages/hub/training/my-playbook.js'), 'utf8');
  const planner = fs.readFileSync(path.join(ROOT, 'pages/hub/training/tournament-prep.js'), 'utf8');

  assert.match(migration, /create table if not exists public\.training_tool_records/i);
  assert.match(migration, /unique \(user_id, tool_id, record_key\)/i);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
  assert.match(api, /onConflict: 'user_id,tool_id,record_key'/);
  assert.match(api, /\.maybeSingle\(\)/);
  assert.match(api, /if \(!saved\) throw new Error/);
  for (const source of [journal, playbook, planner]) {
    assert.match(source, /api\/training\/tool-records/);
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/);
  }
});

test('training writes fail closed without unsafe single-row coercion', () => {
  const messagesApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/study-groups/[groupId]/messages.js'),
    'utf8'
  );
  const toolRecordsApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/tool-records.js'),
    'utf8'
  );

  for (const source of [messagesApi, toolRecordsApi]) {
    assert.doesNotMatch(source, /\.single\(\)/);
    assert.match(source, /\.maybeSingle\(\)/);
  }
  assert.match(messagesApi, /error \|\| !message/);
});

test('retired heuristic trainers route to the matching authored Club Arena games', () => {
  const routes = {
    'bounty-trainer': 'mtt-005',
    'icm-final-table': 'mtt-004',
    'pot-geometry': 'adv-011',
    'range-advisor': 'adv-004',
    'player-profiles': 'adv-015',
    'three-way-postflop': 'cash-016',
    'frequency-locking': 'adv-005',
    'bluff-catcher': 'cash-005',
    'spr-trainer': 'adv-011',
    'preflop-advisor': 'cash-001',
    'villain-range': 'adv-008',
    'mixed-strategy-lab': 'mixed-strategy-lab',
    'ev-trainer': 'adv-006',
  };

  for (const [route, gameId] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.match(source, new RegExp(`arena/${gameId.replace('-', '\\-')}\\?level=1`));
    assert.doesNotMatch(source, /Math\.random|save-session|session-complete/);
  }
});

test('legacy simulated reports and play surfaces route to verified data or Club Arena', () => {
  const routes = {
    'range-explorer': '/hub/training/preflop-charts',
    'gto-scorecard': '/hub/training/gto-reports',
    'performance-heatmap': '/hub/training/gto-reports',
    'play-mode': '/hub/training/arena/cash-001?level=1',
  };

  for (const [route, href] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.ok(source.includes(`href="${href}"`), `${route} must route to ${href}`);
    assert.doesNotMatch(source, /Math\.random|simulate position|heuristic GTO|GTO_BASELINES/);
  }

  const godMode = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  assert.doesNotMatch(godMode, /CustomSpotDrillBuilder|GTOReportsDashboard|AggregatedFlopReport|PopupHUDOverlay|ActionFilterAnalyzer|EVComparisonTool|MassDataAnalysis|MarkTheSpot|StrategyNodeInspector/);
  assert.match(godMode, /source="Solved Spots Gold"/);
  assert.match(godMode, /source="Authenticated Training Sessions"/);
  assert.match(godMode, /source="Authenticated Hand History"/);
  assert.match(godMode, /source="Production Integration State"/);
});
