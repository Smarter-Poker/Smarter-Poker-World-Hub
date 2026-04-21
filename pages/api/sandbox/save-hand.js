/**
 * POST /api/sandbox/save-hand
 * W6-1: Persists a configured sandbox state into a custom user folder.
 * Table: sandbox_saved_hands (id, user_id, folder_name, tags, state_json)
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          const supabase = getSupabase();

          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: { user } } = await supabase.auth.getUser(token);
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

          const { folder_name, tags, state_json } = req.body;
          if (!folder_name || !state_json) {
              return res.status(400).json({ success: false, error: 'Folder name and state_json required' });
          }

          const { data, error } = await supabase
              .from('sandbox_saved_hands')
              .insert({
                  user_id: userId,
                  folder_name: folder_name.trim(),
                  tags: Array.isArray(tags) ? tags : [],
                  state_json
              })
              .select('*')
              .maybeSingle();

          if (error) {
              if (error.code === '42P01') {
                  console.error('[save-hand] sandbox_saved_hands table missing — run migration to restore');
              }
              throw error;
          }

          return res.status(200).json({ success: true, hand: data });
      } catch (err) {
          console.error('[save-hand] Error:', err);
          return res.status(500).json({ success: false, error: err.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
