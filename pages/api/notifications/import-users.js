/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — IMPORT USERS FROM SUPABASE
   POST /api/notifications/import-users
   
   Imports existing users from Supabase profiles to OneSignal as external users
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // SECURITY: a missing ONESIGNAL_REST_API_KEY is a server misconfiguration,
      // not a grant. This previously FAILED OPEN: with the key unset,
      // `undefined?.slice(0, 20)` is undefined and the template collapsed to the
      // literal string "Bearer undefined", so any caller sending
      // `Authorization: Bearer undefined` authenticated successfully.
      if (!ONESIGNAL_REST_API_KEY) {
          console.warn('[import-users] ONESIGNAL_REST_API_KEY is not configured — rejecting request');
          return res.status(500).json({ success: false, error: 'Server misconfigured' });
      }

      // Simple auth check - require a secret header for admin endpoints
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${ONESIGNAL_REST_API_KEY.slice(0, 20)}`) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
          return res.status(500).json({ success: false, error: 'OneSignal not configured' });
      }

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Supabase not configured' });
      }

      try {
          // Create Supabase admin client
          let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

          // Fetch all users from profiles
          const { data: users, error: fetchError } = await getSupabase()
              .from('profiles')
              .select('id, username, email, player_number, skill_tier, state, created_at')
              .order('player_number', { ascending: true })
                  .limit(100);

          if (fetchError) {
              throw new Error(`Failed to fetch users: ${fetchError.message}`);
          }


          // Import users to OneSignal in batches
          const batchSize = 100;
          const imported = [];
          const errors = [];

          for (let i = 0; i < users.length; i += batchSize) {
              const batch = users.slice(i, i + batchSize);

              for (const user of batch) {
                  try {
                      // Create/update user in OneSignal
                      const response = await fetch(`https://onesignal.com/api/v1/players`, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
                          },
                          body: JSON.stringify({
                              app_id: ONESIGNAL_APP_ID,
                              device_type: 5, // Web push
                              external_user_id: user.id,
                              tags: {
                                  username: user.username || '',
                                  email: user.email || '',
                                  player_number: user.player_number?.toString() || '',
                                  skill_tier: user.skill_tier || 'Newcomer',
                                  state: user.state || '',
                                  registered: 'true',
                              },
                          }),
                      });

                      if (!response.ok) throw new Error(`Request failed (${response.status})`);
                      const result = await response.json();

                      if (response.ok) {
                          imported.push({
                              userId: user.id,
                              username: user.username,
                              oneSignalId: result.id,
                          });
                      } else {
                          errors.push({
                              userId: user.id,
                              username: user.username,
                              error: result.errors?.[0] || 'Unknown error',
                          });
                      }
                  } catch (err) {
                      errors.push({
                          userId: user.id,
                          username: user.username,
                          error: err.message,
                      });
                  }
              }

              // Small delay between batches to avoid rate limiting
              if (i + batchSize < users.length) {
                  await new Promise(resolve => setTimeout(resolve, 100));
              }
          }


          return res.status(200).json({
              success: true,
              totalUsers: users.length,
              imported: imported.length,
              errors: errors.length,
              errorDetails: errors.slice(0, 10), // Only return first 10 errors
          });

      } catch (error) {
          console.warn('Import users error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
