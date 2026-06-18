require('@next/env').loadEnvConfig('./');
const { createClient } = require('@supabase/supabase-js');
const url = process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const key = process.env.MLB_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 

const supabase = createClient(url, key);

async function check() {
  const { data: teams, error } = await supabase.from('v_team_profile').select('*').limit(3);
  if (error) console.error("Error fetching teams:", error);
  console.log("Team Streaks Sample:", JSON.stringify(teams?.map(t => t.streaks), null, 2));
  
  const { data: dimTeams } = await supabase.from('dim_teams').select('*').limit(1);
  console.log("dim_teams schema:", Object.keys(dimTeams?.[0] || {}));
  console.log("dim_teams sample:", dimTeams?.[0]);
  
  const { data: preds } = await supabase.from('pred_market_output').select('*').limit(1);
  console.log("pred_market_output schema:", Object.keys(preds?.[0] || {}));
  console.log("pred_market_output sample:", preds?.[0]);
}
check();
