require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tables, error } = await supabase.from('commander_tables').select('venue_id').limit(100);
  if (error) { console.error(error); return; }
  
  const venueIds = [...new Set(tables.map(t => t.venue_id))];
  console.log("Venue IDs with tables:", venueIds);
  
  for (const vid of venueIds) {
      const { data: tData } = await supabase.from('commander_tables').select('*, commander_games!commander_games_table_id_fkey(*)').eq('venue_id', vid).order('table_number');
      console.log(`Venue ${vid} has ${tData.length} tables`);
      if (tData.length > 0) {
          tData.forEach(t => {
              const g = (t.commander_games || []).find(x => x.status !== 'closed');
              const tGame = (t.game_type || g?.game_type || '').toUpperCase();
              const tStakes = (t.stakes || g?.stakes || '').trim();
              if (tGame === 'NLH' && tStakes === '1/2') {
                  console.log(`  T${t.table_number}: ${tGame} ${tStakes} | active: ${t.is_active} | status: ${t.status}`);
              }
          });
      }
  }
})();
