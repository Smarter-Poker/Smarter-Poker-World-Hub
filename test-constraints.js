const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('diamond_transactions').insert({
      user_id: 'b91f532a-5f04-45e0-9bc8-5d29dc6c87a1', // dummy
      amount: 10,
      transaction_type: 'live_gift_received',
      type: 'live_gift_received',
      balance_after: 10
  });
  console.log("Insert result:", error);
}
run();
