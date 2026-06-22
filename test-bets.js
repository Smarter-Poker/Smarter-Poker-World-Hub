const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_KEY);
sb.from('pred_best_bets').select('*').limit(1).then(res => {
  console.log(JSON.stringify(res.data?.[0] || res.error, null, 2));
});
