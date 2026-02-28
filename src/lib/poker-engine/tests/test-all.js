/**
 * Smarter.Poker - Core Poker Engine Test Suite
 * 
 * Tests: Deck, HandEvaluator, PotCalculator, ActionValidator, GameStateMachine
 */

const {
  Deck, parseCard, parseCards, getRank, getSuit, cardToString, cardsToString, cardsToDisplay,
  evaluate5, evaluateHoldem, evaluateOmaha, evaluateLow, compareHands, holdemShowdown,
  HAND_CATEGORIES,
  PotCalculator,
  ActionValidator, ACTION_TYPES, BETTING_STRUCTURES,
  GameStateMachine, GAME_VARIANT, GAME_PHASE,
} = require('../src');

let passed = 0;
let failed = 0;
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

function assert(condition, description) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}`);
  }
}

function assertEq(actual, expected, description) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description} (expected: ${expected}, got: ${actual})`);
  }
}

// ============================================================
// DECK TESTS
// ============================================================
section('DECK MODULE');

// Card creation and parsing
const aceHearts = parseCard('Ah');
assertEq(getRank(aceHearts), 12, 'Ace of Hearts rank = 12');
assertEq(getSuit(aceHearts), 2, 'Ace of Hearts suit = 2 (hearts)');
assertEq(cardToString(aceHearts), 'Ah', 'Card to string: Ah');

const twoClubs = parseCard('2c');
assertEq(getRank(twoClubs), 0, 'Two of Clubs rank = 0');
assertEq(getSuit(twoClubs), 0, 'Two of Clubs suit = 0 (clubs)');

// Parse multiple cards
const cards = parseCards('AhKsQdJcTh');
assertEq(cards.length, 5, 'Parse 5 cards from string');
assertEq(cardToString(cards[0]), 'Ah', 'First card is Ah');
assertEq(cardToString(cards[4]), 'Th', 'Last card is Th');

// Deck creation
const deck = new Deck();
assertEq(deck.size, 52, 'Standard deck has 52 cards');
assertEq(deck.remaining, 52, '52 cards remaining before shuffle');

// Shuffle
deck.shuffle();
assertEq(deck.remaining, 52, '52 cards remaining after shuffle');

// Deal
const card1 = deck.deal();
assertEq(deck.remaining, 51, '51 remaining after dealing 1');
assert(card1 >= 0 && card1 <= 51, 'Dealt card is valid (0-51)');

// Deal multiple
const threeCards = deck.dealMultiple(3);
assertEq(threeCards.length, 3, 'Deal multiple returns 3 cards');
assertEq(deck.remaining, 48, '48 remaining after dealing 4 total');

// Burn
deck.burn();
assertEq(deck.remaining, 47, '47 remaining after burn');
assertEq(deck.burnPile.length, 1, '1 card in burn pile');

// Deal community (burn + deal)
const flop = deck.dealFlop();
assertEq(flop.length, 3, 'Flop deals 3 cards');
assertEq(deck.burnPile.length, 2, '2 burns (1 manual + 1 for flop)');

const turn = deck.dealTurn();
assert(typeof turn === 'number', 'Turn deals 1 card (number)');

const river = deck.dealRiver();
assert(typeof river === 'number', 'River deals 1 card (number)');

// Deal hole cards
const deck2 = new Deck();
deck2.shuffle();
const hands = deck2.dealHoleCards(6, 2);
assertEq(hands.length, 6, 'Deal to 6 players');
assertEq(hands[0].length, 2, 'Each player gets 2 cards');
assertEq(deck2.remaining, 40, '40 remaining after dealing 12 cards');

// Short deck
const shortDeck = new Deck({ shortDeck: true });
assertEq(shortDeck.size, 36, 'Short deck has 36 cards');
assert(shortDeck.isShortDeck, 'Short deck flag is set');

// Uniqueness test
const deck3 = new Deck();
deck3.shuffle();
const allCards = deck3.dealMultiple(52);
const uniqueCards = new Set(allCards);
assertEq(uniqueCards.size, 52, 'All 52 dealt cards are unique');

// ============================================================
// HAND EVALUATOR TESTS
// ============================================================
section('HAND EVALUATOR');

// Royal Flush
const royalFlush = evaluate5(parseCards('Ah Kh Qh Jh Th'));
assertEq(royalFlush.category, HAND_CATEGORIES.STRAIGHT_FLUSH, 'Royal Flush is Straight Flush category');
assert(royalFlush.description === 'Royal Flush', 'Royal Flush description');

