const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const dir = 'data/scrape-evidence/series-v6';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  
  const seriesMap = new Map();
  const eventsMap = new Map();
  
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file)));
    if (data.series) {
       seriesMap.set(data.series.series_uid, data.series);
    }
    if (data.events) {
       for (const ev of data.events) {
          eventsMap.set(ev.event_uid, ev);
       }
    }
  }
  
  const allSeries = Array.from(seriesMap.values());
  const allEvents = Array.from(eventsMap.values());
  
  if (allSeries.length) {
    console.log(`Upserting ${allSeries.length} unique series...`);
    const { error: sErr } = await supabase.from('poker_series').upsert(allSeries, { onConflict: 'series_uid' });
    if (sErr) console.error("Series Upsert Error:", sErr);
  }
  
  if (allEvents.length) {
    console.log(`Upserting ${allEvents.length} unique events...`);
    for (let i = 0; i < allEvents.length; i += 100) {
       const chunk = allEvents.slice(i, i+100);
       const { error: eErr } = await supabase.from('poker_events').upsert(chunk, { onConflict: 'event_uid' });
       if (eErr) console.error("Events Upsert Error:", eErr);
    }
  }
  
  console.log("Finished!");
}
main();
