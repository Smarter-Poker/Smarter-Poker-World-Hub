const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: latestDateData } = await supabase
    .from('pred_mlb_predictions')
    .select('official_date')
    .order('official_date', { ascending: false })
    .limit(1);

  const officialDate = latestDateData[0].official_date;
  console.log("Official Date:", officialDate);

  const { data, error } = await supabase
    .from('pred_mlb_predictions')
    .select('market, bet_type, count(*)')
    .eq('official_date', officialDate)
    .limit(1000); // this is just fetching raw rows, count without group by will fail. Wait.

}
run();
