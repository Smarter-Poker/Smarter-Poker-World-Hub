import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATCHER_VERSION,
  auditParsedHands,
  clubArenaHandRejectionReason,
  describeClubArenaHandSupport,
  normalizeClubArenaHand,
  resolveStackDepthBb,
  syncClubArenaHandsForAudit,
} from '../src/lib/training/handAuditEngine.js';
import {
  buildHandMetadata,
  executeSingleHandAudit,
} from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import {
  classifyGameVariant,
  detectSite,
  getBoardAtStreet,
  getHeroDecisionPoints,
  parseHandHistory,
} from '../src/engines/HandHistoryParser.js';
import { canonicalCacheRowFixture } from './helpers/canonicalTrainingPolicyFixture.mjs';

const HERO_ID = '11111111-1111-4111-8111-111111111111';
const VILLAIN_1 = '22222222-2222-4222-8222-222222222222';
const VILLAIN_2 = '33333333-3333-4333-8333-333333333333';
const VILLAIN_3 = '44444444-4444-4444-8444-444444444444';
const VILLAIN_4 = '55555555-5555-4555-8555-555555555555';
const VILLAIN_5 = '66666666-6666-4666-8666-666666666666';

const SOLVER_PROVENANCE = Object.freeze({
  verified: true,
  scenarioHash: 'pa-conversion-reconciliation-fixture',
  solverVersion: 'fixture-1',
  solverBinaryChecksum: 'a'.repeat(64),
  machineId: 'M1',
  pipelineCommit: 'b'.repeat(40),
  manifestVersion: 'fixture-1',
  manifestChecksum: 'c'.repeat(64),
  sourceArtifactChecksum: 'd'.repeat(64),
  qualityStatus: 'validated',
  auditedAt: '2026-11-26T00:00:00.000Z',
});

function mockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  return {
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    status(c) { statusCode = c; return this; },
    json(p) { body = p; return this; },
    getStatus() { return statusCode; },
    getBody() { return body; },
  };
}

// ─── 1. Parser Boundary & Fold Hand Conversion ──────────────────────────────

test('parser boundary: native Club Arena records use normalizeClubArenaHand while uploaded text histories use HandHistoryParser.parseHandHistory', () => {
  // Native Club Arena record
  const clubRow = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    hand_number: 1001,
    table_id: 'tbl-ca-1',
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: HERO_ID, username: 'Hero', seat: 1, stack: 200 },
      { userId: VILLAIN_1, username: 'Villain', seat: 2, stack: 200 },
    ],
    hero_private_cards: ['As', 'Kd'],
    actions: [
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 6 },
      { seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'fold', amount: 0 },
    ],
  };
  const normalizedCa = normalizeClubArenaHand(clubRow, HERO_ID);
  assert.ok(normalizedCa);
  assert.equal(normalizedCa.site, 'smarter-poker-club-arena');
  assert.equal(normalizedCa.id, `club-arena:${clubRow.id}`);
  const caPoints = getHeroDecisionPoints(normalizedCa);
  assert.equal(caPoints.length, 1);

  // Uploaded text history
  const psText = [
    "PokerStars Hand #99001: Hold'em No Limit ($1/$2 USD) - 2026/11/26 10:00:00 ET",
    "Table 'Alpha' 6-max Seat #1 is the button",
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Villain ($200 in chips)',
    'Hero: posts small blind $1',
    'Villain: posts big blind $2',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Kd]',
    'Hero: raises $4 to $6',
    'Villain: folds',
  ].join('\n');
  assert.equal(detectSite(psText), 'pokerstars');
  const [parsedTextHand] = parseHandHistory(psText, 'Hero');
  assert.ok(parsedTextHand);
  assert.equal(parsedTextHand.site, 'pokerstars');
  assert.equal(parsedTextHand.importable, true);
  assert.equal(parsedTextHand.replayable, true);
  assert.equal(parsedTextHand.strategySupported, true);
  const textPoints = getHeroDecisionPoints(parsedTextHand);
  assert.equal(textPoints.length, 1);
  assert.equal(textPoints[0].position, 'BTN');
  assert.equal(textPoints[0].action, 'raise');
});

test('fold hand: converts preflop fold facing open-raise with exact potBeforeBB, stackAtDecisionBB, and handles retained-null uninvested folds', async () => {
  // Case A: Hero in BB (posted 2) faces CO raise to 6, folds preflop (private cards retained in ca_hand_facts)
  const foldHandId = 'aaaaaaaa-0000-4000-8000-000000000002';
  const foldRow = {
    id: foldHandId,
    hand_number: 1002,
    table_id: 'tbl-ca-1',
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    pot_size: 9,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: VILLAIN_1, username: 'BTN_Player', seat: 1, startStack: 200 },
      { userId: VILLAIN_2, username: 'SB_Player', seat: 2, startStack: 200 },
      { userId: HERO_ID, username: 'Hero', seat: 3, startStack: 200 },
      { userId: VILLAIN_3, username: 'CO_Player', seat: 4, startStack: 200 },
    ],
    hero_private_cards: ['7c', '2d'],
    actions: [
      { seat: 2, userId: VILLAIN_2, stage: 'preflop', action: 'sb', amount: 1, origin: 'forced' },
      { seat: 3, userId: HERO_ID, stage: 'preflop', action: 'bb', amount: 2, origin: 'forced' },
      { seat: 4, userId: VILLAIN_3, stage: 'preflop', action: 'raise', amount: 6 },
      { seat: 1, userId: VILLAIN_1, stage: 'preflop', action: 'fold' },
      { seat: 2, userId: VILLAIN_2, stage: 'preflop', action: 'fold' },
      { seat: 3, userId: HERO_ID, stage: 'preflop', action: 'fold' },
      { seat: 4, userId: VILLAIN_3, stage: 'preflop', action: 'return', amount: 4, historyEvent: 'uncalled_bet_returned' },
    ],
  };

  const hand = normalizeClubArenaHand(foldRow, HERO_ID);
  assert.ok(hand);
  assert.equal(hand.format, 'cash');
  assert.equal(hand.tableSize, 4);
  assert.equal(hand.hero.position, 'BB');
  assert.deepEqual(hand.hero.holeCards, ['7c', '2d']);
  assert.equal(hand.hero.stack, 100);
  assert.equal(hand.effectiveStackBb, 100);
  assert.equal(hand.forcedPosts.length, 2);
  assert.equal(hand.uncalledReturns.length, 1);
  assert.equal(hand.uncalledReturns[0].amount, 4);
  assert.equal(hand.uncalledReturns[0].amountBB, 2);
  assert.equal(hand.finalPot, 5); // 1 (SB) + 2 (BB) + 6 (CO) - 4 (uncalled) = 5 chips (2.5 BB)
  assert.equal(hand.finalPotBB, 2.5);

  const points = getHeroDecisionPoints(hand);
  assert.equal(points.length, 1, 'Hero has exactly 1 decision (preflop fold)');
  const pt = points[0];
  assert.equal(pt.street, 'preflop');
  assert.deepEqual(pt.board, []);
  assert.equal(pt.position, 'BB');
  assert.equal(pt.action, 'fold');
  assert.equal(pt.nodeClass, 'preflop_facing_raise');
  assert.equal(pt.villainPosition, 'CO');
  // Pot before Hero's fold = 1 (SB) + 2 (BB) + 6 (CO raise) = 9 chips = 4.5 BB
  assert.equal(pt.potBefore, 9);
  assert.equal(pt.potBeforeBB, 4.5);
  assert.equal(pt.amountAdded, 0);
  assert.equal(pt.amountAddedBB, 0);
  assert.equal(pt.totalBet, 2); // BB already posted 2 chips (1 BB)
  assert.equal(pt.totalBetBB, 1);
  // Hero started with 200 chips (100 BB) and posted 2 chips (1 BB) -> 198 chips (99 BB) at decision
  assert.equal(pt.stackAtDecision, 198);
  assert.equal(pt.stackAtDecisionBB, 99);
  assert.equal(pt.stackAfter, 198);
  assert.equal(pt.stackAfterBB, 99);
  // CO and Hero are the only 2 active players left when Hero acts (BTN and SB folded)
  assert.equal(pt.activePlayerCount, 2);
  assert.equal(pt.activeOpponentsCount, 1);
  assert.deepEqual(pt.activePlayerPositions, ['BB', 'CO']);
  assert.equal(pt.opponentHoleCardsAvailable, false);

  // Case B: Hero folds preflop in CO without investing and private cards are not retained
  const uninvestedRow = {
    ...foldRow,
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    hero_private_cards: undefined,
    hole_cards: {},
  };
  assert.equal(clubArenaHandRejectionReason(uninvestedRow, HERO_ID), 'missing_private_cards');
  assert.equal(normalizeClubArenaHand(uninvestedRow, HERO_ID), null);
  const support = describeClubArenaHandSupport(uninvestedRow, HERO_ID);
  assert.equal(support.importable, true);
  assert.equal(support.replayable, true);
  assert.equal(support.strategySupported, false);
  assert.equal(support.rejectionReason, 'missing_private_cards');
});

