/**
 * Calibration pins for the GTO trainer's EV heuristics.
 *
 * These two functions drive the correct/inaccuracy/mistake/blunder grades in
 * EVCalculator, so a silent drift here silently mis-teaches. Run with:
 *   node --test __tests__/ev-calibration.test.mjs
 *
 * Imports the dependency-free calibration module directly (the rest of the
 * engine graph uses extensionless webpack imports that raw node can't resolve).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_REALIZATION, FE_ELASTICITY, STREET_FE_ADJ, FE_STRENGTH_ADJ, FE_MIN, FE_MAX,
    checkRealization, estimateFoldEquity,
} from '../src/engines/evCalibration.mjs';

const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ── Constant pins: fail loudly if anyone re-tunes without updating the test ──
test('calibration constants are the agreed values', () => {
    assert.equal(CHECK_REALIZATION.river, 1.00);
    assert.deepEqual(CHECK_REALIZATION.turn, { IP: 0.90, OOP: 0.78 });
    assert.deepEqual(CHECK_REALIZATION.flop, { IP: 0.85, OOP: 0.72 });
    assert.equal(FE_ELASTICITY, 1.0);
    assert.deepEqual(STREET_FE_ADJ, { flop: 0.00, turn: 0.03, river: -0.02 });
    assert.equal(FE_STRENGTH_ADJ, 0.05);
    assert.equal(FE_MIN, 0.10);
    assert.equal(FE_MAX, 0.85);
});

// ── Check realization ───────────────────────────────────────────
test('river check is showdown — realization is 1.0, not discounted', () => {
    // The old model priced this at equity*pot*0.6 and flagged correct river
    // check-downs as mistakes. A river check must realize full equity share.
    assert.equal(checkRealization('river', 'IP'), 1.00);
    assert.equal(checkRealization('river', 'OOP'), 1.00);
});

test('in position realizes more equity than out of position', () => {
    assert.ok(checkRealization('flop', 'IP') > checkRealization('flop', 'OOP'));
    assert.ok(checkRealization('turn', 'IP') > checkRealization('turn', 'OOP'));
});

test('unknown street falls back to flop realization', () => {
    assert.equal(checkRealization('preflop', 'IP'), CHECK_REALIZATION.flop.IP);
});

// ── Fold equity: MDF anchor ────────────────────────────────────
test('fold equity tracks the MDF pot-odds ratio bet/(pot+bet)', () => {
    // bluff (strength 0.3 -> -0.05 strength term)
    // 1/3-pot flop: MDF 0.33/1.33 = 0.248, minus 0.05 => ~0.20
    assert.ok(near(estimateFoldEquity(0.3, 'flop', 2, 6), 0.20));
    // pot-sized flop: MDF 0.5, minus 0.05 => ~0.45
    assert.ok(near(estimateFoldEquity(0.3, 'flop', 6, 6), 0.45));
    // 1.5x-pot flop: MDF 0.6, minus 0.05 => ~0.55
    assert.ok(near(estimateFoldEquity(0.3, 'flop', 9, 6), 0.55));
});

test('small bets are no longer under-priced the way baseFold*size did', () => {
    // Old model: baseFold(0.45) * (2/6) + strengthAdj = ~0.10 (floored).
    // New model recovers a realistic ~0.20 for a 1/3-pot flop bluff.
    const oldStyle = Math.max(0.10, Math.min(0.80, 0.45 * Math.min(1.5, 2 / 6) - 0.05));
    const now = estimateFoldEquity(0.3, 'flop', 2, 6);
    assert.ok(now > oldStyle, `expected ${now} > ${oldStyle}`);
});

test('fold equity is monotonic increasing in bet size', () => {
    let prev = -1;
    for (const bet of [0.6, 2, 4, 6, 9, 18, 36]) {
        const fe = estimateFoldEquity(0.3, 'flop', bet, 6);
        assert.ok(fe >= prev - 1e-9, `non-monotonic at bet=${bet}: ${fe} < ${prev}`);
        prev = fe;
    }
});

test('fold equity is clamped to [FE_MIN, FE_MAX]', () => {
    assert.equal(estimateFoldEquity(0.3, 'flop', 0.4, 6), FE_MIN);      // tiny bet -> floor
    assert.ok(estimateFoldEquity(0.7, 'flop', 500, 6) <= FE_MAX);       // huge overbet -> cap
    assert.ok(estimateFoldEquity(0.3, 'flop', 500, 6) <= FE_MAX);
});

test('turn barrels are not weaker than flop bets (range-narrowing fixed)', () => {
    // Same value hand, same pot-sized bet: turn >= flop > river ordering.
    const flop  = estimateFoldEquity(0.7, 'flop',  6, 6);
    const turn  = estimateFoldEquity(0.7, 'turn',  6, 6);
    const river = estimateFoldEquity(0.7, 'river', 6, 6);
    assert.ok(turn >= flop, `turn ${turn} should be >= flop ${flop}`);
    assert.ok(flop > river, `flop ${flop} should be > river ${river}`);
});

test('value hands get a small blocker nudge over bluffs (same size/street)', () => {
    const value = estimateFoldEquity(0.7, 'flop', 6, 6);
    const bluff = estimateFoldEquity(0.3, 'flop', 6, 6);
    assert.ok(near(value - bluff, 2 * FE_STRENGTH_ADJ, 1e-9));
});

test('degenerate pot size does not divide by zero', () => {
    const fe = estimateFoldEquity(0.5, 'flop', 6, 0);
    assert.ok(fe >= FE_MIN && fe <= FE_MAX);
});
