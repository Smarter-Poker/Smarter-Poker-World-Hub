const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function runDailyCleanup() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Starting daily cleanup of hand_history older than ${cutoff}`);

  const { error, count } = await supabase
    .from('hand_history')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('Error during daily cleanup:', error.message);
    process.exit(1);
  }

  console.log(`Successfully deleted ${count || 0} old hands.`);
}

runDailyCleanup();
