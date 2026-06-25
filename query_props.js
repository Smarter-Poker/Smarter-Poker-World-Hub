const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.MLB_SUPABASE_URL;
const supabaseKey = process.env.MLB_SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('pred_props').select('prop').limit(2000);
  if (error) console.error(error);
  else {
    const unique = [...new Set(data.map(d => d.prop))];
    console.log("UNIQUE PROPS:", unique);
  }
}
check();
