require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: tables } = await supabase.from('commander_tables').select('*, commander_games(*)').eq('venue_id', 292499).order('table_number');
  if (!tables) { console.log('No tables found'); return; }
  console.log("TABLES: " + tables.length);
  const getTableNums = (gameLabel) => {
    const parts = gameLabel.split(' ');
    const gameType = parts[0];
    const stakes = parts.slice(1).join(' ');
    return tables
      .filter(t => {
        if (t.is_active === false || t.status === 'maintenance') return false;
        const games = Array.isArray(t.commander_games) ? t.commander_games : [];
        const activeGame = games.find(g => g.status !== 'closed') || games[0];
        const tGame = (t.game_type || activeGame?.game_type || '').toUpperCase();
        const tStakes = (t.stakes || activeGame?.stakes || '').trim();
        if (tGame === gameType && tStakes === stakes) return true;
        if (tGame === gameType && !tStakes && !stakes) return true;
        return `${tGame} ${tStakes}`.trim() === gameLabel;
      })
      .map(t => t.table_number)
      .sort((a, b) => a - b);
  };
  console.log("NLH 1/2 Table Nums: ", getTableNums('NLH 1/2'));
  tables.forEach(t => {
      const g = (t.commander_games || []).find(x => x.status !== 'closed');
      const tGame = (t.game_type || g?.game_type || '').toUpperCase();
      const tStakes = (t.stakes || g?.stakes || '').trim();
      console.log(`T${t.table_number}: ${tGame} ${tStakes} | active: ${t.is_active} | status: ${t.status}`);
  });
})();
