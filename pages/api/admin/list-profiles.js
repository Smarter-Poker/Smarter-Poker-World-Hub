/**
 * 🔍 LIST ALL PROFILES
 * Debug endpoint to see all profiles in the database
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

export default async function handler(req, res) {
  try {
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

      try {
          // Get all profiles
          const { data: profiles, error } = await getSupabase()
              .from('profiles')
              .select('id, username, full_name, email, role, created_at')
              .order('created_at', { ascending: false })
              .limit(50);

          if (error) {
              return res.status(500).json({ error: error.message });
          }

          // Also check for the system account
          const { data: systemAccount } = await getSupabase()
              .from('profiles')
              .select('*')
              .eq('id', '00000000-0000-0000-0000-000000000001')
              .maybeSingle();

          return res.status(200).json({
              totalProfiles: profiles?.length || 0,
              profiles: profiles,
              systemAccount: systemAccount || 'NOT FOUND'
          });

      } catch (error) {
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