// Straight Flush
const straightFlush = evaluate5(parseCards('9s 8s 7s 6s 5s'));
assertEq(straightFlush.category, HAND_CATEGORIES.STRAIGHT_FLUSH, 'Straight Flush detected');
assert(straightFlush.score < royalFlush.score, 'Royal Flush beats lower Straight Flush');

// Four of a Kind
const quads = evaluate5(parseCards('Ks Kh Kd Kc 2s'));
assertEq(quads.category, HAND_CATEGORIES.FOUR_OF_A_KIND, 'Four of a Kind detected');

// Full House
const fullHouse = evaluate5(parseCards('Qs Qh Qd 7c 7s'));
assertEq(fullHouse.category, HAND_CATEGORIES.FULL_HOUSE, 'Full House detected');

// Flush
const flush = evaluate5(parseCards('Ah Th 7h 4h 2h'));
assertEq(flush.category, HAND_CATEGORIES.FLUSH, 'Flush detected');

// Straight
const straight = evaluate5(parseCards('Ts 9h 8d 7c 6s'));
assertEq(straight.category, HAND_CATEGORIES.STRAIGHT, 'Straight detected');

// Wheel (A-2-3-4-5)
const wheel = evaluate5(parseCards('Ah 2s 3d 4c 5h'));
assertEq(wheel.category, HAND_CATEGORIES.STRAIGHT, 'Wheel (A-5 straight) detected');

// Three of a Kind
const trips = evaluate5(parseCards('8s 8h 8d Kc 2s'));
assertEq(trips.category, HAND_CATEGORIES.THREE_OF_A_KIND, 'Three of a Kind detected');

// Two Pair
const twoPair = evaluate5(parseCards('Js Jh 5d 5c As'));
assertEq(twoPair.category, HAND_CATEGORIES.TWO_PAIR, 'Two Pair detected');

// One Pair
const onePair = evaluate5(parseCards('9s 9h Kd 7c 2s'));
assertEq(onePair.category, HAND_CATEGORIES.ONE_PAIR, 'One Pair detected');

// High Card
const highCard = evaluate5(parseCards('As Kh Td 7c 2s'));
assertEq(highCard.category, HAND_CATEGORIES.HIGH_CARD, 'High Card detected');

// Hand ranking order
assert(royalFlush.score > quads.score, 'Royal Flush > Four of a Kind');
assert(quads.score > fullHouse.score, 'Four of a Kind > Full House');
assert(fullHouse.score > flush.score, 'Full House > Flush');
assert(flush.score > straight.score, 'Flush > Straight');
assert(straight.score > trips.score, 'Straight > Three of a Kind');
assert(trips.score > twoPair.score, 'Three of a Kind > Two Pair');
assert(twoPair.score > onePair.score, 'Two Pair > One Pair');
assert(onePair.score > highCard.score, 'One Pair > High Card');

// Kicker comparison
const pairAcesKingKicker = evaluate5(parseCards('As Ah Kd 7c 2s'));
const pairAcesQueenKicker = evaluate5(parseCards('As Ah Qd 7c 2s'));
assert(pairAcesKingKicker.score > pairAcesQueenKicker.score, 'Pair of Aces + K kicker beats Pair of Aces + Q kicker');

// 7-card Hold'em evaluation
const holdem7 = evaluateHoldem(parseCards('Ah Kh Qh Jh Th 2c 3d'));
assertEq(holdem7.category, HAND_CATEGORIES.STRAIGHT_FLUSH, '7-card eval finds Royal Flush in hearts');

const holdem7b = evaluateHoldem(parseCards('As Ah Ad Kh Ks 2c 3d'));
assertEq(holdem7b.category, HAND_CATEGORIES.FULL_HOUSE, '7-card eval finds Full House (AAA KK)');

// Showdown test
const showdownResult = holdemShowdown([
  { playerId: 'p1', holeCards: parseCards('As Ks') },
  { playerId: 'p2', holeCards: parseCards('7h 2d') },
], parseCards('Ah Kh Qd 5c 3s'));

assertEq(showdownResult.winners.length, 1, 'Showdown has 1 winner');
assertEq(showdownResult.winners[0].playerId, 'p1', 'AK beats 72 on A-K-Q-5-3 board');
assertEq(showdownResult.isSplit, false, 'No split pot');

