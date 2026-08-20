/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  UNION SETTLEMENT MATH — the accounting rules, asserted
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The weekly club<->union player win/loss settlement had no tests. Every
 * property below was verified by hand with ad-hoc SQL, repeatedly, and two of
 * them were WRONG in production before that verification caught them:
 *
 *   - the settlement double-charged rake (it settled realized_net +
 *     stack_delta, which by the identity below equals transfer MINUS rake, and
 *     the engine had already swept that rake to the union per hand);
 *   - it measured house AI rather than players, and a dry run would have moved
 *     1,112,929 chips on that basis.
 *
 * These are pure functions mirroring the SQL in fn_union_settle_player_pnl, so
 * the arithmetic can be asserted without a database. If the SQL changes, these
 * must change with it — that is the point. They encode WHY the formula has the
 * shape it does, so a future edit that "simplifies" it fails loudly.
 *
 * Run: node --test __tests__/union-settlement-math.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * A club's settleable net, exactly as fn_union_settle_player_pnl computes it.
 *
 * settle_net = realized_net + stack_delta + rake_paid
 *
 * The `+ rake_paid` is the part that is easy to delete and expensive to get
 * wrong. Derivation, per player, on a union table:
 *     buy-in   : wallet -X, seated +X   (net 0)
 *     cash-out : wallet +Y, seated -Y   (net 0)
 *     play     : chips move seat to seat; rake leaves the pot
 * therefore   realized_net + stack_delta = transfer_in - rake_paid
 * so adding rake back leaves exactly the inter-club transfer, which is the
 * only thing the clubs actually owe each other. The rake itself is settled
 * separately, having already been swept to the union.
 */
function settleNet({ realizedNet, seatedStart, seatedEnd, rakePaid }) {
  return round2(realizedNet + (seatedEnd - seatedStart) + rakePaid);
}

/** Collect from losers first, then pay winners pro-rata from what the union holds. */
function distribute(clubNets, unionBalance) {
  const collected = clubNets
    .filter((n) => n < 0)
    .reduce((sum, n) => round2(sum + Math.abs(n)), 0);
  let pot = round2(unionBalance + collected);
  const winners = clubNets.filter((n) => n > 0);
  const owed = winners.reduce((s, n) => round2(s + n), 0);
  const scale = owed > 0 && pot < owed ? pot / owed : 1;
  const paid = winners.reduce((s, n) => round2(s + Math.min(round2(n * scale), pot)), 0);
  return { collected, paid, unpaid: round2(owed - paid) };
}

test('rake is added back so the settlement is not double-charging it', () => {
  // A club whose players lost exactly the rake they paid, nothing else.
  const net = settleNet({ realizedNet: -100, seatedStart: 0, seatedEnd: 0, rakePaid: 100 });
  assert.equal(net, 0, 'a club that only paid rake owes the union nothing extra');
});

test('the pre-fix formula would have charged the rake twice', () => {
  const withoutRake = round2(-100 + (0 - 0)); // the original, buggy expression
  assert.equal(withoutRake, -100);
  assert.notEqual(withoutRake, 0, 'this is the bug: rake already swept, charged again');
});

test('chips still on the felt count — the boundary cannot be ignored', () => {
  // Player bought in 1000 and is still sitting on 1500: up 500, none realized.
  const net = settleNet({ realizedNet: -1000, seatedStart: 0, seatedEnd: 1500, rakePaid: 0 });
  assert.equal(net, 500, 'unrealized winnings belong to the period they were won in');
});

test('a pure inter-club transfer nets to zero across the union', () => {
  // A's players won 500 from B's players. No rake, nothing left seated.
  const a = settleNet({ realizedNet: 500, seatedStart: 0, seatedEnd: 0, rakePaid: 0 });
  const b = settleNet({ realizedNet: -500, seatedStart: 0, seatedEnd: 0, rakePaid: 0 });
  assert.equal(round2(a + b), 0, 'transfers between clubs must cancel');
});

test('the union collects before it pays, so it cannot pay out chips it never had', () => {
  const { collected, paid, unpaid } = distribute([-300, 300], 0);
  assert.equal(collected, 300);
  assert.equal(paid, 300);
  assert.equal(unpaid, 0);
});

