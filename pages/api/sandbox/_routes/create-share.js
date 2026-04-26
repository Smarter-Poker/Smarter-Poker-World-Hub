/**
 * POST /api/sandbox/create-share
 * W6-2: Generates a short-link record for a sandbox state.
 * Table: sandbox_shared_scenarios (id, creator_id, state_json)
 */
import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../../src/lib/sentryWrap';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          let supabase;
          try {
              supabase = getSupabase();
          } catch (err) {
              console.warn('[create-share] Intialization error:', err);
              return res.status(500).json({ success: false, error: 'Database initialization failed' });
          }

          // Optional auth
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await getSupabase().auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          const { state_json } = req.body;
          if (!state_json || typeof state_json !== 'object') {
              return res.status(400).json({ success: false, error: 'Valid state_json object required' });
          }

          const shortId = generateShortId();

          const { data, error } = await supabase
              .from('sandbox_shared_scenarios')
              .insert({
                  id: shortId,
                  creator_id: userId,
                  state_json
              })
              .select('id')
              .maybeSingle();

          if (error) {
              // Table should always exist — if 42P01, log warning and return error
              if (error.code === '42P01') {
                  console.warn('[create-share] sandbox_shared_scenarios table missing — run migration to restore');
              }
              throw error;
          }

          return res.status(200).json({ success: true, shareId: data.id });
      } catch (err) {
          console.warn('[create-share] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal Server Error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
