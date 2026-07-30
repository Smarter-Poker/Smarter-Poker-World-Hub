import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // 1. Enforce Token-Bucket Rate Limiter (30 requests / minute)
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      const { conversationId, content: rawContent, message_type: rawMessageType, media_metadata: rawMetadata } = req.body;

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

      // Allowlist message_type to prevent injection of arbitrary types
      const ALLOWED_MESSAGE_TYPES = new Set(['text', 'shared_post', 'gif', 'image', 'system']);
      const messageType = ALLOWED_MESSAGE_TYPES.has(rawMessageType) ? rawMessageType : 'text';

      // Validate metadata: must be a plain object, cap serialized size at 8KB
      let safeMetadata = {};
      if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
          const metaStr = JSON.stringify(rawMetadata);
          if (metaStr.length <= 8192) {
              safeMetadata = rawMetadata;
          } else {
              console.warn('[send-message] media_metadata too large, truncating to empty');
          }
      }

      // 3. XSS Neutralization
      const content = sanitizeMessage(rawContent);

      try {
          // 4. Auth Verification
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
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
              p_message_type: messageType,
              p_metadata: safeMetadata,
          });

          if (error) throw error;

          // fn_send_message returns jsonb { success, message_id, conversation_id }
          // Extract the UUID string — returning the raw object broke client deduplication
          const rpcResult = msgId;
          const realMsgId = rpcResult?.message_id || (typeof rpcResult === 'string' ? rpcResult : null);

          if (!rpcResult?.success && !realMsgId) throw new Error('RPC returned failure');

          return res.json({ success: true, msgId: realMsgId, content: content });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Send Message Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
