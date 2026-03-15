const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkWebhooks() {
  const { data, error } = await supabase.rpc('get_pg_cron_jobs');
  if (error) {
    console.log("Could not fetch pg_cron natively, error:", error.message);
  } else {
    console.log("pg_cron jobs:", data);
  }

  // Also manually test if there are any HTTP/Webhook endpoints
  const { data: q2, error: err2 } = await supabase.from('pg_trigger').select('*').limit(5).catch(e=>({error:e}));
  if (err2) {
    console.log("Could not fetch pg_trigger, error:", err2.message);
  } else {
    console.log("pg_trigger test success");
  }
}
checkWebhooks();
