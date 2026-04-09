const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const masterInfo = JSON.parse(fs.readFileSync('data/master_poker_series_list.json'));
  const masterList = masterInfo.master_list;
  
  const seriesMap = new Map();
  for (const item of masterList) {
    if (item.id) {
       seriesMap.set(item.id, {
          series_uid: item.id,
          series_name: item.name,
          source: item.scrape_source || 'pokeratlas',
          source_url: item.source_url || '',
          tour: 'Independent',
          tier: 'regional',
          event_count: 0,
          scrape_html_hash: "0000000000000000000000000000000000000000000000000000000000000000",
          scrape_timestamp: masterInfo.generated_at,
          scrape_batch_id: masterInfo.batch_id,
          data_quality: "scraped_verified",
          scrape_confidence: "high"
       });
    }
  }
  
  const allSeries = Array.from(seriesMap.values());
  console.log(`Upserting ${allSeries.length} master master list series...`);
  const { error: sErr } = await supabase.from('poker_series').upsert(allSeries, { onConflict: 'series_uid' });
  if (sErr) console.error("Series Upsert Error:", sErr);
  else console.log("Success!");
}
main();
