/* Position / in-position correctness. */
'use strict';
const path = require('path');
const { check, section, ROOT } = require('../engine-correctness-harness');

const { heroIsInPosition, positionContext } = require(path.join(ROOT, 'src/engines/positionOrder.js'));

section('positionOrder (baseline invariants)');

check('BB is IP vs SB postflop', () => heroIsInPosition('BB', 'SB') === true || 'got false');
check('SB is OOP vs BB postflop', () => heroIsInPosition('SB', 'BB') === false || 'got true');
check('BTN is IP vs CO', () => heroIsInPosition('BTN', 'CO') === true || 'got false');
check('CO is OOP vs BTN', () => heroIsInPosition('CO', 'BTN') === false || 'got true');
check('HJ is IP vs UTG', () => heroIsInPosition('HJ', 'UTG') === true || 'got false');
check('positionContext(BB,SB) === IP', () => positionContext('BB', 'SB') === 'IP' || positionContext('BB','SB'));

section('HandAnalyzer._getPositionContext must consider villain');
const ha = fs_read('src/engines/HandAnalyzer.js');
check('HandAnalyzer does not hard-code IP from hero seat alone', () => {
    return !/const\s+ipPositions\s*=\s*\[\s*'BTN'\s*,\s*'CO'\s*\]/.test(ha)
        || 'still uses ipPositions = [BTN, CO] with no villain reference';
});

section('solver-api baseline strategy must consider villain');
const sa = fs_read('pages/api/training/solver-api.js');
check('solver-api does not treat SB as in position', () => {
    return !/ipPositions\s*=\s*\[\s*'BTN'\s*,\s*'CO'\s*,\s*'SB'\s*\]/.test(sa)
        || 'SB listed as an in-position seat; SB acts first postflop against every seat';
});
check('solver-api generateBaselineStrategy receives villainPosition', () => {
    return /function generateBaselineStrategy\([^)]*villainPosition/.test(sa)
        || 'generateBaselineStrategy signature has no villainPosition';
});

function fs_read(rel) {
    return require('fs').readFileSync(path.join(ROOT, rel), 'utf8');
}