// ─── 2. Multi-Street NLH Cash Hand ──────────────────────────────────────────

test('multi-street NLH cash hand: verifies ordered streets, board cards at decision, potBeforeBB, amountAdded vs totalBet, stackAtDecisionBB, and active players', async () => {
  // 6-max $1/$2 NLH Cash Hand (starting stacks 200 chips = 100 BB each)
  // Seat 1: BTN (Villain 1)
  // Seat 2: SB (Villain 2) - posts 1
  // Seat 3: BB (Villain 3) - posts 2
  // Seat 4: UTG (Villain 4) - folds preflop
  // Seat 5: MP (Villain 5) - raises to 6 preflop
  // Seat 6: CO (Hero, [As, Ks]) - 3-bets to 18 preflop
  // BTN folds, SB folds, BB calls 16 (total 18), MP calls 12 (total 18).
  // Pot going to Flop = 1 (SB) + 18 (BB) + 18 (MP) + 18 (Hero CO) = 55 chips = 27.5 BB.
  // Flop [Ah, Td, 4s] (3 active players: BB, MP, Hero CO):
  //   BB checks, MP checks, Hero bets 22 (potBefore = 55 / 27.5 BB, stackAtDecision = 182 / 91 BB).
  //   BB folds, MP calls 22.
  // Pot going to Turn = 55 + 22 + 22 = 99 chips = 49.5 BB.
  // Turn [7c] (board: [Ah, Td, 4s, 7c], 2 active players: MP, Hero CO):
  //   MP checks, Hero bets 50 (potBefore = 99 / 49.5 BB, stackAtDecision = 160 / 80 BB).
  //   MP calls 50.
  // Pot going to River = 99 + 50 + 50 = 199 chips = 99.5 BB.
  // River [2h] (board: [Ah, Td, 4s, 7c, 2h], 2 active players: MP, Hero CO):
  //   MP bets 40, Hero raises to 110 all-in (Hero had 110 left = 55 BB; potBefore = 239 / 119.5 BB).
  //   MP folds. Uncalled 70 returned to Hero. Final contested pot = 279 chips = 139.5 BB.
  const handId = 'bbbbbbbb-0000-4000-8000-000000000001';
  const multiStreetRow = {
    id: handId,
    hand_number: 2001,
    table_id: 'tbl-cash-6max',
    tournament_id: null,
    game_variant: 'texas_holdem',
    small_blind: 1,
    big_blind: 2,
    pot_size: 279,
    button_seat: 1,
    source: 'manual',
    community_cards: ['Ah', 'Td', '4s', '7c', '2h'],
    players: [
      { userId: VILLAIN_1, username: 'BTN_V1', seat: 1, startStack: 200 },
      { userId: VILLAIN_2, username: 'SB_V2', seat: 2, startStack: 200 },
      { userId: VILLAIN_3, username: 'BB_V3', seat: 3, startStack: 200 },
      { userId: VILLAIN_4, username: 'UTG_V4', seat: 4, startStack: 200 },
      { userId: VILLAIN_5, username: 'MP_V5', seat: 5, startStack: 200 },
      { userId: HERO_ID, username: 'Hero_CO', seat: 6, startStack: 200 },
    ],
    hero_private_cards: ['As', 'Ks'],
    actions: [
      { seat: 2, userId: VILLAIN_2, stage: 'preflop', action: 'sb', amount: 1, origin: 'forced' },
      { seat: 3, userId: VILLAIN_3, stage: 'preflop', action: 'bb', amount: 2, origin: 'forced' },
      { seat: 4, userId: VILLAIN_4, stage: 'preflop', action: 'fold' },
      { seat: 5, userId: VILLAIN_5, stage: 'preflop', action: 'raise', amount: 6 },
      { seat: 6, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 18 },
      { seat: 1, userId: VILLAIN_1, stage: 'preflop', action: 'fold' },
      { seat: 2, userId: VILLAIN_2, stage: 'preflop', action: 'fold' },
      { seat: 3, userId: VILLAIN_3, stage: 'preflop', action: 'call', amount: 16 },
      { seat: 5, userId: VILLAIN_5, stage: 'preflop', action: 'call', amount: 12 },

      { seat: 3, userId: VILLAIN_3, stage: 'flop', action: 'check' },
      { seat: 5, userId: VILLAIN_5, stage: 'flop', action: 'check' },
      { seat: 6, userId: HERO_ID, stage: 'flop', action: 'bet', amount: 22 },
      { seat: 3, userId: VILLAIN_3, stage: 'flop', action: 'fold' },
      { seat: 5, userId: VILLAIN_5, stage: 'flop', action: 'call', amount: 22 },

      { seat: 5, userId: VILLAIN_5, stage: 'turn', action: 'check' },
      { seat: 6, userId: HERO_ID, stage: 'turn', action: 'bet', amount: 50 },
      { seat: 5, userId: VILLAIN_5, stage: 'turn', action: 'call', amount: 50 },

      { seat: 5, userId: VILLAIN_5, stage: 'river', action: 'bet', amount: 40 },
      { seat: 6, userId: HERO_ID, stage: 'river', action: 'raise', amount: 110 },
      { seat: 5, userId: VILLAIN_5, stage: 'river', action: 'fold' },
      { seat: 6, userId: HERO_ID, stage: 'river', action: 'return', amount: 70, historyEvent: 'uncalled_bet_returned' },
    ],
    created_at: '2026-11-26T10:00:00.000Z',
  };

  const hand = normalizeClubArenaHand(multiStreetRow, HERO_ID);
  assert.ok(hand);
  assert.equal(hand.format, 'cash');
  assert.equal(hand.gameType, 'no-limit-holdem');
  assert.equal(hand.bettingStructure, 'NL');
  assert.equal(hand.tableSize, 6);
  assert.equal(hand.smallBlind, 1);
  assert.equal(hand.bigBlind, 2);
  assert.equal(hand.blindLevel, '1/2');
  assert.equal(hand.hero.position, 'CO');
  assert.equal(hand.hero.stack, 100);
  assert.equal(hand.effectiveStackBb, 100);
  assert.equal(hand.finalPot, 279);
  assert.equal(hand.finalPotBB, 139.5);

  // Verify BB's preflop call and MP's preflop call distinguish amountAdded vs totalBet
  const preActions = hand.streets.preflop.actions;
  const bbCall = preActions.find(a => a.position === 'BB' && a.action === 'call');
  assert.equal(bbCall.amountAdded, 16);
  assert.equal(bbCall.amountAddedBB, 8);
  assert.equal(bbCall.totalBet, 18); // 2 posted BB + 16 added
  assert.equal(bbCall.totalBetBB, 9);

  const mpCall = preActions.find(a => a.position === 'MP' && a.action === 'call');
  assert.equal(mpCall.amountAdded, 12);
  assert.equal(mpCall.amountAddedBB, 6);
  assert.equal(mpCall.totalBet, 18); // 6 open raise + 12 added
  assert.equal(mpCall.totalBetBB, 9);

  // Verify all 4 Hero decision points across ordered streets
  const points = getHeroDecisionPoints(hand);
  assert.equal(points.length, 4);
  assert.deepEqual(points.map(p => p.street), ['preflop', 'flop', 'turn', 'river']);

  // 1) Preflop 3-bet decision
  assert.deepEqual(points[0].board, [], 'Preflop decision must see 0 board cards');
  assert.equal(points[0].action, 'raise');
  assert.equal(points[0].nodeClass, 'preflop_facing_raise');
  assert.equal(points[0].villainPosition, 'MP');
  assert.equal(points[0].potBefore, 9); // 1 SB + 2 BB + 6 MP
  assert.equal(points[0].potBeforeBB, 4.5);
  assert.equal(points[0].amountAdded, 18);
  assert.equal(points[0].amountAddedBB, 9);
  assert.equal(points[0].totalBet, 18);
  assert.equal(points[0].totalBetBB, 9);
  assert.equal(points[0].stackAtDecision, 200);
  assert.equal(points[0].stackAtDecisionBB, 100);
  assert.equal(points[0].stackAfter, 182);
  assert.equal(points[0].stackAfterBB, 91);
  assert.equal(points[0].activePlayerCount, 5); // UTG folded; MP, CO, BTN, SB, BB still active
  assert.equal(points[0].priorActions.length, 2); // Only UTG fold and MP raise

  // 2) Flop c-bet decision
  assert.deepEqual(points[1].board, ['Ah', 'Td', '4s'], 'Flop decision sees only the 3 flop cards');
  assert.equal(points[1].action, 'bet');
  assert.equal(points[1].nodeClass, 'hero_bets_or_checks');
  assert.equal(points[1].potBefore, 55);
  assert.equal(points[1].potBeforeBB, 27.5);
  assert.equal(points[1].amountAdded, 22);
  assert.equal(points[1].amountAddedBB, 11);
  assert.equal(points[1].sizingPct, 40); // 22 / 55 = 40%
  assert.equal(points[1].stackAtDecision, 182);
  assert.equal(points[1].stackAtDecisionBB, 91);
  assert.equal(points[1].stackAfter, 160);
  assert.equal(points[1].stackAfterBB, 80);
  assert.equal(points[1].activePlayerCount, 3); // Hero CO, BB, MP

  // 3) Turn barrel decision
  assert.deepEqual(points[2].board, ['Ah', 'Td', '4s', '7c'], 'Turn decision sees only 4 board cards');
  assert.equal(points[2].action, 'bet');
  assert.equal(points[2].nodeClass, 'hero_bets_or_checks');
  assert.equal(points[2].villainPosition, 'MP');
  assert.equal(points[2].potBefore, 99);
  assert.equal(points[2].potBeforeBB, 49.5);
  assert.equal(points[2].amountAdded, 50);
  assert.equal(points[2].amountAddedBB, 25);
  assert.equal(points[2].stackAtDecision, 160);
  assert.equal(points[2].stackAtDecisionBB, 80);
  assert.equal(points[2].stackAfter, 110);
  assert.equal(points[2].stackAfterBB, 55);
  assert.equal(points[2].activePlayerCount, 2); // Hero CO, MP

  // 4) River raise decision facing MP's 40 lead
  assert.deepEqual(points[3].board, ['Ah', 'Td', '4s', '7c', '2h'], 'River decision sees all 5 board cards');
  assert.equal(points[3].action, 'raise');
  assert.equal(points[3].nodeClass, 'hero_faces_bet');
  assert.equal(points[3].villainPosition, 'MP');
  assert.equal(points[3].potBefore, 239); // 199 + 40 MP bet
  assert.equal(points[3].potBeforeBB, 119.5);
  assert.equal(points[3].amountAdded, 110);
  assert.equal(points[3].amountAddedBB, 55);
  assert.equal(points[3].totalBet, 110);
  assert.equal(points[3].totalBetBB, 55);
  assert.equal(points[3].stackAtDecision, 110);
  assert.equal(points[3].stackAtDecisionBB, 55);
  assert.equal(points[3].stackAfter, 0);
  assert.equal(points[3].stackAfterBB, 0);
  assert.equal(points[3].activePlayerCount, 2);
  assert.equal(points[3].opponentHoleCardsAvailable, false);
});

