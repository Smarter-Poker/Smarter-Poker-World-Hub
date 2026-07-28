/* pages/api/training question construction. */
'use strict';
const path = require('path');
const fs = require('fs');
const { check, section, ROOT } = require('../engine-correctness-harness');

const { selectServedOptions } = require(path.join(ROOT, 'src/utils/trainingApiUtils.js'));

// A five-action solver node with the argmax at index 4 — the exact shape that
// `readableActions.slice(0, 4)` used to drop.
const FIVE_ACTIONS = [
    { id: 'f', text: 'Fold', frequency: 0.05 },
    { id: 'c', text: 'Check', frequency: 0.10 },
    { id: 'b33', text: 'Bet 33%', frequency: 0.08 },
    { id: 'b75', text: 'Bet 75%', frequency: 0.12 },
    { id: 'b150', text: 'Overbet 150%', frequency: 0.65 },
];

section('The correct answer is always one of the offered options');
check('argmax at index 4 of 5 survives selection', () => {
    const { options } = selectServedOptions(FIVE_ACTIONS, 'b150', 4);
    return options.some(o => o.id === 'b150')
        || 'served ' + options.map(o => o.id).join(',');
});
check('the naive slice(0,4) would have dropped it (guard is meaningful)', () =>
    !FIVE_ACTIONS.slice(0, 4).some(a => a.id === 'b150')
    || 'fixture no longer exercises the bug');
check('at most 4 options are served', () => {
    const { options } = selectServedOptions(FIVE_ACTIONS, 'b150', 4);
    return options.length === 4 || 'served ' + options.length;
});
check('served options are the four most-played actions', () => {
    const { options } = selectServedOptions(FIVE_ACTIONS, 'b150', 4);
    return options.map(o => o.id).sort().join(',') === 'b150,b33,b75,c'
        || options.map(o => o.id).join(',');
});
check('an optimalAction outside the top four is forced back in', () => {
    const odd = [...FIVE_ACTIONS];
    const { options } = selectServedOptions(odd, 'f', 4); // 'f' is the least played
    return options.some(o => o.id === 'f') || options.map(o => o.id).join(',');
});
check('frequency bars cover exactly the served options', () => {
    const { options, gtoFrequencies } = selectServedOptions(FIVE_ACTIONS, 'b150', 4);
    const ids = options.map(o => o.id).sort().join(',');
    const keys = Object.keys(gtoFrequencies).sort().join(',');
    return ids === keys || 'options ' + ids + ' vs bars ' + keys;
});
check('frequency bars sum to exactly 100 after truncation', () => {
    const { gtoFrequencies } = selectServedOptions(FIVE_ACTIONS, 'b150', 4);
    const sum = Object.values(gtoFrequencies).reduce((a, b) => a + b, 0);
    return sum === 100 || 'sum ' + sum;
});
check('a 3-action node is served unchanged and still sums to 100', () => {
    const three = FIVE_ACTIONS.slice(0, 3);
    const { options, gtoFrequencies } = selectServedOptions(three, 'c', 4);
    const sum = Object.values(gtoFrequencies).reduce((a, b) => a + b, 0);
    return (options.length === 3 && sum === 100) || options.length + ' opts, sum ' + sum;
});
check('an empty action list does not throw', () => {
    const r = selectServedOptions([], 'x', 4);
    return (r.options.length === 0 && Object.keys(r.gtoFrequencies).length === 0) || JSON.stringify(r);
});

section('get-question uses the guarded selection');
const gq = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
check('get-question no longer slices readableActions blind', () => {
    // ignore comment lines, which quote the old expression on purpose
    const code = gq.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    return !/readableActions\.slice\(0,\s*4\)/.test(code)
        || 'still slicing the solver-ordered list';
});
check('get-question serves the guarded option set', () =>
    /options: servedOptions,/.test(gq)
    || 'options are not the guarded selection');
check('get-question does not hard-code "Villain checks" for every postflop node', () =>
    !/street !== 'preflop' \? 'Villain checks'/.test(gq)
    || 'still claims the villain checked regardless of who acts first');
check('get-question derives the action line from the postflop order', () =>
    /heroActsFirstPostflop\(/.test(gq)
    || 'no reference to the shared postflop action order');
