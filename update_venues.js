const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const size = 1000;
  let allNames = new Set();
  const verifiedAdditionalNames = [
    'Resorts World Las Vegas', 'Mohegan Sun', 'Foxwoods Resort Casino', 
    'Hard Rock Tulsa', 'WinStar World Casino', 'JACK Cleveland Casino',
    'Parx Casino', 'Thunder Valley'
  ];
  verifiedAdditionalNames.forEach(n => allNames.add(n.toLowerCase()));
  
  for(let i = 0; i < 50; i++) {
    const { data } = await supabase.from('venue_daily_tournaments').select('venue_name').range(i*size, (i+1)*size-1);
    if (!data || data.length === 0) break;
    data.forEach(r => {
        if(r.venue_name) {
            allNames.add(r.venue_name.toLowerCase());
            // Safe fallback split
            allNames.add(r.venue_name.replace('Casino', '').trim().toLowerCase());
        }
    });
  }
  
  const allVenuesPath = './data/all-venues.json';
  const data = JSON.parse(fs.readFileSync(allVenuesPath, 'utf8'));
  const venues = data.venues || data;
  
  const toUpdate = [];
  
  venues.forEach(v => {
    if (v.has_tournaments) return; 
    if (!['casino', 'card_room', 'poker_club', 'charity'].includes(v.venue_type)) return;
    
    let name = v.name.toLowerCase();
    
    let hasEvidence = false;
    for (const validName of allNames) {
      if (name.includes(validName) || validName.includes(name)) {
        hasEvidence = true;
        break;
      }
    }
    
    if (hasEvidence) {
      v.has_tournaments = true;
      toUpdate.push(v);
    }
  });
  
  console.log(`Updating ${toUpdate.length} verified venues...`);
  
  // 1. Write back to all-venues.json
  fs.writeFileSync(allVenuesPath, JSON.stringify(venues, null, 2));
  console.log('✅ Updated data/all-venues.json');
  
  // 2. Update Supabase
  let successCount = 0;
  let failCount = 0;
  
  for (const v of toUpdate) {
    const { error } = await supabase
      .from('poker_venues')
      .update({ has_tournaments: true })
      .eq('id', v.id);
      
    if (error) {
      console.error(`❌ Failed to update ${v.name} in DB:`, error.message);
      failCount++;
    } else {
      successCount++;
    }
  }
  
  console.log(`✅ Updated ${successCount} venues in Supabase poker_venues table. (Failed: ${failCount})`);
  
}

run().catch(console.error);
