const fs = require('fs');
const file = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/api/mlb/best-bets.ts';
let content = fs.readFileSync(file, 'utf8');

const padBetsStr = `
async function padBets(betsArr: any[], targetDate: string, mlbDb: any): Promise<any[]> {
  if (!targetDate) return betsArr;
  try {
    const { data: fallbackBets } = await mlbDb
      .from('pred_mlb_predictions')
      .select('*')
      .eq('official_date', targetDate)
      .order('bet_score', { ascending: false })
      .limit(500);

    if (!fallbackBets || fallbackBets.length === 0) return betsArr;

    let padded = [...betsArr];
    const cats: Record<string, number> = {
      moneyline: 0,
      run_line: 0,
      total: 0,
      home_run: 0,
      pitching_outs: 0,
      pitcher_strikeouts: 0,
      hitter_bases: 0,
      hitter_hits: 0,
      hitter_rbis: 0,
      f5_moneyline: 0,
      f5_total: 0,
      f5_runline: 0,
      team_total: 0,
    };

    const getCat = (b: any) => {
      const m = (b.market || '').toLowerCase();
      const bt = (b.bet_type || '').toLowerCase();
      if (bt === 'line' && (m === 'h2h' || m === 'moneyline')) return 'moneyline';
      if (bt === 'line' && (m === 'run_line' || m === 'runline' || m === 'spread')) return 'run_line';
      if (bt === 'line' && m === 'total') return 'total';
      if (m === 'home_run' || m === 'hr' || m.includes('home_run')) return 'home_run';
      if (m === 'pitching_outs') return 'pitching_outs';
      if (m === 'pitcher_strikeouts') return 'pitcher_strikeouts';
      if (m === 'hitter_bases' || m === 'total_bases') return 'hitter_bases';
      if (m === 'hitter_hits') return 'hitter_hits';
      if (m === 'hitter_rbis') return 'hitter_rbis';
      if (m === 'first_five_innings' || m === 'first_5_innings' || m === 'f5' || m === 'f5_moneyline') return 'f5_moneyline';
      if (m === 'f5_total' || m === 'f5_team_total') return 'f5_total';
      if (m === 'f5_runline') return 'f5_runline';
      if (m === 'team_total') return 'team_total';
      return null;
    };

    const existingIds = new Set<string>();
    padded.forEach((b: any) => {
      const cat = getCat(b);
      if (cat) cats[cat]++;
      existingIds.add(b.id || \`\${b.game_pk}-\${b.selection}-\${b.market}\`);
    });

    for (const fb of fallbackBets) {
      const cat = getCat(fb);
      const fbid = fb.id || \`\${fb.game_pk}-\${fb.selection}-\${fb.market}\`;
      if (cat && cats[cat] < 3 && !existingIds.has(fbid)) {
        padded.push(fb);
        cats[cat]++;
        existingIds.add(fbid);
      }
    }
    return padded;
  } catch (err) {
    console.error('Error padding bets:', err);
    return betsArr;
  }
}
`;

content = content.replace('async function edgeHandler(req: Request) {', padBetsStr + '\nasync function edgeHandler(req: Request) {');
content = content.replace('const enriched = await enrichBets(betsArr, mlbDb);', 'const paddedBetsArr = await padBets(betsArr, officialDate, mlbDb);\n      const enriched = await enrichBets(paddedBetsArr, mlbDb);');
content = content.replace('const enrichedBets = await enrichBets(rawBets, mlbDb);', 'const paddedBets = await padBets(rawBets, data?.officialDate, mlbDb);\n    const enrichedBets = await enrichBets(paddedBets, mlbDb);');

fs.writeFileSync(file, content);
