/**
 * 🔍 CHECK AUTH USER BY EMAIL
 * Find the actual Supabase auth UUID for <TEST_USER_EMAIL from .env.local>
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

      // 2026-09-04: read from the environment; this used to name Dan's
      // personal address. Without it there is nothing to look up.
      const email = process.env.TEST_USER_EMAIL;
      if (!email) {
          return res.status(500).json({ error: 'TEST_USER_EMAIL is not set - refusing to guess an account' });
      }

      try {
          // Query auth.users directly using RPC
          // The live signature is get_auth_users_by_email(p_email text). This
          // sent `email_pattern`, which PostgREST cannot resolve to any
          // overload - PGRST202 on every call since it was written. Fixed
          // 2026-09-08.
          const { data: authUsers, error: authError } = await getSupabase().rpc('get_auth_users_by_email', {
              p_email: email.toLowerCase()
          });

          // Also try listing from admin API
          let adminResult = null;
          try {
              // This may not work but let's try
              const { data } = await getSupabase().auth.admin.listUsers();
              adminResult = data?.users?.filter(u =>
                  u.email?.toLowerCase() === email.toLowerCase()
              );
          } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

          // Check what profiles exist
          const { data: profiles } = await getSupabase()
              .from('profiles')
              .select('id, username, email, diamonds')
              .or(`email.ilike.%bekavac%`);

          return res.status(200).json({
              searchEmail: email,
              authUsersRPC: authUsers,
              authUsersAdmin: adminResult,
              profiles,
              note: "If auth UUID doesn't match profile UUID, user can't get their data"
          });

      } catch (error) {
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
