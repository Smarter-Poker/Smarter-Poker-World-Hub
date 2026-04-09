const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching venues from Supabase...");
  // Use paginate approach if more than 1000
  let allData = [];
  let from = 0;
  let hasMore = true;
  
  while(hasMore) {
    const { data, error } = await supabase
      .from('poker_venues')
      .select('*')
      .range(from, from + 999);
      
    if (error) {
      console.error(error);
      process.exit(1);
    }
    
    if (data.length > 0) {
      allData = allData.concat(data);
      from += 1000;
    } else {
      hasMore = false;
    }
  }

  const jsonContent = JSON.stringify({ venues: allData }, null, 2);
  
  fs.writeFileSync('data/all-venues.json', jsonContent);
  fs.writeFileSync('public/data/all-venues.json', jsonContent);
  
  console.log(`Rebuilt all-venues.json with ${allData.length} venues.`);
}

run();
