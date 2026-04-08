const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSeriesCoverage() {
  // Get all poker_series
  const { data: series, error } = await supabase
    .from('poker_series')
    .select('id, name, source_url')
    .order('name');

  if (error) { console.error('series error:', error); return; }
  console.log(`\nTotal poker_series rows: ${series.length}\n`);

  // Get event counts grouped by series_id
  const { data: events, error: evErr } = await supabase
    .from('poker_events')
    .select('series_id');

  if (evErr) { console.error('events error:', evErr); return; }

  // Count events per series
  const counts = {};
  for (const e of events) {
    if (!e.series_id) continue;
    counts[e.series_id] = (counts[e.series_id] || 0) + 1;
  }

  const withEvents = series.filter(s => counts[s.id] > 0);
  const withoutEvents = series.filter(s => !counts[s.id]);

  console.log(`✅ Series WITH event data: ${withEvents.length}`);
  console.log(`❌ Series WITHOUT event data: ${withoutEvents.length}\n`);

  console.log('--- Series WITH events ---');
  for (const s of withEvents) {
    console.log(`  [${counts[s.id]} events] ${s.name}`);
  }

  console.log('\n--- Series WITHOUT events (top 20) ---');
  for (const s of withoutEvents.slice(0, 20)) {
    console.log(`  ${s.name}`);
  }
  if (withoutEvents.length > 20) console.log(`  ... and ${withoutEvents.length - 20} more`);
}

checkSeriesCoverage();
