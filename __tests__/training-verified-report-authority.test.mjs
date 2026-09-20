import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function compile(relativePath, dependencies = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(read(relativePath), {
    babelrc: false,
    configFile: false,
    filename: relativePath,
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports;
}

function sampleRows() {
  return [
    {
      id: 'session-current',
      game_id: 'cash-001',
      game_name: 'Cash One',
      score_scale: 2,
      gtow_score: 0,
      accuracy: 0,
      hands_played: 2,
      correct_count: 0,
      total_ev_loss: 0,
      created_at: '2026-09-06T02:00:00.000Z',
      classification_counts: { wrong: 2 },
      position_stats: { BTN: { total: 2, correct: 0, evLoss: 999 } },
      hand_history: [
        { heroPosition: 'BTN', solverVerified: true, evLossMeasured: true, evLoss: 0 },
        { heroPosition: 'BTN', solverVerified: false, evLoss: 99 },
      ],
      training_attempts: { practice_only: false },
    },
    {
      id: 'session-legacy',
      game_id: 'cash-002',
      game_name: 'Cash Two',
      score_scale: 1,
      gtow_score: 90,
      accuracy: 75,
      hands_played: 4,
      correct_count: 3,
      total_ev_loss: 0,
      created_at: '2026-09-05T02:00:00.000Z',
      classification_counts: { correct: 3, wrong: 1 },
      position_stats: { BB: { total: 4, correct: 3, evLoss: 0 } },
      hand_history: [{ heroPosition: 'BB', solverVerified: false, evLoss: 0 }],
      training_attempts: { practice_only: false },
    },
  ];
}

function loadReportModule(client = {}) {
  const sessionEvidence = compile('src/lib/training/sessionEvidence.mjs');
  return compile('pages/api/training/gto-reports.js', {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: 'user-1' }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value, max) => String(value || '').slice(0, max),
      withTiming() {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
    '../../../src/lib/training/trainingPersistence.mjs': {
      runTrainingPersistenceQuery: async (queryFactory) => queryFactory(),
    },
    '../../../src/lib/training/sessionEvidence.mjs': sessionEvidence,
  });
}

function response() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

test('session evidence never promotes compatibility zeroes into measured solver EV', () => {
  const evidence = compile('src/lib/training/sessionEvidence.mjs');
  const [current, legacy] = sampleRows().map(evidence.projectTrainingSessionEvidence);

  assert.equal(current.gtow_score_signed, 0, 'signed zero is real and must survive');
  assert.equal(current.total_ev_loss, 0, 'measured zero is real and must survive');
  assert.equal(current.measured_ev_decisions, 1);
  assert.equal(current.position_stats.BTN.measuredEvDecisions, 1);
  assert.equal(current.position_stats.BTN.evLoss, 0);
  assert.equal(current.position_stats.BTN.avgEvLoss, 0);

  const unmeasuredVerified = evidence.projectTrainingSessionEvidence({
    score_scale: 2,
    gtow_score: 0,
    hand_history: [{
      heroPosition: 'BTN',
      solverVerified: true,
      evLossMeasured: false,
      evLoss: 0,
    }],
  });
  assert.equal(unmeasuredVerified.total_ev_loss, null);
  assert.equal(unmeasuredVerified.measured_ev_decisions, 0);
  assert.equal(unmeasuredVerified.position_stats.BTN.evLoss, null);

  assert.equal(legacy.gtow_score_signed, null, 'legacy score scale is not verified signed history');
  assert.equal(legacy.total_ev_loss, null, 'database compatibility zero is not measured evidence');
  assert.equal(legacy.measured_ev_decisions, 0);
  assert.equal(legacy.position_stats.BB.evLoss, null);

  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: 4, correct_count: 0, accuracy: 99 }), 0);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: 4, correct_count: 3, accuracy: 0 }), 75);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: 0, correct_count: 0, accuracy: 0 }), null);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: 4.5, correct_count: 3, accuracy: 99 }), null);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: 4, correct_count: 5, accuracy: 99 }), null);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: null, correct_count: null, accuracy: 82 }), 82);
  assert.equal(evidence.deriveTrainingSessionAccuracy({ hands_played: null, correct_count: null, accuracy: null }), null);
  assert.equal(evidence.signedTrainingScore({ score_scale: 2, gtow_score: 101 }), null);

  const invalidPosition = evidence.projectTrainingSessionEvidence({
    position_stats: { BTN: { total: 2, correct: 3 } },
    hand_history: [],
  });
  assert.equal(Object.hasOwn(invalidPosition.position_stats, 'BTN'), false);
});

