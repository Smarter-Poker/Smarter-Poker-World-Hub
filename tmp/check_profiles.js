const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('profiles').select('id, can_review, is_banned, deleted_reviews_count').limit(1);
  if (error) console.log("Missing columns:", error.message);
  else console.log("Success! Data:", data);
}
check();
