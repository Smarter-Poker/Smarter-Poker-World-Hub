import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditParsedHands, clubArenaHandRejectionReason, normalizeClubArenaHand, syncClubArenaHandsForAudit } from '../src/lib/training/handAuditEngine.js';
import {
  NODE_SEMANTICS,
  POLICY_KIND,
  QUALITY_SEAL,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
} from '../src/lib/training/solverPolicyContract.js';

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
        in() { return query; },
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
    villainPosition: 'BB',
    potSize: 6,
    actionHistory: [],
    ...(overrides.scenario || {}),
  };
  return {
    source: 'DETERMINISTIC_SOLVER',
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: {
      verified: true,
      scenarioHash: '6max_cash_flop_BTNvsBB_AsKs2d',
      solverVersion: 'PioSOLVER-3.0',
      solverBinaryChecksum: 'a'.repeat(64),
      machineId: 'M1',
      pipelineCommit: 'b'.repeat(40),
      manifestVersion: 'training-phase4-test-v1',
      manifestChecksum: 'c'.repeat(64),
      sourceArtifactChecksum: 'd'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: '2026-08-31T00:00:00.000Z',
    },
    heroCards: ['Jh', 'Th'],
    boardCards: ['As', 'Ks', '2d'],
    options: [{ id: 'x', text: 'Check' }, { id: 'b50', text: 'Bet 50%' }],
    gtoFrequencies: { x: 100, b50: 0 },
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
    hero: { id: 'hero', position: 'BTN', holeCards: ['Jh', 'Th'], stack: 100 },
    players: [
      { id: 'hero', position: 'BTN', stack: 100 },
      { id: 'villain', position: 'BB', stack: 100 },
    ],
    streets: {
      preflop: { actions: [] },
      flop: { board: ['As', 'Ks', '2d'], actions: [{ isHero: true, action: 'check', amount: 0, potBeforeBB: 6 }] },
      turn: null,
      river: null,
    },
    ...overrides,
  };
}

function exactAuditPolicy(question) {
  const scenario = question.scenario || {};
  const options = question.options || [];
  const actions = options.map((option) => {
    const isBet = /bet/i.test(option?.text || '');
    const potFraction = isBet
      ? Number((String(option.text).match(/(\d+(?:\.\d+)?)%/) || [])[1]) / 100
      : null;
    return {
      id: option.id,
      family: isBet ? 'bet' : 'check',
      label: option.text,
      frequency: Number(question.gtoFrequencies?.[option.id]) || 0,
      ...(isBet ? {
        size: {
          unit: 'big_blinds',
          chips: 6 * potFraction,
          bigBlinds: 6 * potFraction,
          potFraction,
          exact: true,
        },
      } : {}),
    };
  });
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const key = createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: 6,
    positions: { hero: 'BTN', villains: ['BB'], button: 'BTN', smallBlind: 'SB', bigBlind: 'BB' },
    stackVector: positions.map((position, seat) => ({ seat, position, stackBb: 100, active: true })),
    blinds: { smallBlind: 0.5, bigBlind: 1, ante: 0, straddles: [], complete: true },
    rake: { percent: 5, capBb: 2, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street: scenario.street,
    board: question.boardCards,
    holding: question.heroCards,
    publicActionHistory: {
      complete: true,
      actions: [{
        sequence: 0, street: 'preflop', actor: 'BTN', action: 'call', amountChips: 1, amountBb: 1,
      }],
    },
    legalActions: actions.map((action) => ({
      action: action.family,
      exactChips: action.family === 'bet' ? action.size.chips : 0,
    })),
    sidePotEligibility: {
      complete: true,
      pots: [{ id: 'main', amountChips: 6, eligibleSeats: [0, 1, 2, 3, 4, 5], heroEligible: true }],
    },
  });
  return createSolverPolicyAnswer({
    key,
    kind: POLICY_KIND.EXACT,
    node: {
      semantics: NODE_SEMANTICS.CHECK_OR_BET,
      sourceNode: 'hand-audit-fixture',
      actor: 'BTN',
      potBb: 6,
      facingBetBb: 0,
    },
    actions,
    sourceArtifact: {
      system: question.source,
      artifactId: 'hand-audit-fixture',
      scenarioHash: question.solverProvenance.scenarioHash,
      solverVersion: question.solverProvenance.solverVersion,
      solverBinaryChecksum: question.solverProvenance.solverBinaryChecksum,
      machineId: question.solverProvenance.machineId,
      pipelineCommit: question.solverProvenance.pipelineCommit,
      manifestVersion: question.solverProvenance.manifestVersion,
      manifestChecksum: question.solverProvenance.manifestChecksum,
      sourceArtifactChecksum: question.solverProvenance.sourceArtifactChecksum,
      qualityStatus: question.solverProvenance.qualityStatus,
      auditedAt: question.solverProvenance.auditedAt,
      provenanceComplete: true,
    },
    qualitySeal: QUALITY_SEAL.SOLVER_EXACT,
    validDomain: { exactMatchDimensions: ['all'], approximatedDimensions: [], exclusions: [] },
    confidence: 1,
  });
}

