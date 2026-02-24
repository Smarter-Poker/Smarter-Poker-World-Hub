require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('friendships').select('user_id, friend_id').limit(10);
  console.log("Random friendships count:", data.length);
  
  // Find a case where A and B have multiple friendship rows
  const { data: all } = await supabase.from('friendships').select('*');
  const pairs = {};
  all.forEach(r => {
    let key = [r.user_id, r.friend_id].sort().join('-');
    if (!pairs[key]) pairs[key] = [];
    pairs[key].push(r);
  });
  
  Object.keys(pairs).forEach(k => {
    if (pairs[k].length > 1) {
      console.log("Found pair with multiple rows:", k);
      console.log(pairs[k]);
    }
  });
}
test();
