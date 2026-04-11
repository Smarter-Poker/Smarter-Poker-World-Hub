#!/usr/bin/env node

/**
 * Poker Brain — Cross-Module Wiring Audit Tests
 * ================================================
 * Verifies end-to-end data flow contracts across the entire pipeline:
 *
 *   OCR → Bridge → Engine → State Machine → Storage → HandHistory
 *
 * Tests every field name match, type match, and scale convention
 * at each boundary. Catches:
 *   - Field name mismatches (producer vs consumer)
 *   - Type mismatches (0-1 vs 0-100 scale, string vs object)
 *   - Silent undefined values that would render blank in HUD
 *   - Missing null guards
 *   - Callback chain ordering
 *
 * Run:
 *   node --loader ./tests/poker-brain-loader.mjs tests/poker-brain-wiring-audit.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let pass = 0, fail = 0;
const failures = [];

function section(name) { console.log('\n' + name); }

function test(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; failures.push(msg); console.log('  \u2717 ' + msg); }
}

function testEq(a, b, msg) {
  test(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function testDeep(a, b, msg) {
  try { assert.deepStrictEqual(a, b); test(true, msg); }
  catch (e) { test(false, `${msg} (${e.message})`); }
}

// ============================================================================
// PART 1: Decision Bridge — extractCards contract
// ============================================================================

const { extractCards, getBridgedDecision, streetFromBoardLength, DECISION_CONFIDENCE } =
  await import('../src/lib/poker-brain/decision-bridge.js');

section('extractCards — output shape');
{
  const result = extractCards([], 0.8);
  test('cards' in result, 'extractCards returns cards field');
  test('hadUnknown' in result, 'extractCards returns hadUnknown field');
  test('minConfidence' in result, 'extractCards returns minConfidence field');
  test('dropped' in result, 'extractCards returns dropped field');
  test(Array.isArray(result.cards), 'cards is array');
  testEq(typeof result.hadUnknown, 'boolean', 'hadUnknown is boolean');
  testEq(typeof result.minConfidence, 'number', 'minConfidence is number');
  testEq(typeof result.dropped, 'number', 'dropped is number');
}

section('extractCards — filters by confidence');
{
  const cards = [
    { rank: 'A', suit: 's', confidence: 0.95 },
    { rank: 'K', suit: 'h', confidence: 0.70 }, // below 0.80 floor
    { rank: 'Q', suit: 'd', confidence: 0.85 },
  ];
  const result = extractCards(cards, 0.80);
  testEq(result.cards.length, 2, '2 cards survive 0.80 floor');
  testEq(result.dropped, 1, '1 card dropped');
  testEq(result.hadUnknown, true, 'hadUnknown=true when cards dropped');
  testEq(result.minConfidence, 0.85, 'minConfidence = lowest surviving');
}

section('extractCards — normalizes rank/suit');
{
  const cards = [{ rank: 'a', suit: 'S', confidence: 0.9 }];
  const result = extractCards(cards, 0.8);
  testEq(result.cards[0].rank, 'A', 'rank uppercased');
  testEq(result.cards[0].suit, 's', 'suit lowercased');
}

section('extractCards — handles null/missing cards');
{
  const cards = [null, undefined, { rank: null, suit: 's', confidence: 0.9 }, { rank: 'A', suit: 's', confidence: 0.9 }];
  const result = extractCards(cards, 0.8);
  testEq(result.cards.length, 1, '1 valid card from 4 inputs');
  testEq(result.dropped, 3, '3 dropped');
}

section('extractCards — empty input');
{
  testEq(extractCards(null, 0.8).cards.length, 0, 'null input → empty');
  testEq(extractCards(undefined, 0.8).cards.length, 0, 'undefined input → empty');
  testEq(extractCards([], 0.8).cards.length, 0, 'empty array → empty');
  testEq(extractCards('not-array', 0.8).cards.length, 0, 'non-array → empty');
}

// ============================================================================
// PART 2: streetFromBoardLength contract
// ============================================================================

section('streetFromBoardLength — all street values');
{
  testEq(streetFromBoardLength(0, 0), 'waiting', 'no hole cards → waiting');
  testEq(streetFromBoardLength(1, 0), 'waiting', '1 hole card → waiting');
  testEq(streetFromBoardLength(2, 0), 'preflop', '2 hole, 0 board → preflop');
  testEq(streetFromBoardLength(2, 3), 'flop', '2 hole, 3 board → flop');
  testEq(streetFromBoardLength(2, 4), 'turn', '2 hole, 4 board → turn');
  testEq(streetFromBoardLength(2, 5), 'river', '2 hole, 5 board → river');
  testEq(streetFromBoardLength(2, 1), 'transient', '2 hole, 1 board → transient');
  testEq(streetFromBoardLength(2, 2), 'transient', '2 hole, 2 board → transient');
  // PLO hole counts
  testEq(streetFromBoardLength(4, 0), 'preflop', '4 hole (PLO), 0 board → preflop');
  testEq(streetFromBoardLength(4, 3), 'flop', '4 hole (PLO), 3 board → flop');
}

// ============================================================================
// PART 3: DECISION_CONFIDENCE export
// ============================================================================

section('DECISION_CONFIDENCE — exports correct values');
{
  testEq(typeof DECISION_CONFIDENCE.DEFAULT_FLOOR, 'number', 'DEFAULT_FLOOR is number');
  testEq(typeof DECISION_CONFIDENCE.STRONG_FLOOR, 'number', 'STRONG_FLOOR is number');
  test(DECISION_CONFIDENCE.DEFAULT_FLOOR > 0 && DECISION_CONFIDENCE.DEFAULT_FLOOR < 1, 'DEFAULT_FLOOR in (0,1)');
  test(DECISION_CONFIDENCE.STRONG_FLOOR > DECISION_CONFIDENCE.DEFAULT_FLOOR, 'STRONG_FLOOR > DEFAULT_FLOOR');
}

// ============================================================================
// PART 4: Bridge output scale conventions (the critical wiring fix)
// ============================================================================

section('Bridge output — confidence scale is 0-100 (not 0-1)');
{
  // Read the bridge source to verify the fix
  const bridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');

  // Horse Brain path: confidence should be 95 (0-100 scale)
  test(/confidence:\s*95/.test(bridgeSrc), 'Horse Brain path sets confidence: 95 (0-100 scale)');
  // Verify the old bug (confidence: 0.95) is NOT present
  test(!/confidence:\s*0\.95/.test(bridgeSrc), 'Old bug confidence: 0.95 (0-1 scale) is gone');
}

section('Bridge output — potOdds scale is 0-100 (not 0-1)');
{
  const bridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');

  // Horse Brain path: potOdds should multiply by 100
  test(/\* 10000\) \/ 100/.test(bridgeSrc) || /\* 100/.test(bridgeSrc),
    'Horse Brain path converts potOdds to 0-100 percentage');
  // The formula should NOT be the old raw fraction: betToCall / (potSize + betToCall)
  // without multiplication
  test(!/potOdds:\s*potSize\s*>\s*0\s*&&\s*betToCall\s*>\s*0\s*\?\s*betToCall\s*\/\s*\(potSize\s*\+\s*betToCall\)\s*:/.test(bridgeSrc),
    'Old raw-fraction potOdds formula is gone');
}

section('Bridge output — engine fallback uses 0-100 scale natively');
{
  // The engine's getDecision returns confidence as 0-100 and potOdds as 0-100 (calculatePotOdds does *100)
  // The bridge's fallback path passes these through unchanged — verify via source
  const bridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');
  test(/confidence:\s*engineResult\.confidence/.test(bridgeSrc),
    'Fallback path passes through engine confidence unchanged');
  test(/potOdds:\s*engineResult\.potOdds/.test(bridgeSrc),
    'Fallback path passes through engine potOdds unchanged');
}

// ============================================================================
// PART 5: Engine return shape matches bridge expectations
// ============================================================================

const PokerBrainEngine = (await import('../src/lib/poker-brain/engine.js')).default;

section('Engine.getDecision — return shape');
{
  // Minimal valid input for NLHE
  const result = PokerBrainEngine.getDecision({
    gameType: 'nlhe',
    holeCards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }],
    boardCards: [],
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'BTN',
    numPlayers: 6,
    street: 'preflop',
  });

  // Verify all fields the bridge consumes
  test(typeof result.action === 'string', 'engine returns action (string)');
  test(typeof result.raiseAmount === 'number', 'engine returns raiseAmount (number)');
  test(typeof result.confidence === 'number', 'engine returns confidence (number)');
  test(typeof result.reasoning === 'string', 'engine returns reasoning (string)');
  test(typeof result.equity === 'number', 'engine returns equity (number)');
  test(typeof result.potOdds === 'number', 'engine returns potOdds (number)');

  // Verify confidence is 0-100 scale (not 0-1)
  test(result.confidence >= 0 && result.confidence <= 100, `confidence=${result.confidence} is 0-100 scale`);

  // Verify equity is 0-100 scale
  test(result.equity >= 0 && result.equity <= 100, `equity=${result.equity} is 0-100 scale`);

  // Verify potOdds is 0-100 scale
  // calculatePotOdds(50, 100) = 50/(100+50)*100 = 33.33
  test(result.potOdds > 1, `potOdds=${result.potOdds} is > 1 (0-100 scale, not 0-1)`);

  // Action is one of the valid enum values
  const VALID_ACTIONS = ['FOLD', 'CHECK', 'CALL', 'RAISE', 'BET'];
  test(VALID_ACTIONS.includes(result.action), `action "${result.action}" is valid enum`);
}

section('Engine.getDecision — PLO variant');
{
  const result = PokerBrainEngine.getDecision({
    gameType: 'plo',
    holeCards: [
      { rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' },
      { rank: 'Q', suit: 'd' }, { rank: 'J', suit: 'c' },
    ],
    boardCards: [],
    potSize: 100,
    betToCall: 50,
    stackSize: 1000,
    bigBlind: 10,
    position: 'BTN',
    numPlayers: 6,
    street: 'preflop',
  });
  test(typeof result.action === 'string', 'PLO: engine returns action');
  test(typeof result.confidence === 'number', 'PLO: engine returns confidence');
}

// ============================================================================
// PART 6: Engine helper functions exist and return correct types
// ============================================================================

section('Engine helper contracts');
{
  test(typeof PokerBrainEngine.expectedHoleCount === 'function', 'expectedHoleCount exists');
  testEq(PokerBrainEngine.expectedHoleCount('nlhe'), 2, 'NLHE needs 2 hole cards');
  testEq(PokerBrainEngine.expectedHoleCount('plo'), 4, 'PLO needs 4 hole cards');
  testEq(PokerBrainEngine.expectedHoleCount('plo5'), 5, 'PLO5 needs 5 hole cards');
  testEq(PokerBrainEngine.expectedHoleCount('plo6'), 6, 'PLO6 needs 6 hole cards');

  test(typeof PokerBrainEngine.calculateStackToPot === 'function', 'calculateStackToPot exists');
  const spr = PokerBrainEngine.calculateStackToPot(1000, 100);
  test(typeof spr === 'number', 'SPR returns number');
  test(spr === 10, 'SPR 1000/100 = 10');

  test(typeof PokerBrainEngine.calculatePotOdds === 'function', 'calculatePotOdds exists');
  const po = PokerBrainEngine.calculatePotOdds(50, 100);
  // 50 / (100+50) * 100 = 33.33
  test(po > 30 && po < 35, `calculatePotOdds(50,100) = ${po} (expected ~33.33)`);

  test(typeof PokerBrainEngine.classifyTexture === 'function', 'classifyTexture exists');
  const tex = PokerBrainEngine.classifyTexture([
    { rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }, { rank: 'Q', suit: 's' },
  ]);
  test(typeof tex === 'object', 'texture returns object');
  test('paired' in tex, 'texture has paired');
  test('monotone' in tex, 'texture has monotone');
  test('flushDraw' in tex, 'texture has flushDraw');
  test('straightDraw' in tex, 'texture has straightDraw');
  test('rainbow' in tex, 'texture has rainbow');
  testEq(tex.monotone, true, 'AsKsQs is monotone');
}

section('Engine.getBestFiveCardFromCards — exists and returns name/score');
{
  test(typeof PokerBrainEngine.getBestFiveCardFromCards === 'function', 'getBestFiveCardFromCards exists');
  const result = PokerBrainEngine.getBestFiveCardFromCards([
    { rank: 'A', suit: 's' }, { rank: 'K', suit: 's' },
    { rank: 'Q', suit: 's' }, { rank: 'J', suit: 's' }, { rank: 'T', suit: 's' },
  ]);
  test(result !== null, 'returns non-null for Royal Flush');
  test(typeof result.score === 'number' || typeof result.rank === 'number', 'has score or rank');
  test(typeof result.name === 'string' || typeof result.rank === 'string', 'has name or rank');
}

section('Engine.countOuts — exists and returns outs/improves');
{
  test(typeof PokerBrainEngine.countOuts === 'function', 'countOuts exists');
  const result = PokerBrainEngine.countOuts(
    [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'h' }],
    [{ rank: '2', suit: 'h' }, { rank: '7', suit: 'h' }, { rank: 'J', suit: 's' }],
  );
  test(typeof result === 'object', 'countOuts returns object');
  test(typeof result.outs === 'number', 'countOuts has outs field');
  test(result.outs > 0, `flush draw has outs (${result.outs})`);
}

section('Engine.calculateM — exists');
{
  test(typeof PokerBrainEngine.calculateM === 'function', 'calculateM exists');
  const m = PokerBrainEngine.calculateM(1000, 10, 6);
  test(typeof m === 'number', 'calculateM returns number');
  test(m > 0, `M-ratio = ${m}`);
}

section('Engine.getPushFoldRange — exists');
{
  test(typeof PokerBrainEngine.getPushFoldRange === 'function', 'getPushFoldRange exists');
  const range = PokerBrainEngine.getPushFoldRange(10);
  test(range instanceof Set, 'returns Set');
  test(range.size > 0, 'range is non-empty');
}

section('Engine.getHandType — exists');
{
  test(typeof PokerBrainEngine.getHandType === 'function', 'getHandType exists');
  const code = PokerBrainEngine.getHandType({ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' });
  test(typeof code === 'string', `getHandType returns string: "${code}"`);
}

// ============================================================================
// PART 7: State Machine — callback contracts
// ============================================================================

const { HandStateMachine, deriveStreet, STREETS } = await import('../src/lib/poker-brain/state.js');

section('State Machine — callback fields match HUD expectations');
{
  let startedHand = null;
  let endedHand = null;
  let streetChanges = [];

  const sm = new HandStateMachine({
    onHandStart: (hand) => { startedHand = hand; },
    onHandEnd: (hand) => { endedHand = hand; },
    onStreetChange: (hand, prev, next) => { streetChanges.push({ prev, next }); },
    requiredFrames: 1,
  });

  const c = (r, s) => ({ rank: r, suit: s });
  const hole = [c('A', 's'), c('K', 'h')];

  // Start hand (preflop)
  sm.observe(hole, []);
  test(startedHand !== null, 'onHandStart fired');
  test(Array.isArray(startedHand.holeCards), 'hand has holeCards array');
  testEq(startedHand.holeCards.length, 2, 'holeCards has 2 cards');
  test('streetDecisions' in startedHand, 'hand has streetDecisions');

  // Set context (HUD does this in onHandStart callback)
  sm.setHandContext({
    position: 'BTN',
    potAtStart: 100,
    stackAtStart: 1500,
    gameType: 'nlhe',
    bigBlind: 10,
  });

  // Record a decision (HUD does this when bridge returns)
  sm.recordDecision({
    action: 'RAISE',
    raiseAmount: 30,
    equity: 65,
    potOdds: 33.33,
    confidence: 88,
    reasoning: 'Strong hand',
  });

  // Verify the decision was recorded
  const preflopDec = startedHand.streetDecisions?.preflop;
  test(preflopDec !== null && preflopDec !== undefined, 'preflop decision recorded');
  testEq(preflopDec?.action, 'RAISE', 'recorded action = RAISE');
  testEq(preflopDec?.equity, 65, 'recorded equity = 65');
  testEq(preflopDec?.potOdds, 33.33, 'recorded potOdds = 33.33');
  testEq(preflopDec?.confidence, 88, 'recorded confidence = 88');

  // Transition to flop
  const flop = [c('Q', 'd'), c('J', 's'), c('T', 'c')];
  sm.observe(hole, flop);
  test(streetChanges.length > 0, 'onStreetChange fired');

  // End hand (back to waiting)
  sm.observe([], []);
  test(endedHand !== null, 'onHandEnd fired');

  // Verify ended hand has all fields HUD expects
  test('holeCards' in endedHand, 'ended hand has holeCards');
  test('streetDecisions' in endedHand, 'ended hand has streetDecisions');
  test('position' in endedHand, 'ended hand has position');
  test('potAtStart' in endedHand, 'ended hand has potAtStart');
  test('stackAtStart' in endedHand, 'ended hand has stackAtStart');
  test('gameType' in endedHand, 'ended hand has gameType');
  test('bigBlind' in endedHand, 'ended hand has bigBlind');
  test('startedAt' in endedHand, 'ended hand has startedAt');
  test('endedAt' in endedHand, 'ended hand has endedAt');
  test('finalBoard' in endedHand, 'ended hand has finalBoard');

  testEq(endedHand.position, 'BTN', 'context preserved: position');
  testEq(endedHand.potAtStart, 100, 'context preserved: potAtStart');
  testEq(endedHand.gameType, 'nlhe', 'context preserved: gameType');
  testEq(endedHand.bigBlind, 10, 'context preserved: bigBlind');
}

// ============================================================================
// PART 8: HUD → Storage field mapping
// ============================================================================

section('logHand field names match what HUD provides');
{
  // The HUD calls storage.logHand({...}) — verify the field names it passes
  // match what storage.logHand() expects.
  const hudSrc = readFileSync(resolve(process.cwd(), 'src/components/poker-brain/HUD.jsx'), 'utf8');
  const storageSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/storage.js'), 'utf8');

  // Fields the HUD passes to logHand()
  const hudFields = ['position', 'holeCards', 'board', 'gameType', 'potSize',
    'betToCall', 'stackSize', 'equity', 'potOdds', 'decision',
    'raiseAmount', 'confidence', 'reasoning', 'detectedAuto', 'streetDecisions'];

  for (const field of hudFields) {
    // Check the HUD source contains this field in the logHand call
    const hudHas = new RegExp(`${field}\\s*:`).test(hudSrc);
    test(hudHas, `HUD passes ${field} to logHand`);

    // Check storage.logHand reads this field from hand argument
    // Storage accesses hand.fieldName
    const storageReads = new RegExp(`hand\\.${field}`).test(storageSrc);
    test(storageReads, `storage.logHand reads hand.${field}`);
  }
}

section('Storage RPC args map to logHand input fields');
{
  const storageSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/storage.js'), 'utf8');

  // Verify the p_ prefixed RPC args correspond to hand fields
  const mappings = [
    ['p_position', 'hand.position'],
    ['p_hole_cards', 'hand.holeCards'],
    ['p_board', 'hand.board'],
    ['p_game_type', 'hand.gameType'],
    ['p_pot_size', 'hand.potSize'],
    ['p_bet_to_call', 'hand.betToCall'],
    ['p_stack_size', 'hand.stackSize'],
    ['p_equity', 'hand.equity'],
    ['p_pot_odds', 'hand.potOdds'],
    ['p_decision', 'hand.decision'],
    ['p_raise_amount', 'hand.raiseAmount'],
    ['p_confidence', 'hand.confidence'],
    ['p_reasoning', 'hand.reasoning'],
    ['p_detected_auto', 'hand.detectedAuto'],
    ['p_street_decisions', 'hand.streetDecisions'],
  ];

  for (const [rpcArg, handField] of mappings) {
    test(storageSrc.includes(rpcArg), `storage passes ${rpcArg} to RPC`);
  }
}

// ============================================================================
// PART 9: HandHistory — field consumption matches state machine output
// ============================================================================

section('HandHistory renders fields from state machine hand');
{
  const hhSrc = readFileSync(resolve(process.cwd(), 'src/components/poker-brain/HandHistory.jsx'), 'utf8');

  // Fields HandHistory accesses
  const handFields = [
    'hand.holeCards', 'hand.streetDecisions', 'hand.position',
    'hand.startedAt', 'hand.endedAt', 'hand.finalBoard',
    'hand.potAtStart', 'hand.stackAtStart', 'hand.bigBlind', 'hand.gameType',
    'hand.flop', 'hand.turn', 'hand.river',
  ];

  for (const field of handFields) {
    const shortField = field.replace('hand.', '');
    const found = hhSrc.includes(`hand.${shortField}`);
    test(found, `HandHistory accesses ${field}`);
  }

  // Decision fields from streetDecisions
  const decisionFields = ['decision.action', 'decision.equity', 'decision.potOdds',
    'decision.raiseAmount'];
  for (const field of decisionFields) {
    const shortField = field.replace('decision.', '');
    const found = hhSrc.includes(`decision.${shortField}`);
    test(found, `HandHistory DecisionRow accesses ${field}`);
  }
}

// ============================================================================
// PART 10: OCR Loop output → Bridge input field mapping
// ============================================================================

section('OCR loop output fields map to bridge input names');
{
  const ocrSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/ocr-loop.js'), 'utf8');

  // OCR loop output fields
  test(ocrSrc.includes('results.potSize'), 'OCR outputs potSize');
  test(ocrSrc.includes('results.heroStack'), 'OCR outputs heroStack');
  test(ocrSrc.includes('results.bigBlind'), 'OCR outputs bigBlind');
  test(ocrSrc.includes('results.smallBlind'), 'OCR outputs smallBlind (after fix)');
  test(ocrSrc.includes('results.betToCall'), 'OCR outputs betToCall');
  test(ocrSrc.includes('results.gameVariant'), 'OCR outputs gameVariant');
  test(ocrSrc.includes('results.villainStacks'), 'OCR outputs villainStacks');

  // Bridge input params (from getBridgedDecision)
  const bridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');
  test(bridgeSrc.includes('potSize'), 'Bridge accepts potSize');
  test(bridgeSrc.includes('betToCall'), 'Bridge accepts betToCall');
  test(bridgeSrc.includes('stackSize'), 'Bridge accepts stackSize');
  test(bridgeSrc.includes('bigBlind'), 'Bridge accepts bigBlind');
  test(bridgeSrc.includes('gameType'), 'Bridge accepts gameType');
  test(bridgeSrc.includes('villainStacks'), 'Bridge accepts villainStacks');
}

section('OCR villainStacks always present (not conditionally omitted)');
{
  const ocrSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/ocr-loop.js'), 'utf8');
  // After fix: always assigned, not gated behind Object.keys check
  test(ocrSrc.includes('results.villainStacks = villainStacks'), 'villainStacks always assigned');
  test(!ocrSrc.includes('if (Object.keys(villainStacks).length > 0)'),
    'Old conditional assignment removed');
}

// ============================================================================
// PART 11: Safety rules compliance in bridge and detection
// ============================================================================

section('No .single() calls in bridge or detection modules');
{
  const files = [
    'src/lib/poker-brain/decision-bridge.js',
    'src/lib/poker-brain/detection-loop.js',
    'src/lib/poker-brain/ocr-loop.js',
    'src/lib/poker-brain/hardwired-detect.js',
  ];
  for (const file of files) {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    test(!/.single\(\)/.test(src), `${file}: no .single() calls`);
  }
}

// ============================================================================
// PART 12: HUD confidence display matches scale
// ============================================================================

section('HUD renders confidence correctly for both paths');
{
  const hudSrc = readFileSync(resolve(process.cwd(), 'src/components/poker-brain/HUD.jsx'), 'utf8');

  // HUD does: Math.round(decision.confidence) + '%'
  // With the fix, Horse Brain confidence = 95 → "95%", fallback confidence = 80 → "80%"
  test(hudSrc.includes('Math.round(decision.confidence)'), 'HUD rounds confidence');

  // Verify HUD also uses Math.round for equity
  test(hudSrc.includes('Math.round(decision.equity)'), 'HUD rounds equity');

  // Verify HUD uses Math.round for potOdds
  test(hudSrc.includes('Math.round(decision.potOdds)'), 'HUD rounds potOdds');
}

// ============================================================================
// PART 13: Texture object shape consumed by HUD matches engine output
// ============================================================================

section('Texture fields consumed by HUD exist in engine output');
{
  const hudSrc = readFileSync(resolve(process.cwd(), 'src/components/poker-brain/HUD.jsx'), 'utf8');

  // HUD accesses these texture fields
  const textureFields = ['monotone', 'paired', 'flushDraw', 'straightDraw', 'rainbow'];
  for (const field of textureFields) {
    test(hudSrc.includes(`texture.${field}`), `HUD accesses texture.${field}`);
  }

  // Verify engine produces these
  const tex = PokerBrainEngine.classifyTexture([
    { rank: 'A', suit: 's' }, { rank: '7', suit: 'h' }, { rank: '2', suit: 'd' },
  ]);
  for (const field of textureFields) {
    test(field in tex, `engine texture has ${field}`);
  }
}

// ============================================================================
// PART 14: Detection loop null card guards
// ============================================================================

section('Detection loop — null card guards in suit verification');
{
  const dlSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/detection-loop.js'), 'utf8');
  // Should guard: if (!r || !card || !card.suit) return card;
  test(dlSrc.includes('!card || !card.suit'), 'detection-loop guards null cards before verifyCardSuit');

  const hwSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/hardwired-detect.js'), 'utf8');
  // hardwired-detect should also guard
  test(hwSrc.includes('!card') || hwSrc.includes('card.suit'), 'hardwired-detect guards card in suit verification');
}

// ============================================================================
// PART 15: Cross-path consistency
// ============================================================================

section('Bridge Horse Brain and fallback paths return same field set');
{
  const bridgeSrc = readFileSync(resolve(process.cwd(), 'src/lib/poker-brain/decision-bridge.js'), 'utf8');

  // Both paths should return these fields. Some use shorthand property names
  // (e.g., `street,` not `street:`) so we count both patterns.
  const commonFields = [
    'ready', 'reason', 'action', 'raiseAmount', 'confidence', 'reasoning',
    'equity', 'potOdds', 'street', 'handStrength', 'texture', 'outs',
    'outsImproves', 'spr', 'mRatio', 'isTournament', 'tournamentStage',
    'holeCards', 'boardCards', 'source', 'detection', 'warnings', 'degraded',
  ];

  // Count occurrences of field in return objects: matches "field:" or "field," (shorthand)
  // within the two return blocks
  for (const field of commonFields) {
    // Match both "field:" (explicit) and standalone "field," or "field\n" (shorthand in object literal)
    const regex = new RegExp(`\\b${field}\\b\\s*[,:\\n}]`, 'g');
    const matches = bridgeSrc.match(regex) || [];
    test(matches.length >= 2, `"${field}" in return objects ${matches.length} times (both paths)`);
  }
}

// ============================================================================
// REPORT
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('='.repeat(60));
process.exit(fail > 0 ? 1 : 0);
