/* EV pricing and hand-history action mapping. */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, section, ROOT } = require('../engine-correctness-harness');

const E = require(path.join(ROOT, 'src/engines/EVCalculator.js'));
const { heroIsInPosition } = require(path.join(ROOT, 'src/engines/positionOrder.js'));

const FACING_BET = {
    holeCards: ['Ah', 'Kd'], board: ['Qs', '7h', '2c'],
    potSize: 10, effectiveStack: 100, street: 'flop',
    position: 'IP', isPFR: true, currentBet: 5,
};
const NO_BET = { ...FACING_BET, currentBet: 0 };

section('EVCalculator must not price an absent action as a fold');
check('facing a bet, the tree is fold/call/raise only', () => {
    const keys = Object.keys(E.calculateActionEVs(FACING_BET).actions).sort();
    return keys.join(',') === 'call,fold,raise' || keys.join(',');
});
check('a bet_* key facing a bet is reported unpriced, not as a fold', () => {
    const r = E.calculateEVLoss(FACING_BET, 'bet_medium');
    return (r.actionUnavailable === true && r.playerEV === null)
        || 'evLoss ' + r.evLoss + ' classification ' + r.classification;
});
check('an unpriced action does not claim a confident EV loss', () => {
    const r = E.calculateEVLoss(FACING_BET, 'bet_medium');
    return r.evLoss === 0 || 'evLoss ' + r.evLoss;
});
check('a garbage action key is reported unpriced', () => {
    const r = E.calculateEVLoss(FACING_BET, 'banana');
    return r.actionUnavailable === true || 'classification ' + r.classification;
});
check('a real fold facing a bet is still priced normally', () => {
    const r = E.calculateEVLoss(FACING_BET, 'fold');
    return (!r.actionUnavailable && r.playerEV === 0 && r.evLoss > 0)
        || JSON.stringify(r);
});
check('not facing a bet, the tree has no fold and no call', () => {
    const keys = Object.keys(E.calculateActionEVs(NO_BET).actions);
    return (!keys.includes('fold') && !keys.includes('call') && keys.includes('check'))
        || keys.join(',');
});

section('HandAnalyzer maps actions to the branch it is actually in');
const haSrc = fs.readFileSync(path.join(ROOT, 'src/engines/HandAnalyzer.js'), 'utf8');
check('_mapActionToEVKey takes facingBet', () =>
    /_mapActionToEVKey\(action, amount, potSize, facingBet\)/.test(haSrc)
    || 'signature still ignores which branch of the tree it is in');
check('_mapActionToEVKey no longer defaults unknown actions to check', () =>
    !/if \(action === 'bet' \|\| action === 'raise'\) \{[\s\S]{0,220}?\n    return 'check';/.test(haSrc)
    || "still returns 'check' for any unrecognised action");
check('the facingBet passed to the mapper comes from currentBet', () =>
    /_mapActionToEVKey\(action, amount, potSize, currentBet > 0\)/.test(haSrc)
    || 'mapper and EVCalculator can disagree about the branch');

section('HandAnalyzer position context is relative to the opponent');
// Exercise the shipped _getPositionContext by slicing it out of the module
// source and evaluating it against the real positionOrder helper.
function sliceFn(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) return null;
    let depth = 0, i = src.indexOf('{', start);
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
    return null;
}
const { postflopActionIndex } = require(path.join(ROOT, 'src/engines/positionOrder.js'));
const getPosCtx = (() => {
    const a = sliceFn(haSrc, '_liveOpponentPositions');
    const b = sliceFn(haSrc, '_getPositionContext');
    if (!a || !b) return null;
    // eslint-disable-next-line no-new-func
    return new Function('postflopActionIndex', a + '\n' + b + '\nreturn _getPositionContext;')(postflopActionIndex);
})();

