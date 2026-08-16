const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.rpc('get_hand_history_count_by_day');
  if (error) {
    console.error("No RPC, doing raw select");
    // Just fetch min and max created_at
    const { data: d1 } = await supabase.from('hand_history').select('created_at').order('created_at', { ascending: true }).limit(1);
    const { data: d2 } = await supabase.from('hand_history').select('created_at').order('created_at', { ascending: false }).limit(1);
    console.log("Oldest:", d1);
    console.log("Newest:", d2);
    
    // Count last 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from('hand_history').select('*', { count: 'exact', head: true }).gte('created_at', twoDaysAgo);
    console.log("Last 2 days count:", count);
  }
}
check();
