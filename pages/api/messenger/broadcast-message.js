import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';

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

          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
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
          const { data: conversations } = await getSupabase()
              .from('social_conversation_participants')
              .select('conversation_id')
              .eq('user_id', user.id);

          if (!conversations || conversations.length === 0) {
              return res.json({ success: true, sent: 0, message: 'No conversations to broadcast to' });
          }

          // Send to all conversations in parallel for speed
          const results = await Promise.allSettled(
              conversations.map(conv =>
                  getSupabase().rpc('fn_send_message', {
                      p_conversation_id: conv.conversation_id,
                      p_sender_id: user.id,
                      p_content: content,
                  })
              )
          );

          let sent = 0;
          const errors = [];
          results.forEach((result, i) => {
              if (result.status === 'fulfilled' && !result.value.error) {
                  sent++;
              } else {
                  const errMsg = result.status === 'rejected'
                      ? result.reason?.message
                      : result.value?.error?.message;
                  errors.push({ conv: conversations[i].conversation_id, error: errMsg });
              }
          });

          return res.json({ success: true, sent, total: conversations.length, errors: errors.length > 0 ? errors : undefined });
      } catch (e) {
          console.error('[BROADCAST] Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
