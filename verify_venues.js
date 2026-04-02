const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env' });
dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const data = JSON.parse(fs.readFileSync('/tmp/venue_updates.json', 'utf8'));
  
  if (data.duplicates_to_deactivate && data.duplicates_to_deactivate.length > 0) {
    console.log(`Deactivating ${data.duplicates_to_deactivate.length} duplicates...`);
    const { error: errDel } = await supabase.from('poker_venues').delete().in('id', data.duplicates_to_deactivate);
    if (errDel) console.error("Error deleting duplicates:", errDel);
    else console.log("Duplicates deleted");
  }

  if (data.updates && data.updates.length > 0) {
     console.log(`Applying ${data.updates.length} updates...`);
     let success = 0;
     for (const up of data.updates) {
        const { error } = await supabase.from('poker_venues')
            .update({ venue_type: up.venue_type })
            .eq('id', up.id);
        if (error) console.error(`Error updating id ${up.id}:`, error);
        else success++;
     }
     console.log(`Successfully updated ${success} venues.`);
  }
}

run();
