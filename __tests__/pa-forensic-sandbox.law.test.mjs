/**
 * Virtual Sandbox Forensic Hardening Law
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent executable anti-regression guards for every verified World Hub
 * Virtual Sandbox forensic finding. If ANY bug below is reintroduced, the
 * corresponding test in this suite MUST fail immediately:
 *
 *  1. [P0] RangeHeatGrid wired with open/close state, trigger button, and exact
 *     props (isOpen, onClose, villainRange, villainLabel, heroHand, boardCards);
 *     RangeExplorer wired with onSelectRange (NEVER onApplyRange).
 *  2. [P0] Villain removal (3->2 for idx 0/1/2 and 3->1) + 7-9-max HH import
 *     clamping + fail-closed resolveActorKey never corrupt surviving villains'
 *     fold/stack/pot/SPR.
 *  3. [P1] Custom "Raise To (BB)" emits { raiseTo } only and computeHandState
 *     prioritizes explicitRaiseTo before explicitAmount (bet 5 -> Raise To 40
 *     with 25 prior yields streetIn: 40, pot: 65, toCall: 25 - zero double-charge).
 *  4. [P1] Imported HH preflop closure (BTN raise 3 BB + BB call 2 BB ->
 *     streetClosed: true, toCall: 0), Uncalled bet returned refunding pot/stack,
 *     888poker "$0.50/$1.00 Blinds" & bracketed posts parsing $120 as 120 BB,
 *     and fresh scenario passed directly into recordExplorationSnapshot.
 *  5. [P1] reviewHandoff.mjs API fallback computes pot_total / big_blind and
 *     heroPlayer.stack / big_blind accurately; restoreScenario clears explicit
 *     heroHand: null, resets villains cleanly, and ?fromReview effect uses ref.
 *  6. [P1/P2] BottomSheet onBeforeEscape for mobile CardPickerSheet Step-2,
 *     WAI-ARIA role="row" inside role="grid" on mobile rank & suit grids,
 *     single persistent <button> ref in CardSlot, useEquityWorker null guard
 *     (heroEquity: null never coerces to 0) & live consumption in sandbox.js,
 *     and accessible loading fallbacks on next/dynamic modal imports.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  computeHandState,
  legalActionsFor,
  pruneAndRemapActionsOnVillainRemoval,
  pruneActionsToMaxVillains,
} from '../src/components/sandbox/actionEngine.mjs';
import { parseHandHistory } from '../src/lib/sandbox/HandHistoryParser.js';
import { parseReviewHandoffPayload } from '../src/components/sandbox/reviewHandoff.mjs';
import {
  runProgressiveEquity,
  combineEquitySamples,
} from '../src/hooks/useEquityWorker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. [P0] RangeHeatGrid & RangeExplorer Prop Contracts ────────────────────

test('[P0] RangeHeatGrid is wired with open state, trigger button, and exact props; RangeExplorer uses onSelectRange', () => {
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');

  // Open/close modal state + accessible trigger
  assert.match(sandbox, /const \[showRangeHeatGrid,\s*setShowRangeHeatGrid\] = useState\(false\)/);
  assert.match(sandbox, /setShowRangeHeatGrid\(true\)/);

  // Extract <RangeHeatGrid ... /> JSX invocation and verify every required prop
  const heatGridMatch = sandbox.match(/<RangeHeatGrid\b([\s\S]*?)\/>/);
  assert.ok(heatGridMatch, '<RangeHeatGrid ... /> must be rendered in sandbox.js');
  const heatGridProps = heatGridMatch[1];
  for (const prop of ['isOpen=', 'onClose=', 'villainRange=', 'villainLabel=', 'heroHand=', 'boardCards=']) {
    assert.ok(
      heatGridProps.includes(prop),
      `<RangeHeatGrid> missing required prop "${prop}"`,
    );
  }
  assert.doesNotMatch(heatGridProps, /\brange=/, '<RangeHeatGrid> must pass villainRange=, not dead range=');

  // Extract <RangeExplorer ... /> JSX invocation: MUST use onSelectRange, NEVER onApplyRange
  const explorerMatch = sandbox.match(/<RangeExplorer\b([\s\S]*?)\/>/);
  assert.ok(explorerMatch, '<RangeExplorer ... /> must be rendered in sandbox.js');
  const explorerProps = explorerMatch[1];
  assert.match(explorerProps, /\bonSelectRange=/, '<RangeExplorer> must pass onSelectRange=');
  assert.doesNotMatch(sandbox, /\bonApplyRange=/, 'Dead prop onApplyRange must never exist in sandbox.js');
});

// ── 2. [P0] Villain Removal (3->2, 3->1), 9-Max Clamping & Fail-Closed Orphan Guard ─

test('[P0] pruneAndRemapActionsOnVillainRemoval handles 3->2 (removing idx 0, 1, 2) and 3->1 without corrupting surviving seats', () => {
  const threeVillains = [
    { id: 0, position: 'SB', stack: 100, name: 'Villain 1' },
    { id: 1, position: 'BB', stack: 120, name: 'Villain 2' },
    { id: 2, position: 'CO', stack: 80, name: 'Villain 3' },
  ];
  const baseActions = [
    { street: 'flop', actorKey: 'villain_0', actor: 'villain_0', seatIndex: 1, villainIndex: 0, isVillain: true, position: 'SB', action: 'fold' },
    { street: 'flop', actorKey: 'hero', actor: 'hero', seatIndex: 0, isHero: true, position: 'BTN', action: 'bet', amount: 10 },
    { street: 'flop', actorKey: 'villain_1', actor: 'villain_1', seatIndex: 2, villainIndex: 1, isVillain: true, position: 'BB', action: 'call', amount: 10 },
    { street: 'flop', actorKey: 'villain_2', actor: 'villain_2', seatIndex: 3, villainIndex: 2, isVillain: true, position: 'CO', action: 'fold' },
  ];

  // Case A: 3 -> 2 removing idx 0 (SB folded)
  const afterRemove0 = pruneAndRemapActionsOnVillainRemoval(baseActions, 0, 3);
  assert.equal(afterRemove0.length, 3);
  assert.equal(afterRemove0[1].actorKey, 'villain_0', 'old villain_1 remaps to villain_0');
  assert.equal(afterRemove0[2].actorKey, 'villain_1', 'old villain_2 remaps to villain_1');
  const st0 = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    heroStack: 100,
    villains: [threeVillains[1], threeVillains[2]],
    actions: afterRemove0,
  });
  assert.equal(st0.players.find((p) => p.key === 'villain_0').folded, false, 'surviving BB (now villain_0) must stay active');
  assert.equal(st0.players.find((p) => p.key === 'villain_0').remaining, 110, 'surviving BB stack = 120 - 10');
  assert.equal(st0.players.find((p) => p.key === 'villain_1').folded, true, 'surviving CO (now villain_1) keeps its fold');
  assert.equal(st0.pot, 30, 'pot = 10 + 10 + 10');

  // Case B: 3 -> 2 removing idx 1 (BB called 10)
  const afterRemove1 = pruneAndRemapActionsOnVillainRemoval(baseActions, 1, 3);
  assert.equal(afterRemove1.length, 3);
  assert.equal(afterRemove1[0].actorKey, 'villain_0', 'old villain_0 stays villain_0');
  assert.equal(afterRemove1[2].actorKey, 'villain_1', 'old villain_2 remaps to villain_1');
  const st1 = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    heroStack: 100,
    villains: [threeVillains[0], threeVillains[2]],
    actions: afterRemove1,
  });
  assert.equal(st1.terminal, 'fold', 'both remaining villains folded -> hero wins');
  assert.equal(st1.pot, 20, 'removed BB call is gone: pot = 10 + 10');

  // Case C: 3 -> 2 removing idx 2 (CO folded)
  const afterRemove2 = pruneAndRemapActionsOnVillainRemoval(baseActions, 2, 3);
  assert.equal(afterRemove2.length, 3);
  const st2 = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    heroStack: 100,
    villains: [threeVillains[0], threeVillains[1]],
    actions: afterRemove2,
  });
  assert.equal(st2.players.find((p) => p.key === 'villain_0').folded, true);
  assert.equal(st2.players.find((p) => p.key === 'villain_1').folded, false);
  assert.equal(st2.players.find((p) => p.key === 'villain_1').remaining, 110);
  assert.equal(st2.pot, 30);

  // Case D: 3 -> 2 -> 1 (removing idx 0 then removing idx 1 -> only BB survives in heads-up)
  const after3to1 = pruneAndRemapActionsOnVillainRemoval(afterRemove0, 1, 2);
  assert.equal(after3to1.length, 2);
  assert.equal(after3to1[1].actorKey, 'villain', 'surviving single villain must remap to heads-up key "villain"');
  const st3to1 = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    heroStack: 100,
    villains: [threeVillains[1]],
    actions: after3to1,
  });
  assert.equal(st3to1.isMultiway, false);
  assert.equal(st3to1.terminal, null, 'surviving BB must NOT inherit a removed villain fold');
  assert.equal(st3to1.players.find((p) => p.key === 'villain').folded, false);
  assert.equal(st3to1.pot, 30);
  assert.equal(st3to1.remaining.hero, 90);
  assert.equal(st3to1.remaining.villain, 90); // heads-up effective stack min(100, 120) - 10
  assert.equal(st3to1.spr, 3); // 90 / 30 = 3.0
});

test('[P0] resolveActorKey fail-closes orphaned villain_N / out-of-bounds seats and pruneActionsToMaxVillains clamps 9-max imports', () => {
  // Unpruned orphan action targeting villain_2 on a 2-villain (hero + villain_0 + villain_1) table
  const twoVillains = [
    { id: 0, position: 'SB', stack: 100 },
    { id: 1, position: 'BB', stack: 100 },
  ];
  const orphanState = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    heroStack: 100,
    villains: twoVillains,
    actions: [
      { street: 'flop', actorKey: 'hero', isHero: true, action: 'bet', amount: 5 },
      // Orphaned villain_2 fold MUST NOT fall through to villain_0 or villain_1!
      { street: 'flop', actorKey: 'villain_2', isVillain: true, position: 'CO', action: 'fold' },
      // Out-of-bounds seatIndex 7 MUST NOT fall through to villain_0 or villain_1!
      { street: 'flop', seatIndex: 7, isVillain: true, position: 'SB', action: 'fold' },
    ],
  });
  assert.equal(orphanState.activePlayerCount, 3, 'Orphaned seat keys must never fold surviving villains');
  assert.equal(orphanState.players.find((p) => p.key === 'villain_0').folded, false);
  assert.equal(orphanState.players.find((p) => p.key === 'villain_1').folded, false);
  assert.equal(orphanState.pot, 15);

  // 9-max HH import clamped to MAX_VILLAINS = 5
  const nineMaxActions = [
    { street: 'preflop', seatIndex: 0, isHero: true, position: 'BTN', action: 'raise', raiseTo: 3, amount: 3 },
    { street: 'preflop', seatIndex: 1, isVillain: true, position: 'SB', action: 'fold' },
    { street: 'preflop', seatIndex: 2, isVillain: true, position: 'BB', action: 'call', amount: 2 },
    { street: 'preflop', seatIndex: 6, isVillain: true, position: 'MP', action: 'fold' },
    { street: 'preflop', seatIndex: 7, isVillain: true, position: 'CO', action: 'bet', amount: 12 },
    { street: 'preflop', seatIndex: 8, isVillain: true, position: 'CO', action: 'fold' },
  ];
  const clamped = pruneActionsToMaxVillains(nineMaxActions, 5);
  assert.equal(clamped.length, 3, 'Seats 6, 7, 8 (villainIndex 5, 6, 7) must be pruned when clamping to 5 villains');
  assert.ok(clamped.every((a) => a.isHero || a.seatIndex <= 5));

  // Verify sandbox.js wires pruneAndRemapActionsOnVillainRemoval, pruneActionsToMaxVillains, and activeVillainIdx clamping
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /pruneAndRemapActionsOnVillainRemoval\s*\(/);
  assert.match(sandbox, /pruneActionsToMaxVillains\s*\(/);
  assert.match(sandbox, /if\s*\(idx\s*<\s*prev\)\s*return\s*prev\s*-\s*1;/);
});

// ── 3. [P1] Custom "Raise To (BB)" Zero Double-Charging ─────────────────────

test('[P1] Custom Raise To 40 BB after 5 BB bet produces exact streetIn: 40, pot: 65, toCall: 25 (zero double-charging)', () => {
  // basePot 10 + Hero bet 5 + Villain raiseTo 15 = 30 in pot (25 prior non-hero + 5 hero streetIn)
  // Hero Raise To 40 BB -> adds only 35 BB (40 - 5), NOT 40 BB!
  const state = computeHandState({
    basePot: 10,
    heroPosition: 'BTN',
    villainPosition: 'BB',
    heroStack: 100,
    villainStack: 100,
    actions: [
      { street: 'flop', isHero: true, action: 'bet', amount: 5 },
      { street: 'flop', isVillain: true, action: 'raise', raiseTo: 15 },
      // Even if a legacy caller passes both raiseTo and amount, explicitRaiseTo MUST win!
      { street: 'flop', isHero: true, action: 'raise', raiseTo: 40, amount: 40 },
    ],
  });

  assert.equal(state.streetIn.hero, 40, 'Hero streetIn must equal exact Raise To (40 BB)');
  assert.equal(state.streetIn.villain, 15);
  assert.equal(state.pot, 65, 'Pot must be 10 + 15 + 40 = 65 BB (zero double-charge of prior 5 BB)');
  assert.equal(state.toCall, 25, 'Villain faces 40 - 15 = 25 BB to call');
  assert.equal(state.remaining.hero, 60, 'Hero invested exactly 40 BB, leaving 60 BB');

  // Also verify SandboxComponents.jsx emitCustomBb emits { raiseTo: cleanVal } WITHOUT redundant amount
  const components = read('src/components/sandbox/SandboxComponents.jsx');
  const emitFn = components.match(/const emitCustomBb\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\};/);
  assert.ok(emitFn, 'emitCustomBb must exist in SandboxComponents.jsx');
  assert.match(emitFn[0], /emit\('raise',\s*`Raise \$\{cleanVal\} BB`,\s*\{\s*raiseTo:\s*cleanVal\s*\}\)/);
  assert.doesNotMatch(emitFn[0], /raiseTo:\s*cleanVal,\s*amount:/, 'emitCustomBb must not emit redundant amount alongside raiseTo');
});

// ── 4. [P1] Imported HH Preflop Closure, Uncalled Return, 888poker Stakes, Fresh Snapshot ─

test('[P1] Imported BTN raise 3 BB + BB call 2 BB closes preflop with streetClosed: true and toCall: 0', () => {
  const hh = [
    "PokerStars Hand #900001: Hold'em No Limit ($1/$2 USD) - 2026/11/25 20:00:00 ET",
    "Table 'Alpha' 6-max Seat #1 is the button",
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: SmallB ($200 in chips)',
    'Seat 3: BigB ($200 in chips)',
    'SmallB: posts small blind $1',
    'BigB: posts big blind $2',
    '*** HOLE CARDS ***',
    'Dealt to Hero [Ah Kd]',
    'Hero: raises $4 to $6',
    'SmallB: folds',
    'BigB: calls $4',
  ].join('\n');

  const parsed = parseHandHistory(hh);
  assert.equal(parsed.success, true);
  assert.equal(parsed.preflopPosts.length, 2);
  assert.equal(parsed.potBase, 1.5);
  assert.equal(parsed.pot, 6.5);

  const replayed = computeHandState({
    basePot: parsed.potBase,
    heroPosition: parsed.heroPosition,
    heroStack: parsed.heroStack,
    villains: parsed.villains,
    actions: parsed.actionHistory,
    preflopPosts: parsed.preflopPosts,
  });

  assert.equal(replayed.pot, 6.5, 'Pot must equal 0.5 SB + 3 BTN + 3 BB = 6.5 BB (no double-counted blinds)');
  assert.equal(replayed.streetIn.hero, 3);
  assert.equal(replayed.streetIn.villain_1, 3, 'BB streetIn = 1 BB blind + 2 BB call = 3 BB');
  assert.equal(replayed.streetClosed, true, 'Preflop must close cleanly when BB calls 2 BB');
  assert.equal(replayed.toCall, 0, 'toCall must be 0 when preflop closes');
  assert.equal(replayed.toAct, null);
});

test('[P1] Uncalled bet returned emits uncalled_return entry and reconciles pot & stack cleanly in computeHandState', () => {
  const hh = [
    "PokerStars Hand #900002: Hold'em No Limit ($1/$2 USD) - 2026/11/25 20:05:00 ET",
    "Table 'Beta' 6-max Seat #1 is the button",
    'Seat 1: Hero ($200 in chips)',
    'Seat 2: Villain ($200 in chips)',
    'Hero: posts small blind $1',
    'Villain: posts big blind $2',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Ks]',
    'Hero: raises $5 to $6',
    'Villain: folds',
    'Uncalled bet ($4.00) returned to Hero',
  ].join('\n');

  const parsed = parseHandHistory(hh);
  assert.equal(parsed.success, true);
  const uncalledEntry = parsed.actionHistory.find((a) => a.type === 'uncalled_return');
  assert.ok(uncalledEntry, 'Parser must emit explicit uncalled_return entry');
  assert.equal(uncalledEntry.actorKey, 'hero');
  assert.equal(uncalledEntry.seat, 0);
  assert.equal(uncalledEntry.amount, 2); // $4 / $2 = 2 BB
  assert.equal(parsed.pot, 2); // $1 + $2 + $5 - $4 = $4 = 2 BB

  const replayed = computeHandState({
    basePot: parsed.potBase,
    heroPosition: parsed.heroPosition,
    heroStack: parsed.heroStack,
    villains: parsed.villains,
    actions: parsed.actionHistory,
    preflopPosts: parsed.preflopPosts,
  });

  assert.equal(replayed.pot, parsed.pot, 'computeHandState must refund uncalled bet with zero phantom pot');
  assert.equal(replayed.remaining.hero, 99, 'Hero stack refunded from 97 BB back to 99 BB (only 1 BB matched)');
});

test('[P1] 888poker "$0.50/$1.00 Blinds" header and bracketed posts parse $120 stack as 120 BB (not fallback 100 BB)', () => {
  const hh888 = [
    '#Game No : 987654321',
    '***** 888poker Hand History for Game 987654321 *****',
    '$0.50/$1.00 Blinds No Limit Holdem - *** 25 11 2026 20:10:00',
    'Table London 6 Max (Real Money)',
    'Seat 1 is the button',
    'Total number of players : 2',
    'Seat 1: Hero ( $120 )',
    'Seat 2: Villain ( $85 )',
    'Hero posts small blind [$0.50]',
    'Villain posts big blind [$1]',
    '** Dealing down cards **',
    'Dealt to Hero [ Ah, Kd ]',
    'Hero raises [$2.50]',
    'Villain calls [$2]',
  ].join('\n');

  const parsed = parseHandHistory(hh888);
  assert.equal(parsed.success, true);
  assert.equal(parsed.bbSize, 1, '888poker BB size must be detected as $1 before assignSeats');
  assert.equal(parsed.heroStack, 120, '$120 at $0.50/$1.00 must convert to 120 BB');
  assert.equal(parsed.villains[0].stack, 85, '$85 at $0.50/$1.00 must convert to 85 BB');

  // Also test bracketed post fallback when Blinds header is absent
  const hh888NoHeader = hh888.replace('$0.50/$1.00 Blinds No Limit Holdem - *** 25 11 2026 20:10:00', 'Table Only');
  const parsedFallback = parseHandHistory(hh888NoHeader);
  assert.equal(parsedFallback.success, true);
  assert.equal(parsedFallback.bbSize, 1, 'Bracketed "posts big blind [$1]" fallback must detect BB = $1');
  assert.equal(parsedFallback.heroStack, 120);

  // Verify sandbox.js passes newly imported scenario directly into recordExplorationSnapshot
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /recordExplorationSnapshot\('Imported Hand History',\s*parsed\)/);
  assert.match(sandbox, /recordExplorationSnapshot\('Imported Solver Node',\s*state\)/);
});

// ── 5. [P1] reviewHandoff.mjs API Fallback & restoreScenario Reset ──────────

test('[P1] reviewHandoff.mjs API fallback computes pot_total / big_blind and heroPlayer.stack / big_blind accurately', () => {
  const apiRow = {
    id: 'saved-row-42',
    small_blind: 5,
    big_blind: 10,
    pot_total: 245, // 24.5 BB
    hand_data: {
      source: 'club-arena',
      heroCards: ['Qs', 'Qh'],
      heroPosition: 'CO',
      communityCards: ['Qc', '8d', '3s'],
      players: [
        { seatIndex: 1, name: 'You', position: 'CO', stack: 1450, isHero: true, holeCards: ['Qs', 'Qh'] }, // 145 BB
        { seatIndex: 2, name: 'SecretOpp', position: 'BB', stack: 920, isHero: false, holeCards: ['As', 'Ad'] }, // 92 BB, cards MUST be stripped
      ],
    },
  };

  const handoff = parseReviewHandoffPayload(apiRow, 'saved-row-42');
  assert.ok(handoff);
  assert.equal(handoff.potBase, 24.5, 'potBase must equal pot_total / big_blind (245 / 10 = 24.5 BB)');
  assert.equal(handoff.heroStack, 145, 'heroStack must equal heroPlayer.stack / big_blind (1450 / 10 = 145 BB)');
  assert.equal(handoff.heroPosition, 'CO');
  assert.deepEqual(handoff.heroHand, { card1: 'Qs', card2: 'Qh' });
  assert.equal(handoff.authority, 'authored-sandbox-ungraded');
  assert.equal(handoff.villains.length, 1);
  assert.equal(handoff.villains[0].stack, 92);
  assert.equal('holeCards' in handoff.villains[0], false, 'Opponent holeCards must never leak into handoff');
  assert.equal('name' in handoff.villains[0], false, 'Opponent PII name must never leak into handoff');

  // Verify restoreScenario clears explicit heroHand: null and ?fromReview effect uses restoreScenarioRef
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /Object\.prototype\.hasOwnProperty\.call\(raw,\s*'heroHand'\)\s*&&\s*raw\.heroHand\s*===\s*null/);
  assert.match(sandbox, /setHeroHand\(\{\s*card1:\s*null,\s*card2:\s*null\s*\}\)/);
  assert.match(sandbox, /const restoreScenarioRef = useRef\(restoreScenario\)/);
  assert.match(sandbox, /restoreScenarioRef\.current\(/);
  const fromReviewEffect = sandbox.match(/\/\/ ── Preload Hand From Review My Play[\s\S]*?\}, \[([^\]]+)\]\);/);
  assert.ok(fromReviewEffect, 'Preload Hand From Review My Play useEffect must exist');
  assert.doesNotMatch(fromReviewEffect[1], /\brestoreScenario\b/, 'Unstable restoreScenario must not be in ?fromReview useEffect deps');
});

// ── 6. [P1/P2] useEquityWorker Null Guard, BottomSheet onBeforeEscape, ARIA Grid Rows, CardSlot Focus ─

test('[P1/P2] useEquityWorker rejects heroEquity: null (never coerces to 0) and is consumed live in sandbox.js', async () => {
  // combineEquitySamples must reject null heroEquity (Number(null) === 0 trap!)
  assert.equal(
    combineEquitySamples([{ heroEquity: null, villainEquity: null, ties: 0, sampleSize: 500 }]),
    null,
    'heroEquity: null must NEVER coerce to 0 in combineEquitySamples',
  );
  assert.equal(
    combineEquitySamples([{ heroEquity: undefined, sampleSize: 500 }]),
    null,
  );

  // runProgressiveEquity must treat heroEquity: null as terminal (no stage-2 loop, no 0% coercion)
  let calls = 0;
  const snapshots = [];
  const res = await runProgressiveEquity({
    heroCards: ['Ah', 'Kd'],
    boardCards: ['Kh', '7c', '2d'],
    calculateFn: async () => {
      calls += 1;
      return { heroEquity: null, villainEquity: null, sampleSize: 0, blocked: false };
    },
    onProgress: (snap) => snapshots.push(snap),
  });
  assert.equal(calls, 1, 'Null heroEquity must stop after stage 1 without coercing to 0%');
  assert.equal(res.heroEquity, null);
  assert.equal(snapshots[0].heroEquity, null);

  // Source guards for hook null check + live consumption in sandbox.js
  const hookSrc = read('src/hooks/useEquityWorker.js');
  assert.match(hookSrc, /res\.heroEquity != null && Number\.isFinite\(Number\(res\.heroEquity\)\)/);
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(sandbox, /import\s*\{[\s\S]*\buseEquityWorker\b[\s\S]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/src\/hooks\/useEquityWorker'/);
  assert.match(sandbox, /=\s*useEquityWorker\(\{/);
});

test('[P1/P2] BottomSheet supports onBeforeEscape; CardPickerSheet wires Step-2 Escape, mobile role="row", persistent CardSlot ref, and dynamic loading fallbacks', () => {
  const paKit = read('src/components/sandbox/paKit.jsx');
  assert.match(paKit, /\bonBeforeEscape\s*=\s*null/);
  assert.match(paKit, /if\s*\(onBeforeEscapeRef\.current\?\.\(\)\s*===\s*true\)\s*return;/);

  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  // CardPickerSheet mobile Step-2 Escape returns to rank selection via onBeforeEscape
  assert.match(sandbox, /onBeforeEscape=\{\(\) => \{\s*if \(rank != null\) \{\s*setRank\(null\);\s*return true;\s*\}\s*return false;\s*\}\}/);

  // Mobile rank grid and mobile suit grid both wrap role="gridcell" inside role="row" inside role="grid"
  const mobileBlock = sandbox.match(/<div className="deck-mobile-only">([\s\S]*?)<\/div>\s*\n\s*\{\/\* Desktop full 4x13 grid/);
  assert.ok(mobileBlock, 'deck-mobile-only block must exist in CardPickerSheet');
  const mobileRows = mobileBlock[1].match(/role="row"/g) || [];
  assert.ok(mobileRows.length >= 2, `Both mobile rank and suit grids must contain role="row" (found ${mobileRows.length})`);

  // CardSlot keeps a single persistent <button ref={buttonRef}> (never branches between <span> and bare <button>)
  const cardSlotFn = sandbox.match(/function CardSlot\([\s\S]*?\n\}\n/);
  assert.ok(cardSlotFn, 'CardSlot must exist in sandbox.js');
  assert.match(cardSlotFn[0], /const buttonRef = useRef\(null\)/);
  assert.match(cardSlotFn[0], /<button\s+ref=\{buttonRef\}/);
  assert.equal((cardSlotFn[0].match(/\breturn\s*\(/g) || []).length, 1, 'CardSlot must have a single unified return so <button> never unmounts');

  // Dynamic modal imports include accessible loading fallbacks while preserving ssr: false
  for (const mod of [
    'RangeHeatGrid', 'ExportCard', 'RangeExplorer', 'VillainPresetPicker',
    'HandReplay', 'StudyFolders', 'SaveHandModal', 'ShareScenarioModal',
    'ImportHHModal', 'ExternalSolverImport', 'SessionReport', 'SessionAnalytics',
  ]) {
    assert.match(
      sandbox,
      new RegExp(`const ${mod} = dynamic\\([\\s\\S]*?ssr:\\s*false,\\s*loading:`),
      `${mod} dynamic import must keep ssr: false and include a loading fallback`,
    );
  }
});
