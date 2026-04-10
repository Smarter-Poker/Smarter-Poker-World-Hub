#!/usr/bin/env node
/**
 * Poker Brain -- Historical Equity Migration Script
 * ==================================================
 * Recomputes equity values for hands stored under older engine versions.
 *
 * Usage:
 *   node scripts/migrate-stale-equities.js --dry-run
 *   node scripts/migrate-stale-equities.js --execute --batch-size=200
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL   - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  - Service role key (for server-side access)
 *
 * This script flags stale hands (schema_version < 4) for client-side
 * recomputation. The actual equity recalculation happens in the browser
 * via recompute.js since the engine uses Canvas/DOM APIs.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
  console.error('Set it before running: export SUPABASE_SERVICE_ROLE_KEY=your_key_here');
  process.exit(1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || !args.includes('--execute');
const batchArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchArg ? parseInt(batchArg.split('=')[1]) : 500;

async function main() {
  // Dynamic import for ESM compatibility
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('=== Poker Brain Equity Migration ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  // Count total stale hands
  const { count: totalStale, error: countErr } = await supabase
    .from('pb_hands')
    .select('*', { count: 'exact', head: true })
    .or('schema_version.is.null,schema_version.lt.4');

  if (countErr) {
    console.error('Error counting stale hands:', countErr.message);
    process.exit(1);
  }

  console.log(`Found ${totalStale || 0} hands with schema_version < 4`);

  if (!totalStale || totalStale === 0) {
    console.log('Nothing to migrate. All hands are up to date.');
    process.exit(0);
  }

  if (isDryRun) {
    console.log('');
    console.log('DRY RUN - no changes made.');
    console.log(`Run with --execute to flag ${totalStale} hands for recomputation.`);
    process.exit(0);
  }

  // Process in batches
  let processed = 0;
  let updated = 0;
  let errors = 0;

  while (processed < totalStale) {
    const { data: batch, error: fetchErr } = await supabase
      .from('pb_hands')
      .select('id')
      .or('schema_version.is.null,schema_version.lt.4')
      .limit(batchSize);

    if (fetchErr) {
      console.error(`Batch fetch error at offset ${processed}:`, fetchErr.message);
      errors++;
      break;
    }

    if (!batch || batch.length === 0) break;

    const ids = batch.map(h => h.id);

    const { error: updateErr, count: updateCount } = await supabase
      .from('pb_hands')
      .update({ schema_version: 4, equity_needs_recompute: true })
      .in('id', ids);

    if (updateErr) {
      console.error(`Batch update error:`, updateErr.message);
      errors++;
    } else {
      updated += batch.length;
    }

    processed += batch.length;
    process.stdout.write(`\r  Processed: ${processed}/${totalStale} (${updated} updated, ${errors} errors)`);
  }

  console.log('');
  console.log('');
  console.log('=== Migration Complete ===');
  console.log(`  Total processed: ${processed}`);
  console.log(`  Updated:         ${updated}`);
  console.log(`  Errors:          ${errors}`);
  console.log('');
  console.log('Flagged hands will be recomputed client-side on next load.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