function cachedQuestion(question, id = 'question-1') {
  const canonicalPolicy = exactAuditPolicy(question);
  return {
    question_id: id,
    game_id: 'cash-postflop',
    question_data: { ...question, solverPolicy: canonicalPolicy },
    canonical_policy: canonicalPolicy,
    source_classification: 'SOLVER_EXACT',
    quality_status: 'active',
    policy_version: canonicalPolicy.policyVersion,
    policy_checksum: 'e'.repeat(64),
  };
}

test('Leak Finder consumes canonical training answers and hand audits', () => {
  assert.match(detect, /from\('training_answers'\)/);
  assert.match(detect, /training_attempts!training_answers_attempt_fk!inner\([^)]*user_id[^)]*status[^)]*practice_only[^)]*\)/);
  assert.match(detect, /\.eq\('training_attempts\.user_id', userId\)/);
  assert.match(detect, /\.eq\('training_attempts\.status', 'completed'\)/);
  assert.match(detect, /\.eq\('training_attempts\.practice_only', false\)/);
  assert.match(detect, /from\('hand_audit_decisions'\)/);
  assert.match(detect, /like\('solver_source', '%\|hand-audit-v3'\)/);
  assert.match(detect, /aggregateSolverLeaks/);
  assert.doesNotMatch(detect, /classification_counts/);
  assert.doesNotMatch(detect, /combineLiveAndTrainingStats/);
  assert.doesNotMatch(detect, /rows\.length === 0\) return/, 'hand audits must still load when no trainer answers exist');
});

