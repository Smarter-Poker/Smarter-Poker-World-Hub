import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
  isProvenanceCompleteAuditedDecision,
  summarizeProvenanceCompleteHandAudit,
} from '../src/lib/training/handHistoryReviewAuthority.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');

const scenario = read('pages/hub/training/scenario-demo.js');
const shortDeck = read('pages/hub/training/short-deck-trainer.js');
const handHistory = read('pages/hub/training/hand-history-upload.js');
const accountScopedCacheRoutes = [
  'pages/api/training/achievements.js',
  'pages/api/training/bookmark-solution.js',
  'pages/api/training/get-progress.js',
  'pages/api/training/preflop-ranges.js',
  'pages/api/training/recommendations.js',
  'pages/api/training/streak.js',
  'pages/api/training/weekly-stats.js',
];

function parsePage(source, filename) {
  return parse(source, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['jsx', 'optionalChaining'],
  });
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, visit);
  }
}

function propertyName(property) {
  return property?.key?.name ?? property?.key?.value ?? null;
}

function quizOptionContracts(source, filename) {
  const contracts = [];
  walk(parsePage(source, filename), node => {
    if (node.type !== 'ObjectExpression') return;
    const properties = new Map(
      node.properties
        .filter(property => property.type === 'ObjectProperty')
        .map(property => [propertyName(property), property.value])
    );
    const options = properties.get('options');
    const correct = properties.get('correct');
    if (options?.type !== 'ArrayExpression' || correct?.type !== 'StringLiteral') return;
    const values = options.elements.map(element => element?.value);
    contracts.push({ correct: correct.value, values });
  });
  return contracts;
}

test('scenario tutorial is explicitly illustrative practice, never solver or progression authority', () => {
  parsePage(scenario, 'scenario-demo.js');
  assert.match(scenario, /Illustrative Teaching Example · Not Solver Output/);
  assert.match(scenario, /practice-only tutorial/i);
  assert.match(scenario, /does not affect account progress, rank, or rewards/i);
  assert.match(scenario, /complete exact-node provenance/i);
  assert.match(scenario, /savePracticeSession\('scenario-demo'/);
  assert.doesNotMatch(scenario, /eventBus|EventType|SESSION_END/);
  assert.doesNotMatch(scenario, /gtowScore|totalEVLoss|levelPassed|bestStreak/);
  assert.doesNotMatch(scenario, /GTO Score|solver checks 70%|near-optimal poker/i);

  const contracts = quizOptionContracts(scenario, 'scenario-demo.js');
  assert.equal(contracts.length, 5);
  for (const contract of contracts) {
    assert.equal(contract.values.length, 4);
    assert.ok(contract.values.includes(contract.correct));
    assert.equal(new Set(contract.values).size, contract.values.length);
  }
});

test('short-deck quiz teaches only its disclosed factual ruleset', () => {
  parsePage(shortDeck, 'short-deck-trainer.js');
  assert.match(shortDeck, /Short Deck rooms can use different hand rankings/i);
  assert.match(shortDeck, /ruleset: '36-card-flush-over-full-house'/);
  assert.match(shortDeck, /How Many Cards Of That Suit Remain Unseen/);
  assert.match(shortDeck, /correct: '7'/);
  assert.match(shortDeck, /Estimated Via Short Deck Monte Carlo/);
  assert.match(shortDeck, /savePracticeSession\('short-deck-trainer'/);
  assert.doesNotMatch(shortDeck, /eventBus|EventType|SESSION_END/);
  assert.doesNotMatch(shortDeck, /gtowScore|totalEVLoss|levelPassed|bestStreak/);
  assert.doesNotMatch(shortDeck, /Can you make a flush|~5-10%|Trips are easier|Pocket Aces are less dominant/i);

  const contracts = quizOptionContracts(shortDeck, 'short-deck-trainer.js');
  assert.equal(contracts.length, 5);
  for (const contract of contracts) {
    const yesNo = contract.values.length === 2
      && contract.values[0] === 'Yes'
      && contract.values[1] === 'No';
    assert.ok(contract.values.length === 4 || yesNo);
    assert.ok(contract.values.includes(contract.correct));
    assert.equal(new Set(contract.values).size, contract.values.length);
  }
});

function auditedDecision(overrides = {}) {
  return {
    street: 'flop',
    playerAction: 'check',
    solverAction: 'x',
    classification: 'best',
    evLoss: null,
    evLossMeasured: false,
    solverVerified: true,
    solverSource: 'DETERMINISTIC_SOLVER|hand-audit-v3',
    matchTier: 1,
    ...overrides,
  };
}

test('hand-history audit authority accepts only complete exact-node server decisions', () => {
  const exact = auditedDecision();
  assert.equal(isProvenanceCompleteAuditedDecision(exact), true);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, matchTier: 2 }), false);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, solverVerified: false }), false);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, solverSource: 'CHART|hand-audit-v3' }), false);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, solverSource: 'DETERMINISTIC_SOLVER' }), false);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, solverAction: null }), false);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...exact, evLossMeasured: true, evLoss: null }), false);

  const normalizedClassification = summarizeProvenanceCompleteHandAudit({
    decisions: [{ ...exact, classification: 'BEST' }],
  });
  assert.equal(normalizedClassification.score, 100);

  const complete = summarizeProvenanceCompleteHandAudit({
    decisions: [exact, auditedDecision({ classification: 'wrong', evLossMeasured: true, evLoss: 0.25 })],
  });
  assert.equal(complete.solverVerified, true);
  assert.equal(complete.authority, 'provenance_complete_server_audit');
  assert.equal(complete.score, 50);
  assert.equal(complete.evLoss, 0.25);
  assert.equal(complete.mistakeDecisions, 1);

  const partial = summarizeProvenanceCompleteHandAudit({
    decisions: [exact, { ...exact, solverVerified: false }],
  });
  assert.deepEqual(partial, {
    authority: 'replay_only_unpriced',
    solverVerified: false,
    decisions: [],
    score: null,
    evLoss: null,
    correctDecisions: 0,
    mistakeDecisions: null,
  });
});

