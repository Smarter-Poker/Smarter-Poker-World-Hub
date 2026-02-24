require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: { users }, error: errUsers } = await supabase.auth.admin.listUsers();
  if (errUsers) return console.log(errUsers);
  console.log("Found", users.length, "users");
  
  // Pick two that have an accepted friendship
  const { data: rels } = await supabase.from('friendships').select('*').eq('status', 'accepted').limit(1);
  if (!rels || rels.length === 0) return console.log("No friendships");
  
  const user1 = rels[0].user_id;
  const user2 = rels[0].friend_id;
  
  // Simulate lines 496-512 from user/[username].js
  console.log(`Checking friendship for ${user1} and ${user2}`);
  
  const { data: f1 } = await supabase.from('friendships').select('status').eq('user_id', user1).eq('friend_id', user2);
  const { data: f2 } = await supabase.from('friendships').select('status').eq('user_id', user2).eq('friend_id', user1);
  
  const allFriendships = [...(f1 || []), ...(f2 || [])];
  console.log("All relationships found:", allFriendships);
  
  let isFriend = false;
  let friendRequestSent = false;
  
  if (allFriendships.some(f => f.status === 'accepted')) {
      isFriend = true;
      friendRequestSent = false;
  } else if (allFriendships.some(f => f.status === 'pending')) {
      isFriend = false;
      friendRequestSent = true;
  } else {
      isFriend = false;
      friendRequestSent = false;
  }
  
  console.log({isFriend, friendRequestSent});
}
test();
