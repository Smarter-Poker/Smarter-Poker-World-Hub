import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const kingfish = '47965354-0e56-43ef-931c-ddaab82af765';
  
  // 1. We need two regular test users.
  // We'll create two dummy users or just use random UUIDs since the DB might enforce foreign keys?
  // Let's get two random users from profiles who are not kingfish.
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .neq('id', kingfish)
    .limit(2);
    
  if (pErr || !profiles || profiles.length < 2) {
    console.error('Failed to get test users', pErr);
    process.exit(1);
  }
  
  const userA = profiles[0].id;
  const userB = profiles[1].id;
  
  console.log(`User A: ${userA}, User B: ${userB}, Kingfish: ${kingfish}`);

  // Test 1: kingfish_recipient_blocked
  console.log('\n--- Test 1: kingfish_recipient_blocked ---');
  const { data: res1, error: err1 } = await supabase.rpc('fn_check_anti_farming_gift_cap', {
    p_sender_id: userA,
    p_recipient_id: kingfish,
    p_amount: 100
  });
  console.log('Result:', res1, err1);

  // Test 2: pair_24h_exceeded (exceeding 5000 limit between two normal users)
  console.log('\n--- Test 2: pair_24h_exceeded ---');
  const { data: res2, error: err2 } = await supabase.rpc('fn_check_anti_farming_gift_cap', {
    p_sender_id: userA,
    p_recipient_id: userB,
    p_amount: 6000
  });
  console.log('Result:', res2, err2);
}

run();
