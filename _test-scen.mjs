import { RFI, RFI_20BB, RFI_50BB, RFI_200BB, THREE_BET, BB_DEFENSE, FOUR_BET, SQUEEZE, COLD_CALL, SB_COMPLETE, SHOVE_FOLD, BB_CALL_VS_SHOVE } from './src/config/solverRanges.js';

const ACTION_NORMALIZE = { shove: 'allin', jam: 'allin', complete: 'call' };
function topAction(freqs) {
    if (!freqs) return null;
    const e = Object.entries(freqs).filter(([, v]) => typeof v === 'number' && v > 0);
    if (!e.length) return null;
    e.sort((a,b) => b[1]-a[1]);
    return e[0];
}
function freqsToSolutionEntry(freqs) {
    const top = topAction(freqs);
    if (!top) return 'fold';
    const [raw, freq] = top;
    const action = ACTION_NORMALIZE[raw] || raw;
    if (freq >= 0.95) return action;
    return action + Math.round(freq * 100);
}
function rangeToSolution(range) {
    if (!range) return {};
    const out = {};
    for (const [hand, freqs] of Object.entries(range)) {
        out[hand] = freqsToSolutionEntry(freqs);
    }
    return out;
}

// Test push/fold @ 12bb (should pick '10BB' bucket)
const buckets = Object.keys(SHOVE_FOLD).map(k => ({key:k, bb:parseInt(k,10)})).filter(b => Number.isFinite(b.bb)).sort((a,b)=>a.bb-b.bb);
let bk = buckets[0].key;
for (const b of buckets) { if (b.bb <= 12) bk = b.key; }
const sol3 = rangeToSolution(SHOVE_FOLD[bk]?.BTN || {});
console.log('PUSH/FOLD BTN @ 12bb (bucket=' + bk + '):', Object.keys(sol3).length, 'hands. AA:', sol3.AA, '22:', sol3['22'], '65s:', sol3['65s']);

// Test SQUEEZE
const sqzKeys = ['BTN_vs_UTG_open_MP_call', 'SB_vs_CO_open_BTN_call', 'BB_vs_CO_open_BTN_call'];
for (const k of sqzKeys) {
    const sol = rangeToSolution(SQUEEZE[k] || {});
    console.log('SQUEEZE', k + ':', Object.keys(sol).length, 'hands. AA:', sol.AA, 'AKs:', sol.AKs);
}

// Test SB complete (flat shape)
const sol5 = rangeToSolution(SB_COMPLETE || {});
console.log('SB_COMPLETE flat shape:', Object.keys(sol5).length, 'hands. AA:', sol5.AA, 'KQs:', sol5.KQs);

// Validate every entry
const validRegex = /^(raise|call|3bet|4bet|fold|check|allin|jam)\d*$/;
let total=0, invalid=0;
for (const sol of [sol3, sol5]) {
    for (const [, action] of Object.entries(sol)) {
        total++;
        if (!validRegex.test(action)) { invalid++; console.log('INVALID:', action); }
    }
}
console.log('VALIDATION:', total, 'entries,', invalid, 'invalid');