test('answer persistence regrades against a server-owned canonical question', () => {
  assert.match(record, /getImmutableQuestionSnapshot/);
  assert.match(record, /from\('training_question_snapshots'\)/);
  assert.match(record, /verifyTrainingGradingReceipt/);
  assert.match(record, /gradeTrainingAnswer\(\{\s*canonicalQuestion,/);
  assert.match(record, /getCanonicalQuestion/);
  assert.match(record, /canonicalPolicyReceiptMatches\(\{/);
  assert.match(record, /cacheRowIsServingEligible\(cacheRow\)/);
  assert.match(record, /stablePolicyJson\(canonicalQuestion\?\.solverPolicy\) === stablePolicyJson\(cacheRow\?\.canonical_policy\)/);
  assert.match(record, /submittedChecksum: req\.body\.policyChecksum/);
  assert.match(record, /const snapshotPolicyChecksum = String\(canonicalQuestion\?\.policyChecksum/);
  assert.match(record, /submittedPolicyChecksum !== snapshotPolicyChecksum/);
  assert.match(record, /const decisionAuthority = \{[\s\S]*policyChecksum: snapshotPolicyChecksum/);
  assert.match(record, /const currentCacheMatches = canonicalPolicyReceiptMatches\(\{/);
  assert.match(record, /const evidencePolicy = currentCacheMatches[\s\S]*\? canonicalCacheRow[\s\S]*policy_checksum: snapshotPolicyChecksum/);
  assert.match(record, /policyChecksum: evidencePolicy\.policy_checksum/);
  assert.match(record, /solver_verified: verified/);
  assert.match(record, /ev_loss_measured/);
  assert.match(record, /submission_id: String\(receiptPayload\.jti\)/);
  assert.match(record, /from\('training_answers'\)\.insert\(evidenceRow\)/);
  assert.match(record, /insertError\?\.cause\?\.code !== '23505'/);
  assert.match(record, /eq\('submission_id', String\(submissionId\)\.slice\(0, 180\)\)/);
  assert.match(record, /getExistingAnswerSubmission\(userId, receiptPayload\.jti\)/);
  const snapshotRead = record.indexOf('const snapshot = await getImmutableQuestionSnapshot');
  const replayRead = record.indexOf('let persistedAnswer = await getExistingAnswerSubmission', snapshotRead);
  const authorityRead = record.indexOf('const decisionAuthority = {', replayRead);
  const gradeRead = record.indexOf('answerContract = gradeTrainingAnswer({', authorityRead);
  const currentCacheRead = record.indexOf('canonicalCacheRow = await getCanonicalQuestion', replayRead);
  assert.ok(
    snapshotRead >= 0
      && replayRead > snapshotRead
      && authorityRead > replayRead
      && gradeRead > authorityRead
      && currentCacheRead > gradeRead,
    'verify snapshot, replay, delivery authority, and grade before consulting mutable cache freshness',
  );
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
  assert.match(auditEngine, /gradeCanonicalPolicyDecision/);
  assert.match(auditEngine, /cacheRowIsServingEligible/);
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
  assert.match(upload, /Excluded From GTO Accuracy, EV Loss, And Leak Finder Evidence/);
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
    ['hand-history library', read('src/lib/poker-engine/HandHistory.js')],
  ]) {
    assert.doesNotMatch(source, /\.contains\('players', \[\{/, `${name} must not emit invalid PostgREST JSON`);
    assert.match(source, /\.contains\('players', JSON\.stringify\(\[\{/, `${name} must serialize JSON containment`);
  }
  const myHands = read('pages/api/club-arena/my-hands.js');
  assert.match(myHands, /\.or\(clubArenaParticipantFilter\(user\.id\)\)/);
  assert.match(auditEngine, /\['manual', 'wh-engine', 'engine-api'\]/);
});

test('one failed Club Arena identity lookup keeps usable evidence partial and incomplete', async () => {
  let call = 0;
  const db = {
    from(table) {
      assert.equal(table, 'hand_history');
      const index = call++;
      const query = {
        select() { return query; }, contains() { return query; }, in() { return query; },
        order() { return query; }, lte() { return query; }, or() { return query; },
        async range() {
          return index === 0
            ? { data: null, error: { message: 'one ownership shape unavailable' } }
            : { data: [], error: null };
        },
      };
      return query;
    },
  };
  const result = await syncClubArenaHandsForAudit(db, 'hero', { limit: 10 });
  assert.equal(result.available, true);
  assert.equal(result.partial, true);
  assert.equal(result.complete, false);
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

test('Club Arena audit receipts distinguish missing cards from unsupported hand data', () => {
  const base = {
    game_variant: 'nlh',
    players: [{ userId: 'hero', cards: [null, null] }],
  };
  assert.equal(clubArenaHandRejectionReason(base, 'hero'), 'missing_private_cards');
  assert.equal(clubArenaHandRejectionReason({ ...base, game_variant: 'plo', hero_private_cards: ['As', 'Kh'] }, 'hero'), 'unsupported_variant');
  assert.equal(clubArenaHandRejectionReason({ ...base, players: [], hero_private_cards: ['As', 'Kh'] }, 'hero'), 'missing_hero_identity');
  assert.equal(clubArenaHandRejectionReason({ ...base, hero_private_cards: ['As', 'Kh'] }, 'hero'), null);
});

test('Club Arena solver identity uses starting stacks in big blinds and explicit format only', () => {
  const base = {
    id: 'stack-format-hand', game_variant: 'nlh', button_seat: 1,
    hole_cards: { hero: ['As', 'Kh'] },
    actions: [{ userId: 'hero', action: 'fold', stage: 'preflop', amount: 0 }],
  };
  const exact = normalizeClubArenaHand({
    ...base,
    summary: {
      format: 'cash', bigBlind: 2, buttonSeat: 1,
      players: [
        { userId: 'hero', seat: 1, startStack: 200, endStack: 320 },
        { userId: 'villain', seat: 2, startStack: 200, endStack: 80 },
      ],
    },
  }, 'hero');
  assert.equal(exact?.format, 'cash');
  assert.equal(exact?.hero.stack, 100);

  const unknown = normalizeClubArenaHand({
    ...base,
    players: [
      { userId: 'hero', seat: 1, stack: 200 },
      { userId: 'villain', seat: 2, stack: 200 },
    ],
  }, 'hero');
  assert.equal(unknown?.format, null);
  assert.equal(unknown?.hero.stack, null);
});

test('exact Club Arena matches are stamped with matcher v3 provenance', async () => {
  const result = await auditParsedHands(
    auditDb([cachedQuestion(solverQuestion())]),
    'hero',
    [parsedHand()],
    { persist: false },
  );

  assert.equal(result.solverVerified, 1);
  assert.equal(result.complete, true);
  assert.match(result.analyses[0].decisions[0].solverSource, /\|hand-audit-v3$/);
});

test('solver lookup filters by indexed hero hand before applying its candidate cap', async () => {
  const filters = [];
  const db = {
    from(table) {
      assert.equal(table, 'training_question_cache');
      const query = {
        select() { return query; },
        like() { return query; },
        in() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        async limit() { return { data: [cachedQuestion(solverQuestion())], error: null }; },
      };
      return query;
    },
  };
  const result = await auditParsedHands(db, 'hero', [parsedHand()], { persist: false });
  assert.equal(result.solverVerified, 1);
  assert.deepEqual(
    filters.find(([column]) => column === 'question_data->scenario->>heroHand'),
    ['question_data->scenario->>heroHand', 'JTs'],
  );
});

test('reauditing a corrected hand removes obsolete persisted decisions', async () => {
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push([name, args]);
      return { data: { success: true, upserted: 1, removed: 1 }, error: null };
    },
    from(table) {
      if (table === 'training_question_cache') {
        const query = {
          select() { return query; }, like() { return query; }, in() { return query; }, eq() { return query; },
          async limit() { return { data: [cachedQuestion(solverQuestion())], error: null }; },
        };
        return query;
      }
      if (table === 'hand_audit_decisions') {
        throw new Error('atomic replacement must not use separate table writes');
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const result = await auditParsedHands(db, 'hero', [parsedHand()]);
  assert.equal(result.complete, true);
  assert.equal(result.evidenceReconciled, true);
  assert.equal(result.obsoleteDecisionsRemoved, 1);
  assert.equal(calls[0][0], 'replace_hand_audit_decisions');
  assert.deepEqual(calls[0][1].p_hand_ids, ['test-hand']);
  assert.equal(calls[0][1].p_rows.length, 1);
});

test('a cap boundary never partially replaces or reconciles a hand', async () => {
  const hand = parsedHand({
    streets: {
      preflop: { actions: [] },
      flop: { board: ['2c', '7d', 'Th'], actions: [
        { isHero: true, action: 'check', amount: 0 },
        { isHero: true, action: 'call', amount: 1 },
      ] },
      turn: null,
      river: null,
    },
  });
  let rpcCalls = 0;
  const db = {
    rpc: async () => { rpcCalls++; return { data: { success: true }, error: null }; },
    from() { throw new Error('truncated boundary hand must not query or persist'); },
  };
  const result = await auditParsedHands(db, 'hero', [hand], { maxDecisions: 1 });
  assert.equal(result.truncated, true);
  assert.equal(result.complete, false);
  assert.equal(result.handsParsed, 0);
  assert.equal(result.decisionsAnalyzed, 0);
  assert.equal(rpcCalls, 0);
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
  assert.match(result.analyses[0].decisions[0].solverSource, /^PIO_DATABASE\|hand-audit-v3$/);
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
    options: [{ id: 'x', text: 'Check' }, { id: 'b150', text: 'Bet 150%' }],
    gtoFrequencies: { x: 0, b150: 100 },
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
  assert.match(result.analyses[0].decisions[0].solverSource, /hand-audit-v3:unpriced$/);
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
  assert.equal(result.analyses[0].decisions[0].solverSource, 'hand-audit-v3:lookup-failed');
});

test('migrations preserve provenance and idempotent hand audits', () => {
  for (const column of ['solver_verified', 'solver_source', 'selected_frequency', 'ev_loss_measured']) {
    assert.match(evidenceMigration, new RegExp(column));
  }
  assert.match(auditMigration, /create table if not exists public\.hand_audit_decisions/i);
  assert.match(auditMigration, /unique \(user_id, hand_external_id, decision_key\)/i);
  assert.match(auditMigration, /enable row level security/i);
});
