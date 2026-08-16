const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function runCleanup() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let currentStart = new Date('2026-03-13T00:00:00Z');

  while (currentStart < cutoff) {
    let nextStart = new Date(currentStart.getTime() + 6 * 60 * 60 * 1000); // 6 hours
    if (nextStart > cutoff) nextStart = cutoff;

    console.log(`Deleting range: ${currentStart.toISOString()} to ${nextStart.toISOString()}`);
    
    let retries = 3;
    while (retries > 0) {
      const { error } = await supabase
        .from('hand_history')
        .delete({ count: 'exact' })
        .gte('created_at', currentStart.toISOString())
        .lt('created_at', nextStart.toISOString());

      if (error) {
        console.error('Error:', error.message, 'Retries left:', retries - 1);
        retries--;
        await new Promise(r => setTimeout(r, 2000));
        if (retries === 0) process.exit(1);
      } else {
        break;
      }
    }

    currentStart = nextStart;
    await new Promise(r => setTimeout(r, 1000));
  }
}
runCleanup();
