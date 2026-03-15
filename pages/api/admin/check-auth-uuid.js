/**
 * 🔍 CHECK AUTH USER BY EMAIL
 * Find the actual Supabase auth UUID for Daniel@bekavactrading.com
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

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

      const email = 'Daniel@bekavactrading.com';

      try {
          // Query auth.users directly using RPC
          const { data: authUsers, error: authError } = await getSupabase().rpc('get_auth_users_by_email', {
              email_pattern: email.toLowerCase()
          });

          // Also try listing from admin API
          let adminResult = null;
          try {
              // This may not work but let's try
              const { data } = await getSupabase().auth.admin.listUsers();
              adminResult = data?.users?.filter(u =>
                  u.email?.toLowerCase() === email.toLowerCase()
              );
          } catch (e) {
              // Admin API may not be available
          }

          // Check what profiles exist
          const { data: profiles } = await getSupabase()
              .from('profiles')
              .select('id, username, email, diamonds, xp_total')
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
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
