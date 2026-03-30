const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('poker_venues')
    .select('id, name, profile_photo_url, website, pokeratlas_url')
    .eq('is_active', true);
    
  if (error) {
    console.error(error);
    return;
  }
  
  let total = data.length;
  let missing = [];
  let generic = [];
  
  for (const v of data) {
    const url = v.profile_photo_url || '';
    if (!url) {
      missing.push(v);
      continue;
    }
    const lower = url.toLowerCase();
    if (
      lower.includes('pa-logo') || 
      lower.includes('avatar.png') || 
      lower.includes('pa-pro') ||
      lower.includes('placeholder') ||
      lower.includes('default') ||
      lower.includes('chips-default') ||
      lower.includes('favicons?domain=') ||
      lower.includes('icon.horse')
    ) {
      generic.push(v);
    }
  }
  
  console.log(`Total active venues: ${total}`);
  console.log(`Missing logos: ${missing.length}`);
  console.log(`Generic logos: ${generic.length}`);
  if (missing.length > 0) {
    console.log('\nSample missing:', missing.slice(0, 5).map(v => v.name));
  }
  if (generic.length > 0) {
    console.log('\nSample generic:', generic.slice(0, 5).map(v => v.name));
  }
}
check();
