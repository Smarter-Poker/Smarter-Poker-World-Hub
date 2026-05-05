import { RFI, RFI_50BB, BB_DEFENSE, SHOVE_FOLD } from './src/config/solverRanges.js';

// Mirror the lookupHandFrequency logic
function lookup(hand, position, sd, scenarioTitle) {
    const title = (scenarioTitle || '').toLowerCase();
    let table = null;
    if (title.includes('3-bet') && title.includes('defense')) {
        table = BB_DEFENSE.vs_CO || BB_DEFENSE.vs_BTN || null;
    } else if (title.includes('push') || title.includes('shove')) {
        const buckets = Object.keys(SHOVE_FOLD).map(k => ({key:k,bb:parseInt(k,10)})).filter(b=>Number.isFinite(b.bb)).sort((a,b)=>a.bb-b.bb);
        let bk = buckets[0]?.key;
        for (const b of buckets) if (b.bb <= sd) bk = b.key;
        table = bk && SHOVE_FOLD[bk] && SHOVE_FOLD[bk][position] || null;
    } else {
        const rfi = sd <= 75 ? RFI_50BB : RFI;
        table = rfi[position] || null;
    }
    return table?.[hand] || null;
}

console.log('═══ Live solver lookups for explain-hand ═══');
console.log('JTs from CO @ 100bb (open-raise):', JSON.stringify(lookup('JTs', 'CO', 100, 'Open Raise Range')));
console.log('22 from UTG @ 100bb (open-raise):', JSON.stringify(lookup('22', 'UTG', 100, 'Open Raise Range')));
console.log('AKs from BTN @ 50bb:', JSON.stringify(lookup('AKs', 'BTN', 50, 'Open Raise Range')));
console.log('AA from BTN @ 12bb push/fold:', JSON.stringify(lookup('AA', 'BTN', 12, 'Push/Fold')));
console.log('72o from CO (out of range):', JSON.stringify(lookup('72o', 'CO', 100, 'Open Raise Range')));
