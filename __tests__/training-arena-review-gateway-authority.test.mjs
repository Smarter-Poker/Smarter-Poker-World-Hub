import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const ARENA_PATH = path.join(ROOT, 'src/components/training/GodModeArena.jsx');
const arena = fs.readFileSync(ARENA_PATH, 'utf8');
const sessionHistory = fs.readFileSync(
  path.join(ROOT, 'src/components/training/SessionHistoryList.jsx'),
  'utf8'
);
const sessionShareCard = fs.readFileSync(
  path.join(ROOT, 'src/components/training/SessionShareCard.jsx'),
  'utf8'
);
const deterministicEngine = fs.readFileSync(
  path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'),
  'utf8'
);
const ast = parse(arena, {
  sourceType: 'module',
  plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
});

const RETIRED_FIXTURES = new Set([
  'EVTreeVisualizer',
  'EVLossTracker',
  'FrequencyTrainer',
  'GTODeviationHeatmap',
  'GhostReplayEngine',
  'HandNoteTagger',
  'HandReplayViewer',
  'LifetimeStatsCard',
  'MixedStrategyTrainer',
  'PositionMasteryTracker',
  'PositionStatsPanel',
  'SessionReplayTimeline',
  'SessionCoachingEngine',
  'FrequencyExploiter',
  'SolverSimplify',
  'SmartPracticeBanner',
  'SimplifiedSolutions',
]);

const GATEWAYS = [
  { tab: 'mistakes', href: '/hub/training/replay-theater', source: 'Authenticated Hand History' },
  { tab: 'positions', href: '/hub/training/session-dashboard', source: 'Sealed Non-Practice Attempts' },
  { tab: 'concepts', href: '/hub/training/progress', source: 'Sealed Training Attempts' },
  { tab: 'hands', href: '/hub/training/replay-theater', source: 'Authenticated Hand History' },
  { tab: 'solver', href: '/hub/training/solutions', source: 'Training Corpus And Solver APIs' },
  { tab: 'analysis', href: '/hub/training/solutions', source: 'Audited PioSOLVER V2 Corpus' },
];

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
}

function reviewBranch(tab) {
  const marker = `{reviewTab === '${tab}' && (`;
  const start = arena.indexOf(marker);
  assert.notEqual(start, -1, `missing ${tab} review branch`);
  const possibleEnds = [
    arena.indexOf('\n          {reviewTab ===', start + marker.length),
    arena.indexOf('\n          {/* END VISIBLE REVIEW TABS */}', start + marker.length),
  ].filter((value) => value >= 0);
  assert.ok(possibleEnds.length > 0, `missing end marker for ${tab} review branch`);
  return arena.slice(start, Math.min(...possibleEnds));
}

function renderedComponents(tab) {
  return [
    ...new Set(
      [...reviewBranch(tab).matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1])
    ),
  ].sort();
}

test('GodModeArena cannot import or render retired demo-backed or inferred review widgets', () => {
  const imported = new Set();
  const localComponentImports = new Set();
  const rendered = new Set();

  walk(ast.program, (node) => {
    if (node.type === 'ImportDeclaration') {
      if (String(node.source?.value || '').startsWith('./')) {
        localComponentImports.add(node.source.value);
      }
      node.specifiers.forEach((specifier) => {
        if (specifier.local?.name) imported.add(specifier.local.name);
      });
    }
    if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier') {
      rendered.add(node.name.name);
    }
  });

  for (const fixture of RETIRED_FIXTURES) {
    assert.equal(imported.has(fixture), false, `${fixture} must not be imported by GodModeArena`);
    assert.equal(rendered.has(fixture), false, `${fixture} must not render inside GodModeArena`);
  }

  assert.deepEqual([...localComponentImports].sort(), [
    './EVGraph',
    './GameUIRouter',
    './LeaderboardPanel',
    './PerformanceTrends',
    './SessionHistoryList',
    './SessionShareCard',
    './StudyStreakMap',
    './TrainerConfigModal',
    './VerifiedToolGateway',
  ]);
});

