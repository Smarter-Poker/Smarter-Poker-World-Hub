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
const ast = parse(arena, {
  sourceType: 'module',
  plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
});

const RETIRED_FIXTURES = new Set([
  'EVLossTracker',
  'FrequencyTrainer',
  'GTODeviationHeatmap',
  'GhostReplayEngine',
  'HandNoteTagger',
  'HandReplayViewer',
  'LifetimeStatsCard',
  'PositionMasteryTracker',
  'PositionStatsPanel',
  'SessionReplayTimeline',
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
  { tab: 'notes', href: '/hub/training/replay-theater', source: 'Authenticated Hand History' },
  { tab: 'mastery', href: '/hub/training/progress', source: 'Sealed Training Attempts' },
  { tab: 'replay', href: '/hub/training/replay-theater', source: 'Authenticated Hand History' },
  { tab: 'exploits', href: '/hub/training/solutions', source: 'Audited PioSOLVER V2 Corpus' },
  { tab: 'solvsimpl', href: '/hub/training/solutions', source: 'Audited PioSOLVER V2 Corpus' },
  { tab: 'simpsolve', href: '/hub/training/solutions', source: 'Audited PioSOLVER V2 Corpus' },
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
  const next = arena.indexOf('\n          {reviewTab ===', start + marker.length);
  return arena.slice(start, next === -1 ? arena.length : next);
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
  const rendered = new Set();

  walk(ast.program, (node) => {
    if (node.type === 'ImportDeclaration') {
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
});

test('each retired review tab fails over to a real authenticated or solver-backed route', () => {
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
  assert.match(reviewBranch('notes'), /never substitutes sample hands, generated notes, or demo player records/);
  assert.match(reviewBranch('mastery'), /does not invent mastery percentages or positional sample sizes/);
  assert.match(reviewBranch('replay'), /No decorative timeline events or fictional outcomes/);
  assert.match(reviewBranch('exploits'), /does not infer population exploits or generate unsupported frequency targets/);
  assert.match(reviewBranch('solvsimpl'), /never simplified into invented strategy advice/);
  assert.match(reviewBranch('simpsolve'), /does not present hardcoded ranges or demo frequencies/);
  assert.match(reviewBranch('mistakes'), /never render a false clean-session result or zero-EV hand/);
  assert.match(reviewBranch('positions'), /does not label an unavailable legacy heatmap as zero-loss play/);
  assert.match(reviewBranch('concepts'), /does not manufacture concept mastery/);
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

  assert.doesNotMatch(arena, /const gtoCounts = \{|gtoPct=\{\(\(gtoCounts/);
  assert.doesNotMatch(arena, /totalSessions=\{1\}|gamesCompleted=\{1\}/);
  assert.match(arena, /EVGraph handHistory=\{measuredEVGraphHistory\}/);
  assert.match(arena, /handFieldOf\(entry, 'solverVerified'\) === true/);
  assert.match(arena, /handFieldOf\(entry, 'evLossMeasured'\) === true/);
  assert.match(arena, /const measuredEVGraphHistory = measuredEVReviewHistory\.map/);
  assert.match(arena, /evLoss: -Math\.abs\(Number\(handFieldOf\(entry, 'evLoss'\)\)\)/);
  assert.match(arena, /streetDecisions\[s\] > 0 \? `-\$\{streetEV\[s\]\.toFixed\(1\)\}` : '—'/);
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
      'AnalysisSection',
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
