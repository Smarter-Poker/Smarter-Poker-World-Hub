/**
 * Phase 2B+2C: 
 *  1. Backfill venue_id on all VDT rows that have null venue_id but matching venue_name
 *  2. Deduplicate MiCGA (3117 is dupe of 2820) and Concord NH Casino (3118 is dupe of 2813)
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== Phase 2B: Backfill venue_id FKs on VDT rows ===\n');
  
  // Get all charity venues
  const { data: charities } = await sb.from('poker_venues')
    .select('id, name')
    .eq('venue_type', 'charity');
  
  let totalPatched = 0;
  for (const venue of charities) {
    // Find VDT rows for this venue by name where venue_id is null
    const names = [venue.name];
    // Also match common aliases (website org names)
    
    const { data: rows } = await sb.from('venue_daily_tournaments')
      .select('id, venue_name')
      .is('venue_id', null)
      .eq('venue_name', venue.name);
    
    if (rows && rows.length > 0) {
      const ids = rows.map(r => r.id);
      const { error } = await sb.from('venue_daily_tournaments')
        .update({ venue_id: venue.id })
        .in('id', ids);
      
      if (!error) {
        console.log(`  Patched ${rows.length} rows -> venue_id=${venue.id} (${venue.name})`);
        totalPatched += rows.length;
      } else {
        console.log(`  ERROR patching ${venue.name}:`, error.message);
      }
    }
  }
  console.log(`\n  Total rows backfilled: ${totalPatched}`);
  
  console.log('\n=== Phase 2C: Deduplicate MiCGA and Concord NH Casino ===\n');
  
  // MiCGA: keep 2820, remove 3117
  // Concord NH Casino: keep 2813, remove 3118
  const DUPES = [
    { keepId: 2820, keepName: 'Michigan Charitable Gaming Association (MiCGA)', dupeId: 3117 },
    { keepId: 2813, keepName: 'Concord Casino', dupeId: 3118 },
  ];
  
  for (const { keepId, keepName, dupeId } of DUPES) {
    // Move VDT rows from dupe to keeper
    const { data: dupeRows } = await sb.from('venue_daily_tournaments')
      .select('id')
      .eq('venue_id', dupeId);
    
    if (dupeRows && dupeRows.length > 0) {
      const ids = dupeRows.map(r => r.id);
      await sb.from('venue_daily_tournaments').update({ venue_id: keepId }).in('id', ids);
      console.log(`  Moved ${dupeRows.length} VDT rows from venue ${dupeId} -> ${keepId} (${keepName})`);
    }
    
    // Deactivate the duplicate venue (don't delete — soft delete)
    const { error: deactivateErr } = await sb.from('poker_venues')
      .update({ is_active: false, data_quality: 'deduplicated' })
      .eq('id', dupeId);
    
    if (!deactivateErr) {
      console.log(`  Deactivated dupe venue ${dupeId}`);
    } else {
      console.log(`  ERROR deactivating ${dupeId}:`, deactivateErr.message);
    }
  }
  
  console.log('\n=== Final VDT Coverage Check ===\n');
  const { data: updatedCharities } = await sb.from('poker_venues').select('id, name').eq('venue_type', 'charity').eq('is_active', true);
  const charityIds = updatedCharities.map(c => c.id);
  
  const { data: vdtLinked } = await sb.from('venue_daily_tournaments')
    .select('venue_id')
    .not('venue_id', 'is', null)
    .in('venue_id', charityIds);
  
  const linkedIds = new Set((vdtLinked || []).map(r => r.venue_id));
  const stillMissing = updatedCharities.filter(c => !linkedIds.has(c.id));
  
  console.log(`Active charity venues: ${updatedCharities.length}`);
  console.log(`With VDT data: ${linkedIds.size}`);
  console.log(`Still missing: ${stillMissing.length}`);
  stillMissing.forEach(c => console.log(`  STILL MISSING: ${c.id} ${c.name}`));
})();
