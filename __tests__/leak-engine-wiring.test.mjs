import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditParsedHands, normalizeClubArenaHand } from '../src/lib/training/handAuditEngine.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const detect = read('pages/api/assistant/leaks/detect.js');
const record = read('pages/api/training/record-question.js');
const audit = read('pages/api/training/audit-hand-history.js');
const auditEngine = read('src/lib/training/handAuditEngine.js');
const batch = read('pages/api/training/batch-preload.js');
const single = read('pages/api/training/get-question.js');
const upload = read('pages/hub/training/hand-history-upload.js');
const importer = read('src/components/training/HandHistoryImporter.jsx');
const analyzer = read('src/engines/HandAnalyzer.js');
const pokerHistory = read('pages/api/poker/engine/hand-history.js');
const evidenceMigration = read('supabase/migrations/20260827190000_solver_leak_evidence.sql');
const auditMigration = read('supabase/migrations/20260827191000_hand_audit_solver_decisions.sql');

function auditDb(questionRows = [], error = null) {
  return {
    from(table) {
      assert.equal(table, 'training_question_cache');
      const query = {
        select() { return query; },
        like() { return query; },
        eq() { return query; },
        async limit() { return { data: questionRows, error }; },
      };
      return query;
    },
  };
}

function solverQuestion(overrides = {}) {
  const scenario = {
    street: 'flop',
    heroPosition: 'BTN',
    heroHand: 'JTs',
    nodeType: 'hero_bets_or_checks',
    tableSize: 6,
    stackDepth: 100,
    ...(overrides.scenario || {}),
  };
  return {
    source: 'DETERMINISTIC_SOLVER',
    dataQuality: 'SOLVER_EXACT',
    heroCards: ['Jh', 'Th'],
    boardCards: ['As', 'Ks', '2d'],
    options: [{ id: 'x', text: 'Check' }],
    gtoFrequencies: { x: 100 },
    correctAnswer: 'x',
    ...overrides,
    scenario,
  };
}

function parsedHand(overrides = {}) {
  return {
    id: 'test-hand',
    format: 'cash',
    variant: 'holdem',
    gameType: 'nlh',
    tableSize: 6,
    hero: { position: 'BTN', holeCards: ['Jh', 'Th'], stack: 100 },
    streets: {
      preflop: { actions: [] },
      flop: { board: ['As', 'Ks', '2d'], actions: [{ isHero: true, action: 'check', amount: 0 }] },
      turn: null,
      river: null,
    },
    ...overrides,
  };
}

function cachedQuestion(question, id = 'question-1') {
  return { question_id: id, game_id: 'cash-postflop', question_data: question };
}

test('Leak Finder consumes canonical training answers and hand audits', () => {
  assert.match(detect, /from\('training_answers'\)/);
  assert.match(detect, /from\('hand_audit_decisions'\)/);
  assert.match(detect, /like\('solver_source', '%\|hand-audit-v2'\)/);
  assert.match(detect, /aggregateSolverLeaks/);
  assert.doesNotMatch(detect, /classification_counts/);
  assert.doesNotMatch(detect, /combineLiveAndTrainingStats/);
  assert.doesNotMatch(detect, /rows\.length === 0\) return/, 'hand audits must still load when no trainer answers exist');
});