test('verified report aggregates accuracy and measured evidence without frequency invention', () => {
  const { buildVerifiedTrainingReport } = loadReportModule();
  const report = buildVerifiedTrainingReport(sampleRows(), { period: 'all' });

  assert.equal(report.totalSessions, 2);
  assert.equal(report.totalQuestions, 6);
  assert.equal(report.totalCorrect, 3);
  assert.equal(report.overallAccuracy, 50);
  assert.equal(report.verifiedScoreAverage, 0);
  assert.equal(report.totalMeasuredEvLoss, 0);
  assert.equal(report.avgMeasuredEvLoss, 0);
  assert.equal(report.measuredEvDecisions, 1);
  assert.equal(report.authority.frequencyComparisonAvailable, false);
  assert.equal(Object.hasOwn(report, 'gtoProximityScore'), false);
  assert.equal(Object.hasOwn(report, 'gtoBaselines'), false);
  assert.equal(Object.hasOwn(report, 'scorecardStats'), false);

  const filtered = buildVerifiedTrainingReport(sampleRows(), { period: 'all', gameId: 'cash-001' });
  assert.equal(filtered.totalSessions, 1);
  assert.equal(filtered.overallAccuracy, 0);
  assert.equal(filtered.availableFormats.length, 2, 'format selector retains every format in the period');
});

test('report API validates filters, fails private, and binds rows to completed same-user attempts', async () => {
  const calls = [];
  const result = { data: sampleRows(), error: null };
  const query = {
    select(...args) { calls.push(['select', ...args]); return query; },
    eq(...args) { calls.push(['eq', ...args]); return query; },
    not(...args) { calls.push(['not', ...args]); return query; },
    gte(...args) { calls.push(['gte', ...args]); return query; },
    order(...args) { calls.push(['order', ...args]); return query; },
    limit(...args) { calls.push(['limit', ...args]); return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  const client = { from(table) { calls.push(['from', table]); return query; } };
  const { default: handler } = loadReportModule(client);

  const invalid = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' }, query: { period: 'forever' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.length, 0);

  const success = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer token' }, query: { period: 'all' } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.report.measuredEvDecisions, 1);
  assert.equal(success.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(success.headers.vary, 'Authorization');
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'training_attempts.user_id' && call[2] === 'user-1'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'training_attempts.status' && call[2] === 'completed'));
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'training_attempts.practice_only' && call[2] === false));
  assert.ok(calls.some((call) => call[0] === 'limit' && call[1] === 500));
});

test('all report routes use the shared verified surface and contain no manufactured GTO model', () => {
  const reportPage = read('pages/hub/training/reports.js');
  const legacyPage = read('pages/hub/training/gto-reports.js');
  const api = read('pages/api/training/gto-reports.js');

  assert.match(reportPage, /Verified Training Reports/);
  assert.match(reportPage, /EV Appears Only For Solver-Verified Decisions With Measured Loss/);
  assert.match(legacyPage, /export \{ default \} from '\.\/reports'/);
  assert.doesNotMatch(reportPage, /GTODeviationHeatmap|calculateGTOProximity|GTO_BASELINES|<StatCard/);
  assert.doesNotMatch(api, /GTO_BASELINES|gtoProximityScore|scorecardStats/);
  assert.doesNotMatch(reportPage, /Frequency Deviation Analysis|GTO PROXIMITY SCORE|Your Stats Are Close To GTO/);
});

test('live get-sessions consumers require measured evidence before displaying EV', () => {
  const targets = [
    'pages/hub/training.js',
    'pages/hub/training/autopilot.js',
    'pages/hub/training/study-plan.js',
    'pages/hub/training/session-dashboard.js',
    'src/components/training/SessionHistoryList.jsx',
  ];
  for (const file of targets) {
    const source = read(file);
    assert.doesNotMatch(source, /total_ev_loss\s*\|\|\s*0/, file);
  }
  assert.match(read('pages/hub/training/session-dashboard.js'), /measured_ev_decisions/);
  assert.match(read('pages/hub/training/autopilot.js'), /measuredEvDecisions/);
  assert.match(read('pages/hub/training/study-plan.js'), /measuredEvDecisions/);
});

