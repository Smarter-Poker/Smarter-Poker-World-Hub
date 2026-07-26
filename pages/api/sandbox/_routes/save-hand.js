/**
 * POST /api/sandbox/save-hand
 * W6-1: Persists a configured sandbox state into a custom user folder.
 * Table: sandbox_saved_hands (id, user_id, folder_name, tags, state_json)
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

const MAX_STATE_BYTES = 50_000;

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
      if (req.method !== 'POST' && req.method !== 'DELETE') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

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

          if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

          // ── DELETE: remove one saved hand owned by the caller ──
          // Scoped by user_id as well as id so a guessed id can never delete
          // another user's row (JWT-derived userId only — never req.query).
          if (req.method === 'DELETE') {
              const id = (req.body && req.body.id) || req.query?.id;
              if (!id) return res.status(400).json({ success: false, error: 'Hand id required' });

              const { error: delError } = await supabase
                  .from('sandbox_saved_hands')
                  .delete()
                  .eq('id', String(id))
                  .eq('user_id', userId);

              if (delError) {
                  // Table not provisioned yet — nothing to delete, so report
                  // success rather than surfacing a server error to the user.
                  if (delError.code === '42P01') {
                      console.warn('[save-hand] sandbox_saved_hands table missing — delete is a no-op');
                      return res.status(200).json({ success: true, deleted: 0 });
                  }
                  console.warn('[save-hand] Delete error:', delError.message);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }
              return res.status(200).json({ success: true, deleted: 1, id: String(id) });
          }

          const { folder_name, tags, state_json } = req.body || {};
          if (!folder_name || !state_json) {
              return res.status(400).json({ success: false, error: 'Folder name and state_json required' });
          }

          let stateSize = 0;
          try {
              stateSize = JSON.stringify(state_json).length;
          } catch (_e) {
              return res.status(400).json({ success: false, error: 'state_json must be serializable JSON' });
          }
          if (stateSize > MAX_STATE_BYTES) {
              return res.status(413).json({ success: false, error: 'Saved hand too large' });
          }

          const { data, error } = await supabase
              .from('sandbox_saved_hands')
              .insert({
                  user_id: userId,
                  folder_name: String(folder_name).trim().slice(0, 80),
                  tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).slice(0, 40)) : [],
                  state_json,
              })
              .select('*')
              .maybeSingle();

          if (error) {
              if (error.code === '42P01') {
                  console.warn('[save-hand] sandbox_saved_hands table missing — run migration to restore');
              }
              console.warn('[save-hand] Insert error:', error.message);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({ success: true, hand: data });
      } catch (err) {
          console.warn('[save-hand] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
