require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tables } = await supabase.from('commander_tables').select('*, commander_games!commander_games_table_id_fkey(*)');
  const jaqkT = tables.filter(t => String(t.venue_id) === '292499');
  console.log(`Club JAQK has ${jaqkT.length} tables.`);
  jaqkT.forEach(t => {
      console.log(`T${t.table_number}: legacy_game='${t.game_type}' legacy_stakes='${t.stakes}' active=${t.is_active} status='${t.status}' games=${t.commander_games ? t.commander_games.length : 0}`);
      if (t.commander_games) {
          t.commander_games.forEach(g => console.log(`  - Game: ${g.game_type} ${g.stakes} status=${g.status}`));
      }
  });
})();
