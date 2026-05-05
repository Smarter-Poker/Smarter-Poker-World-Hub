const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const senderId = "30b0b8c6-eb90-4a81-9b19-c09d57a94a28"; // Example user
  const receiverId = "b91f532a-5f04-45e0-9bc8-5d29dc6c87a1"; // Example receiver
  const parsedAmount = 10;
  const giftId = crypto.randomUUID();

  // ATOMIC deduct
  const deduct = await supabase.rpc('deduct_diamonds', {
      p_user_id:          senderId,
      p_amount:           parsedAmount,
      p_description:      `Live gift to broadcaster`,
      p_transaction_type: 'live_gift_sent',
      p_metadata:         { recipient_id: receiverId },
      p_reference_id:     `live_gift_deduct_${giftId}`,
      p_cooldown_seconds: 1,
  });
  console.log("Deduct:", deduct);

  const credit = await supabase.rpc('add_diamonds_to_balance', {
      p_user_id: receiverId,
      p_amount: parsedAmount,
      p_type: 'live_gift_received',
      p_description: `Test sent ${parsedAmount} diamonds during your live`,
      p_reference_id: `live_gift_${giftId}`,
  });
  console.log("Credit:", credit);
}
run().catch(console.error);
