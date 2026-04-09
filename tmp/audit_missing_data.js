const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function auditVenues() {
  // Fetch ALL venues with all relevant fields
  const { data, error } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, venue_type, logo_url, latitude, longitude, phone, website, address')
    .order('state', { ascending: true })
    .order('city', { ascending: true });

  if (error) { console.error('Error:', error); return; }
  
  console.log(`Total venues: ${data.length}\n`);

  // Track missing data categories
  const missing = {
    noCity: [],
    noState: [],
    noCoords: [],
    noLogo: [],
    noPhone: [],
    noWebsite: [],
    noAddress: [],
    noType: [],
  };

  for (const v of data) {
    if (!v.city) missing.noCity.push(v);
    if (!v.state) missing.noState.push(v);
    if (!v.latitude || !v.longitude) missing.noCoords.push(v);
    if (!v.logo_url) missing.noLogo.push(v);
    if (!v.phone) missing.noPhone.push(v);
    if (!v.website) missing.noWebsite.push(v);
    if (!v.address) missing.noAddress.push(v);
    if (!v.venue_type) missing.noType.push(v);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('             VENUE DATA COMPLETENESS AUDIT         ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total Venues: ${data.length}`);
  console.log(`Missing City:        ${missing.noCity.length}`);
  console.log(`Missing State:       ${missing.noState.length}`);
  console.log(`Missing Coordinates: ${missing.noCoords.length}`);
  console.log(`Missing Logo:        ${missing.noLogo.length}`);
  console.log(`Missing Phone:       ${missing.noPhone.length}`);
  console.log(`Missing Website:     ${missing.noWebsite.length}`);
  console.log(`Missing Address:     ${missing.noAddress.length}`);

  console.log(`Missing Venue Type:  ${missing.noType.length}`);
  console.log('═══════════════════════════════════════════════════\n');

  // CRITICAL missing: city, state, coords, type — these break the card display
  const criticalFields = ['noCity', 'noState', 'noCoords', 'noType'];
  for (const field of criticalFields) {
    if (missing[field].length > 0) {
      console.log(`\n🔴 CRITICAL — ${field} (${missing[field].length} venues):`);
      for (const v of missing[field]) {
        console.log(`  [${v.id}] "${v.name}" — ${v.city || '???'}, ${v.state || '???'} (type: ${v.venue_type || 'NONE'})`);
      }
    }
  }

  // Card-visible missing: logo, address, phone
  if (missing.noLogo.length > 0 && missing.noLogo.length <= 100) {
    console.log(`\n🟡 VISIBLE — Missing Logo (${missing.noLogo.length} venues):`);
    for (const v of missing.noLogo) {
      console.log(`  [${v.id}] "${v.name}" — ${v.city || '???'}, ${v.state || '???'}`);
    }
  } else if (missing.noLogo.length > 100) {
    console.log(`\n🟡 VISIBLE — Missing Logo: ${missing.noLogo.length} venues (too many to list)`);
    // Show by state breakdown
    const byState = {};
    for (const v of missing.noLogo) {
      const st = v.state || 'UNKNOWN';
      if (!byState[st]) byState[st] = 0;
      byState[st]++;
    }
    const sorted = Object.entries(byState).sort((a,b) => b[1] - a[1]);
    for (const [st, cnt] of sorted) {
      console.log(`    ${st}: ${cnt}`);
    }
  }

  if (missing.noAddress.length > 0 && missing.noAddress.length <= 100) {
    console.log(`\n🟡 VISIBLE — Missing Address (${missing.noAddress.length} venues):`);
    for (const v of missing.noAddress) {
      console.log(`  [${v.id}] "${v.name}" — ${v.city || '???'}, ${v.state || '???'}`);
    }
  } else if (missing.noAddress.length > 100) {
    console.log(`\n🟡 VISIBLE — Missing Address: ${missing.noAddress.length} venues (too many to list)`);
  }

  if (missing.noPhone.length > 0 && missing.noPhone.length <= 100) {
    console.log(`\n🟠 NICE-TO-HAVE — Missing Phone (${missing.noPhone.length} venues):`);
    for (const v of missing.noPhone) {
      console.log(`  [${v.id}] "${v.name}" — ${v.city || '???'}, ${v.state || '???'}`);
    }
  } else if (missing.noPhone.length > 100) {
    console.log(`\n🟠 NICE-TO-HAVE — Missing Phone: ${missing.noPhone.length} venues (too many to list)`);
  }
}

auditVenues();