test('hand-history review UI fails closed around the audited authority helper', () => {
  parsePage(handHistory, 'hand-history-upload.js');
  assert.match(handHistory, /summarizeProvenanceCompleteHandAudit\(hand\?\._solverAudit\)/);
  assert.match(handHistory, /if \(!audited\.solverVerified\)/);
  assert.match(handHistory, /evLoss: null/);
  assert.match(handHistory, /score: null/);
  assert.match(handHistory, /Replay Only: This Hand Does Not Have Complete Exact-Node Server Audit Evidence/);
  assert.match(handHistory, /BB Measured Action-EV/);
  assert.doesNotMatch(handHistory, /-\$\{Number\(coaching\.evLoss\)/);
  assert.match(handHistory, /payload\.persisted !== true \|\| payload\.evidenceReconciled !== true/);
  assert.match(handHistory, /authority: verifiedDecisions\.length > 0[\s\S]*?'provenance_complete_server_audit'[\s\S]*?'replay_only_unpriced'/);

  assert.doesNotMatch(handHistory, /HandAnalyzer|analyzeHand\(|estimated:\s*true/);
  const gradeStart = handHistory.indexOf('function gradeHand(');
  const gradeEnd = handHistory.indexOf('// ── Helper: Derive hero position', gradeStart);
  const gradeSource = handHistory.slice(gradeStart, gradeEnd);
  assert.doesNotMatch(gradeSource, /score\s*=\s*100|evLoss\s*\+=|Clean line - no detectable|calling station pattern|solver c-bets/i);
  assert.doesNotMatch(handHistory, /EventType|training:session-complete|training:coaching-summary/);
  assert.doesNotMatch(handHistory, /\.filter\(d => d\.solverVerified\)/);

  const practiceStart = handHistory.indexOf("savePracticeSession('hand-history-upload'");
  const practiceEnd = handHistory.indexOf('});', practiceStart);
  const practiceCall = handHistory.slice(practiceStart, practiceEnd + 3);
  assert.ok(practiceStart >= 0);
  assert.match(practiceCall, /handsPlayed: sessionData\.totalHands/);
  assert.doesNotMatch(practiceCall, /gtowScore|solverAccuracy|totalEVLoss|measuredEVLoss|levelPassed|correctCount/);
});

test('authenticated Training GET caches vary by the verified identity', () => {
  for (const route of accountScopedCacheRoutes) {
    const source = read(route);
    assert.match(source, /setHeader\('Vary', 'Authorization'\)/, route);
  }
});
