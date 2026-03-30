const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const venues = require('./needs_logo.json');

async function processClearbit() {
  for (const v of venues) {
    if (!v.website) {
       console.log(`[SKIP] ${v.name} - No website`);
       continue;
    }
    try {
      const url = new URL(v.website);
      const host = url.hostname.replace('www.', '');
      
      const logoUrl = `https://logo.clearbit.com/${host}?size=256`;
      console.log(`Checking ${logoUrl} for ${v.name}`);
      const res = await fetch(logoUrl);
      if (res.ok) {
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.startsWith('image/')) {
            console.log(`[SUCCESS] Found logo for ${v.name}`);
            await supabase.from('poker_venues').update({
                profile_photo_url: logoUrl,
                data_quality: 'scraped_verified',
                scrape_batch_id: 'clearbit-fallback'
            }).eq('id', v.id);
         } else {
             console.log(`[FAIL] ${v.name} - Not an image`);
         }
      } else {
         console.log(`[FAIL] ${v.name} - HTTP ${res.status}`);
      }
    } catch (e) {
      console.error(`[ERROR] ${v.name}`, e.message);
    }
    // rate limit
    await new Promise(r => setTimeout(r, 500));
  }
}

processClearbit();
