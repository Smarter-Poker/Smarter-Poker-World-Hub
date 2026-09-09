/* Postflop scenario generator: ids, pot geometry, option consistency. */
'use strict';
const path = require('path');
const { check, section, ROOT } = require('../engine-correctness-harness');

const G = require(path.join(ROOT, 'src/engines/PostflopScenarioGenerator.js'));
const { DeterministicGTOEngine } = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));
const { pickWeightedHandFromScenario } = require(path.join(ROOT, 'src/games/SolverScenarioGenerator.js'));
const SCENARIO_DB = require(path.join(ROOT, 'src/games/ScenarioDatabase.js'));
const EV = require(path.join(ROOT, 'src/engines/EVCalculator.js'));
const { scoreAction } = require(path.join(ROOT, 'src/engines/ActionTreeEngine.js'));
const { analyzeHand } = require(path.join(ROOT, 'src/engines/HandAnalyzer.js'));

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

section('Illustrative local bridge preserves geometry and authority');
const engine = new DeterministicGTOEngine();
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' local-practice question preserves pot and rejects solver authority', () => {
        const s = LEVELS[lvl][0];
        const q = engine.generateFromPostflopEngine({}, lvl, [], s);
        if (!q) return 'no question produced';
        return (
            q.scenario.pot === s.potSize
            && q.scenario.heroStack === s.effectiveStack
            && q.type === 'PRACTICE'
            && q.source === 'LOCAL_POSTFLOP_HEURISTIC'
            && q.practiceOnly === true
            && q.solverVerified === false
            && q.evData === null
            && !Object.prototype.hasOwnProperty.call(q, 'gtoFrequencies')
        ) || 'bridge exposed authoritative or malformed output';
    });
}
check('local bridge fails closed when provenance is absent', () => {
    const unmarked = { ...LEVELS[8][0] };
    delete unmarked.authority;
    delete unmarked.practiceOnly;
    delete unmarked.solverVerified;
    delete unmarked.authoritative;
    return engine.generateFromPostflopEngine({}, 8, [], unmarked) === null
        || 'unmarked scenario was accepted';
});
check('preflop matrix hand picker rejects postflop local practice', () => (
    pickWeightedHandFromScenario(LEVELS[8][0]) === null
    || 'postflop scenario was converted into a fabricated preflop answer'
));
check('local EV comparisons declare that they are neither solved nor measured', () => {
    const result = EV.calculateActionEVs({
        holeCards: ['Ah', 'Kd'],
        board: ['Qs', '7h', '2c'],
        potSize: 10,
        effectiveStack: 100,
        street: 'flop',
        position: 'IP',
        isPFR: true,
        currentBet: 0,
    });
    return (
        result.authority === 'illustrative_local_estimate'
        && result.solverVerified === false
        && result.exactEVAvailable === false
        && result.evLossMeasured === false
        && result.practiceOnly === true
    ) || 'local EV estimator omitted its authority boundary';
});
check('ActionTree refuses to grade the local postflop heuristic', () => {
    const result = scoreAction({ action: 'check' }, LEVELS[8][0].strategy, 10);
    return (
        result.score === null
        && result.evLoss === null
        && result.classification === 'practice_only'
        && result.solverVerified === false
    ) || 'local heuristic received an authoritative-looking score';
});
check('hand-history compatibility analysis leaves local postflop decisions unpriced', () => {
    const analyzed = analyzeHand({
        id: 'local-authority-boundary',
        hero: { id: 'hero', name: 'Hero', position: 'BTN', holeCards: ['Ah', 'Kd'] },
        players: [
            { id: 'hero', name: 'Hero', position: 'BTN', stack: 100 },
            { id: 'villain', name: 'Villain', position: 'BB', stack: 100 },
        ],
        streets: {
            preflop: { actions: [] },
            flop: {
                board: ['Qs', '7h', '2c'],
                actions: [{ player: 'Hero', position: 'BTN', isHero: true, action: 'check', amount: 0 }],
            },
            turn: null,
            river: null,
        },
    });
    const decision = analyzed.decisions?.[0];
    return (
        decision?.classification === 'unpriced'
        && decision.gtoAction == null
        && decision.solverVerified === false
        && decision.evLossMeasured === false
        && analyzed.summary?.accuracy === null
    ) || 'local hand-history estimate leaked into an authoritative grade';
});
for (const lvl of [8, 9, 10]) {
    check('L' + lvl + ' compatibility export preserves its real postflop catalog', () => {
        const exported = SCENARIO_DB[`LEVEL_${lvl}_SCENARIOS`];
        const selected = SCENARIO_DB.getScenariosByLevel(lvl);
        return (
            exported.length > 0
            && exported.length === selected.length
            && exported[0].id === selected[0].id
            && exported[0].practiceOnly === true
        ) || 'compatibility export aliased or stripped local provenance';
    });
}

section('3-bet pots use their dedicated local teaching weights');
check('3-bet pot c-bet weight comes from the 3-bet heuristic table', () => {
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
    check('L' + lvl + ' every scenario carries non-authoritative provenance', () => {
        const bad = LEVELS[lvl].filter(s => !(
            s.authority === 'illustrative_local_heuristic'
            && s.authoritative === false
            && s.solverVerified === false
            && s.practiceOnly === true
            && s.exactEVAvailable === false
            && s.solverGenerated === false
        ));
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
    check('L' + lvl + ' options contain no invented exact EV deltas', () => {
        const bad = LEVELS[lvl].filter(s => (s.options || []).some(o => Object.prototype.hasOwnProperty.call(o, 'evDelta')));
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
    check('L' + lvl + ' every option labels feedback as illustrative local output', () => {
        const bad = LEVELS[lvl].filter(s => (s.options || []).some(o => !String(o.feedback || '').startsWith('Illustrative local model:')));
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
    check('L' + lvl + ' every local practice scenario has exactly four distinct choices', () => {
        const bad = LEVELS[lvl].filter(s => {
            const options = s.options || [];
            return options.length !== 4 || new Set(options.map(o => String(o.label).trim().toLowerCase())).size !== 4;
        });
        return bad.length === 0 || bad.length + ' scenarios, e.g. ' + bad[0].id;
    });
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
