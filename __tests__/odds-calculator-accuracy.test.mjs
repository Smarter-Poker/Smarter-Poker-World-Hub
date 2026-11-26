import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEquity } from '../src/lib/poker/pokerOddsEngine.js';
import { parseCardListFromParam as cards } from '../src/lib/poker/oddsPermalink.js';

function deal(game, hands, board = '', dead = '') {
  return calculateEquity({ game, hands: hands.map(cards), board: cards(board), dead: cards(dead) });
}

test('a royal board splits equity equally among all three seats', () => {
  const seats = deal('nlhe', ['2c3c', '4d5d', '6h7h'], 'AsKsQsJsTs');
  for (const seat of seats) {
    assert.ok(Math.abs(seat.equity - 100 / 3) < 1e-10);
    assert.deepEqual([seat.wins, seat.ties, seat.total, seat.exact], [0, 1, 1, true]);
  }
});

test('fourth street counts every river and removes a dead out', () => {
  const hands = ['AsAd', 'KsKd'];
  for (const [dead, total, wins] of [['',44,2], ['Kc',43,1]]) {
    const [, kings] = deal('nlhe', hands, '2c3h7s9d', dead);
    assert.deepEqual([kings.total, kings.wins, kings.ties], [total, wins, 0]);
  }
  assert.equal(deal('nlhe', hands, '2c3h7s')[0].total, 990);
});

for (const [game, extra] of [['plo4',''], ['plo5','7d'], ['plo6','7d6c']]) {
  test(game + ' requires exactly two hole cards and three board cards', () => {
    const hero = 'As2d3h4c' + extra;
    const villain = 'QsJs9h8c' + (game === 'plo4' ? '' : game === 'plo5' ? '5d' : '5d4d');
    assert.equal(deal(game, [hero, villain], 'KsTs6s3s2s')[1].equity, 100);
  });
}

test('Stud scores separate seven-card hands', () => {
  assert.equal(deal('stud', ['As2c3d4h5sKhQd','AcAdAhKsKc8c7c'])[1].wins, 1);
});

test('Razz compares from the highest card down and penalizes duplicates', () => {
  for (const villain of ['Ac2c3c4c9cAdAh','Ac2c3c4cAdAh2h']) {
    assert.equal(deal('razz', ['2d3d4d5d6dKsQs', villain])[0].equity, 100);
  }
});

test('impossible spots fail before simulation', () => {
  assert.throws(() => deal('nlhe',['AcAd','AcKh']), /once/);
  assert.throws(() => deal('plo6',['AcAd','KsKh']), /hand size/);
});

import { tournamentEquity } from '../src/lib/poker/tournamentEquity.js';
test('heads-up ICM awards the guaranteed payout and contests the difference', () => {
  const result = tournamentEquity({ stacks: [600,400], prizes: [60,40], prizePool: 1000 });
  assert.deepEqual(result.results.map(r => r.icmDollars), [520,480]);
  assert.equal(result.bubbleFactor, 1);
});
test('equal stacks on a two-seat satellite bubble risk twice their potential gain', () => {
  const result = tournamentEquity({ stacks: [100,100,100], prizes: [50,50] });
  assert.equal(result.bubbleFactor, 2);
});

import { calcEquity, parseCardStr } from '../src/lib/poker/trainingEquity.js';
test('training PLO8 awards high and qualifying low halves to separate hands', () => {
  const players = ['As2sKdQc','KhKcJhJd'].map((hand,id) => ({
    id, holeCards: hand.match(/../g).map(parseCardStr),
  }));
  const result = calcEquity(players, ['3h','4c','8s','Ks','9d'].map(parseCardStr), 'plo8');
  assert.deepEqual(result.equities, [50,50]);
  assert.deepEqual(result.highEquities, [0,100]);
  assert.deepEqual(result.lowEquities, [100,0]);
  assert.equal(result.totalRuns, 1);
});
