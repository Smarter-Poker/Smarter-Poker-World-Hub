const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: 'b91f532a-5f04-45e0-9bc8-5d29dc6c87a1',
      p_amount: 10,
      p_type: 'live_gift_received',
      p_description: 'Test',
      p_reference_id: 'test_123',
  });
  console.log("Error:", error);
}
run();
