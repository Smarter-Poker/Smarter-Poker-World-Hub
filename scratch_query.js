require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', 
  process.env.MLB_SUPABASE_SERVICE_KEY
);
async function run() {
  const date = '2026-06-26';
  const { data, error } = await supabase.from('pred_market_output').select('*').limit(10);
  console.log('Latest pred_market_output error:', error);
  if (data && data.length > 0) {
    console.log('Sample row:', data[0]);
    console.log('Keys available in row:', Object.keys(data[0]));
  } else {
    console.log('No data found in pred_market_output');
  }
}
run();
