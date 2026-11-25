import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  detectSite,
  parseHandHistory,
  classifyGameVariant,
  getHeroDecisionPoints,
} from '../src/engines/HandHistoryParser.js';
import { parseHandHistory as parseSandboxHandHistory } from '../src/lib/sandbox/HandHistoryParser.js';
import {
  COVERAGE_TIERS,
  TRUTH_LEVELS,
  classifyThreeBetPotTexture,
  describeCoverageTier,
  evaluatePushFoldSpot,
  getPushFoldChart,
  normalizeHandClass,
  pushRangeHands,
  pushRangePercent,
  threeBetPotReference,
} from '../src/lib/personal-assistant/mttShortStackCharts.mjs';
import {
  LIVE_FIX_MAX_MISTAKE_RATE,
  MIN_LIVE_VERIFY_HANDS,
  buildCoachingSnapshot,
  buildCoverageGapsRanked,
  buildFunnelMetrics,
  buildTrainingPlan,
  selectTopLeakedHands,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import {
  incrementalBoundaryFromCompletedJob,
  isFullRescanRequested,
  mergeAuditJobProgress,
} from '../src/lib/personal-assistant/auditJobRuntime.mjs';
import { PUSH_TYPE_KEYS, eventToTypeKey, pushTypeAllowed } from '../src/lib/push/push-prefs.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACR_HAND = [
  'Hand #2394883747 - Holdem(No Limit) - $0.05/$0.10 - 2026/11/25 10:55:12 UTC',
  "Table 'Elmer Fudd' 6-max Seat #3 is the button",
  'Seat 1: Big Fish ($10.00)',
  'Seat 2: Hero ($9.80)',
  'Seat 3: Cutoff Kid ($1,250.50)',
  'Big Fish posts the small blind of $0.05',
  'Hero posts the big blind of $0.10',
  '*** HOLE CARDS ***',
  'Dealt to Hero [Ah Kd]',
  'Cutoff Kid raises to $0.30',
  'Big Fish folds',
  'Hero raises to $1.00',
  'Cutoff Kid calls $0.70',
  '*** FLOP *** [As 7d 2c]',
  'Hero bets $1.20',
  'Cutoff Kid folds',
  'Uncalled bet ($1.20) returned to Hero',
  'Hero wins $2.05',
  '*** SUMMARY ***',
  'Total pot $2.10 | Rake $0.05',
  'Seat 2: Hero (big blind) won ($2.05)',
].join('\n');

const CLUBGG_HAND = [
  "ClubGG Hand #88123: Hold'em No Limit ($0.50/$1.00) - 2026/11/25 10:00:00",
  "Table 'Alpha' 6-max Seat #1 is the button",
  'Seat 1: Hero ($100.00 in chips)',
  'Seat 2: Villain ($1,200.00 in chips)',
  'Hero: posts small blind $0.50',
  'Villain: posts big blind $1.00',
  '*** HOLE CARDS ***',
  'Dealt to Hero [Ah Kd]',
  'Hero: raises $2.00 to $3.00',
  'Villain: calls $2.00',
  '*** FLOP *** [Ks 7h 2c]',
  'Villain: checks',
  'Hero: bets $4.00',
  'Villain: folds',
  'Hero collected $6.50 from pot',
  '*** SUMMARY ***',
  'Seat 1: Hero (button) collected ($6.50)',
].join('\n');

const PS_HAND = [
  "PokerStars Hand #250000001: Hold'em No Limit ($1/$2 USD) - 2026/11/24 12:00:00 ET",
  "Table 'Alpha' 6-max Seat #1 is the button",
  'Seat 1: Hero ($200 in chips)',
  'Seat 2: Villain ($200 in chips)',
  'Hero: posts small blind $1',
  'Villain: posts big blind $2',
  '*** HOLE CARDS ***',
  'Dealt to Hero [As Ks]',
  'Hero: raises $4 to $6',
  'Villain: calls $4',
  '*** FLOP *** [Ah 7d 2c]',
  'Villain: checks',
  'Hero: bets $4',
  'Villain: folds',
  'Hero collected $12 from pot',
  '*** SUMMARY ***',
  'Total pot $12',
  'Seat 1: Hero (button) collected ($12)',
].join('\n');

const PLO_HAND = [
  'Hand #77 - Omaha(Pot Limit) - $0.05/$0.10 - 2026/11/25 10:55:12 UTC',
  "Table 'T' 6-max Seat #1 is the button",
  'Seat 1: Hero ($10.00)',
  'Seat 2: Vill ($10.00)',
  'Hero posts the small blind of $0.05',
  'Vill posts the big blind of $0.10',
  '*** HOLE CARDS ***',
  'Dealt to Hero [Ah Kd Qc Js]',
  'Hero raises to $0.30',
  'Vill folds',
].join('\n');

const PLO5_CLUBGG = [
  "ClubGG Hand #5: Omaha Pot Limit ($1/$2) - 2026/11/25",
  "Table 'T' 6-max Seat #1 is the button",
  'Seat 1: Hero ($200 in chips)',
  'Seat 2: V ($200 in chips)',
  '*** HOLE CARDS ***',
  'Dealt to Hero [Ah Kd Qc Js Td]',
  'Hero: raises $4 to $6',
  'V: folds',
].join('\n');

