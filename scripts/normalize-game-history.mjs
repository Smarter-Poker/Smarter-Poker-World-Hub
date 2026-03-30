import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { gameShortLabel } from '../src/components/poker-near-me/normalize-game.js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function normalizeHistory() {
  console.log('🔄 Starting Retroactive Baseline Normalization...');
  let totalProcessed = 0;
  let totalUpdated = 0;
  let offset = 0;
  const limit = 1000;

  while (true) {
    console.log(`Fetching batch ${offset} to ${offset + limit}...`);
    const { data: rows, error } = await supabase
      .from('game_live_history')
      .select('id, game_type')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('❌ Supabase fetch error:', error.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('✅ End of records reached.');
      break;
    }

    const updates = [];
    for (const row of rows) {
      if (!row.game_type) continue;
      
      const normalized = gameShortLabel(row.game_type);
      if (normalized !== row.game_type) {
        updates.push({
          id: row.id,
          game_type: normalized
        });
      }
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('game_live_history')
        .upsert(updates);
        
      if (updateError) {
        console.error('❌ Update failed for chunk:', updateError.message);
      } else {
        totalUpdated += updates.length;
        console.log(`   └ Updated ${updates.length} legacy records.`);
      }
    }

    totalProcessed += rows.length;
    offset += limit;
    
    // Safety Break if table is massively large and infinite looping (e.g. 1 million rows)
    if (totalProcessed > 50000) {
       console.log('⚠️ Reached 50,000 threshold. Please run iteratively.');
       break;
    }
  }

  console.log(`\n🎉 Normalization Complete!`);
  console.log(`- Scanned: ${totalProcessed} rows`);
  console.log(`- Remapped: ${totalUpdated} rows`);
  process.exit(0);
}

normalizeHistory();
