require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tables, error } = await supabase.from('commander_tables').select('*, commander_games!commander_games_table_id_fkey(*)').eq('venue_id', 292499).order('table_number');
  if (error) { console.error(error); return; }
  console.log("TABLES: " + tables.length);
  tables.forEach(t => {
      const g = (t.commander_games || []).find(x => x.status !== 'closed');
      const tGame = (t.game_type || g?.game_type || '').toUpperCase();
      const tStakes = (t.stakes || g?.stakes || '').trim();
      console.log(`T${t.table_number}: ${tGame} ${tStakes} | active: ${t.is_active} | status: ${t.status}`);
  });
})();
