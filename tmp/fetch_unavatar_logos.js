const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const venues = require('./needs_logo.json');

async function processUnavatar() {
  let success = 0;
  for (const v of venues) {
    if (!v.website) {
       console.log(`[SKIP] ${v.name} - No website`);
       continue;
    }
    try {
      const url = new URL(v.website);
      const host = url.hostname.replace('www.', '');
      
      const logoUrl = `https://unavatar.io/${host}?fallback=false`;
      console.log(`Checking ${logoUrl} for ${v.name}`);
      
      const res = await fetch(logoUrl, { redirect: 'follow' });
      if (res.ok) {
         console.log(`[SUCCESS] Found logo for ${v.name} -> ${res.url}`);
         await supabase.from('poker_venues').update({
             profile_photo_url: logoUrl,
             data_quality: 'scraped_verified',
             scrape_batch_id: 'unavatar-fallback'
         }).eq('id', v.id);
         success++;
      } else {
         console.log(`[FAIL] ${v.name} - HTTP ${res.status}`);
      }
    } catch (e) {
      console.error(`[ERROR] ${v.name}`, e.message);
    }
    await new Promise(r => setTimeout(r, 800)); // avoid rate limit
  }
  console.log(`Successfully updated ${success} missing logos`);
}

processUnavatar();
