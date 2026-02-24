require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: dannys } = await supabase.from('profiles').select('id, username, full_name').eq('username', 'Danny');
  console.log("Profiles with username 'Danny':", dannys);
  
  if (dannys && dannys.length > 0) {
      const danielId = '47965354-0e56-43ef-931c-ddaab82af765';
      for (const danny of dannys) {
          const { data: f1 } = await supabase.from('friendships').select('status').eq('user_id', danielId).eq('friend_id', danny.id);
          const { data: f2 } = await supabase.from('friendships').select('status').eq('user_id', danny.id).eq('friend_id', danielId);
          const rels = [...(f1||[]), ...(f2||[])];
          console.log(`Friendship with ${danny.id}:`, rels);
      }
  }
}
test();
