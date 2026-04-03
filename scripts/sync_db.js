const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncToursDB() {
  console.log('Syncing Tours with Supabase Database...');

  // Tours to remove
  const toRemove = [
    'heartland poker',
    'hard rock poker tour',
    '888poker',
    '888 poker',
    'pokerstars live',
    'bestbet jax poker tour',
    'trailblazer'
  ];

  const { data: currentTours, error: fetchErr } = await supabase
    .from('poker_venues')
    .select('id, name')
    .eq('venue_type', 'tour');

  if (fetchErr) {
    console.error('Error fetching:', fetchErr.message);
    return;
  }

  let removed = 0;
  for (const tour of currentTours) {
    const nameLower = tour.name.toLowerCase();
    for (const phrase of toRemove) {
      if (nameLower.includes(phrase)) {
        console.log(`Deleting from Supabase: ${tour.name}`);
        const { error: delErr } = await supabase.from('poker_venues').delete().eq('id', tour.id);
        if (delErr) {
            console.error('  Failed to delete:', delErr.message);
        } else {
            removed++;
        }
        break;
      }
    }
  }

  const newTours = [
    { name: 'NAPT Poker Tour', slug: 'napt-poker-tour', venue_type: 'tour', is_active: true, website: 'https://www.pokerstarslive.com/napt/' },
    { name: 'Rough Riders Poker Tour', slug: 'rough-riders-poker-tour', venue_type: 'tour', is_active: true, website: 'https://www.roughriderspoker.com/' },
    // Ensure CPPT is there as well
    { name: 'Card Player Poker Tour (CPPT)', slug: 'card-player-poker-tour', venue_type: 'tour', is_active: true, website: 'https://www.cardplayer.com/' }
  ];

  let added = 0;
  for (const nt of newTours) {
    const { data: existing } = await supabase
      .from('poker_venues')
      .select('id')
      .eq('name', nt.name)
      .maybeSingle();

    if (!existing) {
      console.log(`Inserting into Supabase: ${nt.name}`);
      const { error: inErr } = await supabase.from('poker_venues').insert(nt);
      if (inErr) {
        console.error('  Failed to insert:', inErr.message);
      } else {
        added++;
      }
    } else {
      console.log(`Already exists in Supabase: ${nt.name}`);
    }
  }

  // To be perfectly 100% in sync, read local JSON and update count
  console.log(`DB Operation Complete. Removed: ${removed}, Added: ${added}`);
}

syncToursDB();