const OMAHA_HILO = [
  "PokerStars Hand #6: Omaha Hi/Lo Pot Limit ($1/$2 USD) - x",
  "Table 'T' 6-max Seat #1 is the button",
  'Seat 1: Hero ($200 in chips)',
  'Seat 2: V ($200 in chips)',
  '*** HOLE CARDS ***',
  'Dealt to Hero [Ah Kd Qc Js]',
  'Hero: raises $4 to $6',
  'V: folds',
].join('\n');

const SHORT_DECK = PS_HAND.replace("Hold'em No Limit", "Short Deck Hold'em No Limit").replace('#250000001', '#9');
const LIMIT_HOLDEM = PS_HAND.replace("Hold'em No Limit", "Hold'em Limit").replace('#250000001', '#10');

// ─── 1. Parsers ──────────────────────────────────────────────────────────────

test('detectSite recognizes ACR/WPN (named or structural), ClubGG, GGPoker headers and keeps PokerStars', () => {
  assert.equal(detectSite(ACR_HAND), 'acr');
  assert.equal(detectSite('Game Hand #1 - Holdem(No Limit) - $1/$2 - 2026/11/25\nSeat 1: A ($10)'), 'acr');
  assert.equal(detectSite('Winning Poker Network\nHand #5'), 'acr');
  assert.equal(detectSite('Americas Cardroom Hand #5'), 'acr');
  assert.equal(detectSite(CLUBGG_HAND), 'clubgg');
  assert.equal(detectSite('Poker Hand #HD12345: Hold\'em No Limit ($0.5/$1)'), 'ggpoker');
  assert.equal(detectSite(PS_HAND), 'pokerstars');
  assert.equal(detectSite(''), 'unknown');
});

test('ACR hand parses into the canonical hand object (colon-less actions, commas, summary seats ignored)', () => {
  const hands = parseHandHistory(ACR_HAND);
  assert.equal(hands.length, 1);
  const hand = hands[0];
  assert.equal(hand.site, 'acr');
  assert.equal(hand.id, '2394883747');
  assert.equal(hand.variant, 'holdem');
  assert.equal(hand.gameVariant, 'nlhe');
  assert.equal(hand.supported, true);
  assert.equal(hand.unsupportedReason, null);
  assert.equal(hand.gameType, 'NL');
  assert.equal(hand.format, 'cash');
  assert.equal(hand.stakes, '$0.05/$0.10');
  assert.equal(hand.tableSize, 3, 'SUMMARY seat lines must not add phantom players');
  assert.equal(hand.buttonSeat, 3);
  assert.equal(hand.players.find(p => p.name === 'Cutoff Kid').stack, 1250.5, 'thousands separators are removed');
  assert.deepEqual(hand.hero.holeCards, ['Ah', 'Kd']);
  assert.equal(hand.hero.name, 'Hero');
  assert.equal(hand.hero.position, 'BB');
  assert.deepEqual(hand.streets.flop.board, ['As', '7d', '2c']);
  const pre = hand.streets.preflop.actions;
  assert.deepEqual(pre.map(a => [a.player, a.action, a.amount]), [
    ['Cutoff Kid', 'raise', 0.3], ['Big Fish', 'fold', 0], ['Hero', 'raise', 1], ['Cutoff Kid', 'call', 0.7],
  ]);
  assert.equal(pre[2].isHero, true);
  assert.deepEqual(hand.streets.flop.actions.map(a => [a.player, a.action]), [['Hero', 'bet'], ['Cutoff Kid', 'fold']]);
  assert.deepEqual(hand.result.winners, [{ name: 'Hero', amount: 2.05 }]);
  assert.equal(hand.result.pot, 2.1);
  const points = getHeroDecisionPoints(hand);
  assert.deepEqual(points.map(p => p.street), ['preflop', 'flop']);
});

test('ClubGG hand parses into the same canonical hand object as PokerStars', () => {
  const [club] = parseHandHistory(CLUBGG_HAND);
  const [stars] = parseHandHistory(PS_HAND);
  assert.equal(club.site, 'clubgg');
  assert.equal(club.id, '88123');
  assert.equal(club.stakes, '$0.50/$1.00');
  assert.equal(club.players.find(p => p.name === 'Villain').stack, 1200);
  assert.equal(club.supported, true);
  assert.deepEqual(Object.keys(club).sort(), Object.keys(stars).sort(), 'identical canonical shape');
  assert.deepEqual(club.streets.flop.board, ['Ks', '7h', '2c']);
  assert.equal(getHeroDecisionPoints(club).length, 2);
});

test('PokerStars parsing is unchanged apart from honest variant metadata and no phantom summary seat', () => {
  const [hand] = parseHandHistory(PS_HAND);
  assert.equal(hand.site, 'pokerstars');
  assert.equal(hand.variant, 'holdem');
  assert.equal(hand.gameType, 'NL');
  assert.equal(hand.tableSize, 2);
  assert.equal(hand.supported, true);
});

