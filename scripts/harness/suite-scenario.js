/* Postflop scenario generator: ids, pot geometry, option consistency. */
'use strict';
const path = require('path');
const { check, section, ROOT } = require('../engine-correctness-harness');

const G = require(path.join(ROOT, 'src/engines/PostflopScenarioGenerator.js'));
const { DeterministicGTOEngine } = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));

const LEVELS = { 8: G.generateLevel8(), 9: G.generateLevel9(), 10: G.generateLevel10() };

section('Scenario ids are unique');
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' has no duplicate scenario ids', () => {
        const seen = new Map();
        for (const s of LEVELS[lvl]) seen.set(s.id, (seen.get(s.id) || 0) + 1);
        const dups = [...seen.entries()].filter(([, n]) => n > 1);
        return dups.length === 0 || dups.length + ' collisions, e.g. ' + dups[0][0];
    });
}
check('BTN vs BB single-raised and 3-bet share no id', () => {
    const srp = LEVELS[8].filter(s => s.position === 'BTN' && s.vsPosition === 'BB' && s.potType === 'SRP').map(s => s.id);
    const tb = LEVELS[8].filter(s => s.position === 'BTN' && s.vsPosition === 'BB' && s.potType === '3BET').map(s => s.id);
    if (!srp.length || !tb.length) return 'one of the two matchups produced nothing';
    const overlap = srp.filter(i => tb.includes(i));
    return overlap.length === 0 || 'overlapping ids: ' + overlap.slice(0, 3).join(',');
});

section('Pot geometry is street- and pot-type-correct');
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' every scenario carries a potSize', () =>
        LEVELS[lvl].every(s => typeof s.potSize === 'number' && s.potSize > 0)
        || 'missing potSize');
    check('L' + lvl + ' every scenario carries a reduced effectiveStack', () =>
        LEVELS[lvl].every(s => typeof s.effectiveStack === 'number' && s.effectiveStack > 0 && s.effectiveStack < s.stackDepth)
        || 'missing or full effectiveStack');
}
check('3-bet pot flop is far larger than single-raised flop', () => {
    const srp = LEVELS[8].find(s => s.potType === 'SRP');
    const tb = LEVELS[8].find(s => s.potType === '3BET');
    if (!srp || !tb) return 'matchup missing';
    return tb.potSize > srp.potSize * 3 || '3bet ' + tb.potSize + ' vs srp ' + srp.potSize;
});
check('SRP pot grows flop < turn < river', () => {
    const pick = (lvl) => LEVELS[lvl].find(s => s.potType === 'SRP');
    const f = pick(8), t = pick(9), r = pick(10);
    return (f.potSize < t.potSize && t.potSize < r.potSize)
        || 'flop ' + f.potSize + ' turn ' + t.potSize + ' river ' + r.potSize;
});
check('river SPR is single digit, not 16+', () => {
    const bad = LEVELS[10].filter(s => s.effectiveStack / s.potSize > 10);
    return bad.length === 0 || bad.length + ' river spots with SPR > 10, e.g. ' + bad[0].id;
});
check('chips are conserved: pot + 2 stacks <= 2 x starting stack', () => {
    const bad = [];
    for (const lvl of [8, 9, 10]) {
        for (const s of LEVELS[lvl]) {
            if (s.potSize + s.effectiveStack * 2 > s.stackDepth * 2 + 1) bad.push(s.id);
        }
    }
    return bad.length === 0 || bad.length + ' violations, e.g. ' + bad[0];
});

section('DeterministicGTOEngine passes the geometry through');
const engine = new DeterministicGTOEngine();
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' question pot matches scenario pot (not the 6bb default)', () => {
        const s = LEVELS[lvl][0];
        const q = engine.generateFromPostflopEngine({}, lvl, [], s);
        if (!q) return 'no question produced';
        return (q.scenario.pot === s.potSize && q.scenario.heroStack === s.effectiveStack)
            || 'pot ' + q.scenario.pot + ' vs ' + s.potSize + ', stack ' + q.scenario.heroStack + ' vs ' + s.effectiveStack;
    });
}

section('3-bet pots use 3-bet-pot solver frequencies');
check('3-bet pot c-bet frequency comes from the 3-bet table', () => {
    const { getEnhancedCbetStrategy } = require(path.join(ROOT, 'src/engines/PostflopStrategyEngine.js'));
    const cands = LEVELS[8].filter(x => x.potType === '3BET' && x.isPFR);
    for (const s of cands) {
        const srpFreq = getEnhancedCbetStrategy(s.board, s.posContext, s.heroCards, {}).frequency;
        const tbFreq = getEnhancedCbetStrategy(s.board, s.posContext, s.heroCards, { is3BetPot: true }).frequency;
        if (srpFreq === tbFreq) continue; // uninformative hand class
        if (s.strategy.frequency !== tbFreq) {
            return 'scenario shipped ' + s.strategy.frequency + '; 3-bet table says ' + tbFreq + ', SRP table says ' + srpFreq;
        }
        return true;
    }
    return 'no 3-bet scenario where the two tables disagree';
});

section('Options are internally consistent');
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' exactly one option is flagged correct', () => {
        const bad = LEVELS[lvl].filter(s => (s.options || []).filter(o => o.isCorrect).length !== 1);
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
    check('L' + lvl + ' flagged option matches scenario.correctAction', () => {
        const bad = LEVELS[lvl].filter(s => {
            const c = (s.options || []).find(o => o.isCorrect);
            return !c || c.action !== s.correctAction;
        });
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
    check('L' + lvl + ' option frequencies sum to ~100', () => {
        const bad = LEVELS[lvl].filter(s => Math.abs((s.options || []).reduce((a, o) => a + (o.frequency || 0), 0) - 100) > 2);
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
}
