const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function normalize(str) {
  return str.toLowerCase()
    .replace(/poker\s*(room|series|classic|open|championship|tournament|event|invitational)/gi, '')
    .replace(/casino\s*(hotel|resort)?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function deepDive() {
  const { data: venues, error } = await supabase
    .from('poker_venues')
    .select('id, name, city, state, venue_type, logo_url, latitude, longitude, address, phone, website')
    .order('id');

  if (error) { console.error(error); return; }

  console.log(`Total venues: ${venues.length}`);

  // 1. Find true duplicates: same normalized name in same city/state
  console.log('\n======== TRUE DUPLICATES (same name, same city) ========');
  const groups = {};
  for (const v of venues) {
    if (!v.city || !v.state) continue;
    const key = `${normalize(v.name)}|${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  const trueDupes = [];
  for (const [key, vlist] of Object.entries(groups)) {
    if (vlist.length > 1) {
      console.log(`\nDuplicate group [${key}]:`);
      for (const v of vlist) {
        console.log(`  [${v.id}] ${v.name} | type: ${v.venue_type} | logo: ${!!v.logo_url}`);
      }
      trueDupes.push(vlist);
    }
  }

  // 2. Find "generic" entries - venues with very generic names like "Poker Room" or "Card Room"
  console.log('\n======== GENERIC/PLACEHOLDER VENUES ========');
  const genericPatterns = [
    /^poker\s*room$/i,
    /^card\s*room$/i,
    /^poker\s*club$/i,
    /^casino$/i,
    /^poker$/i,
    /^card\s*club$/i,
    /^the\s+poker\s*room$/i,
    /^the\s+card\s*room$/i,
    /^poker\s*lounge$/i
  ];
  
  const genericVenues = venues.filter(v => genericPatterns.some(p => p.test(v.name.trim())));
  if (genericVenues.length) {
    console.log(`Found ${genericVenues.length} generic venues:`);
    for (const v of genericVenues) {
      console.log(`  [${v.id}] "${v.name}" | ${v.city}, ${v.state} | type: ${v.venue_type}`);
    }
  } else {
    console.log('  None found.');
  }

  // 3. Find "X Poker Series" entries that duplicate a base venue
  console.log('\n======== POKER SERIES DUPLICATING BASE VENUES ========');
  const venueMap = {};
  for (const v of venues) {
    if (!v.city || !v.state) continue;
    const cityState = `${v.city.toLowerCase()}|${v.state.toLowerCase()}`;
    if (!venueMap[cityState]) venueMap[cityState] = [];
    venueMap[cityState].push(v);
  }

  for (const [cs, vlist] of Object.entries(venueMap)) {
    if (vlist.length < 2) continue;
    
    for (let i = 0; i < vlist.length; i++) {
      for (let j = i + 1; j < vlist.length; j++) {
        const v1 = vlist[i];
        const v2 = vlist[j];
        
        // Check if one name is a subset of the other (series vs base venue)
        const n1 = v1.name.toLowerCase();
        const n2 = v2.name.toLowerCase();
        
        // Skip false positives from "social" matching in Houston
        if (n1.includes('social') && n2.includes('social') && !n1.includes(n2.replace(/social.*/, '').trim()) && !n2.includes(n1.replace(/social.*/, '').trim())) continue;
        
        const norm1 = normalize(v1.name);
        const norm2 = normalize(v2.name);
        
        // One normalized name contains the other (but not trivially short)
        if (norm1.length > 3 && norm2.length > 3) {
          if (norm1.includes(norm2) || norm2.includes(norm1)) {
            // Already shown if they're exact dupes
            const dupeKey1 = `${norm1}|${v1.city.toLowerCase()}|${v1.state.toLowerCase()}`;
            const dupeKey2 = `${norm2}|${v2.city.toLowerCase()}|${v2.state.toLowerCase()}`;
            if (groups[dupeKey1]?.length > 1 || groups[dupeKey2]?.length > 1) continue;
            
            console.log(`  Series/Base pair in ${cs}:`);
            console.log(`    [${v1.id}] ${v1.name} (norm: "${norm1}") | type: ${v1.venue_type}`);
            console.log(`    [${v2.id}] ${v2.name} (norm: "${norm2}") | type: ${v2.venue_type}`);
          }
        }
      }
    }
  }

  // 4. Find venues with no city/state (potential garbage)
  console.log('\n======== VENUES MISSING CITY OR STATE ========');
  const noLocation = venues.filter(v => !v.city || !v.state);
  console.log(`Found ${noLocation.length} venues with missing city/state:`);
  for (const v of noLocation.slice(0, 20)) {
    console.log(`  [${v.id}] "${v.name}" | city: ${v.city || 'NULL'} | state: ${v.state || 'NULL'} | type: ${v.venue_type}`);
  }

  // 5. Find venues with no coordinates
  console.log('\n======== VENUES MISSING COORDINATES ========');
  const noCoords = venues.filter(v => !v.latitude || !v.longitude);
  console.log(`Found ${noCoords.length} venues with missing lat/lng`);
  for (const v of noCoords.slice(0, 20)) {
    console.log(`  [${v.id}] "${v.name}" | ${v.city || 'NULL'}, ${v.state || 'NULL'}`);
  }

  // 6. Count venue types  
  console.log('\n======== VENUE TYPE DISTRIBUTION ========');
  const typeCounts = {};
  for (const v of venues) {
    const t = v.venue_type || 'null';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  console.table(typeCounts);

  // 7. Summary of actionable items 
  console.log('\n======== SUMMARY ========');
  const dupeSets = Object.values(groups).filter(g => g.length > 1);
  console.log(`True duplicate sets: ${dupeSets.length}`);
  console.log(`Generic/placeholder venues: ${genericVenues.length}`);
  console.log(`Missing location: ${noLocation.length}`);
  console.log(`Missing coordinates: ${noCoords.length}`);
}

deepDive().catch(console.error);