// ─── 3. Short All-In + Uncalled Return + Side Pots + Showdown/Mucked Privacy ──

test('short all-in, uncalled bet return, side-pot split, post-settlement starting stack recovery, and mucked opponent card privacy', () => {
  // 3-handed $2/$4 NLH cash hand:
  // Seat 1 (BTN - Villain 1): true starting stack = 100 chips (25 BB) [short stack]
  // Seat 2 (SB - Hero, [Ac, Ad]): true starting stack = 400 chips (100 BB)
  // Seat 3 (BB - Villain 2): true starting stack = 300 chips (75 BB)
  //
  // Preflop:
  //   SB (Hero) posts 2, BB (Villain 2) posts 4.
  //   BTN (Villain 1) raises to 12.
  //   SB (Hero) 3-bets to 36 (adds 34).
  //   BB (Villain 2) calls 32 (total 36).
  //   BTN (Villain 1) shoves all-in for 100 total (adds 88).
  //   SB (Hero) re-shoves all-in for 400 total (adds 364).
  //   BB (Villain 2) calls all-in for 300 total (adds 264; short all-in call for less than 400!).
  //   Uncalled 100 (400 - 300) is returned to Hero!
  //
  // Contested commitments:
  //   BTN (Villain 1): 100 chips (25 BB)
  //   SB (Hero): 300 chips (75 BB)
  //   BB (Villain 2): 300 chips (75 BB)
  //   Total contested pot = 700 chips (175 BB):
  //     Main Pot (index 0): 100 * 3 = 300 chips (75 BB), eligible: [BTN, SB, BB]
  //     Side Pot (index 1): (300 - 100) * 2 = 400 chips (100 BB), eligible: [SB, BB]
  //
  // Showdown:
  //   Hero (SB) shows [Ac, Ad] and wins both Main Pot (300) and Side Pot (400) = 700 gross.
  //   BTN (Villain 1) shows [Kh, Kd] (mucked: false).
  //   BB (Villain 2) mucks [Qs, Qd] (mucked: true) — BB's hole cards MUST remain strictly unavailable!
  //   Post-settlement stacks in raw row: BTN = 0, Hero = 800 (400 - 300 + 700), BB = 0.
  const handId = 'cccccccc-0000-4000-8000-000000000001';
  const allInShowdownRow = {
    id: handId,
    hand_number: 3001,
    table_id: 'tbl-cash-3max',
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 2,
    big_blind: 4,
    pot_size: 700,
    button_seat: 1,
    source: 'manual',
    community_cards: ['2c', '7d', '9h', 'Jc', '3s'],
    // Post-settlement stacks only (no explicit startStack), testing startStack = endStack - grossWon + netInvested!
    players: [
      { userId: VILLAIN_1, username: 'ShortBTN', seat: 1, stack: 0 },
      { userId: HERO_ID, username: 'HeroSB', seat: 2, stack: 800 },
      // Even if a faulty caller passed cards on a mucked player, normalization must strip them!
      { userId: VILLAIN_2, username: 'MuckedBB', seat: 3, stack: 0, cards: ['Qs', 'Qd'] },
    ],
    hole_cards: {
      [HERO_ID]: ['Ac', 'Ad'],
      [VILLAIN_1]: ['Kh', 'Kd'],
    },
    showdown: [
      { user_id: HERO_ID, mucked: false, hand_name: 'One Pair, Aces', reveal_order: 1 },
      { user_id: VILLAIN_1, mucked: false, hand_name: 'One Pair, Kings', reveal_order: 2 },
      { user_id: VILLAIN_2, mucked: true, reveal_order: 3 },
    ],
    winners: [
      { userId: HERO_ID, amount: 300, potIndex: 0, hand: { name: 'One Pair, Aces' } },
      { userId: HERO_ID, amount: 400, potIndex: 1, hand: { name: 'One Pair, Aces' } },
    ],
    actions: [
      { seat: 2, userId: HERO_ID, stage: 'preflop', action: 'sb', amount: 2, origin: 'forced' },
      { seat: 3, userId: VILLAIN_2, stage: 'preflop', action: 'bb', amount: 4, origin: 'forced' },
      { seat: 1, userId: VILLAIN_1, stage: 'preflop', action: 'raise', amount: 12 },
      { seat: 2, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 36 },
      { seat: 3, userId: VILLAIN_2, stage: 'preflop', action: 'call', amount: 32 },
      { seat: 1, userId: VILLAIN_1, stage: 'preflop', action: 'all_in', amount: 100 },
      { seat: 2, userId: HERO_ID, stage: 'preflop', action: 'all_in', amount: 400 },
      { seat: 3, userId: VILLAIN_2, stage: 'preflop', action: 'all_in', amount: 300 },
    ],
  };

  const hand = normalizeClubArenaHand(allInShowdownRow, HERO_ID);
  assert.ok(hand);

  // 1) Post-settlement starting stack recovery in BB
  const btnPlayer = hand.players.find(p => p.id === VILLAIN_1);
  const heroPlayer = hand.players.find(p => p.id === HERO_ID);
  const bbPlayer = hand.players.find(p => p.id === VILLAIN_2);
  assert.equal(btnPlayer.stack, 25, 'BTN starting stack recovered: (0 - 0 + 100) / 4 = 25 BB');
  assert.equal(heroPlayer.stack, 100, 'Hero starting stack recovered: (800 - 700 + 300) / 4 = 100 BB');
  assert.equal(bbPlayer.stack, 75, 'BB starting stack recovered: (0 - 0 + 300) / 4 = 75 BB');
  assert.equal(hand.effectiveStackBb, 75, 'Effective stack = min(Hero 100 BB, max(Villains 25 BB, 75 BB)) = 75 BB');

  // 2) Short all-in & uncalled bet return inference
  const preActions = hand.streets.preflop.actions;
  const bbAllIn = preActions[preActions.length - 1];
  assert.equal(bbAllIn.action, 'allin');
  assert.equal(bbAllIn.isShortAllIn, true, 'BB all-in for 300 facing 400 is a short all-in call for less');
  assert.equal(bbAllIn.amountAdded, 264); // 300 total - 36 already committed
  assert.equal(bbAllIn.totalBet, 300);

  assert.equal(hand.uncalledReturns.length, 1, 'Uncalled 100 excess is returned to Hero');
  assert.equal(hand.uncalledReturns[0].playerId, HERO_ID);
  assert.equal(hand.uncalledReturns[0].amount, 100);
  assert.equal(hand.uncalledReturns[0].amountBB, 25);
  assert.equal(hand.finalPot, 700);
  assert.equal(hand.finalPotBB, 175);

  // 3) Main pot & side pot reconstruction
  assert.equal(hand.mainPot, 300);
  assert.deepEqual(hand.sidePots, [400]);
  assert.equal(hand.pots.length, 2);
  assert.deepEqual(hand.pots[0], {
    index: 0,
    type: 'main',
    amount: 300,
    amountBB: 75,
    eligiblePlayerIds: [VILLAIN_1, HERO_ID, VILLAIN_2],
  });
  assert.deepEqual(hand.pots[1], {
    index: 1,
    type: 'side',
    amount: 400,
    amountBB: 100,
    eligiblePlayerIds: [HERO_ID, VILLAIN_2],
  });

  // 4) Showdown & mucked opponent hole-card privacy
  assert.equal(hand.showdown.wentToShowdown, true);
  assert.deepEqual(heroPlayer.holeCards, ['Ac', 'Ad']);
  assert.equal(heroPlayer.holeCardsAvailable, true);
  assert.deepEqual(btnPlayer.holeCards, ['Kh', 'Kd'], 'Revealed showdown opponent cards are present in showdown summary');
  assert.equal(btnPlayer.holeCardsAvailable, true);
  assert.equal(btnPlayer.mucked, false);
  assert.deepEqual(bbPlayer.holeCards, [], 'Mucked opponent hole cards MUST be strictly unavailable');
  assert.equal(bbPlayer.holeCardsAvailable, false);
  assert.equal(bbPlayer.mucked, true);

  // 5) At decision time, opponent hole cards are strictly unavailable even for opponents who later showed at showdown
  const points = getHeroDecisionPoints(hand);
  assert.equal(points.length, 2);
  for (const pt of points) {
    assert.deepEqual(pt.holeCards, ['Ac', 'Ad']);
    assert.equal(pt.opponentHoleCardsAvailable, false);
  }
  // Second Hero decision (facing BTN's 100 shove after Hero 3-bet to 36 and BB called 36):
  // Pot before Hero's 400 shove = 36 (Hero) + 36 (BB) + 100 (BTN) = 172 chips = 43 BB
  assert.equal(points[1].potBefore, 172);
  assert.equal(points[1].potBeforeBB, 43);
  assert.equal(points[1].stackAtDecision, 364); // 400 start - 36 committed
  assert.equal(points[1].stackAtDecisionBB, 91);
  assert.equal(points[1].amountAdded, 364);
  assert.equal(points[1].totalBet, 400);
});

