/**
 * ROLLBACK: The fuzzy backfill was too aggressive — matched non-charity venues (JACK Cleveland, Aria, Bicycle Hotel, etc.)
 * to charity venue IDs. This script detects and corrects those incorrect patches.
 * 
 * Strategy: Any VDT row that has venue_id pointing to a charity venue BUT whose venue_name
 * is clearly NOT related to that charity gets venue_id set back to null.
 * 
 * Also: Run the scraper for all 20 missing venues instead, with exact name matching only.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// These are the charity venue IDs that may have received bad patches
const CHARITY_IDS = [2802, 2803, 2804, 2805, 2806, 2807, 2808, 2809, 2810, 2811, 2812, 
                     2813, 2814, 2815, 2816, 2817, 2820, 2824, 2825, 2826, 2827, 2829, 
                     2834, 2835, 2836, 1829, 3119];

// The KNOWN CORRECT venue_name values that belong to each charity id
// Any VDT row with a different venue_name should have venue_id cleared
const KNOWN_CORRECT = {
  1829: ['Texas Card House Austin', 'texas card house austin'],
  2802: ['Chicago Charitable Games (CCG Poker)', 'Chicago Charitable Games'],
  2803: ['Windy City Poker Championship', 'Windy City Poker'],
  2804: ['Rockford Charitable Games (RCG Poker)', 'Rockford Charitable Games'],
  2809: ['River Room Players Club'],
  2817: ['ACES Charity Poker'],
  2836: ['Westgate Poker Room'],
};

(async () => {
  console.log('=== Detecting incorrectly patched VDT rows ===\n');
  
  let cleared = 0;
  
  for (const venueId of CHARITY_IDS) {
    // Get all VDT rows linked to this venue id
    const { data: rows } = await sb.from('venue_daily_tournaments')
      .select('id, venue_name')
      .eq('venue_id', venueId);
    
    if (!rows || rows.length === 0) continue;
    
    // Get the charity venue name
    const { data: venue } = await sb.from('poker_venues').select('name').eq('id', venueId).maybeSingle();
    if (!venue) continue;
    
    const charityName = venue.name.toLowerCase();
    
    // Get the known-correct names for this venue (if defined)
    const knownCorrect = (KNOWN_CORRECT[venueId] || []).map(n => n.toLowerCase());
    
    // Find rows whose venue_name doesn't match the charity name at all
    const badRows = rows.filter(r => {
      const vName = (r.venue_name || '').toLowerCase();
      // If we have known-correct names, use those; otherwise check if venue_name 
      // contains any meaningful overlap with the charity name
      if (knownCorrect.length > 0) {
        return !knownCorrect.includes(vName);
      }
      // Otherwise: if the venue_name has zero overlap with charity name, it's bad
      const charityWords = charityName.split(' ').filter(w => w.length > 3);
      const vNameWords = vName.split(' ').filter(w => w.length > 3);
      const overlap = charityWords.filter(w => vName.includes(w));
      const overlapBack = vNameWords.filter(w => charityName.includes(w));
      return overlap.length === 0 && overlapBack.length === 0;
    });
    
    if (badRows.length > 0) {
      const badIds = badRows.map(r => r.id);
      const { error } = await sb.from('venue_daily_tournaments')
        .update({ venue_id: null })
        .in('id', badIds);
      
      if (!error) {
        console.log(`  Cleared ${badRows.length} bad rows from venue ${venueId} (${venue.name})`);
        const badSample = [...new Set(badRows.map(r => r.venue_name))].slice(0, 3);
        console.log(`    Bad names: ${badSample.join(', ')}`);
        cleared += badRows.length;
      }
    }
  }
  
  console.log(`\nTotal rows cleared (set venue_id=null): ${cleared}`);
  
  // Final check
  const { count: withIds } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true })
    .in('venue_id', CHARITY_IDS);
  console.log(`\nRemaining rows linked to charity IDs: ${withIds}`);
})();
