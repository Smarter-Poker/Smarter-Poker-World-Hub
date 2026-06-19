import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Fetching teams from MLB Stats API...');
  const teamsRes = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1');
  const teamsData = (await teamsRes.json()) as any;
  const teams = teamsData.teams || [];

  const dimTeams: any[] = [];
  const aggTeams: any[] = [];

  for (const team of teams) {
    const team_id = team.id;
    const name = team.name;
    const abbr = team.abbreviation || team.teamName;
    const league = team.league?.name === 'National League' ? 'NL' : 'AL';
    const division = team.division?.name || 'Unknown';

    dimTeams.push({
      team_id,
      name,
      abbr,
      league,
      division,
      w: Math.floor(Math.random() * 50) + 40,
      l: Math.floor(Math.random() * 50) + 40,
      pct: 0.5,
      gb: Math.floor(Math.random() * 10),
      win_streak: Math.floor(Math.random() * 5) * (Math.random() > 0.5 ? 1 : -1),
      runs_scored: Math.floor(Math.random() * 100) + 300,
      runs_allowed: Math.floor(Math.random() * 100) + 300,
      games_played: 90
    });

    aggTeams.push({
      team_id,
      window_kind: 'season',
      era: (Math.random() * 2 + 3).toFixed(2),
      avg: (Math.random() * 0.05 + 0.220).toFixed(3),
    });
  }

  dimTeams.forEach(t => t.pct = +(t.w / (t.w + t.l)).toFixed(3));

  console.log(`Upserting ${dimTeams.length} teams...`);
  await supabase.from('dim_teams').upsert(dimTeams);
  await supabase.from('agg_team').upsert(aggTeams);

  console.log('Fetching players for each team...');
  const hitters: any[] = [];
  const pitchers: any[] = [];

  for (const team of teams) {
    const rosterRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${team.id}/roster`);
    const rosterData = (await rosterRes.json()) as any;
    const roster = rosterData.roster || [];

    for (const p of roster) {
      if (p.position.abbreviation === 'P') {
        pitchers.push({
          player_id: p.person.id,
          full_name: p.person.fullName,
          team_id: team.id,
          fip: (Math.random() * 2 + 3).toFixed(2),
          siera: (Math.random() * 2 + 3).toFixed(2),
          bf: Math.floor(Math.random() * 500) + 50
        });
      } else {
        hitters.push({
          player_id: p.person.id,
          full_name: p.person.fullName,
          team_id: team.id,
          wrc_plus: Math.floor(Math.random() * 80) + 70,
          woba: (Math.random() * 0.15 + 0.250).toFixed(3),
          pa: Math.floor(Math.random() * 400) + 100
        });
      }
    }
  }

  console.log(`Upserting ${hitters.length} hitters and ${pitchers.length} pitchers...`);
  await supabase.from('v_hitter_profile').upsert(hitters);
  await supabase.from('v_pitcher_profile').upsert(pitchers);

  console.log('Done!');
}

main().catch(console.error);
