/**
 * 📬 MARK CONVERSATION AS READ API - Service Role
 * Bypasses RLS to ensure last_read_at is properly updated
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Use service role to bypass RLS
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

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, NOT body
      const { conversationId } = req.body;

      if (!conversationId) {
          return res.status(400).json({ success: false, error: 'conversationId required' });
      }


      try {
          // Update last_read_at to now
          const { data, error } = await getSupabase()
              .from('social_conversation_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .select()
              .maybeSingle();

          if (error) {
              console.error('[MARK-READ] Update error:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          if (!data) {
              console.warn('[MARK-READ] No participant found to mark as read');
              return res.status(404).json({ success: false, error: 'Participant not found' });
          }

          return res.json({ success: true, data });

      } catch (error) {
          console.error('[MARK-READ] Error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
