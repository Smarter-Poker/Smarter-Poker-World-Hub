const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

async function runCleanup() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  console.log(`Starting deletion of hand_history older than ${cutoff.toISOString()} by slicing days...`);

  let currentStart = new Date('2026-01-01T00:00:00Z');

  while (currentStart < cutoff) {
    let nextStart = new Date(currentStart.getTime() + 24 * 60 * 60 * 1000);
    if (nextStart > cutoff) nextStart = cutoff;

    console.log(`Deleting range: ${currentStart.toISOString()} to ${nextStart.toISOString()}`);
    
    // Fire and forget the delete for this range without returning all the rows
    const { error, count } = await supabase
      .from('hand_history')
      .delete({ count: 'exact' })
      .gte('created_at', currentStart.toISOString())
      .lt('created_at', nextStart.toISOString());

    if (error) {
      console.error('Error deleting records:', error.message);
      break;
    }

    console.log(`-> Deleted ${count || 'unknown'} hands.`);
    currentStart = nextStart;

    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`Finished deletion loops.`);
}

runCleanup();
