/**
 * EV CALCULATOR CALIBRATION CHECK
 * ---------------------------------------------------------------------------
 * src/engines/EVCalculator.js carried two biases that the trainer's scoring
 * sits directly on top of: EV loss is measured against the best action, so a
 * mis-priced action does not merely report a wrong number, it changes which
 * action is called correct and therefore how the player is graded.
 *
 *   1. The check branch discounted hero's pot share by a flat 0.6, applied
 *      identically in and out of position. Checking IP closes the action and
 *      buys a free card with the last word still to come; checking OOP invites
 *      a bet hero must answer with no information. One number for both made
 *      every OOP check look better than it is and every IP check worse.
 *
 *   2. Fold equity was a per-street constant scaled by bet-to-pot, plus a
 *      swing on HERO's own hand strength. The scaling was wrong at both ends,
 *      and the strength term leaked hero's hole cards into a villain decision
 *      the villain makes without seeing them.
 *
 * These assertions call the real exported functions through the same Babel
 * require shim scripts/preflop-pot-check.js uses -- repo modules are ESM with
 * extensionless imports, which plain node rejects.
 *
 *   node scripts/ev-calibration-check.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const babel = require('@babel/core');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    if (filename.includes('node_modules')) return origJs(mod, filename);
    const code = fs.readFileSync(filename, 'utf8');
    if (!/\b(import|export)\b/.test(code)) return origJs(mod, filename);
    const out = babel.transformSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
        parserOpts: {
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
        },
    });
    mod._compile(out.code, filename);
};

const { calculateActionEVs, estimateFoldEquity } = require(path.join(ROOT, 'src/engines/EVCalculator.js'));

let PASS = 0;
let FAIL = 0;
function check(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'threw: ' + e.message; }
    if (r === true) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  -- ' + r); }
}

// A middling made hand on a dry board, so neither branch is pinned to a clamp.
const BASE = {
    holeCards: ['Ah', 'Qd'],
    board: ['Ac', '7d', '2s'],
    potSize: 10,
    effectiveStack: 100,
    street: 'flop',
    isPFR: true,
    currentBet: 0,
};

console.log('\n=== Check discount: position is priced, not averaged away ===');

const ip = calculateActionEVs({ ...BASE, position: 'IP' });
const oop = calculateActionEVs({ ...BASE, position: 'OOP' });

check('a check is worth more in position than out of it', () => {
    if (!ip.actions.check || !oop.actions.check) return 'no check action';
    return ip.actions.check.ev > oop.actions.check.ev
        || `IP ${ip.actions.check.ev} !> OOP ${oop.actions.check.ev}`;
});

check('the IP discount is 0.85 of raw equity share', () => {
    const raw = ip.equity * BASE.potSize;
    const got = ip.actions.check.ev / raw;
    return Math.abs(got - 0.85) < 0.02 || 'ratio ' + got.toFixed(4);
});

check('the OOP discount is 0.72 of raw equity share', () => {
    const raw = oop.equity * BASE.potSize;
    const got = oop.actions.check.ev / raw;
    return Math.abs(got - 0.72) < 0.02 || 'ratio ' + got.toFixed(4);
});

check('the two discounts straddle the single-number 0.78', () => {
    // 0.78 is what the model would use with no position information. If both
    // sides landed the same side of it, splitting by position would be adding
    // a bias rather than removing one.
    const rIP = ip.actions.check.ev / (ip.equity * BASE.potSize);
    const rOOP = oop.actions.check.ev / (oop.equity * BASE.potSize);
    return (rIP > 0.78 && rOOP < 0.78) || `IP ${rIP.toFixed(3)} OOP ${rOOP.toFixed(3)}`;
});

check('neither discount is the old flat 0.6', () => {
    const rIP = ip.actions.check.ev / (ip.equity * BASE.potSize);
    const rOOP = oop.actions.check.ev / (oop.equity * BASE.potSize);
    return (Math.abs(rIP - 0.6) > 0.05 && Math.abs(rOOP - 0.6) > 0.05)
        || `IP ${rIP.toFixed(3)} OOP ${rOOP.toFixed(3)}`;
});

console.log('\n=== Fold equity: anchored on MDF, blind to hero\'s cards ===');

// Read the calibrated quantity directly. The first draft of this file inverted
// it back out of a bet's EV, which divides by `potSize - calledEV` and so
// amplifies the rounding in the `equity` the module returns for display: two
// hands with genuinely identical fold equity read 0.52 and 0.44. The
// hero's-cards assertion below fails on that artifact alone, which would have
// been read as a product defect. Measuring the subject beats inferring it.
const fe = (street, fraction, potSize = 10, madeHand = { strength: 0.5 }) =>
    estimateFoldEquity(madeHand, street, potSize * fraction, potSize);

check('a one-third pot bet prices fold equity at the MDF share, not below it', () => {
    // MDF fold share for a 33% bet is 0.33/1.33 = 0.248. The old model returned
    // 0.45 * 0.33 = 0.149 before the strength swing -- barely half the price
    // the bet actually offers.
    const got = fe('flop', 0.33);
    const want = (0.33 / 1.33) * 1.10;
    return Math.abs(got - want) < 1e-9 || `got ${got.toFixed(4)}, want ${want.toFixed(4)}`;
});

check('a pot-sized bet generates more fold equity than a third-pot bet', () => {
    const small = fe('flop', 0.33);
    const large = fe('flop', 1.0);
    return large > small || `large ${large.toFixed(3)} !> small ${small.toFixed(3)}`;
});

check('fold equity falls from flop to river at a fixed bet size', () => {
    // Ranges are widest on the flop and condense by the river, so the same
    // price buys fewer folds later. Same board length is not required -- the
    // street label is what the model reads.
    const f = fe('flop', 0.67);
    const t = fe('turn', 0.67);
    const r = fe('river', 0.67);
    return (f > t && t > r) || `flop ${f.toFixed(3)} turn ${t.toFixed(3)} river ${r.toFixed(3)}`;
});

check('fold equity does not move with hero\'s own hand strength', () => {
    // The load-bearing one. The villain decides without seeing hero's cards, so
    // a model whose fold estimate moves with them is leaking information. The
    // old `strengthAdjust` swung it by a full 10 points between a strong and a
    // weak hand on the SAME board and the same bet.
    const a = fe('flop', 0.67, 10, { strength: 0.95 });
    const b = fe('flop', 0.67, 10, { strength: 0.05 });
    if (!isFinite(a) || !isFinite(b)) return 'non-finite fold equity';
    return a === b || `strong ${a.toFixed(4)} vs weak ${b.toFixed(4)}`;
});

check('fold equity stays inside the [0.05, 0.75] clamp at extreme sizings', () => {
    // A 4x-pot shove has an MDF fold share of 0.8, above the ceiling.
    for (const frac of [0.01, 0.33, 1.0, 4.0, 50.0]) {
        for (const st of ['flop', 'turn', 'river']) {
            const v = fe(st, frac);
            if (!(v >= 0.05 - 1e-9 && v <= 0.75 + 1e-9)) return `${st} ${frac}x -> ${v.toFixed(4)}`;
        }
    }
    return true;
});

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
