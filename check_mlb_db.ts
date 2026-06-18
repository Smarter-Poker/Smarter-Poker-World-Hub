import { getMlbSupabase } from './utils/supabase/mlb';

const supabase = getMlbSupabase();

async function introspect() {
  console.log("Checking pred_props...");
  const { data: props, error: propsErr } = await supabase.from('pred_props').select('*').limit(1);
  if (propsErr) console.error("Error querying pred_props:", propsErr);
  else console.log("pred_props columns:", props && props.length > 0 ? Object.keys(props[0]) : "Empty table");

  console.log("\nChecking fct_games (live tracker)...");
  const { data: games, error: gamesErr } = await supabase.from('fct_games').select('*').limit(1);
  if (gamesErr) console.error("Error querying fct_games:", gamesErr);
  else console.log("fct_games columns:", games && games.length > 0 ? Object.keys(games[0]) : "Empty table");
  
  console.log("\nChecking dim_teams...");
  const { data: teams, error: teamsErr } = await supabase.from('dim_teams').select('*').limit(1);
  if (teamsErr) console.error("Error querying dim_teams:", teamsErr);
  else console.log("dim_teams columns:", teams && teams.length > 0 ? Object.keys(teams[0]) : "Empty table");
}

introspect();
