import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';
import { reportApiError } from '../../../src/lib/sentryWrap';

const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { messageId, content: rawContent } = req.body;

      if (!messageId || !rawContent) {
          return res.status(400).json({ success: false, error: 'Missing messageId or content' });
      }

      if (typeof rawContent !== 'string' || rawContent.length > 2000) {
          return res.status(413).json({ success: false, error: 'Payload too large', message: 'Messages cannot exceed 2,000 characters.' });
      }

      const content = sanitizeMessage(rawContent);

      try {
          // Auth
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // Fetch the message
          const { data: msg, error: msgErr } = await getSupabase()
              .from('social_messages')
              .select('id, sender_id, created_at, is_deleted')
              .eq('id', messageId)
              .maybeSingle();

          if (msgErr || !msg) {
              return res.status(404).json({ success: false, error: 'Message not found' });
          }

          // Ownership check
          if (msg.sender_id !== user.id) {
              return res.status(403).json({ success: false, error: 'You can only edit your own messages' });
          }

          // Deleted check
          if (msg.is_deleted) {
              return res.status(400).json({ success: false, error: 'Cannot edit a deleted message' });
          }

          // 5-minute window check
          const createdAt = new Date(msg.created_at).getTime();
          const now = Date.now();
          if (now - createdAt > EDIT_WINDOW_MS) {
              return res.status(400).json({ success: false, error: 'Edit window expired', message: 'Messages can only be edited within 5 minutes of sending.' });
          }

          // Update the message — filter by both id AND sender_id (atomic ownership enforcement)
          const { error: updateErr, count } = await getSupabase()
              .from('social_messages')
              .update({ content, is_edited: true, updated_at: new Date().toISOString() })
              .eq('id', messageId)
              .eq('sender_id', user.id);

          if (updateErr) throw updateErr;
          // count null means PostgREST didn't return it — treat any error as failure
          // (we already verified ownership above, so this is belt-and-suspenders)

          return res.json({ success: true, content });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Edit Message Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
