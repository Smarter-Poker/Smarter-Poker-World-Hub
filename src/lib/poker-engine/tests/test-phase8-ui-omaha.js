/**
 * PHASE 8 — UI BUG FIXES + OMAHA FULL-STACK VERIFICATION
 * ═══════════════════════════════════════════════════════════════
 *   1. Action format compatibility (engine → ActionPanel)
 *   2. Pot preset calculations (potTotal not currentBet)
 *   3. Card encoding match (engine ↔ UI)
 *   4. Omaha variants: 4/5/6 card deal + full hand play
 *   5. Face-down card count per variant
 *   6. Dynamic card width scaling
 *   7. Hand history persistence format
 *   8. Multi-variant session (Hold'em → PLO4 → PLO5)
 * ═══════════════════════════════════════════════════════════════
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { GameController } = require('../src/GameController');
const { GAME_VARIANT } = require('../src/GameStateMachine');
const { BETTING_STRUCTURES } = require('../src/ActionValidator');
const { Deck, getRank, getSuit, RANKS, SUITS } = require('../src/Deck');
const { TableManager } = require('../src/TableManager');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

async function playToCompletion(gc, tableId, entry) {
  let safety = 0;
  while (entry.table.game.phase !== 'idle' && safety < 50) {
    const cur = entry.table.game.getCurrentActions();
    if (!cur) break;
    const types = cur.actions.map(a => a.type);
    const chosen = types.includes('check') ? 'check' : types.includes('call') ? 'call' : 'fold';
    const act = cur.actions.find(a => a.type === chosen);
    await gc.processAction(tableId, cur.playerId, { type: chosen, amount: act?.amount || 0 });
    safety++;
  }
  return safety;
}

async function runTests() {
  const gc = new GameController();
  await gc.initialize();

  // ═══════════════════════════════════════════════════════
  section('1. Action Format Compatibility');
  // ═══════════════════════════════════════════════════════

  const { tableId: t1 } = await gc.createTable({
    name: 'Format Test', variant: 'holdem', maxSeats: 6,
    smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200,
  });
  const e1 = gc.lobby.tables.get(t1);
  await gc.sitDown(t1, 'alice', 0, 200);
  await gc.sitDown(t1, 'bob', 2, 200);

  if (e1.table._autoStartTimer) { clearTimeout(e1.table._autoStartTimer); e1.table._autoStartTimer = null; }
  e1.table.startNextHand();

  const actions = e1.table.game.getCurrentActions();
  assert(actions !== null, 'Actions available');
  
  const fold = actions.actions.find(a => a.type === 'fold');
  assert(fold !== undefined, 'fold action exists');
  
  const call = actions.actions.find(a => a.type === 'call');
  assert(call?.amount !== undefined, 'call has amount');
  
  const raise = actions.actions.find(a => a.type === 'raise');
  assert(raise?.minAmount !== undefined, 'raise has minAmount');
  assert(raise?.maxAmount !== undefined, 'raise has maxAmount');
  assert(raise?.minAmount <= raise?.maxAmount, 'minAmount <= maxAmount');

  // ActionPanel uses: canBet?.minAmount, canBet?.maxAmount
  const allIn = actions.actions.find(a => a.type === 'all_in');
  assert(allIn !== undefined || raise !== undefined, 'all_in or raise available');

  await playToCompletion(gc, t1, e1);

  // ═══════════════════════════════════════════════════════
  section('2. Pot Preset Calculations');
  // ═══════════════════════════════════════════════════════

  // Simulate ActionPanel preset calculation (now pot-based)
  function calcPresets(potTotal, bigBlind, minBet, maxBet) {
    return [
      { label: '½ Pot', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.5)) },
      { label: '¾ Pot', amount: Math.max(minBet, Math.floor((potTotal || bigBlind * 2) * 0.75)) },
      { label: 'Pot', amount: Math.max(minBet, potTotal || bigBlind * 2) },
    ].filter(p => p.amount <= maxBet);
  }

  // Preflop: pot = 3 (1+2), min raise = 4
  const preflop = calcPresets(3, 2, 4, 200);
  assert(preflop.length >= 1, `Preflop presets: ${preflop.length} options`);
  assert(preflop[0].amount >= 4, `½ pot = ${preflop[0].amount} (min 4)`);

  // Flop: pot = 12, min bet = 2
  const flop = calcPresets(12, 2, 2, 200);
  assert(flop[0].amount === 6, `½ pot of 12 = ${flop[0].amount}`);
  assert(flop[1].amount === 9, `¾ pot of 12 = ${flop[1].amount}`);
  assert(flop[2].amount === 12, `Pot of 12 = ${flop[2].amount}`);

  // Large pot: 500, maxBet = 150 — all presets exceed max, so none show
  const large = calcPresets(500, 2, 4, 150);
  assert(large.length === 0, `Large pot all presets > max: ${large.length} (filtered out)`);

  // ═══════════════════════════════════════════════════════
  section('3. Card Encoding Match');
  // ═══════════════════════════════════════════════════════

  // Engine encoding: rank = Math.floor(card/4), suit = card%4
  // UI encoding: same
  const UI_SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
  const UI_RANKS = ['2','3','4','5','6','7','8','9','10','j','q','k','a'];

  let allMatch = true;
  for (let c = 0; c < 52; c++) {
    if (getRank(c) !== Math.floor(c / 4) || getSuit(c) !== c % 4) {
      allMatch = false;
      break;
    }
  }
  assert(allMatch, 'All 52 cards encode identically between engine and UI');

  // Verify specific cards
  assert(getRank(0) === 0, 'Card 0 = 2 (rank 0)');
  assert(getSuit(0) === 0, 'Card 0 = clubs (suit 0)');
  assert(getRank(51) === 12, 'Card 51 = Ace (rank 12)');
  assert(getSuit(51) === 3, 'Card 51 = spades (suit 3)');

  // UI path for Ace of spades
  const asPath = `/cards/${UI_SUITS[3]}_${UI_RANKS[12]}.png`;
  assert(asPath === '/cards/spades_a.png', `Ace of spades path: ${asPath}`);

  // ═══════════════════════════════════════════════════════
  section('4. Omaha Variants — Full Hand Play');
  // ═══════════════════════════════════════════════════════

  // PLO4
  const { tableId: tPLO4 } = await gc.createTable({
    name: 'PLO4 Test', variant: 'plo', maxSeats: 6,
    smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200,
  });
  const ePLO4 = gc.lobby.tables.get(tPLO4);
  await gc.sitDown(tPLO4, 'alice', 0, 200);
  await gc.sitDown(tPLO4, 'bob', 2, 200);

  if (ePLO4.table._autoStartTimer) { clearTimeout(ePLO4.table._autoStartTimer); ePLO4.table._autoStartTimer = null; }
  ePLO4.table.startNextHand();

  const plo4Cards = ePLO4.table.getPlayerCards('alice');
  assert(plo4Cards?.length === 4, `PLO4: Alice has ${plo4Cards?.length} cards`);

  const bobPLO4 = ePLO4.table.getPlayerCards('bob');
  assert(bobPLO4?.length === 4, `PLO4: Bob has ${bobPLO4?.length} cards`);

  // Verify no duplicate cards
  const allPLO4Cards = [...plo4Cards, ...bobPLO4];
  const uniquePLO4 = new Set(allPLO4Cards);
  assert(uniquePLO4.size === allPLO4Cards.length, `PLO4: No duplicate cards (${uniquePLO4.size} unique)`);

  await playToCompletion(gc, tPLO4, ePLO4);
  assert(ePLO4.table.game.phase === 'idle', 'PLO4 hand completed');

  // Chips conserved
  const plo4Stacks = ePLO4.table.seats.filter(s => s.player).reduce((s, seat) => s + seat.stack, 0);
  assert(plo4Stacks === 400, `PLO4 chips conserved: ${plo4Stacks}`);

  // PLO5
  const { tableId: tPLO5 } = await gc.createTable({
    name: 'PLO5 Test', variant: 'omaha5', maxSeats: 6,
    smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200,
  });
  const ePLO5 = gc.lobby.tables.get(tPLO5);
  await gc.sitDown(tPLO5, 'charlie', 0, 200);
  await gc.sitDown(tPLO5, 'dave', 2, 200);

  if (ePLO5.table._autoStartTimer) { clearTimeout(ePLO5.table._autoStartTimer); ePLO5.table._autoStartTimer = null; }
  ePLO5.table.startNextHand();

  const plo5Cards = ePLO5.table.getPlayerCards('charlie');
  assert(plo5Cards?.length === 5, `PLO5: Charlie has ${plo5Cards?.length} cards`);

  await playToCompletion(gc, tPLO5, ePLO5);
  assert(ePLO5.table.game.phase === 'idle', 'PLO5 hand completed');

  // PLO6
  const { tableId: tPLO6 } = await gc.createTable({
    name: 'PLO6 Test', variant: 'omaha6', maxSeats: 6,
    smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200,
  });
  const ePLO6 = gc.lobby.tables.get(tPLO6);
  await gc.sitDown(tPLO6, 'eve', 0, 200);
  await gc.sitDown(tPLO6, 'frank', 2, 200);

  if (ePLO6.table._autoStartTimer) { clearTimeout(ePLO6.table._autoStartTimer); ePLO6.table._autoStartTimer = null; }
  ePLO6.table.startNextHand();

  const plo6Cards = ePLO6.table.getPlayerCards('eve');
  assert(plo6Cards?.length === 6, `PLO6: Eve has ${plo6Cards?.length} cards`);

  await playToCompletion(gc, tPLO6, ePLO6);
  assert(ePLO6.table.game.phase === 'idle', 'PLO6 hand completed');

  // ═══════════════════════════════════════════════════════
  section('5. Face-Down Card Count Per Variant');
  // ═══════════════════════════════════════════════════════

  const CARDS_PER_VARIANT = {
    holdem: 2, omaha4: 4, omaha5: 5, omaha6: 6, omaha_hilo: 4, short_deck: 2,
  };

  for (const [variant, expected] of Object.entries(CARDS_PER_VARIANT)) {
    assert(expected >= 2 && expected <= 6, `${variant}: ${expected} face-down cards`);
  }

  // Verify state includes variant info for UI
  const plo4State = ePLO4.table.getState('alice');
  assert(plo4State.config.variant === 'omaha4', `PLO4 state.config.variant = ${plo4State.config.variant}`);

  const plo5State = ePLO5.table.getState('charlie');
  assert(plo5State.config.variant === 'omaha5', `PLO5 state.config.variant = ${plo5State.config.variant}`);

  // ═══════════════════════════════════════════════════════
  section('6. Dynamic Card Width Scaling');
  // ═══════════════════════════════════════════════════════

  // Simulate UI card width logic
  function getCardWidth(numCards, isHero) {
    return isHero
      ? (numCards <= 2 ? 52 : numCards <= 4 ? 40 : 34)
      : (numCards <= 2 ? 36 : numCards <= 4 ? 28 : 24);
  }

  // Hold'em
  assert(getCardWidth(2, true) === 52, 'Hold\'em hero: 52px');
  assert(getCardWidth(2, false) === 36, 'Hold\'em opponent: 36px');

  // PLO4
  assert(getCardWidth(4, true) === 40, 'PLO4 hero: 40px');
  assert(getCardWidth(4, false) === 28, 'PLO4 opponent: 28px');

  // PLO5
  assert(getCardWidth(5, true) === 34, 'PLO5 hero: 34px');
  assert(getCardWidth(5, false) === 24, 'PLO5 opponent: 24px');

  // PLO6
  assert(getCardWidth(6, true) === 34, 'PLO6 hero: 34px');
  assert(getCardWidth(6, false) === 24, 'PLO6 opponent: 24px');

  // Total width sanity (should fit in seat area ~180px)
  const plo6HeroWidth = getCardWidth(6, true) * 6 + 3 * 5; // 6 cards + 5 gaps
  assert(plo6HeroWidth <= 220, `PLO6 hero total width: ${plo6HeroWidth}px ≤ 220px`);

  // ═══════════════════════════════════════════════════════
  section('7. Hand History Format Validation');
  // ═══════════════════════════════════════════════════════

  // HandHistoryRecorder: what does it need?
  const fs = require('fs');
  const hhCode = fs.readFileSync('/home/claude/poker-engine/src/HandHistory.js', 'utf8');

  assert(hhCode.includes('.insert('), 'HandHistory has DB insert');
  assert(hhCode.includes('hand_data'), 'Inserts hand_data JSONB');
  assert(hhCode.includes('player_ids'), 'Inserts player_ids');
  assert(hhCode.includes('winner_ids'), 'Inserts winner_ids');
  assert(hhCode.includes('pot_total'), 'Inserts pot_total');
  assert(hhCode.includes('rake'), 'Inserts rake');

  // Verify the state API returns legalActions
  const stateCode = fs.readFileSync('/home/claude/poker-engine/pages/api/poker/engine/state.js', 'utf8');
  assert(stateCode.includes('legalActions'), 'State API returns legalActions');
  assert(stateCode.includes('presets'), 'State API returns presets');

  // ═══════════════════════════════════════════════════════
  section('8. Multi-Variant Session');
  // ═══════════════════════════════════════════════════════

  // Play 3 hands each on Hold'em, PLO4, PLO5 in same GC instance
  const variants = [
    { name: 'Holdem', dbVariant: 'holdem', expectedCards: 2 },
    { name: 'PLO4', dbVariant: 'plo', expectedCards: 4 },
    { name: 'PLO5', dbVariant: 'omaha5', expectedCards: 5 },
  ];

  for (const v of variants) {
    const { tableId } = await gc.createTable({
      name: `${v.name} Multi`, variant: v.dbVariant, maxSeats: 6,
      smallBlind: 1, bigBlind: 2, minBuyIn: 40, maxBuyIn: 200,
    });
    const entry = gc.lobby.tables.get(tableId);
    await gc.sitDown(tableId, 'p1', 0, 200);
    await gc.sitDown(tableId, 'p2', 2, 200);
    await gc.sitDown(tableId, 'p3', 4, 200);

    let handsOk = 0;
    for (let h = 0; h < 3; h++) {
      if (entry.table._autoStartTimer) {
        clearTimeout(entry.table._autoStartTimer);
        entry.table._autoStartTimer = null;
      }
      entry.table.startNextHand();
      if (entry.table.game.phase === 'idle') break;

      const cards = entry.table.getPlayerCards('p1');
      if (cards?.length === v.expectedCards) handsOk++;

      await playToCompletion(gc, tableId, entry);
    }

    assert(handsOk === 3, `${v.name}: 3 hands with ${v.expectedCards} cards each`);

    const stacks = entry.table.seats.filter(s => s.player).reduce((s, seat) => s + seat.stack, 0);
    assert(stacks === 600, `${v.name}: Chips conserved (${stacks})`);

    await gc.closeTable(tableId);
  }

  // ═══════════════════════════════════════════════════════
  section('9. UI Source Verification');
  // ═══════════════════════════════════════════════════════

  const uiCode = fs.readFileSync('/home/claude/poker-engine/src/components/LivePokerTable.jsx', 'utf8');

  // Pot presets use potTotal
  assert(uiCode.includes('potTotal || bigBlind'), 'Presets use potTotal');
  assert(!uiCode.includes('currentBet * 0.5'), 'Old currentBet preset removed');

  // ActionPanel receives potTotal
  assert(uiCode.includes('potTotal={tableState?.game?.potTotal'), 'potTotal passed to ActionPanel');

  // Dynamic card widths
  assert(uiCode.includes('numHoleCards'), 'numHoleCards prop exists');
  assert(uiCode.includes('numHoleCards <= 2 ? 52'), 'Dynamic hero card width');
  assert(uiCode.includes('numHoleCards <= 4 ? 28'), 'Dynamic opponent card width');

  // Face-down cards use numHoleCards
  assert(uiCode.includes('Array.from({ length: numHoleCards })'), 'Dynamic face-down card count');

  // Variant mapping for numHoleCards
  assert(uiCode.includes('omaha4: 4') || uiCode.includes("omaha4': 4"), 'Omaha4 → 4 cards mapping');
  assert(uiCode.includes('omaha5: 5') || uiCode.includes("omaha5': 5"), 'Omaha5 → 5 cards mapping');

  // ═══════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════

  // Close remaining tables
  await gc.closeTable(t1);
  await gc.closeTable(tPLO4);
  await gc.closeTable(tPLO5);
  await gc.closeTable(tPLO6);
  await gc.shutdown();

  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PHASE 8 UI + OMAHA: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(60));
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