test('non-NLHE variants are explicitly tagged unsupported and yield no decision points', () => {
  const cases = [
    [PLO_HAND, 'omaha', 'plo4', 'omaha_family_is_not_nlhe'],
    [PLO5_CLUBGG, 'omaha', 'plo5', 'omaha_family_is_not_nlhe'],
    [OMAHA_HILO, 'omaha', 'omaha_hilo', 'omaha_hilo_is_not_nlhe'],
    [SHORT_DECK, 'short_deck', 'short_deck', 'short_deck_is_not_nlhe'],
    [LIMIT_HOLDEM, 'limit_holdem', 'limit_holdem', 'limit_holdem_is_not_nlhe'],
  ];
  for (const [text, variant, gameVariant, reason] of cases) {
    const [hand] = parseHandHistory(text);
    assert.ok(hand, `parsed: ${gameVariant}`);
    assert.equal(hand.variant, variant, gameVariant);
    assert.equal(hand.gameVariant, gameVariant);
    assert.equal(hand.supported, false);
    assert.equal(hand.unsupportedReason, reason);
    assert.deepEqual(getHeroDecisionPoints(hand), [], `${gameVariant} must not produce NLHE decision points`);
  }
});

test('classifyGameVariant trusts hero card count over a Hold\'em header and never marks an unknown game supported', () => {
  assert.equal(classifyGameVariant("Hold'em No Limit", 2).supported, true);
  assert.equal(classifyGameVariant("Hold'em No Limit", 5).gameVariant, 'plo5');
  assert.equal(classifyGameVariant("Hold'em No Limit", 5).supported, false);
  assert.equal(classifyGameVariant("Hold'em Pot Limit", 2).variant, 'pot_limit_holdem');
  assert.equal(classifyGameVariant('', 0).supported, false);
  assert.equal(classifyGameVariant("Hold'em", 2).unsupportedReason, 'betting_structure_unknown');
});

test('sandbox parser handles ACR and ClubGG and refuses to import non-NLHE hands as NLHE', () => {
  const acr = parseSandboxHandHistory(ACR_HAND);
  assert.equal(acr.success, true);
  assert.equal(acr.site, 'acr');
  assert.equal(acr.supported, true);
  assert.deepEqual(acr.heroHand, { card1: 'Ah', card2: 'Kd' });
  assert.equal(acr.heroPosition, 'BB');
  assert.deepEqual(acr.board.flop, ['As', '7d', '2c']);
  assert.ok(acr.actionHistory.some(a => a.player === 'Hero' && a.street === 'flop' && a.action === 'bet'),
    'colon-less ACR actions are parsed');
  assert.equal(acr.villains.length, 2);
  assert.equal(acr.heroStack, 98, 'stack normalized to bb using the ACR header blinds');

  const club = parseSandboxHandHistory(CLUBGG_HAND);
  assert.equal(club.success, true);
  assert.equal(club.site, 'clubgg');
  assert.equal(club.heroPosition, 'BTN');

  for (const text of [PLO_HAND, PLO5_CLUBGG, OMAHA_HILO, SHORT_DECK, LIMIT_HOLDEM]) {
    const res = parseSandboxHandHistory(text);
    assert.equal(res.success, false);
    assert.match(res.error, /No-Limit Hold'em only/);
    assert.ok(res.unsupportedVariant);
  }
  // Existing contract: headerless pasted text still imports.
  const bare = parseSandboxHandHistory(['Seat 1: Hero ($200 in chips)', 'Seat 2: V ($200 in chips)', '*** HOLE CARDS ***', 'Dealt to Hero [As Ks]', 'Hero: raises $4 to $6'].join('\n'));
  assert.equal(bare.success, true);
});

// ─── 2. MTT short-stack + 3-bet pot reference ────────────────────────────────

test('push/fold model: explicit action, range pct, bubble factor, truth level, never solver evidence', () => {
  const spot = evaluatePushFoldSpot({ position: 'BTN', stackBb: 10, heroHand: ['Ah', '5h'] });
  assert.equal(spot.action, 'push');
  assert.equal(typeof spot.pushRangePct, 'number');
  assert.equal(spot.bubbleFactorApplied, 1);
  assert.equal(spot.truthLevel, 'deterministic_icm_model');
  assert.equal(spot.solverVerified, false);
  assert.equal(spot.solver_verified, false);
  assert.equal(evaluatePushFoldSpot({ position: 'UTG', stackBb: 15, heroHand: '72o' }).action, 'fold');
  assert.equal(evaluatePushFoldSpot({ position: 'CO', stackBb: 12 }).action, 'range_only');
});

test('push/fold model is monotone in stack, position, ante and bubble factor and bounded to 8-20bb', () => {
  const pct = args => pushRangePercent(args).pushRangePct;
  assert.ok(pct({ position: 'BTN', stackBb: 8 }) > pct({ position: 'BTN', stackBb: 14 }));
  assert.ok(pct({ position: 'BTN', stackBb: 14 }) > pct({ position: 'BTN', stackBb: 20 }));
  const order = ['UTG', 'HJ', 'CO', 'BTN', 'SB'].map(position => pct({ position, stackBb: 10 }));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'later position shoves wider');
  assert.ok(pct({ position: 'CO', stackBb: 12, anteBb: 0.125, tableSize: 9 }) > pct({ position: 'CO', stackBb: 12 }), 'antes widen');
  const bubble = pushRangePercent({ position: 'CO', stackBb: 12, bubbleFactor: 1.5 });
  assert.ok(bubble.pushRangePct < pct({ position: 'CO', stackBb: 12 }), 'ICM bubble tightens');
  assert.equal(bubble.bubbleFactorApplied, 1.5);
  assert.equal(bubble.icmAdjusted, true);
  assert.equal(pushRangePercent({ position: 'CO', stackBb: 12, bubbleFactor: 99 }).bubbleFactorApplied, 3, 'bubble factor is capped');
  assert.equal(pushRangePercent({ position: 'CO', stackBb: 7 }).supported, false);
  assert.equal(pushRangePercent({ position: 'CO', stackBb: 25 }).supported, false);
  assert.equal(pushRangePercent({ position: 'BB', stackBb: 12 }).supported, false);
  const chart = getPushFoldChart({ stackBb: 10, anteBb: 0.125 });
  assert.deepEqual(chart.positions.map(row => row.position), ['UTG', 'HJ', 'CO', 'BTN', 'SB']);
  assert.ok(chart.positions.every(row => row.action === 'push_range' && row.hands.length > 0));
  assert.equal(chart.truthLevel, 'deterministic_icm_model');
  assert.ok(pushRangeHands(10).includes('AA') && !pushRangeHands(10).includes('72o'));
  assert.equal(normalizeHandClass(['Kd', 'Ah']), 'AKo');
  assert.equal(normalizeHandClass('AhKh'), 'AKs');
  assert.equal(normalizeHandClass('KA'), null);
});