test('a short union pays pro-rata rather than first-come-first-served', () => {
  // Union holds 100; two clubs are owed 100 each and nobody lost.
  const { paid, unpaid } = distribute([100, 100], 100);
  assert.equal(paid, 100, 'never pays out more than it holds');
  assert.equal(unpaid, 100, 'the shortfall is recorded, not silently dropped');
});

test('a club treasury shortfall is recorded rather than invented', () => {
  // Losing club owes 500 but the union starts empty and the winner wants 500.
  const { collected, paid, unpaid } = distribute([-500, 500], 0);
  assert.equal(collected, 500);
  assert.equal(paid, 500);
  assert.equal(unpaid, 0);
});

test('the house residual is whatever does not cancel — and is not an error', () => {
  // One real player lost 1138 to house horses. No other club had activity.
  const nets = [settleNet({ realizedNet: -1175.19, seatedStart: 0, seatedEnd: 0, rakePaid: 37.03 }), 0];
  const residual = round2(nets.reduce((s, n) => round2(s + n), 0));
  assert.equal(residual, -1138.16, 'matches the production dry run');
  assert.ok(residual !== 0, 'real-vs-house flow legitimately does not cancel');
});

test('rounding never manufactures or destroys a chip', () => {
  const net = settleNet({
    realizedNet: -0.005,
    seatedStart: 0,
    seatedEnd: 0.005,
    rakePaid: 0,
  });
  assert.equal(net, 0);
  assert.ok(Number.isFinite(net));
});

/**
 * P3 regressions added 2026-08-20, mirroring the two worst defects of the
 * 2026-08-19/20 reconciliation round (handoff items A and B).
 */

/**
 * fn_union_pnl_baseline(union, T) = the seated_end recorded by the last
 * settlement whose period ended at or before T. The settlement must anchor
 * at p_START. Anchoring at p_end lets any baseline written INSIDE the
 * window win, which collapses the stack delta and re-anchors the chain.
 */
function baselineAt(settlements, t) {
  const eligible = settlements.filter((s) => s.periodEnd <= t);
  return eligible.length ? eligible[eligible.length - 1].seatedEnd : null;
}

test('defect A: the baseline must be anchored at p_start, never p_end', () => {
  const pStart = 0;
  const pEnd = 10;
  const history = [
    { periodEnd: 0, seatedEnd: 1000 }, // the real opening baseline
    { periodEnd: 5, seatedEnd: 1400 }, // a bootstrap written INSIDE the window
  ];
  const correct = baselineAt(history, pStart);
  const buggy = baselineAt(history, pEnd);
  assert.equal(correct, 1000, 'the opening of the window is the anchor');
  assert.equal(buggy, 1400, 'p_end lets the inside baseline win');
  assert.notEqual(correct, buggy, 'this difference is 2026-08-19 defect (A)');
  // The production tell: two windows five hours apart returned byte-identical
  // seated_start, because both resolved to the same inside-window baseline.
  const buggyLater = baselineAt(history, pEnd + 5);
  assert.equal(buggy, buggyLater, 'the buggy anchor is insensitive to the window');
});

test('defect B: rake and P&L must measure the same population (horses included)', () => {
  // Nearly all play is horses. A club whose horses lost exactly the rake
  // they paid owes nothing extra -- but only if rakePaid was measured over
  // the SAME population as realizedNet.
  const horseRealized = -95;
  const humanRealized = -5;
  const horseRake = 95;
  const humanRake = 5;
  const sameCohort = settleNet({
    realizedNet: horseRealized + humanRealized,
    seatedStart: 0,
    seatedEnd: 0,
    rakePaid: horseRake + humanRake,
  });
  assert.equal(sameCohort, 0, 'rake-only losses cancel when populations match');
  const mismatched = settleNet({
    realizedNet: horseRealized + humanRealized, // P&L includes horses...
    seatedStart: 0,
    seatedEnd: 0,
    rakePaid: humanRake, // ...but rake excluded them: 2026-08-19 defect (B)
  });
  assert.equal(mismatched, -95, 'the horse rake resurfaces as phantom player loss');
  assert.notEqual(mismatched, sameCohort);
});