// ─── 4. Tournament (MTT) Hand With Antes, Blind Level & Effective Stack ─────

test('tournament (MTT) hand: reconciles blind level, explicit and declared antes, potBeforeBB, and effective stack in BB', () => {
  // 4-handed MTT hand at Level 100/200 with 25 ante per player (total ante = 100 = 0.5 BB)
  // Notice: explicit 'ante' action rows are present WITHOUT explicit 'sb'/'bb' rows!
  // Previously, ante rows in preflopRaw suppressed blind synthesis and left potBefore short by SB+BB (300).
  const mttRow = {
    id: 'dddddddd-0000-4000-8000-000000000001',
    hand_number: 4001,
    table_id: 'tbl-mtt-1',
    tournament_id: 'tourney-mtt-99',
    game_variant: 'nlhe',
    small_blind: 100,
    big_blind: 200,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: HERO_ID, username: 'HeroBTN', seat: 1, startStack: 3600 }, // 18 BB
      { userId: VILLAIN_1, username: 'VillSB', seat: 2, startStack: 5000 }, // 25 BB
      { userId: VILLAIN_2, username: 'VillBB', seat: 3, startStack: 2800 }, // 14 BB
      { userId: VILLAIN_3, username: 'VillCO', seat: 4, startStack: 3200 }, // 16 BB
    ],
    hero_private_cards: ['Ah', '9h'],
    actions: [
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'ante', amount: 25, dead: true },
      { seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'ante', amount: 25, dead: true },
      { seat: 3, userId: VILLAIN_2, stage: 'preflop', action: 'ante', amount: 25, dead: true },
      { seat: 4, userId: VILLAIN_3, stage: 'preflop', action: 'ante', amount: 25, dead: true },
      { seat: 4, userId: VILLAIN_3, stage: 'preflop', action: 'fold' },
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 450 },
      { seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'fold' },
      { seat: 3, userId: VILLAIN_2, stage: 'preflop', action: 'fold' },
    ],
  };

  const hand = normalizeClubArenaHand(mttRow, HERO_ID);
  assert.ok(hand);
  assert.equal(hand.format, 'tournament');
  assert.equal(hand.smallBlind, 100);
  assert.equal(hand.bigBlind, 200);
  assert.equal(hand.blindLevel, '100/200');
  assert.equal(hand.ante, 25);
  assert.equal(hand.anteBB, 0.125);
  assert.equal(hand.anteTotal, 100);
  assert.equal(hand.anteTotalBB, 0.5);
  assert.equal(hand.hero.position, 'BTN');
  assert.equal(hand.hero.stack, 18); // 3600 / 200 = 18 BB
  // Hero has 18 BB; max villain stack is 25 BB (SB), so Hero's effective stack at deal is min(18, 25) = 18 BB
  assert.equal(hand.effectiveStackBb, 18);
  assert.equal(resolveStackDepthBb(hand, {}), 18);

  const points = getHeroDecisionPoints(hand);
  assert.equal(points.length, 1);
  const pt = points[0];
  // Pot before Hero's BTN open = 100 (SB) + 200 (BB) + 100 (4 x 25 antes) = 400 chips = 2.0 BB
  assert.equal(pt.potBefore, 400);
  assert.equal(pt.potBeforeBB, 2);
  // Dead ante (25) is not part of Hero's live street bet level, so raising to 450 adds 450 live chips (2.25 BB)
  assert.equal(pt.amountAdded, 450);
  assert.equal(pt.amountAddedBB, 2.25);
  assert.equal(pt.totalBet, 450);
  assert.equal(pt.totalBetBB, 2.25);
  // Hero started with 3600 chips (18 BB) and posted a 25 ante (0.125 BB) -> 3575 chips (17.875 BB) at decision
  assert.equal(pt.stackAtDecision, 3575);
  assert.equal(pt.stackAtDecisionBB, 17.875);
  assert.equal(pt.stackAfter, 3125);
  assert.equal(pt.stackAfterBB, 15.625);
});

