const fs = require('fs');
let code = fs.readFileSync('pages/api/mlb/best-bets.ts', 'utf-8');

const replacement = `  const gamePks = Array.from(
    new Set(betsArr.map((b: any) => Number(b.game_pk)).filter((x) => Number.isFinite(x)))
  );
  const aggSinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // 1. Fetch slates first to get opposing pitchers
  let slates: any[] = [];
  try {
    slates = await fetchAllRows(() => mlbDb.from('v_daily_slate').select('game_pk, home_pitcher, away_pitcher'));
  } catch(e) {}

  // Extract all required player IDs and names
  const uniquePlayerIds = Array.from(new Set(betsArr.map(b => b.player_id).filter(id => id != null)));
  const uniqueNames = new Set<string>();
  betsArr.forEach(b => {
    if (b.player_name) uniqueNames.add(b.player_name);
    if (b.selection) uniqueNames.add(b.selection);
  });
  slates.forEach(s => {
    if (s.home_pitcher) uniqueNames.add(s.home_pitcher);
    if (s.away_pitcher) uniqueNames.add(s.away_pitcher);
  });
  const uniquePlayerNames = Array.from(uniqueNames).filter(n => n.trim().length > 0);

  // Format array for Supabase .or()
  const idsStr = uniquePlayerIds.length > 0 ? \`player_id.in.(\${uniquePlayerIds.join(',')})\` : 'player_id.in.(-1)';
  const namesStr = uniquePlayerNames.length > 0 ? \`full_name.in.(\${uniquePlayerNames.map(n => '"' + n.replace(/"/g, '""') + '"').join(',')})\` : 'full_name.in.("")';
  const orFilter = \`\${idsStr},\${namesStr}\`;

  let hitters: any[] = [];
  let pitchers: any[] = [];
  let aggPitchers: any[] = [];
  let games: any[] = [];
  let teamStats: any[] = [];
  try {
    [hitters, pitchers, aggPitchers, games, teamStats] = await Promise.all([
      fetchAllRows(() => mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id, woba, wrc_plus, pa, splits').or(orFilter)),
      fetchAllRows(() => mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera').or(orFilter)),
      fetchAllRows(() =>
        mlbDb
          .from('agg_pitcher')
          .select('pitcher_id, era, w, l, so, bb, h, ip, as_of')
          .eq('window_kind', 'fg_season')
          .gte('as_of', aggSinceIso)
          .order('as_of', { ascending: false })
      ),
      fetchAllRows(() =>
        mlbDb
          .from('fact_games')
          .select('game_pk, first_pitch_utc, home_team_id, away_team_id')
          .in('game_pk', gamePks.length ? gamePks : [-1])
      ),
      fetchAllRows(() => mlbDb.from('v_mlb_standings').select('*')),
    ]);
  } catch (e: any) {
    console.warn('[MLB Best Bets] enrichment fetch error:', e?.message || e);
  }`;

code = code.replace(/const gamePks = Array\.from\([\s\S]*?console\.warn\('\[MLB Best Bets\] enrichment fetch error:', e\?\.message \|\| e\);\n  \}/, replacement);

fs.writeFileSync('pages/api/mlb/best-bets.ts', code);
