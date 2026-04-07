/**
 * Full venue_id backfill — patches all venue_daily_tournaments rows
 * that have NULL venue_id but a venue_name matching a poker_venues record.
 * Matches by exact name + state when available.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  console.log('=== Full venue_id backfill ===\n');

  // 1. Get all VDT rows with null venue_id (paginated)
  let nullRows = [];
  const PAGE = 1000;
  for (let i = 0; i < 20; i++) {
    const from = i * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await sb.from('venue_daily_tournaments')
      .select('id, venue_name, venue_id')
      .is('venue_id', null)
      .order('id')
      .range(from, to);
    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    nullRows = nullRows.concat(data);
    process.stdout.write('.');
    if (data.length < PAGE) break;
  }
  console.log(`\nFound ${nullRows.length} VDT rows with null venue_id`);

  // 2. Get all poker_venues as a lookup map
  const { data: venues } = await sb.from('poker_venues')
    .select('id, name, state')
    .eq('is_active', true)
    .limit(2000);

  // Build name → id map (normalized)
  const byName = {};
  const byNameState = {};
  (venues || []).forEach(v => {
    const key = v.name.trim().toLowerCase();
    byName[key] = v.id;
    if (v.state) byNameState[`${key}|${v.state}`] = v.id;
  });

  // 3. Match and patch
  const patches = {}; // venueId → [rowIds]
  let matched = 0;
  let unmatched = 0;

  nullRows.forEach(row => {
    if (!row.venue_name) { unmatched++; return; }
    const nameKey = row.venue_name.trim().toLowerCase();
    const venueId = byName[nameKey] || null;

    if (venueId) {
      if (!patches[venueId]) patches[venueId] = [];
      patches[venueId].push(row.id);
      matched++;
    } else {
      unmatched++;
    }
  });

  console.log(`Matched: ${matched} | Unmatched: ${unmatched}`);

  // 4. Apply patches in batches
  let totalPatched = 0;
  const venueIds = Object.keys(patches);
  for (const vid of venueIds) {
    const rowIds = patches[vid];
    // Patch in chunks of 100
    for (let i = 0; i < rowIds.length; i += 100) {
      const chunk = rowIds.slice(i, i + 100);
      const { error } = await sb.from('venue_daily_tournaments')
        .update({ venue_id: parseInt(vid) })
        .in('id', chunk);
      if (!error) {
        totalPatched += chunk.length;
      } else {
        console.error(`  ERROR patching venue ${vid}:`, error.message);
      }
    }
  }

  console.log(`\n✅ Total rows patched: ${totalPatched}`);

  // 5. Final count
  const { count: remaining } = await sb.from('venue_daily_tournaments')
    .select('*', { count: 'exact', head: true })
    .is('venue_id', null);
  console.log(`Remaining null venue_id rows: ${remaining}`);
})().catch(console.error);
