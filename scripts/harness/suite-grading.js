/* Move classification and frequency simulation. */
'use strict';
const path = require('path');
const { check, section, ROOT } = require('../engine-correctness-harness');

const W = require(path.join(ROOT, 'src/hooks/useGTOWScore.js'));
const S = require(path.join(ROOT, 'src/engines/GTOScoreEngine.js'));

section('classifyMove must not invent a solver frequency');
check('correctAnswer missing from the map does not manufacture a 100% frequency', () => {
    const r = W.classifyMove('c', 'ZZZ', { a: 60, b: 40, c: 0 });
    return r.correctFreq === 60 || 'correctFreq ' + r.correctFreq;
});
check('correctAnswer missing from the map does not manufacture BLUNDER on a mixed spot', () => {
    const r = W.classifyMove('c', 'ZZZ', { a: 60, b: 40, c: 0 });
    return r.classification === 'wrong' || 'classification ' + r.classification;
});
check('correctAnswer missing from the map does not report a 100% frequency gap', () => {
    const r = W.classifyMove('c', 'ZZZ', { a: 60, b: 40, c: 0 });
    return r.frequencyDiff === 60 || 'frequencyDiff ' + r.frequencyDiff;
});
check('a genuinely pure spot still grades BLUNDER', () => {
    const r = W.classifyMove('b', 'a', { a: 95, b: 0, c: 5 });
    return r.classification === 'blunder' || 'classification ' + r.classification;
});
check('a 0%-action in a mixed spot still grades WRONG', () => {
    const r = W.classifyMove('c', 'a', { a: 55, b: 45, c: 0 });
    return r.classification === 'wrong' || 'classification ' + r.classification;
});

section('classifyMove must not label a 0%-frequency answer "Best Move"');
check('exact match on an action the solver plays 0% is not BEST', () => {
    const r = W.classifyMove('c', 'c', { a: 60, b: 40, c: 0 });
    return r.classification !== 'best' || 'still best while the panel shows 0%';
});
check('...but the player is still graded correct, not punished', () => {
    const r = W.classifyMove('c', 'c', { a: 60, b: 40, c: 0 });
    return (['best', 'correct'].includes(r.classification) && r.evLoss === 0)
        || 'classification ' + r.classification + ' evLoss ' + r.evLoss;
});
check('exact match on the real argmax is still BEST', () => {
    const r = W.classifyMove('a', 'a', { a: 60, b: 40, c: 0 });
    return r.classification === 'best' || 'classification ' + r.classification;
});
check('a 38% action in a 62/38 mix is still BEST', () => {
    const r = W.classifyMove('b', 'a', { a: 62, b: 38 });
    return r.classification === 'best' || 'classification ' + r.classification;
});

section('GTOScoreEngine.classifyMove must not call an unknown cost a blunder');
check('undefined EV loss does not grade BLUNDER', () =>
    S.classifyMove(undefined).key !== 'blunder' || 'graded blunder');
check('NaN EV loss does not grade BLUNDER', () =>
    S.classifyMove(NaN).key !== 'blunder' || 'graded blunder');
check('a real 5bb loss still grades BLUNDER', () =>
    S.classifyMove(5).key === 'blunder' || 'graded ' + S.classifyMove(5).key);
check('a real 0.1bb loss still grades correct', () =>
    S.classifyMove(0.1).key === 'correct' || 'graded ' + S.classifyMove(0.1).key);

section('simulateGTOFrequencies always sums to 100');
check('every option count / level / correctAnswer combination sums to exactly 100', () => {
    const bad = [];
    for (let n = 2; n <= 6; n++) {
        const opts = [...Array(n)].map((_, i) => ({ id: 'o' + i }));
        for (let lvl = 1; lvl <= 10; lvl++) {
            for (const ca of ['o0', 'o1', 'MISSING', '']) {
                const f = W.simulateGTOFrequencies(opts, ca, lvl);
                const sum = Object.values(f).reduce((a, b) => a + b, 0);
                if (sum !== 100) bad.push({ n, lvl, ca, sum });
            }
        }
    }
    return bad.length === 0 || bad.length + ' combinations off 100, e.g. ' + JSON.stringify(bad[0]);
});
check('no solver distribution at all still refuses the two worst tiers', () => {
    const r = W.classifyMove('b', 'a', { a: 0, b: 0 });
    return (r.noSolverData === true && !['wrong', 'blunder'].includes(r.classification))
        || 'classification ' + r.classification;
});