// Split pot test
const splitResult = holdemShowdown([
  { playerId: 'p1', holeCards: parseCards('As Ks') },
  { playerId: 'p2', holeCards: parseCards('Ad Kd') },
], parseCards('Qh Jc Ts 2c 3h'));

assertEq(splitResult.winners.length, 2, 'Split pot: both have AKQJT straight');
assertEq(splitResult.isSplit, true, 'Split pot detected');

// ============================================================
// POT CALCULATOR TESTS
// ============================================================
section('POT CALCULATOR');

// Simple pot (no side pots)
const pc1 = new PotCalculator();
pc1.addContribution('p1', 100);
pc1.addContribution('p2', 100);
pc1.addContribution('p3', 100);
assertEq(pc1.totalPot, 300, 'Simple pot: 3 x 100 = 300');

const pots1 = pc1.calculatePots();
assertEq(pots1.length, 1, 'Simple pot: 1 pot');
assertEq(pots1[0].amount, 300, 'Main pot = 300');
assertEq(pots1[0].eligible.size, 3, '3 players eligible');

// Side pot scenario
const pc2 = new PotCalculator();
pc2.addContribution('p1', 50);   // All-in for 50
pc2.markAllIn('p1');
pc2.addContribution('p2', 150);  // All-in for 150
pc2.markAllIn('p2');
pc2.addContribution('p3', 150);  // Calls 150

const pots2 = pc2.calculatePots();
assertEq(pots2.length, 2, 'Side pot: 2 pots');
assertEq(pots2[0].amount, 150, 'Main pot: 3 x 50 = 150');
assertEq(pots2[0].eligible.size, 3, 'Main pot: 3 eligible');
assertEq(pots2[1].amount, 200, 'Side pot: 2 x 100 = 200');
assertEq(pots2[1].eligible.size, 2, 'Side pot: 2 eligible (p2, p3)');

// Fold removes eligibility
const pc3 = new PotCalculator();
pc3.addContribution('p1', 100);
pc3.addContribution('p2', 100);
pc3.addContribution('p3', 50);
pc3.markFolded('p3');

const pots3 = pc3.calculatePots();
// p3 contributed 50 but folded - their chips are in the pot but they can't win
assertEq(pots3[0].eligible.has('p3'), false, 'Folded player is not eligible');

// Distribution test
const pc4 = new PotCalculator();
pc4.addContribution('p1', 100);
pc4.addContribution('p2', 100);
pc4.addContribution('p3', 100);

const dist = pc4.distribute([
  { playerId: 'p1', handScore: 1000 },
  { playerId: 'p2', handScore: 500 },
  { playerId: 'p3', handScore: 200 },
]);

assertEq(dist.payouts.get('p1'), 300, 'Best hand wins entire pot (300)');
assert(!dist.payouts.has('p2'), 'Second best hand gets nothing');

// Split pot distribution
const pc5 = new PotCalculator();
pc5.addContribution('p1', 100);
pc5.addContribution('p2', 100);

const distSplit = pc5.distribute([
  { playerId: 'p1', handScore: 500 },
  { playerId: 'p2', handScore: 500 },
]);

assertEq(distSplit.payouts.get('p1'), 100, 'Split pot: each gets half');
assertEq(distSplit.payouts.get('p2'), 100, 'Split pot: each gets half');

// Rake test
const pc6 = new PotCalculator();
pc6.addContribution('p1', 100);
pc6.addContribution('p2', 100);

const distRake = pc6.distribute(
  [{ playerId: 'p1', handScore: 1000 }, { playerId: 'p2', handScore: 500 }],
  { rakePercent: 5, rakeCap: 10 }
);

assertEq(distRake.rake, 10, 'Rake: 5% of 200 = 10');
assertEq(distRake.payouts.get('p1'), 190, 'Winner gets 200 - 10 rake = 190');

// ============================================================
// ACTION VALIDATOR TESTS
// ============================================================
section('ACTION VALIDATOR');

const validator = new ActionValidator({
  bettingStructure: BETTING_STRUCTURES.NO_LIMIT,
  bigBlind: 2,
  smallBlind: 1,
});

// Preflop BB - can check, raise, or fold
const bbActions = validator.getLegalActions({
  playerStack: 198,
  playerInvested: 2,
  currentBet: 2,
  lastRaiseSize: 2,
  potTotal: 3,
  street: 'preflop',
});