test('3-bet pot reference classifies textures and is a heuristic reference, never Tier-1 solver data', () => {
  assert.equal(classifyThreeBetPotTexture(['Ah', '7d', '2c']).texture, 'dry_high_card');
  assert.equal(classifyThreeBetPotTexture(['9h', '8h', '7h']).texture, 'monotone');
  assert.equal(classifyThreeBetPotTexture(['Kh', 'Kd', '2c']).texture, 'paired');
  assert.equal(classifyThreeBetPotTexture(['7h', '6d', '4c']).texture, 'low_connected');
  assert.equal(classifyThreeBetPotTexture(['Ah', '7d']).supported, false);
  const ref = threeBetPotReference({ potType: '3bp', board: ['Ah', '7d', '2c'], role: 'aggressor', spr: 3 });
  assert.equal(ref.truthLevel, 'deterministic_heuristic_reference');
  assert.equal(ref.solverVerified, false);
  assert.equal(ref.solver_verified, false);
  assert.equal(ref.referenceOnly, true);
  assert.ok(ref.guidance.cbetFreqPct[0] <= ref.guidance.cbetFreqPct[1]);
  const srp = threeBetPotReference({ potType: 'srp', board: ['Ah', '7d', '2c'], role: 'aggressor' });
  assert.ok(ref.guidance.sizePctPot[1] <= srp.guidance.sizePctPot[1] + 1);
  assert.ok(threeBetPotReference({ potType: '3bp', board: ['9h', '8h', '7h'], role: 'aggressor' }).guidance.cbetFreqPct[1]
    < ref.guidance.cbetFreqPct[1], 'monotone boards c-bet far less than A-high dry');
  assert.equal(threeBetPotReference({ potType: 'limp', board: ['Ah', '7d', '2c'] }).supported, false);
  assert.ok(!JSON.stringify([ref, srp, evaluatePushFoldSpot({ position: 'BTN', stackBb: 10, heroHand: 'AA' })]).includes('"solver_verified":true'));
});

test('describeCoverageTier separates verified solver, ICM model, 3-bet heuristic and unsupported formats', () => {
  assert.equal(describeCoverageTier({ solverVerified: true }).tier, COVERAGE_TIERS.SOLVER_VERIFIED);
  const icm = describeCoverageTier({ format: 'Tournament NLH', street: 'preflop', stackBucket: 'short' });
  assert.equal(icm.tier, COVERAGE_TIERS.ICM_MODEL);
  assert.equal(icm.truthLevel, TRUTH_LEVELS.ICM_MODEL);
  assert.equal(icm.solverVerified, false);
  assert.equal(describeCoverageTier({ format: 'Tournament NLH', street: 'preflop', stackBb: 12 }).tier, COVERAGE_TIERS.ICM_MODEL);
  assert.equal(describeCoverageTier({ format: 'Cash NLH', street: 'preflop', stackBucket: 'short' }).tier, COVERAGE_TIERS.SOLVER_ELIGIBLE);
  assert.equal(describeCoverageTier({ street: 'flop', spotType: '3bet_pot_cbet' }).tier, COVERAGE_TIERS.HEURISTIC_REFERENCE);
  for (const spot of [{ gameId: 'cash-plo4-001' }, { variant: 'Short Deck' }, { spotType: 'multiway_limped' }, { limped: true }]) {
    assert.equal(describeCoverageTier(spot).tier, COVERAGE_TIERS.UNSUPPORTED, JSON.stringify(spot));
  }
});

// ─── 3. Coaching intelligence ────────────────────────────────────────────────

const gap = (overrides = {}) => ({
  hand_external_id: `club-arena:${Math.random()}`,
  game_id: 'mtt-hand-audit',
  street: 'preflop',
  hero_position: 'BTN',
  spot_type: 'open',
  solver_verified: false,
  classification: 'unpriced',
  solver_source: 'hand-audit-v3:unpriced',
  ...overrides,
});

