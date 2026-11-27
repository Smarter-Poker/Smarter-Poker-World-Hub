/**
 * Virtual Sandbox Enhancements & CI Watchdog Verification Suite
 * Covers:
 *  1. Multiway Action Builder & computeHandState (2-6 players + heads-up backward compat)
 *  2. Exact Historical Wager-Size Hand-History Parser (PokerStars, GGPoker, Club Arena, straddle/ante/all-in)
 *  3. Progressive Worker Equity + Instant Cancellation (500 preview -> 10,000 convergence)
 *  4. Preload Hand From Review My Play (?fromReview=<savedRowId> + hidden-card privacy)
 *  5. Accessible Keyboard Spatial Navigation (edge-based getBoundingClientRect, composedPath, no edge preventDefault)
 *  6. Dynamic Imports (next/dynamic { ssr: false }) & Updated Smoke/Hardening Route Contracts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

import {
  computeHandState,
  legalActionsFor,
  potFromActions,
} from '../src/components/sandbox/actionEngine.mjs';
import { parseHandHistory, detectSite } from '../src/lib/sandbox/HandHistoryParser.js';
import {
  runProgressiveEquity,
  combineEquitySamples,
  DEFAULT_PREVIEW_TRIALS,
  DEFAULT_FULL_TRIALS,
} from '../src/hooks/useEquityWorker.js';
import {
  SANDBOX_HANDOFF_STORAGE_KEY,
  parseReviewHandoffPayload,
  consumeReviewHandoffFromStorage,
} from '../src/components/sandbox/reviewHandoff.mjs';
import {
  isEditableEventTarget,
  findSpatialNeighbor,
  handleSpatialGridKeyDown,
} from '../src/components/sandbox/spatialNavigation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. Multiway Action Builder (2-6 seats) + Heads-Up Backward Compatibility ─

test('computeHandState preserves heads-up backward compatibility (pot, SPR, legal actions, fold/allin terminals)', () => {
  const open = computeHandState({
    basePot: 6.5,
    heroPosition: 'BTN',
    heroStack: 100,
    villainStack: 100,
    actions: [
      { street: 'flop', isHero: true, position: 'BTN', action: 'bet_50' },
    ],
  });
  assert.equal(open.isMultiway, false);
  assert.equal(open.totalPlayers, 2);
  assert.equal(open.activePlayerCount, 2);
  assert.equal(open.pot, 9.8); // 6.5 + 3.25 = 9.75 -> 9.8
  assert.equal(open.toAct, 'villain');
  assert.equal(open.facingBet, true);
  assert.deepEqual(legalActionsFor(open, 'villain'), ['fold', 'call', 'raise', 'allin']);

  const folded = computeHandState({
    basePot: 6.5,
    heroStack: 100,
    villainStack: 100,
    actions: [
      { street: 'flop', isHero: true, action: 'bet_50' },
      { street: 'flop', isVillain: true, action: 'fold' },
    ],
  });
  assert.equal(folded.terminal, 'fold');
  assert.equal(folded.winner, 'hero');
  assert.equal(folded.activePlayerCount, 1);
  assert.deepEqual(legalActionsFor(folded, 'hero'), []);
});

test('computeHandState supports 2-6 player multiway pots, tracking running pot, effective stack, and active seats per street', () => {
  const villains = [
    { id: 0, position: 'SB', stack: 80, name: 'Villain 1' },
    { id: 1, position: 'BB', stack: 120, name: 'Villain 2' },
    { id: 2, position: 'UTG', stack: 60, name: 'Villain 3' },
    { id: 3, position: 'MP', stack: 150, name: 'Villain 4' },
    { id: 4, position: 'CO', stack: 95, name: 'Villain 5' },
  ];

  // 6-max pot: Hero (BTN, 100 BB) + 5 villains
  const preflop = computeHandState({
    basePot: 1.5,
    heroPosition: 'BTN',
    heroStack: 100,
    villains,
    actions: [
      { street: 'preflop', actorKey: 'villain_2', position: 'UTG', action: 'raise', raiseTo: 3, amount: 3 },
      { street: 'preflop', actorKey: 'villain_3', position: 'MP', action: 'fold' },
      { street: 'preflop', actorKey: 'villain_4', position: 'CO', action: 'call', amount: 3 },
      { street: 'preflop', actorKey: 'hero', isHero: true, position: 'BTN', action: 'call', amount: 3 },
      { street: 'preflop', actorKey: 'villain_0', position: 'SB', action: 'fold' },
      { street: 'preflop', actorKey: 'villain_1', position: 'BB', action: 'call', amount: 2 },
    ],
  });

  assert.equal(preflop.isMultiway, true);
  assert.equal(preflop.totalPlayers, 6);
  assert.equal(preflop.activePlayerCount, 4); // UTG, CO, Hero, BB remain
  assert.equal(preflop.terminal, null);
  assert.equal(preflop.pot, 12.5); // 1.5 + 3 + 3 + 3 + 2
  assert.equal(preflop.remaining.hero, 97);
  assert.equal(preflop.remaining.villain_2, 57); // UTG 60 - 3
  assert.equal(preflop.remaining.villain_1, 118); // BB 120 - 2
  assert.equal(preflop.effectiveRemaining, 97); // min(hero 97, deepest active villain 118)
  assert.deepEqual(legalActionsFor(preflop, 'villain_3'), [], 'Folded seat has no legal actions');

  // Continue onto Flop: BB checks, UTG bets 6 BB, CO folds, Hero calls 6 BB, BB folds
  const flop = computeHandState({
    basePot: 1.5,
    heroPosition: 'BTN',
    heroStack: 100,
    villains,
    actions: [
      { street: 'preflop', actorKey: 'villain_2', position: 'UTG', action: 'raise', raiseTo: 3, amount: 3 },
      { street: 'preflop', actorKey: 'villain_3', position: 'MP', action: 'fold' },
      { street: 'preflop', actorKey: 'villain_4', position: 'CO', action: 'call', amount: 3 },
      { street: 'preflop', actorKey: 'hero', isHero: true, position: 'BTN', action: 'call', amount: 3 },
      { street: 'preflop', actorKey: 'villain_0', position: 'SB', action: 'fold' },
      { street: 'preflop', actorKey: 'villain_1', position: 'BB', action: 'call', amount: 2 },
      { street: 'flop', actorKey: 'villain_1', position: 'BB', action: 'check' },
      { street: 'flop', actorKey: 'villain_2', position: 'UTG', action: 'bet', amount: 6 },
      { street: 'flop', actorKey: 'villain_4', position: 'CO', action: 'fold' },
      { street: 'flop', actorKey: 'hero', isHero: true, position: 'BTN', action: 'call', amount: 6 },
      { street: 'flop', actorKey: 'villain_1', position: 'BB', action: 'fold' },
    ],
  });

  assert.equal(flop.activePlayerCount, 2); // Hero + UTG remain
  assert.equal(flop.perStreetActiveCounts.preflop, 4);
  assert.equal(flop.perStreetActiveCounts.flop, 2);
  assert.equal(flop.pot, 24.5); // 12.5 + 6 + 6
  assert.equal(flop.remaining.hero, 91); // 100 - 3 - 6
  assert.equal(flop.remaining.villain_2, 51); // 60 - 3 - 6
  assert.equal(flop.effectiveRemaining, 51); // min(hero 91, UTG 51)
  assert.equal(flop.streetClosed, true);
  assert.equal(potFromActions(1.5, [], { heroStack: 100, villains }), 1.5);
});

// ── 2. Precise Historical Wager-Size Hand-History Parser ─────────────────────

test('HandHistoryParser parses exact PokerStars wager sizes, blinds, and running pot', () => {
  const ps = [
    "PokerStars Hand #241489066746: Hold'em No Limit ($1/$2 USD) - 2026/01/05 20:14:02 ET",
    "Table 'Aludra II' 6-max Seat #3 is the button",
    'Seat 1: Hero ($214.50 in chips)',
    'Seat 2: Villain1 ($200 in chips)',
    'Seat 3: Villain2 ($318.20 in chips)',
    'Villain1: posts small blind $1',
    'Villain2: posts big blind $2',
    '*** HOLE CARDS ***',
    'Dealt to Hero [Ah Kd]',
    'Hero: raises $4 to $6',
    'Villain1: calls $5',
    'Villain2: folds',
    '*** FLOP *** [Kh 7c 2d]',
    'Villain1: checks',
    'Hero: bets $7',
    'Villain1: calls $7',
  ].join('\n');

  const parsed = parseHandHistory(ps);
  assert.equal(parsed.success, true);
  assert.equal(parsed.site, 'pokerstars');
  assert.equal(parsed.wagerSizesExact, true);
  assert.equal(parsed.blinds.sb, 0.5);
  assert.equal(parsed.blinds.bb, 1);
  assert.equal(parsed.potBase, 1.5);
  assert.equal(parsed.pot, 14); // 1.5 + 3 + 2.5 + 3.5 + 3.5 = 14 BB ($28)

  const preflopRaise = parsed.actionHistory[0];
  assert.equal(preflopRaise.action, 'raise');
  assert.equal(preflopRaise.raiseTo, 3);
  assert.equal(preflopRaise.amount, 3);
  assert.equal(preflopRaise.pot, 4.5);

  const preflopCall = parsed.actionHistory[1];
  assert.equal(preflopCall.action, 'call');
  assert.equal(preflopCall.amount, 2.5);
  assert.equal(preflopCall.pot, 7);

  const flopBet = parsed.actionHistory.find((a) => a.street === 'flop' && a.player === 'Hero');
  assert.equal(flopBet.action, 'bet');
  assert.equal(flopBet.amount, 3.5);
  assert.equal(flopBet.pot, 10.5);

  // Replay directly through computeHandState to prove exact pot round-trip!
  const replayed = computeHandState({
    basePot: parsed.potBase,
    heroPosition: parsed.heroPosition,
    heroStack: parsed.heroStack,
    villains: parsed.villains,
    actions: parsed.actionHistory,
  });
  assert.equal(replayed.pot, parsed.pot, 'computeHandState must preserve exact imported running pot');
});

test('HandHistoryParser parses GGPoker tournament antes, FIRST FLOP/TURN, and all-in wager sizes', () => {
  const gg = [
    "Poker Hand #HD12345678: Tournament #999001, Hold'em No Limit - Level V (100/200) - 2026/11/24 19:00:00",
    "Table '12' 6-max Seat #1 is the button",
    'Seat 1: Hero (10,000 in chips)',
    'Seat 2: VillainA (8,000 in chips)',
    'Seat 3: VillainB (12,000 in chips)',
    'Hero: posts the ante 25',
    'VillainA: posts the ante 25',
    'VillainB: posts the ante 25',
    'VillainA: posts small blind 100',
    'VillainB: posts big blind 200',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Qd]',
    'Hero: raises 300 to 500',
    'VillainA: folds',
    'VillainB: calls 300',
    '*** FIRST FLOP *** [Ac 8s 3d]',
    'VillainB: checks',
    'Hero: bets 600',
    'VillainB: raises 1,900 to 2,500',
    'Hero: raises 7,000 to 9,500 and is all-in',
    'VillainB: calls 7,000',
  ].join('\n');

  const parsed = parseHandHistory(gg);
  assert.equal(parsed.success, true);
  assert.equal(parsed.site, 'ggpoker');
  assert.equal(parsed.gameType, 'tournament');
  assert.equal(parsed.wagerSizesExact, true);
  assert.equal(parsed.ante, 0.38); // 75 / 200 = 0.375 -> 0.38 BB
  assert.equal(parsed.potBase, 1.88); // (75 + 100 + 200) / 200 = 1.875 -> 1.88 BB

  const shove = parsed.actionHistory.find((a) => a.allIn === true);
  assert.ok(shove, 'all-in flag must be detected');
  assert.equal(shove.action, 'allin');
  assert.equal(shove.raiseTo, 47.5); // 9500 / 200
  assert.equal(shove.amount, 44.5); // (9500 - 600) / 200
});

test('HandHistoryParser parses Club Arena straddle, ante, raises-to, and all-in formats', () => {
  const ca = [
    "Club Arena Hand #778899: Hold'em No Limit ($1/$2 USD) - 2026/11/25 22:00:00 UTC",
    "Table 'High Rollers' 6-max Seat #1 is the button",
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Shark1 ($250 in chips)',
    'Seat 3: Shark2 ($300 in chips)',
    'Seat 4: Shark3 ($180 in chips)',
    'Shark1: posts small blind $1',
    'Shark2: posts big blind $2',
    'Shark3: posts live straddle $4',
    '*** HOLE CARDS ***',
    'Dealt to Hero [Kh Ks]',
    'Hero: raises to $12',
    'Shark1: folds',
    'Shark2: calls $10',
    'Shark3: calls $8',
    '*** FLOP *** [Kc 9d 4s]',
    'Shark2: checks',
    'Shark3: bets $18',
    'Hero: calls $18',
    'Shark2: folds',
  ].join('\n');

  assert.equal(detectSite(ca), 'club_arena');
  const parsed = parseHandHistory(ca);
  assert.equal(parsed.success, true);
  assert.equal(parsed.site, 'club_arena');
  assert.equal(parsed.straddle, 2); // $4 / $2 = 2 BB
  assert.equal(parsed.potBase, 3.5); // ($1 + $2 + $4) / $2 = 3.5 BB
  assert.equal(parsed.wagerSizesExact, true);
  assert.equal(parsed.villains.length, 3);
  // Final pot: $7 forced + $12 Hero + $10 Shark2 + $8 Shark3 = $37 preflop + $18 + $18 flop = $73 = 36.5 BB
  assert.equal(parsed.pot, 36.5);
});

test('HandHistoryParser marks wagerSizesExact=false when wager sizes are missing in malformed/generic text', () => {
  const generic = [
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Villain ($200 in chips)',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Ks]',
    'Hero: raises',
    'Villain: calls',
  ].join('\n');

  const parsed = parseHandHistory(generic);
  assert.equal(parsed.success, true);
  assert.equal(parsed.wagerSizesExact, false);
});

// ── 3. Progressive Worker Equity + Instant Cancellation ──────────────────────

test('runProgressiveEquity emits fast 500-trial preview first then converges to 10,000 trials', async () => {
  assert.equal(DEFAULT_PREVIEW_TRIALS, 500);
  assert.equal(DEFAULT_FULL_TRIALS, 10000);

  const calls = [];
  const snapshots = [];
  const tokenRef = { current: 1 };

  const fakeCalc = async (_hero, _board, sims) => {
    calls.push(sims);
    // Slightly vary equity across batches to verify sample-size weighting
    const eq = sims === 500 ? 64.0 : 62.0;
    return { heroEquity: eq, villainEquity: 100 - eq, ties: 2.0, sampleSize: sims, rangeCombos: 120 };
  };

  const final = await runProgressiveEquity({
    heroCards: ['Ah', 'Kd'],
    boardCards: ['Kh', '7c', '2d'],
    rangeArg: 'QQ+,AKs',
    tokenRef,
    requestId: 1,
    calculateFn: fakeCalc,
    onProgress: (snap) => snapshots.push(snap),
  });

  assert.equal(calls[0], 500, 'First batch must be fast 500-trial preview');
  assert.equal(snapshots[0].isPreview, true);
  assert.equal(snapshots[0].converged, false);
  assert.equal(snapshots[0].sampleSize, 500);

  assert.equal(final.isPreview, false);
  assert.equal(final.converged, true);
  assert.equal(final.sampleSize, 10000);
  // Weighted avg: (500*64 + 9500*62) / 10000 = 62.1
  assert.equal(final.heroEquity, 62.1);

  const combined = combineEquitySamples([
    { heroEquity: 60, villainEquity: 40, ties: 0, sampleSize: 500 },
    { heroEquity: 70, villainEquity: 30, ties: 4, sampleSize: 1500 },
  ]);
  assert.equal(combined.sampleSize, 2000);
  assert.equal(combined.heroEquity, 67.5);
  assert.equal(combined.ties, 3);
});

test('runProgressiveEquity cancels immediately via monotonic token or AbortController (zero stale flash)', async () => {
  const tokenRef = { current: 10 };
  const progressAfterCancel = [];
  const controller = new AbortController();

  const slowCalc = async (_hero, _board, sims) => {
    // Simulate a newer edit bumping the monotonic token while batch 2 is in-flight
    if (sims > 500) {
      tokenRef.current = 11;
    }
    return { heroEquity: 55.0, villainEquity: 45.0, ties: 1.0, sampleSize: sims };
  };

  const result = await runProgressiveEquity({
    heroCards: ['Ah', 'Kd'],
    boardCards: [],
    tokenRef,
    requestId: 10,
    signal: controller.signal,
    calculateFn: slowCalc,
    onProgress: (snap) => progressAfterCancel.push(snap),
  });

  assert.equal(result, null, 'Stale request must resolve null after token invalidation');
  assert.equal(progressAfterCancel.length, 1, 'Only the pre-invalidation preview may emit; stale convergence never flashes');

  // AbortController already aborted before start
  const abortedCtrl = new AbortController();
  abortedCtrl.abort();
  let called = false;
  const abortedResult = await runProgressiveEquity({
    heroCards: ['Ah', 'Kd'],
    boardCards: [],
    signal: abortedCtrl.signal,
    calculateFn: async () => { called = true; return null; },
  });
  assert.equal(abortedResult, null);
  assert.equal(called, false, 'Aborted request must never even invoke equity calculation');
});

// ── 4. Preload Hand From Review My Play (?fromReview=<savedRowId>) ───────────

test('reviewHandoff consumes matching sessionStorage payload, clears storage, strips hidden cards, and keeps ungraded authority', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  mockStorage.setItem(SANDBOX_HANDOFF_STORAGE_KEY, JSON.stringify({
    sourceRowId: 'row-abc-123',
    heroCards: ['As', 'Kh'],
    board: ['Ks', '8d', '2c', '7h'],
    heroPosition: 'CO',
    pot: 18.5,
    effectiveStack: 85,
    gameFormat: 'tournament',
    // Malicious / accidental private fields must NEVER survive handoff:
    opponentCards: ['Qc', 'Qd'],
    villainCards: ['Jh', 'Jd'],
    hiddenCards: ['9s', '9c'],
  }));

  // Mismatched ID must NOT consume or clear matching payload
  assert.equal(consumeReviewHandoffFromStorage('different-row-id', mockStorage), null);
  assert.equal(store.has(SANDBOX_HANDOFF_STORAGE_KEY), true);

  // Matching ID consumes AND clears storage
  const handoff = consumeReviewHandoffFromStorage('row-abc-123', mockStorage);
  assert.ok(handoff);
  assert.equal(store.has(SANDBOX_HANDOFF_STORAGE_KEY), false, 'Storage entry must be cleared after consume');
  assert.deepEqual(handoff.heroHand, { card1: 'As', card2: 'Kh' });
  assert.deepEqual(handoff.board, { flop: ['Ks', '8d', '2c'], turn: '7h', river: null });
  assert.equal(handoff.heroPosition, 'CO');
  assert.equal(handoff.potBase, 18.5);
  assert.equal(handoff.heroStack, 85);
  assert.equal(handoff.gameType, 'tournament');
  assert.equal(handoff.authority, 'authored-sandbox-ungraded');
  assert.equal('opponentCards' in handoff, false);
  assert.equal('villainCards' in handoff, false);
  assert.equal('hiddenCards' in handoff, false);

  // API fallback row normalization
  const fromApi = parseReviewHandoffPayload({
    id: 'row-api-999',
    hero_hand: 'Qh Qd',
    community_cards: ['Qc', '7d', '2s'],
    hero_position: 'BTN',
    pot_bb: 24,
    effective_stack_bb: 110,
    game_type: 'cash',
  }, 'row-api-999');
  assert.deepEqual(fromApi.heroHand, { card1: 'Qh', card2: 'Qd' });
  assert.deepEqual(fromApi.board.flop, ['Qc', '7d', '2s']);
  assert.equal(fromApi.potBase, 24);
  assert.equal(fromApi.heroStack, 110);
  assert.equal(fromApi.authority, 'authored-sandbox-ungraded');
});

// ── 5. Accessible Keyboard Spatial Navigation (spatial-navigation) ───────────

test('spatialNavigation moves via getBoundingClientRect edges, skips disabled cells, ignores editable inputs, and never blocks edge scroll', () => {
  // Build a 2x3 mock grid of 44x44 buttons with 4px gap
  const makeCell = (code, row, col, disabled = false) => {
    let focused = false;
    let scrolledOpts = null;
    return {
      code,
      tagName: 'BUTTON',
      disabled,
      getAttribute: (name) => (name === 'data-card-code' ? code : null),
      getBoundingClientRect: () => ({
        left: col * 48,
        right: col * 48 + 44,
        top: row * 48,
        bottom: row * 48 + 44,
        width: 44,
        height: 44,
      }),
      focus: () => { focused = true; },
      scrollIntoView: (opts) => { scrolledOpts = opts; },
      get focused() { return focused; },
      get scrolledOpts() { return scrolledOpts; },
    };
  };

  const as = makeCell('As', 0, 0);
  const ks = makeCell('Ks', 0, 1, true); // disabled (already dealt)
  const qs = makeCell('Qs', 0, 2);
  const ah = makeCell('Ah', 1, 0);
  const kh = makeCell('Kh', 1, 1);
  const qh = makeCell('Qh', 1, 2);
  const all = [as, ks, qs, ah, kh, qh];
  const container = { querySelectorAll: () => all.filter((c) => !c.disabled) };

  // ArrowRight from As skips disabled Ks and lands on Qs!
  assert.equal(findSpatialNeighbor(as, all, 'ArrowRight'), qs);
  // ArrowDown from As lands on Ah!
  assert.equal(findSpatialNeighbor(as, all, 'ArrowDown'), ah);
  // ArrowLeft from As (left edge) -> null!
  assert.equal(findSpatialNeighbor(as, all, 'ArrowLeft'), null);
  // ArrowUp from As (top edge) -> null!
  assert.equal(findSpatialNeighbor(as, all, 'ArrowUp'), null);

  // At grid edge: preventDefault MUST NOT be called (preserves native scroll)
  let edgePrevented = false;
  const edgeRes = handleSpatialGridKeyDown({
    key: 'ArrowUp',
    composedPath: () => [as],
    preventDefault: () => { edgePrevented = true; },
  }, { container });
  assert.equal(edgeRes, null);
  assert.equal(edgePrevented, false, 'preventDefault MUST NOT be called when no candidate exists in direction');

  // Valid move: preventDefault IS called, focus + scrollIntoView({ block:'nearest', inline:'nearest' }) run
  let movePrevented = false;
  let movedTo = null;
  const moveRes = handleSpatialGridKeyDown({
    key: 'ArrowRight',
    composedPath: () => [as],
    preventDefault: () => { movePrevented = true; },
  }, { container, onMove: (el) => { movedTo = el; } });
  assert.equal(moveRes, qs);
  assert.equal(movedTo, qs);
  assert.equal(movePrevented, true);
  assert.equal(qs.focused, true);
  assert.deepEqual(qs.scrolledOpts, { block: 'nearest', inline: 'nearest' });

  // Editable target check via composedPath()[0]
  assert.equal(isEditableEventTarget({ composedPath: () => [{ tagName: 'INPUT' }] }), true);
  assert.equal(isEditableEventTarget({ composedPath: () => [{ tagName: 'TEXTAREA' }] }), true);
  assert.equal(isEditableEventTarget({ composedPath: () => [{ tagName: 'DIV', isContentEditable: true }] }), true);
  assert.equal(isEditableEventTarget({ composedPath: () => [as] }), false);

  let inputPrevented = false;
  const inputRes = handleSpatialGridKeyDown({
    key: 'ArrowRight',
    composedPath: () => [{ tagName: 'INPUT' }],
    preventDefault: () => { inputPrevented = true; },
  }, { container });
  assert.equal(inputRes, null);
  assert.equal(inputPrevented, false, 'Editable inputs must never be intercepted');
});

test('sandbox.js wires CardPickerSheet spatial grid, ?fromReview= preload, progressive equity, and next/dynamic { ssr: false }', () => {
  const src = read('pages/hub/personal-assistant/sandbox.js');

  // Spatial navigation wiring in CardPickerSheet
  assert.match(src, /role="grid"/);
  assert.match(src, /role="row"/);
  assert.match(src, /role="gridcell"/);
  assert.match(src, /tabIndex=\{isRovingActive \? 0 : -1\}/);
  assert.match(src, /handleSpatialGridKeyDown/);
  assert.match(src, /minWidth:\s*36,\s*minHeight:\s*44/);

  // ?fromReview= preload wiring
  assert.match(src, /useRouter/);
  assert.match(src, /fromReview/);
  assert.match(src, /consumeReviewHandoffFromStorage/);
  assert.match(src, /\/api\/poker\/saved-hands\?id=/);

  // Progressive equity wiring via useEquityWorker hook
  assert.match(src, /useEquityWorker\s*\(/);
  assert.match(src, /DEFAULT_PREVIEW_TRIALS/);
  assert.match(src, /DEFAULT_FULL_TRIALS/);

  // Heavy secondary panels/modals use next/dynamic({ ssr: false })
  for (const mod of ['RangeHeatGrid', 'RangeExplorer', 'SaveHandModal', 'StudyFolders', 'ShareScenarioModal', 'ImportHHModal', 'SessionReport', 'SessionAnalytics']) {
    assert.match(src, new RegExp(`const ${mod} = dynamic\\([\\s\\S]*?ssr:\\s*false`), `${mod} must be dynamically imported with ssr: false`);
  }
});

// ── 6. Updated Smoke & Hardening Watchdog Route Contracts ────────────────────

test('pa-browser-smoke and verify-pa-production-hardening include /hub/personal-assistant/review', async () => {
  const smoke = await import(pathToFileURL(path.join(ROOT, 'scripts/ci/pa-browser-smoke.mjs')).href);
  assert.ok(smoke.ROUTES.includes('/hub/personal-assistant/review'), 'pa-browser-smoke ROUTES must include /hub/personal-assistant/review');
  assert.equal(smoke.ROUTES.length, 7);
  assert.deepEqual(smoke.checkContract(), []);

  const watchdog = read('scripts/verify-pa-production-hardening.mjs');
  assert.match(watchdog, /'\/hub\/personal-assistant\/review'/);
});
