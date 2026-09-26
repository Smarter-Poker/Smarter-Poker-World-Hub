import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * 📬 MARK CONVERSATION AS READ API - Service Role
 * Bypasses RLS to ensure last_read_at is properly updated
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getMessengerWorkspace } from '../../../src/lib/messengerWorkspace.mjs';

// Use service role to bypass RLS
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
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.write)) return;

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, NOT body
      const { conversationId } = req.body || {};

      if (!conversationId) {
          return res.status(400).json({ success: false, error: 'conversationId required' });
      }


      try {
          // Verify the user is a participant before marking read — defense-in-depth guard
          // (fn_mark_messages_read may not enforce membership internally)
          const { data: participant, error: partErr } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partErr || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // Apply the same private invoice and club membership boundary as reading.
          await getMessengerWorkspace(getSupabase(), userId, { workspace: 'resolve', conversationId });
          const { data: receipt, error: rpcErr } = await getSupabase().rpc('fn_mark_messages_read', {
              p_conversation_id: conversationId,
              p_user_id: userId,
          });
          if (rpcErr || receipt?.success !== true) {
              console.warn('[MARK-READ] Read persistence failed:', rpcErr?.code || receipt?.error);
              return res.status(503).json({ success: false, error: 'Read Status Could Not Be Saved' });
          }

          return res.json({ success: true });

      } catch (error) {
          console.warn('[MARK-READ] Error:', error);
          return res.status(error.status || 500).json({ success: false, error: 'Read Status Could Not Be Saved' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
