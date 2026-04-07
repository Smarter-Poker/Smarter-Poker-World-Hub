const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== Deleting orphan null-venue_id rows (March 25-29 legacy)...');
  let totalDeleted = 0;
  
  for (let i = 0; i < 10; i++) {
    const { data: rows } = await sb.from('venue_daily_tournaments')
      .select('id')
      .is('venue_id', null)
      .limit(500);
    
    if (!rows || rows.length === 0) break;
    const ids = rows.map(r => r.id);
    const { error } = await sb.from('venue_daily_tournaments').delete().in('id', ids);
    
    if (error) {
      console.error('Delete error:', error.message);
      break;
    }
    totalDeleted += ids.length;
    process.stdout.write(`Batch ${i+1}: deleted ${ids.length} | running total: ${totalDeleted}\n`);
  }
  
  const { count: remaining } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true }).is('venue_id', null);
  const { count: total } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n✅ Done. Deleted: ${totalDeleted} | Null remaining: ${remaining} | Total records: ${total}`);
})().catch(console.error);