test('answer persistence regrades against a server-owned canonical question', () => {
  assert.match(record, /getCanonicalQuestion/);
  assert.match(record, /gradeSolverDecision\(canonicalQuestion/);
  assert.match(record, /solver_verified: verified/);
  assert.match(record, /ev_loss_measured/);
  assert.match(record, /onConflict: 'user_id,submission_id'/);
  assert.match(read('src/hooks/useGTOTrainer.js'), /for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
});

test('cache-miss trainer questions are canonicalized before answers arrive', () => {
  for (const [name, source] of [['batch-preload', batch], ['get-question', single]]) {
    assert.match(source, /training_question_cache/, `${name} must write the canonical cache`);
    assert.match(source, /question_data/, `${name} must persist the exact served question`);
  }
});

test('hand import uses server audit and refuses ambiguous solver sizing', () => {
  assert.match(audit, /auditParsedHands/);
  assert.match(auditEngine, /gradeSolverDecision/);
  assert.match(auditEngine, /matches\.length === 1/);
  assert.match(auditEngine, /point\.nodeClass/);
  assert.match(auditEngine, /fingerprint/);
  assert.match(auditEngine, /nodeCompatible/);
  assert.match(auditEngine, /solver_verified: solverVerified/);
  assert.match(auditEngine, /maxDecisions = 250/);
  assert.match(upload, /_solverAudit/);
  assert.match(upload, /filter\(g => g\?\.solverVerified\)/);
  assert.doesNotMatch(upload, /training:leaks-detected/);
  assert.doesNotMatch(importer, /Math\.random/);
  assert.doesNotMatch(importer, /SOLVER ANALYSIS STUB/);
});

test('unpriced preflop decisions are never silently marked correct', () => {
  assert.match(analyzer, /pricedDecisions/);
  assert.match(analyzer, /key:\s*'unpriced'/);
  assert.match(analyzer, /classification:\s*classification\.key/);
  assert.match(upload, /excluded from GTO accuracy, EV loss, and Leak Finder evidence/);
});

test('non-exact Club Arena matches persist no solver conclusion or EV claim', () => {
  assert.match(auditEngine, /solver_action: solverVerified \? grade\.optimalAction : null/);
  assert.match(auditEngine, /classification: solverVerified \? grade\.classification : 'unpriced'/);
  assert.match(auditEngine, /ev_loss: solverVerified \? grade\.evLoss : null/);
  assert.match(auditEngine, /ev_loss_measured: solverVerified && !!grade\.evLossMeasured/);
  assert.match(auditEngine, /hasUntrustedClassification/);
});

test('poker hand-history writes fail closed and reads filter before pagination', () => {
  assert.match(pokerHistory, /if \(error\)[\s\S]*?status\(500\)/);
  const containsAt = pokerHistory.indexOf(".contains('players'");
  const rangeAt = pokerHistory.indexOf('.range(');
  assert.ok(containsAt >= 0 && rangeAt > containsAt, 'participant filter must run before pagination');
});

test('Club Arena hand filters use valid JSON containment and include the live recorder', () => {
  for (const [name, source] of [
    ['audit engine', auditEngine],
    ['leak detector', detect],
    ['poker hand history', pokerHistory],
    ['Club Arena My Hands', read('pages/api/club-arena/my-hands.js')],
    ['hand-history library', read('src/lib/poker-engine/HandHistory.js')],
  ]) {
    assert.doesNotMatch(source, /\.contains\('players', \[\{/, `${name} must not emit invalid PostgREST JSON`);
    assert.match(source, /\.contains\('players', JSON\.stringify\(\[\{/, `${name} must serialize JSON containment`);
  }
  assert.match(auditEngine, /\['manual', 'wh-engine', 'engine-api'\]/);
});

test('Club Arena live rows normalize stages, board, button and revealed hero cards', () => {
  const hand = normalizeClubArenaHand({
    id: 'hand-1',
    source: 'manual',
    game_variant: 'nlh',
    button_seat: 4,
    players: [
      { userId: 'hero', username: 'Hero', seat: 4, cards: [null, null] },
      { userId: 'villain', username: 'Villain', seat: 7, cards: [null, null] },
    ],
    hole_cards: { hero: ['As', 'Kh'] },
    community_cards: ['2c', '7d', 'Th', 'Js', 'Qc'],
    actions: [
      { userId: 'villain', action: 'raise', stage: 'preflop', amount: 3 },
      { userId: 'hero', action: 'call', stage: 'preflop', amount: 3 },
      { userId: 'hero', action: 'check', stage: 'flop', amount: 0 },
    ],
  }, 'hero');

  assert.ok(hand);
  assert.deepEqual(hand.hero.holeCards, ['As', 'Kh']);
  assert.equal(hand.hero.position, 'BTN');
  assert.equal(hand.buttonSeat, 4);
  assert.deepEqual(hand.streets.flop.board, ['2c', '7d', 'Th']);
  assert.equal(hand.streets.preflop.actions.length, 2);
  assert.equal(hand.streets.flop.actions.length, 1);
  assert.equal(hand.streets.preflop.actions[1].isHero, true);
});

test('exact Club Arena matches are stamped with matcher v2 provenance', async () => {
  const result = await auditParsedHands(
    auditDb([cachedQuestion(solverQuestion())]),
    'hero',
    [parsedHand()],
    { persist: false },
  );

  assert.equal(result.solverVerified, 1);
  assert.equal(result.complete, true);
  assert.match(result.analyses[0].decisions[0].solverSource, /\|hand-audit-v2$/);
});

test('legacy PIO cache prompts infer only an unambiguous postflop node', async () => {
  const question = solverQuestion({
    type: 'PIO',
    source: 'PIO_DATABASE',
    scenario: { nodeType: undefined, action: 'Villain checks' },
  });
  const result = await auditParsedHands(
    auditDb([cachedQuestion(question)]),
    'hero',
    [parsedHand()],
    { persist: false },
  );

  assert.equal(result.solverVerified, 1);
  assert.match(result.analyses[0].decisions[0].solverSource, /^PIO_DATABASE\|hand-audit-v2$/);
});

test('turn and river order cannot be collapsed into a false exact board match', async () => {
  const hand = parsedHand({
    streets: {
      preflop: { actions: [] },
      flop: { board: ['As', 'Ks', '2d'], actions: [] },
      turn: { card: 'Qs', actions: [{ isHero: true, action: 'check', amount: 0 }] },
      river: null,
    },
  });
  const question = solverQuestion({
    scenario: { street: 'turn' },
    boardCards: ['As', 'Ks', 'Qs', '2d'],
  });
  const result = await auditParsedHands(auditDb([cachedQuestion(question)]), 'hero', [hand], { persist: false });

  assert.equal(result.solverVerified, 0);
  assert.equal(result.unpriced, 1);
});

test('Omaha hands cannot be certified against Holdem ranges', async () => {
  const hand = parsedHand({
    variant: 'omaha',
    gameType: 'plo',
    hero: { position: 'BTN', holeCards: ['Jh', 'Th', '9h', '8h'], stack: 100 },
  });
  const result = await auditParsedHands(
    auditDb([cachedQuestion(solverQuestion())]),
    'hero',
    [hand],
    { persist: false },
  );

  assert.equal(result.solverVerified, 0);
  assert.equal(result.solverMatches, 0);
});

test('postflop solver matching requires the concrete suited combo', async () => {
  const hand = parsedHand({ hero: { position: 'BTN', holeCards: ['Js', 'Ts'], stack: 100 } });
  const result = await auditParsedHands(
    auditDb([cachedQuestion(solverQuestion({ heroCards: ['Jh', 'Th'] }))]),
    'hero',
    [hand],
    { persist: false },
  );

  assert.equal(result.solverVerified, 0);
  assert.equal(result.unpriced, 1);
});

test('recorded bets without normalized sizing remain unpriced', async () => {
  const question = solverQuestion({
    options: [{ id: 'b150', text: 'Bet 150%' }],
    gtoFrequencies: { b150: 100 },
    correctAnswer: 'b150',
  });
  const hand = parsedHand({
    streets: {
      preflop: { actions: [] },
      flop: { board: ['As', 'Ks', '2d'], actions: [{ isHero: true, action: 'bet', amount: 1 }] },
      turn: null,
      river: null,
    },
  });
  const result = await auditParsedHands(auditDb([cachedQuestion(question)]), 'hero', [hand], { persist: false });

  assert.equal(result.solverMatches, 1);
  assert.equal(result.solverVerified, 0);
});

test('forced blind postings are excluded from hero decision counts', async () => {
  const hand = normalizeClubArenaHand({
    id: 'forced-action-hand',
    game_variant: 'nlh',
    button_seat: 1,
    players: [
      { userId: 'hero', seat: 1, cards: ['As', 'Kh'], stack: 100 },
      { userId: 'villain', seat: 2, cards: [null, null], stack: 100 },
    ],
    actions: [
      { userId: 'hero', action: 'small_blind', stage: 'preflop', amount: 0.5 },
      { userId: 'villain', action: 'raise', stage: 'preflop', amount: 3 },
      { userId: 'hero', action: 'call', stage: 'preflop', amount: 2.5 },
    ],
  }, 'hero');
  const result = await auditParsedHands(auditDb([]), 'hero', [hand], { persist: false });

  assert.equal(result.decisionsAnalyzed, 1);
});

test('solver lookup failures are explicit incomplete audits, not clean unpriced results', async () => {
  const result = await auditParsedHands(
    auditDb([], { message: 'temporary cache outage' }),
    'hero',
    [parsedHand()],
    { persist: false },
  );

  assert.equal(result.solverLookupFailures, 1);
  assert.equal(result.complete, false);
  assert.equal(result.analyses[0].decisions[0].solverSource, 'hand-audit-v2:lookup-failed');
});

test('migrations preserve provenance and idempotent hand audits', () => {
  for (const column of ['solver_verified', 'solver_source', 'selected_frequency', 'ev_loss_measured']) {
    assert.match(evidenceMigration, new RegExp(column));
  }
  assert.match(auditMigration, /create table if not exists public\.hand_audit_decisions/i);
  assert.match(auditMigration, /unique \(user_id, hand_external_id, decision_key\)/i);
  assert.match(auditMigration, /enable row level security/i);
});
