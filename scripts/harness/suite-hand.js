/* Hand strength and draw classification. */
'use strict';
const path = require('path');
const { check, section, ROOT } = require('../engine-correctness-harness');

const H = require(path.join(ROOT, 'src/engines/HandStrengthEngine.js'));
const { classifyMadeHand, classifyDraws } = H;

section('A hand hero already holds is not a hand hero is drawing to');
check('a royal flush reports no draw', () => {
    const d = classifyDraws(['Ah', 'Kh'], ['Qh', 'Jh', 'Th']);
    return d.outs === 0 || d.description + ' outs=' + d.outs;
});
check('a made straight reports no straight draw', () => {
    const d = classifyDraws(['9h', '8d'], ['7c', '6s', '5d']);
    return !d.draws.some(x => /straight|gutshot|oesd/i.test(x)) || d.description;
});
check('a made flush reports no flush draw', () => {
    const d = classifyDraws(['Ah', '4h'], ['Kh', '9h', '2h']);
    return !d.draws.some(x => /flush/i.test(x)) || d.description;
});
check('a made straight contributes no phantom draw equity', () => {
    const d = classifyDraws(['9h', '8d'], ['7c', '6s', '5d']);
    return d.equity === 0 || 'equity ' + d.equity;
});

section('Real draws are still detected');
check('open-ended straight draw is still 8 outs', () => {
    const d = classifyDraws(['9h', '8c'], ['7d', '6s', '2c']);
    return d.outs >= 8 || d.description + ' outs=' + d.outs;
});
check('nut flush draw is still detected', () => {
    const d = classifyDraws(['Ah', '2h'], ['Kh', '7h', '3c']);
    return d.draws.some(x => /flush_draw/i.test(x)) || d.description;
});
check('gutshot is still 4 outs', () => {
    const d = classifyDraws(['Ah', 'Kd'], ['Qc', 'Jd', '2s']);
    return d.outs === 4 || d.description + ' outs=' + d.outs;
});
check('a monotone board hero has no card of grants no flush draw', () => {
    const d = classifyDraws(['Ah', 'Kd'], ['2c', '3c', '4c']);
    return !d.draws.some(x => /flush/i.test(x)) || d.description;
});

section('Made hand classification');
const madeCases = [
    [['Ah', 'Ad'], ['Ac', 'As', '2d'], 'quads'],
    [['5c', '5d'], ['5h', '9d', '9c'], 'full_house'],
    [['Ah', 'Kd'], ['Ac', '7h', '2c'], 'top_pair_top_kicker'],
    [['2h', '7d'], ['Ac', 'Ks', 'Qd'], 'nothing'],
];
for (const [hc, b, expected] of madeCases) {
    check('classifyMadeHand ' + hc.join('') + ' on ' + b.join('') + ' is ' + expected, () => {
        const m = classifyMadeHand(hc, b);
        return m.category === expected || 'got ' + m.category;
    });
}
check('hand strength rises monotonically with hand rank', () => {
    const air = classifyMadeHand(['2h', '7d'], ['Ac', 'Ks', 'Qd']).strength;
    const tp = classifyMadeHand(['Ah', 'Kd'], ['Ac', '7h', '2c']).strength;
    const fh = classifyMadeHand(['5c', '5d'], ['5h', '9d', '9c']).strength;
    const quads = classifyMadeHand(['Ah', 'Ad'], ['Ac', 'As', '2d']).strength;
    return (air < tp && tp < fh && fh < quads) || [air, tp, fh, quads].join(' < ');
});