test('each non-overview visible review tab uses a real authenticated or solver-backed route', () => {
  for (const gateway of GATEWAYS) {
    const branch = reviewBranch(gateway.tab);
    assert.match(branch, /<VerifiedToolGateway\b/, `${gateway.tab} must use the verified gateway`);
    assert.match(branch, new RegExp(`href="${gateway.href}"`));
    assert.match(branch, new RegExp(`source="${gateway.source}"`));

    const routeFile = path.join(ROOT, 'pages', `${gateway.href}.js`);
    assert.equal(fs.existsSync(routeFile), true, `${gateway.href} must resolve to a real page`);
  }
});

test('the replacement copy discloses the authoritative source and rejects demo inference', () => {
  assert.match(reviewBranch('hands'), /never derives equity, future runout EV, blocker scores, or game-tree branches/);
  assert.match(reviewBranch('mistakes'), /never render a false clean-session result or zero-EV hand/);
  assert.match(reviewBranch('positions'), /does not label an unavailable legacy heatmap as zero-loss play/);
  assert.match(reviewBranch('concepts'), /does not manufacture concept mastery/);
  assert.match(reviewBranch('solver'), /does not extrapolate missing street actions, opponent responses, range equity, or game-tree branches/);
  assert.match(reviewBranch('analysis'), /does not pool unrelated decisions into a fabricated frequency-adherence grade/);
});

