const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addMissingTours() {
  const newTours = [
    { name: 'NAPT Poker Tour', slug: 'napt-poker-tour', venue_type: 'tour', city: 'Global', state: 'Tour', is_active: true, website: 'https://www.pokerstarslive.com/napt/' },
    { name: 'Rough Riders Poker Tour', slug: 'rough-riders-poker-tour', venue_type: 'tour', city: 'Global', state: 'Tour', is_active: true, website: 'https://www.roughriderspoker.com/' }
  ];

  let added = 0;
  for (const nt of newTours) {
    const { data: existing } = await supabase
      .from('poker_venues')
      .select('id')
      .eq('name', nt.name)
      .maybeSingle();

    if (!existing) {
      console.log('Inserting into Supabase: ' + nt.name);
      const { error: inErr } = await supabase.from('poker_venues').insert(nt);
      if (inErr) {
        console.error('Failed to insert ' + nt.name + ':', inErr);
      } else {
        added++;
        console.log('Inserted ' + nt.name);
      }
    } else {
      console.log('Already exists in Supabase: ' + nt.name);
    }
  }
}

addMissingTours();
