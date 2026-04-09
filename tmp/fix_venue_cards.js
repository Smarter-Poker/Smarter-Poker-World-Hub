/**
 * Fix Casino Venue Cards — uses ONLY verified data from web searches
 * 
 * DATA SOURCES (all searched 2026-04-08):
 * ─ Bally's Black Hawk:  ballys.com, colorado.com → 300 Main St, Black Hawk CO 80422, (303) 582-2600
 * ─ TGT Poker Room:      tgtpoker.com, pokeratlas.com → 755 E Waters Ave, Tampa FL 33604, (813) 932-4313
 * ─ Horseshoe LV:        visitlasvegas.com, caesars.com → 3645 Las Vegas Blvd S, Las Vegas NV 89109, (702) 967-4111
 * ─ Turning Stone:        turningstone.com, iloveny.com → 5218 Patrick Rd, Verona NY 13478, (315) 361-7711
 * ─ Hard Rock Cincinnati: hardrock.com, visitcincy.com → 1000 Broadway St, Cincinnati OH 45202, (513) 250-3150
 * ─ Oregon Poker Club:    rialtopoolroom.com, pokeratlas.com → 529 SW 4th Ave, Portland OR 97204, (503) 228-7605
 * ─ Jokers of Aggieland:  pokeratlas.com → 2553 Texas Ave S Suite D, College Station TX 77840
 * ─ Ho-Chunk Gaming:      travelwisconsin.com, ho-chunk.com → S3214 County Rd BD, Baraboo WI 53913, (800) 746-2486
 * ─ Daytona Racing:       pokeratlas.com, daytonabeach.com → 960 S Williamson Blvd, Daytona Beach FL 32114, (386) 252-6484
 * ─ Krazy Kopz:           pokerdiscover.com, pokeratlas.com → 38250 Ford Rd, Westland MI 48185, (734) 674-4807
 * 
 * DUPLICATES TO DELETE (confirmed duplicates of complete entries):
 * ─ [3126] Jacksonville Poker Room → dup of [1827] bestbet Jacksonville
 * ─ [3121] Rivers Chicago → dup of [1868] Rivers Casino Des Plaines
 * ─ [3129] Rivers Pittsburgh → dup of [1889] Rivers Casino Pittsburgh
 * ─ [3127] Sands Bethlehem → dup of Wind Creek Bethlehem (renamed)
 * ─ [3128] Bally Twin River → dup of [1892] Bally's Twin River Lincoln
 * ─ [3111] Horseshoe Tunica (Robinsonville) → dup of [1914]/[2032] Horseshoe Tunica
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixVenueCards() {
  // ═══ STEP 1: DELETE CONFIRMED DUPLICATES ═══
  const dupeIds = [
    3126, // Jacksonville Poker Room (dup of bestbet Jacksonville [1827])
    3121, // Rivers Chicago (dup of Rivers Casino Des Plaines [1868])
    3129, // Rivers Pittsburgh (dup of Rivers Casino Pittsburgh [1889])
    3127, // Sands Bethlehem (dup of Wind Creek Bethlehem)
    3128, // Bally Twin River (dup of Bally's Twin River Lincoln [1892])
    3111, // Horseshoe Tunica Robinsonville (dup of Horseshoe Tunica [1914] / Horseshoe Casino Tunica [2032])
  ];

  console.log('═══ STEP 1: DELETING CONFIRMED DUPLICATES ═══');
  for (const id of dupeIds) {
    // First verify this record exists and has no address (sanity check)
    const { data: check } = await supabase
      .from('poker_venues')
      .select('id, name, address')
      .eq('id', id)
      .single();
    
    if (!check) {
      console.log(`  ⊘ [${id}] Already deleted or not found`);
      continue;
    }
    if (check.address) {
      console.log(`  ⚠ [${id}] "${check.name}" HAS address "${check.address}" — SKIPPING (not a dup?)`);
      continue;
    }

    const { error } = await supabase
      .from('poker_venues')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error(`  ✗ [${id}] "${check.name}" Error: ${error.message}`);
    } else {
      console.log(`  ✓ [${id}] "${check.name}" DELETED`);
    }
  }

  // ═══ STEP 2: FIX REMAINING CASINOS WITH MISSING DATA ═══
  // All data verified via web search on 2026-04-08
  const fixes = [
    {
      id: 3102,
      name: "Bally's Black Hawk Casino",
      // Source: ballys.com, colorado.com
      address: '300 Main Street',
      phone: '(303) 582-2600',
      website: 'https://www.ballys.com/black-hawk',
    },
    {
      id: 3125,
      name: 'Daytona Beach Racing & Card Club',
      // Source: daytonabeach.com, pokeratlas.com
      address: '960 South Williamson Boulevard',
      phone: '(386) 252-6484',
      website: 'https://www.daytonabeachpoker.com',
    },
    {
      id: 3119,
      name: 'TGT Poker Room',
      // Source: tgtpoker.com, pokeratlas.com, waze.com
      address: '755 East Waters Avenue',
      phone: '(813) 932-4313',
      website: 'https://tgtpoker.com',
    },
    {
      id: 3091,
      name: 'Krazy Kopz @ The Ivory Room',
      // Source: pokerdiscover.com, pokeratlas.com — operates at Vision Lanes
      address: '38250 Ford Road',
      phone: '(734) 674-4807',
      website: 'http://krazykopzpoker.com',
    },
    {
      id: 3123,
      name: 'Horseshoe Las Vegas',
      // Source: visitlasvegas.com, caesars.com — also fix name from "Horseshoe LV"
      address: '3645 Las Vegas Blvd South',
      phone: '(702) 967-4111',
      website: 'https://www.caesars.com/horseshoe-las-vegas',
    },
    {
      id: 3103,
      name: 'Turning Stone Resort Casino',
      // Source: turningstone.com, iloveny.com — also fix name
      address: '5218 Patrick Road',
      phone: '(315) 361-7711',
      website: 'https://www.turningstone.com',
    },
    {
      id: 3101,
      name: 'Hard Rock Casino Cincinnati',
      // Source: hardrock.com, visitcincy.com
      address: '1000 Broadway Street',
      phone: '(513) 250-3150',
      website: 'https://www.hardrockcasinocincinnati.com',
    },
    {
      id: 3089,
      name: 'Rialto Poolroom (Oregon Poker Club)',
      // Source: rialtopoolroom.com, pokeratlas.com — fix name for clarity
      address: '529 SW 4th Avenue',
      phone: '(503) 228-7605',
      website: 'https://rialtopoolroom.com',
    },
    {
      id: 3088,
      name: 'Jokers of Aggieland Poker Club',
      // Source: pokeratlas.com
      address: '2553 Texas Avenue South, Suite D',
      phone: null, // No verified phone found
      website: null,
    },
    {
      id: 3122,
      name: 'Ho-Chunk Gaming Wisconsin Dells',
      // Source: travelwisconsin.com, ho-chunk.com, casinocity.com
      address: 'S3214 County Road BD',
      phone: '(800) 746-2486',
      website: 'https://ho-chunkgaming.com/wisconsindells',
    },
  ];

  console.log('\n═══ STEP 2: FIXING REMAINING CASINOS WITH VERIFIED DATA ═══');
  for (const fix of fixes) {
    const update = {};
    if (fix.address) update.address = fix.address;
    if (fix.phone) update.phone = fix.phone;
    if (fix.website) update.website = fix.website;
    if (fix.name) update.name = fix.name; // Fix names like "Horseshoe LV" → "Horseshoe Las Vegas"

    const { error } = await supabase
      .from('poker_venues')
      .update(update)
      .eq('id', fix.id);

    if (error) {
      console.error(`  ✗ [${fix.id}] "${fix.name}" Error: ${error.message}`);
    } else {
      console.log(`  ✓ [${fix.id}] "${fix.name}" — addr: ${fix.address || 'n/a'}, phone: ${fix.phone || 'n/a'}`);
    }
  }

  // ═══ STEP 3: ADD MISSING PHONE NUMBERS TO EXISTING HORSESHOE VENUES ═══
  // Source: casinocity.com
  const phoneFixes = [
    { id: 1914, phone: '(662) 357-5500', note: 'Horseshoe Tunica — source: casinocity.com' },
    { id: 1907, phone: '(318) 741-7901', note: 'Horseshoe Bossier City — source: caesars.com' },
    { id: 2701, phone: '(712) 323-2500', note: 'Horseshoe Council Bluffs — source: caesars.com' },
  ];

  console.log('\n═══ STEP 3: ADDING MISSING PHONE NUMBERS ═══');
  for (const fix of phoneFixes) {
    const { error } = await supabase
      .from('poker_venues')
      .update({ phone: fix.phone })
      .eq('id', fix.id);
    if (error) {
      console.error(`  ✗ [${fix.id}] Error: ${error.message}`);
    } else {
      console.log(`  ✓ [${fix.id}] ${fix.note} — ${fix.phone}`);
    }
  }

  console.log('\n═══ DONE ═══');
}

fixVenueCards();
