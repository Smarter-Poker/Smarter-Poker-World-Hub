import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';
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
      // 1. Enforce Token-Bucket Rate Limiter (30 requests / minute)
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { conversationId, content: rawContent } = req.body;

      if (!conversationId || !rawContent) {
          return res.status(400).json({ success: false, error: 'Missing conversationId or content' });
      }

      // 2. Payload Size Enforcement (Stop 10MB Base64 attacks)
      if (typeof rawContent !== 'string') {
          return res.status(400).json({ success: false, error: 'Invalid content type' });
      }

      if (rawContent.length > 2000) {
          return res.status(413).json({
              success: false,
              error: 'Payload too large',
              message: 'Messages cannot exceed 2,000 characters.'
          });
      }

      // 3. XSS Neutralization
      const content = sanitizeMessage(rawContent);

      try {
          // 4. Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

          const userId = user.id;

          // Verify participant access
          const { data: participant, error: partError } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partError || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // 5. Secure RPC execution using Service Role
          const { data: msgId, error } = await getSupabase().rpc('fn_send_message', {
              p_conversation_id: conversationId,
              p_sender_id: userId,
              p_content: content,
          });

          if (error) throw error;

          return res.json({ success: true, msgId, content: content });
      } catch (e) {
          console.error('[ANTIGRAVITY] Send Message Exception:', e);
          return res.status(500).json({ success: false, error: e.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
