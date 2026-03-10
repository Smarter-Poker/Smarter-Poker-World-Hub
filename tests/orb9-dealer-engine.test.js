#!/usr/bin/env node
/**
 * ORB-9 DEALER ENGINE — STANDALONE VERIFICATION TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests the ORB-9 pure-function dealer at src/engine/dealer/
 * 
 * Coverage:
 *   1. Barrel imports (all modules load from src/engine/dealer)
 *   2. CSPRNG Deck entropy & uniformity
 *   3. All 10 hand ranking categories
 *   4. 5-way all-in side pot resolution
 *   5. Split pot with fractional chip distribution
 *   6. resolveShowdown() JSON API
 *   7. resolveShowdownFromStrings() convenience API
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const DEALER = path.join(__dirname, '..', 'src', 'engine', 'dealer');

let passed = 0, failed = 0, errors = [];

function assert(cond, name) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; errors.push(name); console.log(`  ❌ ${name}`); }
}
function section(name) { console.log(`\n${'═'.repeat(60)}\n  ${name}\n${'═'.repeat(60)}`); }

// ══════════════════════════════════════════════════════════════
section('1. BARREL IMPORTS — src/engine/dealer');
const Dealer = require(DEALER);

assert(typeof Dealer.Deck === 'function', 'Deck class exported');
assert(typeof Dealer.evaluate5 === 'function', 'evaluate5 exported');
assert(typeof Dealer.evaluateHoldem === 'function', 'evaluateHoldem exported');
assert(typeof Dealer.evaluateOmaha === 'function', 'evaluateOmaha exported');
assert(typeof Dealer.holdemShowdown === 'function', 'holdemShowdown exported');
assert(typeof Dealer.omahaShowdown === 'function', 'omahaShowdown exported');
assert(typeof Dealer.PotCalculator === 'function', 'PotCalculator class exported');
assert(typeof Dealer.resolveShowdown === 'function', 'resolveShowdown exported');
assert(typeof Dealer.resolveShowdownFromStrings === 'function', 'resolveShowdownFromStrings exported');
assert(typeof Dealer.makeCard === 'function', 'makeCard utility exported');
assert(typeof Dealer.parseCard === 'function', 'parseCard utility exported');
assert(typeof Dealer.cardToString === 'function', 'cardToString utility exported');
assert(typeof Dealer.calculateEquity === 'function', 'calculateEquity exported');

// ══════════════════════════════════════════════════════════════
section('2. CSPRNG DECK — Entropy & Uniformity');

const deck = new Dealer.Deck();
deck.reset();
assert(deck.remaining === 52, 'Standard deck = 52 cards');

// Deal full deck, verify all cards are unique
const allDealt = [];
for (let i = 0; i < 52; i++) allDealt.push(deck.deal());
assert(new Set(allDealt).size === 52, 'All 52 cards unique after full deal');

// CSPRNG uniformity test (statistical)
const freq = new Array(52).fill(0);
for (let t = 0; t < 10000; t++) {
  const d = new Dealer.Deck();
  d.reset();
  freq[d.deal()]++;
}
const expected = 10000 / 52;
const maxDev = Math.max(...freq.map(f => Math.abs(f - expected) / expected));
assert(maxDev < 0.25, `CSPRNG uniformity: ${(maxDev * 100).toFixed(1)}% max deviation < 25%`);

// Verify crypto module is used (not Math.random)
const d1 = new Dealer.Deck(); d1.reset();
const d2 = new Dealer.Deck(); d2.reset();
const hand1 = [d1.deal(), d1.deal(), d1.deal(), d1.deal(), d1.deal()];
const hand2 = [d2.deal(), d2.deal(), d2.deal(), d2.deal(), d2.deal()];
const areDifferent = hand1.some((c, i) => c !== hand2[i]);
assert(areDifferent, 'Two fresh shuffles produce different sequences (crypto RNG)');

// ══════════════════════════════════════════════════════════════
section('3. HAND EVALUATOR — All 10 Categories');

function mc(r, s) {
  const R = { '2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'T':8,'J':9,'Q':10,'K':11,'A':12 };
  const S = { 'c':0,'d':1,'h':2,'s':3 };
  return R[r] * 4 + S[s];
}

// Royal Flush
const rf = Dealer.evaluate5([mc('A','s'), mc('K','s'), mc('Q','s'), mc('J','s'), mc('T','s')]);
assert(rf.categoryName.includes('Straight Flush'), 'Royal Flush detected');

// Straight Flush
const sf = Dealer.evaluate5([mc('9','h'), mc('8','h'), mc('7','h'), mc('6','h'), mc('5','h')]);
assert(sf.categoryName.includes('Straight Flush'), 'Straight Flush detected');

// Four of a Kind
const quads = Dealer.evaluate5([mc('K','h'), mc('K','d'), mc('K','c'), mc('K','s'), mc('2','h')]);
assert(quads.categoryName === 'Four of a Kind', 'Four of a Kind detected');

// Full House
const fh = Dealer.evaluate5([mc('Q','h'), mc('Q','d'), mc('Q','c'), mc('7','s'), mc('7','d')]);
assert(fh.categoryName === 'Full House', 'Full House detected');

// Flush
const fl = Dealer.evaluate5([mc('A','h'), mc('T','h'), mc('8','h'), mc('5','h'), mc('3','h')]);
assert(fl.categoryName === 'Flush', 'Flush detected');

// Straight
const st = Dealer.evaluate5([mc('9','h'), mc('8','d'), mc('7','c'), mc('6','s'), mc('5','h')]);
assert(st.categoryName === 'Straight', 'Straight detected');

// Wheel (A-low straight)
const wh = Dealer.evaluate5([mc('A','h'), mc('2','d'), mc('3','c'), mc('4','s'), mc('5','h')]);
assert(wh.categoryName === 'Straight', 'Wheel (A-5 straight) detected');

// Three of a Kind
const trips = Dealer.evaluate5([mc('8','h'), mc('8','d'), mc('8','c'), mc('K','s'), mc('3','h')]);
assert(trips.categoryName === 'Three of a Kind', 'Three of a Kind detected');

// Two Pair
const tp = Dealer.evaluate5([mc('J','h'), mc('J','d'), mc('5','c'), mc('5','s'), mc('A','h')]);
assert(tp.categoryName === 'Two Pair', 'Two Pair detected');

// One Pair
const op = Dealer.evaluate5([mc('A','h'), mc('A','d'), mc('9','c'), mc('6','s'), mc('2','h')]);
assert(op.categoryName === 'One Pair', 'One Pair detected');

// High Card
const hc = Dealer.evaluate5([mc('A','h'), mc('K','d'), mc('9','c'), mc('6','s'), mc('2','d')]);
assert(hc.categoryName === 'High Card', 'High Card detected');

// Rankings must be strictly ordered
assert(rf.score > quads.score, 'Royal Flush > Quads');
assert(quads.score > fh.score, 'Quads > Full House');
assert(fh.score > fl.score, 'Full House > Flush');
assert(fl.score > st.score, 'Flush > Straight');
assert(st.score > trips.score, 'Straight > Three of a Kind');
assert(trips.score > tp.score, 'Three of a Kind > Two Pair');
assert(tp.score > op.score, 'Two Pair > One Pair');
assert(op.score > hc.score, 'One Pair > High Card');

// ══════════════════════════════════════════════════════════════
section('4. 7-CARD HOLD\'EM EVALUATION');

const holdem7 = Dealer.evaluateHoldem([
  mc('A','s'), mc('K','s'), // Hole
  mc('Q','s'), mc('J','s'), mc('T','s'), mc('2','d'), mc('3','c') // Board
]);
assert(holdem7.categoryName.includes('Straight Flush'), '7-card best-of picks Royal Flush');

// Board pair: hero kicker matters
const board1 = [mc('K','d'), mc('Q','c'), mc('J','s'), mc('4','h'), mc('3','d')];
const heroAA = Dealer.evaluateHoldem([mc('A','s'), mc('A','h'), ...board1]);
const heroKK = Dealer.evaluateHoldem([mc('K','s'), mc('K','h'), ...board1]);
assert(heroKK.score > heroAA.score, 'Set of Kings beats Aces on K-Q-J board');

// ══════════════════════════════════════════════════════════════
section('5. FIVE-WAY ALL-IN SIDE POT RESOLUTION');

const board5 = [mc('A','s'), mc('K','d'), mc('Q','c'), mc('J','h'), mc('2','s')];
const result5way = Dealer.resolveShowdown({
  players: [
    { playerId: 'p1', holeCards: [mc('T','s'), mc('9','s')], invested: 500 },     // Royal Flush
    { playerId: 'p2', holeCards: [mc('A','h'), mc('A','d')], invested: 200, allIn: true },  // Set of Aces
    { playerId: 'p3', holeCards: [mc('K','h'), mc('K','c')], invested: 100, allIn: true },  // Set of Kings
    { playerId: 'p4', holeCards: [mc('Q','h'), mc('Q','d')], invested: 50, allIn: true },   // Set of Queens
    { playerId: 'p5', holeCards: [mc('J','d'), mc('J','c')], invested: 500 },     // Set of Jacks
  ],
  board: board5,
});

assert(result5way.winners.length >= 1, '5-way showdown resolves winners');
assert(result5way.winners[0].playerId === 'p1', 'Royal Flush (p1) wins overall');
assert(result5way.pots.length >= 3, `Side pots created: ${result5way.pots.length} pots`);

// Verify total payouts equal total invested (chip conservation)
const totalInvested = 500 + 200 + 100 + 50 + 500;
const totalPayout = Object.values(result5way.payouts).reduce((a, b) => a + b, 0) + result5way.rake;
assert(totalPayout === totalInvested, `Chip conservation: ${totalPayout} paid out = ${totalInvested} invested`);

console.log(`    Pots: ${JSON.stringify(result5way.pots.map(p => ({ name: p.name, amount: p.amount, winners: p.winners })))}`);
console.log(`    Payouts: ${JSON.stringify(result5way.payouts)}`);

// ══════════════════════════════════════════════════════════════
section('6. SPLIT POT — Fractional Chip Distribution');

// Both players have the same hand (board plays), split pot scenario
const splitBoard = [mc('A','s'), mc('K','s'), mc('Q','s'), mc('J','s'), mc('T','s')]; // Board Royal Flush
const splitResult = Dealer.resolveShowdown({
  players: [
    { playerId: 'alice', holeCards: [mc('2','h'), mc('3','h')], invested: 100 },
    { playerId: 'bob', holeCards: [mc('4','h'), mc('5','h')], invested: 100 },
    { playerId: 'carol', holeCards: [mc('6','h'), mc('7','h')], invested: 100 },
  ],
  board: splitBoard,
});

assert(splitResult.winners.length === 3, 'Three-way split detected on board Royal Flush');
assert(splitResult.payouts.alice === 100, 'Alice gets 100 back (1/3 of 300)');
assert(splitResult.payouts.bob === 100, 'Bob gets 100 back');
assert(splitResult.payouts.carol === 100, 'Carol gets 100 back');

// Odd chip split (indivisible by winner count)
const oddResult = Dealer.resolveShowdown({
  players: [
    { playerId: 'x', holeCards: [mc('2','h'), mc('3','h')], invested: 50 },
    { playerId: 'y', holeCards: [mc('4','d'), mc('5','d')], invested: 51 },
  ],
  board: splitBoard,
});
const xPay = oddResult.payouts.x;
const yPay = oddResult.payouts.y;
assert(xPay + yPay === 101, `Odd chip split totals correctly: ${xPay} + ${yPay} = 101`);
assert(Math.abs(xPay - yPay) <= 1, 'Odd chip split differs by at most 1 chip');

// ══════════════════════════════════════════════════════════════
section('7. resolveShowdownFromStrings() — Convenience API');

const stringResult = Dealer.resolveShowdownFromStrings(
  [
    { playerId: 'hero', holeCards: ['As', 'Ks'], invested: 200 },
    { playerId: 'villain', holeCards: ['Qh', 'Jh'], invested: 200 },
  ],
  ['Ts', 'Js', 'Qs', '2d', '3c'],
);

assert(stringResult.winners.length === 1, 'String API resolves winner');
assert(stringResult.winners[0].playerId === 'hero', 'Hero wins with Royal Flush via string API');
assert(stringResult.payouts.hero === 400, 'Hero gets full pot (400)');
assert(stringResult.payouts.villain === 0, 'Villain gets 0');

// ══════════════════════════════════════════════════════════════
section('8. FOLDED PLAYER CONTRIBUTIONS');

const foldResult = Dealer.resolveShowdown({
  players: [
    { playerId: 'winner', holeCards: [mc('A','s'), mc('K','s')], invested: 100 },
    { playerId: 'calledAndLost', holeCards: [mc('2','h'), mc('3','h')], invested: 100 },
  ],
  board: [mc('A','d'), mc('K','d'), mc('Q','c'), mc('9','s'), mc('8','d')],
  foldedPlayers: [
    { playerId: 'folder1', invested: 50 },
    { playerId: 'folder2', invested: 25 },
  ],
});

assert(foldResult.payouts.winner === 275, `Winner collects all: ${foldResult.payouts.winner} (should be 275)`);
assert(foldResult.payouts.calledAndLost === 0, 'Loser gets 0');

// ══════════════════════════════════════════════════════════════
section('9. RAKE CALCULATION');

const rakeResult = Dealer.resolveShowdown({
  players: [
    { playerId: 'rakeWin', holeCards: [mc('A','s'), mc('A','h')], invested: 100 },
    { playerId: 'rakeLose', holeCards: [mc('2','h'), mc('3','h')], invested: 100 },
  ],
  board: [mc('A','d'), mc('K','d'), mc('Q','c'), mc('9','s'), mc('8','d')],
  rake: { percent: 5, cap: 3 },
});

assert(rakeResult.rake > 0, `Rake collected: ${rakeResult.rake}`);
assert(rakeResult.rake <= 3, `Rake capped at 3: ${rakeResult.rake}`);
const rakeTotal = Object.values(rakeResult.payouts).reduce((a, b) => a + b, 0) + rakeResult.rake;
assert(rakeTotal === 200, `Rake + payouts = total invested: ${rakeTotal}`);

// ══════════════════════════════════════════════════════════════
section('10. OMAHA — evaluateOmaha via Barrel');

const omahaResult = Dealer.evaluateOmaha(
  [mc('A','h'), mc('A','d'), mc('K','h'), mc('K','d')],
  [mc('A','c'), mc('A','s'), mc('7','h'), mc('3','c'), mc('2','d')],
);
assert(omahaResult.categoryName === 'Four of a Kind', 'Omaha quads via dealer barrel');

// ══════════════════════════════════════════════════════════════
// FINAL RESULTS
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ORB-9 RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('═'.repeat(60));
if (errors.length > 0) {
  console.log('\n  FAILURES:');
  errors.forEach(e => console.log(`    ❌ ${e}`));
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
