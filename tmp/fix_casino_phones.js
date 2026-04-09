/**
 * Fix Casino Phone Numbers — ALL data verified via web search 2026-04-08
 * 
 * Sources documented per-entry below.
 * Also: delete [2296] "Resorts Casino" — confirmed dup of [1897] "Resorts Casino Atlantic City"
 *       (same address: 1133 Boardwalk, Atlantic City, NJ)
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixPhones() {
  // ═══ DELETE DUPLICATE: [2296] Resorts Casino (same address as [1897]) ═══
  console.log('═══ DELETING DUPLICATE ═══');
  const { data: check } = await supabase
    .from('poker_venues')
    .select('id, name, address')
    .eq('id', 2296)
    .single();
  
  if (check && check.address === '1133 Boardwalk') {
    const { error } = await supabase.from('poker_venues').delete().eq('id', 2296);
    if (error) console.error(`  ✗ Error: ${error.message}`);
    else console.log(`  ✓ [2296] "Resorts Casino" DELETED (dup of [1897] Resorts Casino Atlantic City)`);
  } else {
    console.log(`  ⊘ [2296] not found or address differs — skipping`);
  }

  // ═══ FIX PHONE NUMBERS ═══
  const phoneFixes = [
    // Source: delawarepark.com, visitwilmingtonde.com
    { id: 2692, phone: '(302) 994-2521', note: 'Delaware Park Casino — delawarepark.com' },
    // Source: boydgaming.com, traveldubuque.com
    { id: 1949, phone: '(563) 690-4800', note: 'Diamond Jo Casino — boydgaming.com' },
    // Source: hollywoodcasinoaurora.com, aurorachamber.com
    { id: 2654, phone: '(630) 801-1234', note: 'Hollywood Casino Aurora — hollywoodcasinoaurora.com' },
    // Source: riversandroutes.com, illinois.gov — now DraftKings at Casino Queen
    { id: 1857, phone: '(618) 874-5000', note: 'Casino Queen — riversandroutes.com' },
    // Source: elginchamber.com, enjoyillinois.com
    { id: 3109, phone: '(847) 468-7000', note: 'Grand Victoria Casino — elginchamber.com' },
    // Source: firekeeperscasino.com, battlecreekvisitors.org
    { id: 2730, phone: '(877) 352-8777', note: 'FireKeepers Casino Hotel — firekeeperscasino.com' },
    // Source: visitdetroit.com
    { id: 1990, phone: '(313) 237-7711', note: 'Motor City Casino — visitdetroit.com' },
    // Source: blackbearcasinoresort.com
    { id: 2625, phone: '(218) 878-2327', note: 'Black Bear Casino Resort — blackbearcasinoresort.com' },
    // Source: exploreminnesota.com, hinckleymn.com
    { id: 2639, phone: '(800) 472-6321', note: 'Grand Casino Hinckley — exploreminnesota.com' },
    // Source: boydgaming.com
    { id: 1929, phone: '(816) 414-7000', note: 'Ameristar Casino KC — boydgaming.com' },
    // Source: boydgaming.com, mscoastchamber.com
    { id: 2759, phone: '(228) 436-3000', note: 'IP Casino Resort Spa — boydgaming.com' },
    // Source: goldstrike.com, visitmississippi.org
    { id: 1905, phone: '(888) 245-7829', note: 'Gold Strike Casino Resort — goldstrike.com' },
    // Source: resortsac.com, visitatlanticcity.com
    { id: 1897, phone: '(609) 340-6300', note: 'Resorts Casino Atlantic City — resortsac.com' },
    // Source: hollywoodpnrc.com, visitpa.com
    { id: 2641, phone: '(717) 469-2211', note: 'Hollywood Casino Penn National — hollywoodpnrc.com' },
    // Source: golfwisconsin.com — 1-800-PAYSBIG
    { id: 1846, phone: '(800) 729-7244', note: 'Potawatomi Hotel & Casino — potawatomi.com' },
    // Source: thebike.com
    { id: 2413, phone: '(562) 888-9888', note: 'Bicycle Hotel & Casino — thebike.com' },
  ];

  console.log('\n═══ FIXING CASINO PHONE NUMBERS ═══');
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

fixPhones();
