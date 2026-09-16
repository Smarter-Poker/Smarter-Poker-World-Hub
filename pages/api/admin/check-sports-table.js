import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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
  try {
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      try {
          // Try to query the table
          const { data, error, count } = await getSupabase()
              .from('sports_clips')
              .select('*', { count: 'exact', head: true });

          if (error) {
              return res.status(200).json({
                  table_exists: false,
                  error: error.message,
                  code: error.code,
                  hint: error.hint,
                  action_required: 'Run migration in Supabase Dashboard SQL Editor',
                  migration_file: 'supabase/migrations/20260129_sports_clips_table.sql'
              });
          }

          return res.status(200).json({
              table_exists: true,
              row_count: count,
              status: count === 0 ? 'Table empty - run scraper' : 'Table has data',
              next_step: count === 0 ? 'POST /api/cron/scrape-sports-clips' : 'Ready to post'
          });

      } catch (error) {
          return res.status(500).json({
              error: error.message,
              stack: error.stack
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
