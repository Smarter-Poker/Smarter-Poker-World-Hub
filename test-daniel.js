require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'DANIEL@BEKAVACTRADING.COM',
    password: 'Bek454545!!'
  });
  
  if (authError) {
    console.log("Login failed:", authError);
    return;
  }
  
  console.log("Logged in as:", authData.user.id);
  const user = authData.user;
  
  // Get daniel's friends
  const { data: friends1 } = await supabase.from('friendships').select('*').eq('user_id', user.id).eq('status', 'accepted');
  const { data: friends2 } = await supabase.from('friendships').select('*').eq('friend_id', user.id).eq('status', 'accepted');
  
  const acceptedFriends = [...(friends1||[]), ...(friends2||[])];
  console.log(`Daniel has ${acceptedFriends.length} accepted friend links`);
  
  if (acceptedFriends.length === 0) {
      console.log("Daniel doesn't have any friends, so Add Friend is correct.");
      return;
  }
  
  // Pick one friend to test
  const firstLink = acceptedFriends[0];
  const friendId = firstLink.user_id === user.id ? firstLink.friend_id : firstLink.user_id;
  
  console.log(`Testing profile viewing for friend: ${friendId}`);
  
  // Now simulate what user/[username].js does
  const { data: f1 } = await supabase.from('friendships').select('*').eq('user_id', user.id).eq('friend_id', friendId);
  const { data: f2 } = await supabase.from('friendships').select('*').eq('user_id', friendId).eq('friend_id', user.id);
  
  console.log("f1 (I am user_id):", f1);
  console.log("f2 (I am friend_id):", f2);
  
  const allFriendships = [...(f1 || []), ...(f2 || [])];
  console.log("Combined:", allFriendships);
  
  // The original .or query
  const { data: origData } = await supabase
        .from('friendships')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .limit(1);
        
  console.log("Original .or query returns:", origData);
}
test();
