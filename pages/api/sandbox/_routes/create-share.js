/**
 * POST /api/sandbox/create-share
 * W6-2: Generates a short-link record for a sandbox state.
 * Table: sandbox_shared_scenarios (id, creator_id, state_json)
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Shared scenarios are rendered verbatim on /sandbox/[id] — keep the payload
// small enough that an unauthenticated caller cannot use it as free storage.
const MAX_STATE_BYTES = 50_000;

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          let supabase;
          try {
              supabase = getSupabase();
          } catch (err) {
              console.warn('[create-share] Initialization error:', err);
              return res.status(500).json({ success: false, error: 'Database initialization failed' });
          }

          // Optional auth — reuse the single client instance for the lookup.
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          const { state_json } = req.body || {};
          if (!state_json || typeof state_json !== 'object' || Array.isArray(state_json)) {
              return res.status(400).json({ success: false, error: 'Valid state_json object required' });
          }

          let stateSize = 0;
          try {
              stateSize = JSON.stringify(state_json).length;
          } catch (_e) {
              return res.status(400).json({ success: false, error: 'state_json must be serializable JSON' });
          }
          if (stateSize > MAX_STATE_BYTES) {
              return res.status(413).json({ success: false, error: 'Scenario too large' });
          }

          // A 6-char id collides eventually — retry rather than 500.
          let data = null;
          let lastError = null;
          for (let attempt = 0; attempt < 3; attempt++) {
              const shortId = generateShortId();
              const result = await supabase
                  .from('sandbox_shared_scenarios')
                  .insert({
                      id: shortId,
                      creator_id: userId,
                      state_json,
                  })
                  .select('id')
                  .maybeSingle();

              if (!result.error) { data = result.data; lastError = null; break; }
              lastError = result.error;
              if (result.error.code !== '23505') break; // not a duplicate-key clash
          }

          if (lastError) {
              if (lastError.code === '42P01') {
                  console.warn('[create-share] sandbox_shared_scenarios table missing — run migration to restore');
              }
              console.warn('[create-share] Insert error:', lastError.message);
              return res.status(500).json({ success: false, error: 'Internal Server Error' });
          }

          return res.status(200).json({ success: true, shareId: data?.id });
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
