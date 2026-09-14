import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { searchMessengerWorkspace } from '../../../src/lib/messengerWorkspace.mjs';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { query, clubId } = req.body;

      if (!query || typeof query !== 'string' || query.length < 2) {
          return res.status(400).json({ success: false, error: 'Query must be at least 2 characters' });
      }

      try {
          // Auth
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

           // The same server workspace authority controls inboxes and search.
           // Omitting a workspace means social messages, including legacy callers.
           const messages = await searchMessengerWorkspace(getSupabase(), user.id, {
               query, clubId, workspace: req.body.workspace, folder: req.body.folder,
           }, 30);

          // Get unique sender IDs to fetch profiles
          const senderIds = [...new Set((messages || []).map(m => m.sender_id))];
          let profiles = {};
          if (senderIds.length > 0) {
              const { data: profs } = await getSupabase()
                  .from('profiles')
                  .select('id, username, display_name, avatar_url')
                  .in('id', senderIds);
              (profs || []).forEach(p => { profiles[p.id] = p; });
          }

          const results = (messages || []).map(m => ({
              id: m.id,
              message_type: m.message_type,
              media_metadata: m.media_metadata,
              content: m.content,
              created_at: m.created_at,
              conversation_id: m.conversation_id,
              sender: profiles[m.sender_id] || { id: m.sender_id, username: 'Unknown' },
              isOwn: m.sender_id === user.id,
          }));

          return res.json({ success: true, results });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Global Search Exception:', e);
          return res.status([400, 403, 404, 503].includes(e.status) ? e.status : 500).json({ success: false, error: 'Message Search Unavailable' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
