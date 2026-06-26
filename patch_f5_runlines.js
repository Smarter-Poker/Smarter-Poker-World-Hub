const fs = require('fs');

const path = 'pages/api/mlb/best-bets.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Add topF5Runlines
content = content.replace('let topF5Moneylines: any[] = [];', 'let topF5Runlines: any[] = [];\n    let topF5Moneylines: any[] = [];');
content = content.replace('let dedupedF5ML: any[] = [];', 'let dedupedF5RL: any[] = [];\n    let dedupedF5ML: any[] = [];');

// 2. Add query to Promise.all
const q1 = `mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['f5_moneyline', 'f5_money_line']),`;
const q2 = `mlbDb.from('pred_market_output').select('*').gte('as_of_ts', startIso).lt('as_of_ts', endIso).in('market', ['f5_run_line', 'first_5_run_line', 'f5_spread']),
        ${q1}`;
content = content.replace(q1, q2);

// 3. Add to destructured array
const destructured1 = `const [mlData, rlData, totData, hrBestBetsData, hrPropsData, f5mlData, f5totData, f5teamTotData, teamTotData, nrfiData] = await Promise.all([`;
const destructured2 = `const [mlData, rlData, totData, hrBestBetsData, hrPropsData, f5rlData, f5mlData, f5totData, f5teamTotData, teamTotData, nrfiData] = await Promise.all([`;
content = content.replace(destructured1, destructured2);

// 4. Dedupe
const dedupe1 = `if (f5mlData.data && f5mlData.data.length > 0) dedupedF5ML = dedupeLatestBets(f5mlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);`;
const dedupe2 = `if (f5rlData.data && f5rlData.data.length > 0) dedupedF5RL = dedupeLatestBets(f5rlData.data).sort((a,b) => b.edge_pts - a.edge_pts).slice(0, 10);
      ${dedupe1}`;
content = content.replace(dedupe1, dedupe2);

// 5. Enrich array mapping
const spread1 = `...enrichWithMatchupStub(dedupedF5ML, 'line'),`;
const spread2 = `...enrichWithMatchupStub(dedupedF5RL, 'line'),
      ${spread1}`;
content = content.replace(spread1, spread2);

// 6. Slice from allEnriched
const slice1 = `topF5Moneylines = allEnriched.slice(offset, offset + dedupedF5ML.length); offset += dedupedF5ML.length;`;
const slice2 = `topF5Runlines = allEnriched.slice(offset, offset + dedupedF5RL.length); offset += dedupedF5RL.length;
    ${slice1}`;
content = content.replace(slice1, slice2);

// 7. Output in JSON
const out1 = `topF5Moneylines,`;
const out2 = `topF5Runlines,
        ${out1}`;
content = content.replace(out1, out2);

fs.writeFileSync(path, content);
console.log("Patched best-bets.ts for F5 Run Lines!");