test('coverageGapsRanked groups unpriced decisions by format/street/position/stack/reason, ranks by frequency, caps at 10', () => {
  const decisions = [
    ...Array.from({ length: 5 }, () => gap({ stack_bucket: 'short' })),
    ...Array.from({ length: 3 }, () => gap({ game_id: 'cash-hand-audit', street: 'river', hero_position: 'bb' })),
    gap({ solver_source: 'hand-audit-v3:lookup-failed' }),
    gap({ match_tier: 2 }),
    { hand_external_id: 'club-arena:v', solver_verified: true, classification: 'best', street: 'flop' },
  ];
  const ranked = buildCoverageGapsRanked(decisions);
  assert.equal(ranked.totalUnpriced, 10);
  assert.equal(ranked.totalDecisions, 11);
  assert.deepEqual(Object.keys(ranked.gaps[0]).sort(), [
    'count', 'coverageHint', 'format', 'position', 'reason', 'sharePercent', 'spotType', 'stackBucket', 'street',
  ]);
  assert.deepEqual(
    [ranked.gaps[0].format, ranked.gaps[0].street, ranked.gaps[0].position, ranked.gaps[0].stackBucket, ranked.gaps[0].reason, ranked.gaps[0].count],
    ['Tournament NLH', 'preflop', 'BTN', 'short', 'no_exact_solver_node', 5],
  );
  assert.equal(ranked.gaps[0].sharePercent, 50);
  assert.equal(ranked.gaps[0].coverageHint.tier, COVERAGE_TIERS.ICM_MODEL);
  assert.equal(ranked.gaps[1].position, 'BB');
  assert.equal(ranked.gaps[1].stackBucket, 'unknown', 'stack bucket is never invented');
  assert.ok(ranked.gaps.some(row => row.reason === 'solver_lookup_failed'));
  assert.ok(ranked.gaps.some(row => row.reason === 'partial_node_match'));
  for (let i = 1; i < ranked.gaps.length; i += 1) assert.ok(ranked.gaps[i - 1].count >= ranked.gaps[i].count);

  const many = Array.from({ length: 25 }, (_, i) => gap({ street: `s${i}` }));
  assert.equal(buildCoverageGapsRanked(many).gaps.length, 10);
  assert.deepEqual(buildCoverageGapsRanked([]), { gaps: [], totalUnpriced: 0, totalDecisions: 0, bucketCount: 0 });
  assert.equal(buildCoverageGapsRanked(null).totalUnpriced, 0);
});

test('funnelMetrics is truthful and null-safe (never fabricates zeros for missing inputs)', () => {
  const none = buildFunnelMetrics({});
  assert.deepEqual(none, {
    auditedHands: null, auditedHandsSource: null, activeLeaks: null, drilledLeaks: null, masteredLeaks: null, verifiedFixedLive: null,
  });
  const funnel = buildFunnelMetrics({
    leaks: [{ id: 'a', status: 'persistent' }, { id: 'b', status: 'emerging' }, { id: 'c', status: 'resolved' }],
    reviews: [
      { leak_id: 'a', reps: 3, retired: true },
      { leak_id: 'b', reps: 0, history: [{ at: '2026-11-01T00:00:00Z', score: 0.9 }], retired: false },
      { leak_id: 'orphan', reps: 9, retired: true },
    ],
    decisions: [{ hand_external_id: 'club-arena:1' }, { hand_external_id: 'club-arena:1' }, { hand_external_id: 'club-arena:2' }],
    audit: { handsScanned: 51234 },
    verifiedFixedLive: 1,
  });
  assert.deepEqual(funnel, {
    auditedHands: 51234, auditedHandsSource: 'audit_job', activeLeaks: 2, drilledLeaks: 2, masteredLeaks: 1, verifiedFixedLive: 1,
  });
  const fallback = buildFunnelMetrics({ leaks: [], reviews: [], decisions: [{ hand_external_id: 'club-arena:1' }, { hand_external_id: 'club-arena:2' }] });
  assert.equal(fallback.auditedHands, 2);
  assert.equal(fallback.auditedHandsSource, 'decision_window');
  assert.equal(fallback.activeLeaks, 0, 'an empty supplied list is a real zero');
});

const BASELINE = '2026-11-01T00:00:00Z';
const baseLeak = {
  id: 'leak-1', leak_type: 'flop_overfold', title: 'Overfolding Flop C-Bets', leak_category: 'flop', status: 'persistent',
  avg_ev_loss_bb: 0.25, ev_loss_measured: true, occurrence_count: 15, total_samples: 60, first_detected_at: '2026-10-01T00:00:00Z',
};
const live = (n, mistakes, extra = {}) => Array.from({ length: n }, (_, i) => ({
  leak_id: 'leak-1', solver_verified: true, classification: i < mistakes ? 'mistake' : 'correct',
  hand_played_at: `2026-11-10T1${i % 10}:00:00Z`, audited_at: '2026-11-20T00:00:00Z', hand_external_id: `club-arena:h${i}`, ...extra,
}));
const planFor = (decisions, review) => buildTrainingPlan({
  leaks: [baseLeak],
  decisions,
  reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, remediation_baseline_at: BASELINE, ...review }],
}).modules[0].tableVerification;