// ─── 5. Support Boundary: Replayable vs Strategy-Unsupported Decline ────────

test('support boundary: Omaha (PLO4/PLO5), Limit Holdem, Bomb Pot, Kill Pot, and Multiple Runouts are replayable/importable but explicitly declined for strategy grading', async () => {
  const baseClubRow = {
    id: 'eeeeeeee-0000-4000-8000-000000000001',
    hand_number: 5001,
    table_id: 'tbl-special-1',
    tournament_id: null,
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    button_seat: 1,
    source: 'manual',
    community_cards: ['Ah', 'Kd', '7c', '2s', '9h'],
    players: [
      { userId: HERO_ID, username: 'Hero', seat: 1, stack: 200 },
      { userId: VILLAIN_1, username: 'Villain', seat: 2, stack: 200 },
    ],
    hero_private_cards: ['As', 'Ks'],
    actions: [
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 6 },
      { seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'call', amount: 6 },
    ],
  };

  const unsupportedClubCases = [
    {
      label: 'Omaha PLO4',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000011', game_variant: 'plo4', hero_private_cards: ['As', 'Ks', 'Qh', 'Jh'] },
      expectedReason: 'unsupported_variant',
      expectedDeclineMatch: /Omaha|No-Limit Hold'em Only/i,
    },
    {
      label: 'Omaha PLO5 (even with mislabelled nlh variant)',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000012', game_variant: 'nlh', hero_private_cards: ['As', 'Ks', 'Qh', 'Jh', 'Td'] },
      expectedReason: 'unsupported_variant',
      expectedDeclineMatch: /No-Limit Hold'em Only/i,
    },
    {
      label: 'Fixed-Limit Holdem',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000013', game_variant: 'holdem', betting_structure: 'limit' },
      expectedReason: 'unsupported_variant',
      expectedDeclineMatch: /Fixed-Limit|No-Limit Hold'em Only/i,
    },
    {
      label: 'Bomb Pot',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000014', bomb_pot: { ante_amount: 10, board_count: 1 } },
      expectedReason: 'unsupported_special_format',
      expectedDeclineMatch: /Bomb Pot/i,
    },
    {
      label: 'Kill Pot',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000015', kill_pot: { killBlind: 4, active: true } },
      expectedReason: 'unsupported_special_format',
      expectedDeclineMatch: /Kill Pot/i,
    },
    {
      label: 'Multiple Runouts (Run-It-Twice)',
      row: { ...baseClubRow, id: 'eeeeeeee-0000-4000-8000-000000000016', rit_boards: [['2c', '3d', '4h', '5s', '8c']] },
      expectedReason: 'unsupported_special_format',
      expectedDeclineMatch: /Multi-Board|Run-It-Twice|Multiple-Runout/i,
    },
  ];

  for (const testCase of unsupportedClubCases) {
    // 1. Direct engine support classification & rejection
    const support = describeClubArenaHandSupport(testCase.row, HERO_ID);
    assert.equal(support.importable, true, `${testCase.label} must remain importable`);
    assert.equal(support.replayable, true, `${testCase.label} must remain replayable`);
    assert.equal(support.strategySupported, false, `${testCase.label} must be strategySupported: false`);
    assert.equal(support.rejectionReason, testCase.expectedReason, `${testCase.label} rejectionReason`);
    assert.match(support.declineReason, testCase.expectedDeclineMatch, `${testCase.label} declineReason`);
    assert.equal(normalizeClubArenaHand(testCase.row, HERO_ID), null, `${testCase.label} must never normalize into NLH solver input`);

    // 2. Single-hand audit route response preserves replay metadata + streetTimeline while declining strategy grading
    const res = mockRes();
    const db = {
      async rpc() {
        return {
          data: {
            found: true,
            hand: testCase.row,
            fact: { hand_id: testCase.row.id, hole_cards: testCase.row.hero_private_cards },
            decisions: [],
            leaks: [],
          },
          error: null,
        };
      },
    };
    await executeSingleHandAudit(
      { method: 'GET', query: { hand: testCase.row.id }, headers: {} },
      res,
      {
        getDb: () => db,
        applyRateLimit: () => true,
        getUser: async () => ({ user: { id: HERO_ID }, error: null, status: 200 }),
        checkAccess: async () => ({ allowed: true, accessLevel: 'full_access' }),
      },
    );
    assert.equal(res.getStatus(), 200);
    const body = res.getBody();
    assert.equal(body.importable, true);
    assert.equal(body.replayable, true);
    assert.equal(body.strategySupported, false);
    assert.equal(body.supported, false);
    assert.equal(body.audited, false);
    assert.equal(body.reason, testCase.expectedReason);
    assert.match(body.declineReason, testCase.expectedDeclineMatch);
    assert.deepEqual(body.decisions, []);
    assert.ok(Array.isArray(body.streetTimeline) && body.streetTimeline.length >= 1, `${testCase.label} retains replayable streetTimeline`);
    assert.ok(body.returnToClubArenaHref.includes(testCase.row.id));
  }

  // 3. Uploaded text histories for Omaha (PLO4/PLO5), Limit Hold'em, Bomb Pot, Kill Pot, Multiple Runouts
  const makePsText = (headerOverride, holeCards = 'As Ks', extraBody = '') => [
    headerOverride,
    "Table 'Test' 6-max Seat #1 is the button",
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Villain ($200 in chips)',
    'Hero: posts small blind $1',
    'Villain: posts big blind $2',
    '*** HOLE CARDS ***',
    `Dealt to Hero [${holeCards}]`,
    'Hero: raises $4 to $6',
    'Villain: calls $4',
    '*** FLOP *** [Ah 7d 2c]',
    'Villain: checks',
    'Hero: bets $8',
    'Villain: folds',
    extraBody,
  ].filter(Boolean).join('\n');

  const uploadedCases = [
    {
      label: 'Uploaded PLO4',
      text: makePsText('PokerStars Hand #6001: Omaha Pot Limit ($1/$2 USD) - 2026/11/26', 'As Ks Qh Jh'),
      expectedReason: 'omaha_family_is_not_nlhe',
    },
    {
      label: 'Uploaded PLO5',
      text: makePsText('PokerStars Hand #6002: Omaha Pot Limit ($1/$2 USD) - 2026/11/26', 'As Ks Qh Jh Td'),
      expectedReason: 'omaha_family_is_not_nlhe',
    },
    {
      label: 'Uploaded Limit Holdem',
      text: makePsText("PokerStars Hand #6003: Hold'em Limit ($2/$4 USD) - 2026/11/26", 'As Ks'),
      expectedReason: 'limit_holdem_is_not_nlhe',
    },
    {
      label: 'Uploaded Bomb Pot',
      text: makePsText("PokerStars Hand #6004: Hold'em No Limit - Bomb Pot ($1/$2 USD) - 2026/11/26", 'As Ks'),
      expectedReason: 'bomb_pot_is_not_standard_nlhe',
    },
    {
      label: 'Uploaded Kill Pot',
      text: makePsText("PokerStars Hand #6005: Hold'em No Limit ($1/$2 USD) - 2026/11/26", 'As Ks', 'Villain: posts kill blind $4'),
      expectedReason: 'kill_pot_is_not_standard_nlhe',
    },
    {
      label: 'Uploaded Multiple Runouts (Run It Twice)',
      text: makePsText("PokerStars Hand #6006: Hold'em No Limit ($1/$2 USD) - 2026/11/26", 'As Ks', '*** SECOND FLOP *** [Kc 9d 3s]\n*** SECOND TURN *** [Kc 9d 3s] [4h]\n*** SECOND RIVER *** [Kc 9d 3s 4h] [Jd]'),
      expectedReason: 'multiple_runouts_not_supported',
    },
  ];

  for (const uCase of uploadedCases) {
    const [parsed] = parseHandHistory(uCase.text, 'Hero');
    assert.ok(parsed, `${uCase.label} parses into an importable/replayable hand record`);
    assert.equal(parsed.importable, true);
    assert.equal(parsed.replayable, true);
    assert.equal(parsed.supported, false);
    assert.equal(parsed.strategySupported, false);
    assert.equal(parsed.unsupportedReason, uCase.expectedReason);
    assert.ok(typeof parsed.declineReason === 'string' && parsed.declineReason.length > 20);
    assert.deepEqual(getHeroDecisionPoints(parsed), [], `${uCase.label} must produce 0 NLHE decision points`);
  }
});

