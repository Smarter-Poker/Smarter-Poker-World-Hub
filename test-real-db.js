require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  // get accepted friendships
  const { data: acceptedRows, error: err1 } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .limit(5);
    
  if (err1 || !acceptedRows || acceptedRows.length === 0) {
    console.log("No accepted friendships found.", err1);
    return;
  }
  
  const row = acceptedRows[0];
  console.log("Testing with row:", row);
  
  const user_id = row.user_id;
  const friend_id = row.friend_id;
  
  // Now run the exact query that is in the UI
  let queryStr = `and(user_id.eq.${user_id},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${user_id})`;
  
  const { data, error } = await supabase
    .from('friendships')
    .select('status')
    .or(queryStr)
    .limit(1);
    
  console.log("Query returned:", data, error);
  
  // also get all rows between these two
  const { data: allRows } = await supabase
    .from('friendships')
    .select('*')
    .or(queryStr);
  console.log("ALL rows between these two users:", allRows);
}
test();