function handWith(heroPos, villainPositions) {
    return {
        hero: { name: 'Hero', position: heroPos },
        players: [{ name: 'Hero', position: heroPos }]
            .concat(villainPositions.map((p, i) => ({ name: 'V' + i, position: p }))),
        streets: { preflop: { actions: [] }, flop: { actions: [] } },
    };
}

check('_getPositionContext is reachable for testing', () => getPosCtx !== null || 'could not slice the function');
check('CO vs BTN is OOP, not IP', () =>
    getPosCtx('CO', handWith('CO', ['BTN']), 'flop') === 'OOP'
    || 'reported ' + getPosCtx('CO', handWith('CO', ['BTN']), 'flop'));
check('HJ vs UTG is IP, not OOP', () =>
    getPosCtx('HJ', handWith('HJ', ['UTG']), 'flop') === 'IP'
    || 'reported ' + getPosCtx('HJ', handWith('HJ', ['UTG']), 'flop'));
check('BB vs SB is IP', () =>
    getPosCtx('BB', handWith('BB', ['SB']), 'flop') === 'IP'
    || 'reported ' + getPosCtx('BB', handWith('BB', ['SB']), 'flop'));
check('BTN vs BB is IP', () =>
    getPosCtx('BTN', handWith('BTN', ['BB']), 'flop') === 'IP'
    || 'reported ' + getPosCtx('BTN', handWith('BTN', ['BB']), 'flop'));
check('CO multiway with the button behind is OOP', () =>
    getPosCtx('CO', handWith('CO', ['BB', 'BTN']), 'flop') === 'OOP'
    || 'reported ' + getPosCtx('CO', handWith('CO', ['BB', 'BTN']), 'flop'));
check('CO is IP once the button folds', () => {
    const h = handWith('CO', ['BB', 'BTN']);
    h.streets.preflop.actions.push({ player: 'V1', action: 'fold' });
    return getPosCtx('CO', h, 'flop') === 'IP' || 'reported ' + getPosCtx('CO', h, 'flop');
});

section('solver-api baseline strategy is relative to the opponent');
const saSrc = fs.readFileSync(path.join(ROOT, 'pages/api/training/solver-api.js'), 'utf8');
const baseline = (() => {
    const fn = sliceFn(saSrc, 'generateBaselineStrategy');
    if (!fn) return null;
    // eslint-disable-next-line no-new-func
    return new Function('heroIsInPosition', fn + '\nreturn generateBaselineStrategy;')(heroIsInPosition);
})();
const BOARD = ['Ah', 'Kd', '7c'];
check('generateBaselineStrategy is reachable for testing', () => baseline !== null || 'could not slice the function');
check('SB vs BB gets the out-of-position baseline, not the in-position one', () => {
    const r = baseline(BOARD, 'SB', 'bet', 'BB');
    return r.actions.bet === 35 || 'bet frequency ' + r.actions.bet;
});
check('BB vs SB gets the in-position baseline', () => {
    const r = baseline(BOARD, 'BB', 'bet', 'SB');
    return r.actions.bet === 55 || 'bet frequency ' + r.actions.bet;
});
check('CO vs BTN gets the out-of-position baseline', () => {
    const r = baseline(BOARD, 'CO', 'bet', 'BTN');
    return r.actions.bet === 35 || 'bet frequency ' + r.actions.bet;
});
check('BTN vs BB gets the in-position baseline', () => {
    const r = baseline(BOARD, 'BTN', 'bet', 'BB');
    return r.actions.bet === 55 || 'bet frequency ' + r.actions.bet;
});
check('baseline bet + check always sum to 100', () => {
    const pairs = [['SB', 'BB'], ['BB', 'SB'], ['CO', 'BTN'], ['BTN', 'CO'], ['UTG', 'BB'], ['HJ', 'UTG']];
    const bad = pairs.filter(([h, v]) => {
        const r = baseline(BOARD, h, 'bet', v);
        return r.actions.bet + r.actions.check !== 100;
    });
    return bad.length === 0 || JSON.stringify(bad);
});