test('tableVerification: before/after live proof with the 8-hand minimum and all four statuses', () => {
  assert.equal(MIN_LIVE_VERIFY_HANDS, 8);
  const notMastered = buildTrainingPlan({
    leaks: [baseLeak], decisions: [], reviews: [{ leak_id: 'leak-1', strong_streak: 1, retired: false, remediation_baseline_at: BASELINE }],
  }).modules[0].tableVerification;
  assert.equal(notMastered.status, 'not_mastered');
  assert.equal(notMastered.handsRemaining, 8);

  const awaiting = planFor(live(7, 0), {});
  assert.equal(awaiting.status, 'awaiting_live_hands');
  assert.equal(awaiting.postSampleCount, 7);
  assert.equal(awaiting.requiredSampleCount, 8);
  assert.equal(awaiting.handsRemaining, 1);
  assert.equal(awaiting.postMistakeRate, 0);

  const fixed = planFor([
    ...live(8, 1),
    ...live(5, 4, { hand_played_at: '2026-10-15T00:00:00Z' }),
  ], {});
  assert.equal(fixed.status, 'confirmed_fixed_at_tables');
  assert.equal(fixed.postSampleCount, 8);
  assert.equal(fixed.postMistakeRate, 12.5);
  assert.equal(fixed.preSampleCount, 5);
  assert.equal(fixed.preMistakeRate, 80);
  assert.equal(fixed.deltaPct, -67.5);
  assert.equal(fixed.handsRemaining, 0);
  assert.equal(fixed.timeBasis, 'hand_played_at');
  assert.ok(12.5 <= LIVE_FIX_MAX_MISTAKE_RATE);

  const relapsed = planFor(live(10, 4), {});
  assert.equal(relapsed.status, 'relapsed_at_tables');
  assert.equal(relapsed.verifiedLiveMilestone, null);
  const plan = buildTrainingPlan({
    leaks: [baseLeak], decisions: live(10, 4), reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, remediation_baseline_at: BASELINE }],
  });
  assert.equal(plan.modules[0].cadence, 'Re-Drill Required');
});

test('tableVerification only counts solver-verified grades and splits on hand played time, not re-audit time', () => {
  // Old hands re-audited after the baseline must stay "before".
  const reAudited = live(10, 0, { hand_played_at: '2026-10-20T00:00:00Z', audited_at: '2026-11-22T00:00:00Z' });
  const tv = planFor(reAudited, {});
  assert.equal(tv.postSampleCount, 0);
  assert.equal(tv.preSampleCount, 10);
  assert.equal(tv.status, 'awaiting_live_hands');
  // Unpriced decisions can neither prove nor disprove a fix.
  const unpriced = live(20, 0, { solver_verified: false, classification: 'unpriced' });
  assert.equal(planFor(unpriced, {}).postSampleCount, 0);
  // audited_at fallback is disclosed.
  const approx = planFor(live(8, 0).map(({ hand_played_at, ...row }) => row), {});
  assert.equal(approx.timeBasis, 'audited_at');
});

test('confirmed fix exposes a read-only milestone that grants no XP and mutates nothing', () => {
  const tv = planFor(live(9, 0), {});
  assert.equal(tv.status, 'confirmed_fixed_at_tables');
  assert.deepEqual(tv.verifiedLiveMilestone, {
    key: 'pa_leak_verified_fixed_at_tables',
    leakId: 'leak-1',
    idempotencyKey: `pa-verified-live:leak-1:${new Date(BASELINE).toISOString()}`,
    baselineAt: new Date(BASELINE).toISOString(),
    postSampleCount: 9,
    postMistakeRate: 0,
    preMistakeRate: null,
    deltaPct: null,
    readOnly: true,
    awarded: false,
    xp: 0,
    rewardCatalogKey: null,
  });
});

test('snapshot attaches tableVerification to plan modules, priorities and leaks, plus coverage, funnel and tiers', () => {
  const snapshot = buildCoachingSnapshot({
    leaks: [baseLeak, { ...baseLeak, id: 'leak-2', leak_type: 'river_overcall', status: 'resolved' }],
    decisions: [...live(9, 0), gap({ stack_bucket: 'short' }), gap({ gameId: 'x', spot_type: 'multiway_limped', game_id: 'cash-hand-audit', street: 'flop' })],
    reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, reps: 6, remediation_baseline_at: BASELINE }],
    audit: { handsScanned: 51000 },
  });
  const fromModule = snapshot.trainingPlan.modules[0].tableVerification;
  const fromPriority = snapshot.priorities.find(p => p.id === 'leak-1').tableVerification;
  const fromLeak = snapshot.leaks.find(l => l.id === 'leak-1').tableVerification;
  assert.equal(fromModule.status, 'confirmed_fixed_at_tables');
  assert.deepEqual(fromPriority, fromModule);
  assert.deepEqual(fromLeak, fromModule);
  assert.equal(snapshot.leaks.length, 2);
  assert.equal(snapshot.verifiedLiveMilestones.length, 1);
  assert.deepEqual(snapshot.funnelMetrics, {
    auditedHands: 51000, auditedHandsSource: 'audit_job', activeLeaks: 1, drilledLeaks: 1, masteredLeaks: 1, verifiedFixedLive: 1,
  });
  assert.equal(snapshot.coverageGapsRanked.length, 2);
  assert.equal(snapshot.coverageGapsSummary.totalUnpriced, 2);
  assert.equal(snapshot.coverageGapsSummary.thirdPartyTelemetry, false);
  assert.deepEqual(snapshot.coverageGapsSummary.tiers, {
    solverVerified: 9, deterministicIcmModel: 1, deterministicHeuristicReference: 0, unsupported: 1, awaitingSolverCoverage: 0,
  });
  // Existing snapshot contract is intact.
  assert.equal(snapshot.solverCoverageGaps.totalUnmeasured, 2);
  assert.equal(snapshot.trainingPlan.version, 'pa-training-plan-v2');
});