test('Jarvis Training Progress never renders absent accuracy or duration as a measured zero', () => {
  const hook = read('src/hooks/useAssistant.js');
  const tracker = read('src/world/components/Jarvis/TrainingProgressTracker.tsx');

  assert.match(hook, /deriveTrainingSessionAccuracy\(s\)/);
  assert.doesNotMatch(hook, /accuracy:\s*s\.accuracy\s*\|\|\s*0/);
  assert.match(hook, /totalAccuracy:\s*null/);
  assert.match(tracker, /hasOverallAccuracy/);
  assert.match(tracker, /Not Available/);
  assert.match(tracker, /Duration Not Recorded/);
  assert.doesNotMatch(tracker, /<span>\{session\.duration\}\s*Min<\/span>/);
});

test('secondary progress and recommendation surfaces derive accuracy without zero fallbacks', () => {
  const progress = read('pages/hub/training/progress.js');
  const feed = read('pages/hub/training/training-feed.js');
  const recommendations = read('pages/api/training/recommendations.js');
  const coaching = read('pages/api/training/coaching-summary.js');

  assert.match(progress, /deriveTrainingSessionAccuracy\(s\)/);
  assert.match(progress, /accuracy:\s*null/);
  assert.match(progress, /Accuracy Not Available/);
  assert.match(feed, /deriveTrainingSessionAccuracy/);
  assert.match(feed, /Accuracy Not Available/);
  assert.doesNotMatch(feed, /s\.accuracy\s*\|\|/);
  assert.match(recommendations, /verifiedAccuracy:\s*deriveTrainingSessionAccuracy\(session\)/);
  assert.match(recommendations, /insufficientScoredHistory:\s*true/);
  assert.match(recommendations, /const underSampledCategories = categoryAccuracy/);
  assert.match(recommendations, /filter\(c => c\.accuracy < 75\)/);
  assert.doesNotMatch(recommendations, /c\.accuracy < 75 \|\| c\.sessions < 5/);
  assert.match(recommendations, /add evidence before judging mastery/i);
  assert.match(coaching, /TRAINING_COACHING_SCORE_UNAVAILABLE/);
  assert.doesNotMatch(coaching, /accuracy:\s*Number\(session\.accuracy\)\s*\|\|\s*0/);
});

test('live Arena EV presentation carries an explicit measured-evidence contract end to end', () => {
  const analytics = compile('src/lib/sessionAnalytics.js');
  assert.deepEqual(
    analytics.deriveMeasuredEVSummary([
      { evLoss: 0, evLossMeasured: true },
      { evLoss: 4.2, evLossMeasured: false },
      { evLoss: 0.3, evLossMeasured: true },
      { evLoss: null, evLossMeasured: true },
    ]),
    { totalEVLoss: 0.3, measuredEVDecisions: 2, avgEVLossPerMeasuredDecision: 0.15 },
  );

  const hook = read('src/hooks/useGTOTrainer.js');
  const scoreHook = read('src/hooks/useGTOWScore.js');
  const arena = read('src/components/training/GodModeArena.jsx');
  const router = read('src/components/training/GameUIRouter.jsx');
  const table = read('src/components/training/games/UniversalDynamicTable.jsx');
  const multiTable = read('pages/hub/training/multi-table.js');

  assert.match(hook, /evLoss: hasMeasuredEVLoss \? Number\(serverEvidence\.evLoss\) : null/);
  assert.match(hook, /evLossMeasured: lastEVLossMeasured/);
  assert.match(scoreHook, /deriveMeasuredEVSummary\(handHistory\)/);
  assert.match(arena, /evLossMeasured=\{evLossMeasured\}/);
  assert.match(arena, /measuredEVDecisions=\{measuredEVDecisions\}/);
  assert.match(router, /evLossMeasured=\{evLossMeasured\}/);
  assert.match(router, /measuredEVDecisions=\{measuredEVDecisions\}/);
  assert.match(table, /EV NOT MEASURED/);
  assert.match(table, /NO MEASURED EV LOSS/);
  assert.match(table, /EV: - UNMEASURED/);
  assert.doesNotMatch(table, /'NO EV LOSS'/);
  assert.doesNotMatch(table, /\? `-\$\{evLoss\.toFixed\(2\)\}` : '0\.00'/);
  assert.match(multiTable, /measuredEVDecisions/);
  assert.match(multiTable, /Measured EV Loss/);
});
