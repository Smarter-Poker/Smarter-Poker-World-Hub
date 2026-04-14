require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, count, error } = await supabase
    .from('table_hole_cards')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
     console.error(error);
  } else {
     console.log("Total hole cards across all tables:", count);
  }
}
run();