// ─── 6. Full Audit-Interval Reconciliation & Interrupted-Cursor Retry ───────

test('full audit-interval reconciliation: reconciles distinct source hands, converted hands, exclusions by reason, unresolved errors, and eligible decisions across multi-page pagination and interrupted-cursor retry', async () => {
  // Construct 14 distinct in-scope source hands ordered newest-first (created_at descending):
  // - 6 eligible NLH hands with Hero decisions (total 11 eligible decisions):
  //     h01 (1 decision, already current in DB)
  //     h02 (2 decisions, already current in DB)
  //     h03 (3 decisions, pending audit)
  //     h04 (1 decision, pending audit)
  //     h05 (2 decisions, pending audit - on Page 2, will hit transient lookup failure on Attempt 1!)
  //     h06 (2 decisions, pending audit - on Page 3)
  // - 1 converted NLH walk hand with 0 Hero decisions:
  //     h07 (no_hero_decisions)
  // - 2 unsupported_variant hands:
  //     h08 (PLO4)
  //     h09 (Fixed-Limit Hold'em)
  // - 2 unsupported_special_format hands:
  //     h10 (Bomb Pot)
  //     h11 (Run-It-Twice multi-board)
  // - 1 missing_hero_identity hand:
  //     h12 (Hero not seated in players)
  // - 1 missing_private_cards hand:
  //     h13 (Uninvested fold, no hole cards in row or ca_hand_facts)
  // - 1 unresolvedConversionErrors hand:
  //     h14 (Passes rejection pre-check with 2 hero cards, but board contains duplicate card 'As' colliding with Hero's 'As'!)

  const baseTimeMs = Date.parse('2026-11-26T12:00:00.000Z');
  const ts = (idx) => new Date(baseTimeMs - idx * 60_000).toISOString();

  const makeNlhHand = (id, idx, decisionStreets = ['preflop'], extra = {}) => {
    const actions = [];
    if (decisionStreets.includes('preflop')) {
      actions.push(
        { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 6 },
        { seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'call', amount: 4 },
      );
    }
    if (decisionStreets.includes('flop')) {
      actions.push(
        { seat: 2, userId: VILLAIN_1, stage: 'flop', action: 'check' },
        { seat: 1, userId: HERO_ID, stage: 'flop', action: 'bet', amount: 8 },
        { seat: 2, userId: VILLAIN_1, stage: 'flop', action: 'call', amount: 8 },
      );
    }
    if (decisionStreets.includes('turn')) {
      actions.push(
        { seat: 2, userId: VILLAIN_1, stage: 'turn', action: 'check' },
        { seat: 1, userId: HERO_ID, stage: 'turn', action: 'bet', amount: 18 },
        { seat: 2, userId: VILLAIN_1, stage: 'turn', action: 'fold' },
      );
    }
    return {
      id,
      hand_number: 7000 + idx,
      table_id: 'tbl-recon-1',
      tournament_id: null,
      game_variant: 'nlh',
      small_blind: 1,
      big_blind: 2,
      button_seat: 1,
      source: 'manual',
      community_cards: ['Qs', '7h', '2c', '9d', '3s'],
      players: [
        { userId: HERO_ID, username: 'Hero', seat: 1, startStack: 200 },
        { userId: VILLAIN_1, username: 'Villain', seat: 2, startStack: 200 },
      ],
      hole_cards: {},
      actions,
      created_at: ts(idx),
      ...extra,
    };
  };

  const allSourceHands = [
    // Page 1 (5 hands: idx 1..5)
    makeNlhHand('h01-current-1dec', 1, ['preflop']),
    makeNlhHand('h02-current-2dec', 2, ['preflop', 'flop']),
    makeNlhHand('h03-audit-3dec', 3, ['preflop', 'flop', 'turn']),
    makeNlhHand('h04-audit-1dec', 4, ['preflop']),
    makeNlhHand('h07-walk-0dec', 5, [], {
      actions: [{ seat: 2, userId: VILLAIN_1, stage: 'preflop', action: 'fold' }],
    }),

    // Page 2 (5 hands: idx 6..10)
    makeNlhHand('h05-audit-2dec-retry', 6, ['preflop', 'flop']),
    makeNlhHand('h08-plo4', 7, ['preflop'], { game_variant: 'plo4' }),
    makeNlhHand('h09-limit', 8, ['preflop'], { game_variant: 'holdem', betting_structure: 'limit' }),
    makeNlhHand('h10-bomb', 9, ['preflop'], { bomb_pot: { ante: 4 } }),
    makeNlhHand('h11-rit', 10, ['preflop'], { rit_boards: [['2d', '5c', '8h', 'Js', 'Kc']] }),

    // Page 3 (4 hands: idx 11..14)
    makeNlhHand('h06-audit-2dec', 11, ['preflop', 'flop']),
    makeNlhHand('h12-no-hero', 12, ['preflop'], {
      players: [{ userId: VILLAIN_1, seat: 1, startStack: 200 }, { userId: VILLAIN_2, seat: 2, startStack: 200 }],
    }),
    makeNlhHand('h13-no-private-cards', 13, ['preflop']),
    makeNlhHand('h14-corrupt-duplicate-card', 14, ['preflop'], {
      // 'As' on board collides with Hero's private card 'As' -> passes pre-check, fails normalizeClubArenaHand!
      community_cards: ['As', '7h', '2c'],
    }),
  ];

  // Facts table has private hole cards for every hand except h13-no-private-cards
  const factsByHandId = new Map(
    allSourceHands
      .filter(h => h.id !== 'h13-no-private-cards')
      .map(h => [h.id, { hand_id: h.id, hole_cards: ['As', 'Kh'], effective_stack_bb_at_deal: 100 }])
  );

  // Persisted decisions store (pre-populated with h01 and h02 as already current!)
  const persistedDecisionsByHand = new Map([
    ['club-arena:h01-current-1dec', [
      {
        hand_external_id: 'club-arena:h01-current-1dec',
        decision_key: 'preflop:0',
        solver_verified: true,
        solver_source: `DETERMINISTIC_SOLVER|${MATCHER_VERSION}`,
        classification: 'best',
        updated_at: '2026-11-26T11:55:00.000Z',
      },
    ]],
    ['club-arena:h02-current-2dec', [
      {
        hand_external_id: 'club-arena:h02-current-2dec',
        decision_key: 'preflop:0',
        solver_verified: true,
        solver_source: `DETERMINISTIC_SOLVER|${MATCHER_VERSION}`,
        classification: 'best',
        updated_at: '2026-11-26T11:55:00.000Z',
      },
      {
        hand_external_id: 'club-arena:h02-current-2dec',
        decision_key: 'flop:1',
        solver_verified: true,
        solver_source: `DETERMINISTIC_SOLVER|${MATCHER_VERSION}`,
        classification: 'best',
        updated_at: '2026-11-26T11:55:00.000Z',
      },
    ]],
  ]);

  let simulateTransientLookupFailure = false;

  const preflopSolverQuestion = canonicalCacheRowFixture({
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance: SOLVER_PROVENANCE,
    scenario: {
      street: 'preflop',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      heroHand: 'AKo',
      nodeType: 'preflop_open',
      boardCards: [],
      tableSize: 2,
      stackDepth: 100,
      potSize: 1.5,
      actionHistory: [],
    },
    options: [{ id: 'r100', text: 'Raise 100%' }, { id: 'f', text: 'Fold' }],
    correctAnswer: 'r100',
    gtoFrequencies: { r100: 100, f: 0 },
  }, { id: 'q-preflop-rfi', questionId: 'q-preflop-rfi', gameId: 'cash-rfi' });

  const db = {
    async rpc(fn, args) {
      assert.equal(fn, 'replace_hand_audit_decisions');
      for (const handExternalId of args.p_hand_ids) {
        const handRows = (args.p_rows || []).filter(r => r.hand_external_id === handExternalId);
        persistedDecisionsByHand.set(handExternalId, handRows);
      }
      return { data: { success: true, upserted: (args.p_rows || []).length, removed: 0 }, error: null };
    },
    from(table) {
      if (table === 'hand_history') {
        let membershipKey = null;
        let boundaryClause = null;
        const chain = {
          select: () => chain,
          contains: (_col, val) => {
            const parsed = JSON.parse(val);
            membershipKey = Object.keys(parsed[0] || {})[0];
            return chain;
          },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: (clause) => { boundaryClause = clause; return chain; },
          range: async (start, end) => {
            if (membershipKey !== 'userId') return { data: [], error: null };
            let rows = [...allSourceHands];
            if (boundaryClause) {
              const m = /created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)/.exec(boundaryClause);
              if (m) {
                const [, bCreatedAt, , bId] = m;
                rows = rows.filter(r => r.created_at < bCreatedAt || (r.created_at === bCreatedAt && r.id < bId));
              }
            }
            return { data: rows.slice(start, end + 1), error: null };
          },
        };
        return chain;
      }
      if (table === 'ca_hand_facts') {
        let requestedIds = [];
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: (_col, ids) => { requestedIds = ids; return chain; },
          limit: async () => ({
            data: requestedIds.map(id => factsByHandId.get(String(id))).filter(Boolean),
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        let requestedExternalIds = [];
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: (_col, ids) => { requestedExternalIds = ids; return chain; },
          limit: async () => ({
            data: requestedExternalIds.flatMap(id => persistedDecisionsByHand.get(String(id)) || []),
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'training_question_cache') {
        let streetFilter = null;
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: (col, val) => {
            if (col === 'question_data->scenario->>street') streetFilter = val;
            return chain;
          },
          limit: async () => {
            if (simulateTransientLookupFailure) {
              throw new Error('simulated transient solver cache timeout');
            }
            return {
              data: streetFilter === 'preflop' ? [preflopSolverQuestion] : [],
              error: null,
            };
          },
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const nowMs = Date.parse('2026-11-26T12:05:00.000Z');

  // ── Page 1 (limit: 5 -> hands 1..5) ──
  const page1 = await syncClubArenaHandsForAudit(db, HERO_ID, { limit: 5, nowMs });
  assert.equal(page1.available, true);
  assert.equal(page1.handsFound, 5);
  assert.equal(page1.handsConverted, 5);
  assert.equal(page1.handsEligible, 4); // h01, h02, h03, h04
  assert.equal(page1.handsSkippedNoHeroDecisions, 1); // h07
  assert.equal(page1.handsAlreadyCurrent, 2); // h01 (1 dec), h02 (2 dec)
  assert.equal(page1.decisionsAlreadyCurrent, 3);
  assert.equal(page1.handsAudited, 2); // h03 (3 dec), h04 (1 dec)
  assert.equal(page1.decisionsAnalyzed, 4);
  assert.equal(page1.eligibleDecisionsTotal, 7); // 3 current + 4 analyzed
  assert.equal(page1.reconciliation.invariantsHold, true);
  assert.equal(page1.complete, false);
  assert.ok(page1.continuation, 'Page 1 must emit a continuation cursor');

  // ── Page 2, Attempt 1 (interrupted by transient solver lookup failure!) ──
  simulateTransientLookupFailure = true;
  const page2Attempt1 = await syncClubArenaHandsForAudit(db, HERO_ID, {
    limit: 5,
    nowMs,
    cursor: page1.continuation,
  });
  assert.equal(page2Attempt1.handsFound, 5);
  assert.equal(page2Attempt1.solverLookupFailures, 2); // h05's 2 decisions failed lookup
  assert.equal(page2Attempt1.complete, false);
  // Critical retry invariant: failed page MUST NOT advance cumulativeHandsFound or boundary!
  assert.equal(page2Attempt1.cumulativeHandsFound, 5);
  assert.deepEqual(page2Attempt1.continuation.boundary, page1.continuation.boundary);
  assert.equal(page2Attempt1.reconciliation.cumulative.inScopeSourceHands, 5);

  // ── Page 2, Attempt 2 (retry with page2Attempt1.continuation after recovery) ──
  simulateTransientLookupFailure = false;
  const page2Attempt2 = await syncClubArenaHandsForAudit(db, HERO_ID, {
    limit: 5,
    nowMs,
    cursor: page2Attempt1.continuation,
  });
  assert.equal(page2Attempt2.handsFound, 5);
  assert.equal(page2Attempt2.handsConverted, 1); // h05
  assert.equal(page2Attempt2.exclusionsByReason.unsupported_variant, 2); // h08, h09
  assert.equal(page2Attempt2.exclusionsByReason.unsupported_special_format, 2); // h10, h11
  assert.equal(page2Attempt2.handsQueuedForRetry, 1, 'h05 with lookup-failed rows is automatically retried');
  assert.equal(page2Attempt2.handsAudited, 1);
  assert.equal(page2Attempt2.decisionsAnalyzed, 2);
  assert.equal(page2Attempt2.solverLookupFailures, 0);
  assert.equal(page2Attempt2.cumulativeHandsFound, 10, 'Cumulative hands advances to 10 (never double-counted)');
  assert.equal(page2Attempt2.reconciliation.invariantsHold, true);
  assert.ok(page2Attempt2.continuation, 'Page 2 must emit continuation for Page 3');

  // ── Page 3 (final 4 hands: idx 11..14) ──
  const page3 = await syncClubArenaHandsForAudit(db, HERO_ID, {
    limit: 5,
    nowMs,
    cursor: page2Attempt2.continuation,
  });
  assert.equal(page3.handsFound, 4);
  assert.equal(page3.handsConverted, 1); // h06
  assert.equal(page3.exclusionsByReason.missing_hero_identity, 1); // h12
  assert.equal(page3.exclusionsByReason.missing_private_cards, 1); // h13
  assert.equal(page3.unresolvedConversionErrors, 1); // h14 (corrupt card collision)
  assert.equal(page3.handsAudited, 1); // h06
  assert.equal(page3.decisionsAnalyzed, 2);
  assert.equal(page3.complete, true, 'Final page completes the interval');
  assert.equal(page3.continuation, null, 'Final page has null continuation');
  assert.equal(page3.reconciliation.invariantsHold, true);

  // ── Full Audit-Interval Cumulative Reconciliation Verification ──
  const cum = page3.reconciliation.cumulative;
  assert.equal(cum.pagesCompleted, 3, 'Only the 3 succeeded pages are counted');
  assert.equal(cum.inScopeSourceHands, 14, 'All 14 distinct in-scope source hands accounted for');
  assert.equal(cum.handsConverted, 7, '6 eligible + 1 walk = 7 converted hands');
  assert.deepEqual(cum.exclusionsByReason, {
    unsupported_variant: 2,
    unsupported_special_format: 2,
    missing_hero_identity: 1,
    missing_private_cards: 1,
    no_hero_decisions: 1,
  });
  assert.equal(cum.excludedBeforeConversion, 6, '2 variant + 2 special + 1 hero_id + 1 private_cards = 6');
  assert.equal(cum.unresolvedConversionErrors, 1, '1 corrupt card-collision hand counted in unresolvedConversionErrors');
  // Master hand reconciliation identity: 14 === 7 + 6 + 1
  assert.equal(
    cum.inScopeSourceHands,
    cum.handsConverted + cum.excludedBeforeConversion + cum.unresolvedConversionErrors,
  );
  assert.equal(cum.handsConverted, cum.handsEligible + cum.handsWithNoHeroDecisions);
  assert.equal(cum.handsEligible, 6);
  assert.equal(cum.handsWithNoHeroDecisions, 1);
  assert.equal(cum.handsAlreadyCurrent, 2);
  assert.equal(cum.handsAuditedEligible, 4);
  assert.equal(cum.handsEligible, cum.handsAlreadyCurrent + cum.handsAuditedEligible);

  // Master decision reconciliation identity: 11 === 3 + 8, and 8 === 4 verified + 4 unpriced
  assert.equal(cum.eligibleDecisionsTotal, 11);
  assert.equal(cum.decisionsAlreadyCurrent, 3);
  assert.equal(cum.decisionsAnalyzed, 8);
  assert.equal(cum.eligibleDecisionsTotal, cum.decisionsAlreadyCurrent + cum.decisionsAnalyzed);
  assert.equal(cum.solverVerified, 4); // 4 preflop RFI decisions matched exact solver node
  assert.equal(cum.unpriced, 4); // 4 postflop decisions remained explicitly unpriced
  assert.equal(cum.decisionsAnalyzed, cum.solverVerified + cum.unpriced);
  assert.equal(cum.handsReconciled, true);
  assert.equal(cum.decisionsReconciled, true);

  // Verify zero dropped or duplicate hands across accepted pages
  const acceptedHandIds = [
    ...page1.reconciliation.page.pageHandIds,
    ...page2Attempt2.reconciliation.page.pageHandIds,
    ...page3.reconciliation.page.pageHandIds,
  ];
  assert.equal(acceptedHandIds.length, 14);
  assert.equal(new Set(acceptedHandIds).size, 14, 'Zero duplicate or dropped hand IDs across pages');

  // Verify persisted decisions in DB match the 6 eligible hands (11 total decisions, 0 duplicates)
  assert.equal(persistedDecisionsByHand.size, 6);
  const allPersistedRows = [...persistedDecisionsByHand.values()].flat();
  assert.equal(allPersistedRows.length, 11);
});
