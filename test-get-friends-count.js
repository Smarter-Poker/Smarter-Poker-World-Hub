const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local';
const envFile = fs.readFileSync(envPath, 'utf8');
const lines = envFile.split('\n');
let url = '', key = '';
for (const line of lines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1];
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1];
}

const supabase = createClient(url, key);

async function check() {
  const { data } = await supabase.from('profiles').select('id, username, friends_count').eq('username', 'dbekavac34').single();
  console.log("Profile data:", data);
  
  const sent = await supabase.from('friendships').select('id', { count: 'exact' }).eq('user_id', data.id).eq('status', 'accepted');
  const recv = await supabase.from('friendships').select('id', { count: 'exact' }).eq('friend_id', data.id).eq('status', 'accepted');
  
  console.log("Sent count:", sent.count);
  console.log("Recv count:", recv.count);
}
check();
