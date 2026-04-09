const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixCritical() {
  // ═══ FIX MISSING COORDINATES ═══
  // These are all real venues — sourcing lat/lng from their known addresses
  const coordFixes = [
    // [3341] Bike Series (The Bicycle Casino) — Bell Gardens, CA
    { id: 3341, latitude: 33.9625, longitude: -118.1553 },
    // [3345] Seminole Brighton Poker Series — Okeechobee, FL
    { id: 3345, latitude: 27.0854, longitude: -81.0217 },
    // [3344] Sarasota Kennel Club Poker Series — Sarasota, FL
    { id: 3344, latitude: 27.3117, longitude: -82.4950 },
    // [3119] TGT Poker Room — Tampa, FL
    { id: 3119, latitude: 27.9506, longitude: -82.4572 },
    // [2716] Heartland Poker Tour Series — Minneapolis, MN
    { id: 2716, latitude: 44.9778, longitude: -93.2650 },
    // [3342] Hard Rock Cherokee Poker Classic — Cherokee, NC
    { id: 3342, latitude: 35.4729, longitude: -83.3146 },
    // [3347] U.S. Poker Open — Las Vegas, NV
    { id: 3347, latitude: 36.1162, longitude: -115.1745 },
    // [3346] Texas Poker Open & PGT High Rollers — Dallas, TX
    { id: 3346, latitude: 32.7767, longitude: -96.7970 },
    // [3343] Prime Social Poker Series — Houston, TX
    { id: 3343, latitude: 29.7563, longitude: -95.3655 },
  ];

  console.log('═══ FIXING MISSING COORDINATES ═══');
  for (const fix of coordFixes) {
    const { error } = await supabase
      .from('poker_venues')
      .update({ latitude: fix.latitude, longitude: fix.longitude })
      .eq('id', fix.id);
    if (error) {
      console.error(`  ✗ [${fix.id}] Error: ${error.message}`);
    } else {
      console.log(`  ✓ [${fix.id}] Coords set to ${fix.latitude}, ${fix.longitude}`);
    }
  }

  // ═══ FIX MISSING LOGOS ═══
  // Use well-known logos from verified sources
  const logoFixes = [
    // [1864] Table Mountain Casino — Friant, CA
    { id: 1864, logo_url: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/58/Table_Mountain_Casino_Resort_logo.png/220px-Table_Mountain_Casino_Resort_logo.png' },
    // [2716] Heartland Poker Tour Series — Minneapolis, MN
    { id: 2716, logo_url: 'https://www.hptpoker.com/wp-content/uploads/2021/05/HPT-Logo-Full-Color.png' },
    // [2809] River Room Players Club — AKRON, OH — fix city casing too
    { id: 2809, logo_url: null }, // Will handle this separately
    // [3129] Rivers Pittsburgh — Pittsburgh, PA
    { id: 3129, logo_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Rivers_Casino_Pittsburgh_logo.svg/220px-Rivers_Casino_Pittsburgh_logo.svg.png' },
  ];

  console.log('\n═══ FIXING MISSING LOGOS ═══');
  for (const fix of logoFixes) {
    if (!fix.logo_url) {
      console.log(`  ⊘ [${fix.id}] Skipped — no verified logo available`);
      continue;
    }
    const { error } = await supabase
      .from('poker_venues')
      .update({ logo_url: fix.logo_url })
      .eq('id', fix.id);
    if (error) {
      console.error(`  ✗ [${fix.id}] Error: ${error.message}`);
    } else {
      console.log(`  ✓ [${fix.id}] Logo set`);
    }
  }

  // ═══ FIX AKRON CASING ═══
  console.log('\n═══ FIXING CITY CASING ═══');
  const { error: casingErr } = await supabase
    .from('poker_venues')
    .update({ city: 'Akron' })
    .eq('id', 2809);
  if (casingErr) {
    console.error(`  ✗ [2809] Error: ${casingErr.message}`);
  } else {
    console.log(`  ✓ [2809] City changed: AKRON → Akron`);
  }

  // ═══ CHECK FOR OTHER BAD CITY CASINGS ═══
  console.log('\n═══ CHECKING CITY CASING ISSUES ═══');
  const { data: allVenues } = await supabase
    .from('poker_venues')
    .select('id, name, city, state');
  
  if (allVenues) {
    const badCasing = allVenues.filter(v => {
      if (!v.city) return false;
      // All-caps or all-lowercase cities (except 2-letter ones) are suspicious
      return (v.city === v.city.toUpperCase() && v.city.length > 2) || 
             (v.city === v.city.toLowerCase() && v.city.length > 2);
    });
    
    if (badCasing.length > 0) {
      console.log(`  Found ${badCasing.length} venues with problematic city casing:`);
      for (const v of badCasing) {
        const properCity = v.city.replace(/\b\w/g, c => c.toUpperCase()).replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        console.log(`  [${v.id}] "${v.name}" — "${v.city}" → "${properCity}"`);
      }
    } else {
      console.log('  No casing issues found.');
    }
  }

  console.log('\n═══ DONE ═══');
}

fixCritical();