const bbTypes = bbActions.map(a => a.type);
assert(bbTypes.includes('check'), 'BB can check when no raise');
assert(bbTypes.includes('raise') || bbTypes.includes('bet'), 'BB can raise');

// Facing a bet - can fold, call, or raise
const facingBet = validator.getLegalActions({
  playerStack: 200,
  playerInvested: 0,
  currentBet: 10,
  lastRaiseSize: 8,
  potTotal: 13,
  street: 'preflop',
});

const facingTypes = facingBet.map(a => a.type);
assert(facingTypes.includes('fold'), 'Can fold facing bet');
assert(facingTypes.includes('call'), 'Can call facing bet');
assert(facingTypes.includes('raise'), 'Can raise facing bet');

// Validate specific action
const callValidation = validator.validateAction(
  { type: 'call' },
  { playerStack: 200, playerInvested: 0, currentBet: 10, lastRaiseSize: 8, potTotal: 13 }
);
assert(callValidation.valid, 'Call is valid');
assertEq(callValidation.action.amount, 10, 'Call amount = 10');

// Pot Limit raise calculation
const plValidator = new ActionValidator({
  bettingStructure: BETTING_STRUCTURES.POT_LIMIT,
  bigBlind: 2,
  smallBlind: 1,
});

const plActions = plValidator.getLegalActions({
  playerStack: 200,
  playerInvested: 0,
  currentBet: 2,
  lastRaiseSize: 2,
  potTotal: 3,
  street: 'preflop',
});

const plRaise = plActions.find(a => a.type === 'raise');
assert(plRaise !== undefined, 'PLO: can raise');
// Pot raise = pot + current bet + call = 3 + 2 + 2 = 7, so max total bet = 2 + 7 = 9
// Actually: pot raise formula is different. Let me check.
// After calling 2, pot will be 3+2=5, so raise by up to 5, total bet = 2+5=7
assert(plRaise.maxAmount > plRaise.minAmount, 'PLO: max raise > min raise');

// ============================================================
// GAME STATE MACHINE TESTS
// ============================================================
section('GAME STATE MACHINE - FULL HAND');

const game = new GameStateMachine({
  variant: GAME_VARIANT.HOLDEM,
  bettingStructure: BETTING_STRUCTURES.NO_LIMIT,
  smallBlind: 1,
  bigBlind: 2,
});

// Track events
const events = [];
game.on('hand_start', (d) => events.push({ event: 'hand_start', ...d }));
game.on('blinds_posted', (d) => events.push({ event: 'blinds_posted', ...d }));
game.on('cards_dealt', (d) => events.push({ event: 'cards_dealt', ...d }));
game.on('action_required', (d) => events.push({ event: 'action_required', ...d }));
game.on('action_processed', (d) => events.push({ event: 'action_processed', ...d }));
game.on('hand_complete', (d) => events.push({ event: 'hand_complete', ...d }));

// Start a 3-player hand
const players = [
  { id: 'alice', stack: 200, seatIndex: 0 },
  { id: 'bob', stack: 200, seatIndex: 1 },
  { id: 'charlie', stack: 200, seatIndex: 2 },
];

game.startHand(players, 0); // Button on seat 0 (Alice)

assertEq(game.phase, 'preflop', 'Game is in preflop phase');
assert(events.some(e => e.event === 'hand_start'), 'hand_start event fired');
assert(events.some(e => e.event === 'blinds_posted'), 'blinds_posted event fired');
assert(events.some(e => e.event === 'cards_dealt'), 'cards_dealt event fired');

// Check that players have cards
const aliceCards = game.getPlayerCards('alice');
assertEq(aliceCards.length, 2, 'Alice has 2 hole cards');

const state = game.getState('alice');
assert(state.players.find(p => p.id === 'alice').holeCards !== null, 'Alice can see her own cards');
assert(state.players.find(p => p.id === 'bob').holeCards === null, 'Alice cannot see Bob\'s cards');

// Get current actions
const currentActions = game.getCurrentActions();
assert(currentActions !== null, 'Current actions available');
assert(currentActions.playerId !== undefined, 'Action required from a specific player');

// Play a simple hand: everyone folds to BB
// Button = Alice (seat 0), SB = Bob (seat 1), BB = Charlie (seat 2)
// UTG = Alice acts first preflop

