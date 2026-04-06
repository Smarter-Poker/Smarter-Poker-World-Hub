require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('No supabase credentials found in dev server.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Check daily_tournaments
  const { data: tournaments, error: tErr } = await supabase.from('daily_tournaments').select('*');
  if (tErr) {
    console.error('Error fetching daily tournaments:', tErr.message);
  } else {
    console.log(`Found ${tournaments.length} actual tournaments in daily_tournaments table.`);
    
    // Aggregate by venue
    const venuesWithTourneys = new Set(tournaments.map(t => typeof t.venue_id === 'number' ? t.venue_id : Number(t.venue_id)));
    console.log(`Unique venues with tournaments in daily_tournaments: ${venuesWithTourneys.size}`);
    
    // Now get all venues
    const { data: allVenues, error: allErr } = await supabase.from('venues').select('id, name, has_tournaments, venue_type, status, games_offered');
    if (allErr) {
        console.error('Failed to get all venues:', allErr.message);
        return;
    }
    
    let needsUpdate = [];
    let mistakenlyTrue = [];
    
    // check games_offered as well, do any have "Tournament" as a game?
    allVenues.forEach(v => {
        const hasT_db = venuesWithTourneys.has(Number(v.id));
        
        let hasT = hasT_db;
        // Or if in games offered they literally have "Tournaments" or "Tournament" listed
        const hasT_in_games = Array.isArray(v.games_offered) && v.games_offered.some(g => g.toLowerCase().includes('tournament'));
        
        if (hasT_in_games) {
            hasT = true;
        }

        if (hasT && v.has_tournaments !== true) {
            needsUpdate.push(v);
        }
        if (!hasT && v.has_tournaments === true) {
            mistakenlyTrue.push(v);
        }
    });
    
    console.log(`Venues missing has_tournaments=true: ${needsUpdate.length}`);
    needsUpdate.slice(0, 50).forEach(v => console.log(`  - ID: ${v.id} | Name: ${v.name} | hasT: ${v.has_tournaments} | status: ${v.status} | games_offered: ${JSON.stringify(v.games_offered)}`));
    
    console.log(`\nVenues with has_tournaments=true but no recorded tournaments: ${mistakenlyTrue.length}`);
    mistakenlyTrue.slice(0, 10).forEach(v => console.log(`  - ID: ${v.id} | Name: ${v.name}`));
  }
}

run();
