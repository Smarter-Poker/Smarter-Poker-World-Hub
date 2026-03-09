const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Testing geeves_missed_questions table...');
  const { data, error, count } = await supabase.from('geeves_missed_questions').select('*', { count: 'exact', head: true });
  if (error) { console.error('Table error:', error); process.exit(1); }
  console.log(`✅ Table exists! Row count: ${count}`);

  console.log('Testing geeves_upsert_missed_question RPC...');
  const { error: rpcErr } = await supabase.rpc('geeves_upsert_missed_question', {
    p_question: 'test verify',
    p_hash: 'testhash123',
    p_page: '/test',
    p_grok_answer: 'test answer'
  });
  if (rpcErr) { console.error('RPC error:', rpcErr); process.exit(1); }
  console.log('✅ RPC works! Inserted test row.');
  
  // Clean up
  await supabase.from('geeves_missed_questions').delete().eq('question_hash', 'testhash123');
  console.log('✅ Cleaned up test row. All checks passed.');
}
run();