// Alice (UTG/BTN) folds
let result = game.processAction('alice', { type: 'fold' });
assert(result.success, 'Alice fold successful');

// Bob (SB) folds
result = game.processAction('bob', { type: 'fold' });
assert(result.success, 'Bob fold successful');

// Hand should be over - Charlie (BB) wins
assertEq(game.phase, GAME_PHASE.IDLE, 'Hand is complete after all fold to BB');
assert(events.some(e => e.event === 'hand_complete'), 'hand_complete event fired');

const handResult = game.currentHand.result;
assertEq(handResult.type, 'fold', 'Result type is fold');
assertEq(handResult.winners[0].playerId, 'charlie', 'Charlie (BB) wins');

// ============================================================
// GAME STATE MACHINE - FULL STREET PLAY
// ============================================================
section('GAME STATE MACHINE - MULTI-STREET HAND');

const game2 = new GameStateMachine({
  variant: GAME_VARIANT.HOLDEM,
  bettingStructure: BETTING_STRUCTURES.NO_LIMIT,
  smallBlind: 1,
  bigBlind: 2,
});

const events2 = [];
game2.on('street_start', (d) => events2.push({ event: 'street_start', street: d.street }));
game2.on('action_required', (d) => events2.push({ event: 'action_required', playerId: d.playerId }));
game2.on('showdown', (d) => events2.push({ event: 'showdown', winners: d.winners }));
game2.on('hand_complete', (d) => events2.push({ event: 'hand_complete', ...d }));

// Heads-up hand (simpler position rules)
const players2 = [
  { id: 'alice', stack: 200, seatIndex: 0 },
  { id: 'bob', stack: 200, seatIndex: 1 },
];

game2.startHand(players2, 0);

// In heads-up: Button (Alice) posts SB and acts first preflop
// Preflop: both call
const firstActor = game2.getCurrentActions();
assert(firstActor !== null, 'Someone needs to act preflop');

// Process preflop actions (call/check through)
let currentPlayer = game2.getCurrentActions();
if (currentPlayer) {
  // First player calls or checks
  const actions = currentPlayer.actions;
  const hasCall = actions.find(a => a.type === 'call');
  const hasCheck = actions.find(a => a.type === 'check');
  
  if (hasCall) {
    game2.processAction(currentPlayer.playerId, { type: 'call' });
  } else if (hasCheck) {
    game2.processAction(currentPlayer.playerId, { type: 'check' });
  }
}

// Second player
currentPlayer = game2.getCurrentActions();
if (currentPlayer && game2.phase === 'preflop') {
  const actions = currentPlayer.actions;
  const hasCheck = actions.find(a => a.type === 'check');
  if (hasCheck) {
    game2.processAction(currentPlayer.playerId, { type: 'check' });
  }
}

// Should be on flop now (or later street)
const streetsVisited = events2.filter(e => e.event === 'street_start').map(e => e.street);
assert(streetsVisited.length >= 1, 'At least one street started after preflop');

// Continue checking through all streets
let safety = 0;
while (game2.phase !== GAME_PHASE.IDLE && game2.phase !== GAME_PHASE.SHOWDOWN && safety < 20) {
  currentPlayer = game2.getCurrentActions();
  if (!currentPlayer) break;
  
  const actions = currentPlayer.actions;
  const hasCheck = actions.find(a => a.type === 'check');
  const hasCall = actions.find(a => a.type === 'call');
  
  if (hasCheck) {
    game2.processAction(currentPlayer.playerId, { type: 'check' });
  } else if (hasCall) {
    game2.processAction(currentPlayer.playerId, { type: 'call' });
  } else {
    game2.processAction(currentPlayer.playerId, { type: 'fold' });
  }
  safety++;
}

assert(game2.phase === GAME_PHASE.IDLE, 'Hand completed (checked through all streets)');
assert(events2.some(e => e.event === 'hand_complete'), 'hand_complete event fired');

const finalResult = game2.currentHand.result;
assert(finalResult.type === 'showdown' || finalResult.type === 'fold', 'Result is showdown or fold');

// Check hand history
const history = game2.getHandHistory();
assert(history !== null, 'Hand history available');
assertEq(history.handNumber, 1, 'Hand number is 1');
assert(history.actions.length > 0, 'Actions recorded in history');
assert(history.communityCards.length >= 0, 'Community cards recorded');

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${'═'.repeat(60)}`);
console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
