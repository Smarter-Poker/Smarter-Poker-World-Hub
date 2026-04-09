const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function auditAddresses() {
  const { data, error } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, venue_type, address, phone, website, latitude, longitude')
    .or('address.is.null,phone.is.null')
    .order('state', { ascending: true })
    .order('city', { ascending: true });

  if (error) { console.error('Error:', error); return; }

  // Group by venue_type
  const byType = {};
  for (const v of data) {
    const t = v.venue_type || 'unknown';
    if (!byType[t]) byType[t] = { noAddress: [], noPhone: [], both: [] };
    const hasAddr = !!v.address;
    const hasPhone = !!v.phone;
    if (!hasAddr && !hasPhone) byType[t].both.push(v);
    else if (!hasAddr) byType[t].noAddress.push(v);
    else if (!hasPhone) byType[t].noPhone.push(v);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('        MISSING ADDRESS/PHONE BY VENUE TYPE        ');
  console.log('═══════════════════════════════════════════════════');
  
  for (const [type, groups] of Object.entries(byType).sort((a,b) => a[0].localeCompare(b[0]))) {
    const total = groups.noAddress.length + groups.noPhone.length + groups.both.length;
    console.log(`\n${type.toUpperCase()} (${total} venues with gaps):`);
    if (groups.both.length > 0) {
      console.log(`  Missing BOTH address + phone: ${groups.both.length}`);
      for (const v of groups.both.slice(0, 10)) {
        console.log(`    [${v.id}] "${v.name}" — ${v.city}, ${v.state}`);
      }
      if (groups.both.length > 10) console.log(`    ... and ${groups.both.length - 10} more`);
    }
    if (groups.noAddress.length > 0) {
      console.log(`  Missing address only: ${groups.noAddress.length}`);
      for (const v of groups.noAddress.slice(0, 5)) {
        console.log(`    [${v.id}] "${v.name}" — ${v.city}, ${v.state}`);
      }
      if (groups.noAddress.length > 5) console.log(`    ... and ${groups.noAddress.length - 5} more`);
    }
    if (groups.noPhone.length > 0) {
      console.log(`  Missing phone only: ${groups.noPhone.length}`);
      for (const v of groups.noPhone.slice(0, 5)) {
        console.log(`    [${v.id}] "${v.name}" — ${v.city}, ${v.state}`);
      }
      if (groups.noPhone.length > 5) console.log(`    ... and ${groups.noPhone.length - 5} more`);
    }
  }

  // Count charity vs casino vs poker_club
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  PRIORITY: Casinos and poker_clubs should have');
  console.log('  addresses since users actually visit them.');
  console.log('  Series entries are less critical.');
  console.log('═══════════════════════════════════════════════════');

  // Show ALL casinos and poker_clubs missing addresses
  const priorityTypes = ['casino', 'poker_club'];
  for (const type of priorityTypes) {
    if (!byType[type]) continue;
    const allMissing = [...byType[type].noAddress, ...byType[type].both];
    if (allMissing.length > 0) {
      console.log(`\n🔴 ${type.toUpperCase()} missing address (${allMissing.length}):`);
      for (const v of allMissing) {
        console.log(`  [${v.id}] "${v.name}" — ${v.city}, ${v.state} | lat:${v.latitude} lng:${v.longitude} | web: ${v.website || 'none'}`);
      }
    }
  }
}

auditAddresses();
