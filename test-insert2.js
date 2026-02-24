require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: users, error: err } = await supabase.from('profiles').select('id').limit(2);
  if (!users || users.length < 2) return console.log("Not enough users", err);
  
  const user_id = users[0].id;
  const friend_id = users[1].id;
  
  // Clean up
  await supabase.from('friendships').delete().eq('user_id', user_id).eq('friend_id', friend_id);
  
  // Insert a test record
  const { error: insertErr } = await supabase.from('friendships').insert({
    user_id: user_id,
    friend_id: friend_id,
    status: 'accepted'
  });
  console.log("Insert err:", insertErr);
  
  // Test the exact string used in user/[username].js
  let queryStr = `and(user_id.eq.${user_id},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${user_id})`;
  
  const { data, error } = await supabase
    .from('friendships')
    .select('status')
    .or(queryStr)
    .maybeSingle();
    
  console.log("Result string query:", data, "Error:", error);
  
  // Clean up
  await supabase.from('friendships').delete().eq('user_id', user_id).eq('friend_id', friend_id);
}
test();
