const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function listCasinosNoPhone() {
  const { data } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, address, phone, website')
    .eq('venue_type', 'casino')
    .is('phone', null)
    .order('state')
    .order('city');

  console.log(`Casinos missing phone: ${data.length}`);
  for (const v of data) {
    console.log(`[${v.id}] "${v.name}" — ${v.city}, ${v.state} | addr: ${v.address} | web: ${v.website || 'none'}`);
  }
}

listCasinosNoPhone();
