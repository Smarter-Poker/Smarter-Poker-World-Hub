import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeMessage } from '../../../src/utils/messageSanitizer';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { notifyNewMessage } from '../../../src/lib/notify';

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

          // ── Club identity: verify it, never take the client's word ──
          // media_metadata was only checked for "plain object under 8 KB". The
          // inbox renderer (get-conversations.js) reads is_club_identity /
          // club_name / club_avatar straight out of the OTHER party's message
          // and uses them to replace the displayed name and avatar of the
          // sender. So a stock account could send
          //   { is_club_identity: true, club_name: 'Shark Club',
          //     club_avatar: '<the real club avatar>' }
          // and the recipient's inbox would render that thread as the club.
          // Full impersonation of any club page, from any account.
          //
          // Fix: the claim is checked here and the displayed fields are
          // rewritten from the database, so the client can only ever say WHICH
          // page it is acting as -- never what that page is called or looks
          // like. Failing the check strips the claim rather than rejecting the
          // message, so a stale client degrades to a normal personal message
          // instead of losing the user's text.
          if (safeMetadata && safeMetadata.is_club_identity) {
              const claimedPageId =
                  typeof safeMetadata.club_id === 'string' &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeMetadata.club_id)
                      ? safeMetadata.club_id
                      : null;

              let verifiedPage = null;
              if (claimedPageId) {
                  const { data: page } = await getSupabase()
                      .from('social_pages')
                      .select('id, name, avatar_url, owner_id, linked_entity_id, linked_entity_type')
                      .eq('id', claimedPageId)
                      .maybeSingle();

                  if (page) {
                      if (page.owner_id === userId) {
                          verifiedPage = page;
                      } else if (page.linked_entity_type === 'club' && page.linked_entity_id) {
                          // Club staff may speak as the club. Ordinary members
                          // may not -- a 578-member club where anyone can post
                          // as the club is not an identity, it is a megaphone.
                          const { data: membership } = await getSupabase()
                              .from('club_members')
                              .select('role')
                              .eq('club_id', page.linked_entity_id)
                              .eq('user_id', userId)
                              .maybeSingle();
                          if (membership && ['owner', 'admin'].includes(membership.role)) {
                              verifiedPage = page;
                          }
                      }
                  }
              }

              if (verifiedPage) {
                  safeMetadata = {
                      ...safeMetadata,
                      is_club_identity: true,
                      club_id: verifiedPage.id,
                      club_name: verifiedPage.name,
                      club_avatar: verifiedPage.avatar_url,
                  };
              } else {
                  const stripped = { ...safeMetadata };
                  delete stripped.is_club_identity;
                  delete stripped.club_id;
                  delete stripped.club_name;
                  delete stripped.club_avatar;
                  safeMetadata = stripped;
                  console.warn(
                      '[send-message] rejected unverified club identity claim from user',
                      userId,
                      'for page',
                      claimedPageId || '(malformed)'
                  );
              }
          }

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

          // Blocking, enforced on the server. messenger_blocked was read and
          // written only by the client (useMessengerService), and no route in
          // pages/api/messenger/ ever consulted it -- so a blocked user could
          // POST here directly and the message was inserted and delivered.
          // Checked both directions: blocking is mutual in effect.
          let otherIds = [];
          try {
              const { data: others } = await getSupabase()
                  .from('social_conversation_participants')
                  .select('user_id')
                  .eq('conversation_id', conversationId)
                  .neq('user_id', userId);
              otherIds = (others || []).map((o) => o.user_id).filter(Boolean);
              if (otherIds.length > 0) {
                  const { data: blocks } = await getSupabase()
                      .from('messenger_blocked')
                      .select('blocker_id, blocked_id')
                      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
                  const blocked = (blocks || []).some(
                      (b) =>
                          (b.blocker_id === userId && otherIds.includes(b.blocked_id)) ||
                          (b.blocked_id === userId && otherIds.includes(b.blocker_id))
                  );
                  if (blocked) {
                      return res.status(403).json({ success: false, error: 'Cannot send to this conversation' });
                  }
              }
          } catch (blockErr) {
              // Fail open on a lookup failure -- silently dropping everyone's
              // messages because one query hiccuped is the worse outcome.
              console.warn('[send-message] block check failed:', blockErr?.message || blockErr);
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

          // ── Notify the recipients ────────────────────────────────────────
          // Until now a direct message produced NOTHING: no bell entry, no
          // push. Delivery relied entirely on Supabase Realtime, so a message
          // only landed if the recipient already had the app open. Someone
          // messaging you was silent on a locked phone.
          //
          // Routed through notify() rather than a bare insert so it delivers
          // INLINE (a message that arrives up to 5 minutes late via the outbox
          // cron is useless) while still passing the full preference gate --
          // mute_all, push_enabled, per-type prefs, the legacy messenger_alerts
          // column, quiet hours and the daily cap.
          //
          // Never awaited into the response path: the message is already
          // committed and the sender must not wait on fan-out. Failures are
          // swallowed by notify() itself, which never throws.
          try {
              if (otherIds.length > 0) {
                  const { data: senderProfile } = await getSupabase()
                      .from('profiles')
                      .select('username, full_name')
                      .eq('id', userId)
                      .maybeSingle();
                  const senderName =
                      senderProfile?.username || senderProfile?.full_name || 'Someone';

                  // Never put message media or metadata in a lock-screen preview.
                  const preview =
                      messageType && messageType !== 'text'
                          ? `Sent ${messageType === 'image' ? 'a photo' : 'an attachment'}`
                          : String(content || '').slice(0, 140);

                  await Promise.all(
                      otherIds.map((recipientId) =>
                          notifyNewMessage(getSupabase(), recipientId, senderName, preview, conversationId)
                      )
                  );
              }
          } catch (notifyErr) {
              // A notification problem must never fail a message that was sent.
              console.warn('[send-message] notify failed:', notifyErr?.message || notifyErr);
          }

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
