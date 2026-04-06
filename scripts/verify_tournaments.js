require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching all venues and their schedules...");
  
  // Get all active venue_game_schedules
  const { data: scheds, error: schedErr } = await supabase.from('venue_game_schedules').select('venue_id, game_name, day_of_week').eq('is_active', true);
  if (schedErr) {
      console.error(schedErr);
      return;
  }
  
  // Find all venues that have a tournament scheduled
  const venuesWithTourneySched = new Set();
  scheds.forEach(s => {
      if (s.game_name.toLowerCase().includes('tournament')) {
          venuesWithTourneySched.add(s.venue_id);
      }
  });
  
  // Get all venues
  const { data: venues, error: venueErr } = await supabase.from('venues').select('id, name, has_tournaments, games_offered');
  if (venueErr) {
      console.error(venueErr);
      return;
  }
  
  const toActivate = [];
  const toDeactivate = [];
  
  venues.forEach(v => {
      let isTourneyVenue = false;
      
      // condition 1: schedule has 'tournament'
      if (venuesWithTourneysSched.has(v.id)) {
          isTourneyVenue = true;
      }
      
      // condition 2: games_offered contains 'Tournament'
      if (Array.isArray(v.games_offered)) {
          if (v.games_offered.some(g => g && g.toLowerCase().includes('tournament'))) {
              isTourneyVenue = true;
          }
      }
      
      if (isTourneyVenue && !v.has_tournaments) {
          toActivate.push({ id: v.id, name: v.name });
      } else if (!isTourneyVenue && v.has_tournaments) {
          toDeactivate.push({ id: v.id, name: v.name });
      }
  });
  
  console.log(`\nFound ${toActivate.length} venues missing has_tournaments=true`);
  toActivate.forEach(v => console.log(`  [ACTIVATE] ${v.name} (ID: ${v.id})`));
  
  console.log(`\nFound ${toDeactivate.length} venues with has_tournaments=true but NO tournament data found!`);
  toDeactivate.forEach(v => console.log(`  [DEACTIVATE] ${v.name} (ID: ${v.id})`));
  
  // Perform update if any
  if (toActivate.length > 0) {
      console.log(`\nUpdating ${toActivate.length} venues to has_tournaments = true...`);
      for (let v of toActivate) {
          const { error } = await supabase.from('venues').update({ has_tournaments: true }).eq('id', v.id);
          if (error) console.error(`Failed to update ${v.name}:`, error.message);
      }
      console.log('Update complete.');
  }

  if (toDeactivate.length > 0) {
      console.log(`\nUpdating ${toDeactivate.length} venues to has_tournaments = false...`);
      for (let v of toDeactivate) {
          const { error } = await supabase.from('venues').update({ has_tournaments: false }).eq('id', v.id);
          if (error) console.error(`Failed to update ${v.name}:`, error.message);
      }
      console.log('Update complete.');
  }
}

run();
