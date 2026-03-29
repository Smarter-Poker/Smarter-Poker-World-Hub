/**
 * API: /api/poker/setup-intelligence-tables
 * One-time setup endpoint to create the intelligence tables.
 * Call once, then this endpoint can be removed.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  
  const supabase = getSupabase();
  const results = [];
  
  // Test if tables already exist
  for (const table of ['venue_game_alerts', 'venue_aliases', 'scraper_watchdog_state']) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
        results.push({ table, status: 'MISSING' });
      } else {
        results.push({ table, status: 'EXISTS' });
      }
    } catch (e) {
      results.push({ table, status: 'ERROR', error: e.message });
    }
  }
  
  return res.status(200).json({
    message: 'Table status check. Run SQL migration from Supabase dashboard to create missing tables.',
    tables: results,
    migration_file: 'supabase/migrations/20260329_scraper_intelligence_tables.sql',
  });
}