const sessionWindow = { startMs: Date.parse('2026-11-25T18:00:00Z'), endMs: Date.parse('2026-11-25T20:00:00Z'), source: 'poker_sessions' };
const mistake = (id, loss, playedAt, extra = {}) => ({
  hand_external_id: `club-arena:${id}`, solver_verified: true, classification: 'mistake', ev_loss_measured: true, ev_loss: -loss,
  street: 'turn', hero_position: 'btn', hero_hand: 'AhKd', player_action: 'call', solver_action: 'fold', hand_played_at: playedAt, ...extra,
});

test('sessionDebrief recap: top 2 graded mistakes of the latest session, gated by live-table state', () => {
  const decisions = [
    mistake('a', 1.2, '2026-11-25T18:30:00Z'),
    mistake('b', 4.8, '2026-11-25T19:00:00Z'),
    mistake('c', 2.5, '2026-11-25T19:30:00Z'),
    mistake('old', 9.9, '2026-11-24T19:30:00Z'),
    mistake('dup-b', 0.1, '2026-11-25T19:01:00Z', { hand_external_id: 'club-arena:b' }),
    { ...mistake('unpriced', 8, '2026-11-25T19:10:00Z'), solver_verified: false, classification: 'unpriced' },
    { ...mistake('nohandtime', 8, null) },
    { ...mistake('good', 3, '2026-11-25T19:10:00Z'), classification: 'best' },
  ];
  const picked = selectTopLeakedHands(decisions, sessionWindow);
  assert.deepEqual(picked.hands.map(h => h.handId), ['b', 'c']);
  assert.deepEqual(picked.hands[0], {
    handId: 'b', street: 'turn', position: 'BTN', heroHand: 'AhKd', playerAction: 'call', solverAction: 'fold', evLossBB: 4.8,
  });
  assert.equal(picked.sessionSource, 'poker_sessions');
  assert.equal(selectTopLeakedHands(decisions, null).unavailableReason, 'no_completed_session');

  const ok = buildCoachingSnapshot({ leaks: [baseLeak], decisions, liveTable: { active: false, cooldown: false }, sessionWindow }).sessionDebrief;
  assert.equal(ok.liveTableActive, false);
  assert.equal(ok.recapEligible, true);
  assert.equal(ok.topLeakedHands.length, 2);
  assert.equal(ok.liveTableStateKnown, true);

  const seated = buildCoachingSnapshot({ leaks: [baseLeak], decisions, liveTable: { active: true }, sessionWindow }).sessionDebrief;
  assert.equal(seated.liveTableActive, true);
  assert.equal(seated.recapEligible, false);
  assert.deepEqual(seated.topLeakedHands, [], 'no hand detail leaves the server while seated');
  assert.equal(seated.recapUnavailableReason, 'live_table_active');

  const unknown = buildCoachingSnapshot({ leaks: [baseLeak], decisions, sessionWindow }).sessionDebrief;
  assert.equal(unknown.liveTableActive, true, 'unverified table state fails closed');
  assert.equal(unknown.liveTableStateKnown, false);
  assert.equal(unknown.recapEligible, false);

  const noMistakes = buildCoachingSnapshot({ leaks: [baseLeak], decisions: [], liveTable: { active: false }, sessionWindow }).sessionDebrief;
  assert.equal(noMistakes.recapEligible, false);
  assert.deepEqual(noMistakes.topLeakedHands, []);
});

// ─── 4. Incremental audit + heartbeat + notification gateway ─────────────────

const matcher = 'hand-audit-v3';
const completedJob = (overrides = {}) => ({
  id: 'job-1',
  status: 'completed',
  started_at: '2026-11-24T10:00:00.000Z',
  created_at: '2026-11-24T09:59:00.000Z',
  completed_at: '2026-11-24T10:30:00.000Z',
  progress: { complete: true, handsQueuedForRetry: 0 },
  result: { clubArenaSync: { latestHandWatermark: { createdAt: '2026-11-24T09:58:00Z', id: 'h-9', matcherVersion: matcher } } },
  ...overrides,
});

test('incremental boundary from the latest completed job fails closed on any doubt', () => {
  const boundary = incrementalBoundaryFromCompletedJob(completedJob(), matcher);
  assert.equal(boundary.createdAt, '2026-11-24T10:00:00.000Z', 'uses job start, not completion, so mid-run hands are rescanned');
  assert.equal(boundary.matcherVersion, matcher);
  assert.equal(boundary.source, 'completed_job');
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob({ status: 'failed' }), matcher), null);
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob({ progress: { complete: false } }), matcher), null);
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob({ progress: { complete: true, handsQueuedForRetry: 3 } }), matcher), null);
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob({ result: {} }), matcher), null, 'unknown matcher');
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob(), 'hand-audit-v4'), null, 'matcher drift forces a full scan');
  assert.equal(incrementalBoundaryFromCompletedJob(completedJob({ started_at: null, created_at: null }), matcher), null);
  assert.equal(incrementalBoundaryFromCompletedJob(null, matcher), null);
});

