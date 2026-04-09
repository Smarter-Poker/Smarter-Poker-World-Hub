const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
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
    console.error('API Error:', error);
    return;
  }
  
  let needsLogo = [];
  
  for (const v of data) {
    const url = v.profile_photo_url || '';
    if (!url) {
      needsLogo.push(v);
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
      needsLogo.push(v);
    }
  }
  
  fs.writeFileSync('tmp/needs_logo.json', JSON.stringify(needsLogo, null, 2));
  console.log(`Saved ${needsLogo.length} venues to tmp/needs_logo.json`);
}
check();