test('the visible review tabs expose no inferred solver or faux-lifetime component', () => {
  const navStart = arena.indexOf('/* REVIEW NAV CONSOLIDATION');
  const navEnd = arena.indexOf('].map((tab) => (', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart);
  const nav = arena.slice(navStart, navEnd);
  const visibleTabs = [...nav.matchAll(/\{ id: '([^']+)', label:/g)].map((match) => match[1]);
  assert.deepEqual(visibleTabs, [
    'overview',
    'mistakes',
    'positions',
    'concepts',
    'hands',
    'solver',
    'analysis',
  ]);

  const renderedBranches = [...arena.matchAll(/reviewTab === '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(renderedBranches, visibleTabs, 'only the seven visible review branches may exist');

  assert.doesNotMatch(arena, /const gtoCounts = \{|gtoPct=\{\(\(gtoCounts/);
  assert.doesNotMatch(arena, /totalSessions=\{1\}|gamesCompleted=\{1\}/);
  assert.match(arena, /EVGraph handHistory=\{measuredEVGraphHistory\}/);
  assert.match(arena, /handFieldOf\(entry, 'solverVerified'\) === true/);
  assert.match(arena, /handFieldOf\(entry, 'evLossMeasured'\) === true/);
  assert.match(arena, /const measuredEVGraphHistory = measuredEVReviewHistory\.map/);
  assert.match(arena, /evLoss: -Math\.abs\(Number\(handFieldOf\(entry, 'evLoss'\)\)\)/);
  assert.match(arena, /streetDecisions\[s\] > 0 \? `-\$\{streetEV\[s\]\.toFixed\(1\)\}` : '-'/);
  assert.match(arena, /deriveTopLeaks\(measuredEVReviewHistory, 5\)/);
  assert.match(arena, /Measured EV Loss \(BB\)/);
  assert.match(arena, /Measured EV\/Decision/);
  assert.match(arena, /Measured EV\/Mistake/);
  assert.match(arena, /Verified Freq Diff/);
  assert.match(arena, /Measured EV unavailable/);
  assert.doesNotMatch(arena, /Great mixing - GTO-balanced!/);
  assert.doesNotMatch(arena, /\{ht\.correct\}\/\{ht\.total\} · -\{ht\.evLoss\}bb/);
  assert.doesNotMatch(arena, /setReviewTab\('__legacy_/);
});

test('the seven visible review branches have a closed rendered-component allowlist', () => {
  const expected = {
    overview: [
      'AccuracyByPositionChart',
      'AccuracyOverTimeChart',
      'ClassificationDonut',
      'ClassificationSVGIcon',
      'VerifiedToolGateway',
      'WeaknessHeatmap',
    ],
    mistakes: ['VerifiedToolGateway'],
    positions: ['VerifiedToolGateway'],
    concepts: ['VerifiedToolGateway'],
    hands: ['VerifiedToolGateway'],
    solver: ['VerifiedToolGateway'],
    analysis: [
      'EVGraph',
      'LeaderboardPanel',
      'SessionHistoryList',
      'StudyStreakMapAuto',
      'VerifiedToolGateway',
    ],
  };

  for (const [tab, components] of Object.entries(expected)) {
    assert.deepEqual(renderedComponents(tab), components, `${tab} review component graph changed`);
  }
});

test('Deep Analysis is a closed measured/authenticated allowlist with no browser insight calls', () => {
  const branch = reviewBranch('analysis');
  assert.doesNotMatch(branch, /\b(?:get|generate|estimate)[A-Z][A-Za-z0-9]*\s*\(/);
  assert.doesNotMatch(branch, /<AnalysisSection\b/);
  assert.match(branch, /EVGraph handHistory=\{measuredEVGraphHistory\}/);
  assert.match(branch, /<StudyStreakMapAuto\b/);
  assert.match(branch, /<SessionHistoryList\b/);
  assert.match(branch, /<LeaderboardPanel\b/);
});

test('authenticated session history preserves the API signed-score contract', () => {
  assert.match(sessionHistory, /Number\(session\.gtow_score_signed\)/);
  assert.match(sessionHistory, /formatSignedScore\(signedScore\)/);
  assert.match(sessionHistory, /getArenaScoreColor\(signedScore\)/);
  assert.doesNotMatch(sessionHistory, /session\.gtow_score\s*\|\|\s*session\.accuracy_percentage/);
  assert.doesNotMatch(sessionHistory, /score >= 80|score >= 60/);
});

test('shareable review cards disclose only measured EV evidence', () => {
  assert.match(arena, /totalEVLoss=\{measuredEVTotal\}/);
  assert.match(arena, /measuredEVDecisions=\{measuredEVReviewHistory\.length\}/);
  assert.match(arena, /label: 'MEASURED EV LOSS'/);
  assert.match(
    arena,
    /totalEVLoss:\s*measuredEVReviewHistory\.length > 0 \? measuredEVTotal : null/
  );
  assert.match(sessionShareCard, /measuredEVDecisions > 0/);
  assert.match(sessionShareCard, /MEASURED EV\/DECISION/);
  assert.match(sessionShareCard, /const evPerDecision = hasMeasuredEV/);
  assert.doesNotMatch(sessionShareCard, /const evPerHand = totalQuestions/);
});

test('browser-derived review summaries never claim Daily Challenge, AI, or solver authority', () => {
  assert.match(arena, /function SessionScoreTarget\(/);
  assert.match(arena, /Session Score Target Met/);
  assert.match(arena, /This does not award Daily Challenge progress/);
  assert.doesNotMatch(arena, /function DailyChallengeBanner\(|Daily Challenge Complete!/);

  assert.match(arena, /Session Answer Debrief/);
  assert.doesNotMatch(arena, /AI Coach Debrief|>\s*AI Coach\s*</);
  assert.doesNotMatch(arena, /GTO mastery in action|GTO fundamentals are solid|Core GTO fundamentals need work/);

  assert.match(deterministicEngine, /This is an answer-history summary, not an independent solver or AI/);
  assert.match(deterministicEngine, /graded-answer accuracy/);
  assert.doesNotMatch(deterministicEngine, /accuracy shows strong GTO understanding|Biggest leak:|study solver ranges for this seat/);
});
