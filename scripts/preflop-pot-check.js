/**
 * PREFLOP POT CHECK
 * ---------------------------------------------------------------------------
 * The design template shows the question "You Are On The Button (Last To Act).
 * The Player To Your Right Bets 2.5 Big Blinds." above a felt whose POT pill
 * reads 0. If a villain has bet, the pot cannot be the blinds alone -- and it
 * certainly cannot be zero.
 *
 * These assertions run against src/components/training/games/potMath.js, the
 * module UniversalDynamicTable actually renders from.
 *
 *   node scripts/preflop-pot-check.js
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

const { committedFor, computeDisplayPot } = require(
    path.join(ROOT, 'src/components/training/games/potMath.js')
);

let PASS = 0;
let FAIL = 0;
function check(name, fn) {
    let ok = false;
    let detail = '';
    try {
        const r = fn();
        if (r === true) ok = true;
        else detail = typeof r === 'string' ? r : 'returned ' + JSON.stringify(r);
    } catch (e) { detail = 'threw: ' + (e && e.message); }
    if (ok) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + '  [' + detail + ']'); }
}

// 9-max seat names, exactly as SEAT_CONFIGS[9] carries them.
const SEATS9 = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO']
    .map((name, id) => ({ id, name }));

console.log('\n=== Preflop pot: chips on the felt vs the POT pill ===');

// The template's own scenario: hero on the button, the seat to his right (CO)
// bets 2.5bb. Blinds are posted. Nothing else has acted.
const templateActions = [{ position: 'CO', action: 'BET 2.5BB' }];

check('CO bet of 2.5bb is read off the action text', () => {
    const v = committedFor({ name: 'CO' }, templateActions, true);
    return v === 2.5 || 'got ' + v;
});

check('SB and BB post their blinds when they have not acted', () => {
    const sb = committedFor({ name: 'SB' }, templateActions, true);
    const bb = committedFor({ name: 'BB' }, templateActions, true);
    return (sb === 0.5 && bb === 1) || 'sb=' + sb + ' bb=' + bb;
});

check('POT pill matches the chips on the felt after a 2.5bb bet', () => {
    const chips = SEATS9.reduce((sum, s) => sum + committedFor(s, templateActions, true), 0);
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: templateActions,
    });
    return pot === chips
        ? true
        : 'POT pill says ' + pot + 'bb but the chips on the felt total ' + chips + 'bb';
});

check('a 2.5bb bet cannot leave the pot at the blinds', () => {
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: templateActions,
    });
    return pot > 1.5 || 'pot is ' + pot + 'bb with 2.5bb already bet';
});

check('walked-to preflop pot with no action is still the blinds', () => {
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: [],
    });
    return pot === 1.5 || 'got ' + pot;
});

check('an explicit scenario pot still wins (postflop potGeometry path)', () => {
    const pot = computeDisplayPot({
        scenarioPot: 12.5, streetLabel: 'FLOP', seats: SEATS9,
        actionHistory: [{ position: 'CO', action: 'BET 5BB' }],
    });
    return pot === 12.5 || 'got ' + pot;
});

check('a fold commits nothing', () => {
    const v = committedFor({ name: 'UTG' }, [{ position: 'UTG', action: 'FOLD' }], true);
    return v === 0 || 'got ' + v;
});

check('a 3-bet pot sums every live contribution', () => {
    const actions = [
        { position: 'UTG', action: 'RAISE', amount: 2.5 },
        { position: 'BTN', action: 'RAISE', amount: 8 },
    ];
    const pot = computeDisplayPot({
        scenarioPot: 0, streetLabel: 'PREFLOP', seats: SEATS9, actionHistory: actions,
    });
    // UTG 2.5 + BTN 8 + SB 0.5 + BB 1
    return pot === 12 || 'got ' + pot;
});

console.log('\n---------------------------------------------');
console.log('PASS ' + PASS + '   FAIL ' + FAIL + '   TOTAL ' + (PASS + FAIL));
process.exit(FAIL > 0 ? 1 : 0);
