/* ═══════════════════════════════════════════════════════════════════════════
   API: React to Live Help Message
   Saves user reaction (helpful/unhelpful) to Jarvis message
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Unauthorized' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authError || !user) {
              return res.status(401).json({ success: false, error: 'Invalid token' });
          }

          const { messageId, reaction } = req.body;

          if (!messageId) {
              return res.status(400).json({ success: false, error: 'Missing messageId' });
          }

          // If reaction is null, delete the reaction
          if (reaction === null) {
              const { error: deleteError } = await getSupabase()
                  .from('live_help_reactions')
                  .delete()
                  .eq('message_id', messageId)
                  .eq('user_id', user.id);

              if (deleteError) {
                  console.warn('Failed to delete reaction:', deleteError);
                  return res.status(500).json({ success: false, error: 'Failed to delete reaction' });
              }

              return res.status(200).json({ success: true, reaction: null });
          }

          // Validate reaction value
          if (!['helpful', 'unhelpful'].includes(reaction)) {
              return res.status(400).json({ success: false, error: 'Invalid reaction value' });
          }

          // Upsert reaction (insert or update)
          const { data, error } = await getSupabase()
              .from('live_help_reactions')
              .upsert({
                  message_id: messageId,
                  user_id: user.id,
                  reaction
              }, {
                  onConflict: 'message_id,user_id'
              })
              .select()
              .maybeSingle();

          if (error) {
              console.warn('Failed to save reaction:', error);
              return res.status(500).json({ success: false, error: 'Failed to save reaction' });
          }

          return res.status(200).json({ success: true, reaction: data.reaction });

      } catch (error) {
          console.warn('React API error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