test('forceFullRescan (or the durable fullRescan flag) overrides incremental scanning', () => {
  assert.equal(isFullRescanRequested({ forceFullRescan: true }), true);
  assert.equal(isFullRescanRequested({ fullRescan: true }), true);
  assert.equal(isFullRescanRequested({ forceFullRescan: 'yes' }), false);
  assert.equal(isFullRescanRequested({}), false);
  assert.equal(isFullRescanRequested(null), false);
});

test('audit progress records a heartbeat per batch and the incremental source', () => {
  const first = mergeAuditJobProgress({}, { success: true, auditInProgress: true, clubArenaSync: { handsFound: 200, auditCursor: 'c1', incrementalSource: 'completed_job', incrementalSince: '2026-11-24T10:00:00.000Z' } }, 50);
  assert.equal(first.heartbeatCount, 1);
  assert.equal(first.lastHeartbeatAt, first.lastUpdatedAt);
  assert.equal(first.incrementalSource, 'completed_job');
  assert.equal(first.incrementalSince, '2026-11-24T10:00:00.000Z');
  const second = mergeAuditJobProgress(first, { success: true, clubArenaSync: { handsFound: 10, incrementalStop: true } }, 50);
  assert.equal(second.heartbeatCount, 2);
  assert.equal(second.incrementalSource, 'completed_job', 'continuation pages keep the source');
  assert.equal(second.incrementalStop, true);
});

test('audit worker heartbeats before each batch and notifies through the master gateway idempotently', () => {
  const worker = read('app/api/assistant/leaks/audit-worker/route.js');
  assert.match(worker, /import \{ notify \} from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/notify'/);
  assert.doesNotMatch(worker, /from\('notifications'\)\s*\.insert/, 'no raw notification inserts');
  assert.match(worker, /await notify\(db\(\), \{/);
  assert.match(worker, /type: AUDIT_COMPLETE_TYPE/);
  assert.match(worker, /eq\('data->>paAuditJobId', String\(job\.id\)\)/, 'duplicate check per audit job');
  assert.match(worker, /alreadyNotified/);
  assert.match(worker, /withPush: !lookupFailed/);
  assert.match(worker, /personal_assistant_audit_complete/);
  assert.match(worker, /isFullRescanRequested\(requestBody\)/);
  const heartbeatIndex = worker.indexOf('const heartbeat = await checkpoint(');
  const detectIndex = worker.indexOf("fetch(`${origin}/api/assistant/leaks/detect`");
  assert.ok(heartbeatIndex > 0 && heartbeatIndex < detectIndex, 'heartbeat precedes the detector call');
  assert.match(worker, /status: 'running',\s*stage: job\.stage \|\| 'importing_hands'/);
  assert.match(worker, /if \(!heartbeat\) return null;/, 'a lost lease stops the worker');
  assert.match(worker, /p_lease_seconds: 300/);
  assert.match(worker, /await notifyCompletion\(saved, result\)/);
});

test('detect route reads an incremental boundary and honours forceFullRescan', () => {
  const detect = read('pages/api/assistant/leaks/detect.js');
  assert.match(detect, /isFullRescanRequested\(req\.body\)/);
  assert.match(detect, /readCompletedJobBoundary/);
  assert.match(detect, /\.eq\('status', 'completed'\)[\s\S]{0,120}\.order\('completed_at'/);
  assert.match(detect, /incrementalBoundaryFromCompletedJob\(data, MATCHER_VERSION\)/);
  assert.match(detect, /if \(!auditCursor && !fullRescan\)/);
  assert.match(detect, /clubArenaSync\.incrementalSource = incrementalSource/);
});

test('push preferences register the Personal Assistant notification types', () => {
  for (const key of ['personal_assistant_audit_complete', 'personal_assistant_review_due']) {
    assert.ok(PUSH_TYPE_KEYS.has(key), key);
    assert.equal(eventToTypeKey(key), key, `${key} is gated, not "unknown, allow it"`);
    assert.equal(pushTypeAllowed({ [key]: false }, key), false, `${key} can be muted`);
    assert.equal(pushTypeAllowed({}, key), true, 'default-on');
  }
});

test('coaching API reads live table state, session window and hand play times fail-closed', () => {
  const coaching = read('pages/api/assistant/coaching.js');
  assert.match(coaching, /checkSandboxAccess\(supabase, userId\)/);
  assert.match(coaching, /return \{ active: true, cooldown: false \};/, 'fails closed');
  assert.match(coaching, /from\('table_seats'\)\s*\.select\('joined_at, left_at'\)/, 'table_seats uses real joined_at column, never phantom created_at');
  assert.match(coaching, /from\('hand_history'\)/);
  assert.match(coaching, /liveTable,\s*sessionWindow,/);
  assert.match(coaching, /const rejected = audit\?\.progress \|\| \{\};/);
  assert.doesNotMatch(coaching, /\bxp\b|diamond_reward_catalog/i, 'no XP or reward-catalog writes');
});
