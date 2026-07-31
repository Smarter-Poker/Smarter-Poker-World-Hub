import { getServerUserWithFallback } from '../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';
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
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { content: rawContent, clubId } = req.body;

      if (!rawContent || !clubId) {
          return res.status(400).json({ success: false, error: 'Missing content or clubId' });
      }

      if (typeof rawContent !== 'string' || rawContent.length > 2000) {
          return res.status(413).json({ success: false, error: 'Payload too large or invalid' });
      }

      const content = `📢 ${sanitizeMessage(rawContent)}`;

      try {
          // Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          // Verify sender is club owner or admin
          const { data: membership } = await getSupabase()
              .from('club_members')
              .select('role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
              return res.status(403).json({ success: false, error: 'Only club owners/admins can broadcast' });
          }

          // Get all conversations the sender participates in for this club context
          // Cap at 200 to prevent Vercel timeout and Supabase connection pool exhaustion
          const { data: conversations } = await getSupabase()
              .from('social_conversation_participants')
              .select('conversation_id')
              .eq('user_id', user.id)
              .limit(200);

          if (!conversations || conversations.length === 0) {
              return res.json({ success: true, sent: 0, message: 'No conversations to broadcast to' });
          }

          // Send in batches of 20 to avoid overwhelming Supabase connection pool
          const BATCH_SIZE = 20;
          let sent = 0;
          const errors = [];

          for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
              const batch = conversations.slice(i, i + BATCH_SIZE);
              const results = await Promise.allSettled(
                  batch.map(conv =>
                      getSupabase().rpc('fn_send_message', {
                          p_conversation_id: conv.conversation_id,
                          p_sender_id: user.id,
                          p_content: content,
                      })
                  )
              );
              results.forEach((result, j) => {
                  if (result.status === 'fulfilled' && !result.value.error) {
                      sent++;
                  } else {
                      const errMsg = result.status === 'rejected'
                          ? result.reason?.message
                          : result.value?.error?.message;
                      errors.push({ conv: batch[j].conversation_id, error: errMsg });
                  }
              });
          }

          return res.json({ success: true, sent, total: conversations.length, errors: errors.length > 0 ? errors : undefined });
      } catch (e) {
          console.warn('[BROADCAST] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
