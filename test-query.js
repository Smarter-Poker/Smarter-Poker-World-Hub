require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const user_id = '11111111-1111-1111-1111-111111111111';
  const friend_id = '22222222-2222-2222-2222-222222222222';
  
  // Test the exact string used in user/[username].js
  let queryStr = `and(user_id.eq.${user_id},friend_id.eq.${friend_id}),and(user_id.eq.${friend_id},friend_id.eq.${user_id})`;
  console.log("Testing string:", queryStr);
  
  const { data, error } = await supabase
    .from('friendships')
    .select('status')
    .or(queryStr)
    .maybeSingle();
    
  console.log("Result:", data, "Error:", error);
}
test();
